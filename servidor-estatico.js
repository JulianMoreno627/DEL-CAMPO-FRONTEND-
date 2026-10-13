/**
 * Servidor estático mínimo para desarrollo (sin dependencias).
 * El frontend no necesita build: son módulos ES nativos que el navegador carga directamente.
 *   PORT=5173 npm start
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PUERTO = Number(process.env.PORT ?? 5173);

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let archivo = path.normalize(path.join(raiz, ruta));
  if (!archivo.startsWith(raiz)) return res.writeHead(403).end();
  try {
    if ((await stat(archivo)).isDirectory()) archivo = path.join(archivo, 'index.html');
    const contenido = await readFile(archivo);
    const nombre = path.basename(archivo);
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(archivo)] ?? 'application/octet-stream',
      // El Service Worker y el HTML siempre se revalidan; el resto lo maneja la caché del SW
      'Cache-Control': nombre === 'sw.js' || nombre.endsWith('.html') ? 'no-cache' : 'max-age=300',
    });
    res.end(contenido);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}).listen(PUERTO, () => console.log(`Frontend en http://localhost:${PUERTO}`));
