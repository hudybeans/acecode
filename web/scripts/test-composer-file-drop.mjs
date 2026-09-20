import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

// Exercise the production InputBar. Native focus is an explicit boundary:
// rejecting drag-enter activation must be followed by one retry on acceptance,
// never by another foreground request after asynchronous materialization.
const web = fileURLToPath(new URL('../', import.meta.url));
const modulePath = process.env.ACE_PLAYWRIGHT_MODULE;
const { chromium } = await import(modulePath ? pathToFileURL(path.resolve(modulePath)).href : 'playwright');
const port = Number(process.env.ACE_COMPOSER_DROP_TEST_PORT || 5195);
const baseline = process.argv.includes('--baseline');
const inputBarPath = path.join(web, 'src/components/InputBar.jsx').replaceAll('\\', '/');
const inputBarBaseline = baseline ? execFileSync('git', ['show', 'HEAD:web/src/components/InputBar.jsx'], { cwd: web, encoding: 'utf8' }) : null;
const fixture = `
import React, {useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {InputBar} from '/src/components/InputBar.jsx';
import {SlashCommandsProvider} from '/src/components/SlashCommandsContext.jsx';
import {composerContentText} from '/src/lib/composerContent.js';
import '/src/styles/globals.css';
function Fixture() {
 const ref = useRef();
 const [value, setValue] = useState('');
 const [content, setContent] = useState({version:1, parts:[]});
 const [disabled, setDisabled] = useState(false);
 window.fixture = {setDisabled, get value(){return composerContentText(ref.current?.getComposerContent());}};
 return <main style={{padding:80}}><input id="outside" aria-label="Other input"/>
  <SlashCommandsProvider><InputBar ref={ref} value={value} composerContent={content} disabled={disabled}
   onChange={(text,next)=>{setValue(text);setContent(next);}} cwd="C:/fixture"
   onMediaFiles={files=>window.uploads.push(files.map(file=>file.name))}/></SlashCommandsProvider>
 </main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
const html = `<html><body><div id="root"></div><script type="module">
const mode = new URLSearchParams(location.search).get('mode') || 'windows';
window.__ACECODE_DESKTOP_SHELL__ = true;
window.__ACECODE_OS__ = mode === 'browser' ? 'windows' : mode;
window.__ACECODE_NATIVE_FILE_DROP__ = ['windows','macos'].includes(mode);
window.focusAttempts = 0; window.nativeActive = false; window.genericFocusAttempts = 0;
window.uploads = []; window.materializations = []; window.materializeDelay = false;
window.aceDesktop_activateFileDropWindow = async () => {
 window.focusAttempts++; if(window.focusAttempts > 1) window.nativeActive = true;
 return {ok:window.nativeActive};
};
window.aceDesktop_focusFileDropWindow = window.aceDesktop_activateFileDropWindow;
window.aceDesktop_focusWindow = async () => { window.genericFocusAttempts++; };
if(mode !== 'browser') window.aceDesktop_materializeContextItems = async paths => {
 window.materializations.push({paths, activeAtStart:window.nativeActive});
 if(window.materializeDelay) await new Promise(resolve=>window.finishMaterialization=resolve);
 return {ok:true,items:paths.map(path=>({kind:'file',path,name:path.split(/[\\\\/]/).pop(),reference_only:true,size_bytes:1}))};
};
window.chrome.webview = {postMessageWithAdditionalObjects:()=>{window.nativePosted=true;}};
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;
window.__vite_plugin_react_preamble_installed__=true;
</script><script type="module" src="/__composer-file-drop.jsx"></script></body></html>`;
const virtual = path.join(web, '__composer-file-drop.jsx').replaceAll('\\', '/');
const server = await createServer({
  root: web, configFile: path.join(web, 'vite.config.js'), logLevel: 'error',
  plugins: [{ name: 'composer-file-drop-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/__composer-file-drop.jsx') return virtual; },
    load(id) {
      const normalized = id.replaceAll('\\', '/');
      if (normalized === virtual) return fixture;
      if (baseline && normalized === inputBarPath) return inputBarBaseline;
    },
    configureServer(vite) { vite.middlewares.use((req, res, next) => {
      if (req.url?.split('?')[0] !== '/__composer-file-drop') return next();
      res.setHeader('Content-Type', 'text/html'); res.end(html);
    }); },
  }], server: { host: '127.0.0.1', port, strictPort: true, hmr: false },
});
let browser;
let failed = 0;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.ACE_CHROMIUM_EXECUTABLE ? { executablePath: process.env.ACE_CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage();
  await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: '{"commands":[],"skills":[]}' }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const editor = page.locator('[data-ace-rich-composer]');
  const state = () => page.evaluate(() => ({ text:window.fixture.value, attempts:window.focusAttempts, active:window.nativeActive, general:window.genericFocusAttempts, materializations:window.materializations, uploads:window.uploads }));
  async function reset(mode = 'windows') {
    await page.goto('http://127.0.0.1:' + port + '/__composer-file-drop?mode=' + mode);
    await editor.waitFor(); await editor.click();
  }
  async function drag(types = ['dragenter', 'dragover', 'drop'], uri = '') {
    await editor.evaluate((element, {types, uri}) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File(['sample'], 'notes.txt', {type:'text/plain'}));
      if (uri) dataTransfer.setData('text/uri-list', uri);
      const rect = element.getBoundingClientRect();
      for (const type of types) element.dispatchEvent(new DragEvent(type, {
        bubbles:true, cancelable:true, dataTransfer, clientX:rect.left+20, clientY:rect.top+10,
      }));
    }, {types, uri});
  }
  const accept = paths => page.evaluate(paths => window.__aceComposerAcceptFileDrop(paths), paths);
  const tags = () => editor.locator('[data-composer-inline-tag="path"]');
  async function run(name, test) {
    try { await test(); console.log('[pass] ' + name); }
    catch (error) { failed++; console.error('[FAIL] ' + name + ': ' + error.message); }
  }
  for (const [os, paths] of [
    ['windows', ['C:\\fixture\\notes.txt', 'C:/fixture/another.txt']],
    ['macos', ['/Users/fixture/notes.txt', '/Users/fixture/another.txt']],
  ]) {
    await run(os + ' native drop retries focus before resolving paths and permits immediate typing', async () => {
      await reset(os); await drag();
      assert.equal((await state()).attempts, 1, 'drag-over must not repeatedly activate');
      await accept(paths); await tags().nth(1).waitFor();
      const accepted = await state();
      assert.equal(accepted.attempts, 2); assert.equal(accepted.active, true);
      assert.equal(accepted.materializations[0].activeAtStart, true);
      const before = accepted.text;
      await page.keyboard.type('abc'); assert.equal((await state()).text, before + 'abc');
      await page.keyboard.press('ArrowLeft'); await page.keyboard.type('X');
      assert.equal((await state()).text, before + 'abXc');
      await accept(paths); assert.equal((await state()).attempts, 2, 'duplicate native callback must not activate again');
      assert.equal((await state()).general, 0, 'file drop must avoid notification foreground fallback');
    });
  }
  await run('asynchronous path resolution never reactivates a window the user left', async () => {
    await reset(); await drag();
    await page.evaluate(()=>{window.materializeDelay=true;});
    await accept(['C:/fixture/slow.txt']);
    assert.equal((await state()).attempts, 2);
    await page.evaluate(()=>{window.nativeActive=false;window.finishMaterialization();});
    await tags().waitFor();
    const result = await state();
    assert.equal(result.attempts, 2); assert.equal(result.active, false);
  });
  await run('unhovered and empty native callbacks do not take focus', async () => {
    await reset(); await accept(['C:/fixture/ignored.txt']);
    assert.equal((await state()).attempts, 0);
    await drag(['dragenter']); await accept([]);
    assert.equal((await state()).attempts, 1); assert.equal((await state()).materializations.length, 0);
  });
  await run('disabling the composer during a native drag rejects the release', async () => {
    await reset(); await drag(['dragenter']);
    await page.evaluate(()=>window.fixture.setDisabled(true));
    await page.waitForFunction(()=>document.querySelector('[data-ace-rich-composer]').getAttribute('aria-disabled')==='true');
    await accept(['C:/fixture/ignored.txt']);
    assert.equal((await state()).attempts, 1); assert.equal((await state()).materializations.length, 0);
  });
  await run('Linux URI drops share acceptance focus without changing the reference', async () => {
    await reset('linux'); await drag(undefined, 'file:///home/fixture/notes.txt');
    await tags().waitFor();
    const result = await state();
    assert.equal(result.attempts, 2); assert.equal(result.materializations[0].paths[0], '/home/fixture/notes.txt');
    await page.keyboard.type('next'); assert.equal((await state()).text, result.text + 'next');
  });
  await run('browser file drops retain uploads and immediate input', async () => {
    await reset('browser'); await drag();
    const result = await state();
    assert.equal(result.attempts, 2); assert.deepEqual(result.uploads, [['notes.txt']]);
    await page.keyboard.type('next'); assert.equal((await state()).text, 'next');
  });
  assert.deepEqual(errors, [], 'no browser exceptions');
} finally {
  await browser?.close(); await server.close();
}
if (failed) process.exitCode = 1;
