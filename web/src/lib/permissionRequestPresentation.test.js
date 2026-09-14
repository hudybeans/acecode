import assert from 'node:assert/strict';
import { planPermissionPresentation } from './permissionRequestPresentation.js';

// 执行审批显示真实边界/理由,解释器或不透明脚本不提供可误解的会话放行。
const escalation = planPermissionPresentation({
  tool: 'bash',
  args: {
    command: 'pnpm install',
    justification: 'Install the project dependencies.',
    permission: { reason: 'escalation_requested', sandbox: 'full-access', always_allow_prefix: 'pnpm install' },
  },
});
assert.equal(escalation.title, '模型申请在沙盒外执行');
assert.match(escalation.body, /沙盒外/);
assert.equal(escalation.justification, 'Install the project dependencies.');
assert.equal(escalation.allowSessionLabel, '本次会话允许: pnpm install');
assert.equal(escalation.hideAllowSession, false);
const opaque = planPermissionPresentation({
  tool: 'bash', args: { permission: { reason: 'dangerous_command', sandbox: 'workspace-write', always_allow_prefix: '' } },
});
assert.equal(opaque.title, '模型要执行一条危险命令');
assert.equal(opaque.hideAllowSession, true);
assert.match(opaque.body, /沙盒内/);
assert.match(planPermissionPresentation({
  tool: 'bash', args: { permission: { reason: 'unknown_command_without_sandbox', sandbox: 'full-access' } },
}).body, /没有可用沙盒/);

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

run('plan permission presentation recognizes EnterPlanMode requests', () => {
  const view = planPermissionPresentation({
    tool: 'EnterPlanMode',
    args: { kind: 'enter_plan_mode', plan_file_path: 'C:/tmp/plan.md' },
  });
  assert.equal(view.isPlanEnter, true);
  assert.equal(view.isPlanApproval, false);
  assert.equal(view.hideAllowSession, true);
  assert.equal(view.title, '进入 Plan 模式');
  assert.equal(view.primaryLabel, '进入 Plan');
  assert.equal(view.planFilePath, 'C:/tmp/plan.md');
});

run('plan permission presentation recognizes plan approval payloads', () => {
  const view = planPermissionPresentation({
    tool: 'ExitPlanMode',
    args: {
      kind: 'plan_approval',
      plan_file_path: 'C:/tmp/plan.md',
      plan: '1. Inspect\n2. Implement',
    },
  });
  assert.equal(view.isPlanEnter, false);
  assert.equal(view.isPlanApproval, true);
  assert.equal(view.hideAllowSession, true);
  assert.equal(view.title, '计划审批');
  assert.equal(view.primaryLabel, '批准计划');
  assert.equal(view.planFilePath, 'C:/tmp/plan.md');
  assert.equal(view.planText, '1. Inspect\n2. Implement');
});

run('plan permission presentation leaves generic tool requests unchanged', () => {
  const view = planPermissionPresentation({
    tool: 'bash',
    args: { command: 'git status' },
  });
  assert.equal(view.isPlanEnter, false);
  assert.equal(view.isPlanApproval, false);
  assert.equal(view.hideAllowSession, false);
  assert.equal(view.title, '权限请求');
  assert.equal(view.primaryLabel, '允许一次');
});
