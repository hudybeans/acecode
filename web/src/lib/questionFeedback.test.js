import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseSync } from '@babel/core';
import { transformWithEsbuild } from 'vite';
import * as format from './format.js';
import { compactOneLinePreview } from './compactMessagePreview.js';
import { createdFileSource } from './createdFileSource.js';
import { normalizeAttachmentList } from './messageAttachments.js';
import { fallbackToolSummary } from './toolSummaryFallback.js';
import { questionFeedbackForItem, questionFeedbackForTool } from './questionFeedback.js';

function run(name, fn) {
  fn();
  console.log(`[pass] ${name}`);
}

// Compile the real shared ToolBlock, including its feedback branch and Q/A
// card. Only unrelated icon/markdown surfaces are substituted in this fixture.
const source = readFileSync(new URL('../components/ToolBlock.jsx', import.meta.url), 'utf8');
const ast = parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const body = ast.program.body.filter((node) => node.type !== 'ImportDeclaration')
  .map((node) => node.declaration || node);
const transformed = await transformWithEsbuild(
  body.map((node) => source.slice(node.start, node.end)).join('\n'),
  'ToolBlock.jsx',
  { loader: 'jsx', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment' },
);
const { ToolBlock } = vm.runInNewContext(`${transformed.code}; ({ ToolBlock });`, {
  React, ...React, ...format,
  compactOneLinePreview, createdFileSource, normalizeAttachmentList,
  fallbackToolSummary, questionFeedbackForTool,
  useTranslation() {},
  renderMarkdown: () => '',
  VsIcon: () => null,
  ToolSummaryIcon: () => null,
  ActivityLine: ({ label }) => React.createElement('span', null, label),
});

export function renderQuestionToolForTest(entry) {
  return renderToStaticMarkup(React.createElement(ToolBlock, { entry, sessionRunning: false }));
}

const answered = {
  isDone: true, success: true, tool: 'AskUserQuestion',
  askUserQuestionResult: { items: [{ question: 'Which path?', answer: 'src/index.js' }] },
};

run('共享 ToolBlock 为成功答案渲染且仅渲染一张确认卡', () => {
  const html = renderQuestionToolForTest(answered);
  assert.equal((html.match(/data-question-feedback="submit"/g) || []).length, 1);
  assert.match(html, /Which path\?/);
  assert.match(html, /src\/index\.js/);
  assert.match(html, /aria-expanded="true"/);
  assert.doesNotMatch(html, /data-question-feedback="cancel"/);
});

run('共享 ToolBlock 为失败状态的显式取消渲染取消卡并忽略残留答案', () => {
  const entry = {
    ...answered, success: false,
    askUserQuestionResult: { cancelled: true, items: answered.askUserQuestionResult.items },
  };
  assert.deepEqual(questionFeedbackForTool(entry), { kind: 'cancel', items: [] });
  const html = renderQuestionToolForTest(entry);
  assert.equal((html.match(/data-question-feedback="cancel"/g) || []).length, 1);
  assert.match(html, /已取消全部回答/);
  assert.doesNotMatch(html, /data-question-feedback="submit"|ace-qa-question|已确认/);
  assert.match(html, /data-desktop-tool-toggle="false"/);
});

run('运行中、普通失败和无结构化结果不展示答题成功反馈', () => {
  for (const entry of [
    { ...answered, isDone: false },
    { ...answered, success: false },
    { ...answered, askUserQuestionResult: null },
    { ...answered, askUserQuestionResult: { items: [] } },
  ]) assert.equal(questionFeedbackForTool(entry), null);
  const html = renderQuestionToolForTest({ ...answered, success: false });
  assert.doesNotMatch(html, /data-question-feedback/);
  assert.equal(questionFeedbackForItem({ kind: 'msg', tool: answered }), null);
});

run('工具改名或缺少调用名时结构化取消仍可渲染', () => {
  for (const tool of ['', 'request_input']) {
    const entry = { isDone: true, success: false, tool, askUserQuestionResult: { cancelled: true, items: [] } };
    assert.equal(questionFeedbackForItem({ kind: 'tool', tool: entry })?.kind, 'cancel');
    assert.match(renderQuestionToolForTest(entry), /data-question-feedback="cancel"/);
  }
});
