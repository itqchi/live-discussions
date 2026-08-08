import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const candidates = [
  'dist/apps/api/apps/api/src/main.js',
  'dist/apps/api/main.js',
];

for (const candidate of candidates) {
  const path = resolve(candidate);

  try {
    await access(path);
    await import(pathToFileURL(path).href);
    process.exitCode = 0;
    break;
  } catch (error) {
    if (candidate === candidates.at(-1)) {
      throw new Error(`Unable to find the compiled API entry point. Checked: ${candidates.join(', ')}`, {
        cause: error,
      });
    }
  }
}
