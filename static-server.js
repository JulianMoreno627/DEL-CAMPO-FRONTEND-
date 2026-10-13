/**
 * Minimal static server for development (no dependencies).
 * The frontend needs no build: they are native ES modules the browser loads directly.
 *   PORT=5173 npm start
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT ?? 5173);

const CONTENT_TYPES = {
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
  const route = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.normalize(path.join(root, route));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    let info = await stat(file);
    if (info.isDirectory()) {
      file = path.join(file, 'index.html');
      info = await stat(file);
    }
    // Always revalidated (no-cache + Last-Modified): if the file did not change it answers 304 with no body,
    // and if it changed the browser gets the new version right away. The offline copy is kept by the Service Worker.
    const modified = new Date(Math.floor(info.mtimeMs / 1000) * 1000);
    const headers = { 'Cache-Control': 'no-cache', 'Last-Modified': modified.toUTCString() };
    const since = Date.parse(req.headers['if-modified-since'] ?? '');
    if (!Number.isNaN(since) && modified.getTime() <= since) return res.writeHead(304, headers).end();
    res.writeHead(200, { ...headers, 'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
  }
}).listen(PORT, () => console.log(`Frontend en http://localhost:${PORT}`));
