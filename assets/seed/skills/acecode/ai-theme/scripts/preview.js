(() => {
  const plan = JSON.parse(document.getElementById('theme-preview-config').textContent);
  const root = document.documentElement;
  const colors = plan.colors || {}, appearance = plan.appearance || {};
  const value = (key, fallback) => colors[key] || getComputedStyle(root).getPropertyValue(fallback).trim();
  const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(', ');
  const palette = { surface: 'surface', 'shell-bg': 'sidebar', fg: 'ink', 'fg-2': 'muted', border: 'line' };
  for (const [key, target] of Object.entries(palette)) if (colors[key]) root.style.setProperty('--' + target, colors[key]);
  document.querySelector('.modes').remove();
  document.querySelector('h1').textContent = (plan.name || 'ACECode') + ' · 主题预览';
  document.querySelector('.subtitle').textContent = (plan.mode === 'dark' ? '黑夜' : '白天') + '模式 · 上方主页，下方聊天页';
  document.title = (plan.name || 'ACECode') + ' · 主题预览';
  const enabled = { home: true, session: plan.scope !== 'quick', user_message: plan.scope === 'deep' };
  const pending = [];
  for (const [key, target] of Object.entries({ home: 'home', session: 'session', user_message: 'chat-card' })) {
    const element = document.getElementById(target + '-background');
    const baseKey = key === 'user_message' ? 'accent-bg' : 'bg';
    const color = appearance[key + '_background_color'] || value(baseKey, '--surface');
    root.style.setProperty('--' + target + '-background-color', color);
    element.dataset.customized = String(enabled[key]);
    const label = element.querySelector('.region-label');
    if (!enabled[key]) {
      label.append('（本次不定制）');
      root.style.setProperty('--' + target + '-background-color', value(baseKey, '--surface'));
      continue;
    }
    const image = plan.assets[key];
    if (!image) { label.append('（待提供素材）'); continue; }
    const opacity = appearance[key + '_background_opacity'] ?? 1;
    const overlay = 'rgba(' + rgb(color) + ', ' + (1 - opacity) + ')';
    root.style.setProperty('--' + target + '-background-image', 'linear-gradient(' + overlay + ', ' + overlay + '), url("' + image + '")');
    pending.push(new Promise((resolve, reject) => {
      const bitmap = new Image(); bitmap.onload = resolve; bitmap.onerror = reject; bitmap.src = image;
    }));
  }
  const input = document.querySelector('.home-content .composer');
  input.style.backgroundColor = 'rgba(' + rgb(value('surface', '--surface')) + ', ' + (appearance.home_composer_opacity ?? 0.95) + ')';
  if (appearance.logo_color) for (const logo of document.querySelectorAll('.brand-mark, .home-logo')) {
    logo.style.backgroundColor = appearance.logo_color; logo.style.color = '#ffffff';
  }
  document.querySelector('.home-title').style.color = appearance.home_title_color || value('fg', '--ink');
  const frame = document.getElementById('home-background').closest('.window');
  frame.dataset.extendToTitlebar = String(appearance.extend_to_titlebar === true);
  if (appearance.extend_to_titlebar) {
    const controls = frame.querySelector('.window-tools');
    controls.style.setProperty('--muted', plan.mode === 'dark' ? '#ffffff' : value('fg', '--ink'));
  }
  Promise.allSettled(pending).then((results) => {
    window.__themePreviewReady = results.every((result) => result.status === 'fulfilled');
    if (!window.__themePreviewReady) document.querySelector('.note').textContent = '有素材无法显示，请检查文件后重新预览。';
  });
})();
