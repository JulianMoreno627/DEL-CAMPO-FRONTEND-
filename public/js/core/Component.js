/**
 * Base class for every view and component (no framework, to keep the app light).
 * Life cycle: mount() → template() → onMount() … update() … unmount().
 * Subclasses override template() (polymorphism) and use on() to delegate events.
 */
export class Component {
  #cleanups = [];

  constructor(props = {}) {
    if (new.target === Component) throw new TypeError('Component is abstract');
    this.props = props;
    this.state = {};
    this.el = document.createElement('section');
  }

  /** @returns {import('../utils/format.js').SafeHtml | string} */
  template() {
    throw new Error(`${this.constructor.name} must implement template()`);
  }

  setState(partial) {
    this.state = { ...this.state, ...partial };
    this.update();
  }

  update() {
    this.el.innerHTML = String(this.template());
    this.onUpdate?.();
  }

  async mount(container) {
    container.replaceChildren(this.el);
    this.update();
    await this.onMount?.();
  }

  unmount() {
    this.#cleanups.forEach((fn) => fn());
    this.#cleanups = [];
    this.onUnmount?.();
  }

  /** Event delegation: a single listener on the root survives re-renders. */
  on(type, selector, handler) {
    const fn = (event) => {
      const target = event.target.closest(selector);
      if (target && this.el.contains(target)) handler(event, target);
    };
    this.el.addEventListener(type, fn);
    this.#cleanups.push(() => this.el.removeEventListener(type, fn));
  }

  /** Subscription to an external object that is released automatically on unmount. */
  listen(target, type, fn) {
    target.addEventListener(type, fn);
    this.#cleanups.push(() => target.removeEventListener(type, fn));
  }

  onCleanup(fn) {
    this.#cleanups.push(fn);
  }

  $(selector) {
    return this.el.querySelector(selector);
  }
}
