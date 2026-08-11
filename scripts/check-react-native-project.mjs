import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const workspaceRoot = process.cwd();
const mobileRoot = resolve(workspaceRoot, 'apps/mobile');
const cli = resolve(workspaceRoot, 'node_modules/react-native/cli.js');

let config;
try {
  const output = execFileSync(process.execPath, [cli, 'config'], {
    cwd: mobileRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  config = JSON.parse(output);
} catch (error) {
  const stderr = error && typeof error === 'object' && 'stderr' in error
    ? String(error.stderr ?? '')
    : '';
  if (stderr) console.error(stderr.trim());
  throw new Error('React Native CLI could not resolve the mobile project configuration.');
}

const android = config?.project?.android;
const ios = config?.project?.ios;

if (!android || android.packageName !== 'com.mobile') {
  console.error('Resolved Android project:', JSON.stringify(android ?? null, null, 2));
  throw new Error('React Native CLI must resolve Android packageName=com.mobile.');
}
if (typeof android.sourceDir !== 'string' || !android.sourceDir.endsWith('/apps/mobile/android')) {
  console.error('Resolved Android project:', JSON.stringify(android, null, 2));
  throw new Error('React Native CLI resolved the wrong Android sourceDir.');
}
if (!ios || typeof ios.sourceDir !== 'string' || !ios.sourceDir.endsWith('/apps/mobile/ios')) {
  console.error('Resolved iOS project:', JSON.stringify(ios ?? null, null, 2));
  throw new Error('React Native CLI resolved the wrong iOS sourceDir.');
}

console.log(`✓ React Native Android project: ${android.packageName} @ ${android.sourceDir}`);
console.log(`✓ React Native iOS project: ${ios.sourceDir}`);
