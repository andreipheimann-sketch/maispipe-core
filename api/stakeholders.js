// api/stakeholders.js
// Layer 1: Hunter.io  — verified emails by domain
// Layer 2: Apollo.io  — people search by title + company
// Layer 3: Tavily     — LinkedIn public profiles

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { company, domain } = req.body || {};
    if (!company) return res.status(400).json({ error: "company required" });

    const hunterKey = process.env.HUNTER_API_KEY;
    const apolloKey = process.env.APOLLO_API_KEY;
    const tavilyKey = process.env.TAVILY_API_KEY;

    const contacts = [];
    const sources  = [];
    const errors   = [];
    const seen     = new Set();

    function add(c) {
      const key = (c.nome || "").toLowerCase().replace(/\s/g, "").slice(0, 10);
      if (!key || seen.has(key)) return;
      seen.add(key);
      contacts.push(c);
    }

    // ── LAYER 1: Hunter.io ────────────────────────────────────────────────────
    if (hunterKey && domain) {
      try {
        const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=15&type=personal&seniority=senior,executive&api_key=${hunterKey}`;
        const r = await fetch(url);
        if (r.ok) {
          const json = await r.json();
          const seniorRe = /ceo|cto|ciso|coo|cfo|vp\b|vice|direct|diret|manager|gerente|head|chief|founder|security|product|compliance/i;
          for (const e of (json.data?.emails || [])) {
            if (!e.first_name && !e.last_name) continue;
            add({
              nome:             [e.first_name, e.last_name].filter(Boolean).join(" "),
              cargo:            e.position || "",
              email:            e.value || "",
              email_confidence: e.confidence || 0,
              linkedin:         "",
              phone:            "",
              cidade:           "",
              pais:             "Brasil",
              is_senior:        seniorRe.test(e.position || ""),
              source:           "Hunter.io",
            });
          }
          if (contacts.filter(c => c.source === "Hunter.io").length) {
            sources.push(`Hunter.io (${contacts.filter(c => c.source === "Hunter.io").length} contatos)`);
          }
        } else {
          errors.push(`Hunter.io: HTTP ${r.status}`);
        }
      } catch (e) {
        errors.push(`Hunter.io: ${e.message}`);
      }
    }

    // ── LAYER 2: Apollo.io ────────────────────────────────────────────────────
    if (apolloKey) {
      try {
        // Use people/search v1 — works on free/basic plans unlike mixed_people/search
        const body = {
          api_key: apolloKey,
          person_titles: ["CEO","CFO","COO","CTO","Diretor","VP","Head","Founder","Presidente","Gerente"],
          person_locations: ["Brazil","Brasil"],
          page: 1,
          per_page: 10,
        };
        if (domain) body.q_organization_domains = [domain];
        else body.q_organization_name = company;

        const r = await fetch("https://api.apollo.io/v1/people/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Api-Key": apolloKey, "Cache-Control": "no-cache" },
          body: JSON.stringify(body),
        });

        if (r.ok) {
          const json = await r.json();
          const brazilCities = /são paulo|sao paulo|rio de janeiro|belo horizonte|curitiba|brasilia|brasília|porto alegre|salvador|recife|fortaleza|manaus|goiania|goiânia|campinas/i;
          for (const p of (json.people || [])) {
            const country = (p.country || (p.organization?.country) || "").toLowerCase();
            const city    = (p.city || p.state || "").toLowerCase();
            const isForeign = country && !country.includes("brazil") && !country.includes("brasil");
            if (isForeign) continue;
            const isBrazil = country.includes("brazil") || country.includes("brasil") || brazilCities.test(city) || (!country && !city);
            if (!isBrazil) continue;
            if (!domain) {
              const orgName    = (p.organization?.name || "").toLowerCase();
              const companyLow = company.toLowerCase();
              if (orgName && !orgName.includes(companyLow.slice(0,6)) && !companyLow.includes(orgName.slice(0,6))) continue;
            }
            const email = p.email || "";
            if (email && contacts.some(c => c.email === email)) continue;
            add({
              nome:             p.name || [p.first_name, p.last_name].filter(Boolean).join(" "),
              cargo:            p.title || "",
              email:            email,
              email_confidence: email ? 75 : 0,
              linkedin:         p.linkedin_url || "",
              phone:            p.sanitized_phone || "",
              cidade:           p.city || "",
              pais:             "Brasil",
              is_senior:        true,
              source:           "Apollo.io",
            });
          }
          const apolloCount = contacts.filter(c => c.source === "Apollo.io").length;
          if (apolloCount) sources.push(`Apollo.io (${apolloCount} perfis)`);
        } else if (r.status === 403 || r.status === 401) {
          // Plan doesn't support this endpoint — skip silently, don't show error
          // Hunter.io and Tavily will still run
        } else {
          const txt = await r.text();
          errors.push(`Apollo.io: HTTP ${r.status} — ${txt.slice(0, 80)}`);
        }
      } catch (e) {
        errors.push(`Apollo.io: ${e.message}`);
      }
    }

    // ── LAYER 3: Tavily — LinkedIn public profiles ────────────────────────────
    if (tavilyKey) {
      const companyQ = `"${company}"`;
      const queries = [
        `${companyQ} (CEO OR CFO OR CTO OR COO OR Diretor OR VP OR Fundador OR Presidente) site:linkedin.com/in Brasil`,
        `${companyQ} (Gerente OR "Head de" OR Superintendente OR Sócio OR "Diretor Comercial") site:linkedin.com/in Brasil`,
      ];

      function extractRole(title, snippet, name, companyName) {
        const parts = (title || "").split(/\s*[-–|]\s*/).map(s => s.trim()).filter(Boolean);
        const roleRe = /(ceo|cfo|coo|cto|cio|ciso|cmo|vp|vice|diretor|director|head|gerente|manager|chief|lider|líder|founder|sócio|presidente|superintendente)/i;
        for (const part of parts) {
          const lp = part.toLowerCase();
          if (lp === (name || "").toLowerCase()) continue;
          if (lp.includes("linkedin")) continue;
          if (lp === (companyName || "").toLowerCase()) continue;
          if (roleRe.test(part)) {
            return part.replace(new RegExp(`\\s+(na|no|at|@)\\s+${(companyName || "").replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}.*`,"i"),"").trim();
          }
        }
        const m = (snippet || "").match(new RegExp(`((?:${roleRe.source})[A-Za-zÀ-ÿ]*(?:\\s+[A-Za-zÀ-ÿ]+){0,4})`,"i"));
        if (m && m[1] && m[1].length >= 3 && m[1].length <= 50) return m[1].trim();
        return parts.find(p => p.toLowerCase() !== (companyName || "").toLowerCase()) || "";
      }

      for (const q of queries) {
        try {
          const r = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: tavilyKey, query: q, search_depth: "advanced", max_results: 6, include_raw_content: false }),
          });
          if (!r.ok) { errors.push(`Tavily: HTTP ${r.status}`); continue; }
          const json = await r.json();
          for (const result of (json.results || [])) {
            if (!result.url?.includes("linkedin.com/in/")) continue;
            const titleParts = (result.title || "").split(/\s*[-–|]\s*/);
            const name = (titleParts[0] || "").trim();
            if (!name || name.length < 4) continue;
            const snippet     = result.content || result.snippet || "";
            const snippetLow  = snippet.toLowerCase();
            const companyLow  = company.toLowerCase();
            const companyWords = companyLow.split(/\s+/).filter(w => w.length > 3);
            const allMatch = companyWords.length > 0 && companyWords.every(w => snippetLow.includes(w));
            const domainMatch = domain && result.url?.toLowerCase().includes(domain.toLowerCase().split(".")[0]);
            if (!allMatch && !domainMatch) continue;
            if (/\b(ex-|former|anteriormente|previously)\b/i.test(snippet.slice(0, 200))) continue;
            const role = extractRole(result.title, snippet, name, company);
            add({
              nome:     name,
              cargo:    role,
              linkedin: result.url,
              email:    "",
              email_confidence: 0,
              is_senior: /ceo|cto|ciso|coo|cfo|director|diretor|head|vp|chief|vice|presidente/i.test(role),
              source:   "LinkedIn (Tavily)",
            });
          }
        } catch (e) {
          errors.push(`Tavily: ${e.message}`);
        }
      }
      const tavilyCount = contacts.filter(c => c.source?.includes("Tavily")).length;
      if (tavilyCount) sources.push(`LinkedIn público (${tavilyCount} perfis)`);
    }

    // Sort: senior first, then by email confidence
    contacts.sort((a, b) => {
      if (a.is_senior && !b.is_senior) return -1;
      if (!a.is_senior && b.is_senior) return 1;
      return (b.email_confidence || 0) - (a.email_confidence || 0);
    });

    return res.status(200).json({ company, total: contacts.length, contacts: contacts.slice(0, 12), sources, errors });

  } catch (e) {
    return res.status(200).json({ contacts: [], sources: [], errors: [`Erro interno: ${e.message}`], total: 0 });
  }
}