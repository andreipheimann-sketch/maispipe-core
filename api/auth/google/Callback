// api/auth/google/callback.js — Vercel serverless
// Recebe o "code" do Google, troca por access_token + refresh_token, salva no Vercel KV
// e redireciona de volta para o app com um indicador de sucesso/erro na URL.
//
// Requer env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI (opcional)
// Requer integração Vercel KV ativa (KV_REST_API_URL / KV_REST_API_TOKEN injetadas automaticamente)

import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  const proto = (req.headers["x-forwarded-proto"] || "https");
  const host  = req.headers["x-forwarded-host"] || req.headers.host;
  const appUrl = `${proto}://${host}`;

  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return redirectWithStatus(res, appUrl, "error", "Autorização negada pelo Google: " + oauthError);
  }
  if (!code || !state) {
    return redirectWithStatus(res, appUrl, "error", "Callback inválido — parâmetros ausentes.");
  }

  let userId;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    userId = decoded.userId;
    if (!userId) throw new Error("userId ausente no state.");
  } catch (e) {
    return redirectWithStatus(res, appUrl, "error", "State inválido ou expirado.");
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirectWithStatus(res, appUrl, "error", "Credenciais Google não configuradas no servidor.");
  }
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${appUrl}/api/auth/google/callback`;

  try {
    // ── Troca o code por tokens ──────────────────────────────────────────────
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return redirectWithStatus(res, appUrl, "error", "Falha ao obter tokens: " + (tokenData.error_description || tokenData.error || "erro desconhecido"));
    }

    const { access_token, refresh_token, expires_in, id_token } = tokenData;
    if (!refresh_token) {
      // Acontece se o usuário já tinha autorizado antes e o Google não reenviou o refresh_token.
      // Com prompt=consent isso não deveria ocorrer, mas tratamos defensivamente.
      return redirectWithStatus(res, appUrl, "error", "Google não retornou refresh_token. Revogue o acesso em myaccount.google.com/permissions e tente conectar novamente.");
    }

    // ── Busca o e-mail da conta conectada ────────────────────────────────────
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const profile = await profileRes.json();
    const email = profile.email || "desconhecido";

    // ── Persiste no Vercel KV, associado ao userId do +Pipe ──────────────────
    const record = {
      provider: "google",
      email,
      refreshToken: refresh_token,
      accessToken: access_token,
      accessTokenExpiresAt: Date.now() + (expires_in || 3600) * 1000,
      connectedAt: Date.now(),
    };
    await kv.set(`gmail_auth:${userId}`, record);

    return redirectWithStatus(res, appUrl, "success", null, email);
  } catch (err) {
    return redirectWithStatus(res, appUrl, "error", "Erro interno: " + err.message);
  }
}

function redirectWithStatus(res, appUrl, status, message, email) {
  const params = new URLSearchParams({ gmail_connect: status });
  if (message) params.set("gmail_error", message);
  if (email) params.set("gmail_email", email);
  res.writeHead(302, { Location: `${appUrl}/?${params.toString()}#/integracoes` });
  res.end();
}
