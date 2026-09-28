// Servidor local per a provar l'app: node dev-server.mjs  →  http://localhost:5173
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = import.meta.dirname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer(async (req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]).split('/').filter((p) => p && p !== '..').join('/');
  if (!path) path = 'index.html';
  try {
    const data = await readFile(join(root, path));
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('No trobat');
  }
}).listen(5173, () => console.log('http://localhost:5173'));
