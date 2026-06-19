# Mais Pipe Core — Guia de Migração para Novo Cliente

## Como funciona a seleção de cliente

O repositório é único. O Vercel decide qual cliente carregar via variável de ambiente:

```
VITE_CLIENT=elcanary   → carrega client-elcanary.js
VITE_CLIENT=mgt        → carrega client-mgt.js
VITE_CLIENT=zendesk    → carrega client-zendesk.js
```

Essa variável é configurada UMA VEZ no painel do Vercel por projeto.
Depois disso, qualquer `git push` atualiza todos os clientes automaticamente.

---

## Estrutura do repositório

```
maispipe-core/
├── App.jsx                        ← Código da aplicação (nunca editar para migrar)
├── vite.config.js
├── api/
│   ├── gemini.js                  ← Editar: systemPrompt e sysR por cliente
│   ├── analyze.js                 ← Editar: prompt interno por cliente
│   └── stakeholders.js            ← Editar: queries de busca por cliente
└── src/config/
    ├── clientLoader.js            ← Editar: adicionar import do novo cliente aqui
    ├── client-elcanary.js         ← Config El Canary ✅
    ├── client-mgt.js              ← Config MGT ✅
    └── client-[novo].js           ← Novo cliente (criar aqui)
```

---

## Adicionar novo cliente (passo a passo)

### Passo 1 — Criar o arquivo de config

```bash
cp src/config/client-elcanary.js src/config/client-nomecliente.js
```

Edite as seções no arquivo criado:

| Seção | O que editar |
|---|---|
| `empresa` | Nome, assinatura, site, rodapé PDF |
| `ui` | Textos de loading, cards da home |
| `setorConfig` | Setores ICP e Tier 1 |
| `stakeholderProfiles` | 4–6 perfis com angle e pain |
| `sequenceTemplates` | Sequências completas por perfil |
| `oneTouchVariants` | Variantes de toque único |
| `buildData` | Fit, dores, triggers, SPIN, objeções, próximos passos |

### Passo 2 — Registrar no clientLoader.js

Abra `src/config/clientLoader.js` e adicione:

```js
import { CLIENT_CONFIG as nomecliente } from "./client-nomecliente.js";

const configs = { elcanary, mgt, nomecliente };  // adicione aqui
```

### Passo 3 — Atualizar as APIs

- `api/gemini.js` → systemPrompt e sysR com contexto do novo cliente
- `api/analyze.js` → prompt interno com produtos do novo cliente
- `api/stakeholders.js` → queries de busca com cargos relevantes

### Passo 4 — Criar projeto no Vercel

1. Novo projeto → apontar para este mesmo repositório GitHub
2. Em "Environment Variables", adicionar:
   - `VITE_CLIENT` = `nomecliente`
   - `GEMINI_API_KEY` = `...`
   - `TAVILY_API_KEY` = `...`
   - `HUNTER_API_KEY` = `...`
   - `APOLLO_API_KEY` = `...`
3. Deploy — pronto.

### Passo 5 — git push

```bash
git add .
git commit -m "feat: add client-nomecliente config"
git push
```

Todos os projetos existentes fazem redeploy automático.
O novo projeto também entra em produção.

---

## Atualizar uma funcionalidade (ex: novo botão)

```bash
# Edite App.jsx
git add App.jsx
git commit -m "feat: botão enviar contatos para seção Contatos"
git push
```

Todos os clientes atualizam em ~2 minutos. Nenhum arquivo de config precisa ser tocado.

---

## Checklist de migração

- [ ] `src/config/client-[nome].js` criado e editado
- [ ] `src/config/clientLoader.js` atualizado com import e entrada no objeto `configs`
- [ ] `api/gemini.js` atualizado
- [ ] `api/analyze.js` atualizado
- [ ] `api/stakeholders.js` atualizado
- [ ] Projeto criado no Vercel com `VITE_CLIENT=[nome]` e as 4 API keys
- [ ] `git push` feito
- [ ] Teste: mapear uma empresa real e validar fit, sequências e SPIN

---

## Defaults de UI (aplicar sempre, independente do cliente)

- Descrição da seção Busca: `"Digite o nome da empresa para gerar o mapeamento completo. O resultado é salvo automaticamente em Contas."`
- Sidebar abaixo do logo: `"PROSPECTING TOOL"` (sem "BETA")

---

## Clientes ativos

| Cliente | Config | VITE_CLIENT | Deploy Vercel |
|---|---|---|---|
| El Canary Privacy & Ethics | `client-elcanary.js` | `elcanary` | pipe-elcanary |
| MGT Gestão Tributária | `client-mgt.js` | `mgt` | pipe-mgt |
| *(próximo)* | `client-[nome].js` | `[nome]` | pipe-[nome] |
