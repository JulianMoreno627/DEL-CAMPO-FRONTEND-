import { API_URL } from './config.js';
import { Store } from './core/Store.js';
import { ApiClient } from './core/ApiClient.js';
import { Router } from './core/Router.js';
import { PerformanceMonitor } from './metrics/PerformanceMonitor.js';
import { WorkerClient } from './workers/WorkerClient.js';
import { html } from './utils/format.js';
import { icon } from './utils/icons.js';
import { avatar, roleLabel } from './utils/avatar.js';
import { currentTheme, toggleTheme } from './core/theme.js';

// 1) Metrics first, so FCP/LCP of the initial load are not lost
const monitor = new PerformanceMonitor({ reportUrl: `${API_URL}/api/metrics` });
monitor.start();

// 2) Service Worker: app shell cache and per-resource strategies
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service Worker not registered', e));
}

// Cleanup of data left by previous versions of the app (demo user picker, offline queue, old session key)
try {
  localStorage.removeItem('usuarioId');
  localStorage.removeItem('sesion');
} catch { /* private mode */ }
indexedDB?.deleteDatabase('del-campo');

// ---- Session: { token, user } saved in the browser so the password is not asked every time
const SESSION_KEY = 'session';
function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) ?? null; } catch { return null; }
}

const saved = readSession();
const store = new Store({ user: saved?.user ?? null, token: saved?.token ?? null, cartCount: 0 });
const api = new ApiClient(API_URL, {
  getToken: () => store.state.token,
  onUnauthorized: () => {
    endSession();
    notify('Su sesión venció. Ingrese de nuevo.', 'error');
  },
});

/** Home route of each profile (the routes stay in Spanish because users see them). */
const HOME = { PRODUCER: '/mis-anuncios', BUYER: '/productos' };

function startSession({ token, user }) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user })); } catch { /* private mode */ }
  store.update({ token, user, cartCount: 0 });
  if (user.role === 'BUYER') refreshCartCount();
  location.hash = `#${HOME[user.role]}`;
}

function endSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* private mode */ }
  store.update({ token: null, user: null, cartCount: 0 });
  location.hash = '#/entrar';
}

async function refreshCartCount() {
  try {
    const { items } = await api.get('/api/cart');
    store.update({ cartCount: items.length });
  } catch { /* no connection: keep the previous number */ }
}

function notify(message, type = 'info') {
  const el = Object.assign(document.createElement('div'), { className: `toast ${type}`, textContent: message });
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), type === 'error' ? 7000 : 4000);
}

// ---- Header and sections according to the profile (subscribed to the Store)
const SECTIONS = {
  PRODUCER: [['/mis-anuncios', 'Mis productos', 'sprout'], ['/pedidos', 'Pedidos recibidos', 'receipt']],
  BUYER: [['/productos', 'Productos', 'basket'], ['/carrito', 'Carrito', 'cart'], ['/pedidos', 'Mis pedidos', 'receipt']],
};
const nav = document.getElementById('nav');
const account = document.getElementById('account');
let renderedKey;
let router = null; // created below; the header marks the active section through it

/** The profile changed (data or photo): saved in the session so it survives a reload. */
function updateSessionUser(user) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ token: store.state.token, user })); } catch { /* private mode */ }
  store.update({ user });
}

function renderHeader({ user, cartCount }) {
  // Re-render only when what the header shows changes (not on every cart update)
  const key = user ? `${user.id}|${user.name}|${user.avatar ?? ''}` : '';
  if (key !== renderedKey) {
    renderedKey = key;
    nav.hidden = !user;
    nav.innerHTML = user ? String(html`${SECTIONS[user.role].map(([route, text, iconName]) =>
      html`<a href="#${route}" data-route="${route}">${icon(iconName, { size: 18 })}${text}${route === '/carrito' ? html`<span id="cart-badge" class="badge"></span>` : ''}</a>`)}`) : '';
    account.innerHTML = String(user ? accountMenu(user) : themeButton());
    router?.markActiveLink();
  }
  const badge = document.getElementById('cart-badge');
  if (badge) badge.textContent = cartCount ? String(cartCount) : '';
}

/** Logged in: photo, name and a menu with the profile, the theme and the logout. */
function accountMenu(user) {
  return html`
<div class="account-menu">
  <button class="account-button" type="button" data-action="toggle-menu" aria-haspopup="menu" aria-expanded="false" aria-controls="account-popover">
    ${avatar(user, API_URL, { size: 36 })}
    <span class="account-text"><b>${user.name}</b><small>${roleLabel(user.role)}</small></span>
    ${icon('chevron', { size: 16, className: 'chevron' })}
  </button>
  <div class="account-popover" id="account-popover" role="menu" hidden>
    <div class="account-popover-header">
      ${avatar(user, API_URL, { size: 46 })}
      <div><b>${user.name}</b><small>${roleLabel(user.role)}</small></div>
    </div>
    <a role="menuitem" href="#/perfil" data-action="close-menu">${icon('user', { size: 18 })}Mi perfil</a>
    <button role="menuitemcheckbox" type="button" data-action="toggle-theme" class="theme-item">${themeLabel()}</button>
    <button role="menuitem" type="button" data-action="logout" class="danger-item">${icon('logout', { size: 18 })}Cerrar sesión</button>
  </div>
</div>`;
}

/** Logged out: only the theme switch. */
const themeButton = () => html`<button class="icon-btn theme-toggle" type="button" data-action="toggle-theme" aria-label="Cambiar tema">${icon(currentTheme() === 'dark' ? 'sun' : 'moon', { size: 18 })}</button>`;

function themeLabel() {
  const dark = currentTheme() === 'dark';
  return html`${icon(dark ? 'sun' : 'moon', { size: 18 })}<span>${dark ? 'Modo claro' : 'Modo oscuro'}</span><span class="switch ${dark ? 'on' : ''}" aria-hidden="true"></span>`;
}

function toggleMenu(open) {
  const popover = document.getElementById('account-popover');
  const button = account.querySelector('[data-action="toggle-menu"]');
  if (!popover) return;
  const show = open ?? popover.hidden;
  popover.hidden = !show;
  button.setAttribute('aria-expanded', String(show));
}

account.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'toggle-menu') toggleMenu();
  if (action === 'toggle-theme') toggleTheme();
  if (action === 'close-menu') toggleMenu(false);
  if (action === 'logout') { toggleMenu(false); endSession(); }
});
// Close the menu when clicking outside or with Escape
document.addEventListener('click', (e) => { if (!account.contains(e.target)) toggleMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleMenu(false); });
// The theme changed (from the menu or the profile page): update the controls without closing the menu
window.addEventListener('themechange', () => {
  const item = account.querySelector('.theme-item');
  if (item) item.innerHTML = String(themeLabel());
  else account.innerHTML = String(store.state.user ? accountMenu(store.state.user) : themeButton());
});
store.subscribe(renderHeader);
renderHeader(store.state);
if (store.state.user?.role === 'BUYER') refreshCartCount();

// Workers are created on first use (WorkerClient is lazy)
const workers = {
  geo: new WorkerClient(new URL('./workers/geo.worker.js', import.meta.url)),
  image: new WorkerClient(new URL('./workers/image.worker.js', import.meta.url)),
};

// ---- CSR router with views loaded on demand (code splitting)
/** Who may enter each section: one profile, anyone logged in, only logged out, or everyone. */
const ACCESS = {
  '/entrar': 'LOGGED_OUT',
  '/mis-anuncios': 'PRODUCER',
  '/productos': 'BUYER',
  '/carrito': 'BUYER',
  '/pedidos': 'LOGGED_IN',
  '/rendimiento': 'EVERYONE',
};

function guard(route) {
  const { user } = store.state;
  const access = ACCESS[route];
  if (access === 'EVERYONE') return route;
  if (!user) return '/entrar';
  if (access === 'LOGGED_IN' || access === user.role) return route;
  return HOME[user.role];
}

router = new Router(document.getElementById('view'), {
  '/entrar': () => import('./views/LoginView.js'),
  '/mis-anuncios': () => import('./views/MyProductsView.js'),
  '/productos': () => import('./views/ProductsView.js'),
  '/carrito': () => import('./views/CartView.js'),
  '/pedidos': () => import('./views/OrdersView.js'),
  '/rendimiento': () => import('./views/PerformanceView.js'),
}, {
  store, api, monitor, workers, notify, apiUrl: API_URL,
  startSession, refreshCartCount, updateSessionUser,
}, { guard });

await router.start();
