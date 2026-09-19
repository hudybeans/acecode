## Purpose

Let users scan token activity across the past year in a compact theme-aware calendar and inspect exact usage without crowded permanent labels.

## ADDED Requirements

### Requirement: Annual calendar activity
The usage settings page SHALL display the latest 365 days as a seven-row calendar heatmap with Monday-start week columns and twelve equally spaced month labels. In-range days without usage SHALL be zero-valued cells; out-of-range padding SHALL remain blank. Existing summary and breakdown statistics SHALL retain their 30-day period. The three summary metrics SHALL occupy one compact bordered row with values above labels and vertical dividers; neither the metrics nor their individual text lines SHALL wrap.

#### Scenario: Calendar crosses a year or leap day
- **WHEN** the requested range crosses a year boundary or February 29
- **THEN** each in-range date appears once in chronological calendar order and is assigned to the correct weekday

#### Scenario: No recent activity
- **WHEN** the latest 30 days have no usage
- **THEN** the annual calendar still renders its available history, including zero-valued days

### Requirement: Activity aggregation modes
The calendar SHALL offer 每日, 每周, and 累计 views. Daily values represent each day's tokens. Weekly values merge each displayed Monday-start week into one cell and sum only its in-range dates. Cumulative values represent the displayed 365-day window's running total through each date, and the interface SHALL identify that window scope.

#### Scenario: Partial weeks and cumulative totals
- **WHEN** users change modes
- **THEN** weekly edge totals exclude out-of-range dates and the final cumulative value equals the sum of the displayed daily values

### Requirement: Accessible exact usage details
Hovering, focusing, or tapping a cell SHALL show the applicable date or date range and an exact localized integer token count, including zero. Escape and leaving the active interaction SHALL dismiss details. Details SHALL fit the viewport and remain visible above the settings scroll container.

#### Scenario: Inspect a cell near the viewport edge
- **WHEN** a user hovers or focuses an edge cell
- **THEN** its date and exact token amount remain readable without clipping

### Requirement: Theme and responsive states
Cell intensity SHALL use the current theme accent, empty cells SHALL use neutral theme colors, and details SHALL use theme surface, text, and border colors. The chart SHALL be at most 732 CSS pixels wide, with square daily cells at most 11 CSS pixels wide and small rounded corners. Narrow screens SHALL uniformly scale cells, gaps, corner radii and the month axis to show the whole chart without a horizontal scrollbar. Annual loading or request failures SHALL be shown separately from 30-day statistics and SHALL support refresh. Labels SHALL support Chinese and English. The visible chart SHALL end at its month axis without a range or intensity-legend footer.

#### Scenario: Window width changes
- **WHEN** the settings content becomes narrower or wider
- **THEN** the summary remains one row, all twelve month labels remain equally spaced, daily cells remain square, the chart fits the available width without horizontal scrolling, and increasing available width beyond 732 pixels does not enlarge the chart

#### Scenario: 使用情况整页居中
- **WHEN** 用户查看使用情况页面
- **THEN** 使用情况整页 SHALL 在设置内容区水平居中，标题与刷新按钮、三项摘要、Token 活动图、六项 Token 统计、模型明细、工作区明细及加载、错误、空数据提示共用最大宽度 732 CSS 像素与一致的左右边界；窄窗口下填满可用宽度且无横向溢出

#### Scenario: Annual request fails
- **WHEN** the annual request fails while the 30-day summary succeeds
- **THEN** the summary remains available and the calendar reports the failure rather than displaying zero consumption

#### Scenario: Theme changes
- **WHEN** the active theme changes
- **THEN** cells, controls, and details adopt the new theme colors
