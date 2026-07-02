// api/gemini.js — Vercel serverless
// Powered by Google Gemini 2.0 Flash — resumo, mapeamento e sequencias.
// Variavel de ambiente necessaria: GEMINI_API_KEY

// ── Transport layer ────────────────────────────────────────────────────────────
// Model name reference (v1beta endpoint):
//   gemini-2.0-flash          → stable alias, 15 RPM free
//   gemini-1.5-flash-latest   → fallback when 2.0 quota exceeded
//   gemini-1.5-pro-latest     → highest quality, lower RPM

async function callGemini(apiKey, systemText, userText, maxTokens, forceJson, modelOverride) {
  const model = modelOverride || "gemini-2.0-flash";
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: systemText }] },
    contents:           [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      maxOutputTokens: maxTokens || 4096,
      temperature:     0.7,
      ...(forceJson ? { responseMimeType: "application/json" } : {}),
    },
  };

  const r = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  const data = await r.json();

  if (!r.ok) {
    const msg    = data?.error?.message || ("HTTP " + r.status);
    const status = r.status;
    const isQuota = status === 429
      || (data?.error?.status === "RESOURCE_EXHAUSTED")
      || msg.toLowerCase().includes("quota")
      || msg.toLowerCase().includes("resource_exhausted");

    // Quota exceeded on primary model → retry with 1.5-flash-latest (different quota pool)
    if (isQuota && !modelOverride) {
      return callGemini(apiKey, systemText, userText, maxTokens, forceJson, "gemini-1.5-flash-latest");
    }
    // Quota exceeded on fallback too → last resort: 1.5-flash-8b (highest free RPM)
    if (isQuota && modelOverride === "gemini-1.5-flash-latest") {
      return callGemini(apiKey, systemText, userText, maxTokens, forceJson, "gemini-1.5-flash-8b-latest");
    }

    return { ok: false, status, error: msg };
  }

  const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason;
    return { ok: false, status: 200, error: "Resposta vazia" + (reason ? ` (${reason})` : "") + "." };
  }
  return { ok: true, text };
}

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY nao configurada." });

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

      const out = await callGemini(apiKey, system, user, 1024, false);
      if (!out.ok) return res.status(502).json({ error: "Gemini erro: " + out.error });
      const resumoClean = (out.text || "").replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",");
      return res.status(200).json({ resumo: resumoClean || null });
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
        `INSTRUÇÃO: Responda SOMENTE com o JSON abaixo. Nenhum texto antes ou depois. Tudo em Português do Brasil. Sem travessão (—), use vírgula.`,
        ``,
        `EMPRESA-ALVO: ${empresa || "a empresa"}`,
        `SETOR: ${setor || "tecnologia"}`,
        ``,
        `CONTEXTO (pode estar em inglês — sua resposta deve ser SEMPRE em português):`,
        (rawContext || "Sem dados.").slice(0, 3500),
        ``,
        `INSTRUÇÕES DE QUALIDADE:`,
        `- "dores": específicas ao setor e porte. Explore dores operacionais, tecnológicas, de pessoas, regulatórias e competitivas.`,
        `- "triggers": eventos concretos — rodada de investimento, regulação, expansão, troca de liderança, IPO, fusão, vagas técnicas.`,
        `- "perguntas_spin": SPIN real — Situação, Problema, Implicação, Necessidade. Específicas para esta empresa e setor.`,
        `- "proximos_passos": ações concretas e sequenciadas.`,
        `- Emails e cold_calls: personalizados para esta empresa. Mencione setor, porte ou contexto. Sem travessão.`,
        ``,
        `{`,
        `  "resumo": "2 parágrafos sobre o que a empresa faz e seu momento de mercado, NÃO mencione o vendedor",`,
        `  "fit": { "score": "ALTO|MÉDIO|BAIXO", "justificativa": "3 frases específicas de fit com os produtos do vendedor" },`,
        `  "dores": { "principais": ["dor operacional específica 1","dor tecnológica 2","dor de pessoas/org 3","dor regulatória ou competitiva 4","dor estratégica 5"] },`,
        `  "triggers": ["evento concreto que abre janela de compra 1","trigger 2","trigger 3","trigger 4"],`,
        `  "stakeholders": [`,
        `    {"cargo":"cargo decisor primário","angulo":"ângulo específico","prioridade":"PRIMARIO","urgencia":"Alta","email":"","linkedin":"","phone":""},`,
        `    {"cargo":"cargo secundário","angulo":"ângulo diferente","prioridade":"SECUNDARIO","urgencia":"Média","email":"","linkedin":"","phone":""},`,
        `    {"cargo":"influenciador técnico","angulo":"ângulo técnico","prioridade":"TERCIARIO","urgencia":"Baixa","email":"","linkedin":"","phone":""}`,
        `  ],`,
        `  "estrategia": {`,
        `    "emails": [`,
        `      {"assunto":"assunto específico com contexto da empresa","corpo":"email de 150-200 palavras personalizado, 2-3 parágrafos, dor específica, CTA leve. Sem travessão."},`,
        `      {"assunto":"ângulo diferente do 1o","corpo":"follow-up 150-200 palavras com prova social, dado de mercado ou discovery. Sem travessão."},`,
        `      {"assunto":"breakup direto e com classe","corpo":"breakup 100-150 palavras com urgência e porta aberta. Sem travessão."}`,
        `    ],`,
        `    "inmails": [`,
        `      {"assunto":"InMail direto para o cargo decisor","corpo":"100-140 palavras, gancho específico, 2 ideias conectadas, CTA. Sem travessão."},`,
        `      {"assunto":"ângulo alternativo","corpo":"100-140 palavras com dado de setor ou referência a concorrente. Sem travessão."}`,
        `    ],`,
        `    "whatsapps": ["3-5 frases informais, contexto da empresa, pergunta direta. Sem travessão.","segunda opção com ângulo diferente. Sem travessão."],`,
        `    "cold_calls": [`,
        `      "script completo para ${empresa}: abertura 10-15s, pausa, pergunta de qualificação, resposta a objeção, ponte para solução, CTA para 20 min. Mín. 120 palavras. Sem travessão.",`,
        `      "script alternativo mín. 120 palavras com trigger de compra ou dado do setor. Sem travessão."`,
        `    ],`,
        `    "perguntas_spin": [`,
        `      "SITUAÇÃO: como ${empresa} opera hoje em relação à dor principal?",`,
        `      "SITUAÇÃO: qual a estrutura, processo ou tecnologia atual da ${empresa}?",`,
        `      "PROBLEMA: pergunta que revela a dor principal de forma não óbvia",`,
        `      "PROBLEMA: pergunta que expõe limitação ou risco específico do setor",`,
        `      "IMPLICAÇÃO: qual o impacto desta dor no resultado financeiro ou operacional da ${empresa}?",`,
        `      "IMPLICAÇÃO: como esta limitação afeta a equipe, clientes ou posição competitiva?",`,
        `      "NECESSIDADE: se isso fosse resolvido, qual seria o impacto nos resultados da ${empresa}?",`,
        `      "NECESSIDADE: o que mudaria na operação se vocês tivessem [benefício do produto]?"`,
        `    ],`,
        `    "objecoes": [`,
        `      {"objecao":"objeção comum neste setor, específica","resposta":"resposta com diferencial do produto e dado concreto"},`,
        `      {"objecao":"segunda objeção provável","resposta":"resposta com case ou ROI"},`,
        `      {"objecao":"objeção de timing ou prioridade","resposta":"resposta que cria urgência sem pressionar"}`,
        `    ]`,
        `  },`,
        `  "proximos_passos": {`,
        `    "ae": ["pesquisar no LinkedIn os decisores de ${empresa}","verificar vagas abertas em ${empresa}","buscar notícias recentes — M&A, expansão, novos produtos","preparar diagnóstico com dados do setor"],`,
        `    "bdr": ["cold call para o decisor primário com script de 10s","InMail no LinkedIn com ângulo de dor","sequência de 3 emails em 10 dias","monitorar ${empresa} no Google Alerts"],`,
        `    "prazo": "Prioridade MÉDIA — abordar em até 48h se houver trigger recente, senão em 7 dias."`,
        `  }`,
        `}`,
      ].join("\n");

      const out = await callGemini(apiKey, system, user, 8192, true);
      if (!out.ok) return res.status(502).json({ error: "Gemini erro: " + out.error });

      let parsed;
      try { parsed = parseJSON(out.text); }
      catch (e) {
        try {
          const m = out.text.match(/\{[\s\S]+\}/);
          if (m) parsed = JSON.parse(m[0]);
          else throw e;
        } catch (e2) {
          return res.status(200).json({ error: "Falha ao interpretar resposta.", raw: out.text.slice(0, 200) });
        }
      }

      return res.status(200).json(stripDashesDeep(parsed));
    }

    // ── MODO SEQUÊNCIA ────────────────────────────────────────────────────────
    const cadencia = Array.isArray(touches) && touches.length ? touches : [
      { day:1,  type:"linkedin" }, { day:3,  type:"email"    },
      { day:6,  type:"call"     }, { day:10, type:"email"    },
      { day:15, type:"whatsapp" }, { day:21, type:"breakup"  },
    ];

    const contactFirstName = contato ? contato.split(" ")[0] : null;
    const nomeUsar         = contactFirstName || null;

    const seqSystem = [
      `Você é o melhor copywriter de outbound B2B do Brasil. Não o mais educado — o mais eficaz.`,
      ``,
      `Você escreve mensagens que as pessoas PARAM para ler no meio do scroll do celular.`,
      ``,
      `Você representa: ${vendedorEmpresa}`,
      ``,
      sellerCtx,
      ``,
      `SEU ESTILO:`,
      `- Cada touch começa de forma INESPERADA. Nunca com "Olá, meu nome é..." nem "Espero que esteja bem".`,
      `- Use dados reais do setor, provocações inteligentes, humor contextual sobre o cargo ou empresa.`,
      `- Tom: colega de setor, não vendedor. Alguém que entende o jogo deles por dentro.`,
      `- Referências diretas ao cargo, empresa ou setor — mostre que você fez a lição de casa.`,
      ``,
      `REGRAS ABSOLUTAS:`,
      `- Português do Brasil. Nunca inglês.`,
      `- ZERO placeholders. Nem [Nome], nem [Empresa], nem [Cargo]. Use os dados reais.`,
      `- NUNCA use travessão (— ou –). Use vírgula, ponto ou ponto e vírgula.`,
      nomeUsar ? `- Nome do contato: ${nomeUsar}. Use quando natural.` : `- Nome desconhecido. Comece sem nome, com gancho direto.`,
      `- 6 touches = 6 abordagens COMPLETAMENTE diferentes. Mesma pessoa, 6 ângulos distintos.`,
      `- Email: 150-220 palavras, 2-3 parágrafos curtos, mini-história ou dado de mercado, CTA que não parece CTA.`,
      `- LinkedIn: 100-140 palavras, íntimo mas com substância, 2 ideias conectadas antes do fechamento.`,
      `- WhatsApp: 3-5 frases curtas, casual, contexto real que mostra pesquisa.`,
      `- Cold call: script falado completo, abertura 10-15s, pausa estratégica, pergunta cirúrgica, resposta a objeção, CTA para 20 min. Mín. 120 palavras.`,
      `- Breakup: mais criativo e elaborado, 100-150 palavras, ironia leve ou insight final, porta aberta com classe.`,
      `- RESPONDA APENAS COM O JSON. ZERO texto antes ou depois.`,
    ].join("\n");

    const seqUser = [
      `JSON APENAS. Nenhum texto fora do JSON. Nenhum placeholder. Sem travessão.`,
      ``,
      `SEQUÊNCIA PARA:`,
      `- Empresa-alvo: ${empresa || "a empresa"}`,
      `- Setor: ${setor || "tecnologia"}`,
      `- Cargo do decisor: ${cargo || "Decisor"}`,
      nomeUsar ? `- Nome: ${contato}` : `- Nome: desconhecido`,
      `- Ângulo: ${angulo || "impacto no negócio"}`,
      `- Dor principal: ${pain || "a descobrir — explore pelo setor e cargo"}`,
      ``,
      `ABERTURAS DE EXEMPLO (inspire-se, não copie):`,
      `• Email: "Existe uma crença no setor de ${setor || "tecnologia"} que [insight contraintuitivo]. Ela está errada."`,
      `• LinkedIn: "Vi que a ${empresa} [algo específico]. Fiquei curioso: isso é intenção ou consequência?"`,
      nomeUsar ? `• WhatsApp: "Oi ${nomeUsar}! Vi algo sobre a ${empresa} que me fez pensar. Posso te mandar 2 linhas?"` : `• WhatsApp: "Vi algo sobre a ${empresa} que me fez pensar. Posso compartilhar em 2 linhas?"`,
      `• Cold call: "Desculpa a ligação sem aviso, ligo porque é mais honesto do que mais um e-mail. Tenho 30 segundos?"`,
      `• Breakup: "Ok, vou parar de insistir. Mas antes: uma pergunta que pode valer seu tempo..."`,
      ``,
      `Cadência (${cadencia.length} touches, cada um COMPLETAMENTE diferente):`,
      cadencia.map((t, i) => `${i + 1}) Dia ${t.day} — canal: ${t.type}`).join("\n"),
      ``,
      `{"touches":[{"day":1,"type":"linkedin","subject":"assunto impactante","body":"mensagem completa e disruptiva"},...]}`,
    ].join("\n");

    const out = await callGemini(apiKey, seqSystem, seqUser, 12000, true);
    if (!out.ok) return res.status(502).json({ error: "Gemini erro: " + out.error });

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
