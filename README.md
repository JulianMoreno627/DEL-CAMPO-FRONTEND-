# Del Campo — Frontend

PWA **offline-first** de la plataforma de comercialización directa campesino–consumidor (Caso de Estudio 3, Programación Orientada a la Web).

> Backend (API REST, SSR/SSG/ISR): repositorio `plataforma-campesino-backend`. El informe del avance está en ese repositorio (`docs/INFORME-AVANCE-1.md`).

## Ejecución

```bash
# 1. En el repositorio del backend:  npm install && npm start   (http://localhost:3000)
# 2. En este repositorio:
npm start        # http://localhost:5173  (sin dependencias ni build)
```

La URL del backend se configura en `<meta name="api-url">` de `public/index.html` o con `localStorage.apiUrl`.

Para probar el modo offline, abra DevTools → *Network* → *Offline*, registre una cosecha en **Mi finca** con un usuario productor, recargue la página (abre sin señal) y vuelva a *Online*: la cosecha se sincroniza sola.

## Qué hay en cada carpeta

```
public/
├── index.html                 App shell (CSR)
├── sw.js                      Service Worker: precache, estrategias de caché, Background Sync, Push
├── manifest.webmanifest       Instalable como app
├── css/app.css                Estilos livianos, mobile-first, fuentes del sistema
└── js/
    ├── main.js                Arranque e inyección de dependencias
    ├── nucleo/                Componente (clase base), Router (code splitting), Almacen (Observer), ApiCliente
    ├── offline/               BaseDatosLocal (IndexedDB) y GestorSincronizacion (cola outbox + reintentos)
    ├── workers/               geo.worker.js, imagen.worker.js y ClienteWorker (postMessage → Promise)
    ├── metricas/              MonitorRendimiento: LCP, INP, CLS, FCP, TTFB, Long Tasks y envío por sendBeacon
    ├── vistas/                Catálogo, Mi finca, Reservas, Rendimiento (cargadas bajo demanda)
    ├── componentes/           Mapa ligero en SVG (sin descargar teselas)
    └── utilidades/            Plantillas html`` con escape automático (anti-XSS), formato, geo
```

Se usa JavaScript nativo (módulos ES) en lugar de React: el paquete completo de la app pesa menos que el runtime de React solo, lo cual es importante en celulares de gama baja con datos limitados. Los patrones (componentes con ciclo de vida, estado, enrutador) son los mismos.
