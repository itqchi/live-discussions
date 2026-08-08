import { writeFile } from 'node:fs/promises';

const apiBaseUrl = process.env.API_BASE_URL?.trim();

if (!apiBaseUrl) {
  throw new Error('API_BASE_URL is required when building the hosted web app.');
}

const url = new URL(apiBaseUrl);
if (url.protocol !== 'https:' && url.protocol !== 'http:') {
  throw new Error('API_BASE_URL must use http or https.');
}

const config = `window.__LIVE_DISCUSSIONS_CONFIG__ = ${JSON.stringify({ apiBaseUrl: url.toString().replace(/\/$/, '') })};\n`;
await writeFile('apps/web/src/runtime-config.js', config, 'utf8');
