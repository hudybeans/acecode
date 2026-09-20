import assert from 'node:assert/strict';
import { sessionContentLoadingAnchorFrame, sessionContentLoadingPhase } from './sessionContentLoading.js';

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

run('历史和运行环境无论谁先完成，均等到两者就绪再撤下遮罩', () => {
  const historyFirst = [
    { transcriptLoadState: 'loading', resumePending: true },
    { transcriptLoadState: 'loaded', resumePending: true },
    { transcriptLoadState: 'loaded', resumePending: false },
  ];
  const runtimeFirst = [
    { transcriptLoadState: 'loading', resumePending: true },
    { transcriptLoadState: 'loading', resumePending: false },
    { transcriptLoadState: 'loaded', resumePending: false },
  ];
  assert.deepEqual(historyFirst.map(sessionContentLoadingPhase), ['transcript', 'loading', '']);
  assert.deepEqual(runtimeFirst.map(sessionContentLoadingPhase), ['transcript', 'transcript', '']);
  assert.equal(sessionContentLoadingPhase(), '');
});

run('任一阶段失败时，不被另一阶段的加载状态遮住', () => {
  assert.equal(sessionContentLoadingPhase({ transcriptLoadState: 'error', resumePending: true }), 'error');
  assert.equal(sessionContentLoadingPhase({ transcriptLoadState: 'loading', resumeFailed: true }), 'error');
  assert.equal(sessionContentLoadingPhase({ transcriptLoadState: 'loaded', resumeFailed: true }), 'error');
});

run('只读外部会话仅等待历史，不等待可写运行环境', () => {
  const readOnlyState = { readOnly: true, resumePending: true, resumeFailed: true };
  assert.equal(sessionContentLoadingPhase({ ...readOnlyState, transcriptLoadState: 'loading' }), 'transcript');
  assert.equal(sessionContentLoadingPhase({ ...readOnlyState, transcriptLoadState: 'loaded' }), '');
  assert.equal(sessionContentLoadingPhase({ ...readOnlyState, transcriptLoadState: 'error' }), 'error');
});

run('loading 中心只取聊天主列，不把右侧面板计入', () => {
  const frame = sessionContentLoadingAnchorFrame(
    { left: 270, top: 44, width: 1000, height: 700 },
    { left: 270, top: 44, width: 600, height: 700 },
  );
  assert.deepEqual(frame, {
    left: 300,
    top: 350,
    width: 600,
    height: 700,
  });
  assert.notEqual(frame.left, 500, 'must not use the whole content shell center');
});

run('聊天主列被内容容器裁切时使用可见交集居中', () => {
  assert.deepEqual(
    sessionContentLoadingAnchorFrame(
      { left: 100, top: 50, width: 500, height: 400 },
      { left: 50, top: 0, width: 300, height: 300 },
    ),
    { left: 125, top: 125, width: 250, height: 250 },
  );
});

run('缺失、零尺寸或不相交边界安全回退', () => {
  assert.equal(sessionContentLoadingAnchorFrame(null, {}), null);
  assert.equal(sessionContentLoadingAnchorFrame(
    { left: 0, top: 0, width: 100, height: 100 },
    { left: 10, top: 10, width: 0, height: 20 },
  ), null);
  assert.equal(sessionContentLoadingAnchorFrame(
    { left: 0, top: 0, width: 100, height: 100 },
    { left: 200, top: 0, width: 50, height: 50 },
  ), null);
});
