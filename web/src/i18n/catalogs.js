import { enUS } from './catalogs/en-US.js';
import { zhCN } from './catalogs/zh-CN.js';
import { sourceCatalogs } from './sourceCatalog.generated.js';
import { systemNoticeEnUS, systemNoticeZhCN } from './catalogs/systemNotice.js';

export const translationCatalogs = Object.freeze({
  'zh-CN': { ...zhCN, systemNotice: systemNoticeZhCN, source: sourceCatalogs['zh-CN'] },
  'en-US': { ...enUS, systemNotice: systemNoticeEnUS, source: sourceCatalogs['en-US'] },
});
