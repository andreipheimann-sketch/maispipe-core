// api/setup.js — Vercel serverless
// Usa a API do Claude (Anthropic) para gerar o "DNA" completo da empresa vendedora.
// Chamado uma única vez no onboarding. Resultado salvo em localStorage pipe_setup_dna.
// Variavel de ambiente necessaria: ANTHROPIC_API_KEY

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada." });

  try {
    const { companySite, icp, produtos } = req.body || {};

    // ── Build context ──────────────────────────────────────────────────────────
    const siteCtx = companySite
      ? `Site da empresa vendedora: ${companySite}`
      : "Site da empresa vendedora: não informado";

    const icpCtx = icp && Object.values(icp).some(Boolean)
      ? [
          icp.segmento    ? `Segmento-alvo: ${icp.segmento}`       : "",
          icp.porte       ? `Porte: ${icp.porte}`                   : "",
          icp.faturamento ? `Faturamento: ${icp.faturamento}`        : "",
          icp.regiao      ? `Região: ${icp.regiao}`                  : "",
          icp.cargos      ? `Cargos decisores: ${icp.cargos}`        : "",
          icp.observacoes ? `Observações: ${icp.observacoes}`        : "",
        ].filter(Boolean).join("\n")
      : "ICP não informado — infira o perfil ideal com base nos produtos e site.";

    const prodCtx = Array.isArray(produtos) && produtos.length
      ? produtos.map((p, i) => [
          `${i + 1}. ${p.nome || "Produto"}`,
          p.descricao  ? `   O que é: ${p.descricao}`   : "",
          p.beneficios ? `   Benefícios: ${p.beneficios}` : "",
          p.publico    ? `   Público: ${p.publico}`        : "",
          p.preco      ? `   Preço: ${p.preco}`            : "",
        ].filter(Boolean).join("\n")).join("\n\n")
      : "Produto não informado — infira com base no site da empresa.";

    // ── Prompt ────────────────────────────────────────────────────────────────
    const prompt = `Você é um especialista sênior em vendas B2B enterprise e account-based selling no Brasil.

Sua tarefa: a partir das informações abaixo sobre uma empresa que usa o +Pipe (ferramenta de prospecção), gere o "DNA de vendas" completo dessa empresa — o conjunto de inteligência que vai alimentar todos os mapeamentos de conta, sequências e abordagens geradas pela plataforma.

## INFORMAÇÕES DA EMPRESA VENDEDORA
${siteCtx}

## ICP (Ideal Customer Profile)
${icpCtx}

## PRODUTOS / SOLUÇÕES OFERECIDOS
${prodCtx}

---

Gere um JSON válido com EXATAMENTE esta estrutura. Seja extremamente específico — cada campo deve refletir a realidade desta empresa e seus produtos. Sem placeholders, sem frases genéricas.

\`\`\`json
{
  "empresa": {
    "nome": "nome curto da empresa extraído do site",
    "descricao": "o que a empresa faz em 1 frase direta",
    "proposta_valor": "proposta de valor central em 1 frase de impacto",
    "diferenciais": ["diferencial 1", "diferencial 2", "diferencial 3"]
  },
  "icp_refinado": {
    "segmento": "segmento mais preciso baseado nos produtos",
    "porte": "porte ideal com número de funcionários ou faturamento",
    "regiao": "região prioritária",
    "cargos_primarios": ["cargo decisor 1", "cargo decisor 2"],
    "cargos_secundarios": ["cargo influenciador 1", "cargo influenciador 2"],
    "sinais_de_compra": ["sinal que indica que a empresa está pronta para comprar 1", "sinal 2", "sinal 3"],
    "nao_perfil": ["critério de exclusão 1 — quem NÃO é cliente ideal", "critério 2"]
  },
  "dores_por_cargo": {
    "decisor_principal": {
      "cargo": "cargo do decisor principal",
      "dores": ["dor específica 1", "dor 2", "dor 3"],
      "metricas_que_importam": ["métrica de negócio que ele acompanha 1", "métrica 2"],
      "angulo_de_entrada": "o ângulo mais forte para abrir conversa com este cargo"
    },
    "decisor_secundario": {
      "cargo": "cargo do segundo decisor",
      "dores": ["dor 1", "dor 2", "dor 3"],
      "metricas_que_importam": ["métrica 1", "métrica 2"],
      "angulo_de_entrada": "ângulo de entrada para este cargo"
    },
    "influenciador": {
      "cargo": "cargo do influenciador técnico ou operacional",
      "dores": ["dor 1", "dor 2"],
      "angulo_de_entrada": "ângulo de entrada para este cargo"
    }
  },
  "gatilhos_de_compra": [
    "evento ou situação que indica que uma empresa do ICP está pronta para comprar — seja muito específico 1",
    "gatilho 2",
    "gatilho 3",
    "gatilho 4",
    "gatilho 5"
  ],
  "perguntas_spin": {
    "situacao": [
      "pergunta de situação específica para entender o contexto atual do prospect",
      "pergunta de situação 2"
    ],
    "problema": [
      "pergunta que revela a dor principal relacionada ao produto",
      "pergunta de problema 2",
      "pergunta de problema 3"
    ],
    "implicacao": [
      "pergunta que expande a consequência da dor — impacto no negócio",
      "pergunta de implicação 2"
    ],
    "necessidade": [
      "pergunta que leva o prospect a articular o valor da solução",
      "pergunta de necessidade 2"
    ]
  },
  "templates_mensagens": {
    "email_abertura": {
      "assunto": "assunto do email de abertura — específico, sem clickbait",
      "corpo": "email completo de abertura — máx 120 palavras, personalizado para o ICP, com CTA leve"
    },
    "email_followup": {
      "assunto": "assunto do 2o email",
      "corpo": "email de follow-up com ângulo diferente — referencia dor específica"
    },
    "email_breakup": {
      "assunto": "assunto do email de encerramento",
      "corpo": "email de breakup — com classe, deixa porta aberta"
    },
    "inmail_linkedin": "mensagem curta para InMail LinkedIn — máx 60 palavras, direta",
    "whatsapp": "mensagem WhatsApp — curtíssima, informal, máx 40 palavras",
    "cold_call_script": "script completo de cold call — com abertura, pergunta de qualificação, ponte para o produto e CTA para reunião"
  },
  "objecoes_e_respostas": [
    {
      "objecao": "objeção mais comum neste segmento",
      "resposta": "resposta específica usando os diferenciais do produto"
    },
    {
      "objecao": "objeção 2",
      "resposta": "resposta 2"
    },
    {
      "objecao": "objeção 3",
      "resposta": "resposta 3"
    }
  ],
  "proximos_passos_padrao": {
    "bdr": [
      "ação prioritária para BDR após identificar uma conta no ICP",
      "ação 2",
      "ação 3"
    ],
    "ae": [
      "ação prioritária para AE após primeiro contato",
      "ação 2",
      "ação 3"
    ]
  }
}
\`\`\`

Responda APENAS com o JSON — sem texto antes ou depois, sem markdown extra além das backticks do bloco.`;

    // ── Call Claude API ────────────────────────────────────────────────────────
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":            "application/json",
        "x-api-key":               apiKey,
        "anthropic-version":       "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 4096,
        messages:   [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      return res.status(502).json({ error: `Claude API erro ${response.status}: ${txt.slice(0, 200)}` });
    }

    const data = await response.json();
    const raw  = (data.content || []).map(b => b.text || "").join("").trim();
    const json = raw.replace(/^```json\s*/,"").replace(/^```\s*/,"").replace(/```\s*$/,"").trim();

    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      return res.status(200).json({ error: "Falha ao interpretar resposta do Claude.", raw: raw.slice(0, 500) });
    }

    return res.status(200).json({ ok: true, dna: parsed });

  } catch (e) {
    return res.status(200).json({ error: "Erro interno: " + e.message });
  }
}
