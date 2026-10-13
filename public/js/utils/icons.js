import { SafeHtml } from './format.js';

/**
 * Inline SVG icons (24×24 strokes that inherit the text color through currentColor).
 * They live inside the JS: zero extra requests and they look sharp on any screen.
 */
const PATHS = {
  leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19c3-4 6-7 10-9"/>',
  sprout: '<path d="M12 21v-8"/><path d="M12 13c-4 0-7-3-7-8 4 0 7 3 7 8z"/><path d="M12 15c0-4 3-7 7-7 0 4-3 7-7 7z"/><path d="M4 21h16"/>',
  basket: '<path d="M3 10h18l-2 10H5L3 10z"/><path d="M8 10l4-6 4 6"/><path d="M9 14v3M12 14v3M15 14v3"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2.4 11h10.2L20 8H6.2"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
};

export function icon(name, { size = 20, className = '' } = {}) {
  return new SafeHtml(`<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`);
}
