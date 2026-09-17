import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function source(relativePath) {
  return fs.readFileSync(path.join(srcRoot, relativePath), 'utf8');
}

function between(text, start, end) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return text.slice(startIndex, endIndex);
}

function run(name, fn) {
  try {
    fn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

run('SessionRow uses the AskUserQuestion slot with exact permission wording', () => {
  const sidebar = source('components/Sidebar.jsx');
  const row = between(sidebar, 'function SessionRow', 'function OpencodeImportSelectAllCheckbox');
  assert.match(row, /data-sidebar-permission-prompt="true"/);
  assert.match(row, />\s*权限请求\s*</);
  assert.match(row, /pendingPermission \? \(/);
  assert.match(row, /: !editing && pendingQuestion \? \(/);
  assert.match(row, /data-sidebar-pending-reply="true"/);
  assert.match(row, /className="[^"]*bg-accent[^"]*font-normal[^"]*text-white"/);
  assert.match(row, /\{tr\('sessionNavigation\.pendingReply'\)\}/);
  assert.doesNotMatch(row, />\s*等待回复\s*</);
  assert.ok(
    row.indexOf('pendingPermission ?') < row.indexOf('pendingQuestion ?'),
    'permission pill must take precedence over the question pill',
  );
  assert.match(row, /onSelect\?\.\(s\)/);
});

run('running sessions use the four-dot breathing indicator', () => {
  const sidebar = source('components/Sidebar.jsx');
  const styles = source('styles/globals.css');
  const indicator = between(sidebar, 'function SessionAttentionIndicator', 'function SessionHoverCard');
  assert.match(indicator, /if \(attention !== 'in_progress' && attention !== 'unread'\) return null/);
  assert.equal((indicator.match(/ace-session-loading-dot is-/g) || []).length, 4);
  assert.match(indicator, /role="status"/);
  assert.match(styles, /\.ace-session-loading-orbit\s*\{[\s\S]*animation: ace-session-loading-turn 6\.47s linear infinite/);
  assert.match(styles, /\.ace-session-loading-dot\.is-top/);
  assert.match(styles, /\.ace-session-loading-dot\.is-right/);
  assert.match(styles, /\.ace-session-loading-dot\.is-bottom/);
  assert.match(styles, /\.ace-session-loading-dot\.is-left/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ace-session-loading-orbit/);
});

run('permission state reaches pinned, no-workspace, and workspace session rows', () => {
  const sidebar = source('components/Sidebar.jsx');
  const matches = sidebar.match(
    /pendingPermission=\{sessionHasPendingPermission\(s, pendingPermissionSessionIds\)\}/g,
  ) || [];
  assert.equal(matches.length, 3);
  assert.match(sidebar, /pendingPermissionSessionIds=\{pendingPermissionSessionIds\}/);
});

run('App passes unresolved owner IDs into Sidebar', () => {
  const app = source('App.jsx');
  assert.match(app, /pendingPermissionSessionIds\(permReqs, activeId, permissionOwnership\)/);
  assert.match(
    app,
    /pendingPermissionSessionIds=\{pendingPermissionSessionIdsForSidebar\}/,
  );
});

console.log('permissionSidebarArchitecture tests passed');
