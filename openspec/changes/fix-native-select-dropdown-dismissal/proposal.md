## Why

Windows Desktop single-choice dropdowns can open and immediately close on a physical mouse click, including language, document controls, and feedback sessions. A standalone WebView2 page reproduces the problem without React; browser-rendered select pickers remain open in the same runtime.

## What Changes

- Opt Windows Desktop single-choice selects into browser-rendered pickers when the engine supports them, through shared startup guards and styles.
- Keep existing select elements, labels, options, change handlers, and form values.
- Keep Escape inside an open picker so it does not dismiss its containing dialog.
- Retain platform rendering in other environments, unsupported engines, and list or multiple selects.
- 下拉菜单按选项内容自然展开，至少与触发控件等宽，并限制在视口内；修复“关闭窗口时”等紧凑控件把短选项挤成多行的问题。

## Capabilities

### New Capabilities

- `web-select-interaction`: Shared select opening, dismissal, keyboard, theme, and compatibility behavior.

### Modified Capabilities

None.

## Impact

Shared Web startup guards and select styling; no daemon protocol, C++ host, or dependency changes. Validation includes actual Windows mouse input, language and feedback surfaces, keyboard dismissal, and existing Web checks.
