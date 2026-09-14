import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function source(relativePath) {
  return fs.readFileSync(path.join(srcRoot, relativePath), 'utf8');
}

function between(text, start, end) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return text.slice(startIndex, endIndex);
}

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

const PRIMARY = 'data-ace-dialog-primary="true"';
const WHITESPACE = [' ', String.fromCharCode(9), String.fromCharCode(10), String.fromCharCode(13)];
const compact = (text) => WHITESPACE.reduce((acc, ch) => acc.split(ch).join(''), text);

// 断言「某个 primary 标记之后 maxDistance 字符内出现 needle」,即该 needle 所在的按钮标了 primary。
function assertPrimaryBefore(text, needle, label, maxDistance = 240) {
  let index = text.indexOf(PRIMARY);
  while (index !== -1) {
    const needleIndex = text.indexOf(needle, index);
    if (needleIndex !== -1 && needleIndex - index <= maxDistance) return;
    index = text.indexOf(PRIMARY, index + PRIMARY.length);
  }
  assert.fail(`${label}: no ${PRIMARY} within ${maxDistance} chars before ${needle}`);
}

function listComponentFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.jsx')) files.push(full);
    }
  };
  walk(path.join(srcRoot, 'components'));
  return files;
}

// 触发场景:所有对话框的键盘行为(Esc / Tab 循环 / Enter 默认操作 / 初始焦点)必须只在
//          Modal.jsx 一处实现,判定逻辑来自 lib/dialogKeyboard.js。
// 期望行为:Modal 用共享判定函数,不再自己拼 focusable 选择器;Esc 尊重输入法合成;
//          Enter 的 block / activate 两种结果都接了。
run('shared Modal owns the dialog keyboard contract through lib/dialogKeyboard.js', () => {
  const modalFile = source('components/Modal.jsx');
  const modal = between(modalFile, 'export function Modal', '// 右侧滑出面板');

  assert.ok(modalFile.includes("} from '../lib/dialogKeyboard.js';"));
  for (const name of ['dialogEnterAction,', 'resolveDialogInitialFocus,', 'resolveDialogTabTarget,']) {
    assert.ok(modalFile.includes(name), `Modal.jsx must import ${name}`);
  }
  assert.ok(modal.includes('resolveDialogInitialFocus(dialog, document.activeElement)'));
  assert.ok(modal.includes('if (event.isComposing || !dismissOnEscapeRef.current) return;'));
  assert.ok(modal.includes('const action = dialogEnterAction(event, dialog);'));
  assert.ok(modal.includes("action.type === 'block'"));
  assert.ok(modal.includes("action.type === 'activate'"));
  assert.ok(modal.includes('action.element.click()'));
  assert.ok(modal.includes('resolveDialogTabTarget(dialog, document.activeElement, event.shiftKey)'));
  assert.ok(!modal.includes("querySelector('[autofocus]')"));
  assert.ok(!modal.includes('focusableSelector'));
});

// 触发场景:删除类确认框(归档会话彻底删除 / 删除循环 / 删除模型预设 / 删除主题 / 删除专家 /
//          删除旧工作空间数据 / 放弃未保存更改 / 右键菜单确认)。
// 期望行为:确认按钮标 data-ace-dialog-primary,打开即默认选中它、Enter 即确认。
run('destructive confirmations mark the confirm button as the dialog primary', () => {
  const archived = between(source('components/SettingsPage.jsx'), 'function SectionArchived()', '// ─── 使用情况');
  assertPrimaryBefore(archived, 'onClick={confirmPurge}', 'archived purge');
  assertPrimaryBefore(source('components/LoopPage.jsx'), 'onClick={confirmRemove}', 'loop delete');
  assertPrimaryBefore(source('components/DesktopContextMenu.jsx'), 'const pending = pendingConfirm;', 'context menu confirm');
  assertPrimaryBefore(source('components/model-settings/ModelSettingsSection.jsx'), 'onClick={confirmDelete}', 'model delete', 120);
  assertPrimaryBefore(source('components/ThemeCards.jsx'), 'void deleteTheme();', 'theme delete', 200);
  assertPrimaryBefore(source('components/ExpertComponentsPage.jsx'), 'onClick={confirmDelete}', 'expert delete', 120);
  assertPrimaryBefore(source('components/SettingsConfigSection.jsx'), "perform('cleanup'", 'old workspace cleanup', 160);
  assertPrimaryBefore(source('components/ExpertEditor.jsx'), '>放弃更改<', 'expert unsaved changes', 200);
});

// 触发场景:取消按钮绝不能被标成 primary,否则「打开即选中取消 / Enter 取消」与约定相反。
// 期望行为:任何 primary 标记所在的 <button> 文案不能是退出型文案(取消 / 继续编辑 / 稍后重启 /
//          后台运行 / 保留)。
run('cancel-style buttons are never marked as the dialog primary', () => {
  const cancelLabels = ['>取消<', '>继续编辑<', '>稍后重启<', '>后台运行<', '>保留<'];
  let marked = 0;
  for (const file of listComponentFiles()) {
    const text = fs.readFileSync(file, 'utf8');
    let index = text.indexOf(PRIMARY);
    while (index !== -1) {
      marked += 1;
      const tail = compact(text.slice(index, text.indexOf('</button>', index)));
      for (const label of cancelLabels) {
        assert.ok(!tail.includes(label), `${path.relative(srcRoot, file)} marks a cancel button as primary`);
      }
      index = text.indexOf(PRIMARY, index + PRIMARY.length);
    }
  }
  assert.ok(marked >= 30, `expected the primary marker across the dialogs, found ${marked}`);
});

// 触发场景:循环编辑表单与 opencode 导入对话框曾是各自手写的 fixed 遮罩,没有 Esc / Tab 循环 /
//          Enter;导入对话框还把 useMemo 放在提前 return 之后(dialog 从 null 变对象时 hook 数
//          变化会让 React 抛错)。
// 期望行为:两者都走共享 Modal;导入对话框的 hook 在提前返回之前;都标了 primary。
run('loop form and opencode import dialogs are shared Modal dialogs', () => {
  const loopPage = source('components/LoopPage.jsx');
  const loopForm = between(loopPage, 'function AddLoopDialog', 'function RunList');
  assert.ok(loopForm.includes('<Modal onClose={onClose} width={620} dismissOnBackdrop={false} labelledBy="loop-dialog-title">'));
  assert.ok(loopForm.includes(`${PRIMARY} onClick={submit}`));
  assert.ok(!loopForm.includes('fixed inset-0') && !loopForm.includes('role="dialog"'));
  assert.ok(!loopPage.includes('data-ace-native-overlay'));

  const importDialog = between(source('components/Sidebar.jsx'), 'function OpencodeImportDialog', 'function WorkspaceGroup');
  assert.ok(importDialog.includes('<Modal'));
  assert.ok(importDialog.includes('layerClassName="z-[1000]"'));
  assert.ok(importDialog.includes('dismissOnEscape={!running}'));
  assert.ok(importDialog.indexOf('useMemo(') < importDialog.indexOf('if (!dialog) return null;'));
  assertPrimaryBefore(importDialog, 'onClick={onConfirm}', 'opencode import confirm', 120);
  assert.ok(!importDialog.includes('fixed inset-0'));
});

// 触发场景:Git Bash 路径输入框以前自己在 onKeyDown 里处理 Enter,与 Modal 的 Enter 默认操作
//          叠加会提交两次。
// 期望行为:输入框不再自己处理 Enter,由 primary 按钮承接。
run('console bash prompt relies on the dialog primary instead of its own Enter handler', () => {
  const prompt = between(source('components/ConsoleDock.jsx'), '{bashPrompt && (', '</Modal>');
  assert.ok(!prompt.includes('onKeyDown'));
  assertPrimaryBefore(prompt, 'onClick={submitBashPath}', 'bash prompt save', 200);
});

// 触发场景:Tab 切换选中项时要看得见焦点落在哪个按钮上。
// 期望行为:globals.css 给对话框内按钮一条 :focus-visible 焦点环(只在键盘操作时出现)。
run('dialog buttons get a visible keyboard focus ring', () => {
  const styles = source('styles/globals.css');
  const rule = '.ace-modal-dialog :is(button, [role="button"], a[href]):focus-visible {';
  const start = styles.indexOf(rule);
  assert.notEqual(start, -1, 'missing dialog focus-visible rule');
  const block = styles.slice(start, styles.indexOf('}', start));
  assert.ok(block.includes('outline: 2px solid var(--ace-accent);'));
  assert.ok(block.includes('outline-offset: 2px;'));
});
