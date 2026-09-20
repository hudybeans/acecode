import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sidebar = fs.readFileSync(path.join(srcRoot, 'components/Sidebar.jsx'), 'utf8');
const topbar = fs.readFileSync(path.join(srcRoot, 'components/TopBar.jsx'), 'utf8');

assert.match(sidebar, /SidebarNavItem[\s\S]*?pl-\[19px\]/);
assert.match(sidebar, /CustomSidebarItem[\s\S]*?pl-\[19px\]/);
assert.match(sidebar, /SidebarNavItem[\s\S]*?items-center justify-start shrink-0/);
assert.match(sidebar, /CustomSidebarItem[\s\S]*?items-center justify-start shrink-0/);
assert.match(sidebar, /grid-cols-\[24px_minmax\(0,1fr\)_(?:auto|76px)\][\s\S]*?gap-x-\[7px\] mx-1\.5 pl-\[13px\] pr-2/);
assert.match(sidebar, /ace-sidebar-session-title-button ace-sidebar-tree-content[^\n]*px-0/);
assert.match(sidebar, /ace-sidebar-tree-content min-w-0 truncate/);
assert.match(sidebar, /ace-sidebar-tree-content ace-sidebar-meta-text px-0 py-\[5px\]/);
assert.doesNotMatch(topbar, /className="ml-\[8px\]"/);
assert.match(sidebar, /SidebarSectionHeader[\s\S]*?group flex h-8 items-center/);
assert.match(sidebar, /group\/section-header flex min-w-0 flex-1 items-center/);
assert.match(sidebar, /data-sidebar-section-disclosure=\{sectionId\}[\s\S]*?opacity-0/);
const sectionHeader = sidebar.match(/function SidebarSectionHeader[\s\S]*?\r?\n}\r?\n/)[0];
assert.doesNotMatch(sectionHeader, /group-focus-within:opacity-100/);
assert.doesNotMatch(sectionHeader, /data-sidebar-section-disclosure=\{sectionId\}[\s\S]*?hover:bg-surface-hi/);
assert.doesNotMatch(sidebar, /\[aria-expanded="true"\].*ace-sidebar-extensions-arrow/);

console.log('[pass] sidebar alignment keeps icon and content columns on shared left baselines');
