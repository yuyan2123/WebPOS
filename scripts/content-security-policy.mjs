import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import ts from 'typescript';

// Data stays in escaped data-* attributes. Only exact, build-time handler bodies
// receive hashes; arbitrary inline scripts and event handlers remain blocked.
export function contentSecurityPolicy() {
  const handlers = new Set();
  function collect(html, file) {
    for (const match of html.matchAll(/\bon[a-z]+="([^"]*)"/g)) {
      const body = match[1].replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      if (body.includes('${')) throw new Error(`Dynamic event handler in ${file}`);
      handlers.add(body);
    }
    // A split literal would place runtime data inside JavaScript again.
    if (/\bon[a-z]+="[^"]*$/.test(html)) throw new Error(`Split event handler in ${file}`);
  }
  for (const file of ['public/index.html', 'public/certs/setup.html']) collect(readFileSync(file, 'utf8'), file);
  for (const file of [
    ...readdirSync('src/app').filter((name) => name.endsWith('.js')).map((name) => `src/app/${name}`),
    'public/js/rpc-bridge.js', 'public/js/pwa.js',
  ]) {
    const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    function visit(node) {
      if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        collect(node.text, file);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  const hashes = [...handlers].sort().map((body) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`);
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    // unsafe-hashes permits only the fixed handlers above, never arbitrary code.
    `script-src 'self' 'wasm-unsafe-eval' 'unsafe-hashes' ${hashes.join(' ')} https://www.gstatic.com/firebasejs/ https://www.gstatic.com/recaptcha/ https://www.google.com/recaptcha/ https://www.recaptcha.net/recaptcha/ https://apis.google.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://www.gstatic.com https://www.google.com",
    "font-src 'self'",
    // HTTPS diagnostics and WSS target addresses are configurable local printers.
    "connect-src 'self' https: wss: http://127.0.0.1:9099 http://127.0.0.1:5001",
    "frame-src 'self' https://webpos-14776.firebaseapp.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://www.recaptcha.net/recaptcha/",
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join('; ');
}

export function writeContentSecurityPolicy() {
  const config = JSON.parse(readFileSync('firebase.json', 'utf8'));
  const headers = config.hosting.headers.find((entry) => entry.source === '**').headers;
  const value = contentSecurityPolicy();
  const current = headers.find((header) => header.key === 'Content-Security-Policy');
  if (current) current.value = value;
  else headers.push({ key: 'Content-Security-Policy', value });
  if (!headers.some((header) => header.key === 'X-Content-Type-Options')) {
    headers.push({ key: 'X-Content-Type-Options', value: 'nosniff' });
  }
  writeFileSync('firebase.json', JSON.stringify(config, null, 2) + '\n');
}
