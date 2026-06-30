// api/apollo.js — Vercel serverless
// Email finder via Apollo.io People Search API
// Variavel de ambiente: APOLLO_API_KEY
// NOTA: Apollo mascara emails por padrao (so revela com People Enrichment, que e pago
// na maioria dos planos). Aqui tentamos o endpoint de enrichment quando disponivel,
// com fallback para people/search (compativel com planos free/basic).

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

  const nameQuery = [first_name, last_name].filter(Boolean).join(" ");

  try {
    // ── Attempt 1: People Match (Enrichment) — reveals real email when plan allows ──
    try {
      const matchBody = {
        api_key: apiKey,
        first_name: first_name || undefined,
        last_name:  last_name  || undefined,
        organization_name: organization_name || undefined,
        domain: domain || undefined,
        reveal_personal_emails: false,
      };
      const rMatch = await fetch("https://api.apollo.io/v1/people/match", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apiKey, "Cache-Control": "no-cache" },
        body: JSON.stringify(matchBody),
      });
      if (rMatch.ok) {
        const dMatch = await rMatch.json();
        const p = dMatch.person;
        if (p && p.email && !p.email.includes("email_not_unlocked") && !p.email.includes("***")) {
          return res.status(200).json({
            person: {
              email: p.email,
              email_confidence: 80,
              name: p.name || nameQuery,
              title: p.title || "",
              linkedin: p.linkedin_url || "",
              source: "Apollo.io",
            },
            message: null,
          });
        }
      }
    } catch (e) { /* fall through to search */ }

    // ── Attempt 2: People Search — works on free/basic plans, but emails often masked ──
    const body = {
      api_key: apiKey,
      q_organization_domains: domain ? [domain] : undefined,
      q_organization_name: !domain ? organization_name : undefined,
      person_locations: ["Brazil", "Brasil"],
      page: 1,
      per_page: 5,
    };
    if (nameQuery) body.q_keywords = nameQuery;

    const r = await fetch("https://api.apollo.io/v1/people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      if (r.status === 403 || r.status === 401) {
        return res.status(200).json({ person: null, message: "Plano Apollo.io não tem acesso a este endpoint. Verifique o plano da chave API." });
      }
      const txt = await r.text();
      return res.status(200).json({ person: null, message: "Apollo retornou erro " + r.status + ": " + txt.slice(0, 150) });
    }

    const json = await r.json();
    const people = json.people || [];

    const nameLower = nameQuery.toLowerCase();
    let best = people.find(p => {
      const pName = (p.name || [p.first_name, p.last_name].filter(Boolean).join(" ")).toLowerCase();
      return pName.includes(nameLower.split(" ")[0]) || nameLower.includes(pName.split(" ")[0]);
    }) || people[0];

    if (!best) return res.status(200).json({ person: null, message: "Nenhum resultado encontrado no Apollo.io para este nome/empresa." });

    // Apollo masks emails on the search endpoint unless the plan reveals them
    const rawEmail = best.email || "";
    const isMasked = !rawEmail || rawEmail.includes("email_not_unlocked") || rawEmail.includes("***");
    const email = isMasked ? "" : rawEmail;

    return res.status(200).json({
      person: {
        email: email || null,
        email_confidence: email ? 70 : 0,
        name: best.name || nameQuery,
        title: best.title || "",
        linkedin: best.linkedin_url || "",
        source: "Apollo.io",
      },
      message: email ? null : "Perfil encontrado no Apollo, mas o e-mail está bloqueado pelo plano atual da chave API (requer People Enrichment pago).",
    });
  } catch (e) {
    return res.status(200).json({ person: null, message: "Erro ao consultar Apollo.io: " + e.message });
  }
}
