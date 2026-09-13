import { buildModelMutationPayloads, redactModelDraftSecrets } from './modelSettings.js';
import { lookupErrorMessage } from './errors.js';

function checkAborted(signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

export async function testModelDraft(apiClient, draft, provider, {
  editing = false, originalName = '', signal,
} = {}) {
  checkAborted(signal);
  const built = buildModelMutationPayloads(
    { ...draft, name: 'model-connection-test' }, provider, { editing },
  );
  if (!built.ok) throw Object.assign(new Error(built.code), { code: built.code });

  for (const payload of built.payloads) {
    checkAborted(signal);
    try {
      const result = await apiClient.testModel({
        ...payload,
        ...(editing ? { original_name: originalName } : {}),
      }, { signal });
      checkAborted(signal);
      if (result?.ok !== true) {
        throw Object.assign(new Error('MODEL_TEST_FAILED'), { code: 'MODEL_TEST_FAILED' });
      }
    } catch (error) {
      checkAborted(signal);
      throw Object.assign(new Error('Model test failed'), {
        code: error?.code || 'MODEL_TEST_FAILED',
        model: payload.model,
        upstreamStatus: error?.body?.upstream_status,
      });
    }
  }
}

export function modelTestFailureMessage(error, draft) {
  const messages = {
    MODEL_TEST_EMPTY_REPLY: '模型未返回有效内容',
    MODEL_TEST_TIMEOUT: '模型回复超时，请重试',
    TIMEOUT: '模型回复超时，请重试',
    MODEL_TEST_NETWORK: '无法连接模型服务，请检查网络和 Base URL',
    MODEL_TEST_HTTP_ERROR: '模型服务返回错误，请检查密钥和模型配置',
    MODEL_TEST_FAILED: '未能获取模型回复，请检查配置后重试',
  };
  const detail = messages[error?.code]
    || lookupErrorMessage(error?.code, messages.MODEL_TEST_FAILED);
  const status = Number.isInteger(error?.upstreamStatus)
    ? ` (HTTP ${error.upstreamStatus})` : '';
  const model = error?.model ? ` (${error.model})` : '';
  return redactModelDraftSecrets(`模型检测失败${model}：${detail}${status}`, draft);
}
