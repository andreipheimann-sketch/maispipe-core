// api/prospect.js — Vercel serverless
// Gera lista de empresas prospectaveis com base no ICP configurado.
// Variavel de ambiente: GROQ_API_KEY

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo nao permitido." });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GROQ_API_KEY nao configurada." });

  const { icp, clienteNome, quantidade, dna } = req.body || {};
  const qtd = Math.min(parseInt(quantidade) || 30, 30);

  // Use DNA-refined ICP when available
  const segmento    = (dna?.icp_refinado?.segmento) || (icp && icp.segmento)    || "Tecnologia / SaaS / Fintech";
  const porte       = (dna?.icp_refinado?.porte)    || (icp && icp.porte)        || "50–1000 colaboradores";
  const faturamento = (icp && icp.faturamento)  || "R$ 10M – R$ 500M/ano";
  const regiao      = (dna?.icp_refinado?.regiao)   || (icp && icp.regiao)        || "Brasil";
  const cargos      = (dna?.icp_refinado?.cargos_primarios?.join(", ")) || (icp && icp.cargos) || "CEO, CFO, CTO";
  const obs         = (icp && icp.observacoes) || "";

  const vendedor = (dna?.empresa?.nome) || clienteNome || "a empresa cliente";
  const produto  = (dna?.empresa?.descricao) ? `${dna.empresa.nome} — ${dna.empresa.descricao}` : "";

  const system = [
    `Você é um especialista em prospecção B2B e inteligência de mercado no Brasil.`,
    `Sua tarefa: gerar uma lista de empresas brasileiras REAIS para prospecção de ${vendedor}.`,
    produto ? `Produto/solução do vendedor: ${produto}` : "",
    `REGRAS:`,
    `- Somente empresas REAIS que existem no Brasil. Nunca invente nomes.`,
    `- Varie porte, setor e região dentro do ICP.`,
    `- Cada empresa com motivo específico e diferente de fit.`,
    `- Responda APENAS com JSON válido. Sem texto, sem markdown.`,
    `- Todo conteúdo em Português do Brasil.`,
  ].filter(Boolean).join("\n");

  const user = [
    `Gere exatamente ${qtd} empresas brasileiras reais para prospecção com este ICP:`,
    ``,
    `SEGMENTO: ${segmento}`,
    `PORTE: ${porte}`,
    `FATURAMENTO: ${faturamento}`,
    `REGIÃO: ${regiao}`,
    `CARGOS DECISORES: ${cargos}`,
    obs ? `CONTEXTO: ${obs}` : "",
    ``,
    `Responda APENAS com este JSON:`,
    `{"empresas":[{"nome":"Nome real","site":"site.com.br","setor":"Setor","cidade":"Cidade, Estado","porte_estimado":"X–Y colaboradores","resumo":"2 frases: o que faz e por que é fit.","motivo_fit":"1 frase de fit específico.","score_fit":"ALTO"}]}`,
    ``,
    `Gere exatamente ${qtd} itens. Varie setores, portes e cidades. Só empresas reais brasileiras.`,
  ].filter(Boolean).join("\n");

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model:           "llama-3.3-70b-versatile",
        max_tokens:      4096,
        temperature:     0.8,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user",   content: user   },
        ],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      const msg = (data?.error?.message) || ("HTTP " + r.status);
      return res.status(502).json({ error: "Groq erro: " + msg });
    }

    const text = (data.choices?.[0]?.message?.content || "").trim();
    let parsed;
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch (e) {
      try {
        const m = text.match(/\{[\s\S]+\}/);
        if (m) parsed = JSON.parse(m[0]);
        else throw e;
      } catch (e2) {
        return res.status(200).json({ empresas: [], error: "Falha ao interpretar resposta da IA." });
      }
    }

    const empresas = (parsed && parsed.empresas) || [];
    return res.status(200).json({ empresas, total: empresas.length });

  } catch (err) {
    return res.status(500).json({ error: "Erro interno: " + err.message });
  }
}
