import assert from 'node:assert/strict';
import {
  DIALOG_PRIMARY_ATTR,
  dialogEnterAction,
  dialogFocusableElements,
  isDialogTextEntry,
  resolveDialogInitialFocus,
  resolveDialogTabTarget,
} from './dialogKeyboard.js';

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

// ── 最小假 DOM ───────────────────────────────────────────────────────────
// 只实现 dialogKeyboard.js 用到的 tagName / getAttribute / matches / closest /
// querySelectorAll / contains / disabled / hidden / getClientRects / nodeType。
// 选择器只支持「tag?[attr] / [attr="v"] 链 + :not(...)」和逗号分组 —— 正好覆盖模块里
// 的全部常量,任何超出子集的选择器直接抛错,免得测试静默放过。
function matchesCompound(node, compound) {
  let rest = compound.trim();
  const tag = rest.match(/^[a-z][a-z0-9-]*/i);
  if (tag) {
    if (node.tagName.toLowerCase() !== tag[0].toLowerCase()) return false;
    rest = rest.slice(tag[0].length);
  }
  while (rest.length > 0) {
    if (rest.startsWith('[')) {
      const end = rest.indexOf(']');
      const inner = rest.slice(1, end);
      const eq = inner.indexOf('=');
      if (eq === -1) {
        if (node.getAttribute(inner) === null) return false;
      } else {
        const value = inner.slice(eq + 1).replace(/^"|"$/g, '');
        if (node.getAttribute(inner.slice(0, eq)) !== value) return false;
      }
      rest = rest.slice(end + 1);
    } else if (rest.startsWith(':not(')) {
      const end = rest.indexOf(')');
      if (matchesCompound(node, rest.slice(5, end))) return false;
      rest = rest.slice(end + 1);
    } else {
      throw new Error(`fake DOM does not support selector: ${rest}`);
    }
  }
  return true;
}

function el(tag, attrs = {}, children = []) {
  const node = {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    attrs: { ...attrs },
    children,
    parent: null,
    get disabled() { return 'disabled' in this.attrs; },
    get hidden() { return 'hidden' in this.attrs; },
    get type() { return this.attrs.type; },
    getAttribute(name) { return name in this.attrs ? String(this.attrs[name]) : null; },
    getClientRects() { return this.attrs.display === 'none' ? [] : [{}]; },
    matches(selector) { return selector.split(',').some((part) => matchesCompound(this, part)); },
    closest(selector) {
      for (let cur = this; cur; cur = cur.parent) {
        if (cur.nodeType === 1 && cur.matches(selector)) return cur;
      }
      return null;
    },
    contains(other) {
      for (let cur = other; cur; cur = cur.parent) if (cur === this) return true;
      return false;
    },
    querySelectorAll(selector) {
      const out = [];
      const walk = (parent) => {
        for (const child of parent.children) {
          if (child.matches(selector)) out.push(child);
          walk(child);
        }
      };
      walk(this);
      return out;
    },
  };
  for (const child of children) child.parent = node;
  return node;
}

const body = () => el('body');
const button = (label, attrs = {}) => el('button', { type: 'button', ...attrs, label });
const primary = (label, attrs = {}) => button(label, { [DIALOG_PRIMARY_ATTR]: 'true', ...attrs });
const dialog = (children) => el('div', { role: 'dialog', tabindex: '-1' }, children);
const keydown = (target, extra = {}) => ({ key: 'Enter', target, ...extra });
const labelsOf = (nodes) => nodes.map((node) => node.attrs.label || node.attrs.name || node.tagName.toLowerCase());

// ── 初始焦点 ─────────────────────────────────────────────────────────────

// 触发场景:归档列表的「彻底删除会话」确认框 —— 只有说明文字 + 取消 / 删除两个按钮。
// 期望行为:打开时默认选中标了 data-ace-dialog-primary 的「删除」,而不是 DOM 里靠前的「取消」
//          (Claude Code 的删除对话框约定,用户按 Enter 即确认删除)。
run('delete confirmation focuses the primary button instead of the first button', () => {
  const cancel = button('cancel');
  const remove = primary('delete');
  const box = dialog([el('div', {}, [el('p')]), el('div', {}, [cancel, remove])]);
  assert.equal(resolveDialogInitialFocus(box, body()), remove);
});

// 触发场景:表单型对话框(例如「指定 Git Bash 路径」)同时有文本输入框和标了 primary 的保存按钮。
// 期望行为:初始焦点给第一个文本输入框,用户直接开始输入;primary 只负责 Enter。
run('form dialogs focus the first text entry ahead of the primary button', () => {
  const name = el('input', { name: 'name' });
  const save = primary('save');
  const box = dialog([button('close'), el('label', {}, [name]), el('textarea', { name: 'notes' }), save]);
  assert.equal(resolveDialogInitialFocus(box, body()), name);
});

// 触发场景:子组件用 React autoFocus / 自己的 effect 已经把焦点放进对话框(添加专家的搜索框)。
// 期望行为:Modal 不再抢焦点 —— 旧实现无条件聚焦第一个可聚焦元素,把 autoFocus 的搜索框
//          抢成了头部的「×」按钮。
run('focus already inside the dialog is kept', () => {
  const close = button('close');
  const search = el('input', { name: 'search' });
  const box = dialog([close, search, primary('ok')]);
  assert.equal(resolveDialogInitialFocus(box, search), search);
  // 焦点在对话框容器自己身上不算「已有焦点」,仍按规则选一个内容元素。
  assert.equal(resolveDialogInitialFocus(box, box), search);
});

// 触发场景:「关闭窗口」对话框第一个可聚焦元素是「记住我的选择」checkbox;主题导入对话框里
//          有 Tailwind `hidden`(display:none)的 <input type="file">。
// 期望行为:checkbox / radio / file 不算文本输入,不抢初始焦点;display:none 的元素不进 Tab 循环。
run('non-text inputs and invisible controls do not steal focus', () => {
  const remember = el('input', { type: 'checkbox', name: 'remember' });
  const file = el('input', { type: 'file', name: 'file', display: 'none' });
  const exit = primary('exit');
  const box = dialog([remember, file, button('tray'), exit]);
  assert.equal(isDialogTextEntry(remember), false);
  assert.equal(isDialogTextEntry(file), false);
  assert.equal(isDialogTextEntry(el('input', { type: 'search' })), true);
  assert.equal(isDialogTextEntry(el('input')), true);
  assert.equal(isDialogTextEntry(el('div', { contenteditable: 'true' })), true);
  assert.deepEqual(labelsOf(dialogFocusableElements(box)), ['remember', 'tray', 'exit']);
  assert.equal(resolveDialogInitialFocus(box, body()), exit);
});

// 触发场景:没有 primary 也没有输入框的对话框(例如只有「知道了」/ 旧数据「保留 / 删除」);
//          以及内容全是静态文字的对话框。
// 期望行为:回退到第一个可聚焦元素;完全没有可聚焦元素时聚焦对话框容器本身。
run('falls back to the first focusable element and then the dialog itself', () => {
  const keep = button('keep');
  const box = dialog([el('p'), keep, button('delete')]);
  assert.equal(resolveDialogInitialFocus(box, body()), keep);
  const empty = dialog([el('p')]);
  assert.equal(resolveDialogInitialFocus(empty, body()), empty);
});

// 触发场景:primary 因为条件不满足被 disabled(路径选择器还没选中目标 / 模型探测还在加载)。
// 期望行为:disabled 的 primary 既不聚焦也不响应 Enter,按普通回退规则处理。
run('a disabled primary is neither focused nor activated', () => {
  const back = button('back');
  const confirm = primary('confirm', { disabled: true });
  const box = dialog([back, confirm]);
  assert.equal(resolveDialogInitialFocus(box, body()), back);
  assert.deepEqual(dialogEnterAction(keydown(box), box), { type: 'ignore' });
});

// ── Enter ────────────────────────────────────────────────────────────────

// 触发场景:用户没有 Tab 到任何按钮(焦点在对话框容器上,或按钮被卸载后焦点掉回 body),
//          或者焦点在 checkbox / 普通 text input(非表单)上,直接按 Enter。
// 期望行为:等价于点击 primary。
run('Enter activates the primary when focus is not on an Enter-consuming element', () => {
  const remove = primary('delete');
  const checkbox = el('input', { type: 'checkbox' });
  const text = el('input', { type: 'text' });
  const box = dialog([checkbox, text, button('cancel'), remove]);
  for (const target of [box, body(), checkbox, text]) {
    assert.deepEqual(dialogEnterAction(keydown(target), box), { type: 'activate', element: remove });
  }
});

// 触发场景:用户 Tab 到了「取消」再按 Enter;或焦点在 textarea / 链接 / contenteditable /
//          select(macOS 上 Return 是打开下拉的键)上。
// 期望行为:交给原生行为(激活当前按钮 / 换行 / 跟随链接 / 打开下拉),绝不能再触发 primary,
//          否则「Tab 到取消 → Enter」会变成确认删除。
run('Enter on buttons, links, selects and multiline editors is left to the element itself', () => {
  const cancel = button('cancel');
  const link = el('a', { href: '#' });
  const notes = el('textarea');
  const editor = el('div', { contenteditable: 'true' });
  const select = el('select');
  const roleButton = el('div', { role: 'button', tabindex: '0' });
  const icon = el('span');
  const iconButton = el('button', { type: 'button', label: 'icon' }, [icon]);
  const box = dialog([cancel, link, notes, editor, select, roleButton, iconButton, primary('delete')]);
  for (const target of [cancel, link, notes, editor, select, roleButton, icon]) {
    assert.deepEqual(dialogEnterAction(keydown(target), box), { type: 'ignore' }, target.tagName);
  }
});

// 触发场景:表单型对话框(新建项目 / 编辑目标)里焦点在 <form> 内的输入框上按 Enter。
// 期望行为:忽略 —— 浏览器的隐式提交会触发 onSubmit,再点一次 submit 按钮就是双重提交。
run('Enter inside a form is left to implicit submission', () => {
  const name = el('input', { type: 'text' });
  const submit = primary('create', { type: 'submit' });
  const form = el('form', {}, [name, submit]);
  const box = dialog([form]);
  assert.deepEqual(dialogEnterAction(keydown(name), box), { type: 'ignore' });
  // 焦点在对话框容器上(表单外)按 Enter 仍然点 submit 按钮 → 触发表单提交。
  assert.deepEqual(dialogEnterAction(keydown(box), box), { type: 'activate', element: submit });
});

// 触发场景:输入法合成中的 Enter(中文用户选词)、带修饰键的 Enter、已被子组件 preventDefault
//          的 Enter(Tag 输入框用 Enter 添加 Tag)、焦点在对话框外某个元素上的 Enter。
// 期望行为:一律忽略。
run('Enter with modifiers, IME composition, prior handling or outside focus is ignored', () => {
  const remove = primary('delete');
  const box = dialog([button('cancel'), remove]);
  const outside = el('input', { type: 'text' });
  el('div', {}, [outside]);
  for (const extra of [
    { isComposing: true }, { defaultPrevented: true }, { ctrlKey: true }, { metaKey: true },
    { altKey: true }, { shiftKey: true }, { key: 'Escape' },
  ]) {
    assert.deepEqual(dialogEnterAction(keydown(box, extra), box), { type: 'ignore' }, JSON.stringify(extra));
  }
  assert.deepEqual(dialogEnterAction(keydown(outside), box), { type: 'ignore' });
});

// 触发场景:用户按住 Enter 不放 —— 第一下在列表的删除按钮上打开了确认框,焦点落到「删除」,
//          随后 auto-repeat 的 Enter 会直接激活它(Chromium 的按钮激活发生在 keypress,而
//          keypress 派发给当时聚焦的元素)。
// 期望行为:repeat 的 Enter 返回 block,由 Modal preventDefault 掉(keydown 被阻止后不再产生
//          keypress);只有 textarea / contenteditable 里按住 Enter 连续换行放行。
run('auto-repeated Enter is blocked except inside multiline editors', () => {
  const remove = primary('delete');
  const notes = el('textarea');
  const editor = el('div', { contenteditable: 'true' });
  const box = dialog([notes, editor, button('cancel'), remove]);
  assert.deepEqual(dialogEnterAction(keydown(remove, { repeat: true }), box), { type: 'block' });
  assert.deepEqual(dialogEnterAction(keydown(box, { repeat: true }), box), { type: 'block' });
  assert.deepEqual(dialogEnterAction(keydown(body(), { repeat: true }), box), { type: 'block' });
  assert.deepEqual(dialogEnterAction(keydown(notes, { repeat: true }), box), { type: 'ignore' });
  assert.deepEqual(dialogEnterAction(keydown(editor, { repeat: true }), box), { type: 'ignore' });
});

// ── Tab 循环 ─────────────────────────────────────────────────────────────

// 触发场景:在最后一个按钮上按 Tab / 在第一个按钮上按 Shift+Tab / 焦点在对话框外(被卸载的
//          按钮把焦点丢回了 body)时按 Tab。
// 期望行为:首尾回绕;对话框外的焦点被拉回对话框内;中间位置交给浏览器默认顺序(返回 null)。
run('Tab wraps inside the dialog and pulls stray focus back in', () => {
  const cancel = button('cancel');
  const remove = primary('delete');
  const box = dialog([cancel, remove]);
  assert.equal(resolveDialogTabTarget(box, remove, false), cancel);
  assert.equal(resolveDialogTabTarget(box, cancel, true), remove);
  assert.equal(resolveDialogTabTarget(box, cancel, false), null);
  assert.equal(resolveDialogTabTarget(box, body(), false), cancel);
  assert.equal(resolveDialogTabTarget(box, body(), true), remove);
  assert.equal(resolveDialogTabTarget(box, box, false), cancel);
  const empty = dialog([el('p')]);
  assert.equal(resolveDialogTabTarget(empty, body(), false), empty);
});
