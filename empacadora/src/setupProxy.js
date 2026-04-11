const { createProxyMiddleware } = require('http-proxy-middleware');
const fs = require('fs');
const path = require('path');

const runtimePortFile = path.resolve(__dirname, '../../erp-mya/tmp/dev-api-port.txt');

function fallbackTarget() {
  return process.env.REACT_APP_API_PROXY || 'http://localhost:3001';
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

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: resolveTarget(),
      router: () => resolveTarget(),
      changeOrigin: true,
    })
  );
};
