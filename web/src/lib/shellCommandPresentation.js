export const SHELL_PREVIEW_LINES = 3;

export function isShellCommand(entry) {
  return String(entry?.tool || '').trim().toLowerCase() === 'bash'
    || String(entry?.summary?.verb || '').trim().toLowerCase() === 'ran';
}

function commandFromArgs(args) {
  if (typeof args === 'string') {
    try { return commandFromArgs(JSON.parse(args)); } catch { return ''; }
  }
  return args && typeof args.command === 'string' ? args.command : '';
}

function joinCommandOutput(command, output) {
  return [command ? `$ ${command}` : '', output].filter(Boolean).join('\n\n');
}

export function shellCommandPresentation(entry) {
  if (!isShellCommand(entry)) return null;
  const command = commandFromArgs(entry.args)
    || String(entry.displayOverride || '')
    || (String(entry.summary?.verb || '').toLowerCase() === 'ran'
      ? String(entry.summary?.object || '') : '');
  const tail = Array.isArray(entry.tailLines) ? entry.tailLines : [];
  const progress = [...tail, ...(entry.currentPartial ? [entry.currentPartial] : [])].join('\n');
  // 旧包装的 output 仍服务通用工具；Shell 使用独立结果，避免重复显示请求 JSON。
  const output = String(entry.resultOutput ?? (entry.output || progress));
  return {
    command,
    output,
    copyText: joinCommandOutput(command, output),
    previewText: joinCommandOutput(
      command.split('\n').slice(0, SHELL_PREVIEW_LINES).join('\n'),
      output.split('\n').slice(0, SHELL_PREVIEW_LINES).join('\n'),
    ),
  };
}
