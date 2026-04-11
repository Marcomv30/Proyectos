const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs');
const path = require('path');

const runtimePortFile = path.resolve(__dirname, '../tmp/dev-api-port.txt');

function fallbackTarget() {
  const explicitProxy = String(process.env.REACT_APP_API_PROXY || '').trim();
  if (explicitProxy) return explicitProxy;

  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3001';
  }

  return process.env.REACT_APP_API_URL || 'http://localhost:3001';
}

function resolveTarget() {
  try {
    const runtimePort = fs.readFileSync(runtimePortFile, 'utf8').trim();
    if (/^\d+$/.test(runtimePort)) {
      return `http://localhost:${runtimePort}`;
    }
  } catch {}
  return fallbackTarget();
}

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: resolveTarget(),
      router: () => resolveTarget(),
      changeOrigin: true,
    })
  );

  app.use(
    '/ws',
    createProxyMiddleware({
      target: resolveTarget(),
      router: () => resolveTarget(),
      changeOrigin: true,
      ws: true,
    })
  );
};
