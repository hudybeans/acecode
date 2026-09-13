import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { renderMarkdown, renderMarkdownBlocks, renderMarkdownInline } from './markdown.js';

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

function swatches(html) {
  return [...html.matchAll(/data-hex-color-swatch="(#[\da-fA-F]{6})"/g)].map((match) => match[1]);
}

run('color previews work in prose, headings, lists, quotes, and inline rendering', () => {
  const source = '# Palette #7C3AED\n\nColors #111111 and #f2f2f2.\n\n- #B7EF65\n\n> #EEE6FE';
  assert.deepEqual(swatches(renderMarkdown(source)), ['#7C3AED', '#111111', '#f2f2f2', '#B7EF65', '#EEE6FE']);
  assert.deepEqual(swatches(renderMarkdownInline('Colors #111111 and #f2f2f2.')), ['#111111', '#f2f2f2']);
});

run('palette tables preserve inline code styling and add exactly one swatch per value', () => {
  const source = '| Role | Color |\n| --- | --- |\n| Accent | `#7C3AED` |\n| Send | `#B7EF65` |\n| Sidebar | `#EEE6FE` |';
  const html = renderMarkdown(source);
  assert.match(html, /<table>/);
  assert.deepEqual(swatches(html), ['#7C3AED', '#B7EF65', '#EEE6FE']);
  for (const color of swatches(html)) {
    assert.ok(html.includes(`<code>${color}</code><span class="ace-md-hex-swatch"`), html);
    assert.ok(html.includes(`style="background-color:${color}"`), html);
  }
  assert.deepEqual(swatches(renderMarkdownInline('主题色：`#7C3AED`')), ['#7C3AED']);
});

run('swatches do not change visible or copyable text or add focusable content', () => {
  const html = renderMarkdownInline('颜色 #7C3AED 和 `#b7ef65`。');
  const document = new DOMParser().parseFromString(`<main>${html}</main>`, 'text/html');
  assert.equal(document.documentElement.textContent, '颜色 #7C3AED 和 #b7ef65。');
  const previews = [...document.getElementsByTagName('span')]
    .filter((span) => span.hasAttribute('data-hex-color-swatch'));
  assert.equal(previews.length, 2);
  for (const preview of previews) {
    assert.equal(preview.textContent, '');
    assert.equal(preview.getAttribute('aria-hidden'), 'true');
    assert.equal(preview.hasAttribute('tabindex'), false);
  }
});

run('incomplete, invalid, alpha-channel, and embedded color-like strings stay undecorated', () => {
  for (const source of [
    '#fff', '#ffff', '#12345', '#11223344', '#1234567', '#gggggg',
    'value#112233', '#112233_suffix', '#112233g', '##112233',
    '`#fff`', '`#11223344`', '`color: #7C3AED`', '`#7C3AED #B7EF65`',
    'value**#112233**', '#112233**suffix**',
  ]) {
    assert.deepEqual(swatches(renderMarkdown(source)), [], source);
  }
});

run('links, URL fragments, and image attributes never contain color previews', () => {
  const source = '[#7C3AED](https://example.com/#7C3AED)\n\n'
    + '[`#B7EF65`](docs/palette.md)\n\n'
    + '![#EEE6FE](image.png "#FFFFFF")\n\nhttps://example.com/#112233';
  const html = renderMarkdown(source);
  assert.deepEqual(swatches(html), []);
  assert.match(html, /href="https:\/\/example.com\/#7C3AED"/);
  assert.match(html, /data-file-path="docs\/palette.md"/);
  assert.match(html, /alt="#EEE6FE"/);
  assert.match(html, /title="#FFFFFF"/);
});

run('fenced and indented code keep their existing highlighting and copy source', () => {
  const source = '```css\ncolor: #7C3AED;\n```\n\n    #B7EF65\n\n```js\nconst color = "#EEE6FE";\n```';
  const html = renderMarkdown(source);
  assert.deepEqual(swatches(html), []);
  const document = new DOMParser().parseFromString(`<main>${html}</main>`, 'text/html');
  const copySources = [...document.getElementsByTagName('code')]
    .filter((code) => code.hasAttribute('data-code-copy-source'));
  assert.deepEqual(copySources.map((code) => code.textContent), [
    'color: #7C3AED;\n', 'const color = "#EEE6FE";\n',
  ]);
  assert.match(html, /<pre><code>#B7EF65/);
  assert.match(html, /language-javascript/);
});

run('issue and PR references are excluded across inline formatting', () => {
  for (const source of [
    'Issue #123456', 'PR #abcdef', 'PRs #123456 and #654321',
    'issue **#123456**', '**PR** `#abcdef`', 'Issue: `#123456`',
  ]) {
    assert.deepEqual(swatches(renderMarkdown(source)), [], source);
  }
  assert.deepEqual(swatches(renderMarkdown('Issue #123456\n\nPalette #123456')), ['#123456']);
  assert.deepEqual(swatches(renderMarkdown('Palette #123456')), ['#123456']);
});

run('HTML and attribute injection stay escaped beside valid colors', () => {
  const html = renderMarkdown('#7C3AED <script>alert(1)</script>\n\n#B7EF65" onmouseover="alert(1)');
  assert.deepEqual(swatches(html), ['#7C3AED', '#B7EF65']);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&quot; onmouseover=&quot;alert\(1\)/);
  assert.doesNotMatch(html, /<script|<[^>]+onmouseover=/);
});

run('streaming color previews match whole rendering and preserve finished prefix blocks', () => {
  const prefix = 'First #111111.\n\n| Role | Color |\n| --- | --- |\n| Accent | `#7C3AED` |\n\n';
  const before = renderMarkdownBlocks(`${prefix}Next #B7EF6`);
  const after = renderMarkdownBlocks(`${prefix}Next #B7EF65`);
  assert.equal(after.map((block) => block.html).join(''), renderMarkdown(`${prefix}Next #B7EF65`));
  assert.deepEqual(before.slice(0, -1), after.slice(0, -1));
  assert.deepEqual(swatches(before.at(-1).html), []);
  assert.deepEqual(swatches(after.at(-1).html), ['#B7EF65']);
  const alpha = renderMarkdownBlocks(`${prefix}Next #B7EF6500`);
  assert.deepEqual(swatches(alpha.at(-1).html), []);
});
