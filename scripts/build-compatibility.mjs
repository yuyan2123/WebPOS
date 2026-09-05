import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
const modules = readdirSync('src/app').filter((name) => name.endsWith('.js') && name !== 'compatibility.js');
const exports = new Map();
let content = readFileSync('public/index.html', 'utf8');
for (const file of modules) {
  const code = readFileSync(`src/app/${file}`, 'utf8');
  content += code;
  const ast = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  for (const node of ast.statements)
    if (
      ts.isFunctionDeclaration(node) &&
      node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)
    )
      exports.set(node.name.text, file);
}
const handlers = new Set();
for (const match of content.matchAll(/on[a-z]+="([^"]*)"/g)) {
  for (const name of match[1].matchAll(/\b(\w+)\s*\(/g)) if (exports.has(name[1])) handlers.add(name[1]);
}
const groups = new Map();
for (const name of handlers) {
  const file = exports.get(name);
  if (!groups.has(file)) groups.set(file, []);
  groups.get(file).push(name);
}
const imports = [...groups]
  .map(([file, names]) => `import { ${names.join(', ')} } from './${file}';`)
  .join('\n');
writeFileSync(
  'src/app/compatibility.js',
  `${imports}\n\n// Compatibility boundary for existing static and dynamically rendered HTML handlers.\nObject.assign(window, { ${[...handlers].join(', ')} });\n`,
);
console.log(`Registered ${handlers.size} HTML handlers.`);
