/**
 * PipeAgent — assistente de voz do +Pipe (ElevenLabs Agents)
 *
 * Dependência:  npm install @elevenlabs/react
 *
 * Modos de conexão (escolhidos automaticamente):
 *  - MOCKUP / plano Free: passe `agentId` (agente público, sem autenticação). Nenhuma função serverless necessária.
 *  - PRODUÇÃO: passe `signedUrlEndpoint` (ex.: "/api/setup?action=eleven-signed-url"). A API key fica no servidor.
 *
 * Plano Free = somente voz (mensagens de texto exigem Starter+). Por isso o componente é voice-first,
 * com transcrição exibida a partir dos eventos de mensagem.
 *
 * Client tools (precisam estar declaradas no painel do agente com EXATAMENTE estes nomes):
 *   get_current_view, get_pipeline_summary, get_accounts_summary, get_tasks_summary, navigate_to
 *
 * Formato esperado de getSnapshot() — ajuste aos nomes reais do App.jsx. Envie apenas RESUMOS
 * (contagens, etapas, nomes de telas), nunca e-mails, telefones ou tokens:
 *   {
 *     view: 'contas',
 *     pipeline: { total: 42, porEtapa: { Prospecção: 20, Reunião: 8 } },
 *     accounts: { total: 120, enriquecidas: 64, comFalha: 3 },
 *     tasks: { pendentes: 12, atrasadas: 2 }
 *   }
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as ElevenReact from '@elevenlabs/react';

const { useConversation } = ElevenReact;
// Versões recentes do SDK exigem ConversationProvider; versões antigas não exportam. Funciona nos dois casos.
const Provider = ElevenReact.ConversationProvider || (({ children }) => children);

const USAGE_KEY = 'pp_agent_usage_v1';
const FREE_MONTH_SECONDS = 15 * 60;

const readUsage = () => {
  try {
    const month = new Date().toISOString().slice(0, 7);
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
    return raw.month === month ? raw.sec || 0 : 0;
  } catch {
    return 0;
  }
};
const addUsage = (sec) => {
  try {
    const month = new Date().toISOString().slice(0, 7);
    localStorage.setItem(USAGE_KEY, JSON.stringify({ month, sec: readUsage() + sec }));
  } catch {
    /* storage indisponível: ignora */
  }
};
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

const css = `
.pp-agent{position:fixed;right:20px;bottom:20px;z-index:60;font-family:inherit}
.pp-agent *{box-sizing:border-box}
.pp-agent__fab{display:flex;align-items:center;gap:8px;height:48px;padding:0 18px;border:0;border-radius:24px;background:#0f172a;color:#fff;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 8px 24px rgba(15,23,42,.25)}
.pp-agent__fab:hover{background:#1e293b}
.pp-agent button:focus-visible{outline:2px solid #64748b;outline-offset:2px}
.pp-agent__panel{position:absolute;right:0;bottom:60px;width:360px;max-width:calc(100vw - 32px);height:480px;max-height:calc(100dvh - 110px);display:flex;flex-direction:column;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 20px 48px rgba(15,23,42,.18);overflow:hidden;animation:pp-in .16s ease-out}
.pp-agent__head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;border-bottom:1px solid #e2e8f0;background:#f8fafc}
.pp-agent__title{font-size:14px;font-weight:700;margin:0}
.pp-agent__badge{margin-left:8px;padding:2px 8px;border-radius:999px;background:#e2e8f0;color:#475569;font-size:11px;font-weight:600}
.pp-agent__close{width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:#475569;font-size:18px;cursor:pointer}
.pp-agent__close:hover{background:#e2e8f0}
.pp-agent__stage{display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 14px 8px;min-height:132px}
.pp-agent__orb{width:56px;height:56px;border-radius:50%;background:#0f172a;transition:background .2s}
.pp-agent__orb[data-state="listening"]{background:#475569}
.pp-agent__orb[data-state="speaking"]{animation:pp-pulse 1.1s ease-in-out infinite}
.pp-agent__orb[data-state="error"]{background:#b91c1c}
.pp-agent__status{margin:0;font-size:13px;color:#475569;text-align:center;min-height:36px}
.pp-agent__timer{font-size:12px;color:#64748b;font-variant-numeric:tabular-nums;min-height:16px}
.pp-agent__log{flex:1;overflow-y:auto;padding:8px 14px;display:flex;flex-direction:column;gap:8px;border-top:1px solid #f1f5f9}
.pp-agent__msg{max-width:85%;padding:8px 10px;border-radius:12px;font-size:13px;line-height:1.4}
.pp-agent__msg[data-from="agent"]{align-self:flex-start;background:#f1f5f9}
.pp-agent__msg[data-from="user"]{align-self:flex-end;background:#0f172a;color:#fff}
.pp-agent__foot{padding:12px 14px;border-top:1px solid #e2e8f0;display:flex;flex-direction:column;gap:8px}
.pp-agent__cta{height:44px;border:0;border-radius:10px;background:#0f172a;color:#fff;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer}
.pp-agent__cta[data-variant="end"]{background:#fff;color:#0f172a;border:1px solid #cbd5e1}
.pp-agent__cta:disabled{opacity:.6;cursor:progress}
.pp-agent__hint{margin:0;font-size:11px;color:#64748b;text-align:center}
@keyframes pp-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes pp-pulse{0%,100%{box-shadow:0 0 0 0 rgba(15,23,42,.35)}50%{box-shadow:0 0 0 12px rgba(15,23,42,0)}}
@media (max-width:480px){.pp-agent{right:12px;bottom:12px}.pp-agent__panel{width:calc(100vw - 24px)}}
@media (prefers-reduced-motion:reduce){.pp-agent__panel,.pp-agent__orb[data-state="speaking"]{animation:none}}
`;

function PipeAgentInner({
  agentId,
  signedUrlEndpoint,
  getSnapshot,
  onNavigate,
  allowedViews = [],
  userName,
  maxSessionSeconds = 180, // protege os 15 min/mês do plano Free
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | mic | connecting | error
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const [usedSec, setUsedSec] = useState(readUsage);

  const snapshotRef = useRef(getSnapshot);
  const navRef = useRef(onNavigate);
  const allowedRef = useRef(allowedViews);
  const elapsedRef = useRef(0);
  const fabRef = useRef(null);
  const closeRef = useRef(null);
  const logRef = useRef(null);

  useEffect(() => {
    snapshotRef.current = getSnapshot;
    navRef.current = onNavigate;
    allowedRef.current = allowedViews;
  });

  // Client tools leem sempre o estado mais recente via refs (identidade estável, sem reconectar).
  const clientTools = useMemo(() => {
    const snap = () => {
      try {
        return snapshotRef.current?.() || {};
      } catch {
        return {};
      }
    };
    const out = (v) => JSON.stringify(v ?? {});
    return {
      get_current_view: () => out({ view: snap().view ?? 'desconhecida' }),
      get_pipeline_summary: () => out(snap().pipeline),
      get_accounts_summary: () => out(snap().accounts),
      get_tasks_summary: () => out(snap().tasks),
      navigate_to: ({ view } = {}) => {
        if (!allowedRef.current.includes(view)) return 'Tela indisponível.';
        navRef.current?.(view);
        return `Abri a tela ${view}.`;
      },
    };
  }, []);

  const conversation = useConversation({
    clientTools,
    onConnect: () => setPhase('idle'),
    onDisconnect: () => {
      if (elapsedRef.current > 0) {
        addUsage(elapsedRef.current);
        setUsedSec(readUsage());
      }
      elapsedRef.current = 0;
      setPhase((p) => (p === 'error' ? p : 'idle'));
    },
    onMessage: ({ message, source }) => {
      if (!message) return;
      setMessages((m) => [...m.slice(-30), { id: `${Date.now()}-${m.length}`, from: source === 'user' ? 'user' : 'agent', text: message }]);
    },
    onError: (e) => {
      setError(typeof e === 'string' ? e : 'A conexão com o assistente falhou. Tente de novo.');
      setPhase('error');
    },
  });

  const connected = conversation.status === 'connected';
  const view = phase === 'error' ? 'error' : phase === 'mic' ? 'mic' : phase === 'connecting' || conversation.status === 'connecting' ? 'connecting' : connected ? (conversation.isSpeaking ? 'speaking' : 'listening') : 'idle';

  const STATUS = {
    idle: 'Toque em “Conversar” e pergunte sobre o +Pipe.',
    mic: 'Aguardando permissão do microfone…',
    connecting: 'Conectando…',
    listening: 'Ouvindo você…',
    speaking: 'Assistente falando…',
    error: error,
  };

  const start = useCallback(async () => {
    setError('');
    setMessages([]);
    setElapsed(0);
    elapsedRef.current = 0;
    try {
      setPhase('mic');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());

      setPhase('connecting');
      const opts = {
        connectionType: 'websocket',
        dynamicVariables: { user_name: userName || 'usuário' },
      };
      if (signedUrlEndpoint) {
        const r = await fetch(signedUrlEndpoint, { credentials: 'same-origin' });
        if (!r.ok) throw new Error('signed_url_failed');
        const { signedUrl } = await r.json();
        opts.signedUrl = signedUrl;
      } else if (agentId) {
        opts.agentId = agentId;
      } else {
        throw new Error('missing_config');
      }
      await conversation.startSession(opts);
    } catch (e) {
      const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
      setError(
        denied
          ? 'Sem acesso ao microfone. Libere a permissão no navegador e tente de novo.'
          : e?.message === 'missing_config'
            ? 'Assistente não configurado (agentId ou endpoint ausente).'
            : 'Não foi possível iniciar a conversa. Tente de novo em instantes.'
      );
      setPhase('error');
    }
  }, [agentId, signedUrlEndpoint, userName, conversation]);

  const end = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch {
      /* já encerrada */
    }
  }, [conversation]);

  // Cronômetro + corte automático da sessão
  useEffect(() => {
    if (!connected) return undefined;
    const id = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      if (elapsedRef.current >= maxSessionSeconds) end();
    }, 1000);
    return () => clearInterval(id);
  }, [connected, end, maxSessionSeconds]);

  // Encerra ao desmontar
  useEffect(() => () => { conversation.endSession?.().catch?.(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll da transcrição
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Foco: entra no painel ao abrir, volta ao botão ao fechar
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const closePanel = () => {
    setOpen(false);
    fabRef.current?.focus();
  };

  const busy = view === 'mic' || view === 'connecting';
  const usedMin = Math.min(15, Math.ceil(usedSec / 60));

  return (
    <div className="pp-agent">
      <style>{css}</style>

      {open && (
        <section
          className="pp-agent__panel"
          role="dialog"
          aria-label="Assistente de voz do +Pipe"
          onKeyDown={(e) => e.key === 'Escape' && closePanel()}
        >
          <header className="pp-agent__head">
            <h2 className="pp-agent__title">
              Assistente +Pipe<span className="pp-agent__badge">Teste</span>
            </h2>
            <button ref={closeRef} type="button" className="pp-agent__close" aria-label="Fechar assistente" onClick={closePanel}>
              ×
            </button>
          </header>

          <div className="pp-agent__stage">
            <div className="pp-agent__orb" data-state={view} aria-hidden="true" />
            <p className="pp-agent__status" role="status">{STATUS[view]}</p>
            <span className="pp-agent__timer">{connected ? `${fmt(elapsed)} / ${fmt(maxSessionSeconds)}` : ''}</span>
          </div>

          <div ref={logRef} className="pp-agent__log" role="log" aria-live="polite" aria-label="Transcrição da conversa">
            {messages.map((m) => (
              <div key={m.id} className="pp-agent__msg" data-from={m.from}>
                {m.text}
              </div>
            ))}
          </div>

          <footer className="pp-agent__foot">
            {connected ? (
              <button type="button" className="pp-agent__cta" data-variant="end" onClick={end}>
                Encerrar conversa
              </button>
            ) : (
              <button type="button" className="pp-agent__cta" onClick={start} disabled={busy}>
                {view === 'error' ? 'Tentar de novo' : 'Conversar'}
              </button>
            )}
            <p className="pp-agent__hint">
              Modo de teste · ~{usedMin} de 15 min usados neste navegador no mês
            </p>
          </footer>
        </section>
      )}

      <button
        ref={fabRef}
        type="button"
        className="pp-agent__fab"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? closePanel() : setOpen(true))}
      >
        <span aria-hidden="true">🎙</span> Assistente
      </button>
    </div>
  );
}

export default function PipeAgent(props) {
  return (
    <Provider>
      <PipeAgentInner {...props} />
    </Provider>
  );
}
