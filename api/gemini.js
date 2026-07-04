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

// ── Transport: Gemini (v1beta + JSON mode) ────────────────────────────────────
// Uses responseMimeType:"application/json" — eliminates markdown wrapping and parse failures.
// Models confirmed on this account: gemini-2.5-flash, gemini-2.0-flash, gemini-2.0-flash-lite
async function callGemini(apiKey, systemText, userText, maxTokens, jsonMode) {
  const BASE   = "https://generativelanguage.googleapis.com/v1beta/models";
  const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"];

  for (const model of MODELS) {
    const url = `${BASE}/${model}:generateContent?key=${apiKey}`;
    let r, data;
    try {
      r    = await fetch(url, {
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
      continue; // network error — try next model
    }

    if (!r.ok) {
      const retry = r.status === 429 || data?.error?.status === "RESOURCE_EXHAUSTED";
      if (!retry) return { ok: false, error: `[${model}] ${data?.error?.message || "HTTP "+r.status}` };
      continue; // quota — try next model
    }

    const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    if (!text) continue;
    return { ok: true, text };
  }
  return { ok: false, error: "Todos os modelos Gemini falharam." };
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

    const seqUsr = [
      `Crie uma sequência de prospecção B2B para:`,
      `- Empresa-alvo: ${empresa || "a empresa"}`,
      `- Setor: ${setor || "tecnologia"}`,
      `- Cargo do decisor: ${cargo || "C-Level / Diretor"}`,
      nomeUsar ? `- Nome do contato: ${nomeUsar}` : null,
      `- Dor central: ${doraPrincipal}`,
      ``,
      `Gere ${cadencia.length} touches com os seguintes canais e ângulos:`,
      touchList.map((t, i) => `${i+1}. Dia ${t.day} — ${t.type.toUpperCase()} — Ângulo: ${t.angle}\n   Guia: ${t.guide}`).join("\n"),
      ``,
      `Retorne um JSON com este schema exato:`,
      `{`,
      `  "touches": [`,
      `    { "day": 1, "type": "linkedin", "subject": "assunto aqui", "body": "mensagem completa aqui" },`,
      `    ...`,
      `  ]`,
      `}`,
      ``,
      `Cada body deve seguir o guia do canal. Use \\n\\n para separar parágrafos.`,
      `Não inclua texto fora do JSON.`,
    ].filter(Boolean).join("\n");

    const out = await callGemini(geminiKey, seqSys, seqUsr, 8192, true); // true = JSON mode

    // If Gemini fails (quota/billing), fall back to Groq with a simpler prompt
    if (!out.ok) {
      if (!groqKey) return res.status(200).json({ touches: null, error: "Gemini indisponível e GROQ_API_KEY não configurada." });

      const groqSys = seqSys;
      // Simpler user prompt for Groq — ask for one touch at a time joined in array
      const groqUsr = seqUsr + "\n\nIMPORTANTE: Responda SOMENTE com JSON válido. Não use aspas duplas dentro dos valores — use aspas simples se necessário.";
      const groqOut = await callGroq(groqKey, groqSys, groqUsr, 8000);
      if (!groqOut.ok) {
        return res.status(200).json({ touches: null, error: "Gemini e Groq indisponíveis. Tente novamente em alguns minutos." });
      }
      // Parse Groq response (may have markdown fences)
      let groqParsed;
      const groqClean = groqOut.text.replace(/^```json\s*/i,"").replace(/^```\s*/i,"").replace(/```\s*$/i,"").trim();
      try { groqParsed = JSON.parse(groqClean); } catch (_) {
        const m = groqClean.match(/\{[\s\S]+\}/);
        try { groqParsed = m ? JSON.parse(m[0]) : null; } catch (_) { groqParsed = null; }
      }
      const groqTouches = groqParsed?.touches;
      if (!groqTouches?.length) return res.status(200).json({ touches: null, error: "Gemini indisponível (quota). " + out.error });
      return res.status(200).json({
        touches: groqTouches.map((t, i) => ({
          day:     t.day     || cadencia[i]?.day  || i + 1,
          type:    t.type    || cadencia[i]?.type || "email",
          subject: (t.subject || "").replace(/\s*[—–]\s*/g, ", ").trim(),
          body:    (t.body   || "").replace(/\s*[—–]\s*/g, ", ").replace(/\n{3,}/g, "\n\n").trim(),
        }))
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(out.text);
    } catch (_) {
      const m = out.text.match(/\{[\s\S]+\}/);
      try { parsed = m ? JSON.parse(m[0]) : null; } catch (_) { parsed = null; }
    }

    const rawTouches = parsed?.touches || [];
    if (!rawTouches.length) {
      return res.status(200).json({ touches: null, error: "Gemini retornou sequência vazia." });
    }

    const finalTouches = rawTouches.map((t, i) => ({
      day:     t.day     || cadencia[i]?.day  || i + 1,
      type:    t.type    || cadencia[i]?.type || "email",
      subject: (t.subject || "").replace(/\s*[—–]\s*/g, ", ").trim(),
      body:    (t.body   || "").replace(/\s*[—–]\s*/g, ", ").replace(/\n{3,}/g, "\n\n").trim(),
    }));

    return res.status(200).json({ touches: finalTouches });
  } catch (e) {
    return res.status(200).json({ error: "Erro interno: " + e.message });
  }
}