import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseSync } from '@babel/core';
import { transformWithEsbuild } from 'vite';
import { presentSystemNotice } from './systemNotice.js';
import { tr } from '../i18n/index.js';
import { clsx } from './format.js';

async function loadComponent(file, name, dependencies = {}) {
  const source = readFileSync(new URL(`../components/${file}`, import.meta.url), 'utf8');
  const ast = parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
  const declaration = ast.program.body.map((node) => node.declaration || node)
    .find((node) => node.type === 'FunctionDeclaration' && node.id.name === name);
  assert.ok(declaration, `${name} must be tested from the production component`);
  const compiled = await transformWithEsbuild(source.slice(declaration.start, declaration.end), file, {
    loader: 'jsx', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
  });
  return vm.runInNewContext(`${compiled.code}; ${name};`, {
    React, ...React, clsx, ...dependencies,
  });
}

const VsIcon = ({ name }) => React.createElement('svg', { 'data-icon': name });
const ActivityLine = await loadComponent('ActivityLine.jsx', 'ActivityLine', { VsIcon });
const CopyableCodeFrame = await loadComponent('CopyableCodeFrame.jsx', 'CopyableCodeFrame', { VsIcon });
const SystemRow = await loadComponent('Message.jsx', 'SystemRow', {
  ActivityLine, CopyableCodeFrame, VsIcon, presentSystemNotice, useTranslation: () => ({ t: tr }),
});
const renderNotice = (props = {}) => renderToStaticMarkup(React.createElement(SystemRow, {
  role: 'system', messageAutoCollapse: true, ...props,
}));

function run(name, fn) {
  fn();
  console.log(`[pass] ${name}`);
}

run('系统提示收起时只显示信息图标、主标题和可访问的展开入口', () => {
  const html = renderNotice({ content: '[Goal] Started: ces ces sd asfd fasd' });
  assert.match(html, /data-unified-activity-line="true"/);
  assert.match(html, /data-icon="info"/);
  assert.match(html, /目标开始/);
  assert.match(html, /role="button"/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /\[Goal\]|ces ces|字符|border-dashed|data-code-copy-frame/);
});

run('完成的压缩通知保留主标题，默认隐藏详细原文', () => {
  const html = renderNotice({
    content: 'Tokens before: 12000\nTokens after: 3000',
    metadata: { compact_notice: true, compact_notice_complete: true },
  });
  assert.match(html, /上下文已压缩/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /Tokens before|Tokens after/);
});

run('进行中的压缩通知同样默认收起', () => {
  const html = renderNotice({
    content: 'Preparing context\nWaiting for summary',
    metadata: { compact_notice: true, compact_notice_complete: false },
  });
  assert.match(html, /正在压缩上下文/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /Preparing context|Waiting for summary/);
});

run('关闭自动折叠后系统提示仍独立收起，完整正文留在展示模型中', () => {
  const content = `First line\n${'完整内容 '.repeat(400)}\nLast line`;
  const html = renderNotice({ content, messageAutoCollapse: false });
  assert.equal(presentSystemNotice({ content }).text, content);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /Last line|data-code-copy-frame/);
});

run('空内容的系统提示保留主标题但不展示无效展开和复制入口', () => {
  for (const content of ['', ' \n ', null]) {
    const html = renderNotice({ content });
    assert.match(html, /系统信息/);
    assert.match(html, /data-activity-expandable="false"/);
    assert.doesNotMatch(html, /role="button"|aria-expanded|data-icon="expandDown"|data-code-copy-frame/);
  }
});

run('自定义主标题和插话语义保留，更多信息仍放入展开区', () => {
  const custom = renderNotice({ content: 'Detailed result', metadata: { compact_label: '恢复结果' } });
  assert.match(custom, /恢复结果/);
  assert.doesNotMatch(custom, /Detailed result/);
  const interjected = renderNotice({ content: '[Interjected]' });
  assert.match(interjected, /插话中断/);
  assert.doesNotMatch(interjected, /\[Interjected\]/);
});
