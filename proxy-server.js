const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

const app = express();
app.use(cors());

app.use('/proxy', (req, res, next) => {
  const target = req.query.url;
  if (!target) return res.status(400).json({ error: 'url param required' });
  const parsed = new URL(target);
  const base = parsed.origin;
  createProxyMiddleware({
    target: base,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq) => {
        proxyReq.path = parsed.pathname + parsed.search;
      }
    }
  })(req, res, next);
});

app.listen(3001, () => console.log('Proxy rodando em http://localhost:3001'));

