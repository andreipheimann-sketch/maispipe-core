// api/_elevenSignedUrl.js
// O prefixo "_" faz a Vercel NÃO contar este arquivo como função serverless (limite de 12 no Hobby).
// Importe-o de uma função que já existe, por exemplo em api/setup.js:
//
//   import { handleElevenSignedUrl } from './_elevenSignedUrl.js';
//   export default async function handler(req, res) {
//     if (req.query.action === 'eleven-signed-url') return handleElevenSignedUrl(req, res);
//     ... resto do handler atual ...
//   }
//
// Variáveis de ambiente (Vercel): ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, APP_ORIGIN (ex.: https://app.maispipe.com.br)
// Se o projeto não usa ESM, troque por module.exports / require.

export async function handleElevenSignedUrl(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  // Proteção básica de origem. TODO: validar também a sessão do usuário logado no +Pipe
  // e aplicar rate limit (ex.: Upstash) para ninguém queimar seus minutos.
  const allowed = process.env.APP_ORIGIN;
  const origin = req.headers.origin || req.headers.referer || '';
  if (allowed && !origin.startsWith(allowed)) return res.status(403).json({ error: 'forbidden' });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) return res.status(503).json({ error: 'agent_not_configured' });

  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { 'xi-api-key': apiKey } }
    );
    if (!r.ok) return res.status(502).json({ error: 'upstream_failed', status: r.status });
    const data = await r.json();
    return res.status(200).json({ signedUrl: data.signed_url });
  } catch {
    return res.status(502).json({ error: 'upstream_unreachable' });
  }
}
