// 读取附件正文的 loader(粘贴的文本块查看 / 编辑)。值为 (url, options) => Promise<string>。
//
// Message.jsx 没有 api:对话记录由 ChatView(主会话,createApi(ref))与 SubagentPanel
// (子会话)两处经 TranscriptItems 渲染,各自用自己连接的 api.readAttachmentText 提供。
// 远程 Web 下 loader 走 request(),自带 token 头,不能把 blob_url 当裸 URL 交给浏览器。
// 默认值用当前页面连接,供没有 Provider 的渲染路径兜底。
import { createContext } from 'react';
import { createApi } from '../lib/api.js';

let defaultApi = null;

export function defaultAttachmentTextLoader(url, options) {
  if (!defaultApi) defaultApi = createApi(null);
  return defaultApi.readAttachmentText(url, options);
}

export const AttachmentTextLoaderContext = createContext(defaultAttachmentTextLoader);
