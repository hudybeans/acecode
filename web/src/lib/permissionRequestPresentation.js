export function planPermissionPresentation(request) {
  const requestKind = request?.args && typeof request.args === 'object' ? request.args.kind : '';
  const isPlanEnter = request?.tool === 'EnterPlanMode' || requestKind === 'enter_plan_mode';
  const isPlanApproval = request?.tool === 'ExitPlanMode' || requestKind === 'plan_approval';
  const planText = isPlanApproval && typeof request?.args?.plan === 'string'
    ? request.args.plan
    : '';
  const planFilePath = (isPlanApproval || isPlanEnter) && typeof request?.args?.plan_file_path === 'string'
    ? request.args.plan_file_path
    : '';

  const shellPermission = request?.tool === 'bash' && request?.args?.permission &&
    typeof request.args.permission === 'object' ? request.args.permission : null;
  const reason = shellPermission?.reason;
  const shellTitle = {
    dangerous_command: '模型要执行一条危险命令',
    escalation_requested: '模型申请在沙盒外执行',
    unknown_command_without_sandbox: '命令需要确认',
    rule_prompt: '执行规则要求确认这条命令',
  }[reason];
  const shellBody = reason === 'unknown_command_without_sandbox'
    ? '本平台没有可用沙盒,未知命令需要确认'
    : shellPermission?.sandbox === 'full-access'
      ? '允许后,这条命令将在沙盒外执行。'
      : '允许后,这条命令将在沙盒内执行。';
  const prefix = typeof shellPermission?.always_allow_prefix === 'string'
    ? shellPermission.always_allow_prefix.trim() : '';
  return {
    isPlanEnter,
    isPlanApproval,
    planText,
    planFilePath,
    hideAllowSession: isPlanEnter || isPlanApproval || (!!shellPermission && !prefix),
    allowSessionLabel: prefix ? `本次会话允许: ${prefix}` : '本次会话允许',
    justification: shellPermission && typeof request?.args?.justification === 'string'
      ? request.args.justification : '',
    title: isPlanApproval ? '计划审批' : isPlanEnter ? '进入 Plan 模式' : shellTitle || '权限请求',
    body: isPlanApproval
      ? 'Agent 已完成计划,请求批准后退出 Plan 模式。'
      : isPlanEnter
        ? 'Agent 请求进入 Plan 模式,先探索并写计划,批准后再改代码。'
        : shellPermission ? shellBody : 'Agent 请求执行以下操作:',
    primaryLabel: isPlanApproval ? '批准计划' : isPlanEnter ? '进入 Plan' : '允许一次',
  };
}
