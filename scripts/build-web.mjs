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
    ...['surfaces', 'responsive', 'resilience', 'workspace'].map((name) =>
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
for (const path of shell) revision.update(readFileSync('public' + (path === '/' ? '/index.html' : path)));
writeFileSync(
  'public/sw.js',
  worker.replace(
    /const CACHE_VERSION = .*;/,
    `const CACHE_VERSION = "gin-jia-pos-${revision.digest('hex').slice(0, 12)}";`,
  ),
);
