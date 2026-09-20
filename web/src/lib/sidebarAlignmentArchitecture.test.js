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
assert.match(sidebar, /grid-cols-\[24px_minmax\(0,1fr\)_76px\][\s\S]*?gap-x-\[7px\] mx-1\.5 pl-\[13px\] pr-2/);
assert.match(sidebar, /ace-sidebar-session-title-button ace-sidebar-tree-content[^\n]*px-0/);
assert.match(sidebar, /ace-sidebar-tree-content min-w-0 truncate/);
assert.match(sidebar, /ace-sidebar-tree-content ace-sidebar-meta-text px-0 py-\[5px\]/);
assert.doesNotMatch(topbar, /className="ml-\[8px\]"/);
assert.match(sidebar, /SidebarSectionHeader[\s\S]*?group flex h-6 items-center/);
assert.match(sidebar, /group\/section-header flex min-w-0 flex-1 items-center/);
assert.match(sidebar, /data-sidebar-section-disclosure=\{sectionId\}[\s\S]*?opacity-0/);
const sectionHeader = sidebar.match(/function SidebarSectionHeader[\s\S]*?\r?\n}\r?\n/)[0];
assert.doesNotMatch(sectionHeader, /group-focus-within:opacity-100/);
assert.doesNotMatch(sectionHeader, /data-sidebar-section-disclosure=\{sectionId\}[\s\S]*?hover:bg-surface-hi/);
assert.doesNotMatch(sidebar, /\[aria-expanded="true"\].*ace-sidebar-extensions-arrow/);
assert.match(sidebar, /SidebarSectionHeader[\s\S]*?group flex h-6 items-center/);
assert.match(sidebar, /SidebarSectionHeader[\s\S]*?mt-2/);
assert.match(sidebar, /ace-sidebar-section-title text-\[12px\]/);
assert.match(sidebar, /ace-sidebar-fixed-nav shrink-0 flex flex-col gap-0\.5/);
assert.match(sidebar, /ace-sidebar-custom-list flex flex-col gap-0\.5/);
assert.match(sidebar, /mt-0\.5 mb-2 flex flex-col gap-0\.5/);
assert.match(sidebar, /mt-0\.5 flex flex-col gap-0\.5/);
assert.doesNotMatch(sidebar, /-mt-1/);
assert.match(sidebar, /ace-sidebar-workspace-row[\s\S]*?grid h-8 grid-cols-\[24px_minmax\(0,1fr\)_76px\][\s\S]*?gap-x-\[7px\] mx-1\.5 pl-\[13px\] pr-2/);

console.log('[pass] sidebar alignment and vertical rhythm preserve shared baselines');
