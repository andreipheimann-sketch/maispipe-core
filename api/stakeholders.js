// api/stakeholders.js
// Layer 1: Hunter.io — verified emails by domain
// Layer 2: Apollo.io — people by title/company
// Layer 3: Tavily  — LinkedIn profiles from public web

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Always respond with JSON — never let unhandled exceptions return HTML
  try {
    return await runHandler(req, res);
  } catch (e) {
    return res.status(200).json({ contacts: [], sources: [], errors: ["Erro interno: " + e.message], total: 0 });
  }
}

async function runHandler(req, res) {
  const { company, domain } = req.body || {};
  if (!company) return res.status(400).json({ error: "company required" });

  const hunterKey  = process.env.HUNTER_API_KEY;
  const apolloKey  = process.env.APOLLO_API_KEY;
  const tavilyKey  = process.env.TAVILY_API_KEY;

  const results = { contacts: [], sources: [], errors: [] };
  const seen = new Set();

  function addContact(c) {
    const key = (c.nome || "").toLowerCase().replace(/\s/g,"").slice(0,8);
    if (!key || seen.has(key)) return;
    seen.add(key);
    results.contacts.push(c);
  }

  // ── LAYER 1: Hunter.io ──────────────────────────────────────────────────────
  if (hunterKey && domain) {
    try {
      const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=15&type=personal&seniority=senior,executive&api_key=${hunterKey}`;
      const r = await fetch(url);
      if (r.ok) {
        const json = await r.json();
        const emails = (json.data?.emails || []).filter(e =>
          e.value && e.value.toLowerCase().includes("@" + domain.toLowerCase())
        );
        const seniorRe = /ceo|cto|ciso|coo|cfo|vp\b|vice|direct|diret|manager|gerente|head|chief|founder|engineer|security|segurança|product|compliance/i;
        for (const e of emails) {
          if (!e.first_name && !e.last_name) continue;
          addContact({
            nome: [e.first_name, e.last_name].filter(Boolean).join(" "),
            cargo: e.position || "",
            email: e.value || "",
            email_confidence: e.confidence || 0,
            linkedin: e.linkedin || "",
            phone: e.phone_number || "",
            is_senior: seniorRe.test(e.position || ""),
            source: "Hunter.io",
          });
        }
        if (results.contacts.length) results.sources.push(`Hunter.io (${results.contacts.length} contatos)`);
      } else {
        results.errors.push(`Hunter.io: HTTP ${r.status}`);
      }
    } catch(e) { results.errors.push(`Hunter.io: ${e.message}`); }
  }

  // ── LAYER 2: Apollo.io ──────────────────────────────────────────────────────
  if (apolloKey) {
    const titles = ["CEO","CFO","COO","CTO","Diretor","Diretor Comercial","Diretor Financeiro","VP","Vice-Presidente","Head","Gerente","Founder","Sócio","Presidente","Superintendente"];
    try {
      const body = {
        api_key: apolloKey,
        person_titles: titles.slice(0,8),
        person_locations: ["Brazil", "Brasil"],
        page: 1,
        per_page: 15,
      };
      if (domain) body.q_organization_domains = [domain];
      else body.q_organization_name = company;

      const r = await fetch("https://api.apollo.io/v1/mixed_people/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": apolloKey, "Cache-Control": "no-cache" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const json = await r.json();
        for (const p of (json.people || [])) {
          const existingEmails = results.contacts.map(c => c.email).filter(Boolean);
          const email = p.email || "";
          if (email && existingEmails.includes(email)) continue;

          // Strict Brazil-only filter
          const country = (p.country || (p.organization && p.organization.country) || "").toLowerCase();
          const city    = (p.city || p.state || "").toLowerCase();
          const brazilCities = /são paulo|sao paulo|rio de janeiro|belo horizonte|curitiba|brasilia|brasília|porto alegre|salvador|recife|fortaleza|manaus|goiania|goiânia|campinas|guarulhos|florianopolis|florianópolis/i;
          // Require explicit Brazil OR a known Brazilian city — reject if country is explicitly non-Brazil
          const isExplicitlyForeign = country && !country.includes("brazil") && !country.includes("brasil");
          if (isExplicitlyForeign) continue;
          const isBrazil = country.includes("brazil") || country.includes("brasil") || brazilCities.test(city) || (!country && !city);
          if (!isBrazil) continue;

          // Must belong to this company (when searching by name without domain)
          if (!domain) {
            const orgName = ((p.organization && p.organization.name) || "").toLowerCase();
            const companyLower = company.toLowerCase();
            if (orgName && !orgName.includes(companyLower.slice(0,6)) && !companyLower.includes(orgName.slice(0,6))) continue;
          }

          addContact({
            nome: p.name || [p.first_name, p.last_name].filter(Boolean).join(" "),
            cargo: p.title || "",
            email: email,
            email_confidence: email ? 75 : 0,
            linkedin: p.linkedin_url || "",
            phone: p.sanitized_phone || "",
            cidade: p.city || "",
            pais: "Brasil",
            is_senior: true,
            source: "Apollo.io",
          });
        }
        const apolloCount = results.contacts.filter(c => c.source === "Apollo.io").length;
        if (apolloCount) results.sources.push(`Apollo.io (${apolloCount} perfis)`);
      } else {
        const txt = await r.text();
        results.errors.push(`Apollo.io: HTTP ${r.status} — ${txt.slice(0,120)}`);
      }
    } catch(e) { results.errors.push(`Apollo.io: ${e.message}`); }
  }

  // ── LAYER 3: Tavily — LinkedIn public profiles ──────────────────────────────
  if (tavilyKey) {
    // Use exact company name in quotes to reduce false positives
    const companyQ = `"${company}"`;
    const queries = [
      `${companyQ} (CEO OR CFO OR CTO OR COO OR Diretor OR VP OR "Vice-Presidente" OR Fundador OR Presidente) site:linkedin.com/in Brasil`,
      `${companyQ} (Gerente OR "Head de" OR Superintendente OR Sócio OR "Diretor Comercial" OR "Diretor Financeiro") site:linkedin.com/in Brasil`,
    ];

    function extractRole(title, snippet, name, companyName) {
      var parts = (title || "").split(/\s*[-–|]\s*/).map(function(s){ return s.trim(); }).filter(Boolean);
      var candidates = parts.filter(function(p) {
        var lp = p.toLowerCase();
        if (lp === (name || "").toLowerCase()) return false;
        if (lp.indexOf("linkedin") >= 0) return false;
        return true;
      });
      var roleRe = /(ceo|cfo|coo|cto|cio|ciso|cmo|vp|vice|diretor|director|head|gerente|manager|chief|lider|líder|coordenador|analista|especialista|founder|s[oó]cio|presidente|superintendente)/i;
      for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        var lc = c.toLowerCase();
        if (lc === (companyName || "").toLowerCase()) continue;
        if (roleRe.test(c)) {
          var clean = c.replace(new RegExp("\\s+(na|no|at|@)\\s+" + (companyName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ".*", "i"), "").trim();
          return clean || c;
        }
      }
      var sn = snippet || "";
      var m = sn.match(new RegExp("((?:" + roleRe.source + ")[A-Za-zÀ-ÿ]*(?:\\s+(?:de|da|do|of|e|&|ao|aos)?\\s*[A-Za-zÀ-ÿ]+){0,4})", "i"));
      if (m && m[1]) {
        var found = m[1].trim().replace(/\s{2,}/g, " ");
        var cre = new RegExp("\\s+(na|no|da|do|at|@)\\s+" + (companyName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ".*", "i");
        found = found.replace(cre, "").trim();
        found = found.replace(/\s+(na|no|da|do|de|ha|há|em|e|at|@)$/i, "").trim();
        if (found.length >= 3 && found.length <= 50) return found;
      }
      for (var j = 0; j < candidates.length; j++) {
        if (candidates[j].toLowerCase() !== (companyName || "").toLowerCase()) return candidates[j];
      }
      return "";
    }

    for (const q of queries) {
      try {
        const r = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: tavilyKey, query: q, search_depth: "advanced", max_results: 6, language: "pt", country: "BR", include_raw_content: false }),
        });
        if (!r.ok) { results.errors.push(`Tavily L3: HTTP ${r.status}`); continue; }
        const json = await r.json();
        for (const result of (json.results || [])) {
          const url = result.url || "";
          if (!url.includes("linkedin.com/in/")) continue;
          const titleParts = (result.title || "").split(/\s*[-–|]\s*/);
          const name = (titleParts[0] || "").trim();
          if (!name || name.length < 4 || name.toLowerCase() === company.toLowerCase()) continue;
          const snippet = (result.content || result.snippet || "");
          const snippetLower = snippet.toLowerCase();
          // STRICT: snippet must explicitly mention the company name (not just a partial word match)
          const companyLower = company.toLowerCase();
          const companyWords = companyLower.split(/\s+/).filter(w => w.length > 3);
          // All significant words of company must appear in snippet
          const allWordsMatch = companyWords.length > 0 && companyWords.every(w => snippetLower.includes(w));
          // OR domain keyword must appear in the URL itself
          const domainInUrl = domain && url.toLowerCase().includes(domain.toLowerCase().split(".")[0]);
          if (!allWordsMatch && !domainInUrl) continue;
          // Reject if snippet mentions company but in a "previous role" or "former" context
          if (/\b(ex-|former|anteriormente|anterieur|previously)\b/i.test(snippet.slice(0,200))) continue;
          const role = extractRole(result.title, snippet, name, company);
          addContact({
            nome: name,
            cargo: role,
            linkedin: url,
            email: "",
            email_confidence: 0,
            is_senior: /ceo|cto|ciso|coo|cfo|director|diretor|head|vp|chief|vice|presidente/i.test(role),
            source: "LinkedIn (Tavily)",
          });
        }
      } catch(e) { results.errors.push(`Tavily L3: ${e.message}`); }
    }
    const tavilyCount = results.contacts.filter(c => c.source?.includes("Tavily")).length;
    if (tavilyCount) results.sources.push(`LinkedIn público (${tavilyCount} perfis)`);
  }

    // Extrai o cargo do titulo do LinkedIn ou, como fallback, do snippet.
    function extractRole(title, snippet, name, companyName) {
      var parts = (title || "").split(/\s*[-–|]\s*/).map(function(s){ return s.trim(); }).filter(Boolean);
      // Remove a parte que e o nome e a que e "LinkedIn"
      var candidates = parts.filter(function(p) {
        var lp = p.toLowerCase();
        if (lp === (name || "").toLowerCase()) return false;
        if (lp.indexOf("linkedin") >= 0) return false;
        return true;
      });
      var roleRe = /(ceo|cfo|coo|cto|cio|ciso|cmo|vp|vice|diretor|director|head|gerente|manager|chief|lider|líder|coordenador|analista|especialista|founder|s[oó]cio|presidente|superintendente)/i;
      // 1) candidato do titulo que parece cargo (contem palavra de cargo e nao e so a empresa)
      for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        var lc = c.toLowerCase();
        if (lc === (companyName || "").toLowerCase()) continue;
        // remove sufixo "at Empresa" / "na Empresa" se presente
        if (roleRe.test(c)) {
          var clean = c.replace(new RegExp("\\s+(na|no|at|@)\\s+" + (companyName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ".*", "i"), "").trim();
          return clean || c;
        }
      }
      // 2) fallback: extrair cargo curto do snippet (ate ~6 palavras a partir da palavra de cargo)
      var sn = snippet || "";
      var m = sn.match(new RegExp("((?:" + roleRe.source + ")[A-Za-zÀ-ÿ]*(?:\\s+(?:de|da|do|of|e|&|ao|aos)?\\s*[A-Za-zÀ-ÿ]+){0,4})", "i"));
      if (m && m[1]) {
        var found = m[1].trim().replace(/\s{2,}/g, " ");
        // corta sufixo " na/no/da Empresa ..." se aparecer
        var cre = new RegExp("\\s+(na|no|da|do|at|@)\\s+" + (companyName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ".*", "i");
        found = found.replace(cre, "").trim();
        // corta conectores soltos ao final (ha, em, etc.)
        found = found.replace(/\s+(na|no|da|do|de|ha|há|em|e|at|@)$/i, "").trim();
        if (found.length >= 3 && found.length <= 50) return found;
      }
      // 3) primeiro candidato do titulo que nao e a empresa
      for (var j = 0; j < candidates.length; j++) {
        if (candidates[j].toLowerCase() !== (companyName || "").toLowerCase()) return candidates[j];
      }
      return "";
    }

    for (const q of queries) {
      try {
        const r = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: tavilyKey, query: q, search_depth: "advanced", max_results: 6, language: "pt", country: "Brazil", include_raw_content: false }),
        });
        if (!r.ok) { results.errors.push(`Tavily L3: HTTP ${r.status}`); continue; }
        const json = await r.json();
        for (const result of (json.results || [])) {
          const url = result.url || "";
          if (!url.includes("linkedin.com/in/")) continue;
          const titleParts = (result.title || "").split(/\s*[-–|]\s*/);
          const name = (titleParts[0] || "").trim();
          if (!name || name.length < 4 || name.toLowerCase() === company.toLowerCase()) continue;
          const snippet = (result.content || result.snippet || "");
          // Relaxed filter: check first word of company OR domain keyword
          const companyWords = company.toLowerCase().split(/\s+/).filter(w => w.length > 3);
          const snippetLower = snippet.toLowerCase();
          const matchesCompany = companyWords.some(w => snippetLower.includes(w));
          if (!matchesCompany && !url.includes(company.toLowerCase().split(" ")[0])) continue;
          const role = extractRole(result.title, snippet, name, company);
          addContact({
            nome: name,
            cargo: role,
            linkedin: url,
            email: "",
            email_confidence: 0,
            is_senior: /ceo|cto|ciso|coo|cfo|director|diretor|head|vp|chief|vice|presidente/i.test(role),
            source: "LinkedIn (Tavily)",
          });
        }
      } catch(e) { results.errors.push(`Tavily L3: ${e.message}`); }
    }
    const tavilyCount = results.contacts.filter(c => c.source?.includes("Tavily")).length;
    if (tavilyCount) results.sources.push(`LinkedIn público (${tavilyCount} perfis)`);
  }

  // Sort: senior first, then by email confidence
  results.contacts.sort((a, b) => {
    if (a.is_senior && !b.is_senior) return -1;
    if (!a.is_senior && b.is_senior) return 1;
    return (b.email_confidence || 0) - (a.email_confidence || 0);
  });

  return res.status(200).json({
    company,
    total: results.contacts.length,
    contacts: results.contacts.slice(0, 12),
    sources: results.sources,
    errors: results.errors,
  });
}
