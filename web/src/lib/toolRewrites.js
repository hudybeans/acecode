// 「工具重写」设置(Settings > 工具 > 工具重写)的纯逻辑层。
// 后端契约:GET/PUT /api/config/tool-rewrites,快照形如
//   { enabled, rewrites:{native:public}, defaults:{native:public},
//     tools:[{name, description, read_only}], path, warning? }
// 数据单独存 <data_dir>/tool-rewrites.json,不在 config.json 里。
import { apiConnectionScope } from './api.js';

// provider 可接受的工具名(OpenAI 与 Anthropic 交集),与后端 is_valid_model_tool_name 一致。
export const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;

export function toolRewriteDraft(snapshot) {
  const rewrites = {};
  for (const [native, target] of Object.entries(snapshot?.rewrites || {})) {
    rewrites[native] = typeof target === 'string' ? target : '';
  }
  return { enabled: !!snapshot?.enabled, rewrites };
}

// 左列 = 所有内置工具(快照 tools),右列 = 当前草稿里的重写名。快照里
// 有重写但已不再注册的工具也要列出来(例如 image_generate 未配置时未注册),
// 否则用户看不到、也删不掉那条配置。
export function toolRewriteRows(snapshot, draft) {
  const tools = Array.isArray(snapshot?.tools) ? snapshot.tools : [];
  const known = new Set(tools.map((tool) => tool.name));
  const rows = tools.map((tool) => ({
    name: tool.name,
    description: tool.description || '',
    readOnly: !!tool.read_only,
    registered: true,
    value: draft?.rewrites?.[tool.name] || '',
    defaultValue: snapshot?.defaults?.[tool.name] || '',
  }));
  for (const [native, target] of Object.entries(draft?.rewrites || {})) {
    if (known.has(native) || !target) continue;
    rows.push({
      name: native, description: '', readOnly: false, registered: false,
      value: target, defaultValue: snapshot?.defaults?.[native] || '',
    });
  }
  return rows;
}

// PUT body:整体替换。空值 / 与原名相同 = 不重写,直接不发。
export function toolRewritePayload(draft) {
  const rewrites = {};
  for (const [native, target] of Object.entries(draft?.rewrites || {})) {
    const trimmed = String(target || '').trim();
    if (!trimmed || trimmed === native) continue;
    rewrites[native] = trimmed;
  }
  return { enabled: !!draft?.enabled, rewrites };
}

// 本地校验,返回 { native: 文案 };后端还会再校验一遍,这里只为即时反馈。
export function validateToolRewriteDraft(draft, snapshot) {
  const errors = {};
  const payload = toolRewritePayload(draft);
  const registered = new Set((snapshot?.tools || []).map((tool) => tool.name));
  const seen = new Map();
  for (const [native, target] of Object.entries(payload.rewrites)) {
    if (!TOOL_NAME_PATTERN.test(target)) {
      errors[native] = '只能包含字母、数字、下划线和连字符，最多 64 个字符';
      continue;
    }
    // 撞真实工具名,或撞另一条重写的原名:模型说出这个名字时会先命中真工具。
    if (registered.has(target) || Object.prototype.hasOwnProperty.call(payload.rewrites, target)) {
      errors[native] = '与另一个工具的名称冲突';
      continue;
    }
    if (seen.has(target)) {
      errors[native] = '与另一个工具的重写名重复';
      errors[seen.get(target)] = '与另一个工具的重写名重复';
      continue;
    }
    seen.set(target, native);
  }
  return errors;
}

export function toolRewriteHasChanges(draft, snapshot) {
  if (!snapshot || !draft) return false;
  const next = toolRewritePayload(draft);
  const previous = toolRewritePayload(toolRewriteDraft(snapshot));
  if (next.enabled !== previous.enabled) return true;
  const nextKeys = Object.keys(next.rewrites).sort();
  const previousKeys = Object.keys(previous.rewrites).sort();
  if (nextKeys.length !== previousKeys.length) return true;
  return nextKeys.some((key, index) => key !== previousKeys[index] || next.rewrites[key] !== previous.rewrites[key]);
}

function settingsError(error, action) {
  const status = error?.status;
  let code = error?.code;
  if (status === 404 || status === 405) code = 'TOOL_REWRITES_UNSUPPORTED';
  else if (status === 401 || status === 403) code = 'TOOL_REWRITES_AUTH_REQUIRED';
  else if (status >= 500 && (!code || code === 'UNAVAILABLE')) code = 'TOOL_REWRITES_UNAVAILABLE';
  return { code, status, action, message: error?.message || '' };
}

// 与 imageGenerationSettingsStore 同款:连接作用域内单例,草稿只在内存,
// 写入串行化,导航离开再回来不会用旧快照覆盖未完成的写。
const stores = new WeakMap();

export function toolRewritesStore(client) {
  const scope = apiConnectionScope(client);
  if (stores.has(scope)) return stores.get(scope);
  let state = { snapshot: null, draft: null, loading: false, saving: false, error: null };
  const listeners = new Set();
  let reading = null;
  let writing = null;
  let requested = false;
  const publish = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const requireConnection = () => {
    if (apiConnectionScope(client) !== scope) throw new Error('Tool rewrite settings connection changed');
  };
  const store = {
    getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    setEnabled: (enabled) => {
      if (!state.draft) return;
      publish({ draft: { ...state.draft, enabled: !!enabled }, error: null });
    },
    setRewrite: (native, value) => {
      if (!state.draft) return;
      publish({ draft: { ...state.draft, rewrites: { ...state.draft.rewrites, [native]: value } }, error: null });
    },
    resetToDefaults: () => {
      if (!state.draft || !state.snapshot) return;
      publish({ draft: { ...state.draft, rewrites: { ...(state.snapshot.defaults || {}) } }, error: null });
    },
    load: () => {
      if (reading) return reading;
      reading = Promise.resolve().then(async () => {
        if (writing) await writing;
        if (toolRewriteHasChanges(state.draft, state.snapshot)) return;
        publish({ loading: true, error: null });
        try {
          requireConnection();
          const snapshot = await client.getToolRewrites();
          publish({ snapshot, draft: toolRewriteDraft(snapshot) });
        } catch (error) {
          publish({ error: settingsError(error, 'load') });
        } finally { publish({ loading: false }); }
      }).finally(() => { reading = null; });
      return reading;
    },
    flush: () => {
      requested = true;
      if (writing) return writing;
      writing = Promise.resolve().then(async () => {
        while (requested && state.snapshot) {
          requested = false;
          const submitted = state.draft;
          if (!toolRewriteHasChanges(submitted, state.snapshot)) continue;
          if (Object.keys(validateToolRewriteDraft(submitted, state.snapshot)).length) {
            publish({ error: { code: 'BAD_REQUEST', action: 'save' } });
            return false;
          }
          publish({ saving: true, error: null });
          try {
            requireConnection();
            const snapshot = await client.setToolRewrites(toolRewritePayload(submitted));
            // 写入期间用户继续改的字段要保留:只把提交过的部分换成服务端回显。
            const saved = toolRewriteDraft(snapshot);
            const current = state.draft;
            const merged = { enabled: current.enabled === submitted.enabled ? saved.enabled : current.enabled, rewrites: { ...saved.rewrites } };
            for (const [native, value] of Object.entries(current.rewrites)) {
              if (value !== submitted.rewrites[native]) merged.rewrites[native] = value;
            }
            publish({ snapshot, draft: merged });
          } catch (error) {
            publish({ error: settingsError(error, 'save') });
            return false;
          }
        }
        return true;
      }).finally(() => { writing = null; publish({ saving: false }); });
      return writing;
    },
  };
  stores.set(scope, store);
  return store;
}
