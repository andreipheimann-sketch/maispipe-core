// api/search.js — Vercel serverless
// Busca informacoes institucionais da empresa via Tavily.
// Foca em perfil da empresa, nao em noticias recentes.

function isPtBr(text) {
  if (!text) return false;
  return /\b(do|da|de|em|com|que|para|por|são|está|foi|tem|uma|seu|sua|não|mais|anos?|bilhões?|milhões?|empresa|banco|mercado|clientes?|produtos?|serviços?|fundad|receita|faturamento|sede|brasil|brasileira)\b/i.test(text);
}

function cleanText(text) {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

// Descarta snippets que sao claramente noticias/releases/eventos
function isNewsSnippet(text) {
  if (!text) return false;
  return /\b(lança|anuncia|divulga|reporta|apontam|aponta|cresce|queda|alta de \d|baixa de \d|2024|2025|2026|janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|Dia das Mães|Black Friday|Natal|release|comunicado|IR\b|RI\b)\b/i.test(text);
}

function extractPtContent(results) {
  const ptDomains = /\.com\.br|\.org\.br|\.net\.br|folha|globo|estadao|valor|exame|infomoney|startups|canaltech|tecmundo|segs|neofeed|novatech|convergencia|gazetadopovo|correio|uol\.com|terra\.com|r7\.com|g1\.globo/i;
  const ptSources = results.filter(s => ptDomains.test(s.url || ""));
  const allSources = ptSources.length >= 2 ? ptSources : results;

  const snippets = allSources
    .map(s => cleanText(s.content || "").slice(0, 400))
    .filter(s => isPtBr(s) && !isNewsSnippet(s))
    .slice(0, 4);

  return snippets.join(" ").slice(0, 800) || null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "TAVILY_API_KEY nao configurada no servidor." });

  try {
    const { company, domain, context } = req.body || {};
    if (!company?.trim()) return res.status(400).json({ error: "Nome da empresa nao informado." });

    // Queries focadas em perfil institucional, evitando noticias
    const queries = [
      // 1. Perfil geral da empresa — sobre, missao, o que faz
      domain
        ? `site:${domain} sobre empresa historia missao`
        : `"${company}" empresa Brasil sobre história fundação missão`,
      // 2. Dados estruturais — porte, faturamento, colaboradores
      `"${company}" Brasil faturamento receita colaboradores funcionarios sede fundacao`,
      // 3. Liderança executiva brasileira
      `"${company}" Brasil CEO CFO CTO diretoria executivos lideranca`,
    ];

    const results = [];

    for (const q of queries) {
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: q,
          search_depth: "basic",
          max_results: 5,
          include_answer: true,
          language: "pt",
          country: "Brazil",
          // Excluir dominios de noticias e RI para focar em conteudo institucional
          exclude_domains: [
            "ri.itau.com.br", "relacionamento.itau.com.br",
            "infomoney.com.br", "valor.com.br", "estadao.com.br",
            "folha.com.br", "globo.com", "g1.globo.com",
            "exame.com", "startups.com.br",
          ],
        }),
      });

      if (!r.ok) {
        const text = await r.text();
        return res.status(502).json({ error: `Tavily respondeu ${r.status}: ${text.slice(0, 200)}` });
      }

      const json = await r.json();
      const rawAnswer = json.answer || "";
      const sources = (json.results || []).map(s => ({
        title: s.title,
        content: cleanText(s.content || ""),
        url: s.url,
      }));

      let answer = "";
      if (isPtBr(rawAnswer) && !isNewsSnippet(rawAnswer)) {
        answer = rawAnswer;
      } else {
        const ptContent = extractPtContent(sources);
        answer = ptContent || "";
        if (!answer && rawAnswer && !isNewsSnippet(rawAnswer)) answer = rawAnswer;
      }

      results.push({ query: q, answer, sources });
    }

    const uploadedContext = typeof context === "string" && context.trim()
      ? context.trim().slice(0, 4000)
      : null;

    return res.status(200).json({ results, uploadedContext });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno: " + (e.message || String(e)) });
  }
}
