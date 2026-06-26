// api/apollo.js — Vercel serverless
// Email finder via Apollo.io People Search API
// Variavel de ambiente: APOLLO_API_KEY

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo nao permitido." });

  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "APOLLO_API_KEY nao configurada." });

  const { first_name, last_name, organization_name, domain } = req.body || {};
  if (!first_name && !last_name) return res.status(400).json({ error: "Nome do contato necessario." });

  try {
    // Apollo People Search — match by name + org/domain
    const body = {
      api_key: apiKey,
      q_organization_domains: domain ? [domain] : undefined,
      q_organization_name: !domain ? organization_name : undefined,
      person_locations: ["Brazil", "Brasil"],
      page: 1,
      per_page: 5,
    };

    // Try to find exact person by name
    const nameQuery = [first_name, last_name].filter(Boolean).join(" ");
    if (nameQuery) body.q_keywords = nameQuery;

    const r = await fetch("https://api.apollo.io/v1/mixed_people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(r.status).json({ error: "Apollo retornou erro: " + r.status, detail: txt.slice(0, 200) });
    }

    const json = await r.json();
    const people = json.people || [];

    // Find best match by name similarity
    const nameLower = nameQuery.toLowerCase();
    let best = people.find(p => {
      const pName = (p.name || [p.first_name, p.last_name].filter(Boolean).join(" ")).toLowerCase();
      return pName.includes(nameLower.split(" ")[0]) || nameLower.includes(pName.split(" ")[0]);
    }) || people[0];

    if (!best) return res.status(200).json({ person: null, message: "Nenhum resultado encontrado no Apollo.io." });

    const email = best.email || "";
    return res.status(200).json({
      person: {
        email: email || null,
        email_confidence: email ? 75 : 0,
        name: best.name || nameQuery,
        title: best.title || "",
        linkedin: best.linkedin_url || "",
        source: "Apollo.io",
      },
      message: email ? null : "Perfil encontrado mas sem e-mail disponível.",
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro ao consultar Apollo.io: " + e.message });
  }
}
