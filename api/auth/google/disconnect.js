// api/auth/google/disconnect.js — Vercel serverless
// Remove a conexão Gmail salva do usuário (não revoga o token no Google — apenas localmente).
// POST /api/auth/google/disconnect  body: { userId }

import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });

  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId ausente." });

  try {
    const record = await kv.get(`gmail_auth:${userId}`);
    // Tenta revogar o token no Google também, para higiene de permissões
    if (record && record.refreshToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${record.refreshToken}`, { method: "POST" });
      } catch (e) {
        // Revogação falhou (token já inválido, etc) — segue removendo localmente mesmo assim
      }
    }
    await kv.del(`gmail_auth:${userId}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Erro ao desconectar: " + err.message });
  }
}
