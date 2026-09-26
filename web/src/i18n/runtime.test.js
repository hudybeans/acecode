import assert from 'node:assert/strict';
import { applyLocalePreference, tr } from './index.js';
import { sourceCatalogs } from './sourceCatalog.generated.js';

const newSessionKey = Object.entries(sourceCatalogs['zh-CN'])
  .find(([, value]) => value === '新建任务')?.[0];
assert.ok(newSessionKey);

await applyLocalePreference('en-US', { cache: false });
assert.equal(tr('common.close'), 'Close');
assert.equal(tr(`source.${newSessionKey}`), 'New task');

await applyLocalePreference('zh-CN', { cache: false });
assert.equal(tr('common.close'), '关闭');
assert.equal(tr(`source.${newSessionKey}`), '新建任务');
console.log('[pass] runtime locale switching updates semantic and static copy');
