// 权限确认弹窗的工具展示口径(纯函数,Node 单测)。
// 与 TUI 侧保持一致:工具名走 pascal_case_tool_name 同款转换
// (src/tui/tool_row_format.cpp),file_write/file_edit 只提示
// 「改哪个文件、多少行」,不再把参数 JSON(含完整文件内容)糊进弹窗。

// 对齐 C++ pascal_case_tool_name:下划线作分词符丢弃,词首小写字母转大写,
// 已是驼峰的名字(AskUserQuestion / EnterWorktree)原样保留。
export function pascalCaseToolName(name) {
  const s = String(name ?? '');
  let out = '';
  let upperNext = true;
  for (const ch of s) {
    if (ch === '_') {
      upperNext = true;
      continue;
    }
    out += upperNext && ch >= 'a' && ch <= 'z' ? ch.toUpperCase() : ch;
    upperNext = false;
  }
  return out;
}

// 行数统计:空串 0 行;结尾单个换行不额外计一行("a\n" 是 1 行)。
export function countLines(text) {
  const s = String(text ?? '');
  if (!s) return 0;
  const body = s.endsWith('\n') ? s.slice(0, -1) : s;
  return body === '' ? 1 : body.split('\n').length;
}

// apply_patch 补丁的 header 扫描(与 C++ apply_patch::summarize_patch_headers
// 同口径):只认 `*** Add/Delete/Update File:` 与紧随 Update 之后的
// `*** Move to:`,不校验信封与正文 —— 预览不该因为补丁格式错误而消失。
const PATCH_HEADERS = [
  ['*** Add File:', 'add'],
  ['*** Delete File:', 'delete'],
  ['*** Update File:', 'update'],
];

export function patchFileHeaders(text) {
  const headers = [];
  for (const raw of String(text ?? '').split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    const match = PATCH_HEADERS.find(([prefix]) => line.startsWith(prefix));
    if (match) {
      const path = line.slice(match[0].length).trim();
      if (path) headers.push({ kind: match[1], path, movePath: '' });
      continue;
    }
    if (line.startsWith('*** Move to:') && headers.length > 0
      && headers[headers.length - 1].kind === 'update') {
      headers[headers.length - 1].movePath = line.slice('*** Move to:'.length).trim();
    }
  }
  return headers;
}

function patchTextFromArgs(a) {
  for (const key of ['input', 'patchText', 'patch']) {
    if (typeof a[key] === 'string' && a[key]) return a[key];
  }
  return '';
}

const PATCH_KIND_MARK = { add: 'A', update: 'M', delete: 'D' };

// 返回 { toolLabel, kind, ... }:
//   kind='file'    → filePath + detail(文件写入/编辑的精简摘要)
//   kind='command' → command(bash,命令本身就是要审的内容)
//   kind='json'    → 无更好渲染的工具,调用方回退到紧凑 JSON 预览
export function buildPermissionToolPreview(tool, args) {
  const toolLabel = pascalCaseToolName(tool || 'tool') || 'Tool';
  const a = args && typeof args === 'object' && !Array.isArray(args) ? args : null;

  if (tool === 'apply_patch' && a) {
    const headers = patchFileHeaders(patchTextFromArgs(a));
    if (headers.length > 0) {
      // 单文件直接给路径;多文件给数量,detail 逐行列出 A/M/D + 路径
      // (Move 追加 -> 目标),不透出补丁正文。
      const filePath = headers.length === 1
        ? headers[0].path
        : `${headers.length} 个文件`;
      const detail = headers
        .map((h) => `${PATCH_KIND_MARK[h.kind]} ${h.path}${h.movePath ? ` -> ${h.movePath}` : ''}`)
        .join('\n');
      return { toolLabel, kind: 'file', filePath, detail };
    }
  }

  if (tool === 'file_write' && a && typeof a.file_path === 'string' && a.file_path) {
    return {
      toolLabel,
      kind: 'file',
      filePath: a.file_path,
      detail: `写入 ${countLines(a.content)} 行`,
    };
  }

  if (tool === 'file_edit' && a && typeof a.file_path === 'string' && a.file_path) {
    const oldLines = countLines(a.old_string);
    const newLines = countLines(a.new_string);
    let detail;
    if (oldLines === 0) {
      detail = `写入 ${newLines} 行`;
    } else if (newLines === 0) {
      detail = `删除 ${oldLines} 行`;
    } else {
      detail = `替换 ${oldLines} 行 → ${newLines} 行`;
    }
    if (a.replace_all === true) detail += '(所有匹配)';
    return { toolLabel, kind: 'file', filePath: a.file_path, detail };
  }

  if (tool === 'bash' && a && typeof a.command === 'string') {
    return { toolLabel, kind: 'command', command: a.command };
  }

  return { toolLabel, kind: 'json' };
}
