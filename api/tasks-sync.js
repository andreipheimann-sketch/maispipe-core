// api/tasks-sync.js — Vercel serverless
// Ponte entre o localStorage do navegador e o servidor. Como as sequências vivem
// no localStorage (client-only), o Cron de envio automático não teria como enxergá-las.
// Este endpoint espelha os touches de e-mail agendados no Vercel KV, para o Cron ler.
//
// POST /api/tasks-sync   body: { userId, tasks: [...] }  → salva o estado atual
// GET  /api/tasks-sync?userId=xxx                         → devolve o estado salvo no servidor
//                                                              (usado para reconciliar após o Cron rodar)

import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "GET") {
    const userId = req.query.userId;
    if (!userId) return res.status(400).json({ error: "userId ausente." });
    try {
      const tasks = (await kv.get(`tasks:${userId}`)) || [];
      return res.status(200).json({ tasks });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao ler tarefas: " + err.message });
    }
  }

  if (req.method === "POST") {
    const { userId, tasks } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId ausente." });
    if (!Array.isArray(tasks)) return res.status(400).json({ error: "tasks precisa ser um array." });

    try {
      await kv.set(`tasks:${userId}`, tasks);
      // Mantém um registro de quais usuários têm tarefas ativas — o Cron usa isso
      // para saber quem varrer, sem precisar de uma tabela de usuários completa.
      await kv.sadd("active_task_users", userId);
      return res.status(200).json({ ok: true, count: tasks.length });
    } catch (err) {
      return res.status(500).json({ error: "Erro ao salvar tarefas: " + err.message });
    }
  }

  return res.status(405).json({ error: "Método não permitido." });
}
