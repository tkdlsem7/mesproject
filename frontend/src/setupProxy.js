// frontend/src/setupProxy.js
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8000', // ✅ 로컬 dev 백엔드
      changeOrigin: true,
      // FastAPI가 /api 밑에 서브앱으로 마운트되어 있으니까 pathRewrite는 필요 없음
      // pathRewrite: { '^/api': '' },
      logLevel: 'debug',
    })
  );
};
