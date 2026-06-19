// api/gemini.js — Vercel serverless
// Geracao de sequencias de prospeccao e resumo de conta via Google Gemini.
// Variavel de ambiente necessaria: GEMINI_API_KEY

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
  const text =
    ((cand && cand.content && cand.content.parts) || [])
      .map(function (p) { return p.text || ""; })
      .join("");
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

  const fallbackModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const modelResumo = process.env.GEMINI_MODEL_RESUMO || fallbackModel;
  const modelSequencia = process.env.GEMINI_MODEL_SEQUENCIA || fallbackModel;
  const { mode, empresa, setor, cargo, angulo, pain, touches, rawContext, contato } = req.body || {};

  // ── MODO RESUMO ────────────────────────────────────────────────────────────
  if (mode === "resumo") {
    const sysR = [
      "Voce e um especialista senior em ACCOUNT MAPPING e outbound B2B enterprise, com profundo conhecimento do mercado de seguranca da informacao, ciberseguranca, privacidade de dados e compliance no Brasil.",
      "Sua tarefa: transformar informacoes cruas sobre uma empresa em um RESUMO DE CONTA acionavel para um consultor da El Canary — o tipo de briefing que um AE le 5 minutos antes de uma call e ja sabe como atacar.",
      "ESTRUTURA OBRIGATORIA (2 paragrafos curtos e densos, prosa fluida, sem bullets nem markdown):",
      "Paragrafo 1 (a empresa): o que ela faz de fato, modelo de negocio, porte e momento, posicao no mercado e maturidade tecnologica aparente.",
      "Paragrafo 2 (o angulo de venda security/privacy): por que seguranca da informacao, LGPD e compliance sao relevantes PARA ESTA empresa especificamente — volume de dados pessoais, regulacao setorial, risco reputacional, sinais de imaturidade de seguranca, exposicao a ataques. Termine com o gancho comercial: qual servico da El Canary (Governance, Operations ou Ethics) tem maior fit e por que.",
      "REGRAS:",
      "- Portugues do Brasil, tom de quem entende de seguranca e de vendas enterprise. Direto.",
      "- NUNCA invente numeros ou fatos. Trabalhe com o que da para inferir do setor e porte.",
      "- Nada de frases genericas. Cada frase precisa carregar informacao real ou insight de venda.",
      "- Sem URLs, sem markdown, sem aspas ao redor do texto.",
    ].join("\n");
    const usrR = [
      "EMPRESA: " + (empresa || "a empresa"),
      "SETOR (classificado): " + (setor || "tecnologia"),
      "",
      "INFORMACOES CRUAS COLETADAS:",
      (rawContext || "Sem dados adicionais.").slice(0, 5000),
      "",
      "Escreva o resumo de conta agora, seguindo a estrutura de 2 paragrafos. Responda apenas com o texto.",
    ].join("\n");
    const out = await callGemini(modelResumo, apiKey, sysR, usrR, 0.6, false);
    if (!out.ok) return res.status(502).json({ error: "Gemini erro: " + out.error });
    return res.status(200).json({ resumo: (out.text || "").trim() || null });
  }

  // ── MODO SEQUENCIA ─────────────────────────────────────────────────────────
  const cadencia = Array.isArray(touches) && touches.length
    ? touches
    : [
        { day: 1, type: "linkedin" }, { day: 3, type: "email" }, { day: 6, type: "call" },
        { day: 10, type: "email" }, { day: 15, type: "whatsapp" }, { day: 21, type: "breakup" },
      ];

  const systemPrompt = [
    "Voce e um copywriter de outbound B2B brasileiro, especializado em seguranca da informacao, ciberseguranca, privacidade de dados (LGPD) e compliance. Conhecido por mensagens que furam o bloqueio de CISOs, CTOs, CEOs e DPOs ocupados.",
    "Seu estilo: tecnicamente credivel, direto, sem sensacionalismo — mas com ganchos inteligentes que geram urgencia real. Voce soa como um CISO que tambem sabe vender.",
    "Voce representa a El Canary Privacy & Ethics, escritório as-a-service de CISOs, auditores, analistas e advogados especializados em Seguranca da Informacao, ciberseguranca e privacidade.",
    "SERVICOS EL CANARY: EC Governance (CISO as a Service, SGSI, KPIs de seguranca, LGPD), EC Operations (Gestao de Vulnerabilidades, Pentest, Red Team, Seguranca Microsoft 365), EC Ethics (DPO recorrente, Governanca de IA, Adequacao LGPD, Legal & Compliance).",
    "PARCEIROS TECNOLOGICOS: Snyk (seguranca no codigo), Acronis (backup e recuperacao), Microsoft 365 Security, Cymulate (simulacao de ataques).",
    "REGRAS DE OURO:",
    "- Abra com um gancho baseado em risco real, dado de mercado, regulacao ou vulnerabilidade do setor. Nada de cliche de seguranca.",
    "- Frases curtas. Ritmo. Pode usar analogias tecnicas surpreendentes.",
    "- Portugues do Brasil, tom de conversa entre especialistas, nunca robotico.",
    "- Cada touch DIFERENTE em angulo e abertura. Zero repeticao.",
    "- CTA especifico (ex: 'posso te mostrar um diagnostico de seguranca do perfil da {empresa} em 20 minutos?').",
    "- Personalize com empresa, setor e cargo.",
    "- Mencione a abordagem as-a-service (sem contratar CISO ou time interno) como diferencial.",
  ].join("\n");

  const userPrompt = [
    "Crie uma sequencia de prospeccao para:",
    "- Empresa: " + (empresa || "a empresa"),
    "- Setor: " + (setor || "tecnologia"),
    "- Cargo do decisor: " + (cargo || "Decisor"),
    contato ? "- Nome do contato: " + contato : "- Nome do contato: desconhecido (use [Nome])",
    "- Angulo/responsabilidade: " + (angulo || "risco e seguranca"),
    "- Dor principal: " + (pain || "exposicao a risco cibernetico e falta de maturidade em seguranca"),
    "",
    "Gere exatamente " + cadencia.length + " touches nesta cadencia:",
    cadencia.map(function (t, i) { return (i + 1) + ") Dia " + t.day + " - canal: " + t.type; }).join("\n"),
    "",
    "Canais: email (com assunto), linkedin (InMail curto), call (script falado), whatsapp (curtissimo, informal), breakup (ultima tentativa, classe).",
    "",
    "Responda APENAS com JSON valido:",
    '{"touches":[{"day":1,"type":"linkedin","subject":"...","body":"..."}]}',
    "Assine como 'Consultor | El Canary Privacy & Ethics' quando fizer sentido.",
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
