import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
export function frontendSource() {
  return readdirSync(resolve(root, 'src/app')).filter(name => name.endsWith('.js')).map(name => readFileSync(resolve(root, 'src/app', name), 'utf8')).join('\n');
}
