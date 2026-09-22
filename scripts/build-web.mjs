import { build } from 'esbuild';
import { readFileSync, writeFileSync, cpSync, mkdirSync, readdirSync } from 'node:fs';

mkdirSync('public/vendor', { recursive: true });
cpSync('node_modules/air-datepicker/air-datepicker.js', 'public/vendor/air-datepicker.js');
cpSync('node_modules/air-datepicker/air-datepicker.css', 'public/vendor/air-datepicker.css');
cpSync(
  'node_modules/@fortawesome/fontawesome-free/css/all.min.css',
  'public/vendor/fontawesome/css/all.min.css',
  { recursive: true },
);
cpSync('node_modules/@fortawesome/fontawesome-free/webfonts', 'public/vendor/fontawesome/webfonts', {
  recursive: true,
});
cpSync('node_modules/@fortawesome/fontawesome-free/LICENSE.txt', 'public/vendor/fontawesome/LICENSE.txt');

const components = readdirSync('src/styles/components')
  .sort()
  .map((name) => readFileSync(`src/styles/components/${name}`, 'utf8'));
writeFileSync(
  'public/css/app.css',
  [
    ...components,
    ...['surfaces', 'responsive', 'resilience', 'workspace', 'alerts'].map((name) =>
      readFileSync(`src/styles/${name}.css`, 'utf8'),
    ),
  ].join('\n'),
);

await build({
  entryPoints: ['src/main.js'],
  outfile: 'public/js/app.js',
  bundle: true,
  format: 'esm',
  target: ['safari15', 'chrome100', 'firefox100'],
  logLevel: 'info',
  legalComments: 'none',
});
// The worker caches exactly the generated local shell; no account data or API responses.
const worker = readFileSync('public/sw.js', 'utf8');
const { createHash } = await import('node:crypto');
const revision = createHash('sha256');
const shell = JSON.parse(worker.match(/const APP_SHELL = (\[[\s\S]*?\]);/)[1]);
// Keep release details in the cached HTML so they describe the running release.
const html = readFileSync('public/index.html', 'utf8');
const releaseHash = createHash('sha256');
for (const path of shell) {
  const content = readFileSync('public' + (path === '/' ? '/index.html' : path));
  releaseHash.update(path === '/' || path === '/index.html'
    ? content.toString().replace(/(<meta name="app-(?:version|updated-at)" content=")[^"]*/g, '$1')
    : content);
}
releaseHash.update(worker.replace(/const CACHE_VERSION = .*;/, ''));
const version = `0.14.1+${releaseHash.digest('hex').slice(0, 12)}`;
const previousVersion = html.match(/name="app-version" content="([^"]*)"/)[1];
const updatedAt = previousVersion === version
  ? html.match(/name="app-updated-at" content="([^"]*)"/)[1]
  : new Date().toISOString();
writeFileSync('public/index.html', html
  .replace(/(name="app-version" content=")[^"]*/, `$1${version}`)
  .replace(/(name="app-updated-at" content=")[^"]*/, `$1${updatedAt}`));
for (const path of shell) revision.update(readFileSync('public' + (path === '/' ? '/index.html' : path)));
writeFileSync(
  'public/sw.js',
  worker.replace(
    /const CACHE_VERSION = .*;/,
    `const CACHE_VERSION = "gin-jia-pos-${revision.digest('hex').slice(0, 12)}";`,
  ),
);
