const DAY_MS = 86_400_000;
const DEFAULT_DAYS = 365;
const MAX_DAYS = 366;

function dateTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && dateKey(timestamp) === value ? timestamp : null;
}

function dateKey(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function tokenCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(number))) : 0;
}

function addTokens(left, right) {
  return Math.min(Number.MAX_SAFE_INTEGER, left + right);
}

function intensity(tokens, maximum) {
  return tokens > 0 && maximum > 0 ? Math.min(4, Math.max(1, Math.ceil(Math.sqrt(tokens / maximum) * 4))) : 0;
}

/**
 * Build a date-only calendar without reinterpreting the API's timezone buckets.
 * Week ranges exclude padding, and week tokens always sum the actual daily usage.
 * Cumulative cell values start at the displayed window's first date.
 */
export function buildUsageHeatmap(daily, { endDate, days = DEFAULT_DAYS, mode = 'daily' } = {}) {
  const buckets = new Map();
  for (const item of Array.isArray(daily) ? daily : []) {
    const timestamp = dateTimestamp(item?.date);
    if (timestamp === null) continue;
    buckets.set(timestamp, addTokens(buckets.get(timestamp) || 0, tokenCount(item.tokens)));
  }

  const requestedDays = Number(days);
  const dayCount = Number.isFinite(requestedDays) && requestedDays > 0
    ? Math.min(MAX_DAYS, Math.max(1, Math.trunc(requestedDays)))
    : DEFAULT_DAYS;
  const lastDay = dateTimestamp(endDate)
    ?? (buckets.size ? Math.max(...buckets.keys()) : dateTimestamp(localToday()));
  const firstDay = lastDay - (dayCount - 1) * DAY_MS;
  const mondayOffset = (new Date(firstDay).getUTCDay() + 6) % 7;
  const firstMonday = firstDay - mondayOffset * DAY_MS;
  const weekCount = Math.ceil((mondayOffset + dayCount) / 7);
  const weeks = [];
  const months = [];
  let runningTokens = 0;
  let maxCellTokens = 0;
  let maxWeekTokens = 0;
  let previousMonth = '';

  for (let column = 0; column < weekCount; column += 1) {
    const monday = firstMonday + column * 7 * DAY_MS;
    const week = {
      key: dateKey(monday),
      startDate: dateKey(Math.max(firstDay, monday)),
      endDate: dateKey(Math.min(lastDay, monday + 6 * DAY_MS)),
      tokens: 0,
      level: 0,
      cells: [],
    };
    for (let row = 0; row < 7; row += 1) {
      const timestamp = monday + row * DAY_MS;
      if (timestamp < firstDay || timestamp > lastDay) {
        week.cells.push(null);
        continue;
      }
      const date = dateKey(timestamp);
      const dailyTokens = buckets.get(timestamp) || 0;
      runningTokens = addTokens(runningTokens, dailyTokens);
      week.tokens = addTokens(week.tokens, dailyTokens);
      const tokens = mode === 'cumulative' ? runningTokens : dailyTokens;
      maxCellTokens = Math.max(maxCellTokens, tokens);
      week.cells.push({ date, tokens, level: 0 });
      const month = date.slice(0, 7);
      if (month !== previousMonth) {
        months.push({ date, column });
        previousMonth = month;
      }
    }
    maxWeekTokens = Math.max(maxWeekTokens, week.tokens);
    weeks.push(week);
  }

  for (const week of weeks) {
    week.level = intensity(week.tokens, maxWeekTokens);
    for (const cell of week.cells) {
      if (cell) cell.level = intensity(cell.tokens, maxCellTokens);
    }
  }

  return {
    startDate: dateKey(firstDay),
    endDate: dateKey(lastDay),
    weeks,
    months,
    maxTokens: mode === 'weekly' ? maxWeekTokens : maxCellTokens,
  };
}
