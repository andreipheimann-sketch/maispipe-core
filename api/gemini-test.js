// api/gemini-test.js — diagnostic endpoint
// GET /api/gemini-test  → lists available Gemini models + tests a small call
// Never deploy this in production — remove after debugging

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY not set" });

  const results = {};

  // 1. List models on v1beta
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=50&key=${key}`);
    const d = await r.json();
    results.v1beta_models = r.ok
      ? (d.models || [])
          .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
          .map(m => m.name)
      : { error: d?.error?.message };
  } catch(e) { results.v1beta_models = { error: e.message }; }

  // 2. List models on v1
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1/models?pageSize=50&key=${key}`);
    const d = await r.json();
    results.v1_models = r.ok
      ? (d.models || [])
          .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
          .map(m => m.name)
      : { error: d?.error?.message };
  } catch(e) { results.v1_models = { error: e.message }; }

  // 3. Test tiny call on each endpoint with gemini-2.0-flash
  for (const [label, url] of [
    ["test_v1beta", `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`],
    ["test_v1",     `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${key}`],
  ]) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Say: OK" }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      });
      const d = await r.json();
      results[label] = r.ok
        ? { ok: true, text: d?.candidates?.[0]?.content?.parts?.[0]?.text }
        : { ok: false, status: r.status, error: d?.error?.message };
    } catch(e) { results[label] = { error: e.message }; }
  }

  return res.status(200).json(results);
}
