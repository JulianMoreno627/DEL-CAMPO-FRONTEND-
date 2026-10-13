/**
 * Client-side router (CSR) based on the URL hash.
 * Each view is loaded with a dynamic import() → code splitting: the user only downloads
 * the JS of the section they open (less mobile data, better initial load time).
 * Measures how long each view takes with performance.mark/measure (User Timing API).
 * The routes themselves (#/productos, #/carrito…) stay in Spanish because users see them in the address bar.
 */
export class Router {
  #turn = 0;

  /**
   * @param {HTMLElement} container
   * @param {Record<string, () => Promise<{default: typeof import('./Component.js').Component}>>} routes
   * @param {object} context dependencies injected into every view
   * @param {object} options
   * @param {(route: string) => string} [options.guard] decides which route the current user may enter
   */
  constructor(container, routes, context, { defaultRoute = '/entrar', guard = (route) => route } = {}) {
    this.container = container;
    this.routes = routes;
    this.context = context;
    this.defaultRoute = defaultRoute;
    this.guard = guard;
    this.current = null;
  }

  start() {
    window.addEventListener('hashchange', () => this.resolve());
    return this.resolve();
  }

  /** Mounts the current view again. */
  reload() {
    return this.resolve();
  }

  async resolve() {
    const turn = ++this.#turn;
    const [requested, query = ''] = location.hash.slice(1).split('?');
    const route = this.guard(this.routes[requested] ? requested : this.defaultRoute);
    // Without a session, or with the wrong profile, the guard redirects: the URL is fixed without adding history
    if (route !== requested) history.replaceState(null, '', `#${route}`);
    const mark = `view:${route}:${turn}`;
    performance.mark(mark);

    let View;
    try {
      ({ default: View } = await this.routes[route]());
    } catch {
      this.container.innerHTML = '<p class="card">No se pudo cargar esta sección sin conexión.</p>';
      return;
    }
    if (turn !== this.#turn) return; // the user already navigated somewhere else

    this.current?.unmount();
    this.current = new View({ ...this.context, query: new URLSearchParams(query) });
    this.#markActiveLink(route);
    await this.current.mount(this.container);
    performance.measure(`view ${route}`, mark);
  }

  #markActiveLink(route) {
    for (const a of document.querySelectorAll('[data-route]')) {
      a.classList.toggle('active', a.dataset.route === route);
      if (a.dataset.route === route) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }
}
