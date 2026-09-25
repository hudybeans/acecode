import assert from 'node:assert/strict';
import {
  WORK_MODES,
  WORK_MODE_CODING,
  WORK_MODE_DAILY,
  isWorkMode,
  toolPreambleUpdateForWorkMode,
  workModeFromToolPreamble,
} from './workMode.js';

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

// 触发场景:设置 > 常规 > 工作模式渲染二选一。
// 期望行为:顺序固定为「用于编程」「适合日常工作」,文案与原来的卡片一致;
// 取值校验只接受这两个 key。
run('工作模式的选项与取值校验', () => {
  assert.deepEqual(WORK_MODES.map((entry) => entry.key), [WORK_MODE_CODING, WORK_MODE_DAILY]);
  assert.deepEqual(WORK_MODES.map((entry) => entry.label), ['用于编程', '适合日常工作']);
  assert.equal(isWorkMode('coding'), true);
  assert.equal(isWorkMode('daily'), true);
  for (const value of ['', 'Daily', 'office', null, undefined, 1, {}]) {
    assert.equal(isWorkMode(value), false, String(value));
  }
});

// 触发场景:设置页打开时读 GET /api/config/tool-preamble。
// 期望行为:具体进度提示开启 = 「适合日常工作」;关闭、读不到、响应形态不对都按
// 「用于编程」显示(用户真实配置里还留着旧的 mode 字段,不影响判断)。
run('按 daemon 的具体进度提示开关推出工作模式', () => {
  assert.equal(workModeFromToolPreamble({ enabled: true }), WORK_MODE_DAILY);
  assert.equal(workModeFromToolPreamble({ enabled: true, mode: 'prompt' }), WORK_MODE_DAILY);
  assert.equal(workModeFromToolPreamble({ enabled: false }), WORK_MODE_CODING);
  assert.equal(workModeFromToolPreamble({ enabled: 'true' }), WORK_MODE_CODING);
  assert.equal(workModeFromToolPreamble(null), WORK_MODE_CODING);
  assert.equal(workModeFromToolPreamble(undefined), WORK_MODE_CODING);
});

// 触发场景:用户点选某个工作模式。
// 期望行为:「适合日常工作」发 {enabled:true},「用于编程」发 {enabled:false}
// (切回编程模式就恢复技术化的旧文案);非法取值不发请求。
run('选中工作模式时的 PUT body', () => {
  assert.deepEqual(toolPreambleUpdateForWorkMode(WORK_MODE_DAILY), { enabled: true });
  assert.deepEqual(toolPreambleUpdateForWorkMode(WORK_MODE_CODING), { enabled: false });
  assert.equal(toolPreambleUpdateForWorkMode('office'), null);
  assert.equal(toolPreambleUpdateForWorkMode(undefined), null);
});
