// ════════════════════════════════════════════════════════
// CONFIGURAÇÃO DO DASHBOARD — CV CRM
// ════════════════════════════════════════════════════════
// Edite APENAS este arquivo para replicar o dashboard
// em outra empresa. Não é necessário alterar nenhum
// outro arquivo.
// ════════════════════════════════════════════════════════

const CONFIG = {

    // ─── 🔑 CREDENCIAIS CV CRM ───────────────────────────
    api: {
        domain: 'gthome.cvcrm.com.br',     // Subdomínio da empresa no CV CRM
        email: 'gabriel.klug@gthome.com.br', // E-mail do usuário administrativo
        token: '537c6b7dda27a3dc751e0e6a863611edd6085285' // Token de API (gerar em Integrações > APIs)
    },

    // ─── 🎨 TEMA (cores do dashboard) ────────────────────
    theme: {
        primary: '#E87722',   // Cor principal (header, botões, destaques)
        primaryDark: '#c85e10',   // Cor principal escura (hover, fundo de gráficos)
        success: '#2ecc71',   // Cor de sucesso (vendas, status OK)
        background: '#121212',   // Fundo geral
        surface1: '#1e1e1e',   // Fundo de cards
        surface2: '#2a2a2a',   // Bordas e divisores
        text: '#e0e0e0',   // Texto principal
        textMuted: '#888888'    // Texto secundário
    },

    // ─── 🏢 MARCA / BRANDING ─────────────────────────────
    brand: {
        name: 'GT.HOME',                    // Nome da empresa (exibido no header)
        tagline: 'CADA DETALHE FAZ A DIFERENÇA', // Subtítulo abaixo do nome
        title: 'DASHBOARD DE VENDAS',        // Título do dashboard
        logoUrl: ''                            // URL ou caminho do logo (ex: 'logo.png'). Se vazio, mostra texto
    },

    // ─── ⚙ OPÇÕES ────────────────────────────────────────
    options: {
        defaultDays: 30,     // Período padrão (7, 30, 45, 90, 180)
        autoRefreshMin: 0,      // Auto-refresh em minutos (0 = desligado)
        tvIntervalSec: 15      // Intervalo entre slides no Modo TV (segundos)
    }
};
