# 📊 Dashboard de Vendas — CV CRM

Dashboard de vendas em tempo real integrado ao **CV CRM**. Template replicável para qualquer empresa que utilize o CV CRM.

## 🚀 Início Rápido

```bash
# 1. Clone o repositório
git clone https://github.com/SalesKlugGabriel/Dashboard.git
cd Dashboard

# 2. Instale as dependências
npm install

# 3. Configure (edite os 2 arquivos abaixo)
# 4. Inicie o servidor
node server.js
```

Acesse: **http://localhost:3000**

---

## ⚙️ Configuração

Para configurar o dashboard para uma nova empresa, edite **apenas 2 arquivos**:

### 1. `public/config.js` — Credenciais, tema e marca

```js
const CONFIG = {
  // 🔑 CREDENCIAIS
  api: {
    domain: 'suaempresa.cvcrm.com.br',
    email:  'admin@suaempresa.com.br',
    token:  'SEU_TOKEN_AQUI'
  },

  // 🎨 TEMA (cores)
  theme: {
    primary:     '#E87722',   // Cor principal
    primaryDark: '#c85e10',   // Cor principal escura
    success:     '#2ecc71',   // Cor de sucesso
    background:  '#121212',   // Fundo geral
    surface1:    '#1e1e1e',   // Fundo de cards
    surface2:    '#2a2a2a',   // Bordas
    text:        '#e0e0e0',   // Texto principal
    textMuted:   '#888888'    // Texto secundário
  },

  // 🏢 MARCA
  brand: {
    name:     'SUA EMPRESA',
    tagline:  'Seu slogan aqui',
    title:    'DASHBOARD DE VENDAS',
    logoUrl:  ''  // Ex: 'logo.png' (coloque na pasta public/)
  },

  // ⚙ OPÇÕES
  options: {
    defaultDays:    30,
    autoRefreshMin: 0,
    tvIntervalSec:  15
  }
};
```

### 2. `server-config.json` — Domínio do proxy

```json
{
  "domain": "suaempresa.cvcrm.com.br",
  "port": 3000
}
```

> ⚠️ O `domain` no `server-config.json` **deve ser igual** ao `api.domain` no `config.js`.

---

## 🔑 Onde obter o Token

1. Acesse o painel do CV CRM da empresa
2. Vá em **Integrações > APIs**
3. Copie o **Token de API**
4. Cole no campo `api.token` do `config.js`

---

## 📁 Estrutura

```
├── server.js           # Servidor Express + proxy CORS
├── server-config.json  # Config do servidor (domínio e porta)
├── package.json        # Dependências Node.js
├── public/
│   ├── config.js       # ⭐ SUA CONFIGURAÇÃO (credenciais, tema, marca)
│   ├── index.html      # Dashboard HTML + CSS
│   └── app.js          # Lógica JavaScript
└── .gitignore
```

---

## 🎨 Exemplos de Temas

### Tema Escuro (padrão)
```js
theme: { primary: '#E87722', primaryDark: '#c85e10', success: '#2ecc71', background: '#121212', surface1: '#1e1e1e', surface2: '#2a2a2a', text: '#e0e0e0', textMuted: '#888888' }
```

### Tema Azul Corporativo
```js
theme: { primary: '#2563EB', primaryDark: '#1D4ED8', success: '#10B981', background: '#0F172A', surface1: '#1E293B', surface2: '#334155', text: '#E2E8F0', textMuted: '#94A3B8' }
```

### Tema Verde
```js
theme: { primary: '#059669', primaryDark: '#047857', success: '#34D399', background: '#111827', surface1: '#1F2937', surface2: '#374151', text: '#F3F4F6', textMuted: '#9CA3AF' }
```

---

## 📺 Funcionalidades

- **Visão Geral**: Métricas de leads, reservas, vendas, VGV, taxa de conversão
- **Funil de Vendas**: Gráfico de barras da jornada completa
- **Tendência Semanal**: Gráfico de linhas com evolução temporal
- **Ranking de Corretores**: Tabela ordenada por VGV
- **Por Corretor**: Performance individual com comparativo vs equipe
- **Filtros**: Por período, data customizada, corretor/gestor
- **Modo TV**: Apresentação automática em fullscreen
- **Auto-refresh**: Atualização automática configurável

---

## 📄 Licença

Uso interno. Desenvolvido para empresas que utilizam o CV CRM.
