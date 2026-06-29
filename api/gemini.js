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

      // Clean English noise and CSV junk from context
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
        `CONTEXTO (pode estar em inglês — sua resposta deve ser SEMPRE em português):`,
        (rawContext || "Sem dados.").slice(0, 3500),
        ``,
        `INSTRUÇÕES DE QUALIDADE:`,
        `- "dores": seja específico ao setor e porte desta empresa. Não use dores genéricas como "falta de tempo" ou "custos altos". Explore dores operacionais, tecnológicas, de pessoas, regulatórias e competitivas reais do setor.`,
        `- "triggers": eventos concretos que sinalizam janela de compra — ex: rodada de investimento, nova regulação, expansão geográfica, troca de liderança, IPO, fusão, abertura de vagas técnicas.`,
        `- "perguntas_spin": use SPIN real — Situação para mapear o contexto atual, Problema para revelar a dor latente, Implicação para expandir a consequência da dor no negócio/pessoas/resultado, Necessidade para fazer o prospect articular o valor. Cada pergunta deve ser específica para esta empresa e setor.`,
        `- "proximos_passos": ações concretas e sequenciadas — com o que pesquisar, quem abordar primeiro e como.`,
        `- "emails" e "cold_calls": personalizados para esta empresa específica. Mencione o setor, porte ou contexto dela. Nunca use [placeholder] — use o nome da empresa diretamente.`,
        ``,
        `JSON de resposta:`,
        `{`,
        `  "resumo": "2 parágrafos sobre o que a empresa faz e seu momento de mercado — NÃO mencione o vendedor",`,
        `  "fit": { "score": "ALTO|MÉDIO|BAIXO", "justificativa": "3 frases específicas explicando o fit com os produtos do vendedor" },`,
        `  "dores": { "principais": ["dor operacional específica 1","dor tecnológica específica 2","dor de pessoas/org 3","dor regulatória ou competitiva 4","dor estratégica 5"] },`,
        `  "triggers": ["evento concreto que abre janela de compra 1","trigger 2","trigger 3","trigger 4 — ex: nova regulação, expansão, M&A, IPO, vagas abertas"],`,
        `  "stakeholders": [`,
        `    {"cargo":"cargo decisor primário para este setor","angulo":"ângulo de abordagem específico para este cargo e empresa","prioridade":"PRIMARIO","urgencia":"Alta","email":"","linkedin":"","phone":""},`,
        `    {"cargo":"cargo secundário","angulo":"ângulo diferente do primário","prioridade":"SECUNDARIO","urgencia":"Média","email":"","linkedin":"","phone":""},`,
        `    {"cargo":"influenciador técnico ou operacional","angulo":"ângulo técnico/operacional","prioridade":"TERCIARIO","urgencia":"Baixa","email":"","linkedin":"","phone":""}`,
        `  ],`,
        `  "estrategia": {`,
        `    "emails": [`,
        `      {"assunto":"assunto específico que menciona algo da empresa ou setor","corpo":"email de 80-100 palavras personalizado para ${empresa}, com referência ao contexto da empresa, dor específica e CTA leve"},`,
        `      {"assunto":"ângulo diferente do 1o email","corpo":"follow-up com outro ângulo — prova social, dado de mercado ou pergunta de discovery"},`,
        `      {"assunto":"último email — direto e com classe","corpo":"breakup com gancho de urgência e porta aberta"}`,
        `    ],`,
        `    "inmails": [`,
        `      {"assunto":"InMail direto para o cargo decisor de ${empresa}","corpo":"40-60 palavras max. Gancho específico, pergunta de problema, CTA para resposta"},`,
        `      {"assunto":"ângulo alternativo","corpo":"abordagem diferente — dados, tendência do setor ou referência a concorrente"}`,
        `    ],`,
        `    "whatsapps": ["mensagem curtíssima e informal — máx 2 frases, com nome da empresa e pergunta direta","segunda opção com ângulo diferente"],`,
        `    "cold_calls": [`,
        `      "script completo de cold call para ${empresa}: abertura de 10 segundos, pergunta de qualificação, ponte para a solução, CTA para reunião. Use o nome da empresa e cargo do decisor.",`,
        `      "script alternativo — com referência a um trigger de compra ou dado do setor"`,
        `    ],`,
        `    "perguntas_spin": [`,
        `      "SITUAÇÃO: pergunta concreta sobre como ${empresa} opera hoje em relação à dor principal",`,
        `      "SITUAÇÃO: pergunta sobre estrutura, processo ou tecnologia atual da ${empresa}",`,
        `      "PROBLEMA: pergunta que revela a dor principal de forma não óbvia",`,
        `      "PROBLEMA: pergunta que expõe limitação ou risco específico do setor",`,
        `      "IMPLICAÇÃO: qual o impacto desta dor no resultado financeiro ou operacional da ${empresa}?",`,
        `      "IMPLICAÇÃO: como esta limitação afeta a equipe, os clientes ou a posição competitiva?",`,
        `      "NECESSIDADE: se isso fosse resolvido, qual seria o impacto nos resultados da ${empresa}?",`,
        `      "NECESSIDADE: o que mudaria na operação se vocês tivessem [benefício do produto]?"`,
        `    ],`,
        `    "objecoes": [`,
        `      {"objecao":"objeção mais comum neste setor — específica, não genérica","resposta":"resposta que usa diferencial do produto e dado concreto"},`,
        `      {"objecao":"segunda objeção provável para este perfil de empresa","resposta":"resposta com case ou lógica de ROI"},`,
        `      {"objecao":"objeção de timing ou prioridade","resposta":"resposta que cria urgência sem pressionar"}`,
        `    ]`,
        `  },`,
        `  "proximos_passos": {`,
        `    "ae": ["pesquisar no LinkedIn os decisores de ${empresa} pelos cargos mapeados","verificar vagas abertas em ${empresa} — sinal de momento e prioridade","buscar notícias recentes de ${empresa} — M&A, expansão, novos produtos","preparar diagnóstico personalizado com dados do setor"],`,
        `    "bdr": ["cold call para o decisor primário com script de abertura de 10s","InMail no LinkedIn com ângulo de dor específica","sequência de 3 emails em 10 dias com ângulos diferentes","monitorar ${empresa} no Google Alerts e LinkedIn"],`,
        `    "prazo": "Prioridade ${setor === "Financeiro / Fintech" ? "ALTA" : "MÉDIA"} — abordar em até 48h se houver trigger recente, senão em 7 dias."`,
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

    const contactFirstName = contato ? contato.split(" ")[0] : null;

    const system = [
      `Você é um copywriter de outbound B2B brasileiro especialista em mensagens que convertem em reuniões.`,
      `Você representa: ${vendedorEmpresa}`,
      ``,
      sellerCtx,
      ``,
      `REGRAS DE OURO:`,
      `- Todo conteúdo em Português do Brasil. NUNCA em inglês.`,
      `- NUNCA use [Nome], [Empresa], [Cargo] ou qualquer placeholder. Use os nomes reais fornecidos.`,
      contactFirstName ? `- O nome do decisor é ${contactFirstName}. Use-o nas mensagens.` : `- Nome do decisor desconhecido — NÃO use [Nome]. Inicie de outra forma (ex: "Oi", "Olá", "Tudo bem?").`,
      `- Cada touch tem ângulo, abertura e gancho COMPLETAMENTE diferentes. Zero repetição de fórmula.`,
      `- Emails: 60-100 palavras. Abra com provocação, dado de mercado ou insight do setor. CTA específico e leve.`,
      `- LinkedIn InMail: 40-60 palavras. Direto. Sem longas introduções. Termine com pergunta ou CTA curto.`,
      `- WhatsApp: máx 2 frases. Tom informal. Pergunta direta no final.`,
      `- Cold call: script falado real com abertura impactante de 10s, pausa, pergunta de qualificação, ponte e CTA para reunião de 20 min.`,
      `- Breakup: com classe e leveza. Deixe porta aberta. Pode usar humor sutil. Nunca ressentido.`,
      `- Mencione ${empresa} e contexto do setor nas mensagens para mostrar que não é mensagem genérica.`,
      `- RESPONDA APENAS COM O JSON. NENHUM TEXTO ANTES OU DEPOIS.`,
    ].join("\n");

    const user = [
      `INSTRUÇÃO: Responda SOMENTE com JSON válido. Nenhum texto fora do JSON. Nenhum placeholder.`,
      ``,
      `Sequência de prospecção para:`,
      `- Empresa-alvo: ${empresa || "a empresa"}`,
      `- Setor: ${setor || "tecnologia"}`,
      `- Cargo do decisor: ${cargo || "Decisor"}`,
      contactFirstName ? `- Nome: ${contato}` : `- Nome: desconhecido`,
      `- Ângulo: ${angulo || "impacto no negócio"}`,
      `- Dor principal: ${pain || "dor a ser descoberta"}`,
      ``,
      `Cadência (${cadencia.length} touches — cada um com abordagem criativa e diferente):`,
      cadencia.map((t, i) => `${i + 1}) Dia ${t.day} — ${t.type}`).join("\n"),
      ``,
      `{"touches":[{"day":1,"type":"linkedin","subject":"assunto","body":"mensagem completa aqui"},...]}`,
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
