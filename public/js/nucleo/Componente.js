/**
 * Clase base de todas las vistas y componentes (sin framework, para mantener la app liviana).
 * Ciclo de vida: montar() → plantilla() → alMontar() … actualizar() … desmontar().
 * Las subclases redefinen plantilla() (polimorfismo) y usan on() para delegar eventos.
 */
export class Componente {
  #limpiezas = [];

  constructor(props = {}) {
    if (new.target === Componente) throw new TypeError('Componente es abstracta');
    this.props = props;
    this.estado = {};
    this.el = document.createElement('section');
  }

  /** @returns {import('../utilidades/formato.js').HtmlSeguro | string} */
  plantilla() {
    throw new Error(`${this.constructor.name} debe implementar plantilla()`);
  }

  setEstado(parcial) {
    this.estado = { ...this.estado, ...parcial };
    this.actualizar();
  }

  actualizar() {
    this.el.innerHTML = String(this.plantilla());
    this.alActualizar?.();
  }

  async montar(contenedor) {
    contenedor.replaceChildren(this.el);
    this.actualizar();
    await this.alMontar?.();
  }

  desmontar() {
    this.#limpiezas.forEach((f) => f());
    this.#limpiezas = [];
    this.alDesmontar?.();
  }

  /** Delegación de eventos: un solo listener en la raíz sobrevive a los re-renderizados. */
  on(tipo, selector, manejador) {
    const fn = (evento) => {
      const objetivo = evento.target.closest(selector);
      if (objetivo && this.el.contains(objetivo)) manejador(evento, objetivo);
    };
    this.el.addEventListener(tipo, fn);
    this.#limpiezas.push(() => this.el.removeEventListener(tipo, fn));
  }

  /** Suscripción a un objeto externo que se libera automáticamente al desmontar. */
  escuchar(objetivo, tipo, fn) {
    objetivo.addEventListener(tipo, fn);
    this.#limpiezas.push(() => objetivo.removeEventListener(tipo, fn));
  }

  alLimpiar(fn) {
    this.#limpiezas.push(fn);
  }

  $(selector) {
    return this.el.querySelector(selector);
  }
}
