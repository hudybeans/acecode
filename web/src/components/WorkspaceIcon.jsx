import { workspaceIconById, workspaceIconColorValue } from '../lib/workspaceIcons.js';

// 渲染「编辑项目」图标表里的一个图标。color 为色板键;默认色跟随文字颜色。
// body 来自 lib/workspaceIcons.js 的静态常量,不含任何外部输入。
export function WorkspaceIcon({ id, color = 'default', size = 16, className = '' }) {
  const icon = workspaceIconById(id);
  if (!icon) return null;
  const tint = workspaceIconColorValue(color);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={tint ? { color: tint } : undefined}
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
