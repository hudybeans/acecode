// 极简 toast:模块级订阅,任何地方 import { toast } 触发,Toaster 是渲染容器。
// 不引入 react-hot-toast 等依赖。

import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from '../lib/format.js';
import { notifyNativeSurfaceOverlayChange } from '../lib/agentBrowserSurfaceCoordinator.js';
import { VsIcon } from './Icon.jsx';

const listeners = new Set();
let nextId = 1;

export function toast({ kind = 'info', text, duration = 3500 }) {
  const id = nextId++;
  const item = { id, kind, text, duration };
  for (const fn of listeners) fn({ type: 'add', item });
  if (duration > 0) {
    setTimeout(() => {
      for (const fn of listeners) fn({ type: 'remove', id });
    }, duration);
  }
  return id;
}

export function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const handler = (evt) => {
      if (evt.type === 'add')    setItems((prev) => [evt.item, ...prev]);
      if (evt.type === 'remove') setItems((prev) => prev.filter((x) => x.id !== evt.id));
    };
    listeners.add(handler);
    return () => listeners.delete(handler);
  }, []);

  useLayoutEffect(() => {
    notifyNativeSurfaceOverlayChange();
    return () => notifyNativeSurfaceOverlayChange();
  }, [items]);

  // Escape the isolated app shell and keep feedback above global dialogs and menus.
  const toastLayer = (
    <div
      className="pointer-events-none fixed left-1/2 top-6 z-[2147483647] flex w-max max-w-[min(480px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2"
      data-ace-native-overlay="overlap"
    >
      {items.map((it) => (
        <div
          key={it.id}
          className="pointer-events-auto flex min-w-0 items-start gap-2.5 rounded-lg border border-border bg-surface px-4 py-3 font-sans text-[13px] font-medium text-fg ace-shadow-lg animate-[ace-pulse_.18s_ease-out] motion-reduce:animate-none"
          role="status"
        >
          <span
            className={clsx(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
              it.kind === 'ok' ? 'bg-ok text-white' : it.kind === 'err' ? 'bg-danger text-white' : 'text-fg-mute',
            )}
            aria-hidden="true"
          >
            <VsIcon
              name={it.kind === 'ok' ? 'check' : it.kind === 'err' ? 'close' : 'info'}
              size={it.kind === 'ok' || it.kind === 'err' ? 12 : 20}
              className={it.kind === 'ok' || it.kind === 'err' ? 'brightness-0 invert' : ''}
            />
          </span>
          <span className="min-w-0 whitespace-pre-wrap leading-5 [overflow-wrap:anywhere]">{it.text}</span>
        </div>
      ))}
    </div>
  );

  return typeof document === 'undefined'
    ? toastLayer
    : createPortal(toastLayer, document.body);
}
