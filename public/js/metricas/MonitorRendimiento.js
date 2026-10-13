/** Umbrales de las Core Web Vitals (web.dev): [bueno, necesita mejora]. */
export const UMBRALES = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};

export const DESCRIPCION = {
  LCP: 'Largest Contentful Paint: cuándo se pinta el elemento principal',
  INP: 'Interaction to Next Paint: qué tan rápido responde a toques y clics',
  CLS: 'Cumulative Layout Shift: cuánto “salta” el contenido',
  FCP: 'First Contentful Paint: primer texto o imagen visible',
  TTFB: 'Time to First Byte: espera hasta el primer byte del servidor',
};

export function calificar(nombre, valor) {
  const [bueno, mejora] = UMBRALES[nombre];
  if (valor <= bueno) return 'BUENO';
  if (valor <= mejora) return 'NECESITA_MEJORA';
  return 'POBRE';
}

/**
 * Medición de rendimiento con usuarios reales (RUM) usando las APIs nativas del navegador
 * (PerformanceObserver), sin librerías. Calcula LCP, INP, CLS, FCP y TTFB, cuenta las tareas
 * largas (Long Tasks > 50 ms) y envía los valores al backend con navigator.sendBeacon
 * cuando la página se oculta (el beacon sobrevive al cierre de la pestaña).
 */
export class MonitorRendimiento extends EventTarget {
  #pendientesDeEnvio = new Set();
  #interacciones = new Map(); // interactionId -> duración máxima

  constructor({ urlReporte }) {
    super();
    this.urlReporte = urlReporte;
    this.valores = {};
    this.tareasLargas = { cantidad: 0, totalMs: 0 };
  }

  iniciar() {
    this.#observar('paint', (e) => {
      if (e.name === 'first-contentful-paint') this.#fijar('FCP', e.startTime);
    });

    this.#observar('largest-contentful-paint', (e) => this.#fijar('LCP', e.startTime));

    // CLS con "ventanas de sesión": ráfagas de cambios separadas < 1 s, de máximo 5 s; se toma la peor.
    let sesion = 0;
    let primera = 0;
    let ultima = 0;
    this.#observar('layout-shift', (e) => {
      if (e.hadRecentInput) return;
      if (sesion && e.startTime - ultima < 1000 && e.startTime - primera < 5000) {
        sesion += e.value;
      } else {
        sesion = e.value;
        primera = e.startTime;
      }
      ultima = e.startTime;
      if (sesion > (this.valores.CLS ?? 0)) this.#fijar('CLS', sesion);
    });
    if (this.valores.CLS == null) this.#fijar('CLS', 0);

    // INP: la interacción más lenta (ignorando 1 de cada 50 como valores atípicos)
    this.#observar('event', (e) => {
      if (!e.interactionId) return;
      if (e.duration <= (this.#interacciones.get(e.interactionId) ?? 0)) return;
      this.#interacciones.set(e.interactionId, e.duration);
      const duraciones = [...this.#interacciones.values()].sort((a, b) => b - a);
      this.#fijar('INP', duraciones[Math.min(duraciones.length - 1, Math.floor(duraciones.length / 50))]);
    }, { durationThreshold: 16 });

    this.#observar('longtask', (e) => {
      this.tareasLargas.cantidad += 1;
      this.tareasLargas.totalMs += e.duration;
      this.dispatchEvent(new Event('cambio'));
    });

    const navegacion = performance.getEntriesByType('navigation')[0];
    if (navegacion) this.#fijar('TTFB', navegacion.responseStart);

    addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.reportar();
    });
    addEventListener('pagehide', () => this.reportar());
  }

  #observar(tipo, fn, opciones = {}) {
    if (!PerformanceObserver.supportedEntryTypes?.includes(tipo)) return;
    new PerformanceObserver((lista) => lista.getEntries().forEach(fn)).observe({ type: tipo, buffered: true, ...opciones });
  }

  #fijar(nombre, valor) {
    this.valores[nombre] = valor;
    this.#pendientesDeEnvio.add(nombre);
    this.dispatchEvent(new Event('cambio'));
  }

  reportar() {
    if (!this.#pendientesDeEnvio.size || !navigator.sendBeacon) return;
    const lote = [...this.#pendientesDeEnvio].map((nombre) => ({
      nombre,
      valor: nombre === 'CLS' ? Number(this.valores[nombre].toFixed(4)) : Math.round(this.valores[nombre]),
      pagina: location.hash.split('?')[0] || '#/',
      conexion: navigator.connection?.effectiveType,
    }));
    this.#pendientesDeEnvio.clear();
    // text/plain es un tipo "simple": no dispara preflight CORS, por eso el beacon llega al backend en otro origen
    navigator.sendBeacon(this.urlReporte, new Blob([JSON.stringify(lote)], { type: 'text/plain' }));
  }

  /** Últimas peticiones a la API: duración total vs. tiempo de servidor (cabecera Server-Timing). */
  peticionesApi(limite = 12) {
    return performance.getEntriesByType('resource')
      .filter((r) => r.name.includes('/api/') && !r.name.includes('/api/metricas'))
      .slice(-limite)
      .reverse()
      .map((r) => {
        const servidor = r.serverTiming?.find((s) => s.name === 'app')?.duration;
        return {
          ruta: new URL(r.name).pathname,
          total: r.duration,
          servidor: servidor ?? null,
          red: servidor != null ? Math.max(0, r.duration - servidor) : null,
          bytes: r.transferSize,
          desdeCache: r.transferSize === 0 && r.decodedBodySize > 0,
        };
      });
  }

  /** Tiempos de renderizado de cada vista (performance.measure del Router). */
  tiemposDeVistas() {
    return performance.getEntriesByType('measure')
      .filter((m) => m.name.startsWith('vista '))
      .slice(-10)
      .reverse()
      .map((m) => ({ vista: m.name.slice(6), milisegundos: m.duration }));
  }
}
