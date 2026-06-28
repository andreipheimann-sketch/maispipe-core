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
    icp, produtos, companySite, assinatura, dna,
  } = req.body || {};

  // ── Build seller context — DNA (Claude-generated) takes priority ───────────
  const vendedorEmpresa    = (dna && dna.empresa && dna.empresa.nome) || companySite || "minha empresa";
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
    ...(dna.gatilhos_de_compra || []).map((g,i) => `${i+1}. ${g}`),
    ``,
    `OBJEÇÕES COMUNS:`,
    ...(dna.objecoes_e_respostas || []).map(o => `- "${o.objecao}" → ${o.resposta}`),
  ].join("\n") : "";

  const icpDesc = dna?.icp_refinado
    ? [
        dna.icp_refinado.segmento ? `Segmento: ${dna.icp_refinado.segmento}` : "",
        dna.icp_refinado.porte    ? `Porte: ${dna.icp_refinado.porte}`       : "",
        dna.icp_refinado.regiao   ? `Região: ${dna.icp_refinado.regiao}`     : "",
        (dna.icp_refinado.cargos_primarios||[]).length
          ? `Cargos: ${dna.icp_refinado.cargos_primarios.join(", ")}` : "",
      ].filter(Boolean).join("\n")
    : icp ? [
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
        (dna.empresa.diferenciais||[]).length ? `Diferenciais: ${dna.empresa.diferenciais.join(", ")}` : "",
      ].filter(Boolean).join("\n")
    : Array.isArray(produtos) && produtos.length
    ? produtos.map((p,i) => [
        `${i+1}. ${p.nome||"Produto"}`,
        p.descricao  ? `   O que é: ${p.descricao}`   : "",
        p.beneficios ? `   Benefícios: ${p.beneficios}` : "",
        p.publico    ? `   Público: ${p.publico}`       : "",
      ].filter(Boolean).join("\n")).join("\n\n")
    : "NENHUM PRODUTO CADASTRADO — faça perguntas abertas de discovery.";

  // ── MODO RESUMO ─────────────────────────────────────────────────────────────
  if (mode === "resumo") {
    const sysR = [
      `Você é um especialista sênior em ACCOUNT MAPPING e outbound B2B enterprise no Brasil.`,
      `Sua tarefa: transformar informações coletadas sobre uma empresa em um RESUMO DE CONTA acionável para um vendedor — o briefing que ele lê 5 minutos antes de uma call e já sabe como atacar.`,
      ``,
      `CONTEXTO DO VENDEDOR:`,
      dnaContext || `Empresa do vendedor: ${vendedorEmpresa}\nProdutos/soluções:\n${produtosPrompt}\nICP:\n${icpDesc}`,
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
      dnaContext || `Empresa do vendedor: ${vendedorEmpresa}\nProdutos/soluções:\n${produtosPrompt}\nICP:\n${icpDesc}`,
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
    dnaContext || `PRODUTOS/SOLUÇÕES:\n${produtosPrompt}\n\nICP:\n${icpDesc}`,
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
