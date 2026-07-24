// api/gemini.js — Vercel serverless
// Camada de IA com múltiplos provedores, retry com backoff e degradação progressiva.
// Ordem padrão: Groq primeiro (mais estável no free tier), Gemini como reserva.
// Configurável via env var AI_PROVIDER_ORDER = "groq,gemini" ou "gemini,groq".

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Erros que valem retry: rate limit, indisponibilidade temporária, erro de rede
function isRetryable(status, msg) {
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true;
  const m = (msg || "").toLowerCase();
  return m.includes("rate") || m.includes("quota") || m.includes("overload") ||
         m.includes("timeout") || m.includes("try again") || m.includes("temporarily");
}

// ── Transport: Groq ────────────────────────────────────────────────────────────
// Modelos em ordem de preferência. O 8b-instant tem limite de tokens/min MUITO
// maior no free tier — é a rede de segurança quando o 70b está saturado.
const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

async function callGroqOnce(apiKey, systemText, userText, maxTokens, model, jsonMode) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({
      model: model,
      max_tokens: maxTokens || 4096,
      temperature: 0.7,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: systemText },
        { role: "user",   content: userText   },
      ],
    }),
  });
  let data;
  try { data = await r.json(); }
  catch (e) { return { ok: false, status: r.status, error: "Resposta ilegível do Groq." }; }
  if (!r.ok) return { ok: false, status: r.status, error: data?.error?.message || ("HTTP " + r.status) };
  const text = ((data.choices || [])[0]?.message?.content || "").trim();
  if (!text) return { ok: false, status: 200, error: "Resposta vazia (Groq)." };
  return { ok: true, text, provider: "groq/" + model };
}

// Tenta cada modelo Groq com até 2 tentativas e backoff (0s, 2s).
// Contagem propositalmente baixa: o orçamento de tempo total da função é curto,
// e é mais eficaz cair para o modelo leve do que insistir no pesado.
async function callGroq(apiKey, systemText, userText, maxTokens, jsonMode) {
  if (!apiKey) return { ok: false, error: "GROQ_API_KEY não configurada." };
  let lastError = "";
  for (const model of GROQ_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await sleep(2000);
      let out;
      try { out = await callGroqOnce(apiKey, systemText, userText, maxTokens, model, jsonMode); }
      catch (e) { out = { ok: false, status: 0, error: "Rede: " + e.message }; }
      if (out.ok) return out;
      lastError = `[${model}] ${out.error}`;
      if (!isRetryable(out.status, out.error)) break; // erro definitivo — vai pro próximo modelo
    }
  }
  return { ok: false, error: lastError || "Groq indisponível." };
}

// ── Transport: Gemini (v1beta + JSON mode) ────────────────────────────────────
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"];

async function callGemini(apiKey, systemText, userText, maxTokens, jsonMode) {
  if (!apiKey) return { ok: false, error: "GEMINI_API_KEY não configurada." };
  const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
  let lastError = "";

  for (const model of GEMINI_MODELS) {
    // 1 tentativa por modelo: erro de quota do Gemini não se recupera dentro
    // da mesma requisição, então insistir só queima o orçamento de tempo.
    let r, data;
    try {
      r = await fetch(`${BASE}/${model}:generateContent?key=${apiKey}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemText }] },
          contents:           [{ role: "user", parts: [{ text: userText }] }],
          generationConfig:   {
            maxOutputTokens: maxTokens || 8192,
            temperature:     0.85,
            ...(jsonMode ? { responseMimeType: "application/json" } : {}),
          },
        }),
      });
      data = await r.json();
    } catch (e) {
      lastError = `[${model}] Rede: ${e.message}`;
      continue;
    }

    if (!r.ok) {
      lastError = `[${model}] ${data?.error?.message || "HTTP " + r.status}`;
      continue; // tenta o próximo modelo — pode ser indisponibilidade só deste
    }

    const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    if (text) return { ok: true, text, provider: "gemini/" + model };
    lastError = `[${model}] Resposta vazia.`;
  }
  return { ok: false, error: lastError || "Gemini indisponível." };
}

// ── Orquestrador: tenta os provedores na ordem configurada ────────────────────
// Retorna { ok, text, provider } ou { ok:false, error, tried:[...] }
async function callAI(keys, systemText, userText, maxTokens, jsonMode) {
  const order = (process.env.AI_PROVIDER_ORDER || "groq,gemini")
    .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  const tried = [];
  for (const provider of order) {
    if (provider === "groq" && keys.groq) {
      const out = await callGroq(keys.groq, systemText, userText, maxTokens, jsonMode);
      if (out.ok) return out;
      tried.push("Groq: " + out.error);
    } else if (provider === "gemini" && keys.gemini) {
      const out = await callGemini(keys.gemini, systemText, userText, maxTokens, jsonMode);
      if (out.ok) return out;
      tried.push("Gemini: " + out.error);
    }
  }
  return { ok: false, error: tried.join(" | ") || "Nenhum provedor de IA configurado.", tried };
}

// Extrai JSON de uma resposta que pode vir com cercas markdown ou texto extra
function parseJsonLoose(text) {
  if (!text) return null;
  const clean = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(clean); } catch (_) {}
  const m = clean.match(/\{[\s\S]+\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  return null;
}

// Keep old alias so nothing else breaks
const callClaude = callGroq;

// ── JSON helpers ───────────────────────────────────────────────────────────────
function parseJSON(raw) {
  const clean = (raw || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i,    "")
    .replace(/```\s*$/i,    "")
    .trim();
  return JSON.parse(clean);
}

function stripDashesDeep(obj) {
  if (typeof obj === "string") return obj.replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",");
  if (Array.isArray(obj))      return obj.map(stripDashesDeep);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const k in obj) out[k] = stripDashesDeep(obj[k]);
    return out;
  }
  return obj;
}

// Strip prompt-spec markers that the model sometimes echoes back into the body
function cleanBody(text) {
  return (text || "")
    .replace(/\s*[—–]\s*/g, ", ")          // em-dashes
    .replace(/§\d+\s*[—–]?\s*/g, "")       // §1, §2, §3
    .replace(/\[Abertura[^\]]*\]\s*/gi, "")
    .replace(/\[Situação[^\]]*\]\s*/gi, "")
    .replace(/\[Situacao[^\]]*\]\s*/gi, "")
    .replace(/\[Problema[^\]]*\]\s*/gi, "")
    .replace(/\[Pausa[^\]]*\]\s*/gi, "")
    .replace(/\[Implicação[^\]]*\]\s*/gi, "")
    .replace(/\[Implicacao[^\]]*\]\s*/gi, "")
    .replace(/\[CTA[^\]]*\]\s*/gi, "")
    .replace(/\[Necessidade[^\]]*\]\s*/gi, "")
    .replace(/^(SITUAÇÃO|PROBLEMA|IMPLICAÇÃO|NECESSIDADE|ABERTURA|CTA)\s*:\s*/gim, "")
    .replace(/,\s*,/g, ",")
    .replace(/\n{3,}/g, "\n\n")            // collapse excess blank lines
    .trim();
}

// ── Handler ────────────────────────────────────────────────────────────────────
// Timeout da função. O padrão do Vercel é 10s — insuficiente para a cadeia de
// retry + degradação progressiva. Hobby permite até 60s.
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Metodo nao permitido." });

  const groqKey   = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!groqKey)   return res.status(500).json({ error: "GROQ_API_KEY nao configurada." });
  // geminiKey is only required for sequences — validated below
  const apiKey = groqKey; // default for resumo + mapeamento

  try {
    const {
      mode, empresa, setor, cargo, angulo, pain, touches, rawContext, contato,
      icp, produtos, companySite, assinatura, dna,
    } = req.body || {};

    // ── Seller context — DNA takes priority ───────────────────────────────────
    const vendedorEmpresa    = dna?.empresa?.nome || companySite || "minha empresa";
    const vendedorAssinatura = assinatura || "Consultor";

    const dnaContext = dna ? [
      `PERFIL DA EMPRESA VENDEDORA:`,
      `- Nome: ${dna.empresa?.nome || vendedorEmpresa}`,
      `- O que faz: ${dna.empresa?.descricao || ""}`,
      `- Proposta de valor: ${dna.empresa?.proposta_valor || ""}`,
      `- Diferenciais: ${(dna.empresa?.diferenciais || []).join(", ")}`,
      ``,
      `ICP REFINADO:`,
      `- Segmento: ${dna.icp_refinado?.segmento || ""}`,
      `- Porte: ${dna.icp_refinado?.porte || ""}`,
      `- Cargos primários: ${(dna.icp_refinado?.cargos_primarios || []).join(", ")}`,
      `- Sinais de compra: ${(dna.icp_refinado?.sinais_de_compra || []).join("; ")}`,
      ``,
      `GATILHOS DE COMPRA:`,
      ...(dna.gatilhos_de_compra || []).map((g, i) => `${i + 1}. ${g}`),
      ``,
      `OBJEÇÕES COMUNS:`,
      ...(dna.objecoes_e_respostas || []).map(o => `- "${o.objecao}" → ${o.resposta}`),
    ].join("\n") : "";

    const icpDesc = dna?.icp_refinado
      ? [
          dna.icp_refinado.segmento ? `Segmento: ${dna.icp_refinado.segmento}` : "",
          dna.icp_refinado.porte    ? `Porte: ${dna.icp_refinado.porte}`       : "",
          dna.icp_refinado.regiao   ? `Região: ${dna.icp_refinado.regiao}`     : "",
          (dna.icp_refinado.cargos_primarios || []).length
            ? `Cargos: ${dna.icp_refinado.cargos_primarios.join(", ")}` : "",
        ].filter(Boolean).join("\n")
      : icp
      ? [
          icp.segmento    ? `Segmento: ${icp.segmento}`       : "",
          icp.porte       ? `Porte: ${icp.porte}`             : "",
          icp.faturamento ? `Faturamento: ${icp.faturamento}` : "",
          icp.regiao      ? `Região: ${icp.regiao}`           : "",
          icp.cargos      ? `Cargos: ${icp.cargos}`           : "",
        ].filter(Boolean).join("\n")
      : "ICP não configurado.";

    const produtosPrompt = dna?.empresa?.descricao
      ? [
          `${dna.empresa.nome} — ${dna.empresa.descricao}`,
          dna.empresa.proposta_valor ? `Proposta de valor: ${dna.empresa.proposta_valor}` : "",
          (dna.empresa.diferenciais || []).length
            ? `Diferenciais: ${dna.empresa.diferenciais.join(", ")}` : "",
        ].filter(Boolean).join("\n")
      : Array.isArray(produtos) && produtos.length
      ? produtos.map((p, i) => [
          `${i + 1}. ${p.nome || "Produto"}`,
          p.descricao  ? `   O que é: ${p.descricao}`    : "",
          p.beneficios ? `   Benefícios: ${p.beneficios}` : "",
          p.publico    ? `   Público: ${p.publico}`        : "",
        ].filter(Boolean).join("\n")).join("\n\n")
      : "NENHUM PRODUTO CADASTRADO — faça perguntas abertas de discovery.";

    const sellerCtx = dnaContext || [
      `Empresa do vendedor: ${vendedorEmpresa}`,
      `Produtos/soluções:\n${produtosPrompt}`,
      `ICP:\n${icpDesc}`,
    ].join("\n");

    // ── MODO RESUMO ───────────────────────────────────────────────────────────
    if (mode === "resumo") {
      const system = [
        `Você é um especialista em account mapping e inteligência de mercado no Brasil.`,
        `REGRA ABSOLUTA: Escreva SEMPRE em Português do Brasil. Nunca em inglês.`,
        ``,
        `Sua tarefa: escrever um BRIEFING DA EMPRESA-ALVO — 2 parágrafos densos sobre a empresa que o vendedor vai abordar.`,
        ``,
        `Parágrafo 1: o que a empresa FAZ (produto/serviço, modelo de negócio, mercado que atende), porte estimado, presença geográfica e momento atual (crescimento, expansão, M&A, novas contratações, novos produtos).`,
        `Parágrafo 2: contexto competitivo — pressões do setor, concorrentes principais, desafios estruturais do mercado onde ela atua, tendências que impactam o negócio.`,
        ``,
        `REGRAS: Sem markdown. Sem bullets. Prosa corrida. NÃO mencione o vendedor ou seus produtos — isso é um briefing da empresa-alvo, não um pitch.`,
      ].join("\n");

      const cleanCtx = (rawContext || "")
        .split("\n")
        .filter(l => l.trim().length > 30 && !(/;.*;/.test(l)) && !(/trk=|utm_|cnpj|\d{5}-\d{3}/i.test(l)))
        .join("\n")
        .slice(0, 3000);

      const user = [
        `INSTRUÇÃO: Responda EXCLUSIVAMENTE em Português do Brasil. O resumo é SOBRE a empresa-alvo, não sobre o vendedor.`,
        ``,
        `EMPRESA-ALVO: ${empresa || "a empresa"}`,
        `SETOR: ${setor || "tecnologia"}`,
        ``,
        `CONTEXTO COLETADO (pode estar em inglês — escreva o resumo em português):`,
        cleanCtx || "Sem dados — use o nome e setor para inferir o perfil provável da empresa.",
        ``,
        `Escreva agora o briefing em Português do Brasil. 2 parágrafos. Sem markdown. Sem mencionar o vendedor.`,
      ].join("\n");

      const out = await callClaude(apiKey, system, user, 1024);
      if (!out.ok) return res.status(502).json({ error: "Groq erro: " + out.error });
      const resumoClean = (out.text || "").replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",");
      return res.status(200).json({ resumo: resumoClean || null });
    }

    // ── MODO MAPEAMENTO ───────────────────────────────────────────────────────
    if (mode === "mapeamento") {

      // ── Step A: ANALYSIS — fit, dores, triggers, SPIN, objeções ─────────────
      // Kept deliberately compact so Llama can reliably produce it
      const sysA = [
        `Você é um especialista sênior em outbound B2B e account mapping no Brasil.`,
        `Responda APENAS em JSON válido. Todo o conteúdo em Português do Brasil. Sem markdown.`,
        ``,
        `CONTEXTO DO VENDEDOR:`,
        sellerCtx,
      ].join("\n");

      // Strip English noise from context
      const cleanRaw = (rawContext || "")
        .split("\n")
        .filter(l => l.trim().length > 20 && !(/;.*;/.test(l)) && !(/trk=|utm_|cnpj/i.test(l)))
        .join("\n")
        .slice(0, 2500);

      const userA = [
        `Empresa-alvo: "${empresa || "a empresa"}" — Setor: ${setor || "tecnologia"}`,
        ``,
        `Contexto coletado (pode estar em inglês — responda em português):`,
        cleanRaw || "Sem dados adicionais.",
        ``,
        `Retorne SOMENTE este JSON (sem texto antes ou depois):`,
        `{`,
        `  "resumo": "Dois parágrafos densos e diretos: (1) o que a empresa faz, modelo de negócio, porte estimado, mercado atendido e momento atual; (2) pressões competitivas, desafios do setor e oportunidades estratégicas. NÃO mencione o vendedor.",`,
        `  "fit": {`,
        `    "score": "ALTO ou MÉDIO ou BAIXO",`,
        `    "justificativa": "3 frases concretas explicando por que o produto do vendedor se encaixa nesta empresa agora"`,
        `  },`,
        `  "dores": {`,
        `    "principais": [`,
        `      "Dor operacional: descreva um problema real do dia a dia desta empresa neste setor",`,
        `      "Dor tecnológica: limitação de sistema, stack legado ou gap digital específico do setor",`,
        `      "Dor de pessoas/gestão: problema de hiring, retenção, produtividade ou estrutura org",`,
        `      "Dor regulatória ou de compliance: norma, auditoria, risco jurídico ou fiscal real do setor",`,
        `      "Dor estratégica/competitiva: pressão de mercado, perda de share ou ameaça de novo entrante"`,
        `    ]`,
        `  },`,
        `  "triggers": [`,
        `    "Descreva um evento concreto que indica momento de compra — ex: rodada de investimento, nova regulação, expansão de headcount, abertura de vagas técnicas, troca de liderança, M&A, IPO, lançamento de produto concorrente",`,
        `    "Segundo trigger concreto e distinto do primeiro",`,
        `    "Terceiro trigger — pode ser sazonalidade, renovação de contrato, fim de ano fiscal",`,
        `    "Quarto trigger — sinal digital como vagas abertas, expansão geográfica ou press release"`,
        `  ],`,
        `  "perguntas_spin": {`,
        `    "situacao": [`,
        `      "Pergunta aberta sobre como a empresa opera hoje na área relacionada ao produto do vendedor",`,
        `      "Pergunta sobre estrutura atual, tecnologia usada ou processo vigente"`,
        `    ],`,
        `    "problema": [`,
        `      "Pergunta que revela uma dor latente sem ser óbvio — faça o prospect pensar",`,
        `      "Pergunta que expõe uma limitação ou risco que eles talvez não tenham quantificado"`,
        `    ],`,
        `    "implicacao": [`,
        `      "Pergunta que amplia a consequência da dor — impacto financeiro, operacional ou humano",`,
        `      "Pergunta que conecta o problema a algo que o líder se importa: receita, risco, reputação"`,
        `    ],`,
        `    "necessidade": [`,
        `      "Pergunta que leva o prospect a articular o valor da solução com as próprias palavras",`,
        `      "Pergunta que ancora o benefício em um resultado mensurável para esta empresa"`,
        `    ]`,
        `  },`,
        `  "objecoes": [`,
        `    {`,
        `      "objecao": "Objeção mais provável deste perfil de empresa/cargo — seja específico",`,
        `      "resposta": "Resposta que usa um diferencial concreto do produto + dado ou lógica de ROI"`,
        `    },`,
        `    {`,
        `      "objecao": "Segunda objeção — timing, prioridade ou budget",`,
        `      "resposta": "Resposta que cria urgência sem pressionar, apoia com referência ou prova social"`,
        `    },`,
        `    {`,
        `      "objecao": "Terceira objeção — já temos uma solução interna ou concorrente",`,
        `      "resposta": "Resposta que diferencia sem denegrir, com perguntas de discovery que revelam gaps"`,
        `    }`,
        `  ],`,
        `  "proximos_passos": {`,
        `    "bdr": [`,
        `      "Primeira ação concreta do BDR — com quem falar e por qual canal",`,
        `      "Segunda ação — pesquisa específica a fazer antes do primeiro contato",`,
        `      "Terceira ação — monitoramento ou alerta a configurar"`,
        `    ],`,
        `    "ae": [`,
        `      "Primeira ação do AE após primeiro contato positivo",`,
        `      "Segunda ação — material ou diagnóstico a preparar",`,
        `      "Terceira ação — como avançar para proposta"`,
        `    ],`,
        `    "prazo": "Urgência recomendada com justificativa"`,
        `  }`,
        `}`,
      ].join("\n");

      const outA = await callClaude(apiKey, sysA, userA, 4096);
      if (!outA.ok) return res.status(502).json({ error: "Groq erro (análise): " + outA.error });

      let analysis;
      try { analysis = parseJSON(outA.text); }
      catch (e) {
        try {
          const m = outA.text.match(/\{[\s\S]+\}/);
          if (m) analysis = JSON.parse(m[0]);
          else throw e;
        } catch (e2) {
          return res.status(200).json({ error: "Falha ao interpretar análise.", raw: outA.text.slice(0, 300) });
        }
      }

      // ── Step B: MESSAGING — emails, inmails, whatsapps, cold calls ─────────
      const sysB = [
        `Você é o melhor copywriter de outbound B2B do Brasil.`,
        `Responda APENAS em JSON válido. Português do Brasil. Sem markdown. Sem travessão (—).`,
        ``,
        `Você representa: ${vendedorEmpresa}`,
        `${produtosPrompt}`,
        ``,
        `Empresa-alvo: ${empresa || "a empresa"} | Setor: ${setor || "tecnologia"}`,
        `Dor principal mapeada: ${((analysis.dores && analysis.dores.principais) || [])[0] || "a ser descoberta"}`,
        `Gatilho mais relevante: ${(analysis.triggers || [])[0] || "expansão ou crescimento"}`,
      ].join("\n");

      const userB = [
        `Crie 3 emails, 2 inmails, 2 whatsapps e 2 cold call scripts para abordar ${empresa}.`,
        ``,
        `REGRAS:`,
        `- Nunca use [Nome], [Empresa] ou qualquer placeholder. Use "${empresa}" diretamente.`,
        `- Sem travessão. Use vírgula ou ponto.`,
        `- Emails: 150-200 palavras, 2-3 parágrafos, CTA leve.`,
        `- InMails: 80-100 palavras, gancho direto, CTA curto.`,
        `- WhatsApp: 3-4 frases casuais que mostram pesquisa real.`,
        `- Cold call: script falado completo, mín. 100 palavras, com pausa e resposta a objeção.`,
        ``,
        `{"emails":[{"assunto":"...","corpo":"..."},{"assunto":"...","corpo":"..."},{"assunto":"...","corpo":"..."}],"inmails":[{"assunto":"...","corpo":"..."},{"assunto":"...","corpo":"..."}],"whatsapps":["...","..."],"cold_calls":["...","..."]}`,
      ].join("\n");

      const outB = await callClaude(apiKey, sysB, userB, 4096);
      let messaging = { emails: [], inmails: [], whatsapps: [], cold_calls: [] };
      if (outB.ok) {
        try {
          const mb = outB.text.match(/\{[\s\S]+\}/);
          if (mb) messaging = JSON.parse(mb[0]);
        } catch (e) { /* messaging stays empty, not fatal */ }
      }

      // Merge and return
      const result = Object.assign({}, analysis, {
        estrategia: Object.assign({
          emails:         messaging.emails     || [],
          inmails:        messaging.inmails    || [],
          whatsapps:      messaging.whatsapps  || [],
          cold_calls:     messaging.cold_calls || [],
          perguntas_spin: analysis.perguntas_spin
            ? [
                ...((analysis.perguntas_spin.situacao  || []).map(q => "SITUAÇÃO: "  + q)),
                ...((analysis.perguntas_spin.problema  || []).map(q => "PROBLEMA: "  + q)),
                ...((analysis.perguntas_spin.implicacao|| []).map(q => "IMPLICAÇÃO: "+ q)),
                ...((analysis.perguntas_spin.necessidade||[]).map(q => "NECESSIDADE: "+ q)),
              ]
            : [],
          objecoes: analysis.objecoes || [],
          "objeções": analysis.objecoes || [],
        }),
      });

      // Clean all strings
      return res.status(200).json(stripDashesDeep(result));
    }

    // ── MODO SEQUÊNCIA — Gemini 2.5 Flash, JSON mode, single call ──────────────
    if (!geminiKey) return res.status(200).json({ touches: null, error: "GEMINI_API_KEY nao configurada." });

    const cadencia = Array.isArray(touches) && touches.length ? touches : [
      { day:1, type:"linkedin" }, { day:3,  type:"email"    },
      { day:6, type:"call"     }, { day:10, type:"email"    },
      { day:15,type:"whatsapp" }, { day:21, type:"breakup"  },
    ];

    const nomeUsar      = contato ? contato.split(" ")[0] : null;
    const doraPrincipal = pain || "desafio central do setor";

    const ANGLES = [
      "impacto operacional — o que está quebrando no dia a dia",
      "risco estratégico — o que pode dar errado nos próximos 6 meses",
      "vantagem competitiva — o que concorrentes já estão fazendo",
      "custo oculto — o que a ineficiência está custando em receita",
      "timing — por que agora é o momento certo",
      "prova social — o que outros líderes do setor já resolveram",
    ];

    const CHANNEL_GUIDE = {
      email:    "E-mail de prospecção: 3 parágrafos, mínimo 200 palavras. P1: situação + problema específico. P2: implicação concreta (receita, time, risco). P3: visão do possível + CTA leve.",
      linkedin: "LinkedIn InMail: 2 parágrafos, mínimo 120 palavras. P1: gancho com observação sobre a empresa + dor do cargo. P2: implicação + CTA não agressivo.",
      call:     "Script de cold call para leitura em voz alta: mínimo 150 palavras. Inclua: abertura de 10s, contexto do setor, pergunta cirúrgica sobre a dor, pausa, implicação, CTA de 20 min.",
      whatsapp: "WhatsApp: 4-5 frases curtas e casuais. Frase 1: observação sobre a empresa que prova pesquisa. Frase 2: dor indireta do cargo. Frase 3: resultado que outros alcançaram. Frase 4-5: pergunta de engajamento.",
      breakup:  "Mensagem de breakup: mínimo 120 palavras. Reconheça que não é o momento. Deixe insight valioso. Abra porta para contato futuro com classe.",
      follow:   "Follow-up: 2 parágrafos, mínimo 120 palavras. P1: novo ângulo ou dado de mercado. P2: implicação aprofundada + CTA com leve urgência.",
    };

    const seqSys = [
      `Você é o maior especialista em outbound B2B do Brasil, combinando SPIN Selling e copywriting de resposta direta.`,
      `Representa: ${vendedorEmpresa}`,
      produtosPrompt ? `Produto/solução: ${produtosPrompt.slice(0, 200)}` : "",
      ``,
      `REGRAS ABSOLUTAS:`,
      `- Português do Brasil. Nunca inglês.`,
      `- Nunca use [Nome], [Empresa] ou qualquer placeholder. Use dados reais.`,
      `- Nunca use travessão (— ou –). Use vírgula.`,
      `- Nunca comece mensagem com saudação genérica. Comece com gancho de impacto.`,
      `- Retorne APENAS JSON válido conforme o schema solicitado.`,
    ].filter(Boolean).join("\n");

    const touchList = cadencia.map((t, i) => ({
      day:   t.day,
      type:  t.type,
      guide: CHANNEL_GUIDE[t.type] || CHANNEL_GUIDE.email,
      angle: ANGLES[i % ANGLES.length],
    }));

    // ── Geração com degradação progressiva ────────────────────────────────────
    // Nível 1: uma chamada com todos os touches (mais rápido, melhor coesão)
    // Nível 2: dois lotes menores (menos tokens por chamada, escapa do rate limit)
    // Nível 3: um touch por vez (menor footprint possível, com pausas)
    // Retorna o que conseguir — resultado parcial é melhor que erro total.

    const keys = { groq: groqKey, gemini: geminiKey };
    const attemptLog = [];

    // Orçamento de tempo — funções serverless têm timeout rígido. Escalar para
    // níveis mais lentos só faz sentido se ainda houver tempo hábil; caso contrário
    // devolvemos o que já temos em vez de estourar o limite e perder tudo.
    const startedAt = Date.now();
    const TIME_BUDGET_MS = 45000;
    const timeLeft = () => TIME_BUDGET_MS - (Date.now() - startedAt);

    function normalizeTouches(rawList) {
      return (rawList || []).map((t, i) => ({
        day:     t.day     || cadencia[i]?.day  || i + 1,
        type:    t.type    || cadencia[i]?.type || "email",
        subject: (t.subject || "").replace(/\s*[—–]\s*/g, ", ").trim(),
        body:    (t.body   || "").replace(/\s*[—–]\s*/g, ", ").replace(/\n{3,}/g, "\n\n").trim(),
      })).filter(t => t.body && t.body.length > 20);
    }

    // Monta o prompt de usuário para um subconjunto da cadência
    function buildUsrFor(subset, offset) {
      return [
        `Crie ${subset.length} mensagem(ns) de prospecção B2B para:`,
        `- Empresa-alvo: ${empresa || "a empresa"}`,
        `- Setor: ${setor || "tecnologia"}`,
        `- Cargo do decisor: ${cargo || "C-Level / Diretor"}`,
        nomeUsar ? `- Nome do contato: ${nomeUsar}` : null,
        `- Dor central: ${doraPrincipal}`,
        ``,
        `Gere exatamente ${subset.length} touch(es):`,
        subset.map((t, i) => {
          const gi = offset + i;
          return `${i+1}. Dia ${t.day} — ${t.type.toUpperCase()} — Ângulo: ${ANGLES[gi % ANGLES.length]}\n   Guia: ${CHANNEL_GUIDE[t.type] || CHANNEL_GUIDE.email}`;
        }).join("\n"),
        ``,
        `Retorne JSON com este schema exato:`,
        `{"touches":[{"day":${subset[0].day},"type":"${subset[0].type}","subject":"assunto","body":"mensagem completa"}]}`,
        ``,
        `Cada body deve seguir o guia do canal. Use \\n\\n entre parágrafos.`,
        `Responda APENAS com o JSON, sem texto fora dele.`,
      ].filter(Boolean).join("\n");
    }

    async function generateSubset(subset, offset, maxTok) {
      const usr = buildUsrFor(subset, offset);
      const out = await callAI(keys, seqSys, usr, maxTok, true);
      if (!out.ok) { attemptLog.push(out.error); return null; }
      const parsed = parseJsonLoose(out.text);
      const list = parsed?.touches || (Array.isArray(parsed) ? parsed : null);
      if (!list?.length) { attemptLog.push("Resposta sem touches válidos."); return null; }
      return list;
    }

    // ── Nível 1: tudo de uma vez ──
    let rawTouches = await generateSubset(cadencia, 0, 6000);

    // ── Nível 2: dois lotes ── (precisa de ~15s)
    if ((!rawTouches || normalizeTouches(rawTouches).length < cadencia.length) && timeLeft() > 15000) {
      const mid = Math.ceil(cadencia.length / 2);
      const a = await generateSubset(cadencia.slice(0, mid), 0, 3500);
      await sleep(1200); // respiro entre lotes para não estourar tokens/min
      const b = timeLeft() > 6000 ? await generateSubset(cadencia.slice(mid), mid, 3500) : null;
      const combined = [...(a || []), ...(b || [])];
      if (combined.length > (rawTouches?.length || 0)) rawTouches = combined;
    }

    // ── Nível 3: um touch por vez ── (precisa de ~6s por touch restante)
    if ((!rawTouches || normalizeTouches(rawTouches).length < cadencia.length) && timeLeft() > 12000) {
      const collected = [];
      for (let i = 0; i < cadencia.length; i++) {
        if (timeLeft() < 6000) break; // sem tempo hábil — para e entrega o parcial
        if (i > 0) await sleep(1200);
        const one = await generateSubset([cadencia[i]], i, 1500);
        if (one?.length) collected.push(one[0]);
      }
      if (collected.length > (rawTouches?.length || 0)) rawTouches = collected;
    }

    const finalTouches = normalizeTouches(rawTouches);

    if (!finalTouches.length) {
      return res.status(200).json({
        touches: null,
        error: "Não foi possível gerar a sequência. Detalhe: " + (attemptLog.slice(-2).join(" | ") || "erro desconhecido"),
      });
    }

    // Sucesso parcial: devolve o que conseguiu e avisa quantos faltaram
    return res.status(200).json({
      touches: finalTouches,
      partial: finalTouches.length < cadencia.length,
      message: finalTouches.length < cadencia.length
        ? `Gerados ${finalTouches.length} de ${cadencia.length} toques. Use "Recarregar" nos que faltam.`
        : undefined,
    });
  } catch (e) {
    return res.status(200).json({ error: "Erro interno: " + e.message });
  }
}
