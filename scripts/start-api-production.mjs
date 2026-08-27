import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runMigrations } from './migrate-api.mjs';

const candidates = [
  'dist/apps/api/apps/api/src/main.js',
  'dist/apps/api/main.js',
];

await runMigrations();

let entryPoint;

for (const candidate of candidates) {
  const path = resolve(candidate);

  try {
    await access(path);
    entryPoint = path;
    break;
  } catch {
    // Try the next known Nx TypeScript output layout.
  }
}

if (!entryPoint) {
  throw new Error(`Unable to find the compiled API entry point. Checked: ${candidates.join(', ')}`);
}

await import(pathToFileURL(entryPoint).href);
