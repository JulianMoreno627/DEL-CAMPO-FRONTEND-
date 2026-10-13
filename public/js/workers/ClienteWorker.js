/**
 * Convierte la comunicación por mensajes (postMessage/onmessage) de un Web Worker
 * en llamadas que devuelven Promises, emparejando cada respuesta con su petición por id.
 * El worker se crea perezosamente (solo cuando se usa por primera vez).
 */
export class ClienteWorker {
  #worker = null;
  #pendientes = new Map();
  #secuencia = 0;

  constructor(url) {
    this.url = url;
  }

  #obtenerWorker() {
    if (this.#worker) return this.#worker;
    this.#worker = new Worker(this.url, { type: 'module' });
    this.#worker.onmessage = ({ data }) => {
      const pendiente = this.#pendientes.get(data.id);
      if (!pendiente) return;
      this.#pendientes.delete(data.id);
      if (data.ok) pendiente.resolver(data);
      else pendiente.rechazar(new Error(data.error));
    };
    this.#worker.onerror = (e) => {
      for (const p of this.#pendientes.values()) p.rechazar(new Error(e.message || 'Error en el worker'));
      this.#pendientes.clear();
    };
    return this.#worker;
  }

  /**
   * @param {object} mensaje
   * @param {Transferable[]} [transferibles] objetos que se mueven sin copiarse (p. ej. ArrayBuffer)
   */
  ejecutar(mensaje, transferibles = []) {
    const id = ++this.#secuencia;
    return new Promise((resolver, rechazar) => {
      this.#pendientes.set(id, { resolver, rechazar });
      this.#obtenerWorker().postMessage({ ...mensaje, id }, transferibles);
    });
  }

  terminar() {
    this.#worker?.terminate();
    this.#worker = null;
  }
}
