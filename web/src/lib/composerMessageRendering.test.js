import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseSync } from '@babel/core';
import { transformWithEsbuild } from 'vite';
import * as composerContent from './composerContent.js';
import * as messageAttachments from './messageAttachments.js';
import * as desktopContext from './desktopContextMenu.js';
import { resolveLeadingSlashCommand } from './slashCommands.js';
import { extractSessionReferences, formatSessionReferenceToken } from './sessionReference.js';

function run(name, fn) { fn(); console.log(`[pass] ${name}`); }
const source = readFileSync(new URL('../components/Message.jsx', import.meta.url), 'utf8');
const ast = parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const body = ast.program.body.filter((node) => node.type !== 'ImportDeclaration').map((node) => node.declaration || node);
const transformed = await transformWithEsbuild(body.map((node) => source.slice(node.start, node.end)).join('\n'), 'Message.jsx', {
  loader: 'jsx', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
});
const commands = [{ name: 'review', kind: 'skill', description: 'Review source', path: '/skills/review/SKILL.md' }];
function compile(overrides = {}) {
  return vm.runInNewContext(`${transformed.code}; ({ Message, OrderedUserMessageBody });`, {
    React, ...React, ...composerContent, ...messageAttachments, ...desktopContext,
    useTranslation() {}, useSlashCommands: () => ({ commands }), resolveLeadingSlashCommand, extractSessionReferences,
    VsIcon: () => null, CommandGlyph: () => null, FileTypeIcon: () => null,
    ImageLightbox: () => null,
    AttachmentStrip: ({ contentParts = [] }) => React.createElement('aside', {}, contentParts.map((part, index) => (
      React.createElement('span', { key: index }, part.attachment?.name || part.context?.label || '')
    ))),
    ...overrides,
  });
}
const { Message } = compile();
const ordered = { version: 1, parts: [
  { type: 'text', text: 'first ' },
  { type: 'skill', name: 'review', token: '$review', path: '/skills/review/SKILL.md' },
  { type: 'text', text: ' second ' },
  { type: 'path', path: 'src/a.cpp', token: '@src/a.cpp' },
  { type: 'text', text: ' third ' },
  { type: 'attachment', key: 'local-a', id: 'a', name: 'diagram.png', kind: 'image' },
  { type: 'text', text: ' last' },
] };
const contentParts = [
  { type: 'image', attachment: { id: 'a', name: 'diagram.png', kind: 'image', mime_type: 'image/png', blob_url: '/image/blob', path: '/stored/diagram.png' } },
  { type: 'selection_context', context: { label: 'selected passage' } },
];
const render = (props = {}) => renderToStaticMarkup(React.createElement(Message, { role: 'user', showFooter: false, ...props }));

run('actual sent message renders references between the original words without duplicate attachments', () => {
  const html = render({ content: 'wire text', composerContent: ordered, contentParts });
  const positions = ['first ', '>review<', ' second ', '>src/a.cpp<', ' third ', '>diagram.png<', ' last'].map((part) => html.indexOf(part));
  assert.ok(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])));
  assert.equal((html.match(/>diagram.png</g) || []).length, 1);
  assert.match(html, /selected passage/);
  assert.match(html, /data-desktop-attachment-preview-url="\/image\/blob"/);
  assert.doesNotMatch(html, /wire text/);
});

run('persisted metadata and attachment-only prompts render through the same ordered path', () => {
  const html = render({ metadata: { composer_content: ordered }, contentParts });
  assert.match(html, /first /);
  assert.match(html, / last/);
  const attachmentOnly = render({ composerContent: { version: 1, parts: [ordered.parts[5]] }, contentParts: [contentParts[0]] });
  assert.match(attachmentOnly, /ace-user-message-bubble/);
  assert.equal((attachmentOnly.match(/>diagram.png</g) || []).length, 1);
});

run('ordered session references use readable titles before and after inline references without exposing encoded payloads', () => {
  const first = formatSessionReferenceToken({ id: 'session-a', title: 'Earlier task', workspace_hash: 'workspace-a' });
  const second = formatSessionReferenceToken({ id: 'session-b', title: '<script>Task</script>', workspace_hash: 'workspace-b' });
  const composerContent = { version: 1, parts: [
    { type: 'text', text: `Read ${first}with ` },
    ordered.parts[1],
    { type: 'text', text: ` and ${second}then ` },
    ordered.parts[5],
    { type: 'text', text: ' without changing @session:%not-valid' },
  ] };
  for (const props of [{ composerContent }, { metadata: { composer_content: composerContent } }]) {
    const html = render({ ...props, contentParts });
    assert.match(html, /Read @Earlier task with /);
    assert.match(html, / and @&lt;script&gt;Task&lt;\/script&gt; then /);
    assert.doesNotMatch(html, /@session:%7B|session-a|session-b|<script>/);
    assert.match(html, />review</);
    assert.match(html, />diagram.png</);
    assert.match(html, /without changing @session:%not-valid/);
  }
});

run('legacy and unsupported metadata retain existing slash display and attachment placement', () => {
  for (const metadata of [undefined, { composer_content: { version: 2, parts: ordered.parts } }]) {
    const html = render({ content: '/review hello', contentParts: [contentParts[0]], metadata });
    assert.match(html, />review</);
    assert.match(html, / hello/);
    assert.ok(html.indexOf('diagram.png') < html.indexOf('ace-user-message-bubble'));
  }
  const structured = render({ composerContent: composerContent.composerContentFromText('/review hello') });
  assert.match(structured, />review</);
  assert.match(structured, / hello/);
});

run('optimistic pending attachment is rendered once by stable key while other unreferenced resources stay visible', () => {
  const html = render({ composerContent: { version: 1, parts: [
    { type: 'text', text: 'before ' },
    { type: 'attachment', key: 'pending-a', id: '', name: 'pending.png', kind: 'image' },
    { type: 'text', text: ' after' },
  ] }, contentParts: [
    { type: 'image', attachment: { local_id: 'pending-a', name: 'pending.png', preview_url: 'blob:pending-a', kind: 'image' } },
    { type: 'file', attachment: { local_id: 'extra-b', id: '', name: 'extra.txt', kind: 'file' } },
  ] });
  assert.equal((html.match(/>pending.png</g) || []).length, 1);
  assert.match(html, /data-desktop-attachment-preview-url="blob:pending-a"/);
  assert.match(html, /<aside><span>extra.txt<\/span><\/aside>/);
});

run('inline text and labels are escaped as React text', () => {
  const html = render({ composerContent: { version: 1, parts: [
    { type: 'text', text: '<script>alert(1)</script>' },
    { type: 'path', path: '<img onerror=bad>', token: '@bad' },
  ] } });
  assert.doesNotMatch(html, /<script|<img/);
  assert.match(html, /&lt;script&gt;/);
});

run('actual inline handlers preserve file, directory, image and desktop preview actions', () => {
  let preview;
  let file;
  let directory;
  let desktopHandler;
  const { OrderedUserMessageBody } = compile({
    useState: () => [null, (value) => { preview = value; }],
    useMemo: (factory) => factory(), useCallback: (handler) => handler,
    useEffect: (effect) => effect(),
    window: { addEventListener: (_event, handler) => { desktopHandler = handler; }, removeEventListener() {} },
  });
  const tree = OrderedUserMessageBody({ composerContent: { ...ordered, parts: [...ordered.parts,
    { type: 'path', path: 'src/', token: '@src/', directory: true },
  ] }, contentParts, onOpenFilePreview: (path) => { file = path; }, onLocateInFileTree: (path) => { directory = path; } });
  const buttons = tree.props.children[0].filter((child) => child?.type === 'button');
  buttons.find((child) => child.props['data-file-path'] === 'src/a.cpp').props.onClick();
  assert.equal(file, 'src/a.cpp');
  buttons.find((child) => child.props['data-file-path'] === 'src/').props.onClick();
  assert.equal(directory, 'src/');
  buttons.find((child) => child.props['data-desktop-attachment-id'] === 'a').props.onClick();
  assert.equal(preview.src, '/image/blob');
  preview = null;
  const detail = { action: desktopContext.DESKTOP_CONTEXT_ACTIONS.PREVIEW_ATTACHMENT, target: { type: 'attachment', id: 'a' } };
  desktopHandler({ detail });
  assert.equal(detail.handled, true);
  assert.equal(preview.src, '/image/blob');
});
