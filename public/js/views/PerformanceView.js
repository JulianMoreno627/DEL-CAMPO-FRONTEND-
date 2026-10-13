import { Component } from '../core/Component.js';
import { html, formatBytes } from '../utils/format.js';
import { heavyCalculation } from '../utils/geo.js';
import { THRESHOLDS, DESCRIPTION, rate } from '../metrics/PerformanceMonitor.js';

const RATING_LABEL = { GOOD: 'Bueno', NEEDS_IMPROVEMENT: 'Necesita mejora', POOR: 'Pobre' };
const formatMetric = (name, value) => (value == null ? '—' : name === 'CLS' ? value.toFixed(3) : `${Math.round(value)} ms`);

/**
 * Performance metrics panel:
 *  - Core Web Vitals of this session (PerformanceObserver) and p75 of every user (backend)
 *  - API timings split into network vs server (Server-Timing)
 *  - Render time of each view (User Timing)
 *  - Demo: the same calculation on the main thread vs in a Web Worker
 */
export default class PerformanceView extends Component {
  constructor(props) {
    super(props);
    this.state = { server: null, storage: null, benchmark: null, calculating: false };
  }

  async onMount() {
    this.listen(this.props.monitor, 'change', () => this.update());
    this.on('click', '[data-action="refresh"]', () => this.load());
    this.on('click', '[data-action="main-thread"]', () => this.measure('mainThread'));
    this.on('click', '[data-action="worker"]', () => this.measure('worker'));
    await this.load();
  }

  async load() {
    this.props.monitor.report(); // sends what was measured so far so it shows up in the summary
    const [server, storage] = await Promise.all([
      this.props.api.get('/api/metrics/summary').catch(() => null),
      navigator.storage?.estimate?.().catch(() => null),
    ]);
    this.setState({ server, storage });
  }

  async measure(where) {
    const N = 3_000_000;
    this.setState({ calculating: true });
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve))); // lets "calculating…" paint
    const start = performance.now();
    let calculation;
    if (where === 'mainThread') {
      heavyCalculation(N); // blocks the interface: clicks do not respond until it finishes
      calculation = performance.now() - start;
    } else {
      calculation = (await this.props.workers.geo.run({ type: 'HEAVY_CALCULATION', n: N })).milliseconds;
    }
    const blocked = where === 'mainThread' ? calculation : 0;
    this.setState({ calculating: false, benchmark: { ...this.state.benchmark, [where]: { calculation, blocked } } });
  }

  template() {
    const { monitor } = this.props;
    const { server, storage, benchmark, calculating } = this.state;
    const connection = navigator.connection;
    const requests = monitor.apiRequests();
    const views = monitor.viewTimings();

    return html`
<h1>Rendimiento</h1>
<p class="muted">Métricas reales medidas en este dispositivo con las APIs nativas del navegador.</p>

<h2>Core Web Vitals — esta sesión</h2>
<div class="table-wrap"><table>
  <thead><tr><th>Métrica</th><th>Valor</th><th>Calificación</th><th>Umbral “bueno”</th></tr></thead>
  <tbody>${Object.keys(THRESHOLDS).map((name) => {
    const value = monitor.values[name];
    const rating = value == null ? null : rate(name, value);
    return html`<tr title="${DESCRIPTION[name]}">
      <td><b>${name}</b></td><td>${formatMetric(name, value)}</td>
      <td>${rating ? html`<span class="chip ${rating}">${RATING_LABEL[rating]}</span>` : '—'}</td>
      <td>≤ ${formatMetric(name, THRESHOLDS[name][0])}</td></tr>`;
  })}</tbody>
</table></div>
<p class="muted">Tareas largas (&gt; 50 ms) en el hilo principal: <b>${monitor.longTasks.count}</b> (${Math.round(monitor.longTasks.totalMs)} ms en total).
${monitor.values.INP == null ? ' El INP aparece después de su primera interacción.' : ''}</p>

<h2>Percentil 75 de todos los usuarios (backend)</h2>
${server ? html`<div class="table-wrap"><table>
  <thead><tr><th>Métrica</th><th>p75</th><th>Muestras</th><th>Calificación</th></tr></thead>
  <tbody>${server.map((m) => html`<tr><td>${m.name}</td><td>${formatMetric(m.name, m.p75)}</td><td>${m.samples}</td>
    <td>${m.rating ? html`<span class="chip ${m.rating}">${RATING_LABEL[m.rating]}</span>` : '—'}</td></tr>`)}</tbody>
</table></div>` : html`<p class="muted">No disponible sin conexión.</p>`}
<button class="btn secondary" data-action="refresh">Actualizar</button>

<h2>Peticiones a la API (red vs. servidor)</h2>
<p class="muted">El tiempo de servidor viene de la cabecera <code>Server-Timing</code>; el resto es red. “Vía SW” = la respuesta pasó por el Service Worker o la caché (el navegador no reporta sus bytes).</p>
<div class="table-wrap"><table>
  <thead><tr><th>Ruta</th><th>Total</th><th>Servidor</th><th>Red</th><th>Transferido</th></tr></thead>
  <tbody>${requests.map((r) => html`<tr><td>${r.route}</td><td>${Math.round(r.total)} ms</td>
    <td>${r.server == null ? '—' : `${r.server.toFixed(1)} ms`}</td><td>${r.network == null ? '—' : `${Math.round(r.network)} ms`}</td>
    <td>${r.fromCache ? 'vía SW' : formatBytes(r.bytes)}</td></tr>`)}</tbody>
</table></div>

<h2>Renderizado de vistas (CSR)</h2>
<ul>${views.map((v) => html`<li>${v.view}: ${v.milliseconds.toFixed(1)} ms</li>`)}</ul>

<h2>Web Worker vs. hilo principal</h2>
<p class="muted">3 millones de cálculos de distancia. En el hilo principal la página se congela; en el worker sigue respondiendo.</p>
<div class="row">
  <button class="btn danger" data-action="main-thread" ${calculating ? 'disabled' : ''}>Calcular en hilo principal</button>
  <button class="btn" data-action="worker" ${calculating ? 'disabled' : ''}>Calcular en Web Worker</button>
  ${calculating ? html`<span class="loading">Calculando…</span>` : ''}
</div>
${benchmark ? html`<div class="table-wrap"><table>
  <thead><tr><th>Dónde</th><th>Tiempo de cálculo</th><th>Interfaz bloqueada</th></tr></thead>
  <tbody>${['mainThread', 'worker'].filter((w) => benchmark[w]).map((w) => html`<tr>
    <td>${w === 'mainThread' ? 'Hilo principal' : 'Web Worker'}</td><td>${Math.round(benchmark[w].calculation)} ms</td><td>${Math.round(benchmark[w].blocked)} ms</td></tr>`)}</tbody>
</table></div>` : ''}

<h2>Red y almacenamiento</h2>
<ul>
  <li>Tipo de conexión: ${connection?.effectiveType ?? 'no disponible'}${connection?.downlink ? ` · ~${connection.downlink} Mbps` : ''}${connection?.rtt != null ? ` · RTT ${connection.rtt} ms` : ''}</li>
  <li>Ahorro de datos (Save-Data): ${connection?.saveData ? 'activado' : 'desactivado'}</li>
  <li>Almacenamiento usado (cachés): ${storage ? `${formatBytes(storage.usage)} de ${formatBytes(storage.quota)}` : '—'}</li>
  <li>Service Worker: ${navigator.serviceWorker?.controller ? 'activo (la app abre sin conexión)' : 'aún no controla esta página (recargue)'}</li>
</ul>`;
  }
}
