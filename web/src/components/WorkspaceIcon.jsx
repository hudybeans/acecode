import { workspaceIconById, workspaceIconColorValue } from '../lib/workspaceIcons.js';

// 渲染「编辑项目」图标表里的一个图标。color 为色板键;默认色跟随文字颜色。
// open 选展开态(侧栏项目行展开、选图标网格里的选中格),否则为折叠态。
// 线宽 1.5(24 网格)在 16px 下约 1px,与侧栏默认文件夹的 VS 描边图标同一粗细。
// 图形来自 lib/workspaceIcons.js 的静态常量,不含任何外部输入。
export function WorkspaceIcon({ id, color = 'default', open = false, size = 16, className = '' }) {
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
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-workspace-icon-state={open ? 'open' : 'closed'}
      className={className}
      style={tint ? { color: tint } : undefined}
      dangerouslySetInnerHTML={{ __html: open ? icon.open : icon.closed }}
    />
  );
}
