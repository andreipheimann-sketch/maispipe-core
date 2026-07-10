// api/auth/google/start.js — Vercel serverless
// Inicia o fluxo OAuth do Google. Redireciona o usuário para a tela de consentimento.
// Requer env vars: GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI (ou deriva do host da requisição)

export default async function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "GOOGLE_CLIENT_ID não configurada." });

  // Deriva a redirect URI do host atual se não vier explícita — evita hardcode de domínio
  const proto = (req.headers["x-forwarded-proto"] || "https");
  const host  = req.headers["x-forwarded-host"] || req.headers.host;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${proto}://${host}/api/auth/google/callback`;

  // "state" — token anti-CSRF simples, associa o callback à sessão do usuário no app.
  // O userId vem via query string (?userId=xxx) da chamada feita pelo frontend autenticado.
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: "userId ausente na requisição." });

  const state = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString("base64url");

  const scopes = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",     // necessário para receber refresh_token
    prompt: "consent",          // força tela de consentimento sempre — garante refresh_token mesmo em reconexões
    state,
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.writeHead(302, { Location: authUrl });
  res.end();
}
