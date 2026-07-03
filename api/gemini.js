// api/gemini.js — Vercel serverless
// Groq (Llama 3.3 70B)  → resumo + mapeamento   (GROQ_API_KEY)
// Gemini 2.0 Flash       → sequências            (GEMINI_API_KEY)

// ── Transport: Groq ────────────────────────────────────────────────────────────
async function callGroq(apiKey, systemText, userText, maxTokens) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      max_tokens: maxTokens || 4096,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemText },
        { role: "user",   content: userText   },
      ],
    }),
  });
  const data = await r.json();
  if (!r.ok) return { ok: false, status: r.status, error: data?.error?.message || ("HTTP " + r.status) };
  const text = ((data.choices || [])[0]?.message?.content || "").trim();
  if (!text) return { ok: false, status: 200, error: "Resposta vazia (Groq)." };
  return { ok: true, text };
}

// ── Transport: Gemini (v1beta) ─────────────────────────────────────────────────
// Confirmed available via ModelService.ListModels on this account:
//   gemini-2.5-flash, gemini-2.0-flash, gemini-2.0-flash-lite (v1beta + v1)
// v1beta chosen because it supports system_instruction natively.
async function callGemini(apiKey, systemText, userText, maxTokens) {
  const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

  // Models confirmed available on this account (from gemini-test diagnostic)
  const MODELS = [
    "gemini-2.5-flash",      // best quality, confirmed available
    "gemini-2.0-flash",      // fallback 1, confirmed available
    "gemini-2.0-flash-lite", // fallback 2, confirmed available, lightest
  ];

  async function tryModel(model) {
    const url = `${BASE}/${model}:generateContent?key=${apiKey}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemText }] },
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: { maxOutputTokens: maxTokens || 8192, temperature: 0.85 },
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      const msg  = data?.error?.message || ("HTTP " + r.status);
      const code = data?.error?.status  || "";
      // Only retry on quota exhaustion — NOT on model not found (that means wrong name)
      const retry = r.status === 429 || code === "RESOURCE_EXHAUSTED";
      return { ok: false, retry, error: `[${model}] ${msg}` };
    }
    const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    if (!text) return { ok: false, retry: false, error: `[${model}] Resposta vazia (${data?.candidates?.[0]?.finishReason || "?"})` };
    return { ok: true, text };
  }

  let lastError = "";
  for (const model of MODELS) {
    const r = await tryModel(model);
    if (r.ok) return r;
    lastError = r.error;
    if (!r.retry) break; // hard error — stop immediately
  }
  return { ok: false, error: lastError };
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

    // ── MODO SEQUÊNCIA ─────────────────────────────────────────────────────────
    const cadencia = Array.isArray(touches) && touches.length ? touches : [
      { day:1, type:"linkedin" }, { day:3,  type:"email"    },
      { day:6, type:"call"     }, { day:10, type:"email"    },
      { day:15,type:"whatsapp" }, { day:21, type:"breakup"  },
    ];

    const nomeUsar      = contato ? contato.split(" ")[0] : null;
    const doraPrincipal = pain || "desafio central do setor";

    // Per-channel writing instructions (no § or [...] markers in instructions)
    const SPECS = {
      email: {
        label: "E-MAIL",
        min: "mínimo 200 palavras, 3 parágrafos",
        guide: `Parágrafo 1: Situação — dado de mercado ou observação sobre ${empresa || "a empresa"}, mostre que entende o contexto, nomeie a dor.\nParágrafo 2: Implicação — consequência concreta da dor (receita, reputação, time, competitividade).\nParágrafo 3: Necessidade e CTA — visão do possível, CTA leve, assine com nome e empresa.`,
      },
      linkedin: {
        label: "LINKEDIN INMAIL",
        min: "mínimo 150 palavras, 2 parágrafos",
        guide: `Parágrafo 1: Gancho com observação específica sobre ${empresa || "a empresa"} e dor implícita do cargo. Tom de colega de setor.\nParágrafo 2: Implicação expandida e CTA direto mas não agressivo.`,
      },
      call: {
        label: "COLD CALL SCRIPT",
        min: "mínimo 150 palavras, script completo para leitura em voz alta",
        guide: `Abertura (10s): apresente-se e faça uma pergunta de permissão surpreendente.\nContexto: 2-3 frases que demonstram pesquisa real sobre o setor.\nPergunta cirúrgica: toque na dor sem revelar a solução.\nPausa e escuta.\nImplicação: expanda as consequências.\nCTA: proponha 20 minutos ou envio de diagnóstico.`,
      },
      whatsapp: {
        label: "WHATSAPP",
        min: "4 a 5 frases curtas, tom casual mas com substância",
        guide: `Frase 1: observação sobre ${empresa || "a empresa"} que prova pesquisa real.\nFrase 2: dor do cargo de forma indireta.\nFrase 3: resultado que outros no setor alcançaram.\nFrase 4-5: pergunta direta de engajamento.`,
      },
      breakup: {
        label: "BREAKUP",
        min: "mínimo 120 palavras",
        guide: `Reconheça que não é o momento, com classe. Deixe um insight valioso que eles guardarão. Abra a porta para contato futuro de forma elegante.`,
      },
      follow: {
        label: "FOLLOW-UP",
        min: "mínimo 120 palavras, 2 parágrafos",
        guide: `Parágrafo 1: referência ao contato anterior e novo ângulo ou dado de mercado.\nParágrafo 2: implicação aprofundada e CTA com leve urgência.`,
      },
    };

    const ANGLES = [
      "impacto operacional — o que está quebrando no dia a dia",
      "risco estratégico — o que pode dar errado nos próximos 6 meses",
      "vantagem competitiva — o que concorrentes já estão fazendo",
      "custo oculto — o que a ineficiência está custando em receita",
      "timing — por que agora é o momento certo para agir",
      "prova social — o que outros líderes do setor já resolveram",
    ];

    function buildSys(spec, angle) {
      return [
        `Você é o maior especialista em outbound B2B do Brasil, combinando SPIN Selling (Neil Rackham) e copywriting de resposta direta.`,
        ``,
        `Você representa: ${vendedorEmpresa}`,
        sellerCtx,
        ``,
        `REGRAS ABSOLUTAS:`,
        `- Escreva em Português do Brasil. Nunca em inglês.`,
        `- Nunca use placeholders como [Nome] ou [Empresa]. Use os dados reais fornecidos.`,
        `- Nunca use travessão (— ou –). Use vírgula ou ponto.`,
        `- Nunca comece com saudação genérica. Comece com gancho de impacto.`,
        `- Responda SOMENTE com JSON válido. Nenhum texto antes ou depois.`,
        ``,
        `CANAL: ${spec.label} — ${spec.min}`,
        `ÂNGULO DESTE TOUCH: ${angle}`,
        ``,
        `COMO ESCREVER:`,
        spec.guide,
      ].join("\n");
    }

    function buildUsr(touch, i, spec, angle) {
      return [
        `Empresa-alvo: ${empresa || "a empresa"} | Setor: ${setor || "tecnologia"} | Cargo: ${cargo || "C-Level"} | Dia: ${touch.day}`,
        nomeUsar ? `Contato: ${nomeUsar}` : `Nome: não informado`,
        `Dor central: ${doraPrincipal}`,
        ``,
        `Retorne APENAS este JSON, com o body completo (${spec.min}):`,
        `{"day":${touch.day},"type":"${touch.type}","subject":"assunto específico e criativo","body":"texto completo aqui, use \\n\\n entre parágrafos"}`,
      ].join("\n");
    }

    function parseResult(text, touch) {
      const clean = text.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```$/i,"").trim();
      // Direct parse
      try { const p = JSON.parse(clean); if (p && p.body) return p; } catch(_) {}
      // Extract from surrounding text
      const m = clean.match(/\{[^{}]*"body"\s*:\s*"([\s\S]+?)"\s*\}/);
      if (m) {
        try { return JSON.parse(m[0]); } catch(_) {}
      }
      // Manual field extraction for truncated JSON
      const bodyM = clean.match(/"body"\s*:\s*"([\s\S]{20,})/);
      if (bodyM) {
        const bodyRaw = bodyM[1].replace(/"?\s*\}?\s*$/, "").replace(/\\n/g, "\n");
        const subjectM = clean.match(/"subject"\s*:\s*"([^"]{5,})"/);
        return {
          day:     touch.day,
          type:    touch.type,
          subject: subjectM ? subjectM[1] : "",
          body:    bodyRaw,
        };
      }
      // Return raw text as body rather than empty
      return { day: touch.day, type: touch.type, subject: "", body: clean.length > 20 ? clean : "" };
    }

    function normalise(p, touch) {
      return {
        day:     p.day     || touch.day,
        type:    p.type    || touch.type,
        subject: (p.subject || "").replace(/\s*[—–]\s*/g, ", ").trim(),
        body:    (p.body   || "").replace(/\s*[—–]\s*/g, ", ").replace(/\n{3,}/g, "\n\n").trim(),
      };
    }

    const touchResults = [];

    // ── Build the seller context ONCE (shared across all touches) ────────────
    const sharedSys = [
      `Especialista em outbound B2B no Brasil. SPIN Selling + copywriting de resposta direta.`,
      `Representa: ${vendedorEmpresa}`,
      (dna && dna.empresa && dna.empresa.descricao) ? `Produto: ${dna.empresa.descricao}` : (Array.isArray(produtos) && produtos[0]) ? `Produto: ${produtos[0].nome} — ${produtos[0].descricao||""}` : "",
      (dna && dna.icp_refinado && dna.icp_refinado.segmento) ? `ICP: ${dna.icp_refinado.segmento}, ${dna.icp_refinado.porte||""}` : "",
      ``,
      `REGRAS: Português do Brasil. Sem placeholders. Sem travessão. Sem saudação genérica. Responda SOMENTE com JSON.`,
    ].filter(Boolean).join("\n");

    // ── Run sequentially — avoids Groq rate limit (6k tokens/min free tier) ─
    for (let i = 0; i < cadencia.length; i++) {
      const touch = cadencia[i];
      const spec  = SPECS[touch.type] || SPECS.email;
      const angle = ANGLES[i % ANGLES.length];

      const sys = sharedSys;

      const usr = [
        `Touch ${i+1}/${cadencia.length} — Canal: ${spec.label} (${spec.min})`,
        `Empresa: ${empresa||"a empresa"} | Setor: ${setor||"tecnologia"} | Cargo: ${cargo||"C-Level"} | Dia ${touch.day}`,
        nomeUsar ? `Contato: ${nomeUsar}` : null,
        `Dor: ${doraPrincipal} | Ângulo: ${angle}`,
        ``,
        `Como escrever:`,
        spec.guide,
        ``,
        `JSON de saída:`,
        `{"day":${touch.day},"type":"${touch.type}","subject":"assunto criativo","body":"mensagem completa com \\n\\n entre parágrafos"}`,
      ].filter(Boolean).join("\n");

      let result = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));
        try {
          const out = await callGroq(groqKey, sys, usr, 3000);
          if (!out.ok) {
            if (out.error && (out.error.includes("429") || out.error.includes("rate"))) continue; // retry
            break; // non-retryable error
          }
          if (!out.text || out.text.length < 10) continue;

          // Parse: try JSON first, then manual extraction
          let p = null;
          const clean = out.text.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/,"").trim();
          try { p = JSON.parse(clean); } catch(_) {
            const m = clean.match(/\{[\s\S]+\}/);
            if (m) { try { p = JSON.parse(m[0]); } catch(_) {} }
            if (!p) {
              // Extract body directly even from truncated JSON
              const bm = clean.match(/"body"\s*:\s*"([\s\S]{30,})/);
              if (bm) {
                const bodyRaw = bm[1].replace(/"?\s*\}?\s*$/, "").replace(/\\n/g, "\n").trim();
                const sm = clean.match(/"subject"\s*:\s*"([^"]+)"/);
                p = { day: touch.day, type: touch.type, subject: sm?sm[1]:"", body: bodyRaw };
              }
            }
          }

          if (p && p.body && p.body.length > 30) {
            result = {
              day:     p.day     || touch.day,
              type:    p.type    || touch.type,
              subject: (p.subject || "").replace(/\s*[—–]\s*/g, ", ").trim(),
              body:    (p.body   || "").replace(/\s*[—–]\s*/g, ", ").replace(/\n{3,}/g, "\n\n").trim(),
            };
            break; // success
          }
        } catch(_) { /* timeout/network — retry */ }
      }

      touchResults.push(result || { day: touch.day, type: touch.type, subject: "", body: "" });
      // Small gap between touches to stay under rate limit
      if (i < cadencia.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    return res.status(200).json({ touches: touchResults });

  } catch (e) {
    return res.status(200).json({ error: "Erro interno: " + e.message });
  }
}
