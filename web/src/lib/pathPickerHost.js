// Web 路径选择器的 Promise 形态入口(openspec add-web-path-picker)。
//
// 调用方(侧栏「添加项目」、侧面板「打开文件」、设置页「浏览」)都是 async 函数,想要的是
// `const picked = await requestPathPick({ mode: 'folder' })`;而弹窗是 React 组件,必须挂在
// 树里。这里用一个模块级单例把两边接起来:requestPathPick 登记请求并通知订阅者,
// PathPickerHost 订阅后渲染 PathPickerModal,弹窗确认 / 取消时调 resolvePathPick 结束 Promise。
//
// 约束:同一时刻只允许一个待处理请求 —— 第二个请求直接以 null 结束,而不是排队弹第二个
// 弹窗。没有任何 host 挂载时请求会被拒绝(reject),调用方按普通错误提示,避免 Promise
// 永远挂起看起来像「点了没反应」。

let counter = 0;
let pending = null;
const listeners = new Set();

function snapshot() {
  return pending ? { id: pending.id, options: pending.options } : null;
}

function notify() {
  const current = snapshot();
  for (const listener of [...listeners]) {
    try {
      listener(current);
    } catch {
      // 订阅者异常不影响其它订阅者与 Promise 结算。
    }
  }
}

export function subscribePathPickRequests(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hasPathPickerHost() {
  return listeners.size > 0;
}

export function currentPathPickRequest() {
  return snapshot();
}

// 返回 Promise<{ path, kind } | null>;null = 用户取消。
export function requestPathPick(options = {}) {
  if (!hasPathPickerHost()) {
    return Promise.reject(new Error('路径选择器不可用'));
  }
  if (pending) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    counter += 1;
    pending = { id: counter, options: { ...options }, resolve };
    notify();
  });
}

// 弹窗结束时调用;id 不匹配(过期请求)时返回 false 且什么都不做。
export function resolvePathPick(id, result) {
  if (!pending || pending.id !== id) return false;
  const request = pending;
  pending = null;
  notify();
  request.resolve(result && typeof result === 'object' && result.path ? result : null);
  return true;
}

export function cancelPathPick(id) {
  return resolvePathPick(id, null);
}

// 仅测试用:清空单例状态。
export function resetPathPickerHostForTests() {
  if (pending) {
    const request = pending;
    pending = null;
    request.resolve(null);
  }
  listeners.clear();
  counter = 0;
}
