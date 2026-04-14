const { spawn } = require('child_process');

const proc = spawn('.\\cloudflared.exe', ['tunnel', '--url', 'http://localhost:3500'], {
  stdio: 'inherit',
  shell: true,
  windowsHide: true,
});

proc.on('error', e => {
  console.error('[cloudflared] error al iniciar:', e.message);
  process.exit(1);
});

proc.on('exit', code => {
  console.log(`[cloudflared] salió con código ${code}`);
  process.exit(code ?? 1);
});
