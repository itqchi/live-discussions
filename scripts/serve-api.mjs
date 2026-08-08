import { spawn } from 'node:child_process';
import { loadEnvFile } from 'node:process';

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
