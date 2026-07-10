// api/auth/google/status.js — Vercel serverless
// Retorna se o usuário tem uma conta Gmail conectada e qual e-mail.
// GET /api/auth/google/status?userId=xxx

import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ connected: false, error: "userId ausente." });

  try {
    const record = await kv.get(`gmail_auth:${userId}`);
    if (!record) return res.status(200).json({ connected: false });
    return res.status(200).json({
      connected: true,
      email: record.email,
      connectedAt: record.connectedAt,
    });
  } catch (err) {
    return res.status(500).json({ connected: false, error: "Erro ao consultar status: " + err.message });
  }
}
