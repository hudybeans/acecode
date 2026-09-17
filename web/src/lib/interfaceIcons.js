import { controlIcons } from './icons/controls.js';
import { systemIcons } from './icons/system.js';

export const ICON_VIEW_BOX = 20;
export const INTERFACE_ICONS = Object.freeze({ ...controlIcons, ...systemIcons });

export function iconStrokePixels(size = 16, strong = false) {
  const px = typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : 16;
  return (px * 0.05 + 0.2) * (strong ? 1.25 : 1);
}

// Convert the requested CSS-pixel stroke to canonical drawing coordinates.
export function iconStrokeWidth(size = 16, strong = false) {
  const px = typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : 16;
  return Number((iconStrokePixels(px, strong) * ICON_VIEW_BOX / px).toFixed(6));
}

const attributeName = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const escapeAttribute = (value) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');

export function interfaceIconSvg(name, size = 20, strong = false) {
  const shapes = INTERFACE_ICONS[name];
  if (!shapes) throw new Error(`Unknown interface icon: ${name}`);
  const body = shapes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([key, value]) => `${attributeName(key)}="${escapeAttribute(value)}"`).join(' ')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="${iconStrokeWidth(size, strong)}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`;
}
