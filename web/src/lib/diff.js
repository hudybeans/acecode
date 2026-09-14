// 把 ToolBlock 与 SidePanel 共用的 diff 渲染逻辑抽出来。
// 后端 `tool_hunks` 协议 schema:
//   { file?, before?, after?, additions?, deletions?,
//     old_start, old_count, new_start, new_count,
//     lines: [{kind:'added'|'removed'|'context', text:string}] }
// (实际 hunk 的 file/before/after/additions/deletions 是 per-edit 元数据,
//  old_start/old_count/new_start/new_count + lines 是 per-hunk diff body。)

/**
 * 把一组 hunks 拼成 unified diff 字符串(单文件头)。
 * @param {Array<object>} hunks 同一文件的 hunks 列表(同名多次编辑可合并)
 * @param {string} fallbackFile 当 hunk 自带 .file 字段缺失时的兜底文件名
 * @returns {string} unified diff text(空 hunks → '')
 */
export function hunksToUnifiedDiff(hunks, fallbackFile = 'change') {
  if (!Array.isArray(hunks) || hunks.length === 0) return '';
  const out = [];
  // 多文件结果(apply_patch)每个 hunk 带 file:文件切换处重新输出
  // `--- a/ +++ b/` 头,diff2html 原生按多文件渲染。单文件结果只有第一个
  // 头(hunk 没 file 时沿用上一个文件,首个没 file 则用 fallbackFile)。
  let currentFile = null;
  for (const h of hunks) {
    const file = (h && typeof h.file === 'string' && h.file)
      ? h.file
      : (currentFile ?? fallbackFile);
    if (file !== currentFile) {
      currentFile = file;
      out.push(`--- a/${file}`);
      out.push(`+++ b/${file}`);
    }
    const oldS = h.old_start ?? 1;
    const oldC = h.old_count ?? 0;
    const newS = h.new_start ?? 1;
    const newC = h.new_count ?? 0;
    out.push(`@@ -${oldS},${oldC} +${newS},${newC} @@`);
    for (const line of (h.lines || [])) {
      const prefix = line.kind === 'added' ? '+' :
                     line.kind === 'removed' ? '-' : ' ';
      const text = String(line.text ?? '');
      // 单 line.text 理论上不含 \n,但保险起见按 \n 分行
      for (const seg of text.split('\n')) {
        out.push(prefix + seg);
      }
    }
  }
  return out.join('\n');
}
