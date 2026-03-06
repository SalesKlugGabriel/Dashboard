// ════════════════════════════════════════════════
// CV CRM — Dashboard de Vendas — App Logic v13
// Leads: funil (visitas, simulações, reservas, perdidos)
// Vendas/VGV: calculados a partir de /api/cvio/reserva (dados reais)
// v13: Cache local, Por Gestor, Ranking Gestores, Live CRM fullscreen,
//      Simulações Aprovadas, Trend cores, Modo Impressão
// ════════════════════════════════════════════════

const C = window.CONFIG || {};
const API = C.api || {};
const THEME = C.theme || {};
const BRAND = C.brand || {};
const OPTS = C.options || {};

const LS = {
    get: (k, d) => { try { const v = localStorage.getItem('dash_' + k); return v !== null ? JSON.parse(v) : d } catch { return d } },
    set: (k, v) => { try { localStorage.setItem('dash_' + k, JSON.stringify(v)) } catch { } },
    del: (k) => { try { localStorage.removeItem('dash_' + k) } catch { } }
};

// ─── State ───────────────────────────────────────
let S = {
    leads: [],
    units: [],
    reservas: {},
    simulacoes: [],
    empreendimentos: [],
    estoque: [],
    users: [],
    imobiliarias: [],
    gestores: [],
    ranking: [],
    rankCorretores: [],
    rankImob: [],
    rankEmp: [],
    rankGestores: [],
    ch: {},
    metrics: {},
    period: 'today',
    days: 30,
    dateFrom: null,
    dateTo: null,
    knownSaleIds: new Set(),
    firstLoad: true,
    activeRankTab: 'corretor'
};

// ─── Shared helpers ───────────────────────────────
const isDemo = n => /demonstra[cç]/i.test(n || '');

const GT = THEME.primary || '#E87722';
const GDK = THEME.primaryDark || '#c85e10';
const GOK = THEME.success || '#2ecc71';
const TXS = THEME.textMuted || '#888888';

// Trend chart colors (semantic)
const C_LEADS = '#3b82f6';   // Azul
const C_SIMS  = '#f59e0b';   // Amarelo
const C_RES   = GT;          // Laranja (cor principal)
const C_VEND  = GOK;         // Verde

// ─── Cache ───────────────────────────────────────
const CACHE_KEY = 'cache_v3';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

function saveCache() {
    try {
        LS.set(CACHE_KEY, { ts: Date.now(), leads: S.leads, units: S.units, reservas: S.reservas, simulacoes: S.simulacoes });
    } catch (e) {
        // Quota exceeded — limpa e tenta sem units (dados maiores)
        try { LS.del(CACHE_KEY); } catch {}
    }
}

function loadCache() {
    const c = LS.get(CACHE_KEY, null);
    if (!c || !c.ts || !Array.isArray(c.leads) || !c.leads.length) return null;
    if (Date.now() - c.ts > CACHE_TTL) return null;
    return c;
}

// ════════════════════════════════════════════════
// THEME & BRANDING
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
    if (logoEl && BRAND.logoUrl) logoEl.innerHTML = `<img src="${BRAND.logoUrl}" alt="${BRAND.name}" style="height:36px;object-fit:contain">`;
    document.title = `${BRAND.name || 'Dashboard'} — ${BRAND.title || 'Dashboard de Vendas'}`;
    const cfgEmail = document.getElementById('cfg-email');
    if (cfgEmail) cfgEmail.value = S.email || '';
}

// ════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════
function saveConfig() {
    const em = document.getElementById('cfg-email').value.trim();
    if (!em) { alert('Insira o e-mail.'); return; }
    LS.set('email', em);
    document.getElementById('configModal').style.display = 'none';
    loadAllData(true);
}
function showConfig() { document.getElementById('configModal').style.display = 'flex'; }

// ════════════════════════════════════════════════
// API HELPER
// ════════════════════════════════════════════════
async function apiFetch(path, params = {}) {
    const u = new URL(window.location.origin + path);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
    const r = await fetch(u.toString());
    if (!r.ok) { const b = await r.text().catch(() => ''); throw new Error(`HTTP ${r.status} em ${path}: ${b.substring(0, 200)}`); }
    return r.json();
}

// ════════════════════════════════════════════════
// DATA LOADERS
// ════════════════════════════════════════════════
async function loadLeads() {
    let all = [], offset = 0, page = 1, hasMore = true;
    while (hasMore) {
        setStatus(`Buscando Leads (pág. ${page})...`, `${all.length} registros`, 'load');
        const data = await apiFetch('/api/cvio/lead', { limit: 500, offset });
        const items = data.leads || data.data || (Array.isArray(data) ? data : []);
        if (!items || items.length === 0) { hasMore = false; }
        else {
            all = all.concat(items);
            if (items.length < 500) hasMore = false;
            else { offset += 500; page++; }
        }
    }
    S.leads = all;
    setStatus('Leads carregados', `${S.leads.length} registros`, 'load');
}

async function loadAllUnidades() {
    setStatus('Carregando empreendimentos...', '', 'load');
    const emps = await apiFetch('/api/cvio/empreendimento');
    S.empreendimentos = Array.isArray(emps) ? emps : (emps.data || []);
    const allUnits = [];
    for (const emp of S.empreendimentos) {
        setStatus(`Carregando unidades: ${emp.nome || emp.idempreendimento}...`, '', 'load');
        const detail = await apiFetch('/api/cvio/empreendimento/' + emp.idempreendimento);
        for (const etapa of detail.etapas || []) {
            for (const bloco of etapa.blocos || []) {
                const pag = bloco.paginacao_unidade || {};
                const totalPages = pag.paginas_total || 1;
                let units = bloco.unidades || [];
                for (let page = 2; page <= totalPages; page++) {
                    const d2 = await apiFetch('/api/cvio/empreendimento/' + emp.idempreendimento,
                        { pagina_unidade: page, idbloco: bloco.idbloco });
                    for (const e2 of d2.etapas || []) {
                        for (const b2 of e2.blocos || []) {
                            if (b2.idbloco === bloco.idbloco) units = units.concat(b2.unidades || []);
                        }
                    }
                }
                for (const u of units) {
                    allUnits.push({
                        idunidade: u.idunidade,
                        nome: u.nome,
                        valor: parseValor(u.valor || 0),
                        situacao_para_venda: u.situacao?.situacao_para_venda,
                        idreserva: u.situacao?.vendida,
                        emp_nome: emp.nome,
                        emp_id: emp.idempreendimento,
                        bloco_nome: bloco.nome,
                        etapa_nome: etapa.nome
                    });
                }
            }
        }
    }
    S.units = allUnits;
    setStatus('Unidades carregadas', `${allUnits.length} unidades`, 'load');
}

async function loadAllReservas() {
    const vendidas = S.units.filter(u => u.situacao_para_venda === 3 && u.idreserva);
    const ids = vendidas.map(u => u.idreserva);
    const BATCH = 20;
    const results = {};
    for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        setStatus(`Carregando vendas (${Math.min(i + BATCH, ids.length)}/${ids.length})...`, '', 'load');
        const responses = await Promise.all(batch.map(id =>
            apiFetch('/api/cvio/reserva/' + id).catch(() => null)
        ));
        responses.forEach(r => {
            if (!r) return;
            const id = Object.keys(r)[0];
            if (!id) return;
            const reserva = r[id];
            if (!reserva) return;
            reserva._id = id;
            results[id] = reserva;
        });
    }
    S.reservas = results;
    setStatus('Reservas carregadas', `${Object.keys(results).length} vendas`, 'load');
}

async function loadSimulacoes() {
    try {
        let all = [], offset = 0, hasMore = true;
        while (hasMore) {
            const data = await apiFetch('/api/cvio/simulacao', { limit: 100, offset });
            const items = data.simulacoes || data.data || (Array.isArray(data) ? data : []);
            if (!items || !items.length) { hasMore = false; break; }
            all = all.concat(items);
            if (items.length < 100) hasMore = false;
            else offset += 100;
        }
        S.simulacoes = all;
    } catch {
        S.simulacoes = [];
    }
}

function buildUsers() {
    const um = {};
    S.leads.forEach(l => {
        if (l.gestor && l.gestor.id) um[l.gestor.id] = { id: l.gestor.id, nome: l.gestor.nome };
        if (l.corretor && l.corretor.id) um[l.corretor.id] = { id: l.corretor.id, nome: l.corretor.nome };
    });
    S.users = Object.values(um).filter(u => u.nome && !isDemo(u.nome));

    const imobSet = new Set();
    S.leads.forEach(l => { if (l.imobiliaria?.nome) imobSet.add(l.imobiliaria.nome); });
    Object.values(S.reservas).forEach(r => { if (r?.corretor?.imobiliaria) imobSet.add(r.corretor.imobiliaria); });
    S.imobiliarias = [...imobSet].sort().map(nome => ({ nome }));

    fillSelects();
    fillGestorSelect();
}

function fillSelects() {
    ['f-gerente', 'ind-sel'].forEach(id => {
        const sel = document.getElementById(id); if (!sel) return;
        const prev = sel.value;
        while (sel.options.length > 1) sel.remove(1);
        S.users.forEach(u => {
            const o = document.createElement('option'); o.value = u.id; o.textContent = u.nome; sel.appendChild(o);
        });
        if (prev) sel.value = prev;
    });
    const imobSel = document.getElementById('f-imobiliaria'); if (!imobSel) return;
    const prevI = imobSel.value;
    while (imobSel.options.length > 1) imobSel.remove(1);
    S.imobiliarias.forEach(i => {
        const o = document.createElement('option'); o.value = i.nome; o.textContent = i.nome; imobSel.appendChild(o);
    });
    if (prevI) imobSel.value = prevI;
}

function fillGestorSelect() {
    const sel = document.getElementById('gestor-sel');
    if (!sel) return;
    const prev = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    S.gestores.forEach(g => {
        const o = document.createElement('option');
        o.value = g.id; o.textContent = g.nome; sel.appendChild(o);
    });
    if (prev) sel.value = prev;
}

// ════════════════════════════════════════════════
// DATE HELPERS
// ════════════════════════════════════════════════
function setRangeToday() {
    S.period = 'today';
    const now = new Date();
    S.dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    S.dateTo = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    S.days = 1;
}

function setRangeDays(days) {
    S.period = 'days';
    S.days = days;
    S.dateTo = new Date();
    S.dateFrom = new Date(); S.dateFrom.setDate(S.dateFrom.getDate() - days);
}

function inRange(str) {
    if (!str) return false;
    try {
        const d = new Date(str.replace(' ', 'T').replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'));
        return (!S.dateFrom || d >= S.dateFrom) && (!S.dateTo || d <= S.dateTo);
    } catch { return false; }
}

function isToday(str) {
    if (!str) return false;
    try {
        const d = new Date(str.replace(' ', 'T').replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'));
        const now = new Date();
        return d.getFullYear() === now.getFullYear() &&
               d.getMonth() === now.getMonth() &&
               d.getDate() === now.getDate();
    } catch { return false; }
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
        document.getElementById('alast').textContent = 'Atualizado: ' +
            n.toLocaleDateString('pt-BR') + ' às ' + n.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
}

// ════════════════════════════════════════════════
// MAIN LOADER (com cache)
// ════════════════════════════════════════════════
async function loadAllData(force = false) {
    document.getElementById('rank-load').style.display = 'flex';
    document.getElementById('rank-tbody').innerHTML = '';
    document.getElementById('rank-mob').innerHTML = '';
    setStatus('Conectando ao CV CRM...', '', 'load');
    document.querySelectorAll('.err-box,.cors-notice').forEach(e => e.remove());

    // ── Tenta usar cache (se não forçado e cache válido)
    if (!force) {
        const cached = loadCache();
        if (cached) {
            S.leads = cached.leads || [];
            S.units = cached.units || [];
            S.reservas = cached.reservas || {};
            S.simulacoes = cached.simulacoes || [];
            const age = Math.round((Date.now() - cached.ts) / 60000);
            setStatus(`Usando cache (${age}min atrás)`, `${S.leads.length} leads`, 'load');
            buildUsers();
            processAll();
            S.firstLoad = false;
            setStatus(`Dados do cache — CV CRM (${age}min)`,
                `${S.leads.length} leads · ${S.metrics.vendas || 0} vendas · VGV ${fVgvFmt(S.metrics.vgv || 0)}`, 'ok');
            return;
        }
    }

    // ── Busca completa da API
    try {
        await loadLeads();
        await loadAllUnidades();
        await loadAllReservas();
        await loadSimulacoes();
        saveCache();
        buildUsers();
        setStatus('Processando dados...', '', 'load');
        processAll();
        S.firstLoad = false;
        setStatus('Dados atualizados — CV CRM',
            `${S.leads.length} leads · ${S.metrics.vendas || 0} vendas · VGV ${fVgvFmt(S.metrics.vgv || 0)}`, 'ok');
    } catch (err) {
        console.error('[Dashboard]', err);
        setStatus('Erro na conexão', err.message.substring(0, 80), 'err');
        showErr(err, err.message.includes('Failed to fetch'));
    }
}

// ════════════════════════════════════════════════
// VALUE PARSERS
// ════════════════════════════════════════════════
function parseValor(v) {
    if (!v) return 0;
    const s = String(v).trim();
    if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    return parseFloat(s.replace(/[R$\s]/g, '')) || 0;
}

function getEmpNome(l) {
    if (l.empreendimento && Array.isArray(l.empreendimento) && l.empreendimento.length)
        return l.empreendimento[0].nome || null;
    if (typeof l.empreendimento === 'string' && l.empreendimento) return l.empreendimento;
    return null;
}

// ════════════════════════════════════════════════
// PROCESS ALL METRICS
// ════════════════════════════════════════════════
function processAll() {
    const imobFilter = (document.getElementById('f-imobiliaria') || {}).value || '';
    const isBanned = l => isDemo(l.corretor?.nome) || isDemo(l.gestor?.nome);

    // ── Leads pipeline
    const fLeads = S.leads.filter(l => !isBanned(l) && inRange(l.data_cad) &&
        (!imobFilter || l.imobiliaria?.nome === imobFilter));

    const fVis = fLeads.filter(l => [8, 9].includes(l.situacao?.id));
    const fSim = fLeads.filter(l => l.situacao?.id === 10 || l.qtde_simulacoes_associadas > 0);
    const fRes = fLeads.filter(l => l.qtde_reservas_associadas > 0);
    const fPerdidos = fLeads.filter(l => l.situacao?.id === 3);

    // ── Vendas e VGV (fonte: S.reservas)
    const fVendas = Object.values(S.reservas).filter(r => {
        if (!r || r.situacao?.idsituacao !== 3) return false;
        if (imobFilter && r.corretor?.imobiliaria !== imobFilter) return false;
        const dt = r.data_venda || r.data;
        return inRange(dt);
    });

    const vgv = fVendas.reduce((s, r) => s + parseValor(r.condicoes?.valor_contrato || 0), 0);
    const ticketMedio = fVendas.length > 0 ? vgv / fVendas.length : 0;

    // ── Simulações Aprovadas
    const simsAprovadas = S.simulacoes.filter(s =>
        /aprovad/i.test(s.situacao?.nome || s.situacao || s.status || '') &&
        inRange(s.data_cad || s.created_at || '')
    ).length;

    // ── Corretores ativos
    const corrSet = new Set([
        ...fLeads.map(l => l.corretor?.id || l.gestor?.id),
        ...fVendas.map(r => r.corretor?.idcorretor_cv)
    ].filter(Boolean));

    const taxa = fLeads.length > 0 ? ((fVendas.length / fLeads.length) * 100).toFixed(1) : '0.0';

    S.metrics = {
        leads: fLeads.length, visitas: fVis.length, sims: fSim.length,
        reservas: fRes.length, vendas: fVendas.length, vgv, taxa: parseFloat(taxa),
        ticketMedio, corretores: corrSet.size, perdidos: fPerdidos.length,
        simsAprovadas
    };

    // ── Update metric tiles
    st('m-leads', fN(fLeads.length));
    st('m-visitas', fN(fVis.length));
    st('m-sim', fN(fSim.length));
    st('m-sims-aprov', fN(simsAprovadas));
    st('m-res', fN(fRes.length));
    st('m-vend', fN(fVendas.length));
    st('m-taxa', taxa + '%');
    st('m-vgv', fVgvFmt(vgv));
    st('m-tkt', fVgvFmt(ticketMedio));
    st('m-corr', String(corrSet.size));

    // ── S.ranking (lead-based, para aba Individual)
    const byC = {};
    const isBannedNome = nome => isDemo(nome);
    const addToRanking = (leads, tipo) => leads.forEach(l => {
        const id = l.corretor?.id || l.gestor?.id || '__sem__';
        const nome = l.corretor?.nome || l.gestor?.nome || 'Não atribuído';
        if (isBannedNome(nome)) return;
        if (!byC[id]) byC[id] = { id, nome, l: 0, vis: 0, s: 0, r: 0, v: 0, vgv: 0 };
        byC[id][tipo]++;
        if (tipo === 'v') byC[id].vgv += parseValor(l.valor_venda) || parseValor(l.valor_negocio);
    });
    const fVendasLeads = S.leads.filter(l => {
        if (isBanned(l)) return false;
        if (imobFilter && l.imobiliaria?.nome !== imobFilter) return false;
        const isVenda = l.situacao?.id === 6 || (l.data_venda && parseValor(l.valor_venda) > 0);
        if (!isVenda) return false;
        return inRange(l.data_venda || l.data_cad);
    });
    addToRanking(fLeads, 'l');
    addToRanking(fVis, 'vis');
    addToRanking(fSim, 's');
    addToRanking(fRes, 'r');
    addToRanking(fVendasLeads, 'v');
    S.ranking = Object.values(byC)
        .filter(c => c.nome !== 'Não atribuído' && (c.l > 0 || c.v > 0))
        .sort((a, b) => b.vgv - a.vgv || b.v - a.v || b.r - a.r || b.l - a.l);

    // ── Rankings (reserva-based: corretores, imobiliárias, empreendimentos)
    const corretorMap = {}, imobMap = {}, empMap = {};
    fVendas.forEach(r => {
        const cKey = r.corretor?.idcorretor_cv || 'sem-corretor';
        if (!corretorMap[cKey]) corretorMap[cKey] = {
            nome: r.corretor?.corretor || 'Sem Corretor',
            imobiliaria: r.corretor?.imobiliaria || '—',
            vendas: 0, vgv: 0
        };
        corretorMap[cKey].vendas++;
        corretorMap[cKey].vgv += parseValor(r.condicoes?.valor_contrato || 0);

        const iKey = r.corretor?.idimobiliaria_cv || 'sem-imob';
        if (!imobMap[iKey]) imobMap[iKey] = { nome: r.corretor?.imobiliaria || 'Sem Imobiliária', vendas: 0, vgv: 0 };
        imobMap[iKey].vendas++;
        imobMap[iKey].vgv += parseValor(r.condicoes?.valor_contrato || 0);

        const eKey = r.unidade?.idempreendimento_cv || r.unidade?.empreendimento || 'sem-emp';
        if (!empMap[eKey]) empMap[eKey] = { nome: r.unidade?.empreendimento || '—', vendas: 0, vgv: 0 };
        empMap[eKey].vendas++;
        empMap[eKey].vgv += parseValor(r.condicoes?.valor_contrato || 0);
    });
    S.rankCorretores = Object.values(corretorMap).sort((a, b) => b.vgv - a.vgv || b.vendas - a.vendas);
    S.rankImob = Object.values(imobMap).sort((a, b) => b.vgv - a.vgv || b.vendas - a.vendas);
    S.rankEmp = Object.values(empMap).sort((a, b) => b.vgv - a.vgv || b.vendas - a.vendas);

    // ── Ranking Gestores (lead-based + vendas via corretor→gestor map)
    const gestorMap = {};
    fLeads.forEach(l => {
        const gid = l.gestor?.id;
        const gnome = l.gestor?.nome;
        if (!gid || !gnome || isDemo(gnome)) return;
        if (!gestorMap[gid]) gestorMap[gid] = { id: gid, nome: gnome, l: 0, vis: 0, s: 0, r: 0, v: 0, vgv: 0, corretorIds: new Set() };
        gestorMap[gid].l++;
        if ([8, 9].includes(l.situacao?.id)) gestorMap[gid].vis++;
        if (l.situacao?.id === 10 || l.qtde_simulacoes_associadas > 0) gestorMap[gid].s++;
        if (l.qtde_reservas_associadas > 0) gestorMap[gid].r++;
        if (l.corretor?.id) gestorMap[gid].corretorIds.add(String(l.corretor.id));
    });
    // Mapeia corretor → gestor para atribuir vendas (de reservas reais) ao gestor
    const corrToGestor = {};
    S.leads.forEach(l => {
        if (l.corretor?.id && l.gestor?.id) corrToGestor[String(l.corretor.id)] = String(l.gestor.id);
    });
    fVendas.forEach(r => {
        const cid = String(r.corretor?.idcorretor_cv || '');
        const gid = corrToGestor[cid];
        if (!gid || !gestorMap[gid]) return;
        gestorMap[gid].v++;
        gestorMap[gid].vgv += parseValor(r.condicoes?.valor_contrato || 0);
    });
    S.rankGestores = Object.values(gestorMap).map(g => ({
        id: g.id, nome: g.nome,
        l: g.l, vis: g.vis, s: g.s, r: g.r, v: g.v, vgv: g.vgv,
        corretores: g.corretorIds.size,
        corretorIds: [...g.corretorIds]
    })).sort((a, b) => b.vgv - a.vgv || b.v - a.v || b.l - a.l);
    S.gestores = S.rankGestores.map(g => ({ id: g.id, nome: g.nome }));
    fillGestorSelect();

    renderActiveRanking();
    renderFunil(fLeads.length, fVis.length, fSim.length, fRes.length, fVendas.length);
    renderTrend(fLeads, fSim, fRes, fVendas);
    renderEmp(fLeads);
    renderOri(fLeads);
    renderLoss(fPerdidos);
    renderStock(fVendas);

    updateLiveCRMValues();
    checkNewSales(fVendas);
}

// ════════════════════════════════════════════════
// RANKING TABS
// ════════════════════════════════════════════════
function switchRankTab(tab) {
    S.activeRankTab = tab;
    document.querySelectorAll('.rkbtn').forEach(b => b.classList.toggle('on', b.dataset.rk === tab));
    renderActiveRanking();
}

function renderActiveRanking() {
    document.getElementById('rank-load').style.display = 'none';
    if (S.activeRankTab === 'corretor') renderRankingCorretores(S.rankCorretores);
    else if (S.activeRankTab === 'imob') renderRankingImobiliarias(S.rankImob);
    else if (S.activeRankTab === 'gestor') renderRankingGestores(S.rankGestores);
    else renderRankingEmpreendimentos(S.rankEmp);
}

function renderRankingCorretores(data) {
    const medals = ['🥇', '🥈', '🥉'];
    const thead = document.getElementById('rank-thead');
    if (thead) thead.innerHTML = '<tr><th>#</th><th>Corretor</th><th>Imobiliária</th><th>Vendas</th><th>VGV</th></tr>';
    const tb = document.getElementById('rank-tbody');
    const mb = document.getElementById('rank-mob');
    tb.innerHTML = ''; mb.innerHTML = '';
    if (!data || !data.length) {
        tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--txm);padding:2rem">Nenhum dado para o período.</td></tr>';
        return;
    }
    data.forEach((c, i) => {
        const rk = i + 1;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong style="color:var(--gt)">${medals[i] || rk + 'º'}</strong></td>
      <td><strong>${esc(c.nome)}</strong></td>
      <td style="color:var(--txm)">${esc(c.imobiliaria)}</td>
      <td>${c.vendas}</td>
      <td><strong style="color:var(--gt)">${fVgvFmt(c.vgv)}</strong></td>`;
        tb.appendChild(tr);
        const cd = document.createElement('div');
        cd.className = `rc${rk <= 3 ? ' r' + rk : ''}`;
        cd.innerHTML = `<div class="rc-h"><span class="rc-name">${esc(c.nome)}</span><span class="rc-bdg">${medals[i] || rk + 'º'}</span></div>
      <div class="rc-s">
        <div><div class="rsl">Imobiliária</div><div class="rsv" style="font-size:.78rem">${esc(c.imobiliaria)}</div></div>
        <div><div class="rsl">Vendas</div><div class="rsv">${c.vendas}</div></div>
        <div><div class="rsl">VGV</div><div class="rsv">${fVgvFmt(c.vgv)}</div></div>
      </div>`;
        mb.appendChild(cd);
    });
}

function renderRankingImobiliarias(data) {
    const medals = ['🥇', '🥈', '🥉'];
    const thead = document.getElementById('rank-thead');
    if (thead) thead.innerHTML = '<tr><th>#</th><th>Imobiliária</th><th>Vendas</th><th>VGV</th></tr>';
    const tb = document.getElementById('rank-tbody');
    const mb = document.getElementById('rank-mob');
    tb.innerHTML = ''; mb.innerHTML = '';
    if (!data || !data.length) {
        tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--txm);padding:2rem">Nenhum dado para o período.</td></tr>';
        return;
    }
    data.forEach((c, i) => {
        const rk = i + 1;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong style="color:var(--gt)">${medals[i] || rk + 'º'}</strong></td>
      <td><strong>${esc(c.nome)}</strong></td>
      <td>${c.vendas}</td>
      <td><strong style="color:var(--gt)">${fVgvFmt(c.vgv)}</strong></td>`;
        tb.appendChild(tr);
        const cd = document.createElement('div');
        cd.className = `rc${rk <= 3 ? ' r' + rk : ''}`;
        cd.innerHTML = `<div class="rc-h"><span class="rc-name">${esc(c.nome)}</span><span class="rc-bdg">${medals[i] || rk + 'º'}</span></div>
      <div class="rc-s">
        <div><div class="rsl">Vendas</div><div class="rsv">${c.vendas}</div></div>
        <div><div class="rsl">VGV</div><div class="rsv">${fVgvFmt(c.vgv)}</div></div>
      </div>`;
        mb.appendChild(cd);
    });
}

function renderRankingEmpreendimentos(data) {
    const medals = ['🥇', '🥈', '🥉'];
    const thead = document.getElementById('rank-thead');
    if (thead) thead.innerHTML = '<tr><th>#</th><th>Empreendimento</th><th>Vendas</th><th>VGV</th></tr>';
    const tb = document.getElementById('rank-tbody');
    const mb = document.getElementById('rank-mob');
    tb.innerHTML = ''; mb.innerHTML = '';
    if (!data || !data.length) {
        tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--txm);padding:2rem">Nenhum dado para o período.</td></tr>';
        return;
    }
    data.forEach((c, i) => {
        const rk = i + 1;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong style="color:var(--gt)">${medals[i] || rk + 'º'}</strong></td>
      <td><strong>${esc(c.nome)}</strong></td>
      <td>${c.vendas}</td>
      <td><strong style="color:var(--gt)">${fVgvFmt(c.vgv)}</strong></td>`;
        tb.appendChild(tr);
        const cd = document.createElement('div');
        cd.className = `rc${rk <= 3 ? ' r' + rk : ''}`;
        cd.innerHTML = `<div class="rc-h"><span class="rc-name">${esc(c.nome)}</span><span class="rc-bdg">${medals[i] || rk + 'º'}</span></div>
      <div class="rc-s">
        <div><div class="rsl">Vendas</div><div class="rsv">${c.vendas}</div></div>
        <div><div class="rsl">VGV</div><div class="rsv">${fVgvFmt(c.vgv)}</div></div>
      </div>`;
        mb.appendChild(cd);
    });
}

function renderRankingGestores(data) {
    const medals = ['🥇', '🥈', '🥉'];
    const thead = document.getElementById('rank-thead');
    if (thead) thead.innerHTML = '<tr><th>#</th><th>Gestor</th><th>Corretores</th><th>Leads</th><th>Vendas</th><th>VGV</th></tr>';
    const tb = document.getElementById('rank-tbody');
    const mb = document.getElementById('rank-mob');
    tb.innerHTML = ''; mb.innerHTML = '';
    if (!data || !data.length) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--txm);padding:2rem">Nenhum dado para o período.</td></tr>';
        return;
    }
    data.forEach((g, i) => {
        const rk = i + 1;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td><strong style="color:var(--gt)">${medals[i] || rk + 'º'}</strong></td>
      <td><strong>${esc(g.nome)}</strong></td>
      <td style="color:var(--txm)">${g.corretores}</td>
      <td>${g.l}</td>
      <td>${g.v}</td>
      <td><strong style="color:var(--gt)">${fVgvFmt(g.vgv)}</strong></td>`;
        tb.appendChild(tr);
        const cd = document.createElement('div');
        cd.className = `rc${rk <= 3 ? ' r' + rk : ''}`;
        cd.innerHTML = `<div class="rc-h"><span class="rc-name">${esc(g.nome)}</span><span class="rc-bdg">${medals[i] || rk + 'º'}</span></div>
      <div class="rc-s">
        <div><div class="rsl">Corretores</div><div class="rsv">${g.corretores}</div></div>
        <div><div class="rsl">Leads</div><div class="rsv">${g.l}</div></div>
        <div><div class="rsl">Vendas</div><div class="rsv">${g.v}</div></div>
        <div><div class="rsl">VGV</div><div class="rsv">${fVgvFmt(g.vgv)}</div></div>
      </div>`;
        mb.appendChild(cd);
    });
}

// ════════════════════════════════════════════════
// CHARTS
// ════════════════════════════════════════════════
Chart.defaults.color = TXS;
Chart.defaults.borderColor = THEME.surface2 || '#2a2a2a';

function hexToRgba(hex, a) {
    const h = hex.replace('#', '');
    return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`;
}

function renderFunil(l, vis, s, r, v) {
    if (S.ch.funil) S.ch.funil.destroy();
    S.ch.funil = new Chart(document.getElementById('c-funil'), {
        type: 'bar',
        data: {
            labels: ['Leads', 'Visitas', 'Simulações', 'Reservas', 'Vendas'],
            datasets: [{
                label: 'Quantidade', data: [l, vis, s, r, v],
                backgroundColor: [
                    hexToRgba(C_LEADS, .85), hexToRgba(GT, .8),
                    hexToRgba(C_SIMS, .85), hexToRgba(C_RES, .8), hexToRgba(C_VEND, .85)
                ],
                borderRadius: 4
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { color: THEME.surface2||'#2a2a2a' } }, x: { grid: { display: false } } }
        }
    });
}

function renderTrend(leads, sims, reservas, fVendas) {
    if (S.ch.trend) S.ch.trend.destroy();
    const W = {};
    const d1 = S.dateFrom || new Date();
    const d2 = S.dateTo || new Date();
    const span = Math.ceil(Math.abs(d2 - d1) / (86400000));
    const fmtDay = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
    const fmtWk = d => { const j = new Date(d.getFullYear(),0,1); return 'Sem ' + (Math.floor(((d-j)/86400000)/7)+1); };
    const fmtMo = d => ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][d.getMonth()] + '/' + d.getFullYear();
    const bucket = d => span <= 7 ? fmtDay(d) : span <= 45 ? fmtWk(d) : fmtMo(d);
    const sortKey = d => span <= 7 ? d.getTime() : span <= 45 ? d.getFullYear()*100+Math.floor(((d-new Date(d.getFullYear(),0,1))/86400000)/7) : d.getFullYear()*100+d.getMonth();
    const add = (arr, k, dateField) => arr.forEach(x => {
        const str = dateField ? x[dateField] : x.data_cad;
        if (!str) return;
        const d = new Date(str.replace(' ','T'));
        const bk = bucket(d);
        if (!W[bk]) W[bk] = { l:0, s:0, r:0, v:0, o: sortKey(d) };
        W[bk][k]++;
    });
    add(leads, 'l');
    add(sims, 's');
    add(reservas, 'r');
    add(fVendas, 'v', 'data_venda');
    const sorted = Object.keys(W).sort((a,b) => W[a].o - W[b].o);
    S.ch.trend = new Chart(document.getElementById('c-trend'), {
        type: 'line',
        data: {
            labels: sorted,
            datasets: [
                { label:'Leads',      data: sorted.map(w=>W[w].l||0), borderColor:C_LEADS, backgroundColor:hexToRgba(C_LEADS,.12), tension:.4, fill:true, pointBackgroundColor:C_LEADS },
                { label:'Simulações', data: sorted.map(w=>W[w].s||0), borderColor:C_SIMS,  backgroundColor:hexToRgba(C_SIMS,.10),  tension:.4, fill:true, pointBackgroundColor:C_SIMS  },
                { label:'Reservas',   data: sorted.map(w=>W[w].r||0), borderColor:C_RES,   backgroundColor:hexToRgba(C_RES,.10),   tension:.4, fill:true, pointBackgroundColor:C_RES   },
                { label:'Vendas',     data: sorted.map(w=>W[w].v||0), borderColor:C_VEND,  backgroundColor:hexToRgba(C_VEND,.10),  tension:.4, fill:true, pointBackgroundColor:C_VEND  }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position:'bottom', labels:{ color:TXS, padding:16, usePointStyle:true } } },
            scales: { y:{ beginAtZero:true, grid:{ color:THEME.surface2||'#2a2a2a' } }, x:{ grid:{ display:false } } }
        }
    });
}

function renderEmp(leads) {
    if (S.ch.emp) S.ch.emp.destroy();
    const m = {};
    leads.forEach(l => {
        const nome = getEmpNome(l) || 'Não informado';
        m[nome] = (m[nome]||0) + 1;
    });
    const pairs = Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,8);
    if (!pairs.length) pairs.push(['Sem dados', 1]);
    S.ch.emp = new Chart(document.getElementById('c-emp'), {
        type: 'doughnut',
        data: {
            labels: pairs.map(([l,v]) => `${l} (${v})`),
            datasets: [{ data: pairs.map(([,v])=>v), backgroundColor:[GDK,GT,hexToRgba(GT,.7),hexToRgba(GT,.5),GOK,hexToRgba(GOK,.7),'#f59e0b','#555'], borderWidth:2, borderColor:THEME.surface1||'#1e1e1e' }]
        },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{ color:TXS, boxWidth:12, padding:12 } } } }
    });
}

function renderOri(leads) {
    if (S.ch.ori) S.ch.ori.destroy();
    const m = {};
    leads.forEach(l => {
        const o = l.midia_principal || (l.midias && l.midias[0]) || l.origem || 'Não informado';
        m[o] = (m[o]||0) + 1;
    });
    const pairs = Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,8);
    if (!pairs.length) pairs.push(['Sem dados', 1]);
    S.ch.ori = new Chart(document.getElementById('c-ori'), {
        type: 'bar',
        data: { labels: pairs.map(([l])=>l), datasets:[{ label:'Leads', data:pairs.map(([,v])=>v), backgroundColor:hexToRgba(GT,.75), borderRadius:4 }] },
        options: {
            responsive:true, maintainAspectRatio:false, indexAxis:'y',
            plugins:{ legend:{ display:false } },
            scales:{ x:{ beginAtZero:true, grid:{ color:THEME.surface2||'#2a2a2a' } }, y:{ grid:{ display:false } } }
        }
    });
}

function renderLoss(perdidos) {
    if (S.ch.loss) S.ch.loss.destroy();
    const m = {};
    perdidos.forEach(l => {
        const r = l.motivo_inatividade || l.motivo_perda || l.motivo || 'Motivo não informado';
        m[r] = (m[r]||0) + 1;
    });
    const pairs = Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,8);
    if (!pairs.length) pairs.push(['Sem perdas no período', 1]);
    S.ch.loss = new Chart(document.getElementById('c-loss'), {
        type: 'doughnut',
        data: {
            labels: pairs.map(([l])=>l),
            datasets:[{ data:pairs.map(([,v])=>v), backgroundColor:['#e74c3c','#c0392b','#d35400','#e67e22','#7f8c8d','#95a5a6','#555','#333'], borderWidth:2, borderColor:THEME.surface1||'#1e1e1e' }]
        },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{ color:TXS, boxWidth:12, padding:12 } } } }
    });
}

function renderStock(fVendas) {
    if (S.ch.stock) S.ch.stock.destroy();
    const m = {};
    fVendas.forEach(r => {
        const nome = r.unidade?.empreendimento || 'Desconhecido';
        if (!m[nome]) m[nome] = { vendidos: 0, vgv: 0 };
        m[nome].vendidos++;
        m[nome].vgv += parseValor(r.condicoes?.valor_contrato || 0);
    });
    const pairs = Object.entries(m).sort((a,b)=>b[1].vgv-a[1].vgv).slice(0,10);
    if (!pairs.length) return;
    S.ch.stock = new Chart(document.getElementById('c-stock'), {
        type: 'bar',
        data: {
            labels: pairs.map(([nome,d]) => `${nome} (${d.vendidos})`),
            datasets:[{ label:'VGV', data:pairs.map(([,d])=>d.vgv), backgroundColor:hexToRgba(GOK,.85), borderRadius:6 }]
        },
        options: {
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:ctx => fVgvFmt(ctx.parsed.y) } } },
            scales:{ x:{ grid:{ display:false } }, y:{ beginAtZero:true, grid:{ color:THEME.surface2||'#2a2a2a' }, ticks:{ callback:v=>fVgvFmt(v) } } }
        }
    });
}

// ════════════════════════════════════════════════
// INDIVIDUAL — Por Corretor
// ════════════════════════════════════════════════
function loadInd(id) {
    if (!id) { document.getElementById('ind-c').style.display='none'; document.getElementById('ind-empty').style.display='flex'; return; }
    const c = S.ranking.find(x => String(x.id) === String(id));
    const u = S.users.find(x => String(x.id) === String(id));
    const nome = u?.nome || c?.nome || 'Corretor';
    document.getElementById('ind-c').style.display = 'block';
    document.getElementById('ind-empty').style.display = 'none';
    document.getElementById('ind-nome').textContent = nome;
    document.getElementById('ind-per').textContent = `Performance — ${getPeriodLabel()}`;
    if (!c) {
        ['i-l','i-vis','i-s','i-r','i-v'].forEach(k=>st(k,'0'));
        st('i-tx','0%'); st('i-vgv','R$ 0'); st('i-tkt','R$ 0'); st('i-rnk','—'); return;
    }
    st('i-l',String(c.l)); st('i-vis',String(c.vis||0)); st('i-s',String(c.s)); st('i-r',String(c.r)); st('i-v',String(c.v));
    st('i-tx', c.l>0 ? ((c.v/c.l)*100).toFixed(1)+'%' : '0%');
    st('i-vgv', fVgvFmt(c.vgv));
    st('i-tkt', fVgvFmt(c.v>0 ? Math.round(c.vgv/c.v) : 0));
    st('i-rnk', (S.ranking.indexOf(c)+1) + 'º');
    renderIndCharts(c);
}

function renderIndCharts(c) {
    if (S.ch.if) S.ch.if.destroy();
    if (S.ch.ir) S.ch.ir.destroy();
    S.ch.if = new Chart(document.getElementById('i-funil'), {
        type:'bar',
        data:{
            labels:['Leads','Visitas','Simulações','Reservas','Vendas'],
            datasets:[{ data:[c.l,c.vis||0,c.s,c.r,c.v], backgroundColor:[hexToRgba(C_LEADS,.85),hexToRgba(GT,.8),hexToRgba(C_SIMS,.85),hexToRgba(C_RES,.8),hexToRgba(C_VEND,.85)], borderRadius:4 }]
        },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, grid:{ color:THEME.surface2||'#2a2a2a' } }, x:{ grid:{ display:false } } } }
    });
    if (S.ranking.length > 1) {
        const avg = f => +(S.ranking.reduce((s,x)=>s+(x[f]||0),0)/S.ranking.length).toFixed(1);
        const avgL=avg('l'), avgV=avg('v'), avgVgv=avg('vgv');
        const scale = Math.max(c.vgv,avgVgv)>0 ? Math.max(c.l,c.r,c.v,avgL,avgV,1)/Math.max(c.vgv,avgVgv,1) : 0;
        S.ch.ir = new Chart(document.getElementById('i-radar'), {
            type:'radar',
            data:{
                labels:['Leads','Simulações','Reservas','Vendas',`VGV (${fVgvFmt(c.vgv)})`],
                datasets:[
                    { label:c.nome, data:[c.l,c.s,c.r,c.v,+(c.vgv*scale).toFixed(1)], borderColor:GT, backgroundColor:hexToRgba(GT,.15), pointBackgroundColor:GT },
                    { label:'Média Equipe', data:[avgL,avg('s'),avg('r'),avgV,+(avgVgv*scale).toFixed(1)], borderColor:GDK, backgroundColor:hexToRgba(GDK,.08), pointBackgroundColor:GDK }
                ]
            },
            options:{
                responsive:true, maintainAspectRatio:false,
                scales:{ r:{ beginAtZero:true, grid:{ color:THEME.surface2||'#2a2a2a' }, angleLines:{ color:THEME.surface2||'#2a2a2a' }, pointLabels:{ color:TXS, font:{ size:11, weight:'700' } }, ticks:{ color:TXS, backdropColor:'transparent' } } },
                plugins:{ legend:{ position:'bottom', labels:{ color:TXS, padding:16, usePointStyle:true } } }
            }
        });
    }
}

// ════════════════════════════════════════════════
// POR GESTOR
// ════════════════════════════════════════════════
function loadGestor(gid) {
    const empty = document.getElementById('gestor-empty');
    const content = document.getElementById('gestor-c');
    if (!gid) { content.style.display='none'; empty.style.display='flex'; return; }
    const g = S.rankGestores.find(x => String(x.id) === String(gid));
    content.style.display = 'block';
    empty.style.display = 'none';
    document.getElementById('gestor-nome').textContent = g ? g.nome : 'Gestor';
    document.getElementById('gestor-per').textContent = `Performance da Equipe — ${getPeriodLabel()}`;
    if (!g) {
        ['g-l','g-vis','g-s','g-r','g-v'].forEach(k => st(k, '0'));
        st('g-tx','0%'); st('g-vgv','R$ 0'); st('g-tkt','R$ 0'); st('g-corr','0'); return;
    }
    st('g-l', String(g.l)); st('g-vis', String(g.vis||0)); st('g-s', String(g.s)); st('g-r', String(g.r)); st('g-v', String(g.v));
    st('g-tx', g.l > 0 ? ((g.v/g.l)*100).toFixed(1)+'%' : '0%');
    st('g-vgv', fVgvFmt(g.vgv));
    st('g-tkt', fVgvFmt(g.v > 0 ? Math.round(g.vgv/g.v) : 0));
    st('g-corr', String(g.corretores));
    renderGestorCharts(g);
}

function renderGestorCharts(g) {
    if (S.ch.gf) S.ch.gf.destroy();
    if (S.ch.gr) S.ch.gr.destroy();
    S.ch.gf = new Chart(document.getElementById('g-funil'), {
        type: 'bar',
        data: {
            labels: ['Leads','Visitas','Simulações','Reservas','Vendas'],
            datasets: [{ data:[g.l,g.vis||0,g.s,g.r,g.v], backgroundColor:[hexToRgba(C_LEADS,.85),hexToRgba(GT,.8),hexToRgba(C_SIMS,.85),hexToRgba(C_RES,.8),hexToRgba(C_VEND,.85)], borderRadius:4 }]
        },
        options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, grid:{ color:THEME.surface2||'#2a2a2a' } }, x:{ grid:{ display:false } } } }
    });
    // Top corretores da equipe deste gestor
    const corretorIds = g.corretorIds || [];
    const teamCorr = S.ranking
        .filter(c => corretorIds.includes(String(c.id)))
        .slice(0, 8);
    if (teamCorr.length > 0) {
        S.ch.gr = new Chart(document.getElementById('g-rank'), {
            type: 'bar',
            data: {
                labels: teamCorr.map(c => c.nome),
                datasets: [
                    { label:'Vendas', data:teamCorr.map(c=>c.v), backgroundColor:hexToRgba(C_VEND,.8), borderRadius:4 },
                    { label:'Leads',  data:teamCorr.map(c=>c.l), backgroundColor:hexToRgba(C_LEADS,.6), borderRadius:4 }
                ]
            },
            options: {
                responsive:true, maintainAspectRatio:false, indexAxis:'y',
                plugins:{ legend:{ position:'bottom', labels:{ color:TXS, padding:12, usePointStyle:true } } },
                scales:{ x:{ beginAtZero:true, grid:{ color:THEME.surface2||'#2a2a2a' } }, y:{ grid:{ display:false } } }
            }
        });
    }
}

// ════════════════════════════════════════════════
// ⚡ LIVE CRM — Carrossel Fullscreen
// ════════════════════════════════════════════════
const LIVE_INDICATORS = [
    { key:'leads',         emoji:'📊', label:'LEADS',               sub:'Atendimentos no período',        fmt: v=>fN(v) },
    { key:'visitas',       emoji:'🏃', label:'VISITAS AO ESTANDE',   sub:'Visitas realizadas',              fmt: v=>fN(v) },
    { key:'sims',          emoji:'🧮', label:'SIMULAÇÕES',           sub:'Simulações realizadas',            fmt: v=>fN(v) },
    { key:'simsAprovadas', emoji:'✔️', label:'SIMULAÇÕES APROVADAS', sub:'Simulações com status aprovado',  fmt: v=>fN(v) },
    { key:'reservas',      emoji:'📋', label:'RESERVAS',             sub:'Unidades reservadas',             fmt: v=>fN(v) },
    { key:'vendas',        emoji:'✅', label:'VENDAS',               sub:'Vendas confirmadas',              fmt: v=>fN(v) },
    { key:'vgv',           emoji:'💰', label:'VGV TOTAL',            sub:'Volume Geral de Vendas',         fmt: v=>fVgvFmt(v) },
    { key:'taxa',          emoji:'📈', label:'TAXA DE CONVERSÃO',   sub:'Vendas / Leads × 100',            fmt: v=>v.toFixed(1)+'%' },
    { key:'ticketMedio',   emoji:'🎯', label:'TICKET MÉDIO',         sub:'Valor médio por venda',           fmt: v=>fVgvFmt(v) },
    { key:'corretores',    emoji:'👥', label:'CORRETORES ATIVOS',    sub:'No período selecionado',          fmt: v=>fN(v) },
    { key:'perdidos',      emoji:'❌', label:'LEADS PERDIDOS',       sub:'Leads com status Perdido',        fmt: v=>fN(v) },
];

let liveIdx = 0;
let liveSecs = OPTS.liveCrmSecs || 5;
let liveTmr = null;
let liveTabActive = false;

function initLiveDots() {
    const container = document.getElementById('live-dots');
    container.innerHTML = LIVE_INDICATORS.map((_, i) =>
        `<div class="live-dot${i===liveIdx?' on':''}" onclick="liveGoTo(${i})"></div>`
    ).join('');
}

function updateLiveCRMValues() {
    if (!liveTabActive) return;
    renderLiveSlide(liveIdx, false);
}

function renderLiveSlide(idx, animate = true) {
    const ind = LIVE_INDICATORS[idx];
    const val = S.metrics[ind.key] !== undefined ? ind.fmt(S.metrics[ind.key]) : '—';
    if (animate) {
        const card = document.getElementById('live-card');
        card.classList.remove('anim');
        void card.offsetWidth;
        card.classList.add('anim');
    }
    st('live-emoji', ind.emoji);
    st('live-label', ind.label);
    st('live-value', val);
    st('live-sub', ind.sub);
    document.querySelectorAll('.live-dot').forEach((d, i) => d.classList.toggle('on', i === idx));
    const fill = document.getElementById('live-fill');
    if (fill) { fill.style.transition='none'; fill.style.width='0%'; }
}

function liveGoTo(idx) {
    liveIdx = ((idx % LIVE_INDICATORS.length) + LIVE_INDICATORS.length) % LIVE_INDICATORS.length;
    renderLiveSlide(liveIdx);
    if (liveTabActive) restartLiveTimer();
}

function liveNav(dir) {
    liveGoTo(liveIdx + dir);
}

function startLiveTimer() {
    clearInterval(liveTmr);
    let elapsed = 0;
    const total = liveSecs * 1000;
    const fill = document.getElementById('live-fill');
    if (fill) { fill.style.transition='none'; fill.style.width='0%'; }
    liveTmr = setInterval(() => {
        if (!liveTabActive) { clearInterval(liveTmr); return; }
        elapsed += 100;
        const pct = Math.min(elapsed / total * 100, 100);
        if (fill) { fill.style.transition='width .1s linear'; fill.style.width=pct+'%'; }
        if (elapsed >= total) {
            elapsed = 0;
            liveIdx = (liveIdx + 1) % LIVE_INDICATORS.length;
            renderLiveSlide(liveIdx);
            if (fill) { fill.style.transition='none'; fill.style.width='0%'; }
        }
    }, 100);
}

function stopLiveTimer() { clearInterval(liveTmr); }
function restartLiveTimer() { stopLiveTimer(); startLiveTimer(); }

function onLiveTabEnter() {
    liveTabActive = true;
    initLiveDots();
    renderLiveSlide(liveIdx);
    startLiveTimer();
    // Solicita fullscreen ao entrar no Live CRM
    document.documentElement.requestFullscreen?.().catch(() => {});
}

function onLiveTabLeave() {
    liveTabActive = false;
    stopLiveTimer();
    // Sai do fullscreen ao sair do Live CRM
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
}

// Sai do Live CRM ao pressionar Escape (fullscreenchange)
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && liveTabActive) {
        // Usuário saiu do fullscreen manualmente — volta para aba Geral
        const geralTab = document.querySelector('[data-tab="geral"]');
        if (geralTab) geralTab.click();
    }
});

// Speed selector
document.querySelectorAll('.live-spd').forEach(b => b.addEventListener('click', function () {
    document.querySelectorAll('.live-spd').forEach(x => x.classList.remove('on'));
    this.classList.add('on');
    liveSecs = parseInt(this.dataset.secs);
    LS.set('liveSecs', liveSecs);
    if (liveTabActive) restartLiveTimer();
}));

// ════════════════════════════════════════════════
// 🎉 SALE ANIMATION
// ════════════════════════════════════════════════
let saleCountdownTmr = null;

function checkNewSales(currentVendas) {
    const newSales = currentVendas.filter(r => !S.knownSaleIds.has(r._id));
    currentVendas.forEach(r => { if (r._id) S.knownSaleIds.add(r._id); });
    if (!S.firstLoad && S.period === 'today' && newSales.length > 0) {
        const todaySales = newSales.filter(r => isToday(r.data_venda || r.data));
        if (todaySales.length > 0) showSaleQueue(todaySales, 0);
    }
}

let saleQueue = [], saleQueueActive = false;
function showSaleQueue(sales, i) {
    if (i >= sales.length) { saleQueueActive = false; return; }
    saleQueueActive = true;
    showSaleAnim(sales[i]);
    setTimeout(() => showSaleQueue(sales, i + 1), 14000);
}

function showSaleAnim(r) {
    clearTimeout(saleCountdownTmr);
    const dataVenda = r.data_venda ? new Date(r.data_venda.replace(' ','T')).toLocaleDateString('pt-BR') : '';
    st('sa-subtitle', dataVenda ? `Fechada em ${dataVenda}` : '');
    st('sa-client', r.titular?.nome || 'Cliente');
    st('sa-corretor', r.corretor?.corretor || '—');
    st('sa-gestor', r.corretor?.imobiliaria || '—');
    st('sa-emp', r.unidade?.empreendimento || '—');
    st('sa-vgv', fVgvFmt(parseValor(r.condicoes?.valor_contrato || 0)));
    document.getElementById('sale-overlay').classList.add('on');
    let countdown = 12;
    st('sa-countdown', `Fechando em ${countdown}s...`);
    saleCountdownTmr = setInterval(() => {
        countdown--;
        if (countdown <= 0) { hideSaleAnim(); return; }
        st('sa-countdown', `Fechando em ${countdown}s...`);
    }, 1000);
}

function hideSaleAnim() {
    clearInterval(saleCountdownTmr);
    document.getElementById('sale-overlay').classList.remove('on');
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

// Tab switching
document.querySelectorAll('.nt').forEach(t => t.addEventListener('click', function () {
    const prev = document.querySelector('.nt.on')?.dataset.tab;
    document.querySelectorAll('.nt').forEach(x => x.classList.remove('on'));
    document.querySelectorAll('.tabc').forEach(x => x.classList.remove('on'));
    this.classList.add('on');
    const tabEl = document.getElementById('tab-' + this.dataset.tab);
    if (tabEl) tabEl.classList.add('on');
    if (this.dataset.tab === 'livecrm') onLiveTabEnter();
    else if (prev === 'livecrm') onLiveTabLeave();
}));

// Period bar buttons
document.querySelectorAll('.pb').forEach(b => b.addEventListener('click', function () {
    document.querySelectorAll('.pb').forEach(x => x.classList.remove('on'));
    document.querySelectorAll('.pb-custom').forEach(x => x.classList.remove('on'));
    this.classList.add('on');
    if (this.dataset.period === 'today') {
        setRangeToday();
        setPlbl('Hoje');
    } else {
        const d = +this.dataset.days;
        setRangeDays(d);
        LS.set('days', d);
        setPlbl('Últimos ' + d + ' dias');
    }
    processAll();
}));

// Sidebar quick buttons
document.querySelectorAll('.qbtn').forEach(b => b.addEventListener('click', function () {
    document.querySelectorAll('.qbtn').forEach(x => x.classList.remove('on'));
    this.classList.add('on');
    const from = new Date(), to = new Date();
    if (this.dataset.period === 'today') {
        setRangeToday();
        document.getElementById('f-from').value = fmt8(S.dateFrom);
        document.getElementById('f-to').value = fmt8(S.dateTo);
        document.getElementById('f-to').removeAttribute('disabled');
        setPlbl('Hoje');
    } else {
        const d = +this.dataset.days;
        from.setDate(from.getDate() - d);
        document.getElementById('f-from').value = fmt8(from);
        document.getElementById('f-to').value = fmt8(to);
        document.getElementById('f-to').removeAttribute('disabled');
        setPlbl('Últimos ' + d + ' dias');
    }
}));

document.getElementById('f-from').addEventListener('change', function () {
    const from = new Date(this.value), max = new Date(from);
    max.setDate(max.getDate() + 183);
    const tel = document.getElementById('f-to');
    tel.removeAttribute('disabled'); tel.min = this.value; tel.max = fmt8(max);
    document.querySelectorAll('.qbtn').forEach(x => x.classList.remove('on'));
    setPlbl('Personalizado');
    document.querySelectorAll('.pb').forEach(x => x.classList.remove('on'));
    document.getElementById('btn-custom').classList.add('on');
});

function applyFilter() {
    const from = document.getElementById('f-from').value;
    const to = document.getElementById('f-to').value;
    const gid = document.getElementById('f-gerente').value;
    if (from && to) {
        S.period = 'custom';
        S.dateFrom = new Date(from);
        S.dateTo = new Date(to); S.dateTo.setHours(23, 59, 59);
        setPlbl(`${from} → ${to}`);
        document.querySelectorAll('.pb').forEach(x => x.classList.remove('on'));
        document.getElementById('btn-custom').classList.add('on');
    } else if (from) {
        S.dateFrom = new Date(from);
    }
    if (gid) {
        document.getElementById('ind-sel').value = gid;
        document.querySelector('[data-tab="individual"]').click();
        loadInd(gid);
    }
    processAll();
    closeSB('sb-filter');
}

function cleanFilter() {
    setRangeToday();
    document.querySelectorAll('.qbtn').forEach(x => x.classList.toggle('on', x.dataset.period === 'today'));
    document.getElementById('f-from').value = '';
    document.getElementById('f-to').value = '';
    document.getElementById('f-to').setAttribute('disabled', true);
    document.getElementById('f-gerente').value = '';
    const imobSel = document.getElementById('f-imobiliaria'); if (imobSel) imobSel.value = '';
    document.querySelectorAll('.pb').forEach(x => x.classList.toggle('on', x.dataset.period === 'today'));
    setPlbl('Hoje');
    processAll();
}

function setPlbl(l) {
    document.getElementById('pchip').textContent = '📅 ' + l;
}

function getPeriodLabel() {
    if (S.period === 'today') return 'Hoje';
    if (S.period === 'days') return `Últimos ${S.days} dias`;
    if (S.dateFrom && S.dateTo) return `${fmt8(S.dateFrom)} → ${fmt8(S.dateTo)}`;
    return 'Personalizado';
}

// ════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════
function st(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fN(n) { return n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n||0); }
function fVgvFmt(v) {
    if (!v || isNaN(v)) return 'R$ 0';
    if (v >= 1e9) return 'R$ ' + (v/1e9).toFixed(2) + 'B';
    if (v >= 1e6) return 'R$ ' + (v/1e6).toFixed(2) + 'M';
    if (v >= 1e3) return 'R$ ' + (v/1e3).toFixed(0) + 'K';
    return 'R$ ' + Math.round(v).toLocaleString('pt-BR');
}

function showErr(err, isCORS) {
    const target = document.getElementById('abar');
    const div = document.createElement('div');
    div.className = isCORS ? 'cors-notice' : 'err-box';
    div.innerHTML = isCORS
        ? `<strong>Erro de conexão</strong>Verifique se o servidor proxy está rodando<br><em>${esc(err.message)}</em>`
        : `<strong>Erro</strong>${esc(err.message)}<br><em>Verifique e-mail, token e permissões no CV CRM.</em>`;
    target.insertAdjacentElement('afterend', div);
}

// ════════════════════════════════════════════════
// AUTO-REFRESH
// ════════════════════════════════════════════════
function setupAutoRefresh() {
    const mins = OPTS.autoRefreshMin || 0;
    if (mins > 0) setInterval(() => loadAllData(true), mins * 60 * 1000);
}

// ════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    applyBranding();

    setRangeToday();
    setPlbl('Hoje');

    const savedSecs = LS.get('liveSecs', OPTS.liveCrmSecs || 5);
    liveSecs = savedSecs;
    document.querySelectorAll('.live-spd').forEach(b => {
        b.classList.toggle('on', parseInt(b.dataset.secs) === liveSecs);
    });

    document.getElementById('configModal').style.display = 'none';
    loadAllData();
    setupAutoRefresh();
});
