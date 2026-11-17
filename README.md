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

La pantalla de inicio explica la plataforma (cómo funciona, qué gana el productor y qué gana el comprador) y tiene el panel de ingreso arriba. Al entrar se elige el perfil:

- **Soy productor** → *Mis productos*: publica lo que cultiva (foto, nombre, descripción, precio y cantidad) con una vista previa en vivo; edita o elimina sus productos y en *Pedidos recibidos* confirma y entrega lo que le compraron.
- **Quiero comprar** → *Productos*: ve los productos con el precio que fijó el productor, abre el detalle, los agrega al *Carrito* y compra. Sus compras quedan en *Mis pedidos*.

Al registrarse, el comprador elige para quién compra (hogar, tienda o restaurante) y el productor puede escribir el nombre de su finca.

Las pantallas principales saludan al usuario por su nombre, con su foto.

**Menú de cuenta.** El botón con la foto, arriba a la derecha, abre un menú con *Mi perfil*, el cambio a modo claro u oscuro y *Cerrar sesión*.

**Mi perfil** (`#/perfil`):
- Cambiar la foto de perfil. Se comprime en el Web Worker a unos 400 px antes de subirse y se guarda en el backend (Neon).
- Editar los datos: el nombre y el teléfono; el productor, además, su finca, vereda y municipio; el comprador, su tipo.
- Ver la reputación.
- Elegir el tema.
- Cerrar sesión.

**Tema claro u oscuro.**
- Viene en **claro** por defecto y el usuario lo cambia desde el menú o desde *Mi perfil*.
- La elección se guarda en el navegador y se aplica antes del primer pintado, para que no haya un destello blanco.
- Todos los colores son variables de CSS: el modo oscuro solo redefine esas variables (`html[data-theme="dark"]`).

La vista de métricas de rendimiento sigue disponible en `#/rendimiento` (no aparece en el menú).

### Asistente de IA: "Publica con una foto"

En el editor de productos, al elegir una foto aparece el botón **"✨ Completar con IA"**. Al tocarlo:

1. La foto, ya comprimida por el Web Worker, se envía a `POST /api/assistant/listing-suggestion`.
2. El backend la analiza con Gemini, o con Groq si Gemini falla.
3. La IA llena el **nombre**, la **descripción**, la **unidad** y la **categoría**.
4. Se muestra el **precio justo sugerido** según los precios de referencia, con un botón para usarlo.
5. Si la foto no muestra un producto del campo, o está oscura o borrosa, el asistente lo avisa.

La IA solo sugiere: el productor revisa y corrige todo antes de publicar. Esta petición tiene 25 s de espera, en lugar de los 10 s de las demás.

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
