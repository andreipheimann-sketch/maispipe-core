// api/gemini.js — Vercel serverless
// Powered by Groq (Llama 3.3 70B) — resumo, mapeamento e sequencias.
// Variavel de ambiente necessaria: GROQ_API_KEY

async function callGroq(apiKey, systemText, userText, maxTokens, forceJson) {
  const body = {
    model: "llama-3.3-70b-versatile",
    max_tokens: maxTokens || 4096,
    temperature: 0.7,
    messages: [
      { role: "system", content: systemText },
      { role: "user",   content: userText   },
    ],
  };
  if (forceJson) body.response_format = { type: "json_object" };

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": "Bearer " + apiKey,
    },
    body: JSON.stringify(body),
  });

  const data = await r.json();
  if (!r.ok) {
    const msg = (data && data.error && data.error.message) || ("HTTP " + r.status);
    return { ok: false, status: r.status, error: msg };
  }

  const text = ((data.choices || [])[0]?.message?.content || "").trim();
  if (!text) return { ok: false, status: 200, error: "Resposta vazia da IA." };
  return { ok: true, text };
}

function parseJSON(raw) {
  const clean = (raw || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i,    "")
    .replace(/```\s*$/i,    "")
    .trim();
  return JSON.parse(clean);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Metodo nao permitido." });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GROQ_API_KEY nao configurada." });

  try {
    const {
      mode, empresa, setor, cargo, angulo, pain, touches, rawContext, contato,
      icp, produtos, companySite, assinatura, dna,
    } = req.body || {};

    // ── Seller context — DNA takes priority ───────────────────────────────────
    const vendedorEmpresa    = (dna?.empresa?.nome) || companySite || "minha empresa";
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
        `Você é um especialista em account mapping e outbound B2B enterprise no Brasil.`,
        `REGRA ABSOLUTA: Escreva SEMPRE em Português do Brasil. Nunca em inglês.`,
        ``,
        `CONTEXTO DO VENDEDOR:`,
        sellerCtx,
        ``,
        `Sua tarefa: escrever um resumo de conta em 2 parágrafos curtos e diretos (sem markdown, sem bullets):`,
        `Parágrafo 1: o que a empresa-alvo faz, modelo de negócio, porte e momento atual.`,
        `Parágrafo 2: por que os produtos do vendedor são relevantes — dor provável, ângulo de entrada, urgência.`,
      ].join("\n");

      // Clean English noise from context
      const cleanCtx = (rawContext || "")
        .split("\n")
        .filter(l => l.trim().length > 20 && !(/;.*;/.test(l)) && !(/trk=|utm_|cnpj/i.test(l)))
        .join("\n")
        .slice(0, 3000);

      const user = [
        `INSTRUÇÃO: Responda EXCLUSIVAMENTE em Português do Brasil.`,
        ``,
        `EMPRESA-ALVO: ${empresa || "a empresa"}`,
        `SETOR: ${setor || "tecnologia"}`,
        ``,
        `CONTEXTO COLETADO (pode estar em inglês — escreva o resumo em português):`,
        cleanCtx || "Sem dados adicionais.",
        ``,
        `Escreva o resumo agora em Português do Brasil. Apenas texto corrido, 2 parágrafos.`,
      ].join("\n");

      const out = await callGroq(apiKey, system, user, 1024, false);
      if (!out.ok) return res.status(502).json({ error: "Groq erro: " + out.error });
      return res.status(200).json({ resumo: out.text || null });
    }

    // ── MODO MAPEAMENTO ───────────────────────────────────────────────────────
    if (mode === "mapeamento") {
      const system = [
        `Você é um especialista em account mapping e outbound B2B enterprise no Brasil.`,
        `REGRA ABSOLUTA: Responda APENAS com JSON válido. Todo conteúdo em Português do Brasil. Sem markdown.`,
        ``,
        `CONTEXTO DO VENDEDOR:`,
        sellerCtx,
      ].join("\n");

      const user = [
        `INSTRUÇÃO: Responda SOMENTE com o JSON abaixo. Nenhum texto antes ou depois. Tudo em Português do Brasil.`,
        ``,
        `EMPRESA-ALVO: ${empresa || "a empresa"}`,
        `SETOR: ${setor || "tecnologia"}`,
        ``,
        `CONTEXTO (pode estar em inglês — sua resposta deve ser em português):`,
        (rawContext || "Sem dados.").slice(0, 3500),
        ``,
        `JSON de resposta:`,
        `{`,
        `  "resumo": "2 parágrafos em português sobre a empresa e relevância para o vendedor",`,
        `  "fit": { "score": "ALTO|MÉDIO|BAIXO", "justificativa": "2-3 frases em português" },`,
        `  "dores": { "principais": ["dor 1","dor 2","dor 3","dor 4","dor 5"] },`,
        `  "triggers": ["gatilho 1","gatilho 2","gatilho 3","gatilho 4"],`,
        `  "stakeholders": [`,
        `    {"cargo":"cargo","angulo":"ângulo","prioridade":"PRIMARIO","urgencia":"Alta","email":"","linkedin":"","phone":""},`,
        `    {"cargo":"cargo","angulo":"ângulo","prioridade":"SECUNDARIO","urgencia":"Média","email":"","linkedin":"","phone":""},`,
        `    {"cargo":"cargo","angulo":"ângulo","prioridade":"TERCIARIO","urgencia":"Baixa","email":"","linkedin":"","phone":""}`,
        `  ],`,
        `  "estrategia": {`,
        `    "emails": [{"assunto":"...","corpo":"email completo em português"},{"assunto":"...","corpo":"..."},{"assunto":"...","corpo":"..."}],`,
        `    "inmails": [{"assunto":"...","corpo":"InMail LinkedIn em português"},{"assunto":"...","corpo":"..."}],`,
        `    "whatsapps": ["msg whatsapp 1","msg 2"],`,
        `    "cold_calls": ["script cold call completo em português 1","script 2"],`,
        `    "perguntas_spin": [`,
        `      "SITUAÇÃO: pergunta 1","SITUAÇÃO: pergunta 2",`,
        `      "PROBLEMA: pergunta 1","PROBLEMA: pergunta 2",`,
        `      "IMPLICAÇÃO: pergunta 1","IMPLICAÇÃO: pergunta 2",`,
        `      "NECESSIDADE: pergunta 1","NECESSIDADE: pergunta 2"`,
        `    ],`,
        `    "objecoes": [`,
        `      {"objecao":"...","resposta":"..."},{"objecao":"...","resposta":"..."},{"objecao":"...","resposta":"..."}`,
        `    ]`,
        `  },`,
        `  "proximos_passos": {`,
        `    "ae": ["ação 1","ação 2","ação 3"],`,
        `    "bdr": ["ação 1","ação 2","ação 3"],`,
        `    "prazo": "prazo recomendado"`,
        `  }`,
        `}`,
      ].join("\n");

      const out = await callGroq(apiKey, system, user, 4096, true);
      if (!out.ok) return res.status(502).json({ error: "Groq erro: " + out.error });

      let parsed;
      try { parsed = parseJSON(out.text); }
      catch (e) {
        // Try extracting JSON object if wrapped in text
        try {
          const m = out.text.match(/\{[\s\S]+\}/);
          if (m) parsed = JSON.parse(m[0]);
          else throw e;
        } catch (e2) {
          return res.status(200).json({ error: "Falha ao interpretar resposta.", raw: out.text.slice(0, 200) });
        }
      }
      return res.status(200).json(parsed);
    }

    // ── MODO SEQUÊNCIA ────────────────────────────────────────────────────────
    const cadencia = Array.isArray(touches) && touches.length ? touches : [
      { day:1,  type:"linkedin" }, { day:3,  type:"email"    },
      { day:6,  type:"call"     }, { day:10, type:"email"    },
      { day:15, type:"whatsapp" }, { day:21, type:"breakup"  },
    ];

    const system = [
      `Você é um copywriter de outbound B2B brasileiro especialista em mensagens que convertem.`,
      `Você representa: ${vendedorEmpresa}`,
      ``,
      sellerCtx,
      ``,
      `REGRAS:`,
      `- Todo conteúdo em Português do Brasil. Nunca em inglês.`,
      `- Cada touch com ângulo e abertura diferentes. Zero repetição.`,
      `- Tom direto, entre especialistas, nunca robótico.`,
      `- CTA leve e específico.`,
      `- Assine como "${vendedorAssinatura}" quando fizer sentido.`,
      `- RESPONDA APENAS COM O JSON. NENHUM TEXTO ANTES OU DEPOIS.`,
    ].join("\n");

    const user = [
      `INSTRUÇÃO: Responda SOMENTE com JSON válido. Nada mais.`,
      ``,
      `Crie sequência de prospecção:`,
      `- Empresa: ${empresa || "a empresa"}`,
      `- Setor: ${setor || "tecnologia"}`,
      `- Cargo: ${cargo || "Decisor"}`,
      contato ? `- Contato: ${contato}` : `- Contato: use [Nome]`,
      `- Ângulo: ${angulo || "impacto no negócio"}`,
      `- Dor: ${pain || "não especificada"}`,
      ``,
      `Cadência (${cadencia.length} touches):`,
      cadencia.map((t, i) => `${i + 1}) Dia ${t.day} — ${t.type}`).join("\n"),
      ``,
      `Canais: email (com assunto), linkedin (InMail curto), call (script falado), whatsapp (curtíssimo), breakup (com classe).`,
      ``,
      `{"touches":[{"day":1,"type":"linkedin","subject":"...","body":"..."},...]}`,
    ].join("\n");

    const out = await callGroq(apiKey, system, user, 4096, true);
    if (!out.ok) return res.status(502).json({ error: "Groq erro: " + out.error });

    let parsed;
    try { parsed = parseJSON(out.text); }
    catch (e) {
      try {
        const m = out.text.match(/\{[\s\S]*"touches"[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
        else throw e;
      } catch (e2) {
        return res.status(200).json({ touches: null, message: "Falha ao interpretar: " + e.message, raw: out.text.slice(0, 200) });
      }
    }
    return res.status(200).json({ touches: (parsed && parsed.touches) || null });

  } catch (e) {
    return res.status(200).json({ error: "Erro interno: " + e.message });
  }
}
