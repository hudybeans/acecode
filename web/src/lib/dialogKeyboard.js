// 对话框的键盘约定(Claude Code 风格,全部 Modal 共用):
//   - Tab / Shift+Tab 只在对话框内循环;
//   - Esc 取消(由 Modal 的 dismissOnEscape 决定是否允许);
//   - Enter 触发对话框的「默认操作」——用 `data-ace-dialog-primary` 标出的那个按钮
//     (确认 / 删除 / 保存),前提是焦点没落在会自己消费 Enter 的元素上;
//   - 打开时的初始焦点:已经落在对话框内的焦点(React autoFocus / 组件自己聚焦)
//     > 第一个文本输入框(表单型对话框) > 默认操作按钮(确认型对话框,删除确认框
//     因此默认选中「删除」) > 第一个可聚焦元素。
//
// 这里只放不依赖 React 的判定逻辑,方便 Node 单测;Modal.jsx 负责挂监听器与真正的 focus()。
// 判定函数都只用 matches / closest / querySelectorAll / getAttribute 这几个 DOM 方法,
// 测试里用鸭子类型的假元素即可。

export const DIALOG_PRIMARY_ATTR = 'data-ace-dialog-primary';
export const DIALOG_PRIMARY_SELECTOR = `[${DIALOG_PRIMARY_ATTR}]`;

export const DIALOG_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// input 里不算「文本输入」的 type:它们不接收字符输入,Enter 落在上面应该等价于默认操作。
const NON_TEXT_INPUT_TYPES = new Set([
  'button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'range', 'color', 'hidden',
]);

// 焦点落在这些元素上时 Enter 归它们自己处理(原生激活 / 换行 / 跟随链接 / 打开下拉),
// 不再触发默认操作。select 也在其中:macOS 上 Return 是打开下拉菜单的键,抢掉它会让
// 键盘用户选不了项;Windows 上原生 Enter 在 select 上本来就没动作,少这一条触发无伤大雅。
const ENTER_CONSUMING_SELECTOR = [
  'button',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="link"]',
  'a[href]',
  'summary',
  'select',
  'textarea',
  '[contenteditable]:not([contenteditable="false"])',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="file"]',
  'input[type="image"]',
].join(',');

// 多行输入:按住 Enter 连续换行是合理操作,auto-repeat 拦截对它们放行。
const MULTILINE_ENTRY_SELECTOR = 'textarea,[contenteditable]:not([contenteditable="false"])';

function tagOf(element) {
  return String(element?.tagName || '').toLowerCase();
}

export function isDialogTextEntry(element) {
  if (!element) return false;
  const tag = tagOf(element);
  if (tag === 'textarea') return true;
  if (tag === 'input') {
    const type = String(element.getAttribute?.('type') || element.type || 'text').toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type);
  }
  return !!element.matches?.('[contenteditable]:not([contenteditable="false"])');
}

// display:none 的元素(例如 Tailwind `hidden` 的 <input type="file">)focus() 会静默失败,
// 进了 Tab 循环会让首尾回绕「按了没反应」;getClientRects 为空即视为不可见。
export function isDialogElementVisible(element) {
  if (!element || element.hidden) return false;
  if (element.getAttribute?.('aria-hidden') === 'true') return false;
  if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) return false;
  return true;
}

export function dialogFocusableElements(dialog) {
  if (!dialog?.querySelectorAll) return [];
  return [...dialog.querySelectorAll(DIALOG_FOCUSABLE_SELECTOR)].filter(isDialogElementVisible);
}

function isPrimaryCandidate(element) {
  return !!element?.matches?.(DIALOG_PRIMARY_SELECTOR) && !element.disabled;
}

export function dialogPrimaryElement(dialog) {
  return dialogFocusableElements(dialog).find(isPrimaryCandidate) || null;
}

// 打开对话框时该把焦点放到哪个元素上;返回 dialog 本身表示没有可聚焦的内容。
export function resolveDialogInitialFocus(dialog, activeElement = null) {
  if (!dialog) return null;
  if (activeElement && activeElement !== dialog && dialog.contains?.(activeElement)) {
    return activeElement;
  }
  const focusable = dialogFocusableElements(dialog);
  return focusable.find(isDialogTextEntry)
    || focusable.find(isPrimaryCandidate)
    || focusable[0]
    || dialog;
}

// Tab 循环:焦点在对话框外(例如被卸载的按钮把焦点丢回 body)时也拉回对话框内。
// 返回要聚焦的元素,null 表示交给浏览器默认行为。
export function resolveDialogTabTarget(dialog, activeElement, shiftKey) {
  const focusable = dialogFocusableElements(dialog);
  if (focusable.length === 0) return dialog;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const inside = !!activeElement && activeElement !== dialog && dialog.contains?.(activeElement);
  if (!inside) return shiftKey ? last : first;
  if (shiftKey && activeElement === first) return last;
  if (!shiftKey && activeElement === last) return first;
  return null;
}

function isDocumentLevelTarget(target) {
  if (!target) return true;
  const tag = tagOf(target);
  return tag === 'body' || tag === 'html' || target.nodeType === 9;
}

// Enter 按下时该做什么:
//   { type: 'ignore' }              —— 不是我们该管的 Enter(带修饰键 / 输入法合成中 / 已被处理 /
//                                     焦点在会自己消费 Enter 的元素上 / 表单内由表单隐式提交)
//   { type: 'block' }               —— auto-repeat(按住不放)的 Enter,阻止其默认行为。否则
//                                     「按住 Enter 打开确认框 → 焦点落到默认按钮 → 连带确认」
//   { type: 'activate', element }   —— 触发默认操作按钮
export function dialogEnterAction(event, dialog) {
  if (!event || event.key !== 'Enter' || !dialog) return { type: 'ignore' };
  const target = event.target;
  const inside = !!target && target !== dialog && !!dialog.contains?.(target);
  if (event.repeat) {
    return inside && target.matches?.(MULTILINE_ENTRY_SELECTOR) ? { type: 'ignore' } : { type: 'block' };
  }
  if (event.defaultPrevented || event.isComposing
    || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return { type: 'ignore' };
  if (inside) {
    if (target.closest?.(ENTER_CONSUMING_SELECTOR)) return { type: 'ignore' };
    if (target.closest?.('form')) return { type: 'ignore' };
  } else if (target !== dialog && !isDocumentLevelTarget(target)) {
    return { type: 'ignore' };
  }
  const primary = dialogPrimaryElement(dialog);
  return primary ? { type: 'activate', element: primary } : { type: 'ignore' };
}
