import assert from 'node:assert/strict';
import { buildUsageHeatmap } from './usageHeatmap.js';

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

function cells(calendar) {
  return calendar.weeks.flatMap((week) => week.cells).filter(Boolean);
}

run('usage heatmap crosses years with Monday columns and blank outside padding', () => {
  const calendar = buildUsageHeatmap([], { endDate: '2026-01-03', days: 7 });
  assert.equal(calendar.startDate, '2025-12-28');
  assert.equal(calendar.endDate, '2026-01-03');
  assert.deepEqual(calendar.weeks.map((week) => week.key), ['2025-12-22', '2025-12-29']);
  assert.deepEqual(calendar.weeks[0].cells.slice(0, 6), Array(6).fill(null));
  assert.equal(calendar.weeks[0].cells[6].date, '2025-12-28');
  assert.equal(calendar.weeks[1].cells[6], null);
  assert.deepEqual(cells(calendar).map((cell) => cell.date), [
    '2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03',
  ]);
  assert.deepEqual(calendar.months, [
    { date: '2025-12-28', column: 0 },
    { date: '2026-01-01', column: 1 },
  ]);
});

run('usage heatmap includes leap day once and keeps date-only weekday alignment', () => {
  const calendar = buildUsageHeatmap([{ date: '2024-02-29', tokens: 29 }], { endDate: '2024-03-02', days: 4 });
  assert.deepEqual(cells(calendar).map(({ date, tokens }) => ({ date, tokens })), [
    { date: '2024-02-28', tokens: 0 },
    { date: '2024-02-29', tokens: 29 },
    { date: '2024-03-01', tokens: 0 },
    { date: '2024-03-02', tokens: 0 },
  ]);
  assert.equal(calendar.weeks[0].cells[3].date, '2024-02-29');
  const ordinaryYear = buildUsageHeatmap([], { endDate: '2025-03-01', days: 2 });
  assert.deepEqual(cells(ordinaryYear).map((cell) => cell.date), ['2025-02-28', '2025-03-01']);
});

run('usage heatmap partial weeks exclude data outside the displayed window', () => {
  const daily = [
    { date: '2026-01-01', tokens: 1_000 },
    { date: '2026-01-02', tokens: 10 },
    { date: '2026-01-04', tokens: 20 },
    { date: '2026-01-05', tokens: 3 },
    { date: '2026-01-06', tokens: 5 },
    { date: '2026-01-07', tokens: 2_000 },
  ];
  const calendar = buildUsageHeatmap(daily, { endDate: '2026-01-06', days: 5, mode: 'weekly' });
  assert.deepEqual(calendar.weeks.map(({ startDate, endDate, tokens }) => ({ startDate, endDate, tokens })), [
    { startDate: '2026-01-02', endDate: '2026-01-04', tokens: 30 },
    { startDate: '2026-01-05', endDate: '2026-01-06', tokens: 8 },
  ]);
  assert.equal(calendar.maxTokens, 30);
  assert.equal(calendar.weeks[0].level, 4);
  assert.ok(calendar.weeks[1].level > 0 && calendar.weeks[1].level < 4);
});

run('usage heatmap cumulative values use only the displayed window and retain zero-use dates', () => {
  const daily = [
    { date: '2026-01-01', tokens: 9_999 },
    { date: '2026-01-03', tokens: 2 },
    { date: '2026-01-04', tokens: 5 },
    { date: '2026-01-06', tokens: 7 },
  ];
  const options = { endDate: '2026-01-06', days: 5 };
  const calendar = buildUsageHeatmap(daily, { ...options, mode: 'cumulative' });
  assert.deepEqual(cells(calendar).map((cell) => cell.tokens), [0, 2, 7, 7, 14]);
  assert.equal(calendar.maxTokens, 14);
  assert.equal(cells(calendar)[0].level, 0);
  assert.equal(cells(calendar).at(-1).level, 4);
  const dailyCalendar = buildUsageHeatmap(daily, options);
  assert.equal(cells(calendar).at(-1).tokens, cells(dailyCalendar).reduce((sum, cell) => sum + cell.tokens, 0));
  assert.deepEqual(calendar.weeks.map((week) => week.tokens), dailyCalendar.weeks.map((week) => week.tokens));
});

run('usage heatmap normalizes unsorted duplicates and ignores malformed dates and token values', () => {
  const daily = [
    { date: '2026-06-03', tokens: Number.POSITIVE_INFINITY },
    { date: '2026-06-01', tokens: 4.8 },
    { date: '2026-06-02', tokens: -7 },
    { date: '2026-06-01', tokens: '6' },
    { date: '2026-06-03', tokens: 'invalid' },
    { date: '2026-02-29', tokens: 100 },
    { date: '2026-06-04T00:00:00Z', tokens: 100 },
    { date: '2026-13-01', tokens: 100 },
    { date: '2026-6-4', tokens: 100 },
    null,
  ];
  const calendar = buildUsageHeatmap(daily, { days: 3 });
  assert.equal(calendar.endDate, '2026-06-03');
  assert.deepEqual(cells(calendar).map((cell) => cell.tokens), [10, 0, 0]);
  assert.equal(calendar.maxTokens, 10);
  assert.deepEqual(cells(calendar).map((cell) => cell.level), [4, 0, 0]);
  assert.equal(daily[1].tokens, 4.8);
});

run('usage heatmap handles default annual and empty windows without inventing activity', () => {
  const calendar = buildUsageHeatmap(undefined, { endDate: '2026-09-15' });
  assert.equal(calendar.startDate, '2025-09-16');
  assert.equal(cells(calendar).length, 365);
  assert.equal(new Set(cells(calendar).map((cell) => cell.date)).size, 365);
  assert.equal(calendar.maxTokens, 0);
  assert.ok(cells(calendar).every((cell) => cell.tokens === 0 && cell.level === 0));
  assert.ok(calendar.weeks.every((week) => week.cells.length === 7 && week.level === 0));
  assert.equal(buildUsageHeatmap([{ date: '2026-01-01', tokens: 1 }], { endDate: 'invalid' }).endDate, '2026-01-01');
});

run('usage heatmap bounds invalid windows and maintains finite integer totals', () => {
  for (const days of [0, -5, NaN, Infinity, 'invalid']) {
    assert.equal(cells(buildUsageHeatmap([], { endDate: '2026-09-15', days })).length, 365);
  }
  assert.equal(cells(buildUsageHeatmap([], { endDate: '2026-09-15', days: 1.9 })).length, 1);
  assert.equal(cells(buildUsageHeatmap([], { endDate: '2026-09-15', days: 999_999 })).length, 366);
  const large = buildUsageHeatmap([
    { date: '2026-09-14', tokens: Number.MAX_VALUE },
    { date: '2026-09-15', tokens: Number.MAX_VALUE },
  ], { days: 2, mode: 'cumulative' });
  assert.equal(large.maxTokens, Number.MAX_SAFE_INTEGER);
  assert.ok(cells(large).every((cell) => Number.isSafeInteger(cell.tokens)));
  assert.ok(large.weeks.every((week) => Number.isSafeInteger(week.tokens)));
});

run('usage heatmap fallback follows the current local date when no date is available', () => {
  const before = new Date();
  const calendar = buildUsageHeatmap([], { days: 1 });
  const after = new Date();
  const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  assert.ok([localDate(before), localDate(after)].includes(calendar.endDate));
  assert.equal(calendar.startDate, calendar.endDate);
});
