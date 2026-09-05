import { cpSync, mkdirSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = resolve('artifacts/emulator-test');
mkdirSync(directory, { recursive: true });
const functions = resolve(directory, 'functions');
mkdirSync(functions, { recursive: true });
for (const path of ['src', 'wasm', 'package.json'])
  cpSync(resolve('functions', path), resolve(functions, path), { recursive: true });
// Reuse installed dependencies without copying credentials or local .env files.
const dependencies = resolve(functions, 'node_modules');
if (!existsSync(dependencies)) {
  const { symlinkSync } = await import('node:fs');
  symlinkSync(
    realpathSync('functions/node_modules'),
    dependencies,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
}
writeFileSync(
  resolve(functions, '.secret.local'),
  'SECURITY_HASH_SALT=isolated-emulator-only-key-0123456789\n',
);
writeFileSync(resolve(functions, '.env'), 'POS_ALLOWED_EMAILS=\nENFORCE_APP_CHECK=false\n');
for (const path of ['firestore.rules', 'firestore.indexes.json']) cpSync(path, resolve(directory, path));
writeFileSync(
  resolve(directory, 'firebase.json'),
  JSON.stringify(
    {
      functions: { source: 'functions', runtime: 'nodejs22' },
      firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' },
      emulators: {
        auth: { port: 19099 },
        firestore: { port: 18080 },
        functions: { port: 15101 },
        hub: { port: 14400 },
        logging: { port: 14500 },
        ui: { enabled: false },
        singleProjectMode: true,
      },
    },
    null,
    2,
  ),
);
const args = [
  'emulators:exec',
  '--config',
  resolve(directory, 'firebase.json'),
  '--project',
  'demo-ginjia-pos',
  '--only',
  'auth,firestore,functions',
  'node functions/test/emulator.integration.js',
];
const cli = process.env.FIREBASE_CLI_PATH;
if (!cli && !process.env.npm_execpath)
  throw new Error(
    'Run with npm run test:integration, or set FIREBASE_CLI_PATH to the Firebase CLI JS entry point.',
  );
const result = spawnSync(
  process.execPath,
  cli
    ? [cli, ...args]
    : [
        process.env.npm_execpath,
        'exec',
        '--yes',
        '--package',
        'firebase-tools@15.28.2',
        '--',
        'firebase',
        ...args,
      ],
  { stdio: 'inherit', env: process.env },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
