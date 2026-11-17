/**
 * Light / dark theme. Light is the default; the user can switch to dark and the choice is kept
 * in this browser (localStorage). index.html applies it before the first paint (no white flash);
 * this module changes it and tells the rest of the app with a "themechange" event.
 */
const STORAGE_KEY = 'theme';
/** Browser bar color (meta theme-color) of each theme: the color of the header. */
const BAR_COLORS = { light: '#ffffff', dark: '#16201a' };

/** @returns {'light'|'dark'} */
export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** @param {'light'|'dark'} theme */
export function setTheme(theme) {
  const value = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = value;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLORS[value]);
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* private mode: it lasts until the page closes */ }
  window.dispatchEvent(new CustomEvent('themechange', { detail: value }));
}

export function toggleTheme() {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}
