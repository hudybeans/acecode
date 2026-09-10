const MAX_ENTRIES = 512;
const MAX_BYTES = 8 * 1024 * 1024;

// Count both retained source keys and highlighted HTML as UTF-16 strings.
// An entry limit also bounds the small Map/object overhead independently.
export function createMarkdownHighlightCache({
  maxEntries = MAX_ENTRIES,
  maxBytes = MAX_BYTES,
} = {}) {
  const entries = new Map();
  let retainedBytes = 0;

  const remove = (key) => {
    const entry = entries.get(key);
    if (!entry) return;
    retainedBytes -= entry.bytes;
    entries.delete(key);
  };

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key, value) {
      remove(key);
      const bytes = 2 * (key.length + value.html.length + value.lang.length);
      if (maxEntries < 1 || bytes > maxBytes) return;
      while (entries.size >= maxEntries || retainedBytes + bytes > maxBytes) {
        remove(entries.keys().next().value);
      }
      entries.set(key, { value, bytes });
      retainedBytes += bytes;
    },
  };
}
