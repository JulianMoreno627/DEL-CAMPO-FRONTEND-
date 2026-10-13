import { API_URL } from './config.js';
import { Almacen } from './nucleo/Almacen.js';
import { ApiCliente } from './nucleo/ApiCliente.js';
import { Router } from './nucleo/Router.js';
import { BaseDatosLocal } from './offline/BaseDatosLocal.js';
import { GestorSincronizacion } from './offline/GestorSincronizacion.js';
import { MonitorRendimiento } from './metricas/MonitorRendimiento.js';
import { ClienteWorker } from './workers/ClienteWorker.js';
import { html } from './utilidades/formato.js';

// 1) Métricas primero, para no perder FCP/LCP de la carga inicial
const monitor = new MonitorRendimiento({ urlReporte: `${API_URL}/api/metricas` });
monitor.iniciar();

// 2) Service Worker: caché del app shell, estrategias por tipo de recurso y Background Sync
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service Worker no registrado', e));
}

const almacen = new Almacen({ usuario: null, usuarios: [], enLinea: navigator.onLine, pendientes: 0, sincronizando: false });
const api = new ApiCliente(API_URL, { obtenerUsuarioId: () => almacen.estado.usuario?.id ?? null });
const db = await new BaseDatosLocal().abrir();
const sync = new GestorSincronizacion({ db, api });

// Los workers se crean al primer uso (ClienteWorker es perezoso)
const workers = {
  geo: new ClienteWorker(new URL('./workers/geo.worker.js', import.meta.url)),
  imagen: new ClienteWorker(new URL('./workers/imagen.worker.js', import.meta.url)),
};

function avisar(mensaje, tipo = 'info') {
  const el = Object.assign(document.createElement('div'), { className: `aviso ${tipo}`, textContent: mensaje });
  document.getElementById('avisos').append(el);
  setTimeout(() => el.remove(), tipo === 'error' ? 7000 : 4000);
}

// ---- Indicador de conexión y cola offline (se suscribe al Almacén)
const indicador = document.getElementById('estado-conexion');
function pintarIndicador({ enLinea, pendientes, sincronizando }) {
  indicador.innerHTML = String(html`
    <span class="punto ${enLinea ? '' : 'fuera'}"></span>
    <span>${enLinea ? 'En línea' : 'Sin conexión'}</span>
    ${pendientes ? html`<button class="boton-sync" type="button" title="Cambios guardados en el teléfono">${sincronizando ? 'Sincronizando…' : `${pendientes} por enviar`}</button>` : ''}`);
}
indicador.addEventListener('click', (e) => { if (e.target.closest('.boton-sync')) sync.sincronizar(); });
almacen.suscribir(pintarIndicador);
pintarIndicador(almacen.estado);
addEventListener('online', () => almacen.actualizar({ enLinea: true }));
addEventListener('offline', () => almacen.actualizar({ enLinea: false }));

sync.addEventListener('estado', (e) => almacen.actualizar(e.detail));
sync.addEventListener('avisos', (e) => e.detail.forEach((m) => avisar(m, 'error')));

// ---- Usuarios de demostración (mientras no hay login). Se guardan en IndexedDB para el modo offline.
async function cargarUsuarios() {
  try {
    const usuarios = await api.get('/api/usuarios');
    await db.guardarCache('usuarios', usuarios);
    return usuarios;
  } catch {
    return (await db.leerCache('usuarios')) ?? [];
  }
}

const selector = document.getElementById('usuario-actual');
const usuarios = await cargarUsuarios();
const idGuardado = (() => { try { return localStorage.getItem('usuarioId'); } catch { return null; } })();
const usuarioInicial = usuarios.find((u) => u.id === idGuardado) ?? usuarios.find((u) => u.rol === 'COMPRADOR') ?? null;
almacen.actualizar({ usuarios, usuario: usuarioInicial });

selector.innerHTML = usuarios.length
  ? String(html`
    <optgroup label="Compradores">${usuarios.filter((u) => u.rol === 'COMPRADOR').map((u) => html`<option value="${u.id}">${u.nombre}</option>`)}</optgroup>
    <optgroup label="Productores">${usuarios.filter((u) => u.rol === 'PRODUCTOR').map((u) => html`<option value="${u.id}">${u.nombre} (${u.vereda})</option>`)}</optgroup>`)
  : '<option>Sin conexión con el servidor</option>';
if (usuarioInicial) selector.value = usuarioInicial.id;

// ---- Enrutador CSR con vistas cargadas bajo demanda (code splitting)
const router = new Router(document.getElementById('vista'), {
  '/catalogo': () => import('./vistas/VistaCatalogo.js'),
  '/mi-finca': () => import('./vistas/VistaProductor.js'),
  '/reservas': () => import('./vistas/VistaReservas.js'),
  '/rendimiento': () => import('./vistas/VistaRendimiento.js'),
}, { almacen, api, db, sync, monitor, workers, avisar, apiUrl: API_URL });

selector.addEventListener('change', () => {
  const usuario = almacen.estado.usuarios.find((u) => u.id === selector.value) ?? null;
  try { localStorage.setItem('usuarioId', usuario?.id ?? ''); } catch { /* modo privado */ }
  almacen.actualizar({ usuario });
  if (usuario?.rol === 'PRODUCTOR' && location.hash.startsWith('#/catalogo')) location.hash = '#/mi-finca';
  else router.recargar();
});

sync.iniciar();
await router.iniciar();
