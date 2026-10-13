/**
 * Envoltura orientada a objetos (con Promises) sobre IndexedDB.
 * Almacenes:
 *  - cosechas: copia local de las cosechas del productor (se puede editar sin señal)
 *  - outbox:   cola de operaciones pendientes de enviar al servidor (patrón Outbox)
 *  - cache:    datos varios (lista de usuarios, último catálogo, etc.)
 */
export class BaseDatosLocal {
  static NOMBRE = 'del-campo';
  static VERSION = 1;

  #db = null;

  async abrir() {
    this.#db = await new Promise((resolver, rechazar) => {
      const peticion = indexedDB.open(BaseDatosLocal.NOMBRE, BaseDatosLocal.VERSION);
      peticion.onupgradeneeded = () => {
        const db = peticion.result;
        if (!db.objectStoreNames.contains('cosechas')) {
          db.createObjectStore('cosechas', { keyPath: 'id' }).createIndex('productorId', 'productorId');
        }
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'opId' }).createIndex('entidadId', 'entidadId');
        }
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'clave' });
      };
      peticion.onsuccess = () => resolver(peticion.result);
      peticion.onerror = () => rechazar(peticion.error);
    });
    return this;
  }

  #transaccion(almacen, modo, operacion) {
    return new Promise((resolver, rechazar) => {
      const tx = this.#db.transaction(almacen, modo);
      const peticion = operacion(tx.objectStore(almacen));
      tx.oncomplete = () => resolver(peticion?.result);
      tx.onerror = () => rechazar(tx.error);
      tx.onabort = () => rechazar(tx.error);
    });
  }

  obtener(almacen, clave) {
    return this.#transaccion(almacen, 'readonly', (s) => s.get(clave));
  }

  todos(almacen, indice, valor) {
    return this.#transaccion(almacen, 'readonly', (s) => (indice ? s.index(indice).getAll(valor) : s.getAll()));
  }

  poner(almacen, valor) {
    return this.#transaccion(almacen, 'readwrite', (s) => s.put(valor));
  }

  borrar(almacen, clave) {
    return this.#transaccion(almacen, 'readwrite', (s) => s.delete(clave));
  }

  contar(almacen) {
    return this.#transaccion(almacen, 'readonly', (s) => s.count());
  }

  guardarCache(clave, valor) {
    return this.poner('cache', { clave, valor, guardadoEn: Date.now() });
  }

  async leerCache(clave) {
    return (await this.obtener('cache', clave))?.valor;
  }
}
