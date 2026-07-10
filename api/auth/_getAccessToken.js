// api/auth/_getAccessToken.js
// Helper interno (não é uma rota — prefixo _ evita que o Vercel a exponha como endpoint).
// Usado pelo endpoint de envio de e-mail (Fase 3) para obter um access_token válido,
// renovando via refresh_token quando o access_token salvo já expirou.

import { kv } from "@vercel/kv";

export async function getValidAccessToken(userId) {
  const record = await kv.get(`gmail_auth:${userId}`);
  if (!record) return { ok: false, error: "Nenhuma conta Gmail conectada para este usuário." };

  const stillValid = record.accessToken && record.accessTokenExpiresAt && record.accessTokenExpiresAt > Date.now() + 60000;
  if (stillValid) return { ok: true, accessToken: record.accessToken, email: record.email };

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { ok: false, error: "Credenciais Google não configuradas." };

  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: record.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      // refresh_token pode ter sido revogado pelo usuário diretamente no Google
      return { ok: false, error: "Falha ao renovar token: " + (data.error_description || data.error || "erro desconhecido"), needsReconnect: data.error === "invalid_grant" };
    }
    const updated = Object.assign({}, record, {
      accessToken: data.access_token,
      accessTokenExpiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    });
    await kv.set(`gmail_auth:${userId}`, updated);
    return { ok: true, accessToken: data.access_token, email: record.email };
  } catch (err) {
    return { ok: false, error: "Erro de rede ao renovar token: " + err.message };
  }
}
