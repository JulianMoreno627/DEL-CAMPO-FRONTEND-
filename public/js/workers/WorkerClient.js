/**
 * Turns a Web Worker's message-based communication (postMessage/onmessage)
 * into calls that return Promises, pairing every response with its request by id.
 * The worker is created lazily (only when it is used for the first time).
 */
export class WorkerClient {
  #worker = null;
  #pending = new Map();
  #sequence = 0;

  constructor(url) {
    this.url = url;
  }

  #getWorker() {
    if (this.#worker) return this.#worker;
    this.#worker = new Worker(this.url, { type: 'module' });
    this.#worker.onmessage = ({ data }) => {
      const pending = this.#pending.get(data.id);
      if (!pending) return;
      this.#pending.delete(data.id);
      if (data.ok) pending.resolve(data);
      else pending.reject(new Error(data.error));
    };
    this.#worker.onerror = (e) => {
      for (const p of this.#pending.values()) p.reject(new Error(e.message || 'Error en el worker'));
      this.#pending.clear();
    };
    return this.#worker;
  }

  /**
   * @param {object} message
   * @param {Transferable[]} [transferables] objects moved without copying (e.g. ArrayBuffer)
   */
  run(message, transferables = []) {
    const id = ++this.#sequence;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#getWorker().postMessage({ ...message, id }, transferables);
    });
  }

  terminate() {
    this.#worker?.terminate();
    this.#worker = null;
  }
}
