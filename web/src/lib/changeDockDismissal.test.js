import assert from 'node:assert/strict';
import {
  dismissChangeDockSignature,
  dismissedDockSignatureFor,
  dockDismissalKey,
  hasCompletedTurnResult,
  isTodoDockSuppressed,
  todoDockSignature,
  validateDockDismissals,
} from './changeDockDismissal.js';
import { buildAssistantRunDirectives } from './assistantRunDirectives.js';
import { projectCollapsedTranscriptItems } from './transcriptProjection.js';
import { createTranscriptState, reduceTranscriptEvent } from './sessionTranscript.js';

function completedResult(items, busy = false) {
  const rendered = projectCollapsedTranscriptItems(items, { deferTrailingToolSummary: busy });
  const directives = buildAssistantRunDirectives(rendered, { deferLastFooter: busy });
  return hasCompletedTurnResult(rendered, directives, { busy });
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

run('dockDismissalKey 按 workspace 和 session 隔离', () => {
  assert.equal(dockDismissalKey({ workspaceHash: 'w1' }, 's1'), 'w1:s1');
  assert.equal(dockDismissalKey({ workspaceHash: '' }, 's1'), 's1');
  assert.equal(dockDismissalKey({ sessionId: 's2' }), 's2');
  assert.equal(dockDismissalKey({}, ''), '');
});

run('dock dismissal 只隐藏同一 session 的同一签名', () => {
  const first = dockDismissalKey({ workspaceHash: 'w' }, 's1');
  const second = dockDismissalKey({ workspaceHash: 'w' }, 's2');
  const state = dismissChangeDockSignature({}, first, 'sig-a');
  assert.equal(dismissedDockSignatureFor(state, first), 'sig-a');
  assert.equal(dismissedDockSignatureFor(state, second), '');

  const replaced = dismissChangeDockSignature(state, first, 'sig-b');
  assert.equal(dismissedDockSignatureFor(replaced, first), 'sig-b');
});

run('dock dismissal state 可 JSON 持久化并恢复', () => {
  const key = dockDismissalKey({ workspaceHash: 'w' }, 's1');
  const state = dismissChangeDockSignature({}, key, 'sig-a');
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(validateDockDismissals(restored), true);
  assert.equal(dismissedDockSignatureFor(restored, key), 'sig-a');
});

run('validateDockDismissals 拒绝无效结构', () => {
  assert.equal(validateDockDismissals({ a: 'sig' }), true);
  assert.equal(validateDockDismissals(null), false);
  assert.equal(validateDockDismissals([]), false);
  assert.equal(validateDockDismissals({ a: '' }), false);
  assert.equal(validateDockDismissals({ a: 1 }), false);
});

run('todoDockSignature 对相同 todo 快照稳定,内容变化即变', () => {
  // 场景:用户提交下一轮对话时记录 todo 快照签名;本轮 agent 尚未动 todo
  // (签名不变)dock 保持收起,agent 更新任一 todo 状态后签名变化 → 重现。
  const todos = [{ id: '1', content: 'a', status: 'pending' }];
  const summary = { completed: 0, total: 1 };
  assert.equal(todoDockSignature(todos, summary), todoDockSignature([...todos], { ...summary }));
  assert.notEqual(
    todoDockSignature(todos, summary),
    todoDockSignature([{ ...todos[0], status: 'completed' }], summary),
  );
  // 空/非法输入不抛异常(会话切换瞬时帧 todos 可能是 null)。
  assert.equal(todoDockSignature(null, null), todoDockSignature([], null));
});

run('isTodoDockSuppressed 只在同会话同签名时抑制', () => {
  // 场景:提交时记 {sessionKey, signature};期望:同会话同签名 → 抑制;
  // 切换会话(sessionKey 不同)或 todo 更新(签名不同)→ 不抑制;
  // 初始 state 为 null(从未提交过)→ 不抑制。
  const sig = todoDockSignature([{ id: '1', content: 'a', status: 'pending' }], null);
  const state = { sessionKey: 's1', signature: sig };
  assert.equal(isTodoDockSuppressed(state, 's1', sig), true);
  assert.equal(isTodoDockSuppressed(state, 's2', sig), false);
  assert.equal(isTodoDockSuppressed(state, 's1', 'other'), false);
  assert.equal(isTodoDockSuppressed(null, 's1', sig), false);
  assert.equal(isTodoDockSuppressed(state, '', sig), false);
});

run('dock completion follows live final result and stays hidden through late todo updates', () => {
  let state = createTranscriptState();
  const apply = (type, payload) => {
    state = reduceTranscriptEvent(state, { type, payload }).state;
    return completedResult(state.items, state.busy);
  };
  assert.equal(apply('message', { id: 'u1', role: 'user', content: 'Make a file' }), false);
  assert.equal(apply('busy_changed', { busy: true }), false);
  assert.equal(apply('todo_updated', {
    todos: [{ id: '1', content: 'Write file', status: 'in_progress' }],
  }), false);
  assert.equal(apply('message', { id: 'a1', role: 'assistant', content: 'Created [file](out.txt)' }), false);
  assert.equal(apply('busy_changed', { busy: false, outcome: 'completed' }), true);
  assert.equal(apply('done', { outcome: 'completed' }), true);
  assert.equal(apply('todo_updated', {
    todos: [{ id: '1', content: 'Write file', status: 'completed' }],
  }), true);
  assert.equal(state.todos.length, 1, 'hiding the dock preserves todo data');

  const signature = todoDockSignature(state.todos, state.todoSummary);
  const suppression = { sessionKey: 's1', signature };
  assert.equal(apply('message', { id: 'u2', role: 'user', content: 'Continue' }), false);
  assert.equal(apply('busy_changed', { busy: true }), false);
  assert.equal(isTodoDockSuppressed(suppression, 's1', todoDockSignature(state.todos, state.todoSummary)), true);
  assert.equal(apply('todo_updated', {
    todos: [{ id: '2', content: 'Next file', status: 'in_progress' }],
  }), false);
  assert.equal(isTodoDockSuppressed(suppression, 's1', todoDockSignature(state.todos, state.todoSummary)), false);
});

run('restored results dismiss the dock without observing a busy transition', () => {
  const history = [
    { kind: 'msg', id: 1, role: 'user', content: 'Make a file' },
    { kind: 'msg', id: 2, role: 'assistant', content: 'Created [file](out.txt)' },
  ];
  assert.equal(completedResult(history), true);
  assert.equal(completedResult(history, true), false);
  assert.equal(completedResult([...history, { kind: 'msg', id: 3, role: 'user', content: 'Next' }]), false);
  assert.equal(completedResult([{ ...history[1], streaming: true }]), false);
  assert.equal(completedResult([{ ...history[1], content: '  ' }]), false);
  assert.equal(completedResult([]), false);
});

run('only successful settled completion summaries dismiss the dock', () => {
  const task = {
    kind: 'tool', id: 1,
    tool: { tool: 'task_complete', isDone: true, success: true, summary: { object: 'Created file' } },
  };
  assert.equal(completedResult([task]), true);
  assert.equal(completedResult([task], true), false);
  assert.equal(completedResult([{ ...task, tool: { ...task.tool, isDone: false } }]), false);
  assert.equal(completedResult([{ ...task, tool: { ...task.tool, success: false } }]), false);
});

run('errors and interruptions keep progress available despite earlier assistant output', () => {
  const assistant = { kind: 'msg', id: 1, role: 'assistant', content: 'Working on the file' };
  for (const terminal of [
    { kind: 'msg', id: 2, role: 'error', content: 'Request failed' },
    { kind: 'termination_notice', id: 2, content: 'Stopped' },
  ]) {
    assert.equal(completedResult([assistant, terminal]), false);
  }
});
