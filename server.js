const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const fs = require('fs');

// ── Configuração: lê de server-config.json ──
let serverConfig = { domain: 'gthome.cvcrm.com.br', port: 3000, email: '', token: '' };
try {
    const cfgPath = path.join(__dirname, 'server-config.json');
    if (fs.existsSync(cfgPath)) {
        serverConfig = { ...serverConfig, ...JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) };
    }
} catch (e) {
    console.warn('⚠ Erro ao ler server-config.json, usando padrões:', e.message);
}

const DOMAIN = serverConfig.domain;
const PORT = process.env.PORT || serverConfig.port || 3000;
const TARGET = `https://${DOMAIN}`;
const AUTH_EMAIL = serverConfig.email;
const AUTH_TOKEN = serverConfig.token;

const app = express();

// ── CORS: permite todas as origens (desenvolvimento local) ──
app.use(cors());

// ── Proxy: /api/* → https://{DOMAIN}/api/* ──
// Auth headers são injetados server-side para evitar CORS preflight issues
app.use('/api', createProxyMiddleware({
    target: TARGET,
    changeOrigin: true,
    secure: true,
    pathRewrite: { '^/api': '/api' },
    onProxyReq: (proxyReq, req) => {
        // Injeta headers de autenticação do CV CRM no server-side
        // Isso evita que o browser precise enviar headers custom (que causam CORS preflight)
        if (AUTH_EMAIL) proxyReq.setHeader('email', AUTH_EMAIL);
        if (AUTH_TOKEN) proxyReq.setHeader('token', AUTH_TOKEN);
        proxyReq.setHeader('Content-Type', 'application/json');

        console.log(`[PROXY] ${req.method} ${req.originalUrl} → ${TARGET}${req.originalUrl}`);
    },
    onProxyRes: (proxyRes) => {
        proxyRes.headers['access-control-allow-origin'] = '*';
        proxyRes.headers['access-control-allow-headers'] = '*';
        proxyRes.headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    },
    onError: (err, req, res) => {
        console.error('[PROXY ERROR]', err.message);
        res.status(502).json({ error: 'Erro ao conectar com CV CRM', details: err.message });
    }
}));

// ── Arquivos estáticos (dashboard) ──
app.use(express.static(path.join(__dirname, 'public')));

// ── Fallback: serve index.html para qualquer rota não-API ──
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ──
app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║   CV CRM — Dashboard de Vendas                  ║');
    console.log('  ║   Servidor rodando com proxy CORS                ║');
    console.log(`  ║   http://localhost:${PORT}                            ║`);
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  Domínio: ${DOMAIN}`);
    console.log(`  Auth:    ${AUTH_EMAIL || '(não configurado)'}`);
    console.log(`  Proxy:   /api/* → ${TARGET}/api/*`);
    console.log('  Headers: email/token injetados no server-side');
    console.log('  CORS:    habilitado para todas as origens');
    console.log('');
});
