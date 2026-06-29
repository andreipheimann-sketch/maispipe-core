// api/gemini.js — Vercel serverless
// Powered by Claude (Anthropic) — resumo, mapeamento e sequencias de prospeccao.
// Variavel de ambiente necessaria: ANTHROPIC_API_KEY

async function callClaude(apiKey, systemText, userText, maxTokens, jsonMode) {
  const messages = [{ role: "user", content: userText }];

  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens || 4096,
    messages,
  };
  if (systemText) body.system = systemText;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const data = await r.json();
  if (!r.ok) {
    const msg = (data && data.error && data.error.message) || ("HTTP " + r.status);
    return { ok: false, status: r.status, error: msg };
  }

  const text = (data.content || []).map(b => b.text || "").join("").trim();
  if (!text) return { ok: false, status: 200, error: "Resposta vazia da IA." };
  return { ok: true, text };
}

function parseJSON(raw) {
  const clean = (raw || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(clean);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo nao permitido." });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY nao configurada." });

  try {
    const {
      mode, empresa, setor, cargo, angulo, pain, touches, rawContext, contato,
      icp, produtos, companySite, assinatura, dna,
    } = req.body || {};

    // ── Seller context — DNA takes priority ─────────────────────────────────
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
          (dna.empresa.diferenciais || []).length ? `Diferenciais: ${dna.empresa.diferenciais.join(", ")}` : "",
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

    // ── MODO RESUMO ────────────────────────────────────────────────────────────
    if (mode === "resumo") {
      const system = [
        `Você é um especialista sênior em ACCOUNT MAPPING e outbound B2B enterprise no Brasil.`,
        `Sua tarefa: escrever um RESUMO DE CONTA em Português do Brasil — o briefing que um vendedor lê 5 minutos antes de uma call.`,
        ``,
        `REGRA ABSOLUTA DE IDIOMA: Escreva SEMPRE em Português do Brasil, independentemente do idioma das informações coletadas. Se as fontes estiverem em inglês, traduza e reescreva em português.`,
        ``,
        `CONTEXTO DO VENDEDOR:`,
        sellerCtx,
        ``,
        `ESTRUTURA (2 parágrafos curtos e densos, prosa fluida, sem bullets, sem markdown, SEM inglês):`,
        `Parágrafo 1: o que a empresa faz de fato, modelo de negócio, porte e momento atual.`,
        `Parágrafo 2: por que os produtos do vendedor são relevantes — dor mais provável, ângulo de entrada, urgência.`,
        ``,
        `OUTRAS REGRAS:`,
        `- Tom direto, de especialista em vendas enterprise.`,
        `- NUNCA invente números ou fatos.`,
        `- Sem URLs, sem markdown, sem frases genéricas.`,
        `- Ignore dados claramente irrelevantes (CSV, endereços, códigos internos).`,
      ].join("\n");

      // Strip obvious junk from rawContext before sending
      const cleanCtx = (rawContext || "")
        .split("\n")
        .filter(function(line) {
          if ((line.match(/;/g) || []).length > 2) return false; // CSV rows
          if (/trk=|utm_|cnpj|cep|\d{5}-\d{3}/i.test(line)) return false;
          if ((line.match(/[A-Z]{3,}/g) || []).length > 6) return false; // raw data
          return line.trim().length > 10;
        })
        .join("\n")
        .slice(0, 4000);

      const user = [
        `INSTRUÇÃO CRÍTICA: Responda EXCLUSIVAMENTE em Português do Brasil. Não escreva nenhuma palavra em inglês.`,
        ``,
        `EMPRESA-ALVO: ${empresa || "a empresa"}`,
        `SETOR: ${setor || "tecnologia"}`,
        ``,
        `INFORMAÇÕES COLETADAS (pode estar em inglês — seu resumo deve ser em português):`,
        cleanCtx || "Sem dados adicionais.",
        ``,
        `Escreva agora o resumo em Português do Brasil, 2 parágrafos, sem markdown, sem inglês.`,
      ].join("\n");

      const out = await callClaude(apiKey, system, user, 1024, false);
      if (!out.ok) return res.status(502).json({ error: "Claude erro: " + out.error });
      return res.status(200).json({ resumo: out.text || null });
    }

    // ── MODO MAPEAMENTO ────────────────────────────────────────────────────────
    if (mode === "mapeamento") {
      const system = [
        `Você é um especialista sênior em ACCOUNT MAPPING e outbound B2B enterprise no Brasil.`,
        `Gere inteligência de conta COMPLETA e personalizada para o vendedor abordar esta empresa.`,
        ``,
        `CONTEXTO DO VENDEDOR:`,
        sellerCtx,
        ``,
        `REGRAS ABSOLUTAS:`,
        `- Responda APENAS com JSON válido, sem markdown, sem texto antes ou depois.`,
        `- IDIOMA: todo o conteúdo do JSON deve estar em Português do Brasil. Não use inglês em nenhum campo.`,
        `- Tudo específico para esta empresa. NUNCA use placeholders ou frases genéricas.`,
        `- Assine mensagens como: "${vendedorAssinatura}"`,
      ].join("\n");

      const user = [
        `EMPRESA-ALVO: ${empresa || "a empresa"}`,
        `SETOR: ${setor || "tecnologia"}`,
        ``,
        `CONTEXTO COLETADO:`,
        (rawContext || "Sem dados — infira pelo nome e setor.").slice(0, 4000),
        ``,
        `Responda com este JSON exato (sem campos extras):`,
        `{`,
        `  "fit": { "score": "ALTO|MÉDIO|BAIXO", "justificativa": "2-3 frases específicas" },`,
        `  "dores": { "principais": ["dor 1","dor 2","dor 3","dor 4","dor 5"] },`,
        `  "triggers": ["gatilho 1","gatilho 2","gatilho 3","gatilho 4"],`,
        `  "stakeholders": [`,
        `    {"cargo":"cargo real","angulo":"ângulo específico","prioridade":"PRIMARIO","urgencia":"Alta","email":"","linkedin":"","phone":""},`,
        `    {"cargo":"...","angulo":"...","prioridade":"SECUNDARIO","urgencia":"Média","email":"","linkedin":"","phone":""},`,
        `    {"cargo":"...","angulo":"...","prioridade":"TERCIARIO","urgencia":"Baixa","email":"","linkedin":"","phone":""}`,
        `  ],`,
        `  "estrategia": {`,
        `    "emails": [{"assunto":"...","corpo":"email completo"},{"assunto":"...","corpo":"..."},{"assunto":"...","corpo":"..."}],`,
        `    "inmails": [{"assunto":"...","corpo":"InMail curto LinkedIn"},{"assunto":"...","corpo":"..."}],`,
        `    "whatsapps": ["msg WhatsApp informal 1","msg 2"],`,
        `    "cold_calls": ["script cold call completo 1","script 2"],`,
        `    "perguntas_spin": [`,
        `      "SITUAÇÃO: pergunta sobre contexto atual de ${empresa}",`,
        `      "SITUAÇÃO: segunda pergunta de situação",`,
        `      "PROBLEMA: pergunta que revela a dor principal",`,
        `      "PROBLEMA: segunda pergunta de problema",`,
        `      "IMPLICAÇÃO: pergunta sobre consequência da dor no negócio",`,
        `      "IMPLICAÇÃO: segunda pergunta de implicação",`,
        `      "NECESSIDADE: pergunta que leva ao valor da solução",`,
        `      "NECESSIDADE: segunda pergunta de necessidade"`,
        `    ],`,
        `    "objecoes": [`,
        `      {"objecao":"objeção comum neste setor","resposta":"resposta usando diferenciais do produto"},`,
        `      {"objecao":"...","resposta":"..."},`,
        `      {"objecao":"...","resposta":"..."}`,
        `    ]`,
        `  },`,
        `  "proximos_passos": {`,
        `    "ae": ["ação AE 1","ação 2","ação 3","ação 4"],`,
        `    "bdr": ["ação BDR 1","ação 2","ação 3"],`,
        `    "prazo": "prazo e prioridade recomendados"`,
        `  }`,
        `}`,
      ].join("\n");

      const out = await callClaude(apiKey, system, user, 4096, false);
      if (!out.ok) return res.status(502).json({ error: "Claude erro: " + out.error });

      let parsed;
      try { parsed = parseJSON(out.text); }
      catch (e) { return res.status(200).json({ error: "Falha ao interpretar resposta da IA.", raw: out.text.slice(0, 300) }); }
      return res.status(200).json(parsed);
    }

    // ── MODO SEQUÊNCIA ─────────────────────────────────────────────────────────
    const cadencia = Array.isArray(touches) && touches.length ? touches : [
      { day: 1, type: "linkedin" }, { day: 3, type: "email"    }, { day: 6,  type: "call"    },
      { day: 10, type: "email"   }, { day: 15, type: "whatsapp"}, { day: 21, type: "breakup" },
    ];

    const system = [
      `Você é um copywriter de outbound B2B brasileiro, especialista em mensagens que convertem para vendas enterprise.`,
      `Você representa: ${vendedorEmpresa}`,
      ``,
      sellerCtx,
      ``,
      `REGRAS:`,
      `- Abra cada touch com um gancho que prenda em 1 linha.`,
      `- Frases curtas, ritmo. Português do Brasil, tom entre especialistas, nunca robótico.`,
      `- Cada touch com ângulo e abertura DIFERENTES. Zero repetição de fórmula.`,
      `- CTA leve e específico. Nunca genérico.`,
      `- Personalize com empresa, setor e cargo.`,
      `- Assine como "${vendedorAssinatura}" quando fizer sentido.`,
      `- Responda APENAS com JSON válido, sem markdown.`,
    ].join("\n");

    const user = [
      `Crie uma sequência de prospecção:`,
      `- Empresa: ${empresa || "a empresa"}`,
      `- Setor: ${setor || "tecnologia"}`,
      `- Cargo do decisor: ${cargo || "Decisor"}`,
      contato ? `- Nome do contato: ${contato}` : `- Nome do contato: use [Nome]`,
      `- Ângulo: ${angulo || "impacto no negócio"}`,
      `- Dor principal: ${pain || "não especificada"}`,
      ``,
      `Cadência (${cadencia.length} touches):`,
      cadencia.map((t, i) => `${i + 1}) Dia ${t.day} — canal: ${t.type}`).join("\n"),
      ``,
      `Canais: email (com assunto), linkedin (InMail curto), call (script falado), whatsapp (curtíssimo, informal), breakup (última tentativa, com classe).`,
      ``,
      `Responda APENAS com: {"touches":[{"day":1,"type":"linkedin","subject":"...","body":"..."}]}`,
    ].join("\n");

    const out = await callClaude(apiKey, system, user, 4096, false);
    if (!out.ok) return res.status(502).json({ error: "Claude erro: " + out.error });

    let parsed;
    try { parsed = parseJSON(out.text); }
    catch (e) { return res.status(200).json({ touches: null, message: "Falha ao interpretar resposta." }); }
    return res.status(200).json({ touches: (parsed && parsed.touches) || null });

  } catch (e) {
    return res.status(200).json({ error: "Erro interno: " + e.message });
  }
}
