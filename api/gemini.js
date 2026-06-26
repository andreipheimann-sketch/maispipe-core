// api/gemini.js — Vercel serverless
// Geracao de sequencias, resumo e mapeamento completo via Google Gemini.
// Variavel de ambiente necessaria: GEMINI_API_KEY
// Opcional: GEMINI_MODEL, GEMINI_MODEL_RESUMO, GEMINI_MODEL_SEQUENCIA

const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

async function callGemini(model, apiKey, systemText, userText, temperature, jsonMode) {
  const body = {
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };
  if (jsonMode) body.generationConfig.responseMimeType = "application/json";

  const r = await fetch(BASE + model + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = (data && data.error && data.error.message) || ("HTTP " + r.status);
    return { ok: false, status: r.status, error: msg };
  }
  const cand = data.candidates && data.candidates[0];
  const finish = cand && cand.finishReason;
  const text = ((cand && cand.content && cand.content.parts) || [])
    .map(function (p) { return p.text || ""; }).join("");
  if (!text && finish === "MAX_TOKENS") {
    return { ok: false, status: 200, error: "Resposta vazia (MAX_TOKENS). Tente novamente." };
  }
  return { ok: true, text: text };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo nao permitido." });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY nao configurada." });

  const fallbackModel  = process.env.GEMINI_MODEL            || "gemini-2.5-flash";
  const modelResumo    = process.env.GEMINI_MODEL_RESUMO     || fallbackModel;
  const modelSequencia = process.env.GEMINI_MODEL_SEQUENCIA  || fallbackModel;
  const modelMapping   = process.env.GEMINI_MODEL_MAPPING    || fallbackModel;

  const {
    mode, empresa, setor, cargo, angulo, pain, touches, rawContext, contato,
    // Setup context — sent from App.jsx for mapping and resumo modes
    icp, produtos, companySite, assinatura,
  } = req.body || {};

  // ── Build seller context from setup data ───────────────────────────────────
  const vendedorEmpresa  = companySite || "minha empresa";
  const vendedorAssinatura = assinatura || "Consultor";
  const icpDesc = icp
    ? [
        icp.segmento   ? "Segmento-alvo: "   + icp.segmento   : "",
        icp.porte      ? "Porte: "            + icp.porte      : "",
        icp.faturamento? "Faturamento: "      + icp.faturamento: "",
        icp.regiao     ? "Região: "           + icp.regiao     : "",
        icp.cargos     ? "Cargos decisores: " + icp.cargos     : "",
        icp.observacoes? "Observações ICP: "  + icp.observacoes: "",
      ].filter(Boolean).join("\n")
    : "ICP não configurado — use bom senso para o setor da empresa.";
  const produtosDesc = (Array.isArray(produtos) && produtos.length)
    ? produtos.map(function(p, i) {
        return [
          (i+1) + ". " + (p.nome || "Produto"),
          p.descricao  ? "   Descrição: "  + p.descricao  : "",
          p.beneficios ? "   Benefícios: " + p.beneficios : "",
          p.publico    ? "   Público: "    + p.publico    : "",
          p.preco      ? "   Preço: "      + p.preco      : "",
        ].filter(Boolean).join("\n");
      }).join("\n\n")
    : "Produto não configurado — gere mensagens genéricas de discovery.";

  // ── MODO RESUMO ─────────────────────────────────────────────────────────────
  if (mode === "resumo") {
    const sysR = [
      `Você é um especialista sênior em ACCOUNT MAPPING e outbound B2B enterprise no Brasil.`,
      `Sua tarefa: transformar informações coletadas sobre uma empresa em um RESUMO DE CONTA acionável para um vendedor — o briefing que ele lê 5 minutos antes de uma call e já sabe como atacar.`,
      ``,
      `CONTEXTO DO VENDEDOR:`,
      `Empresa do vendedor: ${vendedorEmpresa}`,
      `Produtos/soluções:\n${produtosDesc}`,
      `ICP:\n${icpDesc}`,
      ``,
      `ESTRUTURA OBRIGATÓRIA (2 parágrafos curtos e densos, prosa fluida, sem bullets nem markdown):`,
      `Parágrafo 1: o que a empresa faz de fato, modelo de negócio, porte e momento (crescimento, expansão, M&A).`,
      `Parágrafo 2: por que os produtos do vendedor são relevantes para ESTA empresa — dor mais provável, ângulo de entrada mais forte, urgência.`,
      ``,
      `REGRAS:`,
      `- Português do Brasil, tom direto de quem entende de vendas enterprise.`,
      `- NUNCA invente números ou fatos. Trabalhe com o que dá para inferir do setor e porte.`,
      `- Sem URLs, sem markdown, sem frases genéricas.`,
    ].join("\n");

    const usrR = [
      "EMPRESA-ALVO: " + (empresa || "a empresa"),
      "SETOR: " + (setor || "tecnologia"),
      "",
      "INFORMAÇÕES COLETADAS:",
      (rawContext || "Sem dados adicionais.").slice(0, 5000),
      "",
      "Escreva o resumo agora, seguindo a estrutura de 2 parágrafos.",
    ].join("\n");

    const out = await callGemini(modelResumo, apiKey, sysR, usrR, 0.6, false);
    if (!out.ok) return res.status(502).json({ error: "Gemini erro: " + out.error });
    return res.status(200).json({ resumo: (out.text || "").trim() || null });
  }

  // ── MODO MAPEAMENTO COMPLETO ─────────────────────────────────────────────────
  if (mode === "mapeamento") {
    const sysMapa = [
      `Você é um especialista sênior em ACCOUNT MAPPING e outbound B2B enterprise no Brasil.`,
      `Sua tarefa: gerar inteligência de conta COMPLETA e personalizada para o vendedor abordar esta empresa com máxima precisão.`,
      ``,
      `CONTEXTO DO VENDEDOR:`,
      `Empresa do vendedor: ${vendedorEmpresa}`,
      ``,
      `PRODUTOS/SOLUÇÕES QUE O VENDEDOR OFERECE:`,
      produtosDesc,
      ``,
      `ICP DO VENDEDOR:`,
      icpDesc,
      ``,
      `REGRAS:`,
      `- Português do Brasil, tom de especialista em vendas enterprise. Direto e acionável.`,
      `- Tudo deve ser ESPECÍFICO para esta empresa-alvo e para os produtos do vendedor.`,
      `- NUNCA use placeholders, frases genéricas ou instruções como "preencha aqui".`,
      `- Baseie-se no contexto coletado e nos produtos/ICP do vendedor para personalizar cada campo.`,
      `- Assine mensagens como: "${vendedorAssinatura}"`,
    ].join("\n");

    const usrMapa = [
      `EMPRESA-ALVO: ${empresa || "a empresa"}`,
      `SETOR: ${setor || "tecnologia"}`,
      ``,
      `CONTEXTO COLETADO SOBRE A EMPRESA:`,
      (rawContext || "Sem dados adicionais — use o nome e setor para inferir.").slice(0, 4000),
      ``,
      `Gere um JSON completo com EXATAMENTE esta estrutura (sem campos extras, sem markdown):`,
      `{`,
      `  "fit": {`,
      `    "score": "ALTO" | "MÉDIO" | "BAIXO",`,
      `    "justificativa": "2-3 frases explicando por que esta empresa é (ou não) um bom fit para os produtos do vendedor"`,
      `  },`,
      `  "dores": {`,
      `    "principais": ["dor específica 1", "dor específica 2", "dor específica 3", "dor 4", "dor 5"]`,
      `  },`,
      `  "triggers": ["gatilho de compra 1", "gatilho 2", "gatilho 3", "gatilho 4"],`,
      `  "stakeholders": [`,
      `    { "cargo": "cargo real para esta empresa", "angulo": "ângulo de abordagem para este cargo", "prioridade": "PRIMARIO", "urgencia": "Alta", "email": "", "linkedin": "", "phone": "" },`,
      `    { "cargo": "...", "angulo": "...", "prioridade": "SECUNDARIO", "urgencia": "Média", "email": "", "linkedin": "", "phone": "" },`,
      `    { "cargo": "...", "angulo": "...", "prioridade": "TERCIARIO", "urgencia": "Baixa", "email": "", "linkedin": "", "phone": "" }`,
      `  ],`,
      `  "estrategia": {`,
      `    "emails": [`,
      `      { "assunto": "...", "corpo": "email completo personalizado para esta empresa" },`,
      `      { "assunto": "...", "corpo": "..." },`,
      `      { "assunto": "...", "corpo": "..." }`,
      `    ],`,
      `    "inmails": [`,
      `      { "assunto": "...", "corpo": "InMail curto para LinkedIn" },`,
      `      { "assunto": "...", "corpo": "..." }`,
      `    ],`,
      `    "whatsapps": ["mensagem WhatsApp curta e informal 1", "mensagem 2"],`,
      `    "cold_calls": ["script completo de cold call 1", "script 2"],`,
      `    "perguntas_spin": [`,
      `      "SITUAÇÃO: pergunta específica para ${empresa}",`,
      `      "SITUAÇÃO: ...",`,
      `      "PROBLEMA: pergunta sobre dor específica desta empresa",`,
      `      "PROBLEMA: ...",`,
      `      "IMPLICAÇÃO: pergunta sobre consequência da dor",`,
      `      "IMPLICAÇÃO: ...",`,
      `      "NECESSIDADE: pergunta que leva ao valor do produto",`,
      `      "NECESSIDADE: ..."`,
      `    ],`,
      `    "objeções": [`,
      `      { "objeção": "objeção comum neste setor", "resposta": "resposta específica usando os produtos do vendedor" },`,
      `      { "objeção": "...", "resposta": "..." },`,
      `      { "objeção": "...", "resposta": "..." }`,
      `    ]`,
      `  },`,
      `  "proximos_passos": {`,
      `    "ae": ["ação 1 para AE", "ação 2", "ação 3", "ação 4"],`,
      `    "bdr": ["ação 1 para BDR", "ação 2", "ação 3"],`,
      `    "prazo": "prazo e prioridade recomendados"`,
      `  }`,
      `}`,
    ].join("\n");

    const out = await callGemini(modelMapping, apiKey, sysMapa, usrMapa, 0.8, true);
    if (!out.ok) return res.status(502).json({ error: "Gemini erro: " + out.error });

    let parsed;
    try {
      parsed = JSON.parse((out.text || "").replace(/```json|```/g, "").trim());
    } catch (e) {
      return res.status(200).json({ error: "Falha ao interpretar resposta da IA." });
    }
    return res.status(200).json(parsed);
  }

  // ── MODO SEQUENCIA ───────────────────────────────────────────────────────────
  const cadencia = Array.isArray(touches) && touches.length
    ? touches
    : [
        { day: 1, type: "linkedin" }, { day: 3, type: "email" }, { day: 6, type: "call" },
        { day: 10, type: "email" }, { day: 15, type: "whatsapp" }, { day: 21, type: "breakup" },
      ];

  const systemPrompt = [
    `Você é um copywriter de outbound B2B brasileiro, especialista em mensagens que convertem para vendas enterprise.`,
    `Você representa: ${vendedorEmpresa}`,
    ``,
    `PRODUTOS/SOLUÇÕES:`,
    produtosDesc,
    ``,
    `ICP:`,
    icpDesc,
    ``,
    `REGRAS:`,
    `- Abra com um gancho que prenda em 1 linha. Use dados de mercado ou uma verdade incômoda do setor.`,
    `- Frases curtas. Ritmo. Português do Brasil, tom entre especialistas, nunca robótico.`,
    `- Cada touch DIFERENTE em ângulo e abertura. Zero repetição de fórmula.`,
    `- CTA leve e específico. Nunca genérico.`,
    `- Personalize de verdade com empresa, setor e cargo.`,
    `- Assine como "${vendedorAssinatura}" quando fizer sentido.`,
  ].join("\n");

  const userPrompt = [
    "Crie uma sequência de prospecção para:",
    "- Empresa: " + (empresa || "a empresa"),
    "- Setor: " + (setor || "tecnologia"),
    "- Cargo do decisor: " + (cargo || "Decisor"),
    contato ? "- Nome do contato: " + contato : "- Nome do contato: desconhecido (use [Nome])",
    "- Ângulo/responsabilidade: " + (angulo || "impacto no negócio"),
    "- Dor principal: " + (pain || "dor não especificada"),
    "",
    "Gere exatamente " + cadencia.length + " touches nesta cadência:",
    cadencia.map(function (t, i) { return (i + 1) + ") Dia " + t.day + " - canal: " + t.type; }).join("\n"),
    "",
    "Canais: email (com assunto), linkedin (InMail curto), call (script de cold call falado), whatsapp (curtíssimo, informal), breakup (última tentativa, com classe).",
    "",
    'Responda APENAS com JSON válido: {"touches":[{"day":1,"type":"linkedin","subject":"...","body":"..."}]}',
  ].join("\n");

  const out = await callGemini(modelSequencia, apiKey, systemPrompt, userPrompt, 1.0, true);
  if (!out.ok) return res.status(502).json({ error: "Gemini erro: " + out.error });

  let parsed;
  try {
    parsed = JSON.parse((out.text || "").replace(/```json|```/g, "").trim());
  } catch (e) {
    return res.status(200).json({ touches: null, message: "Falha ao interpretar resposta da IA." });
  }
  return res.status(200).json({ touches: (parsed && parsed.touches) || null });
}


const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

// ── Contexto por cliente ────────────────────────────────────────────────────
const CLIENT_CONTEXT = {
  elcanary: {
    especialidade: "segurança da informação, cibersegurança, privacidade de dados (LGPD) e compliance no Brasil",
    empresa:       "El Canary Privacy & Ethics",
    assinatura:    "Consultor | El Canary Privacy & Ethics",
    servicos:      "EC Governance (CISO as a Service, SGSI, KPIs de segurança, LGPD), EC Operations (Gestão de Vulnerabilidades, Pentest, Red Team, Segurança Microsoft 365), EC Ethics (DPO recorrente, Governança de IA, Adequação LGPD, Legal & Compliance). Parceiros: Snyk, Acronis, Cymulate.",
    angulo_resumo: "por que segurança da informação, LGPD e compliance são relevantes PARA ESTA empresa — volume de dados pessoais, regulação setorial, risco reputacional, sinais de imaturidade de segurança. Termine com qual serviço EC tem maior fit.",
    angulo_seq:    "Conhecido por mensagens que furam o bloqueio de CISOs, CTOs, CEOs e DPOs ocupados. Mencione a abordagem as-a-service (sem contratar CISO ou time interno) como diferencial. Mencione avaliação diagnóstica gratuita como porta de entrada.",
    decisores:     "CISOs, CTOs, CEOs, DPOs, CFOs e Tech Leads",
  },
  mgt: {
    especialidade: "gestão tributária, recuperação de impostos pagos a maior e redução de carga tributária no Brasil",
    empresa:       "MGT Gestão Tributária",
    assinatura:    "Consultor | MGT Gestão Tributária",
    servicos:      "Metodologia 3Rs: Reorganizar (revisão do regime tributário), Recuperar (tributos pagos a maior nos últimos 5 anos — PIS, COFINS, IRPJ, CSLL), Reduzir (estruturação do pagamento futuro). Avaliação gratuita do CNPJ em 5 dias. Já administramos mais de R$ 5 bilhões em créditos tributários.",
    angulo_resumo: "por que recuperação e gestão tributária são relevantes PARA ESTA empresa — carga tributária do setor, regime tributário (Lucro Real, Presumido, Simples), sinais de pagamento a maior, complexidade fiscal. Termine com a porta de entrada mais provável para os 3Rs.",
    angulo_seq:    "Conhecido por mensagens que furam o bloqueio de CFOs, CEOs e Diretores Financeiros ocupados. Mencione a avaliação gratuita do CNPJ em 5 dias como porta de entrada sem compromisso. Honorários só sobre o que recuperamos.",
    decisores:     "CEOs, CFOs, Contadores, Diretores Jurídicos e Controllers",
  },
  zendesk: {
    especialidade: "CX (Customer Experience), atendimento ao cliente omnichannel, CSAT e eficiência operacional de times de suporte no Brasil",
    empresa:       "Zendesk",
    assinatura:    "BDR/SDR | Zendesk",
    servicos:      "Zendesk Suite: Support (ticketing omnichannel), Messaging (chat e WhatsApp), Help Center com IA generativa, Explore (analytics e CSAT), Workforce Management, QA e automação de qualidade. Integrações nativas com Salesforce, HubSpot, SAP, TOTVS e mais de 1.500 apps.",
    angulo_resumo: "por que atendimento ao cliente, CSAT e eficiência de CX são relevantes PARA ESTA empresa — volume de tickets estimado, canais de atendimento, pressão de CSAT, sinais de atendimento fragmentado (reclamações públicas, canais desconectados). Termine com o ângulo de entrada mais forte (custo por ticket, CSAT, omnichannel ou self-service).",
    angulo_seq:    "Conhecido por mensagens que furam o bloqueio de Heads de CX, CEOs e Diretores de Ops ocupados. Use dados de benchmark do setor (custo por ticket, CSAT médio) como gancho. Mencione redução de 40% no custo por ticket e CSAT de 25 pontos como resultados típicos. CTA leve: diagnóstico de 20 minutos.",
    decisores:     "Heads de CX, CEOs, VPs de Ops, Heads de CS, CTOs e CFOs",
  },
};

function getCtx(clientId) {
  return CLIENT_CONTEXT[clientId] || CLIENT_CONTEXT.elcanary;
}

async function callGemini(model, apiKey, systemText, userText, temperature, jsonMode) {
  const body = {
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };
  if (jsonMode) body.generationConfig.responseMimeType = "application/json";

  const r = await fetch(BASE + model + ":generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = (data && data.error && data.error.message) || ("HTTP " + r.status);
    return { ok: false, status: r.status, error: msg };
  }
  const cand = data.candidates && data.candidates[0];
  const finish = cand && cand.finishReason;
  const text = ((cand && cand.content && cand.content.parts) || [])
    .map(function (p) { return p.text || ""; }).join("");
  if (!text && finish === "MAX_TOKENS") {
    return { ok: false, status: 200, error: "Resposta vazia (MAX_TOKENS). Tente novamente." };
  }
  return { ok: true, text: text };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo nao permitido." });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY nao configurada." });

  const clientId = process.env.VITE_CLIENT || "elcanary";
  const ctx = getCtx(clientId);

  const fallbackModel   = process.env.GEMINI_MODEL             || "gemini-2.5-flash";
  const modelResumo     = process.env.GEMINI_MODEL_RESUMO      || fallbackModel;
  const modelSequencia  = process.env.GEMINI_MODEL_SEQUENCIA   || fallbackModel;

  const { mode, empresa, setor, cargo, angulo, pain, touches, rawContext, contato } = req.body || {};

  // ── MODO RESUMO ─────────────────────────────────────────────────────────────
  if (mode === "resumo") {
    const sysR = [
      `Voce e um especialista senior em ACCOUNT MAPPING e outbound B2B enterprise, com profundo conhecimento do mercado de ${ctx.especialidade}.`,
      `Sua tarefa: transformar informacoes cruas sobre uma empresa em um RESUMO DE CONTA acionavel para um consultor da ${ctx.empresa} — o tipo de briefing que um AE le 5 minutos antes de uma call e ja sabe como atacar.`,
      "ESTRUTURA OBRIGATORIA (2 paragrafos curtos e densos, prosa fluida, sem bullets nem markdown):",
      "Paragrafo 1 (a empresa): o que ela faz de fato, modelo de negocio, porte e momento (crescimento, expansao, M&A), posicao no mercado.",
      `Paragrafo 2 (o angulo de venda): ${ctx.angulo_resumo}`,
      "REGRAS:",
      "- Portugues do Brasil, tom de quem entende do mercado e de vendas enterprise. Direto, sem enrolacao.",
      "- NUNCA invente numeros, nomes ou fatos. Trabalhe com o que da para inferir do setor e porte.",
      "- Nada de frases genericas. Cada frase precisa carregar informacao real ou insight de venda.",
      "- Sem URLs, sem markdown, sem aspas ao redor do texto.",
      "- Ignore noticias recentes, releases de RI e dados de eventos sazonais — foque no perfil institucional da empresa.",
    ].join("\n");

    const usrR = [
      "EMPRESA: " + (empresa || "a empresa"),
      "SETOR (classificado): " + (setor || "tecnologia"),
      "",
      "INFORMACOES COLETADAS (podem conter noticias e releases misturados — foque no perfil institucional, ignore noticias recentes):",
      (rawContext || "Sem dados adicionais.").slice(0, 5000),
      "",
      "Escreva o resumo de conta agora, seguindo a estrutura de 2 paragrafos. Responda apenas com o texto.",
    ].join("\n");

    const out = await callGemini(modelResumo, apiKey, sysR, usrR, 0.6, false);
    if (!out.ok) return res.status(502).json({ error: "Gemini erro: " + out.error });
    return res.status(200).json({ resumo: (out.text || "").trim() || null });
  }

  // ── MODO SEQUENCIA ───────────────────────────────────────────────────────────
  const cadencia = Array.isArray(touches) && touches.length
    ? touches
    : [
        { day: 1, type: "linkedin" }, { day: 3, type: "email" }, { day: 6, type: "call" },
        { day: 10, type: "email" }, { day: 15, type: "whatsapp" }, { day: 21, type: "breakup" },
      ];

  const systemPrompt = [
    `Voce e um copywriter de outbound B2B brasileiro, especializado em ${ctx.especialidade}. ${ctx.angulo_seq}`,
    `Voce representa a ${ctx.empresa}.`,
    `SERVICOS/SOLUCOES: ${ctx.servicos}`,
    "REGRAS DE OURO:",
    "- Abra com um gancho que prenda em 1 linha. Use dados de mercado, regulacao ou uma verdade incomoda do setor.",
    "- Frases curtas. Ritmo. Pode usar analogias surpreendentes.",
    "- Portugues do Brasil, tom de conversa entre especialistas, nunca robotico.",
    "- Cada touch DIFERENTE em angulo e abertura. Zero repeticao de formula.",
    `- CTA leve e especifico. Nunca generico.`,
    "- Personalize de verdade com empresa, setor e cargo informados.",
    `- Assine como '${ctx.assinatura}' quando fizer sentido.`,
  ].join("\n");

  const userPrompt = [
    "Crie uma sequencia de prospeccao para:",
    "- Empresa: " + (empresa || "a empresa"),
    "- Setor: " + (setor || "tecnologia"),
    "- Cargo do decisor: " + (cargo || "Decisor"),
    contato ? "- Nome do contato: " + contato : "- Nome do contato: desconhecido (use [Nome])",
    "- Angulo/responsabilidade: " + (angulo || "impacto no negocio"),
    "- Dor principal: " + (pain || "dor nao especificada"),
    "",
    "Gere exatamente " + cadencia.length + " touches nesta cadencia:",
    cadencia.map(function (t, i) { return (i + 1) + ") Dia " + t.day + " - canal: " + t.type; }).join("\n"),
    "",
    "Canais: email (com assunto), linkedin (InMail curto), call (script de cold call falado), whatsapp (curtissimo, informal), breakup (ultima tentativa, classe).",
    "",
    "Responda APENAS com JSON valido:",
    '{"touches":[{"day":1,"type":"linkedin","subject":"...","body":"..."}]}',
    "Para call e whatsapp, subject pode ser um rotulo curto.",
  ].join("\n");

  const out = await callGemini(modelSequencia, apiKey, systemPrompt, userPrompt, 1.0, true);
  if (!out.ok) return res.status(502).json({ error: "Gemini erro: " + out.error });

  let parsed;
  try {
    parsed = JSON.parse((out.text || "").replace(/```json|```/g, "").trim());
  } catch (e) {
    return res.status(200).json({ touches: null, message: "Falha ao interpretar resposta da IA." });
  }
  return res.status(200).json({ touches: (parsed && parsed.touches) || null });
}
