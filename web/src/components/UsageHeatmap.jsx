import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { api } from '../lib/api.js';
import { normalizeUsageStats } from '../lib/usageStats.js';
import { buildUsageHeatmap } from '../lib/usageHeatmap.js';
import { anchoredMenuPosition } from '../lib/anchoredMenuPosition.js';
import './UsageHeatmap.css';

function UsageTooltip({ id, anchor, revision, children }) {
  const ref = useRef(null);
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    const rect = ref.current.getBoundingClientRect();
    setPosition(anchoredMenuPosition({
      anchorRect: anchor.getBoundingClientRect(),
      menuWidth: rect.width,
      menuHeight: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      gap: 8,
    }));
  }, [anchor, revision, children]);

  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      data-ace-native-overlay="overlap"
      className="ace-usage-tooltip"
      style={position ? { left: position.left, top: position.top } : { visibility: 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function UsageHeatmap({ reloadKey = 0 }) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || 'zh-CN';
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('daily');
  const [tip, setTip] = useState(null);
  const [focusedKey, setFocusedKey] = useState(null);
  const scrollRef = useRef(null);
  const cellsRef = useRef(new Map());
  const titleId = useId();
  const tooltipId = useId();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setTip(null);
    api.getUsageStats({ days: 365, timezoneOffsetMinutes: new Date().getTimezoneOffset() })
      .then((data) => { if (!cancelled) setRaw(data || {}); })
      .catch((e) => { if (!cancelled) setError(e.message || String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const stats = useMemo(() => normalizeUsageStats(raw || {}), [raw]);
  const calendar = useMemo(() => buildUsageHeatmap(stats.daily, { mode }), [stats.daily, mode]);
  const cells = useMemo(() => mode === 'weekly'
    ? calendar.weeks.map((week) => ({ ...week, date: week.key }))
    : calendar.weeks.flatMap((week) => week.cells.filter(Boolean)), [calendar, mode]);
  const activeKey = cells.some((cell) => cell.date === focusedKey) ? focusedKey : cells.at(-1)?.date;
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale, {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  }), [locale]);
  const monthFormat = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }), [locale]);
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const formatDate = (date) => dateFormat.format(new Date(`${date}T00:00:00Z`));
  const cellLabel = (cell) => {
    const count = numberFormat.format(cell.tokens);
    if (mode === 'weekly') return `${formatDate(cell.startDate)} – ${formatDate(cell.endDate)} 使用了 ${count} 个 Token`;
    if (mode === 'cumulative') return `${formatDate(calendar.startDate)} – ${formatDate(cell.date)} 累计使用了 ${count} 个 Token`;
    return `${formatDate(cell.date)} 使用了 ${count} 个 Token`;
  };

  useLayoutEffect(() => {
    if (raw && !error && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [raw, error]);

  useEffect(() => {
    if (!tip) return undefined;
    const close = () => setTip(null);
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    const onPointerDown = (event) => { if (!scrollRef.current?.contains(event.target)) close(); };
    const onScroll = () => {
      if (tip.input === 'focus' && document.activeElement === tip.anchor) {
        setTip((current) => current ? { ...current, revision: (current.revision || 0) + 1 } : null);
      } else close();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [tip]);

  function showCell(cell, anchor, input = 'pointer') {
    setTip({ cell, anchor, input });
  }

  function navigateCell(event, cell) {
    const index = cells.findIndex((item) => item.date === cell.date);
    const horizontalStep = mode === 'weekly' ? 1 : 7;
    const offsets = { ArrowLeft: -horizontalStep, ArrowRight: horizontalStep, ArrowUp: -1, ArrowDown: 1 };
    let nextIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = cells.length - 1;
    else if (event.key in offsets) nextIndex = Math.max(0, Math.min(cells.length - 1, index + offsets[event.key]));
    else return;
    event.preventDefault();
    const next = cells[nextIndex];
    const anchor = cellsRef.current.get(next.date);
    anchor?.focus();
  }

  function renderCell(cell, weekly = false) {
    return (
      <button
        key={cell.date}
        ref={(node) => {
          if (node) cellsRef.current.set(cell.date, node);
          else cellsRef.current.delete(cell.date);
        }}
        type="button"
        className={`ace-usage-cell${weekly ? ' ace-usage-week-cell' : ''}`}
        data-level={cell.level}
        data-date={cell.date}
        data-active={tip?.cell.date === cell.date || undefined}
        tabIndex={cell.date === activeKey ? 0 : -1}
        aria-label={cellLabel(cell)}
        aria-describedby={tip?.cell.date === cell.date ? tooltipId : undefined}
        // Scrolling beneath a stationary mouse also fires enter/leave. Only
        // actual pointer movement should replace keyboard-focused details.
        onMouseMove={(event) => {
          if (tip?.cell.date !== cell.date || tip.input !== 'pointer') showCell(cell, event.currentTarget);
        }}
        onMouseLeave={() => setTip((current) => current?.input === 'pointer' && current.cell.date === cell.date ? null : current)}
        onFocus={(event) => { setFocusedKey(cell.date); showCell(cell, event.currentTarget, 'focus'); }}
        onBlur={() => setTip((current) => current?.cell.date === cell.date ? null : current)}
        onClick={(event) => { setFocusedKey(cell.date); showCell(cell, event.currentTarget); }}
        onKeyDown={(event) => navigateCell(event, cell)}
      />
    );
  }

  // Avoid colliding month labels at a short first or final month.
  const months = calendar.months.filter((month, index, all) => index === all.length - 1
    || all[index + 1].column - month.column >= 3);

  return (
    <section className="ace-usage-activity mb-6" aria-labelledby={titleId} aria-busy={loading}>
      <div className="ace-usage-heading">
        <h3 id={titleId} className="text-[14px] font-semibold flex items-center gap-2">
          Token 活动
          {loading && <span className="ace-spinner" role="status" aria-label="加载中" />}
        </h3>
        <div className="ace-usage-modes" role="group" aria-label="Token 活动视图">
          {[['daily', '每日'], ['weekly', '每周'], ['cumulative', '累计']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => { setMode(key); setTip(null); setFocusedKey(null); }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <div className="ace-usage-status" role="status">活动加载失败：{error}</div>
      ) : loading && !raw ? (
        <div className="ace-usage-status" role="status">加载中</div>
      ) : (
        <>
          <div ref={scrollRef} className="ace-usage-scroll">
            <div className="ace-usage-calendar" style={{ '--usage-weeks': calendar.weeks.length }}>
              <div className="ace-usage-grid">
                {calendar.weeks.map((week) => (
                  <div key={week.key} className="ace-usage-week">
                    {mode === 'weekly'
                      ? renderCell({ ...week, date: week.key }, true)
                      : week.cells.map((cell, index) => cell
                        ? renderCell(cell)
                        : <span key={`padding-${index}`} className="ace-usage-padding" aria-hidden="true" />)}
                  </div>
                ))}
              </div>
              <div className="ace-usage-months" aria-hidden="true">
                {months.map((month, index) => (
                  <span key={month.date} style={{ gridColumn: `${month.column + 1} / ${months[index + 1] ? months[index + 1].column + 1 : -1}` }}>
                    {monthFormat.format(new Date(`${month.date}T00:00:00Z`))}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="ace-usage-footer">
            <span>{mode === 'cumulative' ? '近 365 天内累计' : '近 365 天'}</span>
            <div className="ace-usage-legend" aria-hidden="true">
              <span>少</span>
              {[0, 1, 2, 3, 4].map((level) => <span key={level} className="ace-usage-cell" data-level={level} />)}
              <span>多</span>
            </div>
          </div>
        </>
      )}
      {tip && !error && <UsageTooltip id={tooltipId} anchor={tip.anchor} revision={tip.revision}>{cellLabel(tip.cell)}</UsageTooltip>}
    </section>
  );
}
