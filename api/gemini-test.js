// api/gemini-test.js — diagnostic endpoint (remove after debugging)
// GET /api/gemini-test

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(200).json({ status: "ERROR", reason: "GEMINI_API_KEY not set in Vercel env vars" });

  const out = { key_present: true, key_prefix: key.slice(0, 8) + "...", results: {} };

  // 1. List models — does NOT consume quota, just validates the key
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=5&key=${key}`);
    const d = await r.json();
    if (r.ok) {
      out.results.list_models = "OK — key is valid and API is enabled";
      out.results.sample_models = (d.models || []).slice(0, 5).map(m => m.name);
    } else {
      out.results.list_models = `FAILED ${r.status}: ${d?.error?.message}`;
      out.results.billing_needed = r.status === 403 || (d?.error?.message || "").includes("API_KEY") || (d?.error?.message || "").includes("disabled");
    }
  } catch(e) { out.results.list_models = `NETWORK ERROR: ${e.message}`; }

  // 2. Tiny generateContent call — uses quota but only ~5 tokens
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Reply with only the word: WORKING" }] }],
          generationConfig: { maxOutputTokens: 5 },
        }),
      }
    );
    const d = await r.json();
    if (r.ok) {
      const text = d?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      out.results.generate_content = `OK — model responded: "${text.trim()}"`;
      out.results.ready_to_use = true;
    } else {
      const msg = d?.error?.message || "";
      out.results.generate_content = `FAILED ${r.status}: ${msg.slice(0, 200)}`;
      out.results.ready_to_use = false;
      if (r.status === 429 || msg.includes("quota") || msg.includes("limit: 0")) {
        out.results.fix = "Billing account not linked. Go to: https://console.cloud.google.com/billing — link a billing account to the project that owns this API key. Free tier (1M tokens/day) activates automatically after linking.";
      } else if (r.status === 403) {
        out.results.fix = "API not enabled or key invalid. Go to: https://console.cloud.google.com/apis/library and enable 'Generative Language API'.";
      }
    }
  } catch(e) { out.results.generate_content = `NETWORK ERROR: ${e.message}`; }

  return res.status(200).json(out);
}
