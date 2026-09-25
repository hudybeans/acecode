// 「粘贴的文本」查看 / 编辑对话框(输入框卡片与对话记录卡片共用)。
//
// 编辑框是不受控原生 textarea:rAF 里一次性赋值、保存时读 ref.value。受控 value
// 每次按键都要把几十万字符过一遍 React,Slate 更慢(f300 卡死的原因)。实测
// (Chromium)原生 textarea 约 50 万字符以内按键延迟 < 60ms,再长明显卡顿,所以:
//   - <= PASTED_TEXT_EDIT_MAX_CHARS 可编辑;
//   - 更长只读,提供「复制全文」「用剪贴板内容替换」;
//   - 只读最多装载 PASTED_TEXT_VIEW_MAX_CHARS 字符,超长时提示;只读且超过编辑上限时
//     wrap=off,省掉软换行排版。
// 文本来源:{text}(内联块 / 消息全文)、{file}(内存里尚未上传或刚上传的 File)、
// {url}(附件 blob,经 AttachmentTextLoaderContext 的 loader 读取,远程 Web 需要 token 头)。
// 编辑过后 Esc 不关;点背景始终不关(在文本框里拖选到框外松开也会触发背景 click)。
import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from './Modal.jsx';
import { VsIcon } from './Icon.jsx';
import { toast } from './Toast.jsx';
import { AttachmentTextLoaderContext } from './AttachmentTextLoaderContext.jsx';
import { copyTextToClipboard } from '../lib/codeBlockCopy.js';
import { formatNumber } from '../lib/format.js';
import {
  PASTED_TEXT_EDIT_MAX_CHARS,
  PASTED_TEXT_VIEW_MAX_CHARS,
  normalizePastedText,
  pastedTextStats,
} from '../lib/pastedText.js';

// 读取来源的正文。loader 只用于 {url}。
export async function readPastedTextSource(source, loader) {
  if (typeof source?.text === 'string') return source.text;
  if (source?.file && typeof source.file.text === 'function') return await source.file.text();
  if (source?.url && typeof loader === 'function') {
    const text = await loader(source.url);
    return typeof text === 'string' ? text : String(text ?? '');
  }
  throw new Error('没有可读取的内容');
}

function clipCodeUnits(text, max) {
  if (text.length <= max) return text;
  const code = text.charCodeAt(max - 1);
  return text.slice(0, code >= 0xD800 && code <= 0xDBFF ? max - 1 : max);
}

const initialState = (source) => (typeof source?.text === 'string'
  ? { status: 'ready', text: source.text, error: '' }
  : { status: 'loading', text: '', error: '' });

export function PastedTextDialog({
  title,
  source,
  readOnly = false,
  loader: loaderProp,
  onSave,
  onReplace,
  onClose,
  layerClassName,
}) {
  useTranslation();
  // 显式传入的 loader 优先(调用方已经从同一个 context 取过),否则取 context。
  const contextLoader = useContext(AttachmentTextLoaderContext);
  const loader = typeof loaderProp === 'function' ? loaderProp : contextLoader;
  const titleId = useId();
  const textareaRef = useRef(null);
  const [state, setState] = useState(() => initialState(source));
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const inlineText = typeof source?.text === 'string' ? source.text : null;
  const sourceFile = source?.file || null;
  const sourceUrl = source?.url || '';

  useEffect(() => {
    if (inlineText != null) {
      setState({ status: 'ready', text: inlineText, error: '' });
      return undefined;
    }
    let cancelled = false;
    setState({ status: 'loading', text: '', error: '' });
    readPastedTextSource({ file: sourceFile, url: sourceUrl }, loader).then(
      (text) => { if (!cancelled) setState({ status: 'ready', text, error: '' }); },
      (error) => {
        if (!cancelled) setState({ status: 'error', text: '', error: String(error?.message || error || '') });
      },
    );
    return () => { cancelled = true; };
  }, [inlineText, sourceFile, sourceUrl, loader]);

  const ready = state.status === 'ready';
  const text = state.text;
  const tooLongToEdit = text.length > PASTED_TEXT_EDIT_MAX_CHARS;
  const editable = !readOnly && ready && !tooLongToEdit;
  const viewTruncated = ready && !editable && text.length > PASTED_TEXT_VIEW_MAX_CHARS;
  const shownText = useMemo(
    () => (viewTruncated ? clipCodeUnits(text, PASTED_TEXT_VIEW_MAX_CHARS) : text),
    [text, viewTruncated],
  );
  const stats = useMemo(() => (ready ? pastedTextStats(text) : null), [ready, text]);

  // 不受控:文本就绪后在下一帧一次性写入,之后只由用户输入改变。
  useEffect(() => {
    if (!ready) return undefined;
    const frame = requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.value = shownText;
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, shownText]);

  const save = () => {
    if (!editable) return;
    const next = normalizePastedText(textareaRef.current ? textareaRef.current.value : text);
    if (next !== text) onSave?.(next);
    onClose?.();
  };

  const copyAll = async () => {
    try {
      await copyTextToClipboard(text);
      toast({ kind: 'ok', text: '已复制' });
    } catch (error) {
      toast({ kind: 'err', text: '复制失败:' + (error?.message || '') });
    }
  };

  const replaceFromClipboard = async () => {
    setNotice('');
    try {
      const clip = await globalThis.navigator?.clipboard?.readText?.();
      const next = normalizePastedText(clip);
      if (!next) throw new Error('empty clipboard');
      onReplace?.(next);
      onClose?.();
    } catch {
      setNotice('无法读取剪贴板，可删除此块后重新粘贴');
    }
  };

  const canReplace = !readOnly && ready && tooLongToEdit && typeof onReplace === 'function';
  const displayTitle = String(title || '') || '粘贴的文本';

  return (
    <Modal
      onClose={onClose}
      width={760}
      labelledBy={titleId}
      dismissOnEscape={!dirty}
      dismissOnBackdrop={false}
      {...(layerClassName ? { layerClassName } : {})}
    >
      <div className="ace-modal-form" data-pasted-text-dialog={editable ? 'edit' : 'view'}>
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3.5">
          <VsIcon name="document" size={16} className="shrink-0 text-fg-mute" />
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg" title={displayTitle}>
            {displayTitle}
          </h2>
          {stats ? (
            <span className="shrink-0 text-[12px] text-fg-mute">
              {`${formatNumber(stats.lines)} 行 · ${formatNumber(stats.chars)} 字符`}
            </span>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-col gap-2 px-4 py-4">
          {state.status === 'loading' ? (
            <div className="flex h-[200px] items-center justify-center gap-2 text-[12px] text-fg-mute">
              <span className="ace-spinner" aria-hidden="true" />
              加载中…
            </div>
          ) : null}
          {state.status === 'error' ? (
            <div className="rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[12px] leading-5 text-danger">
              <div>无法读取粘贴的文本</div>
              {state.error ? <div className="break-words opacity-80">{state.error}</div> : null}
            </div>
          ) : null}
          {ready && !readOnly && tooLongToEdit ? (
            <div className="text-[12px] leading-5 text-fg-mute">
              内容超过 50 万字符，直接编辑会明显卡顿；可复制出去修改后用剪贴板内容替换
            </div>
          ) : null}
          {viewTruncated ? (
            <div className="text-[12px] leading-5 text-fg-mute">
              仅显示前 500 万字符；复制全文可获取完整内容
            </div>
          ) : null}
          {ready ? (
            <textarea
              ref={textareaRef}
              readOnly={!editable}
              spellCheck={false}
              wrap={!editable && tooLongToEdit ? 'off' : 'soft'}
              aria-label={displayTitle}
              onInput={() => { if (!dirty) setDirty(true); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && editable) {
                  event.preventDefault();
                  save();
                }
              }}
              className="h-[min(60vh,560px)] w-full resize-none rounded-lg border border-border bg-surface-alt px-3 py-2.5 font-mono text-[12px] leading-5 text-fg outline-none transition focus:border-accent"
            />
          ) : null}
          {notice ? <div className="text-[12px] leading-5 text-warn">{notice}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
          {ready ? (
            <button
              type="button"
              onClick={copyAll}
              className="h-8 rounded-md border border-border px-3 text-[12px] text-fg hover:bg-surface-hi"
            >
              复制全文
            </button>
          ) : null}
          {canReplace ? (
            <button
              type="button"
              onClick={replaceFromClipboard}
              className="h-8 rounded-md border border-border px-3 text-[12px] text-fg hover:bg-surface-hi"
            >
              用剪贴板内容替换
            </button>
          ) : null}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-md border border-border px-3 text-[12px] text-fg hover:bg-surface-hi"
          >
            {editable ? '取消' : '关闭'}
          </button>
          {editable ? (
            <button
              type="button"
              onClick={save}
              data-ace-dialog-primary="true"
              className="flex h-8 min-w-[64px] items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-3 text-[12px] text-white hover:opacity-90"
            >
              保存
            </button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
