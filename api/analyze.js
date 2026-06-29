// api/analyze.js — Vercel serverless
// Analisa documentos anexados (RI, relatorios) usando Groq.
// Variavel de ambiente: GROQ_API_KEY
// Nota: Groq nao suporta inline de PDFs/imagens — extrai texto base64 antes de enviar.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo nao permitido." });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GROQ_API_KEY nao configurada." });

  const { attachData, attachFileName, company, dna } = req.body || {};
  if (!attachData) return res.status(400).json({ error: "Nenhum arquivo enviado." });

  const b64 = attachData.indexOf(",") >= 0 ? attachData.split(",")[1] : attachData;
  if (!b64 || b64.length < 100) return res.status(400).json({ error: "Arquivo invalido ou muito pequeno." });

  // Extract text from base64 (works for txt/csv; for PDF extract what we can)
  let textContent = "";
  try {
    textContent = Buffer.from(b64, "base64").toString("utf-8")
      .replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, " ") // strip binary chars
      .replace(/\s{3,}/g, " ")
      .trim()
      .slice(0, 10000);
  } catch (e) {
    return res.status(400).json({ error: "Nao foi possivel extrair texto do arquivo." });
  }

  if (!textContent || textContent.length < 50) {
    return res.status(400).json({ error: "Nao foi possivel extrair texto legivel do arquivo. Use PDF com texto selecionavel ou TXT/CSV." });
  }

  // Build context from DNA when available
  const vendedor = dna?.empresa?.nome || "a empresa";
  const produto  = dna?.empresa?.descricao ? `${dna.empresa.nome} — ${dna.empresa.descricao}` : "";
  const icp      = dna?.icp_refinado ? `Segmento: ${dna.icp_refinado.segmento || ""}, Porte: ${dna.icp_refinado.porte || ""}` : "";

  const system = [
    `Você é um analista de inteligência comercial B2B especializado no Brasil.`,
    `Você representa o vendedor: ${vendedor}.`,
    produto ? `Produto/solução: ${produto}` : "",
    icp     ? `ICP: ${icp}` : "",
    `Sua tarefa: analisar o documento e identificar oportunidades de negócio para ${vendedor}.`,
    `REGRA: Responda APENAS com JSON válido. Todo conteúdo em Português do Brasil.`,
  ].filter(Boolean).join("\n");

  const user = [
    `Empresa analisada: ${company || "não informada"}`,
    ``,
    `CONTEÚDO DO DOCUMENTO:`,
    textContent,
    ``,
    `Retorne APENAS este JSON (sem texto antes ou depois):`,
    `{`,
    `  "resumo": "Resumo executivo em 3-4 frases: o que a empresa faz, porte, momento e destaques financeiros/operacionais",`,
    `  "insights": ["insight específico 1","insight 2","insight 3","insight 4","insight 5"],`,
    `  "oportunidades": ["oportunidade de negócio para ${vendedor} 1","oportunidade 2","oportunidade 3"],`,
    `  "alertas": ["risco ou atenção 1","risco 2"]`,
    `}`,
  ].join("\n");

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model:           "llama-3.3-70b-versatile",
        max_tokens:      2048,
        temperature:     0.5,
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
      parsed = { resumo: text.slice(0, 600) || "Não foi possível estruturar a análise.", insights: [], oportunidades: [], alertas: [] };
    }

    return res.status(200).json({
      resumo:        parsed.resumo        || "",
      insights:      Array.isArray(parsed.insights)      ? parsed.insights      : [],
      oportunidades: Array.isArray(parsed.oportunidades) ? parsed.oportunidades : [],
      alertas:       Array.isArray(parsed.alertas)       ? parsed.alertas       : [],
    });

  } catch (e) {
    return res.status(500).json({ error: "Erro interno: " + e.message });
  }
}
