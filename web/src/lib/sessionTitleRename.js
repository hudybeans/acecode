// 会话头部(顶栏)就地重命名的纯逻辑。

// 提交值与进入编辑时显示的标题一致就不发请求:没有用户标题的会话显示的是
// summary,原样回车 / 失焦不能把 summary 固化成用户标题。清空是合法提交
// (回到 summary 兜底),与侧栏行内重命名一致。
export function resolveSessionTitleRename(draft, shownTitle = '') {
  const title = String(draft ?? '').trim();
  return { changed: title !== String(shownTitle ?? '').trim(), title };
}

// no-workspace 会话与 '__local__' 占位没有 workspace 段,走 /api/sessions/:id/title。
export function sessionTitleRenameWorkspaceHash({ workspaceHash = '', noWorkspace = false } = {}) {
  if (noWorkspace) return '';
  const hash = String(workspaceHash || '').trim();
  return hash && hash !== '__local__' ? hash : '';
}
