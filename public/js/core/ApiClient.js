export class ApiError extends Error {
  constructor(message, status, body = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  /** Transient error worth retrying: no response (status 0: no signal or timeout) or a server failure. */
  get isTransient() {
    return this.status === 0 || this.status >= 500;
  }
}

/** HTTP client for the REST backend. Wraps the base URL, session token, JSON and timeouts. */
export class ApiClient {
  /**
   * @param {string} baseUrl
   * @param {{ getToken: () => string|null, onUnauthorized?: () => void, timeoutMs?: number }} options
   */
  constructor(baseUrl, { getToken, onUnauthorized = () => {}, timeoutMs = 10_000 }) {
    this.baseUrl = baseUrl;
    this.getToken = getToken;
    this.onUnauthorized = onUnauthorized;
    this.timeoutMs = timeoutMs; // in rural areas a hanging request is worse than a quick error
  }

  url(route) {
    return this.baseUrl + route;
  }

  async request(method, route, { body, headers: extraHeaders = {} } = {}) {
    const headers = { ...extraHeaders };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let payload;
    if (body instanceof Blob) {
      payload = body;
      headers['Content-Type'] = body.type;
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await fetch(this.url(route), { method, headers, body: payload, signal: controller.signal });
    } catch {
      throw new ApiError('Sin conexión con el servidor', 0);
    } finally {
      clearTimeout(timer);
    }

    const data = response.status === 204 ? null : await response.json().catch(() => null);
    // Expired token or one signed by a restarted server: the user has to log in again
    if (response.status === 401 && token) this.onUnauthorized();
    if (!response.ok) throw new ApiError(data?.error ?? `Error ${response.status}`, response.status, data);
    return data;
  }

  get(route, options) { return this.request('GET', route, options); }
  post(route, body, options) { return this.request('POST', route, { ...options, body }); }
  patch(route, body, options) { return this.request('PATCH', route, { ...options, body }); }
  delete(route, options) { return this.request('DELETE', route, options); }
}
