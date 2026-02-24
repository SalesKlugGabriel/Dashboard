// ════════════════════════════════════════════════
// CV CRM — Dashboard de Vendas — App Logic
// Configuração: edite APENAS config.js
// ════════════════════════════════════════════════

const C = window.CONFIG || {};
const API = C.api || {};
const THEME = C.theme || {};
const BRAND = C.brand || {};
const OPTS = C.options || {};

const LS = {
    get: (k, d) => { try { const v = localStorage.getItem('dash_' + k); return v !== null ? JSON.parse(v) : d } catch { return d } },
    set: (k, v) => { try { localStorage.setItem('dash_' + k, JSON.stringify(v)) } catch { } }
};

let S = {
    email: API.email || '',
    days: LS.get('days', OPTS.defaultDays || 30),
    dateFrom: null, dateTo: null,
    leads: [], sims: [], reservas: [], vendas: [], users: [],
    ranking: [], ch: {}
};

// Theme colors (from config)
const GT = THEME.primary || '#E87722';
const GDK = THEME.primaryDark || '#c85e10';
const GOK = THEME.success || '#2ecc71';
const TXS = THEME.textMuted || '#888888';

// ════════════════════════════════════════════════
// APPLY THEME & BRANDING ON INIT
// ════════════════════════════════════════════════
function applyTheme() {
    const r = document.documentElement.style;
    if (THEME.primary) r.setProperty('--gt', THEME.primary);
    if (THEME.primaryDark) r.setProperty('--gdk', THEME.primaryDark);
    if (THEME.success) r.setProperty('--gok', THEME.success);
    if (THEME.background) r.setProperty('--bg', THEME.background);
    if (THEME.surface1) r.setProperty('--s1', THEME.surface1);
    if (THEME.surface2) r.setProperty('--s2', THEME.surface2);
    if (THEME.text) r.setProperty('--tx', THEME.text);
    if (THEME.textMuted) { r.setProperty('--txm', THEME.textMuted); r.setProperty('--txs', THEME.textMuted); }
}

function applyBranding() {
    const nameEl = document.getElementById('brand-name');
    const tagEl = document.getElementById('brand-tagline');
    const titleEl = document.getElementById('brand-title');
    const logoEl = document.getElementById('brand-logo');

    if (nameEl && BRAND.name) nameEl.innerHTML = BRAND.name;
    if (tagEl && BRAND.tagline) tagEl.textContent = BRAND.tagline;
    if (titleEl && BRAND.title) titleEl.textContent = BRAND.title;
    if (logoEl && BRAND.logoUrl) {
        logoEl.innerHTML = `<img src="${BRAND.logoUrl}" alt="${BRAND.name}" style="height:36px;object-fit:contain">`;
    }

    document.title = `${BRAND.name || 'Dashboard'} — ${BRAND.title || 'Dashboard de Vendas'}`;

    // Set config modal default email
    const cfgEmail = document.getElementById('cfg-email');
    if (cfgEmail) cfgEmail.value = S.email;
}

// ════════════════════════════════════════════════
// CONFIG MODAL
// ════════════════════════════════════════════════
function saveConfig() {
    const em = document.getElementById('cfg-email').value.trim();
    if (!em) { alert('Insira o e-mail.'); return; }
    S.email = em; LS.set('email', em);
    document.getElementById('configModal').style.display = 'none';
    loadAllData();
}
function showConfig() { document.getElementById('configModal').style.display = 'flex'; }
function checkConfig() { return true; }

// ════════════════════════════════════════════════
// API HELPERS
// ════════════════════════════════════════════════
const hdrs = () => ({ 'email': S.email, 'token': API.token || '', 'Content-Type': 'application/json' });

async function apiFetch(path, opts = {}) {
    const u = new URL(window.location.origin + path);
    if (opts.params) Object.entries(opts.params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
    const r = await fetch(u.toString(), { method: opts.method || 'GET', headers: hdrs() });
    if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status} em ${path}: ${body.substring(0, 200)}`);
    }
    return r.json();
}

// ════════════════════════════════════════════════
// DATA LOADERS
// ════════════════════════════════════════════════
async function loadLeads() {
    setStatus('Buscando Leads...', '', 'load');
    try {
        const data = await apiFetch('/api/cvio/lead', { params: { registros_por_pagina: 500 } });
        S.leads = data.leads || data.data || (Array.isArray(data) ? data : []);
        setStatus('Leads carregados', `${S.leads.length} registros`, 'load');
    } catch (e) { console.warn('Leads error:', e); S.leads = []; }
}

async function loadAtendimentos() {
    setStatus('Buscando Atendimentos...', '', 'load');
    try {
        const data = await apiFetch('/api/cvio/listar_atendimentos', { params: { registros_por_pagina: 500 } });
        const items = data.atendimentos || data.data || (Array.isArray(data) ? data : []);
        S.sims = items;
        setStatus('Atendimentos carregados', `${items.length} registros`, 'load');
    } catch (e) { console.warn('Atendimentos error:', e); S.sims = []; }
}

async function loadReservas() {
    setStatus('Buscando Reservas...', '', 'load');
    try {
        const data = await apiFetch('/api/v1/comercial/reservas');
        S.reservas = Array.isArray(data) ? data : (data.reservas || data.data || []);
        S.vendas = S.reservas.filter(r =>
            /vend/i.test(r.situacao || r.situacao_reserva || '') || r.vendida === true || r.vendida === 1
        );
        setStatus('Reservas carregadas', `${S.reservas.length} registros`, 'load');
    } catch (e) { console.warn('Reservas error:', e); S.reservas = []; S.vendas = []; }
}

async function loadUsers() {
    setStatus('Buscando corretores...', '', 'load');
    const usersMap = {};
    S.leads.forEach(l => {
        if (l.gestor && l.gestor.id) usersMap[l.gestor.id] = { id: l.gestor.id, nome: l.gestor.nome, email: l.gestor.email };
        if (l.corretor && l.corretor.id) usersMap[l.corretor.id] = { id: l.corretor.id, nome: l.corretor.nome, email: l.corretor.email };
    });
    S.users = Object.values(usersMap);
    fillSelects();
}

function fillSelects() {
    ['f-gerente', 'ind-sel'].forEach(id => {
        const sel = document.getElementById(id); if (!sel) return;
        const prev = sel.value;
        while (sel.options.length > 1) sel.remove(1);
        S.users.forEach(u => {
            if (u.nome) { const o = document.createElement('option'); o.value = u.id; o.textContent = u.nome; sel.appendChild(o); }
        });
        if (prev) sel.value = prev;
    });
}

// ════════════════════════════════════════════════
// DATES
// ════════════════════════════════════════════════
function setRange(days) {
    S.days = days; S.dateTo = new Date();
    S.dateFrom = new Date(); S.dateFrom.setDate(S.dateFrom.getDate() - days);
}
function inRange(str) {
    if (!str) return false;
    try {
        const d = new Date(str.replace(' ', 'T'));
        return (!S.dateFrom || d >= S.dateFrom) && (!S.dateTo || d <= S.dateTo);
    }
    catch { return false }
}
const fmt8 = d => d instanceof Date ? d.toISOString().substring(0, 10) : String(d);

// ════════════════════════════════════════════════
// STATUS BAR
// ════════════════════════════════════════════════
function setStatus(lbl, det, type) {
    document.getElementById('adot').className = 'adot ' + type;
    document.getElementById('albl').textContent = lbl;
    document.getElementById('adet').textContent = det || '';
    if (type === 'ok') {
        const n = new Date();
        document.getElementById('alast').textContent =
            'Atualizado: ' + n.toLocaleDateString('pt-BR') + ' às ' + n.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
}

// ════════════════════════════════════════════════
// MAIN LOADER
// ════════════════════════════════════════════════
async function loadAllData() {
    if (!checkConfig()) return;
    if (!S.dateFrom) setRange(S.days);
    document.getElementById('rank-load').style.display = 'flex';
    document.getElementById('rank-tbody').innerHTML = '';
    document.getElementById('rank-mob').innerHTML = '';
    setStatus('Conectando ao CV CRM via proxy...', '', 'load');
    document.querySelectorAll('.err-box,.cors-notice').forEach(e => e.remove());
    try {
        await loadLeads();
        await loadAtendimentos();
        await loadReservas();
        await loadUsers();
        setStatus('Processando dados...', '', 'load');
        processAll();
        setStatus(
            'Dados carregados — CV CRM',
            `${S.leads.length} leads · ${S.reservas.length} reservas · ${S.vendas.length} vendas`,
            'ok'
        );
    } catch (err) {
        console.error('CV CRM Error:', err);
        setStatus('Erro na conexão', err.message.substring(0, 80), 'err');
        showErr(err, err.message.includes('Failed to fetch'));
    }
}

// ════════════════════════════════════════════════
// FIELD EXTRACTORS
// ════════════════════════════════════════════════
const gDate = o => {
    for (const f of ['data_cad', 'data_cadastro', 'criado_em', 'created_at', 'data_criacao', 'data_reserva',
        'data_venda', 'data_simulacao', 'data_atendimento', 'data_inicio', 'dt_cadastro', 'datacadastro', 'data', 'datareserva'])
        if (o[f]) return o[f];
    return null;
};
const gCorr = o => {
    if (o.gestor && o.gestor.nome) return o.gestor.nome;
    if (typeof o.corretor === 'object' && o.corretor && o.corretor.nome) return o.corretor.nome;
    return o.nome_corretor || o.corretor_nome || o.nome_responsavel || o.responsavel_nome || o.usuario_nome || o.nome_vendedor || o.corretor || o.responsavel || '';
};
const gCorrId = o => {
    if (o.gestor && o.gestor.id) return o.gestor.id;
    if (typeof o.corretor === 'object' && o.corretor && o.corretor.id) return o.corretor.id;
    return o.id_corretor || o.corretor_id || o.id_responsavel || o.responsavel_id || o.id_usuario || null;
};
const gVgv = o => {
    for (const f of ['valor_venda', 'valor_total', 'vgv', 'preco', 'valor', 'preco_venda', 'valor_reserva'])
        if (o[f] && !isNaN(+o[f])) return +o[f];
    return 0;
};
const gEmpNome = o => o.nome_empreendimento || o.empreendimento_nome || o.empreendimento ||
    (o.empreendimento && typeof o.empreendimento === 'object' ? o.empreendimento.nome : null) || null;
const gOrigem = o => o.midia_principal || o.origem || o.midia || o.fonte || o.canal || o.midia_nome || o.nome_midia || 'Não informado';

// ════════════════════════════════════════════════
// PROCESS & RENDER
// ════════════════════════════════════════════════
function processAll() {
    const leads = S.leads.filter(x => inRange(gDate(x)));
    const sims = S.sims.filter(x => inRange(gDate(x)));
    const reservas = S.reservas.filter(x => inRange(gDate(x)));
    const vendas = S.vendas.filter(x => inRange(gDate(x)));
    const fLeads = leads.length ? leads : S.leads;
    const fSims = sims.length ? sims : S.sims;
    const fReservas = reservas.length ? reservas : S.reservas;
    const fVendas = vendas.length ? vendas : S.vendas;
    const nL = fLeads.length, nS = fSims.length, nR = fReservas.length, nV = fVendas.length;
    const taxa = nL > 0 ? ((nR / nL) * 100).toFixed(1) : '0.0';
    const vgv = fVendas.length ? fVendas.reduce((s, x) => s + gVgv(x), 0) : fReservas.reduce((s, x) => s + gVgv(x), 0);
    const nVis = fLeads.filter(x =>
        /visit/i.test(x.situacao_lead || x.situacao || '') || x.visitou === true || x.visita === true || +x.qtd_visitas > 0 || +x.visitas > 0
    ).length || fSims.length || Math.round(nL * 0.6);
    const corrSet = new Set([...fLeads, ...fReservas, ...fVendas].map(gCorrId).filter(Boolean));

    st('m-leads', fN(nL)); st('m-visitas', fN(nVis));
    st('m-sim', fN(nS)); st('m-res', fN(nR));
    st('m-vend', fN(nV)); st('m-taxa', taxa + '%');
    st('m-vgv', fVgvFmt(vgv)); st('m-corr', String(corrSet.size));

    const byC = {};
    const addC = (arr, tipo) => arr.forEach(x => {
        const id = gCorrId(x) || '__sem__'; const nome = gCorr(x) || 'Não atribuído';
        if (!byC[id]) byC[id] = { id, nome, l: 0, s: 0, r: 0, v: 0, vgv: 0 };
        byC[id][tipo]++; if (tipo === 'r' || tipo === 'v') byC[id].vgv += gVgv(x);
    });
    addC(fLeads, 'l'); addC(fSims, 's'); addC(fReservas, 'r'); addC(fVendas, 'v');
    S.ranking = Object.values(byC).filter(c => c.nome !== 'Não atribuído' || c.l > 0).sort((a, b) => b.vgv - a.vgv || b.r - a.r || b.l - a.l);
    renderRanking(S.ranking);
    renderFunil(nL, nVis, nS, nR, nV);
    renderTrend(fLeads, fReservas, fVendas);
    renderEmp(fReservas);
    renderOri(fLeads);
}

// ════════════════════════════════════════════════
// RANKING
// ════════════════════════════════════════════════
function renderRanking(data) {
    document.getElementById('rank-load').style.display = 'none';
    const medals = ['🥇', '🥈', '🥉'];
    const tb = document.getElementById('rank-tbody');
    const mb = document.getElementById('rank-mob');
    tb.innerHTML = ''; mb.innerHTML = '';
    if (!data.length) { tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--txm);padding:2rem">Nenhum dado para o período.</td></tr>'; return; }
    data.forEach((c, i) => {
        const rk = i + 1, taxa = c.l > 0 ? ((c.r / c.l) * 100).toFixed(1) : '0.0';
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong style="color:var(--gt)">${medals[i] || rk + 'º'}</strong></td>
      <td><strong>${esc(c.nome)}</strong></td>
      <td>${c.l}</td><td>${c.s}</td><td>${c.r}</td><td>${c.v}</td>
      <td><strong style="color:var(--gt)">${fVgvFmt(c.vgv)}</strong></td>
      <td><span class="badge b-gt">${taxa}%</span></td>`;
        tb.appendChild(tr);
        const cd = document.createElement('div');
        cd.className = `rc${rk <= 3 ? ' r' + rk : ''}`;
        cd.innerHTML = `<div class="rc-h"><span class="rc-name">${esc(c.nome)}</span><span class="rc-bdg">${medals[i] || rk + 'º'}</span></div>
      <div class="rc-s">
        <div><div class="rsl">Leads</div><div class="rsv">${c.l}</div></div>
        <div><div class="rsl">Reservas</div><div class="rsv">${c.r}</div></div>
        <div><div class="rsl">Vendas</div><div class="rsv">${c.v}</div></div>
        <div><div class="rsl">VGV</div><div class="rsv">${fVgvFmt(c.vgv)}</div></div>
      </div>`;
        mb.appendChild(cd);
    });
}

// ════════════════════════════════════════════════
// CHARTS — Colors use theme variables
// ════════════════════════════════════════════════
Chart.defaults.color = TXS; Chart.defaults.borderColor = THEME.surface2 || '#2a2a2a';

function hexToRgba(hex, a) { const h = hex.replace('#', ''); const r = parseInt(h.substring(0, 2), 16); const g = parseInt(h.substring(2, 4), 16); const b = parseInt(h.substring(4, 6), 16); return `rgba(${r},${g},${b},${a})`; }

function renderFunil(l, vis, s, r, v) {
    if (S.ch.funil) S.ch.funil.destroy();
    S.ch.funil = new Chart(document.getElementById('c-funil').getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Leads', 'Visitas', 'Atendimentos', 'Reservas', 'Vendas'],
            datasets: [{
                label: 'Quantidade', data: [l, vis, s, r, v],
                backgroundColor: [hexToRgba(GDK, .85), hexToRgba(GT, .8), hexToRgba(GT, .65), hexToRgba(GT, .8), hexToRgba(GOK, .75)],
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: THEME.surface2 || '#2a2a2a' } }, x: { grid: { display: false } } }
        }
    });
}

function renderTrend(leads, reservas, vendas) {
    if (S.ch.trend) S.ch.trend.destroy();
    const W = {};
    const add = (arr, k) => arr.forEach(x => {
        const d = gDate(x); if (!d) return;
        const wk = wkey(new Date(d.replace(' ', 'T'))); if (!W[wk]) W[wk] = { l: 0, r: 0, v: 0 }; W[wk][k]++;
    });
    add(leads, 'l'); add(reservas, 'r'); add(vendas, 'v');
    const sorted = Object.keys(W).sort();
    S.ch.trend = new Chart(document.getElementById('c-trend').getContext('2d'), {
        type: 'line',
        data: {
            labels: sorted.map(w => w.replace(/\d{4}-W/, 'Sem ')),
            datasets: [
                { label: 'Leads', data: sorted.map(w => W[w].l), borderColor: GDK, backgroundColor: hexToRgba(GDK, .12), tension: .4, fill: true, pointBackgroundColor: GDK },
                { label: 'Reservas', data: sorted.map(w => W[w].r), borderColor: GT, backgroundColor: hexToRgba(GT, .1), tension: .4, fill: true, pointBackgroundColor: GT },
                { label: 'Vendas', data: sorted.map(w => W[w].v), borderColor: GOK, backgroundColor: hexToRgba(GOK, .1), tension: .4, fill: true, pointBackgroundColor: GOK }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: TXS, padding: 16, usePointStyle: true } } },
            scales: { y: { beginAtZero: true, grid: { color: THEME.surface2 || '#2a2a2a' } }, x: { grid: { display: false } } }
        }
    });
}

function renderEmp(reservas) {
    if (S.ch.emp) S.ch.emp.destroy();
    const m = {}; reservas.forEach(x => { const n = gEmpNome(x) || 'Outros'; m[n] = (m[n] || 0) + 1; });
    const pairs = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!pairs.length) pairs.push(['Sem dados', 1]);
    S.ch.emp = new Chart(document.getElementById('c-emp').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: pairs.map(([l]) => l),
            datasets: [{
                data: pairs.map(([, v]) => v),
                backgroundColor: [GDK, GT, hexToRgba(GT, .7), hexToRgba(GT, .5), GOK, hexToRgba(GOK, .7), '#f59e0b', '#555'],
                borderWidth: 2, borderColor: THEME.surface1 || '#1e1e1e'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { color: TXS, boxWidth: 12, padding: 12 } } }
        }
    });
}

function renderOri(leads) {
    if (S.ch.ori) S.ch.ori.destroy();
    const m = {}; leads.forEach(x => { const o = gOrigem(x); m[o] = (m[o] || 0) + 1; });
    const pairs = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!pairs.length) pairs.push(['Sem dados', 1]);
    S.ch.ori = new Chart(document.getElementById('c-ori').getContext('2d'), {
        type: 'bar',
        data: {
            labels: pairs.map(([l]) => l), datasets: [{
                label: 'Leads', data: pairs.map(([, v]) => v),
                backgroundColor: hexToRgba(GT, .75), borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, grid: { color: THEME.surface2 || '#2a2a2a' } }, y: { grid: { display: false } } }
        }
    });
}

// ════════════════════════════════════════════════
// INDIVIDUAL
// ════════════════════════════════════════════════
function loadInd(id) {
    if (!id) { document.getElementById('ind-c').style.display = 'none'; document.getElementById('ind-empty').style.display = 'flex'; return; }
    const c = S.ranking.find(x => String(x.id) === String(id));
    const u = S.users.find(x => String(x.id) === String(id));
    const nome = (u?.nome || c?.nome || 'Corretor');
    document.getElementById('ind-c').style.display = 'block';
    document.getElementById('ind-empty').style.display = 'none';
    document.getElementById('ind-nome').textContent = nome;
    document.getElementById('ind-per').textContent = `Performance — Últimos ${S.days} dias`;
    if (!c) {
        ['i-l', 'i-s', 'i-r', 'i-v'].forEach(k => st(k, '0'));
        st('i-tx', '0%'); st('i-vgv', 'R$ 0'); st('i-tkt', 'R$ 0'); st('i-rnk', '—'); return;
    }
    st('i-l', String(c.l)); st('i-s', String(c.s)); st('i-r', String(c.r)); st('i-v', String(c.v));
    st('i-tx', c.l > 0 ? ((c.r / c.l) * 100).toFixed(1) + '%' : '0%');
    st('i-vgv', fVgvFmt(c.vgv));
    st('i-tkt', fVgvFmt(c.r > 0 ? Math.round(c.vgv / c.r) : 0));
    st('i-rnk', (S.ranking.indexOf(c) + 1) + 'º');
    renderIndCharts(c);
}

function renderIndCharts(c) {
    if (S.ch.if) S.ch.if.destroy();
    if (S.ch.ir) S.ch.ir.destroy();
    S.ch.if = new Chart(document.getElementById('i-funil').getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Leads', 'Atendimentos', 'Reservas', 'Vendas'],
            datasets: [{
                data: [c.l, c.s, c.r, c.v],
                backgroundColor: [hexToRgba(GDK, .85), hexToRgba(GT, .8), hexToRgba(GT, .75), hexToRgba(GOK, .75)], borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: THEME.surface2 || '#2a2a2a' } }, x: { grid: { display: false } } }
        }
    });
    if (S.ranking.length > 1) {
        const avg = f => S.ranking.reduce((s, x) => s + (x[f] || 0), 0) / S.ranking.length || 1;
        const n = (v, f) => Math.min(+(v / avg(f) * 100).toFixed(0), 200);
        S.ch.ir = new Chart(document.getElementById('i-radar').getContext('2d'), {
            type: 'radar',
            data: {
                labels: ['Leads', 'Atendimentos', 'Reservas', 'Vendas', 'VGV'],
                datasets: [
                    {
                        label: c.nome, data: [n(c.l, 'l'), n(c.s, 's'), n(c.r, 'r'), n(c.v, 'v'), n(c.vgv, 'vgv')],
                        borderColor: GT, backgroundColor: hexToRgba(GT, .15), pointBackgroundColor: GT
                    },
                    {
                        label: 'Média Equipe', data: [100, 100, 100, 100, 100],
                        borderColor: GDK, backgroundColor: hexToRgba(GDK, .08), pointBackgroundColor: GDK
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    r: {
                        beginAtZero: true, max: 200, grid: { color: THEME.surface2 || '#2a2a2a' }, angleLines: { color: THEME.surface2 || '#2a2a2a' },
                        pointLabels: { color: TXS, font: { size: 11, weight: '700' } }, ticks: { color: TXS, backdropColor: 'transparent' }
                    }
                },
                plugins: { legend: { position: 'bottom', labels: { color: TXS, padding: 16, usePointStyle: true } } }
            }
        });
    }
}

// ════════════════════════════════════════════════
// SIDEBARS, TABS, PERIOD
// ════════════════════════════════════════════════
function openSB(id) { document.getElementById(id).classList.add('on'); document.getElementById('ov').classList.add('on'); }
function closeSB(id) {
    document.getElementById(id).classList.remove('on');
    if (!document.querySelector('.sb.on')) document.getElementById('ov').classList.remove('on');
}

document.getElementById('ov').addEventListener('click', () => {
    document.querySelectorAll('.sb').forEach(x => x.classList.remove('on'));
    document.getElementById('ov').classList.remove('on');
});

document.querySelectorAll('.nt').forEach(t => t.addEventListener('click', function () {
    document.querySelectorAll('.nt').forEach(x => x.classList.remove('on'));
    document.querySelectorAll('.tabc').forEach(x => x.classList.remove('on'));
    this.classList.add('on'); document.getElementById('tab-' + this.dataset.tab).classList.add('on');
}));

document.querySelectorAll('.pb').forEach(b => b.addEventListener('click', function () {
    if (!this.dataset.days) return;
    document.querySelectorAll('.pb').forEach(x => x.classList.remove('on'));
    this.classList.add('on');
    const d = +this.dataset.days; setRange(d); LS.set('days', d);
    setPlbl('Últimos ' + d + ' dias'); processAll();
}));

document.querySelectorAll('.qbtn').forEach(b => b.addEventListener('click', function () {
    document.querySelectorAll('.qbtn').forEach(x => x.classList.remove('on'));
    this.classList.add('on'); const d = +this.dataset.days; setRange(d);
    const to = new Date(), from = new Date(); from.setDate(from.getDate() - d);
    document.getElementById('f-from').value = fmt8(from);
    document.getElementById('f-to').value = fmt8(to);
    document.getElementById('f-to').removeAttribute('disabled');
    setPlbl('Últimos ' + d + ' dias');
}));

document.getElementById('f-from').addEventListener('change', function () {
    const from = new Date(this.value), max = new Date(from); max.setDate(max.getDate() + 183);
    const tel = document.getElementById('f-to'); tel.removeAttribute('disabled');
    tel.min = this.value; tel.max = fmt8(max);
    document.querySelectorAll('.qbtn').forEach(x => x.classList.remove('on'));
    setPlbl('Personalizado');
});

function applyFilter() {
    const from = document.getElementById('f-from').value;
    const to = document.getElementById('f-to').value;
    const gid = document.getElementById('f-gerente').value;
    if (from) S.dateFrom = new Date(from);
    if (to) { S.dateTo = new Date(to); S.dateTo.setHours(23, 59, 59); }
    if (gid) {
        document.getElementById('ind-sel').value = gid;
        document.querySelector('[data-tab="individual"]').click(); loadInd(gid);
    }
    processAll(); closeSB('sb-filter');
}

function cleanFilter() {
    setRange(OPTS.defaultDays || 30);
    document.querySelectorAll('.qbtn').forEach(x => x.classList.toggle('on', x.dataset.days === String(OPTS.defaultDays || 30)));
    document.getElementById('f-from').value = ''; document.getElementById('f-to').value = '';
    document.getElementById('f-to').setAttribute('disabled', true);
    document.getElementById('f-gerente').value = '';
    setPlbl('Últimos ' + (OPTS.defaultDays || 30) + ' dias'); processAll();
}

function setPlbl(l) { document.getElementById('pchip').textContent = '📅 ' + l; document.getElementById('hplbl').textContent = l; }

// ════════════════════════════════════════════════
// TV MODE
// ════════════════════════════════════════════════
let tvActive = false, tvTmr = null, tvI = 0;
const tvSec = OPTS.tvIntervalSec || 15;
const TVS = [{ s: '#mg-top' }, { s: '#tab-geral .cg:first-of-type' }, { s: '#tab-geral .sec' }];

function startTV() {
    tvActive = true;
    document.querySelector('[data-tab="geral"]').click();
    document.documentElement.requestFullscreen?.().catch(() => { });
    document.getElementById('btn-tv').classList.add('on');
    document.getElementById('fab-exit').classList.add('on');
    document.getElementById('tvbar').classList.add('on');
    const dots = document.getElementById('tvdots'); dots.classList.add('on');
    dots.innerHTML = TVS.map((_, i) => `<div class="tvd${i === 0 ? ' on' : ''}"></div>`).join('');
    tvI = 0; scrollTV(0); tvProgress();
}
function stopTV() {
    tvActive = false; clearInterval(tvTmr);
    document.exitFullscreen?.().catch(() => { });
    document.getElementById('btn-tv').classList.remove('on');
    document.getElementById('fab-exit').classList.remove('on');
    document.getElementById('tvbar').classList.remove('on');
    document.getElementById('tvdots').classList.remove('on');
    document.getElementById('tvfill').style.width = '0%';
}
function scrollTV(i) {
    const el = document.querySelector(TVS[i].s); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelectorAll('.tvd').forEach((d, j) => d.classList.toggle('on', j === i));
}
function tvProgress() {
    clearInterval(tvTmr); let e = 0; const tot = tvSec * 1000;
    const fill = document.getElementById('tvfill'); fill.style.transition = 'none'; fill.style.width = '0%';
    tvTmr = setInterval(() => {
        if (!tvActive) { clearInterval(tvTmr); return; } e += 100;
        fill.style.transition = 'width .1s linear'; fill.style.width = Math.min(e / tot * 100, 100) + '%';
        if (e >= tot) {
            e = 0; fill.style.transition = 'none'; fill.style.width = '0%';
            tvI = (tvI + 1) % TVS.length; scrollTV(tvI);
        }
    }, 100);
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && tvActive) stopTV(); });

// ════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════
function st(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fN(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n); }
function fVgvFmt(v) {
    if (!v || isNaN(v)) return 'R$ 0';
    if (v >= 1e9) return 'R$ ' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return 'R$ ' + (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return 'R$ ' + (v / 1e3).toFixed(0) + 'K';
    return 'R$ ' + Math.round(v).toLocaleString('pt-BR');
}
function fVgv(v) { return fVgvFmt(v); }
function wkey(d) {
    const j = new Date(d.getFullYear(), 0, 1);
    return d.getFullYear() + '-W' + String(Math.ceil(((d - j) / 86400000 + j.getDay() + 1) / 7)).padStart(2, '0');
}

function showErr(err, isCORS) {
    const target = document.getElementById('abar');
    const div = document.createElement('div');
    div.className = isCORS ? 'cors-notice' : 'err-box';
    div.innerHTML = isCORS
        ? `<strong>⚠ Erro de conexão</strong>Verifique se o servidor proxy está rodando<br><em>${esc(err.message)}</em>`
        : `<strong>⚠ Erro</strong>${esc(err.message)}<br><em>Verifique e-mail, token e permissões no CV CRM.</em>`;
    target.insertAdjacentElement('afterend', div);
}

// ════════════════════════════════════════════════
// AUTO-REFRESH
// ════════════════════════════════════════════════
function setupAutoRefresh() {
    const mins = OPTS.autoRefreshMin || 0;
    if (mins > 0) {
        setInterval(loadAllData, mins * 60 * 1000);
        console.log(`[Dashboard] Auto-refresh a cada ${mins} minutos`);
    }
}

// ════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    applyBranding();
    const d = LS.get('days', OPTS.defaultDays || 30); setRange(d);
    const activeBtn = document.querySelector(`.pb[data-days="${d}"]`);
    if (activeBtn) { document.querySelectorAll('.pb').forEach(x => x.classList.remove('on')); activeBtn.classList.add('on'); }
    setPlbl('Últimos ' + d + ' dias');
    document.getElementById('configModal').style.display = 'none';
    loadAllData();
    setupAutoRefresh();
});
