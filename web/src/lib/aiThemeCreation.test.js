import assert from 'node:assert/strict';
import { aiThemeCreationDraft, aiThemeCreationRef, createLiveThemeCreationMonitor, homeComposerScopedWorkspace } from './aiThemeCreation.js';
import { createThemeDownloadController } from './themePackages.js';
import { homeComposerDraftText, updateHomeComposerDrafts, clearHomeComposerDraftIfMatch } from './homeComposerDrafts.js';
import { goBack, pushNavigation, deserializeNavigationHistory, serializeNavigationHistory } from './navigationHistory.js';
import { commandsWithFallback } from './slashCommands.js';
import { COMPOSER_COMMAND_TAG, composerDocumentFromText, composerDocumentWithSynchronizedLeadingCommand, composerTextFromDocument } from './richComposerModel.js';

function run(name, fn) { fn(); console.log(`[pass] ${name}`); }

run('AI theme handoff stays unsent, preserves workspace and isolates ordinary drafts', () => {
  const original = { home: true, workspaceHash: 'workspace-a', cwd: 'C:/repo' };
  const next = aiThemeCreationRef(original, {});
  assert.equal(next.sessionId, undefined);
  assert.equal(next.home, true);
  assert.equal(next.workspaceHash, 'workspace-a');
  assert.equal(next.initialDraftText, '/ai-theme 我想生成关于 XXX 的主题，X 色是它的主色调。');
  const history = pushNavigation({ back: [], forward: [] }, original, next);
  assert.deepEqual(goBack(history, next).activeRef, original);
  assert.equal(deserializeNavigationHistory(serializeNavigationHistory({ back: [next] })).back[0].composerDraftScope, 'ai-theme');

  const key = homeComposerScopedWorkspace(next.workspaceHash, next.composerDraftScope);
  let drafts = updateHomeComposerDrafts({}, original.workspaceHash, 'unfinished ordinary task');
  drafts = updateHomeComposerDrafts(drafts, key, next.initialDraftText);
  drafts = updateHomeComposerDrafts(drafts, key, 'edited AI theme request');
  assert.equal(homeComposerDraftText(drafts, original.workspaceHash), 'unfinished ordinary task');
  assert.equal(homeComposerDraftText(drafts, key), 'edited AI theme request');
  drafts = clearHomeComposerDraftIfMatch(drafts, key, 'edited AI theme request');
  assert.equal(homeComposerDraftText(drafts, key), '');
  assert.equal(homeComposerDraftText(drafts, original.workspaceHash), 'unfinished ordinary task');
  assert.notEqual(homeComposerScopedWorkspace('', 'ai-theme'), homeComposerScopedWorkspace(''));
});

run('AI theme draft becomes a real skill chip even when the skill catalog arrives late', () => {
  const commands = commandsWithFallback({ skills: [{ name: 'ai-theme', description: 'Generate themes' }] });
  const text = `${aiThemeCreationDraft()} 动漫配色`;
  const waiting = composerDocumentFromText(text, []);
  const document = composerDocumentWithSynchronizedLeadingCommand(waiting, text, commands);
  const tag = document[0].children.find((child) => child.type === COMPOSER_COMMAND_TAG);
  assert.equal(tag.kind, 'skill');
  assert.equal(tag.token, '/ai-theme');
  assert.equal(composerTextFromDocument(document), text);
});

function event(type, overrides = {}) {
  return {
    type, session_id: 's1', replayed: false,
    payload: { tool: 'theme_create', tool_call_id: 'call-a', args: { action: 'install' }, success: true,
      metadata: { theme_created: { id: 'ai-night', version: '1.0.0', apply: true } } },
    ...overrides,
  };
}

run('only a paired live install completion in the current task applies once', () => {
  const applied = [];
  const monitor = createLiveThemeCreationMonitor({ onCreated: (theme) => applied.push(theme.id) });
  monitor.setSession('s1');
  assert.equal(monitor.accept(event('tool_end')), false);
  monitor.accept(event('tool_start'));
  assert.equal(monitor.accept(event('tool_end')), true);
  monitor.accept(event('tool_start'));
  assert.equal(monitor.accept(event('tool_end')), false);
  assert.deepEqual(applied, ['ai-night']);
});

run('mount, navigation and reconnect catch-up never auto-apply historical themes', () => {
  const applied = [];
  const monitor = createLiveThemeCreationMonitor({ onCreated: (theme) => applied.push(theme.id) });
  monitor.setSession('s1');
  for (const replayed of [true, undefined]) {
    monitor.accept(event('tool_start', { replayed }));
    monitor.accept(event('tool_end', { replayed }));
  }
  monitor.accept(event('tool_start'));
  monitor.setSession('s2');
  monitor.setSession('s1');
  monitor.accept(event('tool_end'));
  assert.deepEqual(applied, []);
  // A start actually observed live survives a reconnect; replayed completion
  // cannot consume it, while a genuinely new completion may still apply.
  monitor.accept(event('tool_start'));
  monitor.accept(event('tool_end', { replayed: true }));
  assert.deepEqual(applied, []);
  monitor.accept(event('tool_end'));
  assert.deepEqual(applied, ['ai-night']);
});

run('failed, unrelated and invalid tool results cannot request theme application', () => {
  const applied = [];
  const monitor = createLiveThemeCreationMonitor({ onCreated: (theme) => applied.push(theme.id) });
  monitor.setSession('s1');
  for (const change of [
    { success: false }, { tool: 'image_generate' }, { tool_call_id: 'other' },
    { metadata: { theme_created: { id: 'blue', version: '1', apply: true } } },
    { metadata: { theme_created: { id: 'ai-night', version: '1', apply: false } } },
  ]) {
    monitor.accept(event('tool_start'));
    monitor.accept(event('tool_end', { payload: { ...event('tool_end').payload, ...change } }));
  }
  monitor.accept(event('tool_start', { session_id: 's2' }));
  monitor.accept(event('tool_end', { session_id: 's2' }));
  assert.deepEqual(applied, []);
});

for (const manualSelection of [false, true]) {
  const applied = [], prepared = [], completed = [];
  const controller = createThemeDownloadController({
    api: { getThemes: async () => ({ themes: [] }) },
    prepare: async (id) => prepared.push(id),
    apply: async (id) => applied.push(id),
  });
  const monitor = createLiveThemeCreationMonitor({
    onStart: () => controller.beginCreation(),
    onCreated: (theme, intent) => completed.push(controller.created(theme, intent)),
  });
  monitor.setSession('s1');
  monitor.accept(event('tool_start'));
  if (manualSelection) await controller.select('orange');
  monitor.accept(event('tool_end'));
  await Promise.all(completed);
  assert.deepEqual(applied, manualSelection ? ['orange'] : ['ai-night']);
  assert.deepEqual(prepared, manualSelection ? [] : ['ai-night']);
  if (manualSelection) {
    // A later explicit install retry has a new tool call, so the user can still
    // apply the same idempotently installed theme after the earlier override.
    for (const type of ['tool_start', 'tool_end']) {
      const next = event(type);
      next.payload.tool_call_id = 'install-retry';
      monitor.accept(next);
    }
    await Promise.all(completed);
    assert.deepEqual(applied, ['orange', 'ai-night']);
  }
  controller.dispose();
  console.log(`[pass] live installation ${manualSelection ? 'preserves a manual selection made before completion' : 'applies when the starting appearance intent is unchanged'}`);
}
