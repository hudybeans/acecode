#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { INTERFACE_ICONS, interfaceIconSvg } from '../web/src/lib/interfaceIcons.js';

const output = process.argv.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
if (!output) throw new Error('Usage: node scripts/preview_web_icons.mjs --output=<file.html>');
const names = Object.keys(INTERFACE_ICONS).sort();
const items = names.map((name) => {
  const svg = interfaceIconSvg(name);
  const samples = [16, 20, 24].map((size) => `<div>${interfaceIconSvg(name, size)}<small>${size}</small></div>`).join('');
  return `<article data-name="${name.toLowerCase()}"><div class="large">${svg}</div><h2>${name}</h2><div class="samples">${samples}</div><a download="${name}.svg" href="data:image/svg+xml,${encodeURIComponent(svg)}">SVG</a></article>`;
}).join('\n');

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ACECode 图标总览</title>
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color-scheme:light;--bg:#f8f8f6;--panel:#fff;--fg:#282823;--muted:#6d6d65;--border:#deded8;--accent:#366d82;--hover:#edf0ef}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg)}main{max-width:1440px;margin:auto;padding:35px 40px}header{display:flex;align-items:start;justify-content:space-between;gap:24px}h1{font-size:27px;font-weight:600;margin:0 0 12px}p{font-size:13px;line-height:1.85;margin:0;color:var(--muted)}.rules{display:flex;gap:28px;flex-wrap:wrap;margin:24px 0;padding:15px 0;border-block:1px solid var(--border);font-size:12px}.rules b{display:block;font-size:15px;font-weight:600;margin-bottom:5px}.rules span{color:var(--muted)}.toolbar{display:flex;gap:12px;align-items:center;margin:0 0 20px}input{font:inherit;font-size:13px;padding:9px 11px;width:280px;max-width:70%;color:var(--fg);background:var(--panel);border:1px solid var(--border);border-radius:6px}input::placeholder{color:var(--muted)}button{font:inherit;font-size:12px;cursor:pointer;border:1px solid var(--border);padding:9px 13px;border-radius:6px;color:var(--fg);background:var(--panel)}button:hover{background:var(--hover)}:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.count{margin-left:auto;font-size:12px;color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:14px}article{position:relative;text-align:center;border:1px solid var(--border);border-radius:9px;background:var(--panel);padding:15px 9px 12px;min-width:0}.large{height:83px;display:flex;align-items:center;justify-content:center}.large svg{width:64px;height:64px}h2{font-weight:500;font-size:10px;line-height:1.5;margin:9px 0 15px;overflow-wrap:anywhere;min-height:15px}.samples{display:flex;justify-content:space-around;align-items:start}.samples>div{height:48px;display:flex;flex-direction:column;align-items:center;justify-content:start;position:relative}.samples small{position:absolute;top:30px;font-size:10px;color:var(--muted)}article a{display:block;font-size:10px;margin-top:8px;color:var(--accent);text-decoration:none}article a:hover{text-decoration:underline}article[hidden]{display:none}footer{padding:23px 0 0;font-size:11px;color:var(--muted);line-height:1.8}body[data-theme=dark]{color-scheme:dark;--bg:#202220;--panel:#282b28;--fg:#eceee7;--muted:#abb0a5;--border:#454a43;--accent:#89bfd0;--hover:#343c37}body[data-theme=accent] article{color:var(--accent)}.empty{display:none;color:var(--muted);padding:30px 0}@media(max-width:1100px){.grid{grid-template-columns:repeat(6,minmax(0,1fr))}}@media(max-width:780px){main{padding:25px 20px}.grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:480px){main{padding:23px 14px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}header{display:block}header button{margin-top:15px}.toolbar{flex-wrap:wrap}h1{font-size:23px}.rules{gap:19px}.count{margin-left:0}}
</style></head><body><main>
<header><div><h1>ACECode 图标总览</h1><p>108 个操作、导航与状态图标，统一重绘为细线、圆端点和柔和折角。<br>每枚图标均可下载。品牌 Logo、Seti / PPTX 文件类型图标保持原样。</p></div><button id="theme" type="button">切换深色</button></header>
<div class="rules"><div><b>20 × 20</b><span>统一矢量坐标与视觉留白</span></div><div><b>16 / 20 / 24 px</b><span>常规线宽 1 / 1.2 / 1.4 px</span></div><div><b>currentColor</b><span>颜色由控件决定，源文件无固定色</span></div></div>
<div class="toolbar"><input id="search" type="search" placeholder="搜索图标名称" aria-label="搜索图标名称"><button id="color" type="button" aria-pressed="false">验证继承颜色</button><span class="count">显示 <b id="count">${names.length}</b> / ${names.length}</span></div>
<section class="grid">${items}</section><p class="empty" id="empty">没有匹配的图标。</p>
<footer>上方为 20 px 原型的放大观察图；下方为 16 / 20 / 24 CSS px 的实际尺寸。导出文件为 20 px 常规档。<br>图形为 ACECode 自有绘制；参考 Claude 图标的线宽、圆角与留白，不包含 Claude 的字体或提取路径。</footer>
</main><script>
let dark=false,color=false;const filter=document.querySelector('#search');
filter.addEventListener('input',()=>{let count=0;document.querySelectorAll('article').forEach(e=>{e.hidden=!e.dataset.name.includes(filter.value.trim().toLowerCase());if(!e.hidden)count++});document.querySelector('#count').textContent=count;document.querySelector('#empty').style.display=count?'none':'block'});
document.querySelector('#theme').onclick=()=>{dark=!dark;document.body.dataset.theme=dark?'dark':'';document.querySelector('#theme').textContent=dark?'切换浅色':'切换深色'};
document.querySelector('#color').onclick=()=>{color=!color;document.querySelectorAll('article').forEach(e=>e.style.color=color?'var(--accent)':'');document.querySelector('#color').setAttribute('aria-pressed',String(color))};
</script></body></html>`;
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, html.replace('108 个操作', `${names.length} 个操作`), 'utf8');
console.log(`Wrote ${names.length}-icon gallery to ${path.resolve(output)}`);
