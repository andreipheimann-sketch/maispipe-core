// api/auth/google.js — Vercel serverless
// Endpoint único consolidado para todo o fluxo OAuth do Gmail — economiza cota de
// Serverless Functions no plano Hobby (limite de 12), que seria estourada com 4 arquivos separados.
//
// Roteamento interno por ?action=start|callback|status|disconnect|send
//   GET  /api/auth/google?action=start&userId=xxx        → redireciona para o Google
//   GET  /api/auth/google?action=callback&code=...&state=... → processa o retorno do Google
//   GET  /api/auth/google?action=status&userId=xxx       → verifica se está conectado
//   POST /api/auth/google?action=disconnect  body:{userId} → desconecta
//   POST /api/auth/google?action=send  body:{userId,to,subject,body} → envio manual avulso
//
// Requer env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI (opcional)
// Requer KV_REST_API_URL / KV_REST_API_TOKEN (Upstash Redis, ver instruções enviadas)

import { kv } from "@vercel/kv";
import { getValidAccessToken } from "./_getAccessToken.js";

export default async function handler(req, res) {
  const action = req.query.action;
  switch (action) {
    case "start":      return handleStart(req, res);
    case "callback":   return handleCallback(req, res);
    case "status":     return handleStatus(req, res);
    case "disconnect": return handleDisconnect(req, res);
    case "send":       return handleSend(req, res);
    default:
      return res.status(400).json({ error: "Parâmetro 'action' inválido ou ausente. Use start, callback, status, disconnect ou send." });
  }
}

function getRedirectUri(req) {
  const proto = (req.headers["x-forwarded-proto"] || "https");
  const host  = req.headers["x-forwarded-host"] || req.headers.host;
  // O redirect_uri precisa ser IDÊNTICO ao cadastrado no Google Cloud Console.
  return process.env.GOOGLE_REDIRECT_URI || `${proto}://${host}/api/auth/google?action=callback`;
}
function getAppUrl(req) {
  const proto = (req.headers["x-forwarded-proto"] || "https");
  const host  = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

// ── START ──────────────────────────────────────────────────────────────────────
async function handleStart(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "GOOGLE_CLIENT_ID não configurada." });

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
    redirect_uri: getRedirectUri(req),
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  res.writeHead(302, { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
  res.end();
}

// ── CALLBACK ───────────────────────────────────────────────────────────────────
async function handleCallback(req, res) {
  const appUrl = getAppUrl(req);
  const { code, state, error: oauthError } = req.query;

  if (oauthError) return redirectWithStatus(res, appUrl, "error", "Autorização negada pelo Google: " + oauthError);
  if (!code || !state) return redirectWithStatus(res, appUrl, "error", "Callback inválido — parâmetros ausentes.");

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
  if (!clientId || !clientSecret) return redirectWithStatus(res, appUrl, "error", "Credenciais Google não configuradas no servidor.");

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getRedirectUri(req),
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return redirectWithStatus(res, appUrl, "error", "Falha ao obter tokens: " + (tokenData.error_description || tokenData.error || "erro desconhecido"));
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    if (!refresh_token) {
      return redirectWithStatus(res, appUrl, "error", "Google não retornou refresh_token. Revogue o acesso em myaccount.google.com/permissions e tente conectar novamente.");
    }

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const profile = await profileRes.json();
    const email = profile.email || "desconhecido";

    await kv.set(`gmail_auth:${userId}`, {
      provider: "google",
      email,
      refreshToken: refresh_token,
      accessToken: access_token,
      accessTokenExpiresAt: Date.now() + (expires_in || 3600) * 1000,
      connectedAt: Date.now(),
    });

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

// ── STATUS ─────────────────────────────────────────────────────────────────────
async function handleStatus(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ connected: false, error: "userId ausente." });

  try {
    const record = await kv.get(`gmail_auth:${userId}`);
    if (!record) return res.status(200).json({ connected: false });
    return res.status(200).json({ connected: true, email: record.email, connectedAt: record.connectedAt });
  } catch (err) {
    return res.status(500).json({ connected: false, error: "Erro ao consultar status: " + err.message });
  }
}

// ── DISCONNECT ─────────────────────────────────────────────────────────────────
async function handleDisconnect(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });

  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId ausente." });

  try {
    const record = await kv.get(`gmail_auth:${userId}`);
    if (record && record.refreshToken) {
      try { await fetch(`https://oauth2.googleapis.com/revoke?token=${record.refreshToken}`, { method: "POST" }); }
      catch (e) { /* revogação falhou — segue removendo localmente mesmo assim */ }
    }
    await kv.del(`gmail_auth:${userId}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Erro ao desconectar: " + err.message });
  }
}

// ── SEND — envio manual avulso a partir da tela de Contatos ────────────────────
async function handleSend(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });

  const { userId, to, subject, body } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId ausente." });
  if (!to)     return res.status(400).json({ error: "Destinatário (to) ausente." });

  const tokenResult = await getValidAccessToken(userId);
  if (!tokenResult.ok) {
    return res.status(tokenResult.needsReconnect ? 401 : 500).json({ error: tokenResult.error });
  }

  try {
    const subjectEncoded = "=?UTF-8?B?" + Buffer.from(subject || "", "utf8").toString("base64") + "?=";
    const mime = [
      `To: ${to}`,
      `Subject: ${subjectEncoded}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `MIME-Version: 1.0`,
      ``,
      body || "",
    ].join("\r\n");
    const raw = Buffer.from(mime, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenResult.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data.error?.message || "Erro desconhecido do Gmail API" });

    return res.status(200).json({ ok: true, messageId: data.id, from: tokenResult.email });
  } catch (err) {
    return res.status(500).json({ error: "Erro ao enviar: " + err.message });
  }
}
