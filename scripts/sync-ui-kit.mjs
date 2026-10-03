import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Explicit import only: regular builds use the committed snapshot, including CI.
const source = resolve(process.argv[2] || '../web-ui-kit');
const names = ['tokens.css', 'components.css', 'pos.css'];
const files = names.map((name) => [name, readFileSync(resolve(source, 'styles', name), 'utf8')]);
const googleLogo = readFileSync(resolve(source, 'assets/google-signin.png'));
mkdirSync('src/styles/ui-kit', { recursive: true });
for (const [name, content] of files) {
  const target = name === 'pos.css' ? 'src/styles/pos.css' : `src/styles/ui-kit/${name}`;
  writeFileSync(target, content);
}
mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/google-signin.png', googleLogo);
console.log(`Imported ${names.join(', ')} from ${source}. Run npm run build:web next.`);
