// api/cron/send-emails.js — Vercel serverless (acionado pelo Vercel Cron)
// Roda diariamente. Para cada usuário com Gmail conectado:
//   1. Lê os touches de e-mail agendados (tasks:${userId} no KV)
//   2. Envia os que estão "scheduled" e com scheduledFor <= agora, via Gmail API
//   3. Marca como "sent" e libera o próximo touch da cadência
//   4. Salva o resultado de volta no KV — o frontend reconcilia isso com o localStorage
//      na próxima vez que a Central de Tarefas for aberta.
//
// Protegido por CRON_SECRET — o Vercel injeta esse header automaticamente em
// crons configurados via vercel.json quando a env var CRON_SECRET existe.

import { kv } from "@vercel/kv";
import { getValidAccessToken } from "../auth/_getAccessToken.js";

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: "Não autorizado." });
    }
  }

  const summary = { usersScanned: 0, emailsSent: 0, errors: [] };

  try {
    const userIds = await kv.smembers("active_task_users");
    summary.usersScanned = (userIds || []).length;

    for (const userId of userIds || []) {
      try {
        await processUser(userId, summary);
      } catch (err) {
        summary.errors.push({ userId, error: err.message });
      }
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
    if (t.sentAt) continue; // já processado nesta corrida ou anterior

    if (!t.contactEmail) {
      // Sem e-mail resolvido para o contato — não dá para enviar automaticamente.
      // Marca como bloqueado para aparecer na Central de Tarefas como ação manual.
      t.status = "blocked";
      t.blockReason = "sem_email";
      changed = true;
      summary.errors.push({ userId, task: t.seqId + ":" + t.idx, error: "Sem e-mail do contato — enviar manualmente." });
      continue;
    }

    const tokenResult = await getValidAccessToken(userId);
    if (!tokenResult.ok) {
      summary.errors.push({ userId, error: tokenResult.error });
      break; // problema de conta inteira (token revogado etc) — para este usuário, tenta os próximos
    }

    try {
      await sendGmail(tokenResult.accessToken, {
        to: t.contactEmail,
        subject: t.subject || "",
        body: t.body || "",
      });
      t.status = "sent";
      t.sentAt = now;
      t.validatedBy = "auto";
      changed = true;
      summary.emailsSent++;

      // Libera o próximo touch da mesma sequência
      const next = tasks.find(function(x) { return x.seqId === t.seqId && x.idx === t.idx + 1; });
      if (next && next.status === "pending") { next.status = "scheduled"; changed = true; }
    } catch (err) {
      summary.errors.push({ userId, task: t.seqId + ":" + t.idx, error: "Falha ao enviar: " + err.message });
    }
  }

  if (changed) await kv.set(`tasks:${userId}`, tasks);
}

// ── Envio via Gmail API ──────────────────────────────────────────────────────
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
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "Erro desconhecido do Gmail API");
  return data;
}
