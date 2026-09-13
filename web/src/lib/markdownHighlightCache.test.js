import assert from 'node:assert/strict';
import hljs from 'highlight.js/lib/core';
import { createMarkdownHighlightCache } from './markdownHighlightCache.js';
import { renderMarkdown, renderMarkdownBlocks } from './markdown.js';

function run(name, fn) {
  fn();
  console.log(`[pass] ${name}`);
}

const result = (html) => ({ lang: '', html });

run('highlight cache evicts least recently used entries by aggregate string bytes', () => {
  const cache = createMarkdownHighlightCache({ maxBytes: 40 });
  cache.set('a', result('123456789'));
  cache.set('b', result('123456789'));
  assert.ok(cache.get('a'));
  cache.set('c', result('123456789'));
  assert.equal(cache.get('b'), undefined);
  assert.ok(cache.get('a'));
  assert.ok(cache.get('c'));
});

run('highlight cache counts source keys and UTF-16 code units', () => {
  const cache = createMarkdownHighlightCache({ maxBytes: 8 });
  cache.set('😀', result('字'));
  assert.ok(cache.get('😀'));
  cache.set('a', result('b'));
  assert.equal(cache.get('😀'), undefined);
  assert.ok(cache.get('a'));
  cache.set('large-source', result(''));
  assert.equal(cache.get('large-source'), undefined);
  assert.ok(cache.get('a'));
});

run('oversized highlights bypass caching without flushing useful entries', () => {
  const cache = createMarkdownHighlightCache({ maxBytes: 20 });
  cache.set('a', result('small'));
  cache.set('b', result('x'.repeat(20)));
  assert.equal(cache.get('b'), undefined);
  assert.ok(cache.get('a'));
});

run('replacing a highlight releases its former byte accounting', () => {
  const cache = createMarkdownHighlightCache({ maxBytes: 40 });
  cache.set('a', result('x'.repeat(19)));
  cache.set('a', result('small'));
  cache.set('b', result('small'));
  assert.equal(cache.get('a').html, 'small');
  assert.equal(cache.get('b').html, 'small');
});

run('highlight cache retains its independent entry-count limit', () => {
  const cache = createMarkdownHighlightCache({ maxEntries: 2 });
  cache.set('a', result(''));
  cache.set('b', result(''));
  cache.set('c', result(''));
  assert.equal(cache.get('a'), undefined);
  assert.ok(cache.get('b'));
  assert.ok(cache.get('c'));
});

run('unfinished fences are not cached and closed fences reuse identical highlighted output', () => {
  const originalHighlight = hljs.highlight;
  let calls = 0;
  hljs.highlight = (...args) => {
    calls += 1;
    return originalHighlight(...args);
  };
  try {
    const unfinished = '```js\nconst memoryCacheRegression = 20260910;\n';
    const finished = `${unfinished}\u0060\u0060\u0060`;
    const first = renderMarkdown(unfinished);
    assert.equal(renderMarkdownBlocks(unfinished).map((block) => block.html).join(''), first);
    assert.equal(calls, 2);
    assert.equal(renderMarkdown(finished), first);
    assert.equal(calls, 3);
    assert.equal(renderMarkdownBlocks(finished).map((block) => block.html).join(''), first);
    assert.equal(calls, 3);
    assert.equal(renderMarkdown(unfinished), first);
    assert.equal(calls, 4);
  } finally {
    hljs.highlight = originalHighlight;
  }
});
