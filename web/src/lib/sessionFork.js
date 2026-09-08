// 分叉响应里待回填输入框的提示词。
//
// 后端只在分叉点命中 user 提示词时返回 `restored_prompt`:此时这条提示词
// 已从新会话历史中剔除,需要回填让用户改后重发。分叉点命中 assistant 消息
// 时没有该字段,输入框保持原样。空串视同没有。
export function forkRestoredPrompt(response) {
  const text = response?.restored_prompt;
  return typeof text === 'string' && text ? text : '';
}
