import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseSync } from '@babel/core';
import { transformWithEsbuild } from 'vite';
import { DOMParser } from '@xmldom/xmldom';
import { controlIcons } from './icons/controls.js';
import { systemIcons } from './icons/system.js';
import { ICON_VIEW_BOX, INTERFACE_ICONS, iconStrokePixels, iconStrokeWidth, interfaceIconSvg } from './interfaceIcons.js';
import { fileTypeIconForPath } from './fileTypeIcons.js';

function run(name, fn) { fn(); console.log(`[pass] ${name}`); }

run('functional icon sources share one grid and allow only inherited paint', () => {
  assert.equal(ICON_VIEW_BOX, 20);
  assert.deepEqual(Object.keys(controlIcons).filter((name) => Object.hasOwn(systemIcons, name)), []);
  const allowedTags = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
  for (const [name, shapes] of Object.entries(INTERFACE_ICONS)) {
    assert.ok(shapes.length, name);
    for (const [tag, attrs] of shapes) {
      assert.ok(allowedTags.has(tag), `${name}: unsupported element ${tag}`);
      for (const [key, value] of Object.entries(attrs)) {
        if (key === 'fill' || key === 'stroke') assert.ok(['currentColor', 'none'].includes(value), `${name}: fixed paint`);
        assert.ok(!['style', 'className', 'strokeWidth', 'href', 'mask', 'filter', 'clipPath'].includes(key), `${name}: renderer owns ${key}`);
        assert.doesNotMatch(String(value), /NaN|Infinity|url\(|#[0-9a-f]{3,8}\b/i, `${name}: invalid or external geometry`);
      }
    }
  }
});

run('all public functional SVGs are complete deterministic exports', () => {
  const dir = new URL('../../public/vs-icons/', import.meta.url);
  const files = readdirSync(dir).filter((file) => file.endsWith('.svg')).sort();
  assert.deepEqual(files, Object.keys(INTERFACE_ICONS).map((name) => `${name}.svg`).sort());
  for (const file of files) {
    const name = file.slice(0, -4);
    const source = readFileSync(new URL(file, dir), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(source, interfaceIconSvg(name), `${name}: regenerate the assets`);
    const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
    assert.equal(svg.tagName, 'svg');
    assert.equal(svg.getAttribute('viewBox'), '0 0 20 20');
    assert.equal(svg.getAttribute('stroke'), 'currentColor');
    assert.equal(svg.getAttribute('stroke-linecap'), 'round');
    assert.equal(svg.getAttribute('stroke-linejoin'), 'round');
    for (const node of Array.from(svg.getElementsByTagName('*'))) {
      for (const paint of ['fill', 'stroke']) {
        const value = node.getAttribute(paint);
        if (value) assert.ok(['none', 'currentColor'].includes(value), `${name}: ${paint}`);
      }
    }
  }
});

run('optical stroke targets remain consistent at normal and intermediate sizes', () => {
  for (const [size, expected] of [[12, .8], [14, .9], [16, 1], [18, 1.1], [20, 1.2], [24, 1.4], [28, 1.6], [32, 1.8]]) {
    assert.ok(Math.abs(iconStrokePixels(size) - expected) < 1e-8);
    assert.ok(Math.abs(iconStrokeWidth(size) * size / 20 - expected) < 1e-6);
  }
  assert.equal(iconStrokePixels(16, true), 1.25);
  assert.equal(iconStrokePixels(20, true), 1.5);
  for (const invalid of [0, -1, NaN, Infinity, 'bad']) assert.equal(iconStrokeWidth(invalid), iconStrokeWidth(16));
});

const source = readFileSync(new URL('../components/Icon.jsx', import.meta.url), 'utf8');
const ast = parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } });
const body = ast.program.body.filter((node) => node.type !== 'ImportDeclaration').map((node) => node.declaration || node);
const compiled = await transformWithEsbuild(body.map((node) => source.slice(node.start, node.end)).join('\n'), 'Icon.jsx', { loader: 'jsx', jsxFactory: 'React.createElement' });
const { VsIcon, FileTypeIcon, PanelToggleIcon, ICONS } = vm.runInNewContext(`${compiled.code}; ({ VsIcon, FileTypeIcon, PanelToggleIcon, ICONS });`, {
  React, createElement: React.createElement, fileTypeIconForPath, ICON_VIEW_BOX, INTERFACE_ICONS, iconStrokeWidth,
  // Known icons must render even in environments without CSS masks.
  CSS: { supports: () => false },
});

run('every semantic alias and direct registry name renders a real currentColor SVG', () => {
  for (const [alias, file] of Object.entries(ICONS)) assert.ok(INTERFACE_ICONS[file], `${alias}: missing ${file}`);
  for (const name of [...Object.keys(ICONS), ...Object.keys(INTERFACE_ICONS)]) {
    const html = renderToStaticMarkup(React.createElement(VsIcon, { name, size: 16, mono: false }));
    assert.match(html, /class="ace-icon-svg"/);
    assert.match(html, /stroke="currentColor"/);
    assert.match(html, /stroke-width:1.25/);
    assert.doesNotMatch(html, /<img|ace-icon-fallback/);
    assert.match(html, /aria-hidden="true"/);
  }
});

run('shared icons preserve size, caller color, accessibility and panel state', () => {
  const html = renderToStaticMarkup(React.createElement(VsIcon, { name: 'search', size: 20, alt: 'Search', style: { color: 'rebeccapurple' }, 'data-test': 'retained' }));
  assert.match(html, /width:20px;height:20px;color:rebeccapurple/);
  assert.match(html, /role="img" aria-label="Search"/);
  assert.match(html, /data-test="retained"/);
  assert.match(html, /stroke-width:1.2/);
  for (const side of ['left', 'right', 'bottom']) {
    const open = renderToStaticMarkup(React.createElement(PanelToggleIcon, { side, expanded: true }));
    const closed = renderToStaticMarkup(React.createElement(PanelToggleIcon, { side, expanded: false }));
    assert.match(open, /(?:path|rect)[^>]+fill="currentColor"/);
    assert.doesNotMatch(closed, /(?:path|rect)[^>]+fill="currentColor"/);
  }
  assert.equal(INTERFACE_ICONS.Swarm.length, 7);
  assert.equal(INTERFACE_ICONS.Swarm.filter(([, a]) => a.fill === 'currentColor').length, 1);
  assert.equal(INTERFACE_ICONS.Swarm[0][1].fillOpacity, .14);
});

run('file-type and PPTX artwork remains on its existing independent renderer', () => {
  const js = renderToStaticMarkup(React.createElement(FileTypeIcon, { path: 'index.js' }));
  const pptx = renderToStaticMarkup(React.createElement(FileTypeIcon, { path: 'slides.pptx' }));
  assert.match(js, /data-file-type-icon="_javascript"/);
  assert.match(js, /color:/);
  assert.match(pptx, /class="ace-pptx-file-icon"/);
  assert.match(pptx, /fill="#c84c2f"/);
});
