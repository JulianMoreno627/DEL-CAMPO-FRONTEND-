/**
 * Enrutador del lado del cliente (CSR) basado en el hash de la URL.
 * Cada vista se carga con import() dinámico → code splitting: el usuario solo descarga
 * el JS de la sección que abre (menos datos móviles, mejor tiempo de carga inicial).
 * Mide cuánto tarda cada vista con performance.mark/measure (User Timing API).
 */
export class Router {
  #turno = 0;

  /**
   * @param {HTMLElement} contenedor
   * @param {Record<string, () => Promise<{default: typeof import('./Componente.js').Componente}>>} rutas
   * @param {object} contexto dependencias que se inyectan a cada vista
   */
  constructor(contenedor, rutas, contexto, { rutaPorDefecto = '/catalogo' } = {}) {
    this.contenedor = contenedor;
    this.rutas = rutas;
    this.contexto = contexto;
    this.rutaPorDefecto = rutaPorDefecto;
    this.actual = null;
  }

  iniciar() {
    window.addEventListener('hashchange', () => this.resolver());
    return this.resolver();
  }

  /** Vuelve a montar la vista actual (p. ej. al cambiar de usuario). */
  recargar() {
    return this.resolver();
  }

  async resolver() {
    const turno = ++this.#turno;
    const [ruta, consulta = ''] = location.hash.slice(1).split('?');
    const camino = this.rutas[ruta] ? ruta : this.rutaPorDefecto;
    const marca = `vista:${camino}:${turno}`;
    performance.mark(marca);

    let Vista;
    try {
      ({ default: Vista } = await this.rutas[camino]());
    } catch {
      this.contenedor.innerHTML = '<p class="tarjeta">No se pudo cargar esta sección sin conexión.</p>';
      return;
    }
    if (turno !== this.#turno) return; // el usuario ya navegó a otra parte

    this.actual?.desmontar();
    this.actual = new Vista({ ...this.contexto, consulta: new URLSearchParams(consulta) });
    this.#marcarEnlaceActivo(camino);
    await this.actual.montar(this.contenedor);
    performance.measure(`vista ${camino}`, marca);
  }

  #marcarEnlaceActivo(camino) {
    for (const a of document.querySelectorAll('[data-ruta]')) {
      a.classList.toggle('activa', a.dataset.ruta === camino);
      if (a.dataset.ruta === camino) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }
}
