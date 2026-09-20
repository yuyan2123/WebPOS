import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('public');
const mime = {
  '.cer': 'application/x-x509-ca-cert',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname === '/certs' || url.pathname === '/certs/' ? '/certs/setup.html' : url.pathname;
    const file = resolve(root, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + sep)) {
      response.writeHead(403);
      response.end();
      return;
    }
    const content = await readFile(file);
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(4173, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4173'));
