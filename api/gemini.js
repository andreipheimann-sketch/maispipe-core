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

// ── Transport: Gemini (v1beta + system_instruction) ───────────────────────────
// v1beta is the CORRECT endpoint for system_instruction + gemini-2.0-flash.
// The /v1 endpoint rejects system_instruction (field unknown).
// The /v1beta endpoint rejects -8b and -latest suffixes — use bare model names.
async function callGemini(apiKey, systemText, userText, maxTokens) {
  const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

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
      const retry = r.status === 429 || code === "RESOURCE_EXHAUSTED";
      return { ok: false, retry, error: `[${model}] ${msg}` };
    }
    const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    if (!text) return { ok: false, retry: false, error: `[${model}] Resposta vazia (${data?.candidates?.[0]?.finishReason || "?"})` };
    return { ok: true, text };
  }

  // Only models confirmed to exist on v1beta with generateContent support
  // Bare names only — no -latest, no -8b, no version suffix
  const models = ["gemini-2.0-flash", "gemini-1.5-flash"];
  let lastError = "";
  for (const model of models) {
    const r = await tryModel(model);
    if (r.ok) return r;
    lastError = r.error;
    if (!r.retry) break; // NOT_FOUND or hard error — no point retrying
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

    // ── MODO SEQUÊNCIA ────────────────────────────────────────────────────────
    const cadencia = Array.isArray(touches) && touches.length ? touches : [
      { day:1,  type:"linkedin" }, { day:3,  type:"email"    },
      { day:6,  type:"call"     }, { day:10, type:"email"    },
      { day:15, type:"whatsapp" }, { day:21, type:"breakup"  },
    ];

    const contactFirstName = contato ? contato.split(" ")[0] : null;
    const nomeUsar         = contactFirstName || null;
    const doraPrincipal    = pain || "desafio central do setor";
    const anguloUsar       = angulo || "impacto nos resultados";

    const seqSystem = [
      `Você é o maior especialista em outbound B2B do Brasil. Você une as técnicas de SPIN Selling (Neil Rackham), copywriting de resposta direta e neurociência da persuasão para criar sequências que geram reuniões com decisores que nunca responderam antes.`,
      ``,
      `Você representa: ${vendedorEmpresa}`,
      sellerCtx,
      ``,
      `PRINCÍPIOS INVIOLÁVEIS DE CADA MENSAGEM:`,
      ``,
      `1. ABERTURA DE IMPACTO (primeiras 2 linhas decidem tudo):`,
      `   Nunca inicie com "Olá", "Espero que esteja bem" ou apresentação. Comece com:`,
      `   - Um dado de mercado surpreendente sobre o setor de ${setor || "tecnologia"}`,
      `   - Uma observação específica sobre ${empresa} que demonstra pesquisa real`,
      `   - Uma pergunta que incomoda positivamente (faz o leitor pensar "como ele sabe isso?")`,
      `   - Uma afirmação contraintuitiva sobre o mercado deles`,
      ``,
      `2. ESTRUTURA SPIN EM CADA MENSAGEM:`,
      `   S (Situação): estabeleça o contexto atual deles em 1-2 frases — mostre que você entende o ambiente`,
      `   P (Problema): nomeie a dor latente que eles provavelmente não verbalizaram ainda`,
      `   I (Implicação): expanda a consequência — o que acontece se isso não for resolvido nos próximos 6 meses?`,
      `   N (Necessidade): plante a visão do estado futuro desejado sem vender explicitamente`,
      ``,
      `3. TOM E PERSONA:`,
      `   Tom: colega sênior do setor, não vendedor. Alguém que já resolveu esse problema antes.`,
      `   Use linguagem do setor. Mencione pressões reais que o cargo ${cargo || "decisor"} enfrenta.`,
      `   Humor quando cabível: ironia inteligente, não piada forçada.`,
      ``,
      `4. CTA CIRÚRGICO:`,
      `   Nunca "vamos marcar uma reunião". Use: "faz sentido conversar 20 minutos sobre isso?",`,
      `   "posso te mandar um diagnóstico rápido?", "tenho 2 perguntas que podem mudar essa conversa."`,
      ``,
      `REGRAS ABSOLUTAS:`,
      `- Português do Brasil perfeito. Nunca inglês.`,
      `- ZERO placeholders. Nem [Nome], nem [Empresa]. Use os dados reais.`,
      `- Sem travessão (— ou –). Use vírgula ou ponto.`,
      nomeUsar ? `- O nome do contato é ${nomeUsar}. Use naturalmente, não roboticamente.` : `- Nome desconhecido. Comece com gancho, não com "Olá".`,
      `- Cada touch é um ângulo COMPLETAMENTE diferente. 6 razões diferentes para responder.`,
      `- RESPONDA APENAS COM O JSON. ZERO texto fora do JSON.`,
    ].join("\n");

    const seqUser = [
      `Crie uma sequência de ${cadencia.length} toques para:`,
      ``,
      `EMPRESA-ALVO: ${empresa || "a empresa"} | SETOR: ${setor || "tecnologia"}`,
      `CARGO DO DECISOR: ${cargo || "C-Level / Diretor"}`,
      nomeUsar ? `NOME: ${contato}` : `NOME: desconhecido`,
      `ÂNGULO PRINCIPAL: ${anguloUsar}`,
      `DOR CENTRAL: ${doraPrincipal}`,
      ``,
      `ESPECIFICAÇÕES POR CANAL (sem exceção):`,
      ``,
      `EMAIL (mín. 200 palavras, 3 parágrafos obrigatórios):`,
      `  § 1 — SITUAÇÃO + PROBLEMA: abra com observação específica sobre ${empresa} ou setor. Mostre que entende o contexto. Nomeie a dor sem perguntar.`,
      `  § 2 — IMPLICAÇÃO: expanda a consequência da dor. O que está em jogo? Receita, reputação, time, vantagem competitiva? Seja concreto.`,
      `  § 3 — NECESSIDADE + CTA: plante a visão do que é possível. CTA leve, específico, de baixo comprometimento. Assine com nome + empresa.`,
      ``,
      `LINKEDIN INMAIL (mín. 150 palavras, 2 parágrafos):`,
      `  § 1 — Gancho SPIN com observação sobre ${empresa} + dor implícita do cargo. Tom: colega de setor.`,
      `  § 2 — Implicação + CTA direto mas não agressivo. Mostre que você fez a lição de casa.`,
      ``,
      `COLD CALL (script falado, mín. 150 palavras):`,
      `  [Abertura] 10s: por que ligou + pergunta de permissão surpreendente (não "tudo bem?")`,
      `  [Situação] 2-3 frases sobre o contexto do setor que demonstram pesquisa`,
      `  [Problema] Pergunta cirúrgica que toca na dor sem expor a solução`,
      `  [Pausa estratégica]: "...e aí, isso ressoa com o que vocês estão vivendo?"`,
      `  [Implicação]: expandir se positivo, ou sinalizar urgência se neutro`,
      `  [CTA]: reunião de 20 min ou envio de diagnóstico`,
      ``,
      `WHATSAPP (mín. 4 frases, tom informal mas com substância):`,
      `  Linha 1: observação sobre ${empresa} que prova pesquisa real (sem "vi seu perfil no LinkedIn")`,
      `  Linha 2: dor específica do cargo nomeada de forma indireta`,
      `  Linha 3: resultado que outros no setor conseguiram (sem nome, se preferir)`,
      `  Linha 4: pergunta simples de engajamento`,
      ``,
      `BREAKUP (mín. 120 palavras, tom de quem respeita o tempo do outro):`,
      `  Reconheça que não é o momento. Mas deixe um insight final valioso — algo que eles vão guardar mesmo sem responder.`,
      `  Porta aberta explícita. Sem ressentimento. Pode usar leve ironia se o tom permitir.`,
      ``,
      `CADÊNCIA:`,
      cadencia.map((t, i) => `  Touch ${i + 1}: Dia ${t.day} — ${t.type}`).join("\n"),
      ``,
      `FORMATO DE SAÍDA (JSON puro, sem nenhum texto antes ou depois):`,
      `{"touches":[{"day":1,"type":"linkedin","subject":"assunto que gera curiosidade genuína","body":"mensagem completa aqui — mín 150 palavras"},...]}`,
    ].join("\n");

    // ── Sequência usa Gemini exclusivamente ───────────────────────────────────
    if (!geminiKey) return res.status(500).json({ error: "GEMINI_API_KEY nao configurada no Vercel." });

    // Pre-flight: validate the key is working before running the heavy prompt
    // Uses the lightweight models list endpoint — fast, no token cost
    try {
      const pingUrl = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${geminiKey}`;
      const pingRes = await fetch(pingUrl);
      if (!pingRes.ok) {
        const pingData = await pingRes.json().catch(() => ({}));
        const pingMsg  = pingData?.error?.message || ("HTTP " + pingRes.status);
        return res.status(200).json({
          touches: null,
          error: `GEMINI_API_KEY inválida ou sem acesso à API: ${pingMsg}. Verifique a chave no painel Vercel e certifique-se de que a Gemini API está ativada em console.cloud.google.com.`,
        });
      }
    } catch (pingErr) {
      return res.status(200).json({
        touches: null,
        error: `Não foi possível alcançar a API do Gemini: ${pingErr.message}. Verifique conectividade ou a chave GEMINI_API_KEY.`,
      });
    }

    const out = await callGemini(geminiKey, seqSystem, seqUser, 14000);
    if (!out.ok) return res.status(502).json({ error: "Gemini erro (sequencia): " + out.error });

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

    // Strip dashes from all touch fields
    const touchesOut = Array.isArray(parsed?.touches)
      ? parsed.touches.map(t => ({
          ...t,
          subject: (t.subject || "").replace(/\s*[—–]\s*/g, ", "),
          body:    (t.body    || "").replace(/\s*[—–]\s*/g, ", "),
        }))
      : null;

    return res.status(200).json({ touches: touchesOut });

  } catch (e) {
    return res.status(200).json({ error: "Erro interno: " + e.message });
  }
}
