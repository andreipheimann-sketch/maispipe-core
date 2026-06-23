// api/analyze.js — Vercel serverless
// Analisa um documento anexado (RI, relatorios) usando Google Gemini.
// Variavel de ambiente necessaria: GEMINI_API_KEY

const BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo nao permitido." });


const clientId = process.env.VITE_CLIENT || "elcanary";

function getAnalyzeContext(id) {
  const ctx = {
    elcanary: {
      analista: "Voce e um analista de inteligencia comercial B2B especializado em seguranca da informacao, ciberseguranca, privacidade de dados (LGPD) e compliance no Brasil — com o perfil da El Canary Privacy & Ethics.",
      schema:   '{"resumo":"Resumo executivo em 3-4 frases: o que a empresa faz, porte, maturidade tecnologica e exposicao a riscos de seguranca e privacidade","insights":["insight 1","insight 2","insight 3","insight 4","insight 5"],"oportunidades":["oportunidade El Canary 1 — ex: ausencia de CISO, LGPD incompleta","oportunidade 2","oportunidade 3"],"alertas":["risco de seguranca 1","risco 2"]}',
      foco:     "Foque no que ajuda um consultor da El Canary a identificar oportunidades de EC Governance, EC Operations e EC Ethics para esta empresa.",
    },
    mgt: {
      analista: "Voce e um analista de inteligencia comercial B2B especializado em gestao tributaria e recuperacao de creditos fiscais no Brasil — com o perfil da MGT Gestao Tributaria.",
      schema:   '{"resumo":"Resumo executivo em 3-4 frases: o que a empresa faz, porte, regime tributario provavel e destaques financeiros relevantes","insights":["insight 1","insight 2","insight 3","insight 4","insight 5"],"oportunidades":["oportunidade tributaria 1 — ex: creditos de PIS/COFINS nao aproveitados","oportunidade 2","oportunidade 3"],"alertas":["risco ou passivo tributario 1","risco 2"]}',
      foco:     "Foque no que ajuda um consultor da MGT a identificar oportunidades de recuperacao de impostos, reducao de carga tributaria e gestao de passivos para esta empresa.",
    },
    zendesk: {
      analista: "Voce e um analista de inteligencia comercial B2B especializado em CX, atendimento ao cliente omnichannel e eficiencia de times de suporte no Brasil — com o perfil da Zendesk.",
      schema:   '{"resumo":"Resumo executivo em 3-4 frases: o que a empresa faz, porte, canais de atendimento e sinais de pressao de CSAT ou custo por ticket","insights":["insight 1","insight 2","insight 3","insight 4","insight 5"],"oportunidades":["oportunidade Zendesk 1 — ex: canais fragmentados, self-service inexistente","oportunidade 2","oportunidade 3"],"alertas":["risco de CSAT ou churn 1","risco 2"]}',
      foco:     "Foque no que ajuda um BDR da Zendesk a identificar oportunidades de Zendesk Suite (Support, Messaging, Explore, IA) para esta empresa.",
    },
  };
  return ctx[id] || ctx.elcanary;
}

  const { attachData, attachFileName, company } = req.body || {};
  if (!attachData) return res.status(400).json({ error: "Nenhum arquivo enviado." });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY nao configurada no servidor." });

  const model = process.env.GEMINI_MODEL_ANALYZE || process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const ext = (attachFileName || "").split(".").pop().toLowerCase();
  let mediaType = "application/pdf";
  const mimeMap = {
    pdf: "application/pdf",
    txt: "text/plain",
    csv: "text/csv",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  if (attachData.indexOf("data:") >= 0) {
    const mime = attachData.split(";")[0].replace("data:", "").trim();
    if (mime) mediaType = mime;
  } else if (mimeMap[ext]) {
    mediaType = mimeMap[ext];
  }

  const b64 = attachData.indexOf(",") >= 0 ? attachData.split(",")[1] : attachData;
  if (!b64 || b64.length < 100) return res.status(400).json({ error: "Arquivo invalido ou muito pequeno." });

  const prompt = [
    getAnalyzeContext(clientId).analista,
    "Analise o documento e retorne APENAS um JSON valido nesta estrutura exata:",
    getAnalyzeContext(clientId).schema,
    "Empresa: " + (company || "nao informada") + ".",
    getAnalyzeContext(clientId).foco,
  ].join("\n");

  const isText = mediaType === "text/plain" || mediaType === "text/csv";
  let parts;
  if (isText) {
    let textContent = "";
    try { textContent = Buffer.from(b64, "base64").toString("utf-8").slice(0, 12000); } catch (e) {}
    parts = [{ text: prompt + "\n\nConteudo do documento:\n" + textContent }];
  } else {
    parts = [
      { text: prompt },
      { inline_data: { mime_type: mediaType, data: b64 } },
    ];
  }

  try {
    const r = await fetch(BASE + model + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: parts }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      const msg = (data && data.error && data.error.message) || ("HTTP " + r.status);
      return res.status(502).json({ error: "Gemini erro: " + msg });
    }

    const rawText = (data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts || []).map(function (p) { return p.text || ""; }).join("").trim();

    const cleaned = rawText.replace(/```json|```/gi, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      parsed = { resumo: rawText.slice(0, 600) || "Nao foi possivel estruturar a analise.", insights: [], oportunidades: [], alertas: [] };
    }

    return res.status(200).json({
      resumo: parsed.resumo || "",
      insights: Array.isArray(parsed.insights) ? parsed.insights : [],
      oportunidades: Array.isArray(parsed.oportunidades) ? parsed.oportunidades : [],
      alertas: Array.isArray(parsed.alertas) ? parsed.alertas : [],
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno ao processar o documento: " + e.message });
  }
}
