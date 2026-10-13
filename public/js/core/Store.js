/**
 * Global application state (Observer pattern).
 * Components subscribe and react to changes: current user, session token, cart badge.
 */
export class Store extends EventTarget {
  #state;

  constructor(initial = {}) {
    super();
    this.#state = Object.freeze({ ...initial });
  }

  get state() {
    return this.#state;
  }

  update(partial) {
    this.#state = Object.freeze({ ...this.#state, ...partial });
    this.dispatchEvent(new CustomEvent('change', { detail: this.#state }));
  }

  /** @returns {() => void} function that cancels the subscription */
  subscribe(fn) {
    const handler = (e) => fn(e.detail);
    this.addEventListener('change', handler);
    return () => this.removeEventListener('change', handler);
  }
}
