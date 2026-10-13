/** URL del backend: se lee del <meta name="api-url"> y se puede sobrescribir con localStorage.apiUrl. */
function leerGuardada() {
  try { return localStorage.getItem('apiUrl'); } catch { return null; }
}

export const API_URL = (leerGuardada()
  ?? document.querySelector('meta[name="api-url"]')?.content
  ?? 'http://localhost:3000').replace(/\/$/, '');
