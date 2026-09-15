// Export uses backing pixels; resizing the Browser only changes their display.
window.aceThemeArtboardReady = (async () => {
  const canvas = document.getElementById('theme-artwork');
  try {
    const config = JSON.parse(document.getElementById('theme-artboard-config').textContent);
    const source = new Image();
    source.src = config.src;
    await source.decode();
    const width = config.width ?? source.naturalWidth;
    const height = config.height ?? source.naturalHeight;
    if (!Number.isInteger(width) || !Number.isInteger(height)
        || width <= 0 || height <= 0 || width > 8192 || height > 8192
        || width * height > 33554432 || !source.naturalWidth || !source.naturalHeight) {
      throw new Error('画板尺寸无效：每边最多 8192 像素，总计最多 32 兆像素。');
    }
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Browser 无法创建背景画板。');
    const scale = Math.max(width / source.naturalWidth, height / source.naturalHeight);
    const sourceWidth = width / scale;
    const sourceHeight = height / scale;
    context.drawImage(source,
      (source.naturalWidth - sourceWidth) / 2, (source.naturalHeight - sourceHeight) / 2,
      sourceWidth, sourceHeight, 0, 0, width, height);
    canvas.dataset.ready = 'true';
    return {ready: true, width, height};
  } catch (error) {
    canvas.dataset.error = error.message;
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = '背景导出失败：' + error.message;
    canvas.hidden = true;
    canvas.after(message);
    return {ready: false, error: error.message};
  }
})();
