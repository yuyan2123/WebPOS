import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run('cargo', ['build', '--locked', '--release', '--target', 'wasm32-unknown-unknown']);
for (const [target, directory] of [
  ['web', 'public/wasm'],
  ['nodejs', 'functions/wasm'],
]) {
  mkdirSync(directory, { recursive: true });
  run('wasm-bindgen', [
    'target/wasm32-unknown-unknown/release/pos_domain.wasm',
    '--target',
    target,
    '--out-dir',
    directory,
    '--out-name',
    'pos_domain',
  ]);
}
writeFileSync('functions/wasm/package.json', '{"type":"commonjs"}\n');
