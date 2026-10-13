/**
 * Estado global de la aplicación (patrón Observer).
 * Los componentes se suscriben y reaccionan a los cambios: usuario actual, conexión, pendientes de sincronizar.
 */
export class Almacen extends EventTarget {
  #estado;

  constructor(inicial = {}) {
    super();
    this.#estado = Object.freeze({ ...inicial });
  }

  get estado() {
    return this.#estado;
  }

  actualizar(parcial) {
    this.#estado = Object.freeze({ ...this.#estado, ...parcial });
    this.dispatchEvent(new CustomEvent('cambio', { detail: this.#estado }));
  }

  /** @returns {() => void} función para cancelar la suscripción */
  suscribir(fn) {
    const manejador = (e) => fn(e.detail);
    this.addEventListener('cambio', manejador);
    return () => this.removeEventListener('cambio', manejador);
  }
}
