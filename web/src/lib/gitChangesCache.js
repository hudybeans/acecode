// 每会话独立的 Git 变更缓存；会话内导航列表与详情共享实例。
//
// SidePanel 的 `GitChangesPanel`(紧凑导航列表)与中间详情栏的
// `GitChangeReview`(可展开 diff 的审查视图)都读同一份缓存:导航列表拉过
// numstat / 单文件 patch 后,详情栏直接命中,不重复打后端。失效(markStale)
// 也由这一份实例统一收口 —— 回合结束 / checkout / 手动刷新任一处标脏,两个
// 视图下次读取都会重拉。
//
// 不同会话即使 cwd 相同也不复用列表或 patch。

import { createChangesCache } from './gitChanges.js';
import { sessionWorkbench } from './sessionWorkbench.js';
import { GIT_STATE_CHANGED_EVENT } from './gitSessionPill.js';

const liveCaches = new Set();
export function sessionChangesCache(owner) {
  const cache = sessionWorkbench.get(owner, '$gitChanges', createChangesCache);
  liveCaches.add(cache);
  return cache;
}

// 磁盘变化影响所有会话的数据有效性，不改变各自基线、展开和选中项。
if (typeof window !== 'undefined') {
  window.addEventListener(GIT_STATE_CHANGED_EVENT, (event) => {
    const cwd = event?.detail?.cwd;
    if (cwd) for (const cache of liveCaches) cache.markStale(cwd);
  });
}
