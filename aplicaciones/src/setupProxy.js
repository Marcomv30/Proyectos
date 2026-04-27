const { createProxyMiddleware } = require('http-proxy-middleware');

function getTarget() {
  const explicitProxy = String(process.env.REACT_APP_API_PROXY || '').trim();
  if (explicitProxy) return explicitProxy;

  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3001';
  }

  return process.env.REACT_APP_API_URL || 'http://localhost:3001';
}

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: getTarget(),
      changeOrigin: true,
    })
  );

  app.use(
    '/ws',
    createProxyMiddleware({
      target: getTarget(),
      changeOrigin: true,
      ws: true,
    })
  );
};
