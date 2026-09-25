// 设置 > 常规 > 工作模式(用于编程 / 适合日常工作)的纯逻辑。
//
// 「适合日常工作」= 开启具体进度提示(daemon 配置 agent_loop.tool_preamble.enabled,
// openspec add-tool-preamble):等待时 loading 行只说正在做什么(「正在读取 3 个文件」
// 「正在分析命令输出」),不带工具参数,也不出现「正在推理」这类笼统文案;参数照常
// 留在工具行上。「用于编程」= 关闭,保持技术化的旧文案。
//
// 工作模式不单独落 localStorage:以 daemon 配置为准,多个窗口 / 设备看到的一致,
// 也不会出现「界面显示日常模式、daemon 其实没开」的漂移。请求由组件发,这里只做映射。

export const WORK_MODE_CODING = 'coding';
export const WORK_MODE_DAILY = 'daily';

export const WORK_MODES = Object.freeze([
  Object.freeze({ key: WORK_MODE_CODING, label: '用于编程', desc: '更专业的回复与控制' }),
  Object.freeze({ key: WORK_MODE_DAILY, label: '适合日常工作', desc: '同样强大,技术细节更少' }),
]);

export function isWorkMode(value) {
  return value === WORK_MODE_CODING || value === WORK_MODE_DAILY;
}

// GET /api/config/tool-preamble 的响应(或已规整的状态)→ 当前工作模式。
// 读不到 / 字段不对时按关闭处理,即「用于编程」。
export function workModeFromToolPreamble(state) {
  return state && typeof state === 'object' && state.enabled === true
    ? WORK_MODE_DAILY
    : WORK_MODE_CODING;
}

// 选中某个工作模式时要发的 PUT body;非法取值返回 null(不发请求)。
export function toolPreambleUpdateForWorkMode(workMode) {
  if (!isWorkMode(workMode)) return null;
  return { enabled: workMode === WORK_MODE_DAILY };
}
