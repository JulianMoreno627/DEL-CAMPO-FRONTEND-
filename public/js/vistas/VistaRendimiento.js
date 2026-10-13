import { Componente } from '../nucleo/Componente.js';
import { html, formatoBytes } from '../utilidades/formato.js';
import { calculoPesado } from '../utilidades/geo.js';
import { UMBRALES, DESCRIPCION, calificar } from '../metricas/MonitorRendimiento.js';

const ETIQUETA_CALIFICACION = { BUENO: 'Bueno', NECESITA_MEJORA: 'Necesita mejora', POBRE: 'Pobre' };
const formatoMetrica = (nombre, v) => (v == null ? '—' : nombre === 'CLS' ? v.toFixed(3) : `${Math.round(v)} ms`);

/**
 * Panel de métricas de rendimiento:
 *  - Core Web Vitals de esta sesión (PerformanceObserver) y p75 de todos los usuarios (backend)
 *  - Tiempos de la API separados en red vs. servidor (Server-Timing)
 *  - Tiempo de renderizado de cada vista (User Timing)
 *  - Demostración: el mismo cálculo en el hilo principal vs. en un Web Worker
 */
export default class VistaRendimiento extends Componente {
  constructor(props) {
    super(props);
    this.estado = { servidor: null, almacenamiento: null, benchmark: null, calculando: false };
  }

  async alMontar() {
    this.escuchar(this.props.monitor, 'cambio', () => this.actualizar());
    this.on('click', '[data-accion="actualizar"]', () => this.cargar());
    this.on('click', '[data-accion="principal"]', () => this.medir('principal'));
    this.on('click', '[data-accion="worker"]', () => this.medir('worker'));
    await this.cargar();
  }

  async cargar() {
    this.props.monitor.reportar(); // envía lo medido hasta ahora para que aparezca en el resumen
    const [servidor, almacenamiento] = await Promise.all([
      this.props.api.get('/api/metricas/resumen').catch(() => null),
      navigator.storage?.estimate?.().catch(() => null),
    ]);
    this.setEstado({ servidor, almacenamiento });
  }

  async medir(donde) {
    const N = 3_000_000;
    this.setEstado({ calculando: true });
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r))); // deja pintar el "calculando…"
    const inicio = performance.now();
    let calculo;
    if (donde === 'principal') {
      calculoPesado(N); // bloquea la interfaz: los clics no responden hasta que termine
      calculo = performance.now() - inicio;
    } else {
      calculo = (await this.props.workers.geo.ejecutar({ tipo: 'CALCULO_PESADO', n: N })).milisegundos;
    }
    const bloqueo = donde === 'principal' ? calculo : 0;
    this.setEstado({ calculando: false, benchmark: { ...this.estado.benchmark, [donde]: { calculo, bloqueo } } });
  }

  plantilla() {
    const { monitor } = this.props;
    const { servidor, almacenamiento, benchmark, calculando } = this.estado;
    const conexion = navigator.connection;
    const peticiones = monitor.peticionesApi();
    const vistas = monitor.tiemposDeVistas();

    return html`
<h1>Rendimiento</h1>
<p class="suave">Métricas reales medidas en este dispositivo con las APIs nativas del navegador.</p>

<h2>Core Web Vitals — esta sesión</h2>
<div class="tabla-contenedor"><table>
  <thead><tr><th>Métrica</th><th>Valor</th><th>Calificación</th><th>Umbral “bueno”</th></tr></thead>
  <tbody>${Object.keys(UMBRALES).map((nombre) => {
    const valor = monitor.valores[nombre];
    const c = valor == null ? null : calificar(nombre, valor);
    return html`<tr title="${DESCRIPCION[nombre]}">
      <td><b>${nombre}</b></td><td>${formatoMetrica(nombre, valor)}</td>
      <td>${c ? html`<span class="chip ${c}">${ETIQUETA_CALIFICACION[c]}</span>` : '—'}</td>
      <td>≤ ${formatoMetrica(nombre, UMBRALES[nombre][0])}</td></tr>`;
  })}</tbody>
</table></div>
<p class="suave">Tareas largas (&gt; 50 ms) en el hilo principal: <b>${monitor.tareasLargas.cantidad}</b> (${Math.round(monitor.tareasLargas.totalMs)} ms en total).
${monitor.valores.INP == null ? ' El INP aparece después de su primera interacción.' : ''}</p>

<h2>Percentil 75 de todos los usuarios (backend)</h2>
${servidor ? html`<div class="tabla-contenedor"><table>
  <thead><tr><th>Métrica</th><th>p75</th><th>Muestras</th><th>Calificación</th></tr></thead>
  <tbody>${servidor.map((m) => html`<tr><td>${m.nombre}</td><td>${formatoMetrica(m.nombre, m.p75)}</td><td>${m.muestras}</td>
    <td>${m.calificacion ? html`<span class="chip ${m.calificacion}">${ETIQUETA_CALIFICACION[m.calificacion]}</span>` : '—'}</td></tr>`)}</tbody>
</table></div>` : html`<p class="suave">No disponible sin conexión.</p>`}
<button class="boton secundario" data-accion="actualizar">Actualizar</button>

<h2>Peticiones a la API (red vs. servidor)</h2>
<p class="suave">El tiempo de servidor viene de la cabecera <code>Server-Timing</code>; el resto es red. “Vía SW” = la respuesta pasó por el Service Worker o la caché (el navegador no reporta sus bytes).</p>
<div class="tabla-contenedor"><table>
  <thead><tr><th>Ruta</th><th>Total</th><th>Servidor</th><th>Red</th><th>Transferido</th></tr></thead>
  <tbody>${peticiones.map((p) => html`<tr><td>${p.ruta}</td><td>${Math.round(p.total)} ms</td>
    <td>${p.servidor == null ? '—' : `${p.servidor.toFixed(1)} ms`}</td><td>${p.red == null ? '—' : `${Math.round(p.red)} ms`}</td>
    <td>${p.desdeCache ? 'vía SW' : formatoBytes(p.bytes)}</td></tr>`)}</tbody>
</table></div>

<h2>Renderizado de vistas (CSR)</h2>
<ul>${vistas.map((v) => html`<li>${v.vista}: ${v.milisegundos.toFixed(1)} ms</li>`)}</ul>

<h2>Web Worker vs. hilo principal</h2>
<p class="suave">3 millones de cálculos de distancia. En el hilo principal la página se congela; en el worker sigue respondiendo.</p>
<div class="fila">
  <button class="boton peligro" data-accion="principal" ${calculando ? 'disabled' : ''}>Calcular en hilo principal</button>
  <button class="boton" data-accion="worker" ${calculando ? 'disabled' : ''}>Calcular en Web Worker</button>
  ${calculando ? html`<span class="cargando">Calculando…</span>` : ''}
</div>
${benchmark ? html`<div class="tabla-contenedor"><table>
  <thead><tr><th>Dónde</th><th>Tiempo de cálculo</th><th>Interfaz bloqueada</th></tr></thead>
  <tbody>${['principal', 'worker'].filter((d) => benchmark[d]).map((d) => html`<tr>
    <td>${d === 'principal' ? 'Hilo principal' : 'Web Worker'}</td><td>${Math.round(benchmark[d].calculo)} ms</td><td>${Math.round(benchmark[d].bloqueo)} ms</td></tr>`)}</tbody>
</table></div>` : ''}

<h2>Red y almacenamiento</h2>
<ul>
  <li>Tipo de conexión: ${conexion?.effectiveType ?? 'no disponible'}${conexion?.downlink ? ` · ~${conexion.downlink} Mbps` : ''}${conexion?.rtt != null ? ` · RTT ${conexion.rtt} ms` : ''}</li>
  <li>Ahorro de datos (Save-Data): ${conexion?.saveData ? 'activado (no se cargan fotos)' : 'desactivado'}</li>
  <li>Almacenamiento usado (cachés + IndexedDB): ${almacenamiento ? `${formatoBytes(almacenamiento.usage)} de ${formatoBytes(almacenamiento.quota)}` : '—'}</li>
  <li>Service Worker: ${navigator.serviceWorker?.controller ? 'activo (la app funciona sin conexión)' : 'aún no controla esta página (recargue)'}</li>
</ul>`;
  }
}
