// api/tasks.js — Vercel serverless
// Endpoint único consolidado: sincronização de tarefas (push/pull do navegador)
// + processamento do Cron de envio automático de e-mail — tudo em 1 função só,
// para caber na cota de 12 Serverless Functions do plano Hobby.
//
//   POST /api/tasks                (body: {userId, tasks})  → salva o estado do navegador no KV
//   GET  /api/tasks?userId=xxx                              → devolve o estado salvo (reconciliação)
//   GET  /api/tasks?cron=1                                  → acionado pelo Vercel Cron 1x/dia,
//                                                                protegido por CRON_SECRET
//
// Requer env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CRON_SECRET
// Requer KV_REST_API_URL / KV_REST_API_TOKEN (Upstash Redis)

import { kv } from "@vercel/kv";
import { getValidAccessToken } from "./auth/_getAccessToken.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "GET" && req.query.cron) return handleCron(req, res);
  if (req.method === "GET")  return handlePull(req, res);
  if (req.method === "POST") return handlePush(req, res);
  return res.status(405).json({ error: "Método não permitido." });
}

// ── PULL — devolve o estado salvo no servidor ───────────────────────────────────
async function handlePull(req, res) {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: "userId ausente." });
  try {
    const tasks = (await kv.get(`tasks:${userId}`)) || [];
    return res.status(200).json({ tasks });
  } catch (err) {
    return res.status(500).json({ error: "Erro ao ler tarefas: " + err.message });
  }
}

// ── PUSH — o navegador espelha o estado atual das sequências no KV ─────────────
async function handlePush(req, res) {
  const { userId, tasks } = req.body || {};
  if (!userId) return res.status(400).json({ error: "userId ausente." });
  if (!Array.isArray(tasks)) return res.status(400).json({ error: "tasks precisa ser um array." });
  try {
    await kv.set(`tasks:${userId}`, tasks);
    await kv.sadd("active_task_users", userId);
    return res.status(200).json({ ok: true, count: tasks.length });
  } catch (err) {
    return res.status(500).json({ error: "Erro ao salvar tarefas: " + err.message });
  }
}

// ── CRON — roda 1x/dia, envia e-mails devidos de todos os usuários ─────────────
async function handleCron(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${cronSecret}`) return res.status(401).json({ error: "Não autorizado." });
  }

  const summary = { usersScanned: 0, emailsSent: 0, errors: [] };
  try {
    const userIds = await kv.smembers("active_task_users");
    summary.usersScanned = (userIds || []).length;
    for (const userId of userIds || []) {
      try { await processUser(userId, summary); }
      catch (err) { summary.errors.push({ userId, error: err.message }); }
    }
    return res.status(200).json(summary);
  } catch (err) {
    return res.status(500).json({ error: "Erro no cron: " + err.message, summary });
  }
}

async function processUser(userId, summary) {
  const tasks = (await kv.get(`tasks:${userId}`)) || [];
  if (!tasks.length) return;

  const now = Date.now();
  let changed = false;

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (t.type !== "email") continue;
    if (t.status !== "scheduled") continue;
    if (!t.scheduledFor || t.scheduledFor > now) continue;
    if (t.sentAt) continue;

    if (!t.contactEmail) {
      t.status = "blocked";
      t.blockReason = "sem_email";
      changed = true;
      summary.errors.push({ userId, task: t.seqId + ":" + t.idx, error: "Sem e-mail do contato — enviar manualmente." });
      continue;
    }

    const tokenResult = await getValidAccessToken(userId);
    if (!tokenResult.ok) {
      summary.errors.push({ userId, error: tokenResult.error });
      break;
    }

    try {
      await sendGmail(tokenResult.accessToken, { to: t.contactEmail, subject: t.subject || "", body: t.body || "" });
      t.status = "sent";
      t.sentAt = now;
      t.validatedBy = "auto";
      changed = true;
      summary.emailsSent++;

      const next = tasks.find(function(x) { return x.seqId === t.seqId && x.idx === t.idx + 1; });
      if (next && next.status === "pending") { next.status = "scheduled"; changed = true; }
    } catch (err) {
      summary.errors.push({ userId, task: t.seqId + ":" + t.idx, error: "Falha ao enviar: " + err.message });
    }
  }

  if (changed) await kv.set(`tasks:${userId}`, tasks);
}

async function sendGmail(accessToken, { to, subject, body }) {
  const subjectEncoded = "=?UTF-8?B?" + Buffer.from(subject, "utf8").toString("base64") + "?=";
  const mime = [
    `To: ${to}`,
    `Subject: ${subjectEncoded}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `MIME-Version: 1.0`,
    ``,
    body,
  ].join("\r\n");
  const raw = Buffer.from(mime, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "Erro desconhecido do Gmail API");
  return data;
}
