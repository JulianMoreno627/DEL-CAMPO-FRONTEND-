/** Backend URL: read from <meta name="api-url"> and can be overridden with localStorage.apiUrl. */
function readSaved() {
  try { return localStorage.getItem('apiUrl'); } catch { return null; }
}

export const API_URL = (readSaved()
  ?? document.querySelector('meta[name="api-url"]')?.content
  ?? 'http://localhost:3000').replace(/\/$/, '');
