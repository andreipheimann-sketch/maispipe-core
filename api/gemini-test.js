// api/gemini-test.js — Vercel serverless
// Diagnostico da API Groq — verifica se GROQ_API_KEY esta configurada e funcional.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.GROQ_API_KEY;
  const diag = { ok: false, apiKey: !!apiKey, modelos: [], mensagem: "", latencia: null };

  if (!apiKey) {
    diag.mensagem = "GROQ_API_KEY nao encontrada. Adicione no painel do Vercel (Settings > Environment Variables) e faca um novo deploy. Gere a chave gratis em console.groq.com.";
    return res.status(200).json(diag);
  }

  try {
    const t0 = Date.now();
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 20,
        messages: [{ role: "user", content: "Responda apenas: ok" }],
      }),
    });

    diag.latencia = Date.now() - t0;
    const data = await r.json();

    if (!r.ok) {
      diag.mensagem = "Groq retornou erro HTTP " + r.status + ": " + (data?.error?.message || "");
      if (r.status === 401) diag.mensagem += " — Chave invalida.";
      return res.status(200).json(diag);
    }

    diag.ok = true;
    diag.modelo = "llama-3.3-70b-versatile";
    diag.mensagem = "Groq funcionando. Latencia: " + diag.latencia + "ms.";
    diag.resposta = data.choices?.[0]?.message?.content || "";
    return res.status(200).json(diag);

  } catch (e) {
    diag.mensagem = "Erro de rede ao chamar Groq: " + e.message;
    return res.status(200).json(diag);
  }
}
