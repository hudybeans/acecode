import { validThemeHexColor } from './themePackages.js';

export function themeLogoRgb(color) {
  if (!validThemeHexColor(color)) throw new TypeError('Invalid theme logo color');
  return [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16) / 255);
}

// Keep these RGB channel blends aligned with the custom paint in the home shader.
// No hue/saturation division is needed, including for black, white, and gray.
export function themeLogoPalette(color) {
  const rgb = themeLogoRgb(color);
  const hex = (channels) => `#${channels.map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`;
  const tint = (amount) => hex(rgb.map((channel) => channel + (1 - channel) * amount));
  return {
    light: tint(0.42),
    mid: tint(0.14),
    base: color,
    deep: hex(rgb.map((channel) => channel * 0.42)),
    highlight: tint(0.80),
  };
}

export function themeLogoDataUrl(svg, color) {
  const palette = themeLogoPalette(color);
  // The source is the bundled branding SVG, never theme-supplied markup. Only
  // fixed color literals change; geometry, clipping and the white mark survive.
  const replacements = {
    '#38D5F7': palette.light,
    '#1687DA': palette.mid,
    '#2563EB': palette.base,
    '#082A52': palette.deep,
    '#A5F3FC': palette.highlight,
    '#E0F2FE': '#F1F1F1',
    '#CFFAFE': '#FFFFFF',
    '#67E8F9': '#ECECEC',
    '#020617': '#080808',
    '#031B36': '#151515',
  };
  const colored = svg.replace(/#[0-9A-F]{6}/gi, (hex) => replacements[hex.toUpperCase()] || hex);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colored)}`;
}
