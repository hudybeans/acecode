// 侧栏固定导航(新建任务 / 定时任务 / 扩展)与下方任务列表之间的分隔线:
// 列表滚离顶部时显出,回到顶部时隐去,两块浑然一体。
//
// 直接写 DOM 的 data 属性而不是 React state:滚动事件高频,Sidebar 整树重渲染的代价
// 远大于改一个属性;CSS 按 [data-list-scrolled="true"] 上色。

// 小数缩放下滚回顶部,scrollTop 可能残留亚像素值(如 0.4),按半像素阈值判定。
export function sidebarListScrolledPastTop(scrollTop) {
  return Number(scrollTop) > 0.5;
}

// nav = 固定导航容器,list = 任务列表滚动容器。值没变时不写,避免无谓的样式失效。
export function syncSidebarListDivider(nav, list) {
  if (!nav?.dataset || !list) return;
  const next = sidebarListScrolledPastTop(list.scrollTop) ? 'true' : 'false';
  if (nav.dataset.listScrolled !== next) nav.dataset.listScrolled = next;
}
