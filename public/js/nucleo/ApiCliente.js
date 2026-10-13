export class ErrorApi extends Error {
  constructor(mensaje, status, cuerpo = null) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
    this.cuerpo = cuerpo;
  }

  /** Error transitorio que vale la pena reintentar: sin respuesta (status 0: sin señal o timeout) o fallo del servidor. */
  get esTransitorio() {
    return this.status === 0 || this.status >= 500;
  }
}

/** Cliente HTTP del backend REST. Encapsula URL base, autenticación demo, JSON y timeouts. */
export class ApiCliente {
  /**
   * @param {string} baseUrl
   * @param {{ obtenerUsuarioId: () => string|null, timeoutMs?: number }} opciones
   */
  constructor(baseUrl, { obtenerUsuarioId, timeoutMs = 10_000 }) {
    this.baseUrl = baseUrl;
    this.obtenerUsuarioId = obtenerUsuarioId;
    this.timeoutMs = timeoutMs; // en zonas rurales una petición colgada es peor que un error rápido
  }

  url(ruta) {
    return this.baseUrl + ruta;
  }

  async solicitar(metodo, ruta, { cuerpo, usuarioId, cabeceras = {} } = {}) {
    const headers = { ...cabeceras };
    const uid = usuarioId ?? this.obtenerUsuarioId();
    if (uid) headers['X-Usuario-Id'] = uid;

    let body;
    if (cuerpo instanceof Blob) {
      body = cuerpo;
      headers['Content-Type'] = cuerpo.type;
    } else if (cuerpo !== undefined) {
      body = JSON.stringify(cuerpo);
      headers['Content-Type'] = 'application/json';
    }

    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), this.timeoutMs);
    let respuesta;
    try {
      respuesta = await fetch(this.url(ruta), { method: metodo, headers, body, signal: control.signal });
    } catch {
      throw new ErrorApi('Sin conexión con el servidor', 0);
    } finally {
      clearTimeout(temporizador);
    }

    const datos = respuesta.status === 204 ? null : await respuesta.json().catch(() => null);
    if (!respuesta.ok) throw new ErrorApi(datos?.error ?? `Error ${respuesta.status}`, respuesta.status, datos);
    return datos;
  }

  get(ruta, opciones) { return this.solicitar('GET', ruta, opciones); }
  post(ruta, cuerpo, opciones) { return this.solicitar('POST', ruta, { ...opciones, cuerpo }); }
  patch(ruta, cuerpo, opciones) { return this.solicitar('PATCH', ruta, { ...opciones, cuerpo }); }
}
