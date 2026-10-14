const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('./build-site.js');
const root = path.resolve(__dirname, '../dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary' };

build().then(() => {
  const server = http.createServer((req, res) => {
    let file;
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    } catch { res.writeHead(400).end(); return; }
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
  });
  server.listen(Number(process.env.PORT) || 8000, '127.0.0.1', () => console.log('Particle Space → http://127.0.0.1:8000/particles.html'));
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
}).catch(error => { console.error(error); process.exitCode = 1; });
