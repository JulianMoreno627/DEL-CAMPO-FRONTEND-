# Del Campo — Frontend

PWA de la plataforma de comercialización directa campesino–consumidor (Caso de Estudio 3, Programación Orientada a la Web).

> Backend (API REST, SSR/SSG/ISR): [DEL-CAMPO-BACKEND](https://github.com/JulianMoreno627/DEL-CAMPO-BACKEND). El informe del avance está en ese repositorio (`docs/INFORME-AVANCE-1.md`).

El código (clases, funciones, variables, archivos, clases de CSS y comentarios) está en inglés; los textos que ve el usuario están en español.

## Ejecución

```bash
# 1. En el repositorio DEL-CAMPO-BACKEND:  npm install && npm start   (http://localhost:3000)
# 2. En este repositorio:
npm start        # http://localhost:5173  (sin dependencias ni build)
```

La URL del backend se configura en `<meta name="api-url">` de `public/index.html` o con `localStorage.apiUrl`.

## Cómo se usa

Al entrar se elige el perfil:

- **Soy productor** → *Mis productos*: publica lo que cultiva (foto, nombre, descripción, precio y cantidad) con una vista previa en vivo; edita o elimina sus productos y en *Pedidos recibidos* confirma y entrega lo que le compraron.
- **Quiero comprar** → *Productos*: ve los productos con el precio que fijó el productor, abre el detalle, los agrega al *Carrito* y compra. Sus compras quedan en *Mis pedidos*.

La vista de métricas de rendimiento sigue disponible en `#/rendimiento` (no aparece en el menú).

## Qué hay en cada carpeta

```
public/
├── index.html                 App shell (CSR)
├── sw.js                      Service Worker: precache, estrategias de caché, Push
├── manifest.webmanifest       Instalable como app
├── css/app.css                Estilos livianos, mobile-first, fuentes del sistema
└── js/
    ├── main.js                Arranque, sesión, encabezado por perfil y guardia de rutas
    ├── core/                  Component (clase base), Router (code splitting + guardia), Store (Observer), ApiClient (token Bearer)
    ├── components/            product.js: tarjeta de producto, foto o ilustración, selector de cantidad
    ├── views/                 LoginView, MyProductsView, ProductsView, CartView, OrdersView, PerformanceView (cargadas bajo demanda)
    ├── workers/               image.worker.js (comprime la foto), geo.worker.js y WorkerClient (postMessage → Promise)
    ├── metrics/               PerformanceMonitor: LCP, INP, CLS, FCP, TTFB, Long Tasks y envío por sendBeacon
    └── utils/                 Plantillas html`` con escape automático (anti-XSS), formato, íconos, geo
static-server.js               Servidor estático de desarrollo (sin dependencias)
```

Se usa JavaScript nativo (módulos ES) en lugar de React: el paquete completo de la app pesa menos que el runtime de React solo, lo cual es importante en celulares de gama baja con datos limitados. Los patrones (componentes con ciclo de vida, estado, enrutador) son los mismos.
