/*
 * Local dev server: serves the static app from web/app and runs the real
 * web/api/proxy.js handler at /api/proxy — so the browser build behaves exactly
 * like production (Vercel). Node stdlib only.
 *
 *   node web/dev-server.mjs        # then open http://localhost:8080/
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import proxyHandler from './api/proxy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Serve from web/ so paths mirror production: / = landing, /app/ = the app.
const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);

  // Proxy: invoke the real Vercel handler with a tiny req/res shim.
  if (u.pathname === '/api/proxy') {
    req.query = Object.fromEntries(u.searchParams);
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    try { await proxyHandler(req, res); }
    catch (e) { if (!res.headersSent) { res.statusCode = 500; res.end('proxy error'); } }
    return;
  }

  // Static files. Directory paths resolve to their index.html (/, /app, /app/).
  let path = decodeURIComponent(u.pathname);
  if (path.endsWith('/')) path += 'index.html';
  else if (!extname(path)) path += '/index.html';
  const filePath = normalize(join(ROOT, path));
  if (!filePath.startsWith(ROOT)) { res.statusCode = 403; res.end('forbidden'); return; }

  try {
    const data = await readFile(filePath);
    res.setHeader('content-type', TYPES[extname(filePath)] || 'application/octet-stream');
    res.end(data);
  } catch (e) {
    res.statusCode = 404;
    res.end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`IPTVy dev server → http://localhost:${PORT}/`);
});
