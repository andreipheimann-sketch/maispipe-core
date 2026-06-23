// api/prospect.js — Vercel serverless
// Gera lista de empresas prospectaveis com base no ICP configurado.
// Variavel de ambiente: GEMINI_API_KEY

const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo nao permitido." });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY nao configurada." });

  const { icp, clienteNome, quantidade } = req.body || {};
  const qtd = Math.min(parseInt(quantidade) || 50, 50);

  const segmento    = (icp && icp.segmento)    || "Tecnologia / SaaS / Fintech";
  const porte       = (icp && icp.porte)        || "50–1000 colaboradores";
  const faturamento = (icp && icp.faturamento)  || "R$ 10M – R$ 500M/ano";
  const regiao      = (icp && icp.regiao)        || "Brasil";
  const cargos      = (icp && icp.cargos)        || "CEO, CFO, CTO";
  const obs         = (icp && icp.observacoes)   || "";

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const systemPrompt = [
    "Voce e um especialista em prospeccao B2B e inteligencia de mercado no Brasil.",
    "Sua tarefa: gerar uma lista de empresas brasileiras REAIS que sao candidatas ideais de prospecção para " + (clienteNome || "a empresa cliente") + ".",
    "REGRAS ABSOLUTAS:",
    "- Somente empresas REAIS que existem no Brasil. Nao invente nomes.",
    "- Variar o porte, setor e regiao dentro do ICP — nao repita o mesmo perfil.",
    "- Priorizir empresas que nao sao clientes obvios (ex: evitar gigantes como Nubank, Itau se o ICP e mid-market).",
    "- Cada empresa deve ter um motivo especifico e diferente de fit com o ICP.",
    "- Responda APENAS com JSON valido. Sem texto, sem markdown, sem explicacoes fora do JSON.",
  ].join("\n");

  const userPrompt = [
    "Gere exatamente " + qtd + " empresas brasileiras reais para prospecção com base neste ICP:",
    "",
    "SEGMENTO-ALVO: " + segmento,
    "PORTE: " + porte,
    "FATURAMENTO ESTIMADO: " + faturamento,
    "REGIAO: " + regiao,
    "CARGOS DECISORES: " + cargos,
    obs ? ("CONTEXTO ADICIONAL: " + obs) : "",
    "",
    "Retorne APENAS este JSON (sem nada fora dele):",
    JSON.stringify({
      empresas: Array.from({ length: 3 }, (_, i) => ({
        nome: "Nome da empresa " + (i + 1),
        site: "site.com.br",
        setor: "Setor da empresa",
        cidade: "Cidade, Estado",
        porte_estimado: "X–Y colaboradores",
        resumo: "2 frases max: o que a empresa faz e por que e um fit para o ICP.",
        motivo_fit: "1 frase: razao especifica de fit com o ICP.",
        score_fit: "ALTO | MÉDIO",
      })),
    }),
    "",
    "Gere exatamente " + qtd + " itens no array 'empresas'. Varie setores, portes e cidades. Somente empresas reais brasileiras.",
  ].filter(Boolean).join("\n");

  async function callGemini(attempt) {
    const r = await fetch(BASE + model + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || ("HTTP " + r.status);
      // High demand / overload — retry up to 2 times with backoff
      const isOverload = msg.toLowerCase().includes("high demand") || msg.toLowerCase().includes("overloaded") || r.status === 503 || r.status === 429;
      if (isOverload && attempt < 3) {
        const delay = attempt * 4000; // 4s, 8s
        await new Promise(resolve => setTimeout(resolve, delay));
        return callGemini(attempt + 1);
      }
      return { ok: false, error: msg };
    }

    const text = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
      .map(p => p.text || "").join("").trim();

    return { ok: true, text };
  }

  try {
    const result = await callGemini(1);
    if (!result.ok) {
      return res.status(502).json({ error: "Gemini erro: " + result.error });
    }
    let parsed;
    try {
      parsed = JSON.parse(result.text.replace(/```json|```/g, "").trim());
    } catch (e) {
      return res.status(200).json({ empresas: [], error: "Falha ao interpretar resposta da IA." });
    }

    const empresas = (parsed && parsed.empresas) || [];
    return res.status(200).json({ empresas, total: empresas.length });
  } catch (err) {
    return res.status(500).json({ error: "Erro interno: " + err.message });
  }
}
