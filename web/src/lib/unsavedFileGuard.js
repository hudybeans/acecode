import { previewTabsWithUnsavedDrafts } from './previewTabs.js';

// 返回同步许可或待决定的 Promise；调用方必须在许可后才执行导航副作用。
export function runAfterFileApproval(approval, action) {
  const proceed = (allowed) => (allowed ? action() : false);
  return approval && typeof approval.then === 'function'
    ? approval.then(proceed)
    : proceed(approval);
}

export function createUnsavedFileGuard(onChange = () => {}) {
  let pending = null;

  const publish = () => onChange(pending ? {
    kind: pending.kind,
    dirtyCount: previewTabsWithUnsavedDrafts(pending.getTabs()).length,
    saving: pending.saving,
    error: pending.error,
  } : null);

  const finish = (request, allowed) => {
    if (pending !== request) return;
    pending = null;
    publish();
    request.resolve(allowed);
  };

  return {
    isPending: () => pending !== null,
    request({ getTabs, save, discard, kind = 'switch' }) {
      // 不替换已有目标，也不把多个导航挂到同一个许可上。
      if (pending) return false;
      if (previewTabsWithUnsavedDrafts(getTabs()).length === 0) return true;
      const approval = new Promise((resolve) => {
        pending = { getTabs, save, discard, kind, resolve, saving: false, error: '' };
      });
      publish();
      return approval;
    },
    async choose(choice) {
      const request = pending;
      if (!request || request.saving) return;
      if (choice === 'cancel') {
        finish(request, false);
        return;
      }
      if (choice !== 'save' && choice !== 'discard') return;
      const tabs = previewTabsWithUnsavedDrafts(request.getTabs());
      try {
        if (choice === 'save' && tabs.length > 0) {
          request.saving = true;
          request.error = '';
          publish();
          await request.save(tabs);
        } else if (choice === 'discard') {
          request.discard(tabs);
        }
        finish(request, true);
      } catch (error) {
        if (pending !== request) return;
        request.saving = false;
        request.error = error?.message || String(error);
        publish();
      }
    },
    cancelPending() {
      if (pending) finish(pending, false);
    },
  };
}
