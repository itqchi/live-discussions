import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';

const localEnvKeys = [
  'LIVEKIT_URL',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET',
  'DATABASE_DRIVER',
  'DATABASE_URL',
  'REDIS_URL',
];

for (const key of localEnvKeys) {
  delete process.env[key];
}

loadEnvFile('.env');

const child = spawn('npx', ['nx', 'serve', 'api'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NX_DAEMON: 'false',
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
