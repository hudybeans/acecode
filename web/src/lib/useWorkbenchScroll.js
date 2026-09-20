import { useLayoutEffect } from 'react';
import { sessionWorkbench } from './sessionWorkbench.js';

// DOM 被替换前保存位置。归属随 effect 捕获，后台卸载不会写到新会话。
export function useWorkbenchScroll(owner, field, ref, ready = true) {
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !ready) return undefined;
    const saved = sessionWorkbench.get(owner, field, null);
    const editor = node.matches('textarea') ? node : node.querySelector('textarea');
    if (saved) {
      node.scrollTop = saved.top || 0;
      node.scrollLeft = saved.left || 0;
      if (editor && Number.isInteger(saved.start)) {
        editor.setSelectionRange(saved.start, saved.end, saved.direction);
      }
    }
    const capture = () => {
      const next = { top: node.scrollTop, left: node.scrollLeft,
        ...(editor ? { start: editor.selectionStart, end: editor.selectionEnd, direction: editor.selectionDirection } : {}) };
      sessionWorkbench.set(owner, field, (previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    node.addEventListener('scroll', capture, true);
    node.addEventListener('select', capture, true);
    return () => {
      capture();
      node.removeEventListener('scroll', capture, true);
      node.removeEventListener('select', capture, true);
    };
  }, [owner, field, ref, ready]);
}
