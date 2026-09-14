'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const icons = {
    upload: 'M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4', download: 'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4',
    search: 'M21 21l-5-5M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0', close: 'm6 6 12 12M6 18 18 6',
    check: 'm5 12 4 4L19 6', refresh: 'M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 2M4 17l2 2a8 8 0 0 0 13-3',
    moon: 'M20 15a9 9 0 0 1-11-11A9 9 0 1 0 20 15Z', sun: 'M12 3V1m0 22v-2M3 12H1m22 0h-2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
    palette: 'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h6a3 3 0 0 0 3-3c0-4-5-7-9-7Zm-5 7h.01M10 7h.01M15 7h.01M6 14h.01',
    lock: 'M6 10V7a6 6 0 0 1 12 0v3M4 10h16v12H4V10Zm8 5v3', alert: 'm12 3 10 18H2L12 3Zm0 6v5m0 3v.01',
  };
  function icon(name) { const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); node.setAttribute('viewBox', '0 0 24 24'); node.setAttribute('aria-hidden', 'true'); const path = document.createElementNS(node.namespaceURI, 'path'); path.setAttribute('d', icons[name] || icons.palette); node.append(path); return node; }
  document.querySelectorAll('[data-icon]').forEach((node) => node.append(icon(node.dataset.icon)));
  const adminPage = location.pathname.endsWith('/admin');
  const base = new URL('./', location.href);
  const state = { mode: 'all', status: 'pending', page: 1, total: 0, items: [], authenticated: false, selected: null };
  const statuses = { pending: '待审核', approved: '已通过', rejected: '已驳回' };
  let listRequest, searchTimer, toastTimer, uploadRequest, selectedFile, selectedTheme, uploadPhase = '', selectionRevision = 0;
  function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; }
  function show(id, visible) { $(id).hidden = !visible; }
  function error(id, message) { $(id).textContent = message || ''; show(id, !!message); }
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; show('toast', true); toastTimer = setTimeout(() => show('toast', false), 5000); }
  function size(bytes) { return bytes < 1048576 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }
  function meta(theme) { return `${theme.mode === 'dark' ? '深色主题' : '浅色主题'} · v${theme.version} · ${size(theme.bytes)}`; }
  async function request(route, options = {}) {
    const response = await fetch(new URL(route, base), { credentials: 'same-origin', ...options, headers: { 'X-Workshop-Request': '1', ...(options.headers || {}) } });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) { const exception = new Error(value.message || `请求失败（${response.status}），请重试。`); exception.status = response.status; throw exception; }
    return value;
  }
  function swatches(container, theme, all = false) {
    container.replaceChildren();
    const colors = all ? ['accent', 'bg', 'surface', 'fg', 'send-bg', 'ok', 'warn', 'danger'].map((key) => [key, theme.colors[key]]) : theme.swatches.map((color) => ['', color]);
    for (const [name, color] of colors) { const node = element('span', 'swatch'); node.style.backgroundColor = color; node.title = `${name ? `${name} · ` : ''}${color}`; node.setAttribute('aria-label', node.title); container.append(node); }
  }
  function details(container, theme) {
    container.replaceChildren();
    for (const [label, value, color] of [
      ['ACECode 图标', theme.appearance.logo_color || '原始配色', theme.appearance.logo_color],
      ['首页标题', theme.appearance.home_title_color || theme.colors.fg, theme.appearance.home_title_color || theme.colors.fg],
      ['背景通顶', theme.appearance.extend_to_titlebar ? '开启' : '关闭'],
    ]) { const dd = element('dd', '', value); if (color) { const swatch = element('span', 'swatch'); swatch.style.backgroundColor = color; dd.prepend(swatch); } container.append(element('dt', '', label), dd); }
  }
  function card(theme) {
    const article = element('article', 'theme-card');
    const preview = element('button', 'card-image-button'); preview.type = 'button'; preview.setAttribute('aria-label', `预览 ${theme.name}`); preview.addEventListener('click', () => openPreview(theme));
    const image = element('img', 'card-image'); image.src = theme.thumbnail_url; image.alt = `${theme.name}预览`; image.loading = 'lazy';
    image.addEventListener('error', () => { image.src = new URL(`assets/acecode-${theme.mode}.png`, base).href; }, { once: true });
    const badge = element('span', 'mode-badge', theme.mode === 'dark' ? '深色' : '浅色'); badge.prepend(icon(theme.mode === 'dark' ? 'moon' : 'sun')); preview.append(image, badge);
    const content = element('div', 'card-content'), heading = element('div', 'card-heading'), title = element('h3', '', theme.name); title.title = theme.name;
    heading.append(title, element('span', 'version', `v${theme.version}`)); content.append(heading);
    if (adminPage) content.append(element('p', 'card-status', statuses[theme.status]));
    const bottom = element('div', 'card-bottom'), colors = element('div', 'swatches'), actions = element('div', 'card-actions'); swatches(colors, theme);
    const inspect = element('button', '', adminPage ? '预览并审核' : '预览'); inspect.type = 'button'; inspect.addEventListener('click', () => openPreview(theme)); actions.append(inspect);
    if (!adminPage) { const download = element('a', 'button primary', '下载主题'); download.href = theme.download_url; download.download = ''; download.prepend(icon('download')); actions.append(download); }
    bottom.append(colors, actions); content.append(bottom); article.append(preview, content); return article;
  }
  async function load() {
    listRequest?.abort(); listRequest = new AbortController(); const current = listRequest;
    $('theme-grid').setAttribute('aria-busy', 'true'); $('result-count').textContent = '正在读取主题…'; show('load-error', false); show('empty', false);
    $('previous').disabled = $('next').disabled = true;
    const params = new URLSearchParams({ q: $('search').value.trim(), mode: state.mode, sort: $('sort').value, page: state.page, status: state.status });
    try {
      const result = await request(`${adminPage ? 'api/admin/themes' : 'api/themes'}?${params}`, { signal: current.signal });
      if (current !== listRequest) return;
      state.items = result.themes; state.total = result.total; state.page = Math.max(1, result.page);
      if (state.page > 1 && !result.themes.length) { state.page = 1; return load(); }
      $('theme-grid').replaceChildren(...state.items.map(card)); $('result-count').textContent = `${result.total} 个${adminPage ? statuses[state.status] : '公开'}主题`;
      const filtered = !!$('search').value.trim() || state.mode !== 'all';
      $('empty-title').textContent = filtered ? '没有找到匹配的主题' : adminPage ? `暂无${statuses[state.status]}主题` : '还没有公开主题';
      $('empty-copy').textContent = filtered ? '换个关键词，或切换色系再看看。' : adminPage ? '新的主题提交后，会进入待审核列表。' : '上传你的第一份主题，管理员确认后将在这里展示。';
      show('empty', !state.items.length); show('empty-upload', !adminPage && !filtered); show('pagination', result.total > 24);
      $('previous').disabled = state.page <= 1; $('next').disabled = state.page * 24 >= result.total; $('page-number').textContent = `${state.page} / ${Math.max(1, Math.ceil(result.total / 24))}`;
    } catch (exception) {
      if (exception.name === 'AbortError') return;
      if (exception.status === 401 && adminPage) { state.authenticated = false; renderAdmin(); return; }
      $('theme-grid').replaceChildren(); show('pagination', false); show('load-error', true); $('load-error-message').textContent = exception.message; $('result-count').textContent = '读取失败';
    } finally { if (current === listRequest) $('theme-grid').setAttribute('aria-busy', 'false'); }
  }
  function openPreview(theme) {
    state.selected = theme; $('preview-title').textContent = theme.name; $('preview-meta').textContent = meta(theme); error('review-error', '');
    setPreview('theme'); swatches($('preview-swatches'), theme, true); details($('preview-details'), theme);
    $('preview-download').href = theme.download_url; show('preview-download', !adminPage); show('approve', adminPage && theme.status !== 'approved'); show('reject', adminPage && theme.status !== 'rejected');
    $('preview-status').textContent = adminPage ? statuses[theme.status] : '完整主题 ZIP · 壁纸与 UI 配色'; $('preview-dialog').showModal();
  }
  function setPreview(kind) {
    const theme = state.selected; if (!theme) return;
    document.querySelectorAll('[data-preview]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.preview === kind)));
    $('preview-image').src = kind === 'template' ? new URL(`assets/acecode-${theme.mode}.png`, base).href : theme.thumbnail_url;
    $('preview-image').alt = kind === 'template' ? `ACECode ${theme.mode === 'dark' ? '深色' : '浅色'}基础模板` : `${theme.name}主题预览`;
  }
  async function moderate(action) {
    if (!state.selected) return;
    $('approve').disabled = $('reject').disabled = true; error('review-error', '');
    try { await request(`api/admin/themes/${state.selected.key}/${action}`, { method: 'POST' }); $('preview-dialog').close(); toast(action === 'approve' ? '主题已通过审核并公开展示' : '主题已驳回，不会公开展示'); await load(); }
    catch (exception) { error('review-error', exception.message); }
    finally { $('approve').disabled = $('reject').disabled = false; }
  }
  function upload(route, file, revision) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest(); uploadRequest = xhr; xhr.open('POST', new URL(route, base)); xhr.responseType = 'json'; xhr.timeout = 120000; xhr.setRequestHeader('X-Workshop-Request', '1');
      xhr.upload.addEventListener('progress', (event) => { if (revision !== selectionRevision) return; if (event.lengthComputable) { const percent = Math.floor(event.loaded / event.total * 100); $('upload-progress').value = percent; $('upload-percent').textContent = `${percent}%`; if (percent === 100) { $('upload-progress').removeAttribute('value'); $('upload-progress-label').textContent = route.endsWith('preview') ? '正在校验主题包…' : '正在保存主题，准备提交审核…'; } } });
      xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.response) : reject(new Error(xhr.response?.message || `上传失败（${xhr.status}），请重试。`));
      xhr.onerror = () => reject(new Error('网络连接中断，请重新上传。')); xhr.ontimeout = () => reject(new Error('上传超时，请检查网络后重试。')); xhr.onabort = () => reject(new DOMException('已取消', 'AbortError'));
      const form = new FormData(); form.append('file', file); xhr.send(form);
    });
  }
  function setBusy(phase) {
    uploadPhase = phase; const busy = !!phase;
    $('upload-submit').disabled = busy || !selectedTheme; $('change-file').disabled = $('dropzone').disabled = busy;
    $('upload-cancel').textContent = phase === 'inspect' ? '取消读取' : phase === 'submit' ? '正在提交…' : '取消';
    $('upload-cancel').disabled = phase === 'submit'; $('upload-dialog').querySelector('.close-dialog').disabled = phase === 'submit';
    show('upload-progress-row', busy); $('upload-progress').removeAttribute('value'); $('upload-percent').textContent = '';
    $('upload-progress-label').textContent = phase === 'submit' ? '正在上传主题…' : '正在读取主题包…';
  }
  function openUpload() {
    selectedFile = null; selectedTheme = null; ++selectionRevision; $('theme-file').value = ''; error('upload-error', ''); setBusy('');
    ['upload-preview', 'upload-file-row', 'upload-success'].forEach((id) => show(id, false)); ['dropzone', 'upload-policy', 'upload-submit'].forEach((id) => show(id, true));
    $('upload-dialog').showModal();
  }
  async function selectFile(file) {
    if (!file || uploadPhase === 'submit') return;
    uploadRequest?.abort(); const revision = ++selectionRevision; selectedFile = file; selectedTheme = null; error('upload-error', ''); show('upload-preview', false);
    if (!/\.zip$/i.test(file.name) || !file.size || file.size > 16 * 1024 * 1024) { setBusy(''); error('upload-error', '请选择不超过 16 MB 的完整主题 ZIP。'); return; }
    $('upload-filename').textContent = file.name; show('upload-file-row', true); show('dropzone', false); setBusy('inspect');
    try {
      const result = await upload('api/preview', file, revision); if (revision !== selectionRevision) return;
      selectedTheme = result.theme; $('upload-thumbnail').src = selectedTheme.thumbnail_url; $('upload-name').textContent = selectedTheme.name; $('upload-meta').textContent = meta(selectedTheme);
      swatches($('upload-swatches'), selectedTheme, true); details($('upload-details'), selectedTheme); show('upload-preview', true);
    } catch (exception) { if (exception.name !== 'AbortError' && revision === selectionRevision) error('upload-error', exception.message); }
    finally { if (revision === selectionRevision) setBusy(''); }
  }
  async function submit() {
    if (!selectedTheme || !selectedFile || uploadPhase) return;
    setBusy('submit'); error('upload-error', '');
    try {
      const result = await upload('api/themes', selectedFile, selectionRevision);
      ['upload-preview', 'upload-file-row', 'upload-policy', 'upload-submit'].forEach((id) => show(id, false)); show('upload-success', true);
      $('upload-success').querySelector('h3').textContent = result.status === 'approved' ? '这份主题已经公开展示' : result.status === 'rejected' ? '这份主题此前已被驳回' : '已提交，等待管理员确认';
      $('upload-success').querySelector('p').textContent = result.status === 'rejected' ? '请调整主题并更新版本号，再导出并提交审核。' : result.status === 'approved' ? '无需重复上传，可以在工坊中搜索和下载。' : '审核通过后，主题会出现在工坊公开列表中。';
    } catch (exception) { error('upload-error', exception.message); }
    finally { setBusy(''); if (!$('upload-success').hidden) $('upload-cancel').textContent = '完成'; }
  }
  function closeUpload(event) { if (uploadPhase === 'submit') { event?.preventDefault(); return; } ++selectionRevision; uploadRequest?.abort(); $('upload-dialog').close(); }
  function renderAdmin() { show('login-panel', !state.authenticated); show('catalogue', state.authenticated); show('logout', state.authenticated); if (state.authenticated) void load(); }
  $('upload-open').onclick = $('empty-upload').onclick = openUpload;
  $('dropzone').onclick = $('change-file').onclick = () => $('theme-file').click(); $('theme-file').onchange = (event) => { const file = event.target.files[0]; event.target.value = ''; if (file) void selectFile(file); };
  $('dropzone').ondragover = (event) => { event.preventDefault(); $('dropzone').classList.add('dragging'); }; $('dropzone').ondragleave = () => $('dropzone').classList.remove('dragging');
  $('dropzone').ondrop = (event) => { event.preventDefault(); $('dropzone').classList.remove('dragging'); if (!uploadPhase) void selectFile(event.dataTransfer.files[0]); };
  $('upload-submit').onclick = () => void submit(); $('upload-cancel').onclick = closeUpload; $('upload-dialog').addEventListener('cancel', closeUpload); $('upload-dialog').querySelector('.close-dialog').onclick = closeUpload;
  $('preview-dialog').querySelector('.close-dialog').onclick = () => $('preview-dialog').close();
  document.querySelectorAll('[data-preview]').forEach((button) => button.onclick = () => setPreview(button.dataset.preview));
  $('approve').onclick = () => void moderate('approve'); $('reject').onclick = () => void moderate('reject');
  document.querySelectorAll('[data-mode]').forEach((button) => button.onclick = () => { state.mode = button.dataset.mode; state.page = 1; document.querySelectorAll('[data-mode]').forEach((node) => node.setAttribute('aria-pressed', String(node === button))); void load(); });
  document.querySelectorAll('[data-status]').forEach((button) => button.onclick = () => { state.status = button.dataset.status; state.page = 1; document.querySelectorAll('[data-status]').forEach((node) => node.setAttribute('aria-pressed', String(node === button))); void load(); });
  $('search').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.page = 1; void load(); }, 220); }; $('sort').onchange = () => { state.page = 1; void load(); };
  $('refresh').onclick = $('retry').onclick = () => void load(); $('previous').onclick = () => { if ($('previous').disabled) return; state.page = Math.max(1, state.page - 1); void load(); }; $('next').onclick = () => { if ($('next').disabled) return; state.page = Math.min(Math.max(1, Math.ceil(state.total / 24)), state.page + 1); void load(); };
  $('login-form').onsubmit = async (event) => { event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true; error('login-error', ''); try { await request('api/admin/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: $('admin-key').value }) }); $('admin-key').value = ''; state.authenticated = true; renderAdmin(); } catch (exception) { error('login-error', exception.message); } finally { button.disabled = false; } };
  $('logout').onclick = async () => { try { await request('api/admin/logout', { method: 'POST' }); state.authenticated = false; renderAdmin(); } catch (exception) { toast(exception.message); } };
  if (adminPage) {
    document.title = '主题审核 · ACECode'; $('page-title').textContent = '主题审核'; $('page-description').textContent = '确认预览和配色，让每一份公开主题都准备就绪。';
    ['upload-open', 'review-note', 'admin-link', 'catalogue'].forEach((id) => show(id, false)); show('public-link', true); show('review-filters', true);
    request('api/admin/session').then((result) => { state.authenticated = result.authenticated; renderAdmin(); if (!result.configured) error('login-error', '管理员入口尚未配置，请联系站点管理员。'); }).catch((exception) => { renderAdmin(); error('login-error', exception.message); });
  } else void load();
})();
