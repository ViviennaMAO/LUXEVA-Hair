// LUXEVA Hair — cross-border wig store demo. Zero dependencies: `node server.js`.
// On Vercel, static files come from public/ and the API runs as api/index.js.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApi, send } = require('./server/app');
const pwv = require('./server/pwv');
const store = require('./server/store');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function serveStatic(req, res, pathname) {
  const file = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: 'Not found' });
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.jpg' ? 'public, max-age=86400' : 'no-cache' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname.startsWith('/api/')) return handleApi(req, res);
  serveStatic(req, res, pathname);
}).listen(PORT, () => {
  console.log(`LUXEVA Hair running at http://localhost:${PORT}  (PWV mode: ${pwv.config.mode}, storage: ${store.backend})`);
});
