/**
 * Service Worker de "Del Campo".
 *
 * Estrategias de caché por tipo de recurso:
 *  - App shell (HTML, CSS, JS, workers): precache en install + stale-while-revalidate
 *      → la app abre al instante y sin señal; se actualiza en segundo plano.
 *  - Catálogo / perfiles / usuarios (API): network-first con timeout de 4 s y respaldo en caché
 *      → datos frescos si hay buena señal; si la red es lenta o no hay, la última copia.
 *  - Precios de referencia (API): stale-while-revalidate (cambian poco).
 *  - Fotos: cache-first con límite de entradas (no se vuelven a descargar).
 *  - POST/PATCH y datos por usuario (reservas): nunca se cachean.
 *
 * Además: Background Sync (avisa a la app que sincronice al volver la señal) y
 * manejadores de Web Push listos para la siguiente entrega.
 */
const VERSION = 'v1';
const CACHE_SHELL = `shell-${VERSION}`;
const CACHE_API = `api-${VERSION}`;
const CACHE_IMG = `img-${VERSION}`;
const MAX_IMAGENES = 60;
const TIMEOUT_RED_MS = 4000;

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icono.svg',
  '/css/app.css',
  '/js/main.js',
  '/js/config.js',
  '/js/nucleo/Almacen.js',
  '/js/nucleo/ApiCliente.js',
  '/js/nucleo/Componente.js',
  '/js/nucleo/Router.js',
  '/js/offline/BaseDatosLocal.js',
  '/js/offline/GestorSincronizacion.js',
  '/js/metricas/MonitorRendimiento.js',
  '/js/workers/ClienteWorker.js',
  '/js/workers/geo.worker.js',
  '/js/workers/imagen.worker.js',
  '/js/utilidades/formato.js',
  '/js/utilidades/geo.js',
  '/js/componentes/mapaLigero.js',
  '/js/vistas/VistaCatalogo.js',
  '/js/vistas/VistaProductor.js',
  '/js/vistas/VistaReservas.js',
  '/js/vistas/VistaRendimiento.js',
];

// Rutas de la API que se pueden cachear (no dependen del usuario que las pide)
const API_NETWORK_FIRST = [/\/api\/catalogo/, /\/api\/temporada/, /\/api\/productores\//, /\/api\/usuarios$/];
const API_SWR = [/\/api\/precios\//];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(CACHE_SHELL).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  const vigentes = [CACHE_SHELL, CACHE_API, CACHE_IMG];
  evento.waitUntil((async () => {
    for (const nombre of await caches.keys()) if (!vigentes.includes(nombre)) await caches.delete(nombre);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return; // escrituras: las maneja la cola offline de la app
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) {
    if (API_NETWORK_FIRST.some((r) => r.test(url.pathname))) return evento.respondWith(redPrimero(request, CACHE_API));
    if (API_SWR.some((r) => r.test(url.pathname))) return evento.respondWith(obsoletoMientrasRevalida(request, CACHE_API));
    return; // resto de la API (reservas, métricas…): siempre a la red
  }
  if (url.pathname.startsWith('/uploads/')) return evento.respondWith(cachePrimero(request, CACHE_IMG));
  if (url.origin !== self.location.origin) return;

  // Navegación del SPA: siempre el app shell (las rutas viven en el #hash)
  if (request.mode === 'navigate') return evento.respondWith(obsoletoMientrasRevalida(new Request('/index.html'), CACHE_SHELL));
  evento.respondWith(obsoletoMientrasRevalida(request, CACHE_SHELL));
});

async function redPrimero(request, nombreCache) {
  const cache = await caches.open(nombreCache);
  try {
    const respuesta = await conTimeout(fetch(request), TIMEOUT_RED_MS);
    if (respuesta.ok) cache.put(request, respuesta.clone());
    return respuesta;
  } catch {
    const guardada = await cache.match(request);
    return guardada ?? new Response(JSON.stringify({ error: 'Sin conexión y sin copia guardada' }), {
      status: 503, headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function obsoletoMientrasRevalida(request, nombreCache) {
  const cache = await caches.open(nombreCache);
  const guardada = await cache.match(request);
  const actualizacion = fetch(request)
    .then((respuesta) => {
      if (respuesta.ok) cache.put(request, respuesta.clone());
      return respuesta;
    })
    .catch(() => null);
  if (guardada) return guardada;
  return (await actualizacion) ?? new Response('Sin conexión', { status: 503 });
}

async function cachePrimero(request, nombreCache) {
  const cache = await caches.open(nombreCache);
  const guardada = await cache.match(request);
  if (guardada) return guardada;
  try {
    const respuesta = await fetch(request);
    if (respuesta.ok) {
      await cache.put(request, respuesta.clone());
      limitarEntradas(cache, MAX_IMAGENES);
    }
    return respuesta;
  } catch {
    return new Response('', { status: 503 });
  }
}

async function limitarEntradas(cache, maximo) {
  const claves = await cache.keys();
  for (const clave of claves.slice(0, Math.max(0, claves.length - maximo))) await cache.delete(clave);
}

function conTimeout(promesa, ms) {
  return Promise.race([promesa, new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('timeout')), ms))]);
}

// ---- Background Sync: cuando vuelve la señal, avisa a la app para que vacíe la cola de IndexedDB
self.addEventListener('sync', (evento) => {
  if (evento.tag !== 'sincronizar-cosechas') return;
  evento.waitUntil((async () => {
    const clientes = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    for (const cliente of clientes) cliente.postMessage({ tipo: 'SINCRONIZAR' });
  })());
});

// ---- Web Push (siguiente entrega): "La cosecha que reservó ya está disponible"
self.addEventListener('push', (evento) => {
  const datos = evento.data?.json() ?? { titulo: 'Del Campo', cuerpo: 'Tiene novedades en sus reservas' };
  evento.waitUntil(self.registration.showNotification(datos.titulo, {
    body: datos.cuerpo, icon: '/icons/icono.svg', data: { url: datos.url ?? '/#/reservas' },
  }));
});

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  evento.waitUntil(self.clients.openWindow(evento.notification.data?.url ?? '/'));
});
