const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');

// ── Caminhos de configuração ──────────────────────
const AUTH_FILE   = path.join(__dirname, 'auth.json');
const CONFIG_FILE = path.join(__dirname, 'server-config.json');

function loadAuth() {
    try { if (fs.existsSync(AUTH_FILE)) return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8')); }
    catch {}
    return null;
}

function loadServerConfig() {
    try { if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); }
    catch {}
    return {};
}

// Gera ou lê um segredo de sessão persistente
function getSessionSecret() {
    const secretFile = path.join(__dirname, '.session_secret');
    if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf-8').trim();
    const s = 'dash_' + require('crypto').randomBytes(32).toString('hex');
    fs.writeFileSync(secretFile, s);
    return s;
}

const PORT = process.env.PORT || loadServerConfig().port || 3000;
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true }
}));

// ── Rotas públicas (sem autenticação) ─────────────

// Estado de auth (usado pelo login.html para decidir qual form exibir)
app.get('/auth/status', (req, res) => {
    const auth = loadAuth();
    res.json({
        setup: !auth,
        authenticated: !!req.session.user
    });
});

// Primeiro acesso: configura domínio, email, token CVCRM e cria senha
app.post('/auth/setup', async (req, res) => {
    if (loadAuth()) return res.status(400).json({ error: 'Setup já realizado. Use /login.' });
    const { domain, email, token, password, password2 } = req.body;
    if (!domain || !email || !token || !password || !password2)
        return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    if (password !== password2)
        return res.status(400).json({ error: 'As senhas não coincidem.' });
    if (password.length < 6)
        return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });

    const hash = await bcrypt.hash(password, 10);
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Salva credenciais de autenticação (sem token API — fica no server-config)
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ email, password_hash: hash }, null, 2));

    // Salva configuração de proxy CVCRM
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({
        domain: cleanDomain, port: PORT, email, token
    }, null, 2));

    req.session.user = { email };
    res.json({ ok: true });
});

// Logins subsequentes: apenas email + senha
app.post('/auth/login', async (req, res) => {
    const auth = loadAuth();
    if (!auth) return res.status(400).json({ error: 'Setup não concluído. Acesse /login.' });
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Preencha todos os campos.' });
    if (email !== auth.email) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    const valid = await bcrypt.compare(password, auth.password_hash);
    if (!valid) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    req.session.user = { email };
    res.json({ ok: true });
});

// Logout
app.get('/auth/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

// Página de login (pública — entregue antes do middleware de auth)
app.get('/login', (req, res) => {
    if (req.session?.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// ── Middleware de autenticação ────────────────────
function requireAuth(req, res, next) {
    if (req.session?.user) return next();
    if (req.path.startsWith('/api')) return res.status(401).json({ error: 'Não autenticado.' });
    res.redirect('/login');
}

// ── Proxy CVCRM (protegido) ───────────────────────
app.use('/api', requireAuth, createProxyMiddleware({
    target: 'https://placeholder.cvcrm.com.br',  // sobrescrito pelo router abaixo
    changeOrigin: true,
    secure: true,
    router: () => {
        const sc = loadServerConfig();
        return `https://${sc.domain || 'placeholder.cvcrm.com.br'}`;
    },
    pathRewrite: { '^/api': '/api' },
    onProxyReq: (proxyReq, req) => {
        const sc = loadServerConfig();
        if (sc.email) proxyReq.setHeader('email', sc.email);
        if (sc.token) proxyReq.setHeader('token', sc.token);
        proxyReq.setHeader('Content-Type', 'application/json');
        console.log(`[PROXY] ${req.method} ${req.originalUrl}`);
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

// ── Arquivos estáticos (protegidos) ──────────────
app.use(requireAuth, express.static(path.join(__dirname, 'public')));

// ── Fallback ─────────────────────────────────────
app.get('*', (req, res) => {
    if (!req.session?.user) return res.redirect('/login');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────
app.listen(PORT, () => {
    const auth = loadAuth();
    const sc   = loadServerConfig();
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════╗');
    console.log('  ║   CV CRM — Dashboard de Vendas                  ║');
    console.log(`  ║   http://localhost:${PORT}                            ║`);
    console.log('  ╚══════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  Domínio:  ${sc.domain || '(não configurado — acesse /login)'}`);
    console.log(`  Auth:     ${auth ? auth.email : 'Setup pendente → /login'}`);
    console.log('');
});
