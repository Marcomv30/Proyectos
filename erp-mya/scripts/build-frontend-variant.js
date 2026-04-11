const { spawnSync } = require('child_process');
const path = require('path');

const variant = (process.argv[2] || 'erp').trim().toLowerCase();
const allowed = new Set(['erp', 'empacadora']);

if (!allowed.has(variant)) {
  console.error(`[build-frontend-variant] Variante no soportada: ${variant}`);
  process.exit(1);
}

const env = {
  ...process.env,
  REACT_APP_APP_MODE: variant,
};

const reactScriptsEntry = path.join(__dirname, '..', 'node_modules', 'react-scripts', 'bin', 'react-scripts.js');
const result = spawnSync(process.execPath, [reactScriptsEntry, 'build'], {
  stdio: 'inherit',
  env,
  shell: false,
});

if (result.error) {
  console.error('[build-frontend-variant] Error ejecutando build:', result.error.message);
  process.exit(1);
}

process.exit(result.status == null ? 1 : result.status);
