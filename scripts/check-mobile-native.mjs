import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const platform = process.argv[2];
if (platform !== 'ios' && platform !== 'android') {
  console.error('Usage: node scripts/check-mobile-native.mjs <ios|android>');
  process.exit(2);
}

const nativeDirectory = resolve('apps', 'mobile', platform);
if (existsSync(nativeDirectory)) process.exit(0);

console.error(`Missing React Native ${platform} host project: apps/mobile/${platform}`);
console.error('Generate and review the native host project before running this target.');
console.error('See README.md -> React Native host setup for the Nx and LiveKit requirements.');
process.exit(1);
