/**
 * Offline-first para el productor.
 *
 * 1. Cada cambio se guarda primero en IndexedDB (cola "outbox") y se aplica a la copia local
 *    → la interfaz responde al instante aunque no haya señal (actualización optimista).
 * 2. Cuando vuelve la conexión (evento "online", Background Sync del Service Worker o reintento)
 *    se envía el lote a POST /api/sync.
 * 3. El servidor resuelve conflictos campo por campo (Last-Writer-Wins con la hora en que se hizo
 *    el cambio) y devuelve la versión final de cada cosecha, que reemplaza la copia local.
 *
 * Emite eventos (Observer): 'estado' {pendientes, sincronizando}, 'avisos' [mensajes], 'sincronizado'.
 */
export class GestorSincronizacion extends EventTarget {
  static ETIQUETA_SYNC = 'sincronizar-cosechas';
  static ESPERA_INICIAL_MS = 2000;
  static ESPERA_MAXIMA_MS = 60_000;

  #enCurso = null;
  #repetir = false;
  #espera = GestorSincronizacion.ESPERA_INICIAL_MS;
  #temporizador = null;

  /** @param {{ db: import('./BaseDatosLocal.js').BaseDatosLocal, api: import('../nucleo/ApiCliente.js').ApiCliente }} deps */
  constructor({ db, api }) {
    super();
    this.db = db;
    this.api = api;
    this.dispositivoId = GestorSincronizacion.#idDispositivo();
  }

  static #idDispositivo() {
    try {
      let id = localStorage.getItem('dispositivoId');
      if (!id) localStorage.setItem('dispositivoId', (id = crypto.randomUUID()));
      return id;
    } catch {
      return crypto.randomUUID();
    }
  }

  iniciar() {
    window.addEventListener('online', () => this.sincronizar());
    navigator.serviceWorker?.addEventListener('message', (e) => {
      if (e.data?.tipo === 'SINCRONIZAR') this.sincronizar();
    });
    this.#emitirEstado();
    if (navigator.onLine) this.sincronizar();
  }

  /** Registra un cambio hecho por el productor (funciona con o sin conexión). */
  async registrarCambio(tipo, entidadId, datos, productorId) {
    return this.#encolar({ tipo, entidadId, datos, productorId });
  }

  /** Las fotos (ya comprimidas) también esperan en la cola si no hay señal. */
  async registrarFoto(entidadId, blob, productorId) {
    return this.#encolar({ tipo: 'SUBIR_FOTO', entidadId, blob, productorId });
  }

  async #encolar(parcial) {
    const op = { opId: crypto.randomUUID(), marcaTiempo: new Date().toISOString(), ...parcial };
    await this.db.poner('outbox', op);
    await this.#aplicarLocal(op);
    await this.#emitirEstado();
    if (navigator.onLine) {
      this.sincronizar();
    } else {
      // Background Sync: el Service Worker avisará cuando vuelva la señal, aunque la pestaña esté en segundo plano
      try { await (await navigator.serviceWorker?.ready)?.sync?.register(GestorSincronizacion.ETIQUETA_SYNC); } catch { /* no soportado */ }
    }
    return op;
  }

  sincronizar() {
    if (this.#enCurso) {
      this.#repetir = true;
      return this.#enCurso;
    }
    this.#enCurso = (async () => {
      try {
        await this.#ejecutar();
      } finally {
        this.#enCurso = null;
        await this.#emitirEstado();
        if (this.#repetir) {
          this.#repetir = false;
          this.sincronizar();
        }
      }
    })();
    return this.#enCurso;
  }

  async #ejecutar() {
    const ops = (await this.db.todos('outbox')).sort((a, b) => a.marcaTiempo.localeCompare(b.marcaTiempo));
    if (!ops.length) return;
    clearTimeout(this.#temporizador);
    this.dispatchEvent(new CustomEvent('estado', { detail: { pendientes: ops.length, sincronizando: true } }));
    const avisos = [];

    try {
      // 1) Operaciones de datos, agrupadas por productor (el teléfono puede ser compartido en la finca)
      const porProductor = Map.groupBy(ops.filter((o) => o.tipo !== 'SUBIR_FOTO'), (o) => o.productorId);
      for (const [productorId, lote] of porProductor) {
        const { resultados } = await this.api.post('/api/sync', {
          operaciones: lote.map(({ opId, tipo, entidadId, datos, marcaTiempo }) => ({ opId, tipo, entidadId, datos, marcaTiempo })),
        }, { usuarioId: productorId, cabeceras: { 'X-Dispositivo-Id': this.dispositivoId } });

        for (const r of resultados) {
          await this.db.borrar('outbox', r.opId);
          if (r.entidad) await this.db.poner('cosechas', { ...r.entidad, _pendiente: false });
          else if (r.tipo === 'CREAR_COSECHA') await this.db.borrar('cosechas', r.entidadId);
          if (r.estado !== 'APLICADA') avisos.push(GestorSincronizacion.#describir(r));
        }
      }

      // 2) Fotos, después de que sus cosechas ya existen en el servidor
      for (const op of ops.filter((o) => o.tipo === 'SUBIR_FOTO')) {
        try {
          const cosecha = await this.api.post(`/api/cosechas/${encodeURIComponent(op.entidadId)}/foto`, op.blob, { usuarioId: op.productorId });
          await this.db.poner('cosechas', { ...cosecha, _pendiente: false });
          await this.db.borrar('outbox', op.opId);
        } catch (error) {
          if (error.esTransitorio) throw error;
          await this.db.borrar('outbox', op.opId);
          avisos.push(`No se pudo subir una foto: ${error.message}`);
        }
      }
      this.#espera = GestorSincronizacion.ESPERA_INICIAL_MS;
    } catch (error) {
      if (error.esTransitorio) {
        // Reintento con espera exponencial: 2 s, 4 s, 8 s … hasta 60 s (no agota batería ni datos)
        this.#temporizador = setTimeout(() => this.sincronizar(), this.#espera);
        this.#espera = Math.min(this.#espera * 2, GestorSincronizacion.ESPERA_MAXIMA_MS);
      } else {
        avisos.push(`Error al sincronizar: ${error.message}`);
      }
    } finally {
      // Las operaciones que siguen en cola se vuelven a aplicar sobre la versión del servidor
      for (const op of await this.db.todos('outbox')) await this.#aplicarLocal(op);
      if (avisos.length) this.dispatchEvent(new CustomEvent('avisos', { detail: avisos }));
      this.dispatchEvent(new Event('sincronizado'));
    }
  }

  static #describir(r) {
    const nombre = r.entidad?.producto ?? 'una cosecha';
    if (r.estado === 'PARCIAL') {
      return `Conflicto en ${nombre}: otro dispositivo cambió después ${r.conflictos.join(', ')}; se conservó ese valor.`;
    }
    return `Cambio rechazado en ${nombre}: ${r.mensaje ?? `campos con conflicto: ${r.conflictos?.join(', ')}`}`;
  }

  /** Actualización optimista de la copia local. */
  async #aplicarLocal(op) {
    if (op.tipo === 'CREAR_COSECHA') {
      await this.db.poner('cosechas', {
        ...op.datos, id: op.entidadId, productorId: op.productorId, version: 0,
        cantidadReservada: 0, cantidadLibre: op.datos.cantidadEstimada, _pendiente: true,
      });
      return;
    }
    const actual = await this.db.obtener('cosechas', op.entidadId);
    if (!actual) return;
    if (op.tipo === 'SUBIR_FOTO') {
      await this.db.poner('cosechas', { ...actual, _fotoPendiente: true, _pendiente: true });
      return;
    }
    const nueva = { ...actual, ...op.datos, _pendiente: true };
    nueva.cantidadLibre = nueva.cantidadEstimada - (nueva.cantidadReservada ?? 0);
    await this.db.poner('cosechas', nueva);
  }

  async #emitirEstado() {
    const pendientes = await this.db.contar('outbox');
    this.dispatchEvent(new CustomEvent('estado', { detail: { pendientes, sincronizando: Boolean(this.#enCurso) } }));
  }
}
