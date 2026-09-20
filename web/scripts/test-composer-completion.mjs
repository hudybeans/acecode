import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

// Real InputBar regression, with deterministic completion APIs and no daemon.
// Use the same optional Playwright setup as test-composer-selection.mjs.
const web = fileURLToPath(new URL('../', import.meta.url));
const modulePath = process.env.ACE_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(path.resolve(modulePath)).href : 'playwright');
const port = Number(process.env.ACE_COMPOSER_COMPLETION_TEST_PORT || 5190);
const baseline = process.argv.includes('--baseline');
const baselineSources = new Map(baseline ? [
  'src/components/InputBar.jsx', 'src/components/PathReferenceDropdown.jsx', 'src/components/SlashDropdown.jsx',
].map(relative => [path.join(web, relative).replaceAll('\\', '/'), execFileSync('git', ['show', 'HEAD:web/' + relative], { cwd: web, encoding: 'utf8' })]) : []);
const fixture = `
import React, {useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {InputBar} from '/src/components/InputBar.jsx';
import {SlashCommandsProvider} from '/src/components/SlashCommandsContext.jsx';
import {composerContentText} from '/src/lib/composerContent.js';
import '/src/styles/globals.css';
const files = {listFiles: async (_cwd, directory) => directory ? [] : [
 {name:'src',path:'src',kind:'dir'}, {name:'notes.txt',path:'notes.txt',kind:'file'},
]};
window.__ACECODE_DESKTOP_SHELL__ = true;
function Fixture() {
 const ref = useRef();
 window.fixture = {
  get value(){return composerContentText(ref.current?.getComposerContent());},
  addAttachment(){ref.current?.setComposerContent({version:1,parts:[
   {type:'text',text:'@'},
   {type:'attachment',key:'file-1',id:'file-1',name:'notes.txt',kind:'file'},
  ]});},
 };
 return <main style={{padding:'220px 32px',maxWidth:1000,margin:'auto'}}>
  <SlashCommandsProvider><InputBar ref={ref} cwd="C:/fixture" pathReferenceApi={files} /></SlashCommandsProvider>
 </main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
const html = `<html><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;
window.__vite_plugin_react_preamble_installed__=true;
</script><script type="module" src="/__composer-completion.jsx"></script></body></html>`;
const virtual = path.join(web, '__composer-completion.jsx').replaceAll('\\', '/');
const server = await createServer({
  root: web, configFile: path.join(web, 'vite.config.js'), logLevel: 'error',
  plugins: [{ name: 'composer-completion-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/__composer-completion.jsx') return virtual; },
    load(id) { const normalized = id.replaceAll('\\', '/'); return normalized === virtual ? fixture : baselineSources.get(normalized); },
    configureServer(vite) { vite.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== '/__composer-completion') return next();
      res.setHeader('Content-Type', 'text/html'); res.end(html);
    }); },
  }], server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
});
let browser;
let failed = 0;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.ACE_CHROMIUM_EXECUTABLE ? { executablePath: process.env.ACE_CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ commands: [], skills: [] }) }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const editor = page.locator('[data-ace-rich-composer]');
  const menu = page.getByRole('listbox');
  const settle = () => page.evaluate(() => new Promise(resolve => setTimeout(() => requestAnimationFrame(resolve), 160)));
  const value = () => page.evaluate(() => window.fixture.value);
  async function reset(text) {
    await page.goto('http://127.0.0.1:' + port + '/__composer-completion', {
      waitUntil: 'domcontentloaded', timeout: 60000,
    });
    await editor.waitFor({ state: 'visible', timeout: 60000 });
    await editor.click(); await page.keyboard.type(text); await settle();
    assert.equal(await menu.count(), 1, 'completion must be open before exercising its keys');
  }
  async function run(name, test) {
    try { await test(); console.log('[pass] ' + name); }
    catch (error) { failed += 1; console.error('[FAIL] ' + name + ': ' + error.message); }
  }
  for (const query of ['@', '/ini']) {
    await run(query + ' Shift+Home selects query and closes completion', async () => {
      await reset(query); await page.keyboard.press('Shift+Home'); await settle();
      assert.equal(await page.evaluate(() => window.getSelection().toString()), query);
      assert.equal(await menu.count(), 0);
    });
    await run(query + ' Ctrl+A selection closes completion', async () => {
      await reset(query); await page.keyboard.press('Control+a'); await settle();
      assert.equal(await menu.count(), 0); assert.equal(await value(), query);
    });
    await run(query + ' Ctrl+Home navigates to start', async () => {
      await reset(query); await page.keyboard.press('Control+Home'); await page.keyboard.type('X');
      assert.equal(await value(), 'X' + query);
    });
    await run(query + ' Shift+Enter inserts newline without accepting candidate', async () => {
      await reset(query); await page.keyboard.press('Shift+Enter'); await settle();
      assert.equal(await value(), query + '\n');
    });
    await run(query + ' IME Enter does not accept candidate', async () => {
      await reset(query); await editor.evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', isComposing: true, keyCode: 229, bubbles: true, cancelable: true,
      }))); await settle(); assert.equal(await value(), query);
    });
  }
  await run('Shift+Right beside directory candidate does not enter directory', async () => {
    await reset('@'); await page.keyboard.press('Shift+ArrowRight'); await settle(); assert.equal(await value(), '@');
  });
  await run('plain Tab still enters directory', async () => {
    await reset('@'); await page.keyboard.press('Tab'); await settle(); assert.equal(await value(), '@src/');
  });
  await run('plain Enter still references directory', async () => {
    await reset('@'); await page.keyboard.press('Enter'); await settle(); assert.equal(await value(), '@src/ ');
  });
  for (const key of ['Enter', 'Tab']) {
    await run('plain ' + key + ' still commits slash command', async () => {
      await reset('/ini'); await page.keyboard.press(key); await settle(); assert.equal(await value(), '/init ');
    });
  }
  await run('zero-length attachment selection closes reference completion', async () => {
    await reset('@'); await page.evaluate(() => window.fixture.addAttachment()); await settle();
    await editor.locator('[data-composer-inline-tag="attachment"] .ace-cmd-token-name').click(); await settle();
    assert.equal(await value(), '@'); assert.equal(await menu.count(), 0);
  });
  assert.deepEqual(errors, [], 'no browser exceptions');
} finally {
  await browser?.close(); await server.close();
}
if (failed) process.exitCode = 1;
