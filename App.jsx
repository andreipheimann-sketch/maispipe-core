import { useState, useEffect, useRef } from "react";
// -- STORAGE , localStorage (persists across reloads) -------------------------
var STORAGE_PREFIX = "bdrhelper_";
function storageGet(key) {
  return new Promise(function(resolve) {
    try {
      var raw = localStorage.getItem(STORAGE_PREFIX + key);
      resolve(raw ? JSON.parse(raw) : null);
    } catch(e) { resolve(null); }
  });
}
function storageSet(key, val) {
  return new Promise(function(resolve) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(val));
      resolve(true);
    } catch(e) { resolve(false); }
  });
}
function storageList(prefix) {
  return new Promise(function(resolve) {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX + prefix)) {
          keys.push(k.slice(STORAGE_PREFIX.length));
        }
      }
      resolve(keys);
    } catch(e) { resolve([]); }
  });
}
function storageDel(key) {
  return new Promise(function(resolve) {
    try {
      localStorage.removeItem(STORAGE_PREFIX + key);
      resolve(true);
    } catch(e) { resolve(false); }
  });
}
// -- USAGE / PLANS MODULE -----------------------------------------------------
// IMPORTANTE: Este modulo concentra TODO o controle de uso/plano.
// Hoje persiste em localStorage (Fase 1 - validacao). Na Fase 2, substituir o
// corpo destas funcoes por chamadas a uma serverless (/api/usage) que le/grava
// no Supabase, mantendo as MESMAS assinaturas. O resto do app nao muda.
var PLANS = {
  "starter":      { id:"starter",      label:"Starter",      limit:30,  color:"#0ea5e9" },
  "professional": { id:"professional", label:"Professional", limit:100, color:"#a5b4fc" },
  "free":         { id:"free",         label:"Trial",        limit:5,   color:"#52617a" },
};
var USAGE_KEY = "usage_state";

// Retorna o id do proximo plano acima (ou null se ja for o topo)
function nextPlanId(planId) {
  if (planId === "free") return "starter";
  if (planId === "starter") return "professional";
  return null;
}
function nextPlanMsg(planId) {
  var np = nextPlanId(planId);
  if (!np) return "Você já está no plano mais alto. Aguarde a renovação no próximo mês.";
  return "Migre para o plano " + PLANS[np].label + " e mapeie até " + PLANS[np].limit + " contas por mês.";
}

function currentPeriod() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
}

// Retorna {plan, period, used, limit, remaining}
function getUsage() {
  return new Promise(function(resolve) {
    try {
      var raw = localStorage.getItem(STORAGE_PREFIX + USAGE_KEY);
      var st = raw ? JSON.parse(raw) : null;
      var period = currentPeriod();
      if (!st || st.period !== period) {
        // novo mes -> zera o contador, mantem o plano
        st = { plan: (st && st.plan) || "free", period: period, used: 0 };
        localStorage.setItem(STORAGE_PREFIX + USAGE_KEY, JSON.stringify(st));
      }
      var plan = PLANS[st.plan] || PLANS.free;
      resolve({ plan: plan.id, planLabel: plan.label, planColor: plan.color, period: st.period, used: st.used, limit: plan.limit, remaining: Math.max(0, plan.limit - st.used) });
    } catch(e) {
      resolve({ plan:"free", planLabel:"Trial", planColor:"#64748b", period:currentPeriod(), used:0, limit:5, remaining:5 });
    }
  });
}

// Incrementa 1 mapeamento. Retorna {ok, usage} ou {ok:false, reason}
function consumeMapping() {
  return new Promise(function(resolve) {
    getUsage().then(function(u) {
      if (u.remaining <= 0) { resolve({ ok:false, reason:"limit", usage:u }); return; }
      try {
        var raw = localStorage.getItem(STORAGE_PREFIX + USAGE_KEY);
        var st = raw ? JSON.parse(raw) : { plan:"free", period:currentPeriod(), used:0 };
        st.used = (st.used||0) + 1;
        localStorage.setItem(STORAGE_PREFIX + USAGE_KEY, JSON.stringify(st));
        getUsage().then(function(u2){ resolve({ ok:true, usage:u2 }); });
      } catch(e) { resolve({ ok:false, reason:"error", usage:u }); }
    });
  });
}

function setPlan(planId, resetUsage) {
  return new Promise(function(resolve) {
    try {
      var raw = localStorage.getItem(STORAGE_PREFIX + USAGE_KEY);
      var st = raw ? JSON.parse(raw) : { period:currentPeriod(), used:0 };
      st.plan = planId;
      if (!st.period) st.period = currentPeriod();
      if (st.used == null) st.used = 0;
      // Ao contratar/migrar de plano, a cota e renovada (zera o contador).
      if (resetUsage) st.used = 0;
      localStorage.setItem(STORAGE_PREFIX + USAGE_KEY, JSON.stringify(st));
      resolve(true);
    } catch(e) { resolve(false); }
  });
}

// -- CSV PARSER ---------------------------------------------------------------
// Espera colunas: nome/empresa, site/website/url, linkedin (opcional).
// Tolerante a maiusculas, acentos e ordem das colunas.
function parseCSV(text) {
  var lines = text.split(/\r\n|\n|\r/).filter(function(l){ return l.trim().length; });
  if (!lines.length) return { rows: [], error: "Arquivo vazio." };

  function splitLine(line) {
    var out = []; var cur = ""; var inQ = false;
    for (var i=0;i<line.length;i++) {
      var ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if ((ch === "," || ch === ";") && !inQ) { out.push(cur); cur=""; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(function(s){ return s.trim(); });
  }

  function norm(s){ return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim(); }

  var header = splitLine(lines[0]).map(norm);
  var idxNome = header.findIndex(function(h){ return h==="nome"||h==="empresa"||h==="company"||h==="name"||h==="conta"||h==="account"; });
  var idxSite = header.findIndex(function(h){ return h==="site"||h==="website"||h==="url"||h==="domínio"||h==="domain"||h==="web"; });
  var idxLink = header.findIndex(function(h){ return h.indexOf("linkedin")>=0||h==="li"; });

  var hasHeader = idxNome >= 0;
  var start = hasHeader ? 1 : 0;
  if (!hasHeader) { idxNome = 0; idxSite = 1; idxLink = 2; }

  var rows = [];
  for (var r=start; r<lines.length; r++) {
    var cols = splitLine(lines[r]);
    var nome = (cols[idxNome]||"").trim();
    if (!nome) continue;
    rows.push({
      nome: nome,
      site: (idxSite>=0 ? (cols[idxSite]||"") : "").trim(),
      linkedin: (idxLink>=0 ? (cols[idxLink]||"") : "").trim(),
    });
  }
  if (!rows.length) return { rows: [], error: "Nenhuma linha valida encontrada. Verifique se ha uma coluna de nome/empresa." };
  return { rows: rows, error: null };
}

// -- CONSTANTS ----------------------------------------------------------------
var STATUS_CONFIG = {
  "prospecting": { label:"Em prospecção", color:"#52617a", bg:"#f8fafc", border:"#e2e8f0" },
  "contacted":   { label:"Contatado",     color:"#0369a1", bg:"#eff6ff", border:"#bfdbfe" },
  "meeting":     { label:"Reunião",       color:"#7c3aed", bg:"#f5f3ff", border:"#ddd6fe" },
  "won":         { label:"Convertido",    color:"#818cf8", bg:"#f0f3ff", border:"#c7d0fa" },
  "lost":        { label:"Perdido",       color:"#991b1b", bg:"#fff1f2", border:"#fecdd3" },
};
var STATUS_ORDER = ["prospecting","contacted","meeting","won","lost"];
var FIT_CONFIG = {
  "ALTO":  { bg:"#e8ecfd", border:"#6366f1", text:"#2d3a8c" },
  "MEDIO": { bg:"#fef3c7", border:"#f59e0b", text:"#92400e" },
  "BAIXO": { bg:"#fee2e2", border:"#ef4444", text:"#991b1b" },
};
var TIER_COLOR = { "Tier 1":"#2d3a8c", "Tier 2":"#92400e", "Tier 3":"#475569" };
// Sequence touch types
var TOUCH_TYPES = {
  email:    { label:"E-mail",       icon:"E", color:"#0ea5e9", bg:"#eff6ff" },
  linkedin: { label:"InMail",       icon:"in", color:"#0a66c2", bg:"#eff6ff" },
  whatsapp: { label:"WhatsApp",     icon:"W", color:"#16a34a", bg:"#f0f3ff" },
  call:     { label:"Cold Call",    icon:"C", color:"#92400e", bg:"#fffbeb" },
  follow:   { label:"Follow-up",    icon:"F", color:"#7c3aed", bg:"#f5f3ff" },
  breakup:  { label:"Breakup",      icon:"B", color:"#52617a", bg:"#f8fafc" },
};
// ── CLIENT CONFIG IMPORT ────────────────────────────────────────────────────
// O cliente ativo e controlado pela variavel de ambiente VITE_CLIENT no Vercel.
// Nao edite esta linha. Para adicionar um novo cliente, edite clientLoader.js.
// ── CORE CONFIG — driven entirely by localStorage (set during onboarding) ───
// No client files needed. All data comes from user setup or sensible defaults.
function getStoredIcp() {
  try {
    // Prefer DNA-refined ICP if setup was completed with Claude
    var dna = localStorage.getItem("pipe_setup_dna");
    if (dna) {
      var parsed = JSON.parse(dna);
      if (parsed && parsed.icp_refinado) {
        var r = parsed.icp_refinado;
        return {
          segmento:    r.segmento    || "",
          porte:       r.porte       || "",
          faturamento: "",
          regiao:      r.regiao      || "",
          cargos:      (r.cargos_primarios || []).join(", "),
          observacoes: (r.sinais_de_compra || []).join("; "),
          _dna: parsed,
        };
      }
    }
    var s = localStorage.getItem("pipe_icp"); return s ? JSON.parse(s) : {};
  } catch(e){ return {}; }
}
function getStoredDna() {
  try { var s = localStorage.getItem("pipe_setup_dna"); return s ? JSON.parse(s) : null; } catch(e){ return null; }
}
function getStoredProducts() {
  try { var s=localStorage.getItem("pipe_produtos"); return s?JSON.parse(s):[]; } catch(e){ return []; }
}
function getCompanySite() {
  try { return localStorage.getItem("pipe_company_site")||""; } catch(e){ return ""; }
}

// Generic stakeholder profiles — overridden by AI mapping per account
var STAKEHOLDER_PROFILES = [
  { id:"decisor",  label:"Decisor / C-Level",        angle:"estratégia e resultados do negócio",          pain:"pressão por resultados com menos recursos e mais risco" },
  { id:"tecnico",  label:"Diretor / Gerente Técnico", angle:"eficiência operacional e stack tecnológico",  pain:"complexidade crescente sem equipe ou orçamento proporcional" },
  { id:"comercial",label:"Diretor Comercial / VP",    angle:"crescimento de receita e ciclo de vendas",    pain:"ciclos longos, baixa conversão e pipeline imprevisível" },
  { id:"financeiro",label:"CFO / Diretor Financeiro", angle:"ROI, custo e previsibilidade financeira",     pain:"dificuldade em justificar investimentos sem métricas claras" },
  { id:"operacoes", label:"COO / Diretor de Operações",angle:"processos, escala e continuidade operacional",pain:"gargalos operacionais que limitam crescimento e margem" },
];

// Generic sequence templates — AI generates real content per account
var SEQUENCE_TEMPLATES = {};
STAKEHOLDER_PROFILES.forEach(function(p){
  SEQUENCE_TEMPLATES[p.id] = [
    { day:1,  type:"linkedin",  subject:"Sobre {empresa}", body:"Olá,\n\nVi o trabalho da {empresa} e gostaria de trocar uma ideia sobre {empresa}. Vale um papo?\n\nAbraço" },
    { day:3,  type:"email",     subject:"[{empresa}] Uma pergunta", body:"Olá,\n\nUma pergunta direta: qual o maior desafio que você enfrenta hoje em "+p.angle+"?\n\nAbraço" },
    { day:7,  type:"call",      subject:"Cold call — {empresa}", body:"Bom dia [Nome], tenho 30 segundos?\n\n[PAUSA]\n\nLigo porque trabalho com empresas de {setor} e gostaria de entender o cenário de vocês em "+p.angle+".\n\nVale 20 minutos?" },
    { day:12, type:"whatsapp",  subject:"WhatsApp — {empresa}", body:"Oi [Nome], tudo bem? Trabalhamos com empresas de {setor} e acredito que temos algo relevante para a {empresa}. Posso te contar?" },
    { day:18, type:"email",     subject:"[{empresa}] Última tentativa", body:"Olá,\n\nÚltima mensagem — prometo.\n\nSe o tema de "+p.angle+" ganhar prioridade, pode me chamar.\n\nAbraço" },
    { day:25, type:"breakup",   subject:"Encerrando — {empresa}", body:"Olá,\n\nEncerro o contato por aqui. Se houver oportunidade de conversa futura, fico à disposição.\n\nAbraço" },
  ];
});

// Generic one-touch variants
var ONE_TOUCH_VARIANTS = {
  email:[
    { subject:"[{nome}] Uma pergunta sobre {setor}", body:"Olá,\n\nUma pergunta direta para o {cargo} da {nome}: qual o maior desafio que vocês enfrentam hoje em {angulo}?\n\nAbraço" },
    { subject:"[{nome}] Vi algo relevante para vocês", body:"Olá,\n\nTrabalhando com empresas de {setor} percebi um padrão que pode ser relevante para a {nome}. Vale 20 minutos?\n\nAbraço" },
  ],
  linkedin:[
    { subject:"Pergunta para o {cargo} da {nome}", body:"Olá!\n\nVi o trabalho da {nome} em {setor}. Uma pergunta: o que mais toma energia hoje em {angulo}?\n\nAbraço" },
    { subject:"{nome} — oportunidade em {setor}", body:"Olá!\n\nEmpresas de {setor} com perfil da {nome} têm nos procurado para resolver {dor}. Vale um papo?\n\nAbraço" },
  ],
  call:[
    { subject:"Script Cold Call — {cargo} {nome}", body:"Bom dia [Nome], tenho 30 segundos?\n\n[PAUSA]\n\nLigo porque {nome} atua em {setor} e trabalho com empresas nesse perfil. Uma pergunta: qual o maior gargalo hoje em {angulo}?\n\n[ouvir]\n\nFaz sentido eu explicar como podemos ajudar?" },
  ],
  whatsapp:[
    { subject:"WhatsApp — {cargo} {nome}", body:"Oi [Nome]! Empresa de {setor} com perfil da {nome} — acredito que temos algo relevante para vocês em {angulo}. Posso te contar em 2 minutos?" },
  ],
  breakup:[
    { subject:"Encerrando — {nome}", body:"Olá,\n\nNão quero continuar incomodando.\n\nSe o tema de {angulo} ganhar prioridade, pode me chamar.\n\nAbraço" },
  ],
};

function safeArr(v) { return Array.isArray(v) ? v : []; }
// Canonical sort key: strips accents, punctuation, case — pure ASCII comparison
function sortKey(s) { return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,""); }
function sortAZ(a, b) { var ak=sortKey(a), bk=sortKey(b); return ak<bk?-1:ak>bk?1:0; }
function sortZA(a, b) { return sortAZ(b, a); }

// -- ICON (Google Material Symbols) -------------------------------------------
function Icon(props) {
  var size = props.size || 18;
  var fill = props.fill ? 1 : 0;
  return (
    <span
      className="material-symbols-rounded"
      style={Object.assign({
        fontSize: size,
        width: size,
        height: size,
        fontVariationSettings: "'FILL' "+fill+", 'wght' "+(props.weight||500)+", 'GRAD' 0, 'opsz' "+size,
        color: props.color || "currentColor",
        flexShrink: 0,
        userSelect: "none",
      }, props.style||{})}
    >
      {props.name}
    </span>
  );
}
function fmtDate(ts) {
  if (!ts) return "";
  var d = new Date(ts);
  return d.toLocaleDateString("pt-BR", { day:"2-digit", month:"short", year:"2-digit" });
}
function applyVars(text, acc, contactName) {
  var out = text
    .replace(/\{empresa\}/g, acc.nome || "a empresa")
    .replace(/\{setor\}/g, (acc.data && acc.data.empresa && acc.data.empresa.setor) || acc.setor || "tecnologia");
  if (contactName) {
    var first = String(contactName).trim().split(/\s+/)[0];
    if (first) out = out.replace(/\[Nome\]/g, first);
  }
  return out;
}
// -- MINI GAUGE ----------------------------------------------------------------
function MiniGauge(props) {
  var fc = FIT_CONFIG[props.score] || FIT_CONFIG.ALTO;
  var pct = props.score === "ALTO" ? 88 : props.score === "MEDIO" ? 55 : 22;
  var r = 18; var circ = Math.PI * r;
  return (
    <svg width="50" height="30" viewBox="0 0 50 30">
      <path d={"M " + (25-r) + " 26 A " + r + " " + r + " 0 0 1 " + (25+r) + " 26"} fill="none" stroke="#f1f5f9" strokeWidth="5" strokeLinecap="round"/>
      <path d={"M " + (25-r) + " 26 A " + r + " " + r + " 0 0 1 " + (25+r) + " 26"} fill="none" stroke={fc.border} strokeWidth="5" strokeLinecap="round" strokeDasharray={circ + " " + circ} strokeDashoffset={circ * (1 - pct/100)}/>
    </svg>
  );
}
// -- COPY BUTTON ---------------------------------------------------------------
function CopyBtn(props) {
  var _st_done = useState(false); var done = _st_done[0]; var setDone = _st_done[1];
  function handle() {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(props.text).then(function() { setDone(true); setTimeout(function(){setDone(false);}, 2000); });
    }
  }
  return (
    <button onClick={handle} style={{display:"flex",alignItems:"center",gap:4,background:done?"#e8ecfd":"#f8fafc",border:"1px solid "+(done?"#86efac":"#e2e8f0"),borderRadius:7,padding:"4px 10px",cursor:"pointer",fontSize:10,fontWeight:600,color:done?"#2d3a8c":"#64748b",transition:"all .2s",whiteSpace:"nowrap",fontFamily:"inherit",flexShrink:0}}>
      {done ? "Copiado!" : "Copiar"}
    </button>
  );
}
// -- SEQUENCE VIEW -------------------------------------------------------------
function SequenceView(props) {
  var accounts = props.accounts;
  var _st_selAcc = useState(null); var selAcc = _st_selAcc[0]; var setSelAcc = _st_selAcc[1];
  var _st_accSort = useState("az"); var accSort = _st_accSort[0]; var setAccSort = _st_accSort[1];
  var lastSeqReqTs = useRef(0);
  var _st_selProfile = useState(null); var selProfile = _st_selProfile[0]; var setSelProfile = _st_selProfile[1];
  var _st_customProfile = useState(null); var customProfile = _st_customProfile[0]; var setCustomProfile = _st_customProfile[1];
  var _st_customLabel = useState(""); var customLabel = _st_customLabel[0]; var setCustomLabel = _st_customLabel[1];
  var _st_customAngle = useState(""); var customAngle = _st_customAngle[0]; var setCustomAngle = _st_customAngle[1];
  var _st_generated = useState(null); var generated = _st_generated[0]; var setGenerated = _st_generated[1];
  var _st_saved = useState([]); var saved = _st_saved[0]; var setSaved = _st_saved[1];
  var _st_view = useState("builder"); var view = _st_view[0]; var setView = _st_view[1];
  var _st_openSeq = useState(null); var openSeq = _st_openSeq[0]; var setOpenSeq = _st_openSeq[1];
  var _st_genLoading = useState(false); var genLoading = _st_genLoading[0]; var setGenLoading = _st_genLoading[1];

  useEffect(function() {
    storageList("seq:").then(function(keys) {
      if (!keys.length) return;
      Promise.all(keys.map(storageGet)).then(function(items) {
        setSaved(items.filter(Boolean).sort(function(a,b){return (b.createdAt||0)-(a.createdAt||0);}));
      });
    });
  }, []);

  function buildOneTouchVariant(touch, profile, acc) {
    var cargo = profile.label || "Decisor";
    var angulo = profile.angle || "impacto no negócio";
    var nome = acc.nome || "a empresa";
    var setor = (acc.data && acc.data.empresa && acc.data.empresa.setor) || acc.setor || "tecnologia";
    var pain = profile.pain || "dores do negócio";

    var variants = ONE_TOUCH_VARIANTS;

    var pool = variants[touch.type] || variants.email;
    var variant = pool[Math.floor(Math.random() * pool.length)];
    return Object.assign({}, touch, {
      subject: applyVars(variant.subject, acc),
      body: applyVars(variant.body, acc)
    });
  }

  function regenerateTouch(idx) {
    if (!generated || !selProfile) return;
    var p = selProfile.id === "custom" ? selProfile : (STAKEHOLDER_PROFILES.find(function(x){return x.id===selProfile.id;}) || STAKEHOLDER_PROFILES[0]);
    var touch = generated.touches[idx];
    var setor = (selAcc.data && selAcc.data.empresa && selAcc.data.empresa.setor) || selAcc.setor || "tecnologia";
    function localFB() {
      var newTouch = buildOneTouchVariant(touch, p, selAcc);
      var nt = generated.touches.map(function(t,i){return i===idx?newTouch:t;});
      var upd = Object.assign({},generated,{touches:nt});
      setGenerated(upd);
      persistSeq(upd);
    }
    fetch("/api/gemini",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      empresa:selAcc.nome, setor:setor, cargo:p.label, angulo:p.angle, pain:p.pain, touches:[{day:touch.day,type:touch.type}],
      icp: getStoredIcp(),
      produtos: getStoredProducts(),
      companySite: getCompanySite(), dna: getStoredDna(),
      assinatura: getCompanySite() ? ("Consultor | " + getCompanySite()) : "Consultor",
    })})
      .then(function(r){return r.json();})
      .then(function(data){
        if (data && data.touches && data.touches.length) {
          var t0 = data.touches[0];
          var newTouch = Object.assign({}, touch, {subject:t0.subject||touch.subject, body:t0.body||touch.body});
          var nt = generated.touches.map(function(t,i){return i===idx?newTouch:t;});
          var upd = Object.assign({},generated,{touches:nt});
          setGenerated(upd);
          persistSeq(upd);
        } else { localFB(); }
      })
      .catch(localFB);
  }

    function buildCustomTemplate(profile, acc) {
    var nome = acc.nome || "a empresa";
    var setor = (acc.data && acc.data.empresa && acc.data.empresa.setor) || acc.setor || "tecnologia";
    var cargo = profile.label || "Decisor";
    var angulo = profile.angle || "impacto no negocio";
    var pain = profile.pain || "dores do cargo";
    var days = [1,3,6,10,15,21];
    var types = ["linkedin","email","call","email","whatsapp","breakup"];
    return days.map(function(day,i){
      var touch = {day:day, type:types[i], subject:"", body:""};
      return buildOneTouchVariant(touch, profile, acc);
    });
  }

  function generate() {
    if (!selAcc || !selProfile || genLoading) return;
    var p = selProfile.id === "custom" ? selProfile : (STAKEHOLDER_PROFILES.find(function(x){return x.id===selProfile.id;}) || STAKEHOLDER_PROFILES[0]);
    runGenerate(selAcc, p, null);
  }

  function runGenerate(acc, p, contactName) {
    if (!acc || !p || genLoading) return;
    var setor = (acc.data && acc.data.empresa && acc.data.empresa.setor) || acc.setor || "tecnologia";
    var cadência = [
      {day:1,type:"linkedin"},{day:3,type:"email"},{day:6,type:"call"},
      {day:10,type:"email"},{day:15,type:"whatsapp"},{day:21,type:"breakup"}
    ];

    function localFallback() {
      var template = (p.id === "custom") ? buildCustomTemplate(p, acc) : (SEQUENCE_TEMPLATES[p.id] || SEQUENCE_TEMPLATES.headcx);
      var touches = template.map(function(t) {
        return Object.assign({}, t, {body:applyVars(t.body, acc, contactName), subject:applyVars(t.subject||"", acc, contactName)});
      });
      var seq = {id:"seq:"+Date.now()+"-"+Math.random().toString(36).slice(2,6), account:acc, profile:p, contactName:contactName||"", touches:touches, createdAt:Date.now(), engine:"template"};
      setGenerated(seq);
      persistSeq(seq);
    }

    setGenLoading(true);
    var _icp = getStoredIcp() || {};
    var _produtos = getStoredProducts() || [];
    var _site = getCompanySite() || "";
    var _dna = getStoredDna();
    fetch("/api/gemini",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      empresa:acc.nome, setor:setor, cargo:p.label, angulo:p.angle, pain:p.pain, contato:contactName||"", touches:cadência,
      icp: _icp, produtos: _produtos, companySite: _site, dna: _dna,
      assinatura: _site ? ("Consultor | " + _site) : "Consultor",
    })})
      .then(function(r){ return r.json().then(function(d){ return {status:r.status, data:d}; }); })
      .then(function(res){
        var data = res.data;
        // Handle various response shapes from Claude
        var touches = null;
        if (data && Array.isArray(data.touches) && data.touches.length) {
          touches = data.touches;
        } else if (data && Array.isArray(data) && data.length && data[0].day) {
          touches = data; // Claude returned array directly
        }
        if (touches && touches.length) {
          var norm = touches.map(function(t){ return {day:(t&&t.day)||1, type:(t&&t.type)||"email", subject:applyVars(String((t&&t.subject)||""), acc, contactName), body:applyVars(String((t&&t.body!=null)?t.body:""), acc, contactName)}; });
          var seq = {id:"seq:"+Date.now()+"-"+Math.random().toString(36).slice(2,6), account:acc, profile:p, contactName:contactName||"", touches:norm, createdAt:Date.now(), engine:"ai"};
          setGenerated(seq);
          persistSeq(seq);
          props.showToast("Sequência gerada com IA e salva na biblioteca.", "#10b981");
        } else {
          var reason = (data && (data.error || data.message)) || ("HTTP " + res.status);
          var isQuota  = reason.toLowerCase().includes("quota") || reason.toLowerCase().includes("resource_exhausted") || String(res.status) === "429";
          var isKeyErr = reason.toLowerCase().includes("gemini_api_key") || reason.toLowerCase().includes("inválida") || reason.toLowerCase().includes("sem acesso") || reason.toLowerCase().includes("api_key");
          if (isKeyErr) {
            props.showToast("Erro de configuração: " + reason, "#ef4444", 8000);
          } else if (isQuota) {
            props.showToast("Quota do Gemini atingida. Aguarde alguns minutos.", "#ef4444");
          } else {
            props.showToast("IA indisponível: " + reason, "#f59e0b", 6000);
          }
          localFallback();
        }
      })
      .catch(function(err){ props.showToast("Falha de rede ao chamar IA, usando templates.", "#f59e0b"); localFallback(); })
      .finally(function(){ setGenLoading(false); });
  }

  function persistSeq(seq) {
    if (!seq) return;
    var id = seq.id || ("seq:" + Date.now() + "-" + Math.random().toString(36).slice(2,6));
    var toSave = Object.assign({}, seq, {id:id});
    storageSet(id, toSave).then(function() {
      setSaved(function(prev){
        var without = prev.filter(function(s){ return s.id !== id; });
        return [toSave].concat(without);
      });
    });
    return toSave;
  }
  function saveSeq() {
    if (!generated) return;
    persistSeq(generated);
    props.showToast("Sequência salva na biblioteca!", "#10b981");
  }

  // Geração disparada a partir de um contato real (vinda da aba Contatos).
  useEffect(function() {
    var req = props.seqRequest;
    if (!req || !req.ts || req.ts === lastSeqReqTs.current) return;
    lastSeqReqTs.current = req.ts;

    // Tenta casar com uma conta já mapeada pelo nome da empresa.
    var empNorm = (req.empresa || "").toLowerCase().trim();
    var matchedAcc = null;
    if (empNorm) {
      matchedAcc = accounts.filter(function(a){ return (a.nome||"").toLowerCase().trim() === empNorm; })[0] || null;
      if (!matchedAcc) matchedAcc = accounts.filter(function(a){ return empNorm && (a.nome||"").toLowerCase().indexOf(empNorm) >= 0; })[0] || null;
    }
    // Se não houver conta mapeada, cria uma conta sintética só para a geração.
    var acc = matchedAcc || { id:"contact-seq", nome:req.empresa || "a empresa", setor:"", data:null };

    // Perfil baseado no cargo real do contato.
    var profile = { id:"custom", label:req.cargo || "Decisor", angle:"impacto direto no negócio", pain:"dores específicas do cargo" };

    setView("builder");
    setSelAcc(acc);
    setCustomProfile(profile);
    setSelProfile(profile);
    setGenerated(null);

    runGenerate(acc, profile, req.nome || "");
    props.showToast("Gerando sequência para " + (req.nome || req.cargo || "o contato") + "...", "#6366f1");
    if (props.onConsumeSeqRequest) props.onConsumeSeqRequest();
  }, [props.seqRequest]);

  if (view === "library") {
    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
          <div style={{fontSize:22,fontWeight:800,color:"#0f172a"}}>{"Sequências Salvas"}</div>
          <button onClick={function(){setView("builder");}} style={{background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:10,padding:"9px 18px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{"Nova sequência"}</button>
        </div>
        {saved.length === 0 ? (
          <div style={{textAlign:"center",padding:"48px 0",background:"#fbfbfd",borderRadius:16,border:"1.5px dashed #e6e9ef"}}>
            <div style={{fontSize:32,marginBottom:10}}>{"📬"}</div>
            <div style={{fontSize:14,fontWeight:700,color:"#334155"}}>Nenhuma sequência salva</div>
            <div style={{fontSize:12,color:"#64748b",marginTop:4}}>Toda sequência gerada é salva aqui automaticamente</div>
          </div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>
            {saved.map(function(seq) {
              var fc = FIT_CONFIG[(seq.account&&seq.account.fit)||"ALTO"]||FIT_CONFIG.ALTO;
              return (
                <div key={seq.id} style={{background:"#ffffff",border:"1.5px solid #e6e9ef",borderRadius:16,padding:"18px 20px",cursor:"pointer",transition:"all .2s"}} onClick={function(){setOpenSeq(seq);}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div>
                      <div style={{fontSize:14,fontWeight:700,color:"#0f172a",marginBottom:2}}>{seq.account&&seq.account.nome}</div>
                      <div style={{fontSize:11,color:"#64748b"}}>{seq.profile&&seq.profile.label}</div>
                    </div>
                    <span style={{background:fc.bg,border:"1px solid "+fc.border,color:fc.text,borderRadius:7,padding:"2px 9px",fontSize:9,fontWeight:700}}>{"FIT "+(seq.account&&seq.account.fit)}</span>
                  </div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:12}}>
                    {safeArr(seq.touches).map(function(t,i) {
                      var tc = TOUCH_TYPES[t.type]||TOUCH_TYPES.email;
                      return <span key={i} style={{background:tc.bg,color:tc.color,borderRadius:5,padding:"2px 7px",fontSize:9,fontWeight:700}}>{"D"+t.day+" "+tc.label}</span>;
                    })}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={function(e){e.stopPropagation();setOpenSeq(seq);}} style={{flex:1,background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:8,padding:"7px 0",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Abrir</button>
                    <button onClick={function(e){e.stopPropagation();storageDel(seq.id).then(function(){setSaved(function(prev){return prev.filter(function(s){return s.id!==seq.id;});});props.showToast("Removida.","#ef4444");});}} style={{background:"none",border:"1px solid rgba(248,113,113,.25)",color:"#ef4444",borderRadius:8,padding:"7px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>x</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {openSeq && <SequenceModal seq={openSeq} onClose={function(){setOpenSeq(null);}}/>}
      </div>
    );
  }

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:"#0f172a",marginBottom:3}}>{"Gerador de Sequências"}</div>
          <div style={{fontSize:13,color:"#52617a"}}>Selecione a conta e o perfil para gerar uma cadência de 6 toques.</div>
        </div>
        <button onClick={function(){setView("library");}} style={{background:"#fbfbfd",color:"#475569",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"9px 18px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{"Biblioteca ("+saved.length+")"}</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:24}}>
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,gap:8}}>
            <div style={{fontSize:10,fontWeight:700,color:"#6366f1",letterSpacing:2,textTransform:"uppercase"}}>{"1. Selecione a conta"}</div>
            {accounts.length > 1 && (
              <div style={{display:"flex",background:"#f1f3f6",border:"1px solid #e6e9ef",borderRadius:8,overflow:"hidden",flexShrink:0}}>
                <button onClick={function(){setAccSort("az");}} title="Ordenar A → Z" style={{padding:"4px 9px",border:"none",background:accSort==="az"?"linear-gradient(135deg,#6366f1,#4f46e5)":"transparent",color:accSort==="az"?"#fff":"#64748b",cursor:"pointer",fontSize:10,fontWeight:700,fontFamily:"inherit",lineHeight:1}}>{"A→Z"}</button>
                <button onClick={function(){setAccSort("za");}} title="Ordenar Z → A" style={{padding:"4px 9px",border:"none",background:accSort==="za"?"linear-gradient(135deg,#6366f1,#4f46e5)":"transparent",color:accSort==="za"?"#fff":"#64748b",cursor:"pointer",fontSize:10,fontWeight:700,fontFamily:"inherit",lineHeight:1}}>{"Z→A"}</button>
              </div>
            )}
          </div>
          {accounts.length === 0 ? (
            <div style={{background:"#fbfbfd",border:"1.5px dashed #e6e9ef",borderRadius:12,padding:"20px",textAlign:"center"}}>
              <div style={{fontSize:12,color:"#64748b"}}>Nenhuma conta mapeada. Va para Busca.</div>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:7,maxHeight:300,overflowY:"auto"}}>
              {accounts.slice().sort(function(a,b){ return accSort==="za" ? sortZA(a.nome,b.nome) : sortAZ(a.nome,b.nome); }).map(function(acc) {
                var fc = FIT_CONFIG[acc.fit]||FIT_CONFIG.ALTO;
                var active = selAcc && selAcc.id===acc.id;
                return (
                  <div key={acc.id} onClick={function(){setSelAcc(acc);setGenerated(null);}} style={{background:active?"#f0f3ff":"#fff",border:"1.5px solid "+(active?"#6366f1":"#e8edf4"),borderRadius:10,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12.5,fontWeight:700,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{acc.nome}</div>
                      <div style={{fontSize:10,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{acc.setor}</div>
                    </div>
                    <span style={{background:fc.bg,border:"1px solid "+fc.border,color:fc.text,borderRadius:5,padding:"2px 7px",fontSize:8,fontWeight:700,flexShrink:0}}>{"FIT "+acc.fit}</span>
                    {active && <div style={{width:8,height:8,borderRadius:"50%",background:"#6366f1",flexShrink:0}}/>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:"#a5b4fc",letterSpacing:2,textTransform:"uppercase",marginBottom:12}}>{"2. Escolha o stakeholder"}</div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {STAKEHOLDER_PROFILES.map(function(p) {
              var active = selProfile && selProfile.id===p.id;
              return (
                <div key={p.id} onClick={function(){setCustomProfile(null);setSelProfile(p);setGenerated(null);}} style={{background:active?"#f0f3ff":"#fff",border:"1.5px solid "+(active?"#6366f1":"#e8edf4"),borderRadius:10,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>{p.label}</div>
                    <div style={{fontSize:10,color:"#64748b",marginTop:2}}>{"Angulo: "+p.angle}</div>
                  </div>
                  {active && <div style={{width:8,height:8,borderRadius:"50%",background:"#6366f1",flexShrink:0}}/>}
                </div>
              );
            })}
            <div style={{border:"1.5px dashed "+(customProfile?"#6366f1":"#e2e8f0"),borderRadius:10,padding:"10px 14px",background:customProfile?"#f0f3ff":"#fafafa"}}>
              <div style={{fontSize:10,fontWeight:600,color:"#52617a",marginBottom:7}}>{"+ Cargo personalizado"}</div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                <input value={customLabel} onChange={function(e){setCustomLabel(e.target.value);}} placeholder="Ex: Head de DevOps..." style={{flex:1,minWidth:110,background:"#ffffff",border:"1px solid #e6e9ef",borderRadius:7,padding:"6px 10px",fontSize:11,fontFamily:"inherit",outline:"none"}}/>
                <input value={customAngle} onChange={function(e){setCustomAngle(e.target.value);}} placeholder="Angulo de abordagem..." style={{flex:1,minWidth:110,background:"#ffffff",border:"1px solid #e6e9ef",borderRadius:7,padding:"6px 10px",fontSize:11,fontFamily:"inherit",outline:"none"}}/>
                <button onClick={function(){if(!customLabel.trim())return;var cp={id:"custom",label:customLabel.trim(),angle:customAngle.trim()||"abordagem customizada",pain:"dores especificas do cargo"};setCustomProfile(cp);setSelProfile(cp);setGenerated(null);}} style={{background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>Usar cargo</button>
              </div>
              {customProfile && <div style={{marginTop:6,fontSize:10,color:"#a5b4fc",fontWeight:600}}>{"v Usando: "+customProfile.label}</div>}
            </div>
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:24}}>
        <button onClick={generate} disabled={!selAcc||!selProfile||genLoading} style={{flex:1,background:(!selAcc||!selProfile||genLoading)?"#e2e8f0":"linear-gradient(135deg,#6366f1,#4f46e5)",color:(!selAcc||!selProfile||genLoading)?"#94a3b8":"#fff",border:"none",borderRadius:12,padding:"14px 0",fontSize:14,fontWeight:700,cursor:(!selAcc||!selProfile||genLoading)?"not-allowed":"pointer",fontFamily:"inherit",transition:"all .2s"}}>{genLoading?"Gerando com IA...":"Gerar sequência de 6 toques"}</button>
      </div>
      {generated && (
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
            {generated.engine==="ai" ? (
              <span style={{fontSize:10,fontWeight:700,color:"#fff",background:"linear-gradient(135deg,#10b981,#059669)",borderRadius:7,padding:"4px 10px",display:"flex",alignItems:"center",gap:5}}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21l2.3-7.4-6-4.6h7.6z"/></svg>
                {"Gerado por IA (Gemini)"}
              </span>
            ) : (
              <span style={{fontSize:10,fontWeight:700,color:"#92400e",background:"rgba(251,191,36,.14)",border:"1px solid rgba(251,191,36,.3)",borderRadius:7,padding:"4px 10px"}}>{"Template local (IA indisponível)"}</span>
            )}
            {generated.contactName && (
              <span style={{fontSize:10,fontWeight:700,color:"#4f46e5",background:"#eef2ff",border:"1px solid rgba(99,102,241,.3)",borderRadius:7,padding:"4px 10px",display:"flex",alignItems:"center",gap:5}}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                {"Para: " + generated.contactName + (generated.profile && generated.profile.label ? " · " + generated.profile.label : "")}
              </span>
            )}
            <span style={{fontSize:10,fontWeight:600,color:"#059669",background:"rgba(52,211,153,.12)",border:"1px solid rgba(52,211,153,.3)",borderRadius:7,padding:"4px 10px"}}>{"Salva na biblioteca"}</span>
          </div>
          {safeArr(generated.touches).map(function(touch,i) {
            var tc = TOUCH_TYPES[touch.type]||TOUCH_TYPES.email;
            return (
              <div key={i} style={{background:"#ffffff",border:"1.5px solid #e6e9ef",borderRadius:14,overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",background:tc.bg,borderBottom:"1px solid #f1f5f9"}}>
                  <div style={{width:28,height:28,borderRadius:8,background:tc.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:tc.color,flexShrink:0}}>{tc.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>{tc.label+" , Dia "+touch.day}</div>
                    {touch.subject && <div style={{fontSize:10,color:"#52617a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{"Assunto: "+touch.subject}</div>}
                  </div>
                  <button onClick={function(){regenerateTouch(i);}} title="Gerar nova versao" style={{background:"none",border:"1px solid #e6e9ef",borderRadius:7,padding:"4px 8px",cursor:"pointer",color:"#94a3b8",display:"flex",alignItems:"center",gap:4,fontSize:10,fontFamily:"inherit",transition:"all .2s"}}
                    onMouseEnter={function(e){e.currentTarget.style.borderColor="rgba(99,102,241,.5)";e.currentTarget.style.color="#a5b4fc";}}
                    onMouseLeave={function(e){e.currentTarget.style.borderColor="#e6e9ef";e.currentTarget.style.color="#94a3b8";}}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                    Recarregar
                  </button>
                  <CopyBtn text={(touch.subject?"Assunto: "+touch.subject+"\n\n":"")+touch.body}/>
                </div>
                <div style={{padding:"14px 16px",fontSize:12.5,color:"#0f172a",whiteSpace:"pre-wrap",lineHeight:1.85,borderLeft:"3px solid "+tc.color}}>{touch.body}</div>
              </div>
            );
          })}
        </div>
      )}
      {openSeq && <SequenceModal seq={openSeq} onClose={function(){setOpenSeq(null);}}/>}
    </div>
  );
}

// -- SEQUENCE MODAL ------------------------------------------------------------
function SequenceModal(props) {
  var seq = props.seq;
  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(15,23,42,.32)",zIndex:9999,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"12px 10px",overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch"}} onClick={function(e){if(e.target===e.currentTarget)props.onClose();}}>
      <div style={{background:"#ffffff",backdropFilter:"blur(32px)",WebkitBackdropFilter:"blur(32px)",border:"1px solid #dde1e8",borderRadius:18,width:"100%",maxWidth:660,boxShadow:"0 24px 80px rgba(15,23,42,.3)",marginBottom:16,flexShrink:0}} onClick={function(e){e.stopPropagation();}}>
        <div style={{padding:"14px 14px",borderBottom:"1px solid #f1f5f9",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
          <div style={{minWidth:0,flex:1}}>
            <div style={{fontSize:15,fontWeight:800,color:"#0f172a",marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{seq.account && seq.account.nome}</div>
            <div style={{fontSize:11,color:"#64748b"}}>{seq.profile && seq.profile.label + ", " + fmtDate(seq.createdAt)}</div>
          </div>
          <button onClick={props.onClose} style={{background:"#f6f7f9",border:"none",borderRadius:8,padding:"6px 10px",cursor:"pointer",color:"#52617a",fontSize:15,lineHeight:1,fontFamily:"inherit",flexShrink:0}}>{"x"}</button>
        </div>
        <div style={{padding:"12px 10px",display:"flex",flexDirection:"column",gap:10}}>
          {safeArr(seq.touches).map(function(touch, idx) {
            var tc = TOUCH_TYPES[touch.type] || TOUCH_TYPES.email;
            return (
              <div key={idx} style={{border:"1.5px solid #e6e9ef",borderRadius:12,overflow:"hidden"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 10px",background:"#fbfbfd",borderBottom:"1px solid #f1f5f9",flexWrap:"wrap"}}>
                  <span style={{fontSize:10,fontWeight:700,color:tc.color,flexShrink:0}}>{tc.label}</span>
                  <span style={{background:tc.bg,color:tc.color,borderRadius:20,padding:"1px 7px",fontSize:9,fontWeight:700,flexShrink:0}}>{"Dia " + touch.day}</span>
                  <div style={{flex:1,minWidth:40,fontSize:10,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{touch.subject}</div>
                  <CopyBtn text={(touch.type==="email"||touch.type==="linkedin"?"Assunto: "+touch.subject+"\n\n":"")+touch.body}/>
                </div>
                <div style={{padding:"10px",fontSize:12,color:"#0f172a",whiteSpace:"pre-wrap",lineHeight:1.75,wordBreak:"break-word",overflowWrap:"break-word"}}>{touch.body}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
// -- ACCOUNT CARD --------------------------------------------------------------
function AccountCard(props) {
  var acc = props.acc;
  var fc = FIT_CONFIG[acc.fit] || FIT_CONFIG.ALTO;
  var sc = STATUS_CONFIG[acc.status] || STATUS_CONFIG.prospecting;
  var _st_menuOpen = useState(false); var menuOpen = _st_menuOpen[0]; var setMenuOpen = _st_menuOpen[1];
  function handleStatus(s) { props.onStatusChange(acc.id, s); setMenuOpen(false); }

  // ── Estado NAO MAPEADO ──────────────────────────────────────────────────
  if (!acc.mapped) {
    var isMapping = props.mapping;
    return (
      <div style={{background:"rgba(255,255,255,.95)",border:"1.5px solid "+(props.selected?"#6366f1":"rgba(228,235,244,.8)"),borderRadius:20,padding:"20px 22px",position:"relative",boxShadow:props.selected?"0 4px 16px rgba(99,102,241,.12)":"0 2px 12px rgba(15,23,42,.06)",transition:"all .25s"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,gap:10}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:10,flex:1,minWidth:0}}>
            <input type="checkbox" checked={!!props.selected} onChange={function(){props.onToggleSelect(acc.id);}} disabled={isMapping} style={{marginTop:2,width:16,height:16,accentColor:"#6366f1",cursor:"pointer",flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:700,color:"#0f172a",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{acc.nome}</div>
              <div style={{fontSize:11,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{acc.site || "Importada da lista"}</div>
            </div>
          </div>
          <span style={{fontSize:8,fontWeight:700,color:"#92400e",background:"rgba(251,191,36,.14)",border:"1px solid rgba(251,191,36,.3)",borderRadius:6,padding:"3px 8px",flexShrink:0,textTransform:"uppercase",letterSpacing:.5}}>{"Não mapeada"}</span>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={function(e){e.stopPropagation();if(!isMapping)props.onMap(acc);}} disabled={isMapping} style={{flex:1,background:isMapping?"#f1f5f9":"linear-gradient(135deg,#6366f1,#4f46e5)",color:isMapping?"#94a3b8":"#fff",border:"none",borderRadius:10,padding:"9px 0",fontSize:12,fontWeight:700,cursor:isMapping?"default":"pointer",fontFamily:"inherit",boxShadow:isMapping?"none":"0 4px 12px rgba(99,102,241,.25)"}}>
            {isMapping ? "Mapeando..." : "Mapear conta"}
          </button>
          <button onClick={function(e){e.stopPropagation();props.onDelete(acc.id);}} disabled={isMapping} style={{background:"none",border:"1px solid rgba(248,113,113,.25)",color:"#ef4444",borderRadius:10,padding:"9px 11px",fontSize:11,cursor:isMapping?"default":"pointer",fontFamily:"inherit"}}>x</button>
        </div>
      </div>
    );
  }

  // ── Estado MAPEADO (card completo original) ─────────────────────────────
  return (
    <div onClick={function(){props.onOpen(acc);}} style={{background:"rgba(255,255,255,.95)",border:"1.5px solid rgba(228,235,244,.8)",borderRadius:20,padding:"20px 22px",transition:"all .25s cubic-bezier(.22,1,.36,1)",position:"relative",boxShadow:"0 2px 12px rgba(15,23,42,.06)",cursor:"pointer"}} onMouseEnter={function(e){e.currentTarget.style.transform="translateY(-5px)";e.currentTarget.style.boxShadow="0 16px 48px rgba(15,23,42,.08)";e.currentTarget.style.borderColor="rgba(99,102,241,.3)";}} onMouseLeave={function(e){e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="0 2px 12px rgba(15,23,42,.06)";e.currentTarget.style.borderColor="rgba(228,235,244,.8)";}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:15,fontWeight:700,color:"#0f172a",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{acc.nome}</div>
          <div style={{fontSize:11,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{acc.setor}</div>
        </div>
        <MiniGauge score={acc.fit}/>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        <span style={{background:fc.bg,border:"1px solid "+fc.border,color:fc.text,borderRadius:8,padding:"3px 10px",fontSize:9,fontWeight:700}}>{"FIT "+acc.fit}</span>
        <span style={{background:"#fbfbfd",border:"1px solid "+(TIER_COLOR[acc.tier]||"#e2e8f0"),color:TIER_COLOR[acc.tier]||"#94a3b8",borderRadius:8,padding:"3px 10px",fontSize:9,fontWeight:700}}>{acc.tier}</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{position:"relative"}}>
          <button onClick={function(e){e.stopPropagation();setMenuOpen(!menuOpen);}} style={{display:"flex",alignItems:"center",gap:6,background:sc.bg,border:"1px solid "+sc.border,color:sc.color,borderRadius:8,padding:"5px 10px",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
            {sc.label}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {menuOpen && (
            <div onClick={function(e){e.stopPropagation();}} style={{position:"absolute",bottom:"calc(100% + 6px)",left:0,background:"#ffffff",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",border:"1px solid #dde1e8",borderRadius:12,boxShadow:"0 12px 40px rgba(15,23,42,.3)",zIndex:50,minWidth:160,overflow:"hidden"}}>
              {STATUS_ORDER.map(function(s) {
                var sc2 = STATUS_CONFIG[s];
                return (
                  <div key={s} onClick={function(){handleStatus(s);}} style={{padding:"9px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontSize:11,fontWeight:600,color:sc2.color,background:acc.status===s?sc2.bg:"#fff"}} onMouseEnter={function(e){if(acc.status!==s)e.currentTarget.style.background="#f1f3f6";}} onMouseLeave={function(e){if(acc.status!==s)e.currentTarget.style.background="#fff";}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:sc2.color}}/>
                    {sc2.label}
                    {acc.status===s && <svg style={{marginLeft:"auto"}} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:10,color:"#64748b"}}>{fmtDate(acc.savedAt)}</span>
          <button onClick={function(e){e.stopPropagation();props.onOpen(acc);}} style={{background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:8,padding:"5px 10px",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Ver</button>          <button onClick={function(e){e.stopPropagation();props.onDelete(acc.id);}} style={{background:"none",border:"1px solid rgba(248,113,113,.25)",color:"#ef4444",borderRadius:8,padding:"5px 8px",fontSize:10,cursor:"pointer",fontFamily:"inherit"}}>x</button>
        </div>
      </div>
    </div>
  );
}
// -- PIPELINE VIEW -------------------------------------------------------------
function PipelineView(props) {
  var _st_overCol = useState(null); var overCol = _st_overCol[0]; var setOverCol = _st_overCol[1];
  var _st_dragId = useState(null); var dragId = _st_dragId[0]; var setDragId = _st_dragId[1];
  var _st_dragAcc = useState(null); var dragAcc = _st_dragAcc[0]; var setDragAcc = _st_dragAcc[1];
  var _st_ghostPos = useState({x:0, y:0}); var ghostPos = _st_ghostPos[0]; var setGhostPos = _st_ghostPos[1];
  var _st_ghostW = useState(160); var ghostW = _st_ghostW[0]; var setGhostW = _st_ghostW[1];
  var _st_pipeSort = useState("az"); var pipeSort = _st_pipeSort[0]; var setPipeSort = _st_pipeSort[1];
  var dragFrom = useRef(null);
  var colRefs = useRef({});
  function getColAtPoint(x, y) {
    var found = null;
    Object.keys(colRefs.current).forEach(function(col) {
      var el = colRefs.current[col];
      if (!el) return;
      var r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) found = col;
    });
    return found;
  }
  var grabOffset = useRef({x:80, y:30});
  var rootRef = useRef(null);
  // overflow:clip nos ancestrais cria containing block para position:fixed.
  // Medimos o offset real do nosso container para compensar e o ghost ficar sob o cursor.
  function cbOffset() {
    if (!rootRef.current) return {x:0, y:0};
    // Descobre o offsetParent real do ghost (que e filho do rootRef) e mede
    // sua posicao na viewport. Funciona independente do motivo do containing block.
    var node = rootRef.current;
    while (node) {
      var st = window.getComputedStyle(node);
      var tf = st.transform, fl = st.filter, pp = st.perspective, wc = st.willChange, ct = st.contain, ox = st.overflowX, oy = st.overflowY;
      if ((tf&&tf!=="none")||(fl&&fl!=="none")||(pp&&pp!=="none")||(wc&&wc.indexOf("transform")>=0)||(ct&&(ct.indexOf("paint")>=0||ct.indexOf("layout")>=0||ct==="strict"||ct==="content"))||ox==="clip"||oy==="clip"||ox==="hidden"||oy==="hidden") {
        var r = node.getBoundingClientRect();
        return {x:r.left, y:r.top};
      }
      node = node.parentElement;
    }
    return {x:0, y:0};
  }
  function startMouseDrag(e, acc, fromCol) {
    e.preventDefault();
    var rect = e.currentTarget.getBoundingClientRect();
    grabOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    var cb = cbOffset();
    setGhostW(rect.width);
    dragFrom.current = fromCol;
    setDragId(acc.id);
    setDragAcc(acc);
    setGhostPos({x:e.clientX-grabOffset.current.x-cb.x, y:e.clientY-grabOffset.current.y-cb.y});
    setOverCol(fromCol);
    function onMove(ev) {
      setGhostPos({x:ev.clientX-grabOffset.current.x-cb.x, y:ev.clientY-grabOffset.current.y-cb.y});
      var col = getColAtPoint(ev.clientX, ev.clientY);
      if (col) setOverCol(col);
    }
    function onUp(ev) {
      var col = getColAtPoint(ev.clientX, ev.clientY);
      if (col && col !== dragFrom.current) props.onStatusChange(acc.id, col);
      dragFrom.current = null;
      setDragId(null);
      setDragAcc(null);
      setOverCol(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
  function startTouchDrag(e, acc, fromCol) {
    var t0 = e.touches[0];
    var rect = e.currentTarget.getBoundingClientRect();
    grabOffset.current = { x: t0.clientX - rect.left, y: t0.clientY - rect.top };
    var cb = cbOffset();
    setGhostW(rect.width);
    dragFrom.current = fromCol;
    setDragId(acc.id);
    setDragAcc(acc);
    setGhostPos({x:t0.clientX-grabOffset.current.x-cb.x, y:t0.clientY-grabOffset.current.y-cb.y});
    setOverCol(fromCol);
    function onTouchMove(ev) {
      ev.preventDefault();
      var t = ev.touches[0];
      if (!t) return;
      setGhostPos({x:t.clientX-grabOffset.current.x-cb.x, y:t.clientY-grabOffset.current.y-cb.y});
      var col = getColAtPoint(t.clientX, t.clientY);
      if (col) setOverCol(col);
    }
    function onEnd(ev) {
      var t = ev.changedTouches[0];
      if (t) {
        var col = getColAtPoint(t.clientX, t.clientY);
        if (col && col !== dragFrom.current) props.onStatusChange(acc.id, col);
      }
      dragFrom.current = null;
      setDragId(null);
      setDragAcc(null);
      setOverCol(null);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onEnd);
    }
    document.addEventListener("touchmove", onTouchMove, {passive:false});
    document.addEventListener("touchend", onEnd, {once:true});
  }
  var ghostFc = dragAcc ? (FIT_CONFIG[dragAcc.fit]||FIT_CONFIG.ALTO) : null;
  return (
    <div ref={rootRef} style={{position:"relative"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{fontSize:24,fontWeight:800,color:"#0f172a",letterSpacing:"-.5px"}}>{"Pipeline"}</div>
          <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{props.accounts.length + " conta" + (props.accounts.length!==1?"s":"") + " no pipeline"}</div>
        </div>
        <button onClick={function(){setPipeSort(function(s){ return s==="az"?"za":"az"; });}} style={{display:"flex",alignItems:"center",gap:6,background:"#fff",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"7px 14px",fontSize:12,fontWeight:600,color:"#475569",cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}} onMouseEnter={function(e){e.currentTarget.style.borderColor="#6366f1";e.currentTarget.style.color="#4f46e5";}} onMouseLeave={function(e){e.currentTarget.style.borderColor="#e6e9ef";e.currentTarget.style.color="#475569";}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18M6 12h12M9 18h6"/></svg>
          {pipeSort==="az"?"A → Z":"Z → A"}
        </button>
      </div>
      <div className="fluxo de atendimento-scroll" style={{overflowX:"auto",paddingBottom:16,userSelect:"none"}}>
        <div style={{display:"flex",gap:14,minWidth:900}}>
          {STATUS_ORDER.map(function(col) {
            var sc = STATUS_CONFIG[col];
            var cards = props.accounts.filter(function(a){return a.status===col;}).slice().sort(function(a,b){
              return pipeSort==="az" ? sortAZ(a.nome,b.nome) : sortZA(a.nome,b.nome);
            });
            var isOver = overCol===col && dragFrom.current!==null && dragFrom.current!==col;
            return (
              <div key={col} ref={function(el){colRefs.current[col]=el;}} style={{flex:1,minWidth:155,background:isOver?"rgba(99,102,241,.06)":"#f8fafc",borderRadius:16,padding:14,border:"1.5px solid "+(isOver?"#6366f1":"#e8edf4"),transition:"border-color .15s,background .15s",boxShadow:isOver?"0 0 0 3px rgba(99,102,241,.15)":"none"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:sc.color}}/>
                  <div style={{fontSize:9,fontWeight:700,color:sc.color,textTransform:"uppercase",letterSpacing:.8}}>{sc.label}</div>
                  <div style={{marginLeft:"auto",fontSize:10,fontWeight:700,color:"#64748b",background:"#eceef2",borderRadius:20,padding:"1px 7px"}}>{cards.length}</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8,minHeight:60}}>
                  {cards.map(function(acc) {
                    var fc = FIT_CONFIG[acc.fit]||FIT_CONFIG.ALTO;
                    var isDragging = dragId===acc.id;
                    return (
                      <div key={acc.id} onMouseDown={function(e){startMouseDrag(e,acc,col);}} onTouchStart={function(e){startTouchDrag(e,acc,col);}} style={{background:"#ffffff",border:"1px solid "+(isDragging?"#6366f1":"#edf0f7"),borderRadius:14,padding:"12px 14px",cursor:isDragging?"grabbing":"grab",touchAction:"none",opacity:isDragging?0.25:1,transition:"opacity .1s",position:"relative"}}>
                        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:3}}>
                          <div style={{fontSize:12,fontWeight:700,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{acc.nome}</div>
                          <div style={{fontSize:11,color:"#94a3b8",marginLeft:6,flexShrink:0,letterSpacing:2}}>{"..."}</div>
                        </div>
                        <div style={{fontSize:10,color:"#64748b",marginBottom:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{acc.setor}</div>
                        <div style={{display:"flex",gap:5}}>
                          <span style={{background:fc.bg,border:"1px solid "+fc.border,color:fc.text,borderRadius:6,padding:"2px 7px",fontSize:8,fontWeight:700}}>{"FIT "+acc.fit}</span>
                          <span style={{fontSize:8,color:TIER_COLOR[acc.tier]||"#94a3b8",fontWeight:700}}>{acc.tier}</span>
                        </div>
                      </div>
                    );
                  })}
                  {cards.length===0&&(
                    <div style={{textAlign:"center",padding:"28px 8px",color:isOver?"#4f46e5":"#cbd5e1",fontSize:11,border:"2px dashed "+(isOver?"#6366f1":"#e8edf4"),borderRadius:10,transition:"all .15s",fontWeight:isOver?600:400}}>
                      {isOver?"Soltar aqui":"Vazio"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {dragId&&(
          <div style={{marginTop:10,textAlign:"center",fontSize:11,color:"#64748b"}}>
            {"Solte sobre a coluna de destino"}
          </div>
        )}
      </div>
      {dragId && dragAcc && (
        <div style={{position:"fixed",left:ghostPos.x,top:ghostPos.y,width:ghostW,boxSizing:"border-box",zIndex:9999,pointerEvents:"none",boxShadow:"0 12px 32px rgba(15,23,42,.10)",borderRadius:14,opacity:.95}}>
          <div style={{background:"#ffffff",border:"1.5px solid rgba(99,102,241,.4)",borderRadius:14,padding:"12px 14px",boxSizing:"border-box"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{dragAcc.nome}</div>
            <div style={{fontSize:10,color:"#64748b",marginBottom:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{dragAcc.setor}</div>
            {ghostFc&&(
              <span style={{background:ghostFc.bg,border:"1px solid "+ghostFc.border,color:ghostFc.text,borderRadius:6,padding:"2px 7px",fontSize:8,fontWeight:700}}>{"FIT "+dragAcc.fit}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
// -- ACCOUNT MODAL -------------------------------------------------------------
function AttachmentAnalysis(props) {
  var acc = props.acc;
  var _st_analysis = useState(null); var analysis = _st_analysis[0]; var setAnalysis = _st_analysis[1];
  var _st_loading = useState(false); var loading = _st_loading[0]; var setLoading = _st_loading[1];

  useEffect(function() {
    if (!acc.attachData || analysis) return;
    setLoading(true);
    fetch("/api/analyze", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ attachData:acc.attachData, attachFileName:acc.attachFileName||"", company:acc.nome||"" })
    })
    .then(function(r){ return r.json().then(function(d){ return {status:r.status, data:d}; }); })
    .then(function(res){
      var d = res.data;
      if (d && (d.resumo || (d.insights&&d.insights.length))) {
        setAnalysis({resumo:d.resumo||"", insights:d.insights||[], oportunidades:d.oportunidades||[], alertas:d.alertas||[]});
      } else {
        var reason = (d && d.error) || ("HTTP " + res.status);
        setAnalysis({resumo:"Erro ao analisar o documento: " + reason, insights:[], oportunidades:[], alertas:[]});
      }
      setLoading(false);
    })
    .catch(function(err){ setLoading(false); setAnalysis({resumo:"Erro de rede ao analisar o documento.",insights:[],oportunidades:[],alertas:[]}); });
  }, [acc.attachData]);

  if (!acc.attachData) return null;
  if (loading) return (
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"32px 0",justifyContent:"center"}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:"#6366f1",animation:"pulse 1s infinite"}}/>
      <span style={{color:"#64748b",fontSize:13}}>{"Analisando documento com IA..."}</span>
    </div>
  );
  if (!analysis) return null;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"rgba(99,102,241,.1)",borderRadius:10,border:"1px solid rgba(99,102,241,.3)"}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        <span style={{fontSize:11,color:"#a5b4fc",fontWeight:600}}>{acc.attachFileName||"Documento anexado"}</span>
      </div>
      <div style={{background:"#fbfbfd",borderRadius:14,padding:"16px 18px",border:"1px solid #e6e9ef"}}>
        <div style={{fontSize:9,fontWeight:700,color:"#a5b4fc",letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Resumo Executivo</div>
        <div style={{fontSize:13,color:"#334155",lineHeight:1.7}}>{analysis.resumo}</div>
      </div>
      {analysis.insights&&analysis.insights.length>0&&(
        <div>
          <div style={{fontSize:9,fontWeight:700,color:"#a5b4fc",letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Insights para Prospecção</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {analysis.insights.map(function(ins,i){return (
              <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",background:"#ffffff",border:"1px solid #e6e9ef",borderRadius:10,padding:"10px 14px"}}>
                <div style={{width:20,height:20,borderRadius:6,background:"linear-gradient(135deg,#6366f1,#4f46e5)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:9,fontWeight:700,color:"#fff"}}>{i+1}</span>
                </div>
                <span style={{fontSize:12,color:"#334155",lineHeight:1.6}}>{ins}</span>
              </div>
            );})}
          </div>
        </div>
      )}
      {analysis.oportunidades&&analysis.oportunidades.length>0&&(
        <div>
          <div style={{fontSize:9,fontWeight:700,color:"#059669",letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Oportunidades Comerciais</div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {analysis.oportunidades.map(function(op,i){return (
              <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"8px 12px",background:"rgba(52,211,153,.12)",borderRadius:8,border:"1px solid rgba(52,211,153,.3)"}}>
                <span style={{color:"#059669",fontWeight:700,flexShrink:0}}>{"+"}</span>
                <span style={{fontSize:12,color:"#065f46",lineHeight:1.6}}>{op}</span>
              </div>
            );})}
          </div>
        </div>
      )}
      {analysis.alertas&&analysis.alertas.length>0&&(
        <div>
          <div style={{fontSize:9,fontWeight:700,color:"#92400e",letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Alertas e Riscos</div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {analysis.alertas.map(function(al,i){return (
              <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"8px 12px",background:"rgba(251,191,36,.1)",borderRadius:8,border:"1px solid rgba(251,191,36,.3)"}}>
                <span style={{color:"#92400e",fontWeight:700,flexShrink:0}}>{"!"}</span>
                <span style={{fontSize:12,color:"#92400e",lineHeight:1.6}}>{al}</span>
              </div>
            );})}
          </div>
        </div>
      )}
    </div>
  );
}

function exportAccountPDF(acc, d) {
  function safe(path) {
    try { var parts=path.split("."); var cur=d||{}; for(var i=0;i<parts.length;i++){cur=cur[parts[i]];if(cur==null)return null;} return cur; } catch(e){return null;}
  }
  function safeA(path) { var v=safe(path); return Array.isArray(v)?v:[]; }
  var nome = acc.nome || "";
  var setor = acc.setor || "";
  var fit = (d&&d.fit&&d.fit.score) || acc.fit || "";
  var tier = acc.tier || "";
  var resumo = safe("empresa.resumo") || "";
  var dores = safeA("dores.principais");
  var triggers = safeA("triggers");
  var stakeholders = safeA("stakeholders");
  var spin = safeA("estrategia.perguntas_spin");
  var objeções = safeA("estrategia.objecoes");
  var ae = safeA("proximos_passos.ae");
  var bdr = safeA("proximos_passos.bdr");
  var prazo = safe("proximos_passos.prazo") || "";
  var emails = safeA("estrategia.emails");
  var html = "<html><head><title>Account Map - "+nome+"</title><style>";
  html += "body{font-family:Verdana,sans-serif;padding:32px;color:#0f172a;font-size:12px;line-height:1.7;max-width:800px;margin:0 auto}";
  html += "h1{font-size:20px;color:#0f172a;margin-bottom:4px}";
  html += "h2{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#6366f1;margin:24px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px}";
  html += ".meta{display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap}";
  html += ".badge{padding:3px 10px;border-radius:6px;font-size:9px;font-weight:700}";
  html += ".fit-alto{background:#dcfce7;color:#065f46}.fit-medio{background:#fef3c7;color:#92400e}.fit-baixo{background:#fee2e2;color:#991b1b}";
  html += ".tier{background:#f8fafc;border:1px solid #e2e8f0;color:#475569}";
  html += "ul{list-style:none;padding:0;margin:0}";
  html += "li{padding:4px 0 4px 14px;position:relative;border-bottom:1px solid #f8fafc}";
  html += "li:before{content:'-';position:absolute;left:0;color:#6366f1;font-weight:700}";
  html += ".msg{background:#f8fafc;border-left:3px solid #10b981;padding:12px 16px;white-space:pre-wrap;margin:6px 0;font-size:11px;line-height:1.8}";
  html += ".sk{background:#f8fafc;border-radius:8px;padding:10px 14px;margin-bottom:8px}";
  html += ".footer{margin-top:32px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:10px;color:#94a3b8}";
  html += "@media print{body{padding:16px}h2{break-inside:avoid}}";
  html += "</style></head><body>";
  html += "<h1>"+nome+"</h1>";
  html += "<div class='meta'><span class='badge fit-"+fit.toLowerCase()+"'>FIT "+fit+"</span><span class='badge tier'>"+tier+"</span><span class='badge tier'>"+setor+"</span></div>";
  if (resumo) { html += "<h2>Resumo</h2><p>"+resumo+"</p>"; }
  if (dores.length) { html += "<h2>Dores Mapeadas</h2><ul>"+dores.map(function(d2){return "<li>"+d2+"</li>";}).join("")+"</ul>"; }
  if (triggers.length) { html += "<h2>Gatilhos Comerciais</h2><ul>"+triggers.map(function(t){return "<li>"+t+"</li>";}).join("")+"</ul>"; }
  if (stakeholders.length) {
    html += "<h2>Stakeholders</h2>";
    stakeholders.forEach(function(s) {
      html += "<div class='sk'><strong>"+s.cargo+"</strong> <span style='color:#94a3b8;font-size:10px'>("+s.prioridade+")</span><br/><span style='font-size:11px;color:#64748b'>"+s.angulo+"</span>";
      if (s.email) html += "<br/><a href='mailto:"+s.email+"' style='color:#0ea5e9;font-size:10px'>"+s.email+"</a>";
      if (s.linkedin) html += " <a href='"+s.linkedin+"' style='color:#0a66c2;font-size:10px'>LinkedIn</a>";
      html += "</div>";
    });
  }
  var realContacts = (acc.enriched && Array.isArray(acc.enriched.contacts)) ? acc.enriched.contacts.filter(function(c){return c.nome||c.name;}) : [];
  if (realContacts.length) {
    html += "<h2>Contatos Reais Encontrados</h2>";
    realContacts.forEach(function(c) {
      var cnome = c.nome || c.name || "";
      var ccargo = c.cargo || c.title || "";
      html += "<div class='sk'><strong>"+cnome+"</strong>";
      if (ccargo) html += " <span style='color:#64748b;font-size:11px'>, "+ccargo+"</span>";
      if (c.cidade || c.pais) html += "<br/><span style='font-size:10px;color:#94a3b8'>"+[c.cidade,c.pais].filter(Boolean).join(", ")+"</span>";
      if (c.email) html += "<br/><a href='mailto:"+c.email+"' style='color:#0ea5e9;font-size:10px'>"+c.email+"</a>";
      if (c.linkedin) html += " <a href='"+c.linkedin+"' style='color:#0a66c2;font-size:10px'>LinkedIn</a>";
      html += "</div>";
    });
  }
  if (spin.length) { html += "<h2>Perguntas SPIN</h2><ul>"+spin.map(function(q){return "<li>"+q+"</li>";}).join("")+"</ul>"; }
  if (objeções.length) {
    html += "<h2>Objecoes e Respostas</h2>";
    objeções.forEach(function(o) {
      html += "<div class='sk'><strong style='color:#92400e'>\""+o.objecao+"\"</strong><br/><span style='font-size:11px'>-> "+o.resposta+"</span></div>";
    });
  }
  if (ae.length || bdr.length) {
    html += "<h2>Plano de Ação</h2><div style='display:flex;gap:20px'>";
    if (ae.length) { html += "<div style='flex:1'><strong style='font-size:10px;color:#6366f1'>AE</strong><ul style='margin-top:6px'>"+ae.map(function(a){return "<li>"+a+"</li>";}).join("")+"</ul></div>"; }
    if (bdr.length) { html += "<div style='flex:1'><strong style='font-size:10px;color:#f59e0b'>BDR</strong><ul style='margin-top:6px'>"+bdr.map(function(a){return "<li>"+a+"</li>";}).join("")+"</ul></div>"; }
    html += "</div>";
    if (prazo) html += "<p style='margin-top:12px;font-size:11px'><strong>Prazo:</strong> "+prazo+"</p>";
  }
  html += "<div class='footer'>Account Mapper Mais Pipe Beta - "+getCompanySite()||"Mais Pipe"+" - "+new Date().toLocaleDateString("pt-BR")+"</div>";
  html += "</body></html>";
  var w = window.open("","_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  setTimeout(function(){w.print();}, 500);
}
function StakeholdersFetchBtn(props) {
  var acc = props.acc;
  var _st_loading = useState(false); var loading = _st_loading[0]; var setLoading = _st_loading[1];
  var _st_done    = useState(false); var done    = _st_done[0];    var setDone    = _st_done[1];
  var _st_count   = useState(0);     var count   = _st_count[0];   var setCount   = _st_count[1];
  var _st_err     = useState("");    var err     = _st_err[0];     var setErr     = _st_err[1];

  function fetch_stk() {
    setLoading(true); setErr(""); setDone(false);
    // Use acc.site if available, otherwise enriched domain, otherwise empty
    var siteRaw = acc.site || (acc.data && acc.data.empresa && acc.data.empresa.site) || "";
    var domain = (acc.enriched && acc.enriched.domain) || (siteRaw ? siteRaw.replace(/^https?:\/\//,"").replace(/^www\./,"").split("/")[0] : "");
    fetch("/api/stakeholders", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({company:acc.nome, domain:domain, dna:getStoredDna()}),
    })
      .then(function(r){
        var status = r.status;
        return r.text().then(function(txt){
          try {
            return {ok:r.ok, status:status, data:JSON.parse(txt)};
          } catch(e) {
            return {ok:false, status:status, data:{error:"Resposta inválida do servidor ("+status+"): "+txt.slice(0,120)}};
          }
        });
      })
      .then(function(res){
        if (!res.ok) { setErr("Erro " + res.status + ": " + ((res.data&&res.data.error)||"falha na API")); return; }
        var data = res.data;
        var contacts = data.contacts || [];
        if (data.errors && data.errors.length && !contacts.length) {
          setErr(data.errors.join("; ").slice(0, 120));
          return;
        }
        setCount(contacts.length);
        setDone(true);
        // Persist into account storage
        storageGet(acc.id).then(function(stored){
          var updated = Object.assign({}, stored||acc, {
            enriched: { contacts:contacts, sources:data.sources||[], domain:domain }
          });
          storageSet(acc.id, updated);
        });
        // Save each contact to Contatos (with dedup)
        storageList("contact:").then(function(ckeys){
          Promise.all(ckeys.map(storageGet)).then(function(existing){
            var existingSet = {};
            existing.filter(Boolean).forEach(function(ec){
              existingSet[((ec.nome||"")+"|"+(ec.empresa||"")).toLowerCase()] = true;
            });
            contacts.forEach(function(s){
              var nomeReal = s.nome || s.name || "";
              if (!nomeReal) return;
              var empresaNome = s.empresa || acc.nome || "";
              var dedupKey = (nomeReal+"|"+empresaNome).toLowerCase();
              if (existingSet[dedupKey]) return;
              existingSet[dedupKey] = true;
              var cid = "contact:" + Date.now() + "-" + Math.random().toString(36).slice(2,8);
              var contact = { id:cid, nome:nomeReal, cargo:s.cargo||s.title||"", empresa:empresaNome, email:s.email||"", emailValidated:!!s.email, linkedin:s.linkedin||"", savedAt:Date.now() };
              storageSet(cid, contact);
            });
            if (props.onContactsRefresh) props.onContactsRefresh();
          });
        });
        if (props.onDone) props.onDone(data);
      })
      .catch(function(e){ setErr("Falha de rede: " + String(e).slice(0,80)); })
      .finally(function(){ setLoading(false); });
  }

  if (done) return (
    <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#059669",fontWeight:600}}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      {count+" contato"+(count!==1?"s":"")+" encontrado"+(count!==1?"s":"")}
      <button onClick={fetch_stk} style={{fontSize:10,color:"#6366f1",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline",padding:0}}>{"atualizar"}</button>
    </div>
  );

  return (
    <button onClick={fetch_stk} disabled={loading} style={{display:"flex",alignItems:"center",gap:6,background:loading?"#f1f5f9":"#fff",color:loading?"#94a3b8":"#4f46e5",border:"1.5px solid "+(loading?"#e2e8f0":"rgba(99,102,241,.35)"),borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:700,cursor:loading?"default":"pointer",fontFamily:"inherit",transition:"all .2s"}}>
      {loading
        ? <><div style={{width:11,height:11,borderRadius:"50%",border:"2px solid #c7d2fe",borderTopColor:"#6366f1",animation:"spin .7s linear infinite",flexShrink:0}}/>{" Buscando no LinkedIn..."}</>
        : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>{"Buscar Contatos no LinkedIn"}</>
      }
      {err && <span style={{fontSize:9,color:"#ef4444",marginLeft:4,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{err}</span>}
    </button>
  );
}

function AccountModal(props) {
  var acc = props.acc;
  var onNav = props.onNav;
  var d = acc.data || {};
  var fit = (d.fit && d.fit.score) || acc.fit;
  var fc = FIT_CONFIG[fit] || FIT_CONFIG.ALTO;
  var sc = STATUS_CONFIG[acc.status] || STATUS_CONFIG.prospecting;
  var _st_activeTab = useState("overview"); var activeTab = _st_activeTab[0]; var setActiveTab = _st_activeTab[1];
  var _st_enrichingNow = useState(false); var enrichingNow = _st_enrichingNow[0]; var setEnrichingNow = _st_enrichingNow[1];
  // Clear the enriching spinner when fresh data lands in the modal
  useEffect(function(){
    if (enrichingNow && acc.aiMapped && acc.data && acc.data.dores && (acc.data.dores.principais||[]).length > 0) {
      setEnrichingNow(false);
    }
  }, [acc.aiMapped, acc.data]);
  var _st_enrichedContacts = useState([]); var enrichedContacts = _st_enrichedContacts[0]; var setEnrichedContacts = _st_enrichedContacts[1];
  var _st_enrichedSources = useState([]); var enrichedSources = _st_enrichedSources[0]; var setEnrichedSources = _st_enrichedSources[1];
  // Load enriched stakeholder data from localStorage on open
  useEffect(function() {
    storageGet(acc.id).then(function(stored) {
      if (stored && stored.enriched && stored.enriched.contacts) {
        setEnrichedContacts(stored.enriched.contacts);
        setEnrichedSources(stored.enriched.sources || []);
      }
    });
    // Also try to load from acc.enriched directly if already merged
    if (acc.enriched && acc.enriched.contacts) {
      setEnrichedContacts(acc.enriched.contacts);
      setEnrichedSources(acc.enriched.sources || []);
    }
  }, [acc.id]);

  function toggleFavoriteContact(idx) {
    var updated = enrichedContacts.map(function(c, i) {
      return i === idx ? Object.assign({}, c, { favorite: !c.favorite }) : c;
    });
    setEnrichedContacts(updated);
    storageGet(acc.id).then(function(stored) {
      if (!stored) return;
      var newStored = Object.assign({}, stored, {
        enriched: Object.assign({}, (stored.enriched||{}), { contacts: updated, sources: enrichedSources }),
      });
      storageSet(acc.id, newStored);
      if (props.onUpdateAccount) props.onUpdateAccount(newStored);
      if (props.onContactsRefresh) props.onContactsRefresh();
    });
  }
  function sd(path) {
    function dig(p) {
      try { var parts=p.split("."); var cur=d; for(var i=0;i<parts.length;i++){cur=cur[parts[i]];if(cur==null)return null;} return cur; } catch(e){return null;}
    }
    var r = dig(path);
    if (r != null) return r;
    // Fallback: buildData grava sob "estrategia"/"objecoes" (sem acento) enquanto
    // outros trechos leem "estratégia"/"objeções". Tenta as duas grafias.
    var alt = path
      .replace(/estratégia/g, "estrategia")
      .replace(/objeções/g, "objecoes");
    if (alt !== path) { var r2 = dig(alt); if (r2 != null) return r2; }
    var alt2 = path
      .replace(/estrategia/g, "estratégia")
      .replace(/objecoes/g, "objeções");
    if (alt2 !== path) { var r3 = dig(alt2); if (r3 != null) return r3; }
    return null;
  }
  // Merge enriched contacts into stakeholder profiles for display.
  // Match preciso: exige sobreposicao de palavras ESPECIFICAS do cargo (ignora
  // genericas como "diretor"/"de"), e cada contato real e usado uma unica vez.
  var usedContactKeys = useRef({});
  function resetMatches() { usedContactKeys.current = {}; }
  // Palavras genericas que NAO devem sozinhas determinar um match
  var GENERIC_ROLE_WORDS = {"diretor":1,"director":1,"head":1,"gerente":1,"manager":1,"vp":1,"vice":1,"chief":1,"lider":1,"líder":1,"de":1,"da":1,"do":1,"e":1,"of":1,"the":1,"coordenador":1,"executivo":1};
  function roleTokens(s) {
    return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .split(/[\s\/,\-|]+/).filter(function(w){ return w.length > 2; });
  }
  function getEnrichedStakeholder(cargo) {
    if (!enrichedContacts.length) return null;
    var target = roleTokens(cargo);
    var specificTarget = target.filter(function(w){ return !GENERIC_ROLE_WORDS[w]; });
    var best = null, bestScore = 0, bestIdx = -1;
    for (var i = 0; i < enrichedContacts.length; i++) {
      var c = enrichedContacts[i];
      var key = (c.nome||"") + "|" + (c.cargo||"");
      if (usedContactKeys.current[key]) continue; // ja usado por outro cargo
      var ct = roleTokens(c.cargo || "");
      var ctSpecific = ct.filter(function(w){ return !GENERIC_ROLE_WORDS[w]; });
      // pontua sobreposicao de palavras ESPECIFICAS
      var specHits = specificTarget.filter(function(w){ return ctSpecific.indexOf(w) >= 0; }).length;
      // bonus pequeno por palavra generica coincidente (so desempate)
      var genHits = target.filter(function(w){ return GENERIC_ROLE_WORDS[w] && ct.indexOf(w) >= 0; }).length;
      var score = specHits * 10 + genHits;
      // exige pelo menos 1 palavra especifica em comum para considerar match valido
      if (specHits >= 1 && score > bestScore) { bestScore = score; best = c; bestIdx = i; }
    }
    if (best) {
      usedContactKeys.current[(best.nome||"") + "|" + (best.cargo||"")] = true;
      return best;
    }
    return null;
  }
  var tabs=[{id:"overview",label:"Visão Geral"},{id:"stakeholders",label:"Stakeholders"},{id:"favoritos",label:"Favoritos",icon:"star"},{id:"spin",label:"SPIN & Objeções"},{id:"plan",label:"Plano de Ação"}].concat(acc.attachData?[{id:"attachment",label:"Conteúdo Anexado"}]:[]);
  var empresa=sd("empresa")||{};
  var stakeholders=safeArr(sd("stakeholders"));
  var dores=safeArr(sd("dores.principais"));
  var exposicao=safeArr(sd("dores.exposicao_regulatoria"));
  var sinais=safeArr(sd("dores.sinais_ativos"));
  var triggers=safeArr(sd("triggers"));
  var noticias=safeArr(sd("noticias"));
  var spin=safeArr(sd("estratégia.perguntas_spin"));
  var objecoes=safeArr(sd("estratégia.objeções"));
  var ae=safeArr(sd("proximos_passos.ae"));
  var bdr=safeArr(sd("proximos_passos.bdr"));
  var prazo=sd("proximos_passos.prazo")||"";
  var useCases=safeArr(sd("fit.use_cases"));
  var solucoes=safeArr(sd("fit.solucoes"));
  var fitJust=sd("fit.justificativa")||"";
  var concorrentes=safeArr(sd("mercado.competidores_provedor"));
  var CHANNELS=[{key:"emails",label:"E-mail",color:"#0ea5e9",bg:"rgba(14,165,233,.08)",isObj:true},{key:"inmails",label:"InMail",color:"#0a66c2",bg:"rgba(10,102,194,.08)",isObj:true},{key:"whatsapps",label:"WhatsApp",color:"#16a34a",bg:"rgba(22,163,74,.08)",isObj:false},{key:"cold_calls",label:"Cold Call",color:"#92400e",bg:"#fef3c7",isObj:false}];
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.32)",zIndex:200,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"20px 16px",overflowY:"auto",backdropFilter:"blur(10px)"}}>
      <div className="account-modal modal-box" style={{background:"rgba(255,255,255,.99)",borderRadius:24,width:"100%",maxWidth:820,boxShadow:"0 32px 100px rgba(15,23,42,.3)"}}>
        <div style={{padding:"18px 20px 0",borderBottom:"1px solid #f1f5f9",position:"relative"}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,marginBottom:14,paddingRight:36}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                <div style={{fontSize:18,fontWeight:800,color:"#0f172a",lineHeight:1.2,wordBreak:"break-word"}}>{acc.nome}</div>
                {acc.liveMode&&<span style={{background:"rgba(99,102,241,.12)",border:"1px solid rgba(52,211,153,.35)",color:"#4f46e5",borderRadius:6,padding:"2px 8px",fontSize:8,fontWeight:700,flexShrink:0}}>LIVE</span>}
              </div>
              <div style={{fontSize:12,color:"#64748b",marginBottom:8}}>{acc.setor}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <span style={{background:fc.bg,border:"1px solid "+fc.border,color:fc.text,borderRadius:8,padding:"3px 10px",fontSize:9,fontWeight:700}}>{"FIT "+fit}</span>
                <span style={{background:"#fbfbfd",border:"1px solid "+(TIER_COLOR[acc.tier]||"#e2e8f0"),color:TIER_COLOR[acc.tier]||"#94a3b8",borderRadius:8,padding:"3px 10px",fontSize:9,fontWeight:700}}>{acc.tier}</span>
                <span style={{background:"#fbfbfd",color:"#64748b",borderRadius:8,padding:"3px 10px",fontSize:9}}>{"Salvo "+fmtDate(acc.savedAt)}</span>
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0,alignItems:"flex-start"}}>
              <button onClick={function(){exportAccountPDF(acc,d);}} style={{display:"flex",alignItems:"center",gap:4,background:"rgba(99,102,241,.1)",border:"1px solid rgba(56,189,248,.3)",borderRadius:10,padding:"7px 12px",cursor:"pointer",color:"#0369a1",fontSize:11,fontWeight:600,fontFamily:"inherit"}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                {"PDF"}
              </button>
              <button onClick={props.onClose} title="Fechar" style={{background:"rgba(241,245,249,.8)",border:"1px solid #e2e8f0",cursor:"pointer",color:"#64748b",padding:"6px 9px",lineHeight:1,fontSize:16,fontWeight:600,fontFamily:"inherit",borderRadius:8}} onMouseEnter={function(e){e.currentTarget.style.background="#f1f5f9";e.currentTarget.style.color="#0f172a";}} onMouseLeave={function(e){e.currentTarget.style.background="rgba(241,245,249,.8)";e.currentTarget.style.color="#64748b";}}>{"✕"}</button>
            </div>
          </div>
          <div className="modal-tabs" style={{display:"flex",gap:0,overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
            {tabs.map(function(tab){var active=activeTab===tab.id;return <button key={tab.id} onClick={function(){setActiveTab(tab.id);}} style={{padding:"10px 14px",border:"none",borderBottom:"2.5px solid "+(active?"#6366f1":"transparent"),background:"transparent",color:active?"#4f46e5":"#94a3b8",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:active?700:500,transition:"all .15s",whiteSpace:"nowrap",flexShrink:0,display:"flex",alignItems:"center",gap:5}}>{tab.icon&&<Icon name={tab.icon} size={14} fill={active}/>}{tab.label}</button>;})}
          </div>
        </div>
        <div style={{padding:"22px 28px",maxHeight:"60vh",overflowY:"auto"}}>
          {activeTab==="overview"&&(
            <div>
              {empresa.resumo&&<Sec title={empresa.resumoAI?"Resumo da Empresa · IA":"Resumo da Empresa"}><p style={{fontSize:13,lineHeight:1.8,color:"#334155",margin:"0 0 14px"}}>{empresa.resumo}</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>{[["Setor",empresa.setor],["Porte",empresa.tamanho],["Faturamento",empresa.faturamento],["Clientes",empresa.clientes],["Estágio",empresa.estagio],["Bolsa",empresa.bolsa]].filter(function(x){return x[1];}).map(function(item){return <div key={item[0]} style={{background:"rgba(99,102,241,.12)",border:"1px solid rgba(52,211,153,.3)",borderRadius:10,padding:"10px 12px"}}><div style={{fontSize:8,color:"#818cf8",textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:3}}>{item[0]}</div><div style={{fontSize:12,color:"#0f172a",fontWeight:600}}>{item[1]}</div></div>;})}</div></Sec>}
              {fitJust&&<Sec title={"Fit — "+getCompanySite()}><p style={{fontSize:13,lineHeight:1.7,color:"#334155",marginBottom:10}}>{fitJust}</p>{solucoes.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6}}>{solucoes.map(function(s,i){return <span key={i} style={{background:"rgba(99,102,241,.08)",border:"1px solid rgba(99,102,241,.25)",color:"#4f46e5",borderRadius:8,padding:"3px 10px",fontSize:10,fontWeight:600}}>{s}</span>;})}</div>}</Sec>}
              {useCases.length>0&&<Sec title="Use Cases Prioritários">{useCases.map(function(u,i){return <R key={i} icon=">" color="#6366f1">{u}</R>;})}</Sec>}

              {/* ── Dores ── */}
              {dores.length>0 && (
                <Sec title="Possíveis Dores para Mapear">
                  {dores.map(function(d2,i){return <R key={i} icon="!" color="#ef4444">{d2}</R>;})}
                  {exposicao.length>0&&<div style={{marginTop:10,display:"flex",flexWrap:"wrap",gap:6}}>{exposicao.map(function(r,i){return <span key={i} style={{background:"rgba(251,191,36,.14)",border:"1px solid rgba(245,158,11,.4)",color:"#92400e",borderRadius:8,padding:"3px 10px",fontSize:10,fontWeight:600}}>{r}</span>;})}</div>}
                </Sec>
              )}

              {/* ── Empty state: no dores yet ── */}
              {dores.length === 0 && !enrichingNow && (
                <div style={{background:"#fafbff",border:"1.5px dashed #e0e4ef",borderRadius:14,padding:"20px",marginBottom:16,textAlign:"center"}}>
                  <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>{"Nenhuma dor mapeada ainda. Gere inteligência de conta com IA."}</div>
                  {props.onReEnrich && (
                    <button onClick={function(){setEnrichingNow(true); props.onReEnrich(acc);}}
                      style={{background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:10,padding:"8px 18px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:6,boxShadow:"0 4px 12px rgba(99,102,241,.3)"}}>
                      <Icon name="auto_awesome" size={14}/>{"Enriquecer com IA"}
                    </button>
                  )}
                </div>
              )}

              {/* ── Gatilhos ── */}
              {triggers.length>0 ? (
                <Sec title="Gatilhos Comerciais">
                  {triggers.map(function(t,i){return <R key={i} icon="T" color="#7c3aed">{t}</R>;})}
                </Sec>
              ) : dores.length > 0 && !enrichingNow ? (
                <Sec title="Gatilhos Comerciais"><p style={{fontSize:12,color:"#94a3b8"}}>{"Nenhum gatilho identificado — reenriqueça para gerar."}</p></Sec>
              ) : null}

              {sinais.length>0&&<Sec title="Sinais de Intenção"><div style={{background:"#0c2340",borderRadius:12,padding:"12px 16px"}}>{sinais.map(function(s,i){return <div key={i} style={{fontSize:11.5,color:"#7dd3fc",lineHeight:1.6,display:"flex",gap:8,marginBottom:5}}><span style={{color:"#38bdf8",flexShrink:0}}>o</span>{s}</div>;})}</div></Sec>}
              {concorrentes.length>0&&<Sec title="Concorrentes Prováveis"><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{concorrentes.map(function(cc,i){return <span key={i} style={{background:"rgba(251,191,36,.14)",border:"1px solid rgba(245,158,11,.4)",color:"#92400e",borderRadius:8,padding:"3px 10px",fontSize:10,fontWeight:600}}>{cc}</span>;})}</div></Sec>}
              {noticias.length>0&&<Sec title="Notícias e Contexto">{noticias.map(function(n,i){return <div key={i} style={{background:"#fbfbfd",border:"1px solid #e6e9ef",borderRadius:12,padding:"12px 14px",marginBottom:8}}>{n.url?<a href={n.url} target="_blank" rel="noopener noreferrer" style={{fontSize:12.5,fontWeight:700,color:"#0ea5e9",textDecoration:"none",display:"block",marginBottom:3}}>{n.titulo}</a>:<div style={{fontSize:12.5,fontWeight:700,color:"#0f172a",marginBottom:3}}>{n.titulo}</div>}<div style={{fontSize:11.5,color:"#52617a",lineHeight:1.6,marginBottom:3}}>{n.resumo}</div><div style={{fontSize:10,color:"#a5b4fc",fontWeight:600}}>{"-> "+n.relevancia}</div></div>;})}</Sec>}

              {/* ── Mapping in-progress banner (driven by enrichingNow, not the mutable Set) ── */}
              {enrichingNow && (
                <div style={{background:"linear-gradient(135deg,rgba(99,102,241,.06),rgba(139,92,246,.03))",border:"1.5px dashed rgba(99,102,241,.3)",borderRadius:14,padding:"16px 20px",display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                  <div style={{width:12,height:12,borderRadius:"50%",border:"2px solid rgba(99,102,241,.3)",borderTopColor:"#6366f1",flexShrink:0,animation:"spin .8s linear infinite"}}/>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:"#4f46e5",marginBottom:2}}>{"Mapeando conta com IA..."}</div>
                    <div style={{fontSize:11,color:"#64748b"}}>{"Analisando dores, gatilhos, perguntas SPIN e gerando mensagens. Isso leva ~30s."}</div>
                  </div>
                </div>
              )}

              {/* ── Re-enrich button (only when data exists and not loading) ── */}
              {dores.length > 0 && !enrichingNow && props.onReEnrich && (
                <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
                  <button onClick={function(){setEnrichingNow(true); props.onReEnrich(acc);}}
                    style={{background:"none",border:"1px solid #e2e8f0",borderRadius:8,padding:"6px 12px",fontSize:11,color:"#64748b",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5,transition:"all .15s"}}
                    onMouseEnter={function(e){e.currentTarget.style.borderColor="#a5b4fc";e.currentTarget.style.color="#4f46e5";}}
                    onMouseLeave={function(e){e.currentTarget.style.borderColor="#e2e8f0";e.currentTarget.style.color="#64748b";}}>
                    <Icon name="refresh" size={13}/>{"Re-enriquecer com IA"}
                  </button>
                </div>
              )}
            </div>
          )}
          {activeTab==="stakeholders"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,gap:8,flexWrap:"wrap"}}>
                <StakeholdersFetchBtn acc={acc} onContactsRefresh={props.onContactsRefresh} onDone={function(data){setEnrichedContacts(data.contacts||[]);setEnrichedSources(data.sources||[]);}}/>
                <button onClick={function(){
                  if(props.onSetContactSearch) props.onSetContactSearch(acc.nome);
                  if(onNav){ props.onClose(); onNav("contacts"); }
                }} style={{display:"flex",alignItems:"center",gap:6,background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 12px rgba(99,102,241,.25)"}}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                  {"Ver contatos mapeados"}
                </button>
              </div>
              {enrichedContacts.length>0&&(
                <div style={{marginBottom:20}}>
                  <div style={{fontSize:9,fontWeight:700,letterSpacing:1.5,color:"#a5b4fc",textTransform:"uppercase",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:"#6366f1",boxShadow:"0 0 8px rgba(16,185,129,.5)"}}/>
                    {"Contatos Reais Encontrados , "+enrichedContacts.length+" perfil"+(enrichedContacts.length>1?"s":"")}
                    {enrichedSources.map(function(s,i){return <span key={i} style={{background:"rgba(99,102,241,.08)",border:"1px solid rgba(99,102,241,.2)",color:"#4f46e5",borderRadius:6,padding:"2px 8px",fontSize:8,fontWeight:600}}>{s}</span>;})}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10,marginBottom:16}}>
                    {enrichedContacts.map(function(contact,i){
                      return (
                        <div key={i} style={{background:"linear-gradient(145deg,#f0fdf4,#fff)",border:"1.5px solid "+(contact.favorite?"rgba(245,158,11,.5)":"rgba(99,102,241,.25)"),borderRadius:14,padding:"14px 16px",position:"relative"}}>
                          <button onClick={function(){toggleFavoriteContact(i);}} title={contact.favorite?"Remover dos favoritos":"Adicionar aos favoritos"} style={{position:"absolute",top:10,right:10,background:contact.favorite?"rgba(245,158,11,.12)":"none",border:"1px solid "+(contact.favorite?"rgba(245,158,11,.4)":"#e2e8f0"),borderRadius:7,padding:5,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>
                            <Icon name="star" size={14} fill={contact.favorite} color={contact.favorite?"#f59e0b":"#94a3b8"}/>
                          </button>
                          <div style={{fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:1,paddingRight:26}}>{contact.nome||contact.name||""}</div>
                          {(contact.cargo||contact.title)&&<div style={{fontSize:10,color:"#a5b4fc",marginBottom:6,fontWeight:600}}>{contact.cargo||contact.title}</div>}
                          <div style={{display:"flex",flexDirection:"column",gap:5}}>
                            {contact.email&&(
                              <a href={"mailto:"+contact.email} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#0ea5e9",textDecoration:"none",background:"rgba(14,165,233,.06)",borderRadius:6,padding:"4px 8px"}}>
                                <span>{"@"}</span>
                                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{contact.email}</span>
                                {contact.email_confidence>0&&<span style={{fontSize:8,color:"#64748b",marginLeft:"auto",flexShrink:0}}>{contact.email_confidence+"%"}</span>}
                              </a>
                            )}
                            {contact.linkedin&&(
                              <a href={contact.linkedin.startsWith("http")?contact.linkedin:"https://www.linkedin.com/in/"+contact.linkedin} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#0a66c2",textDecoration:"none",background:"rgba(10,102,194,.06)",borderRadius:6,padding:"4px 8px",fontWeight:600}}>
                                <span>in</span><span>Ver perfil LinkedIn</span>
                              </a>
                            )}
                            {contact.phone&&<span style={{fontSize:10,color:"#52617a",padding:"2px 0"}}>{contact.phone}</span>}
                            <span style={{fontSize:8,color:"#64748b",fontStyle:"italic"}}>{contact.source}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <Sec title="Mapeamento Estratégico de Cargos">
              <div className="modal-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                {(resetMatches(), stakeholders).map(function(s,i){
                  var pc=s.prioridade==="PRIMARIO"?"#2d3a8c":s.prioridade==="SECUNDARIO"?"#92400e":"#475569";
                  var uc=s.urgencia==="Alta"?"#991b1b":s.urgencia==="Média"||s.urgencia==="Média"?"#92400e":"#64748b";
                  var match=getEnrichedStakeholder(s.cargo);
                  return (
                    <div key={i} style={{background:match?"linear-gradient(145deg,#f0fdf4,#fff)":"#f8fafc",border:"1.5px solid "+(match?"rgba(99,102,241,.3)":"#e8edf4"),borderRadius:14,padding:"14px 16px",transition:"all .2s"}} onMouseEnter={function(e){e.currentTarget.style.borderColor="rgba(99,102,241,.5)";e.currentTarget.style.boxShadow="0 4px 16px rgba(99,102,241,.1)";}} onMouseLeave={function(e){e.currentTarget.style.borderColor=match?"rgba(99,102,241,.3)":"#e8edf4";e.currentTarget.style.boxShadow="";}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                        <div style={{fontSize:12.5,fontWeight:700,color:"#0f172a",lineHeight:1.3,flex:1}}>{s.cargo}</div>
                        <div style={{display:"flex",flexDirection:"column",gap:3,alignItems:"flex-end",marginLeft:8,flexShrink:0}}>
                          <span style={{background:pc+"20",border:"1px solid "+pc,color:pc,borderRadius:6,padding:"2px 7px",fontSize:8,fontWeight:700,whiteSpace:"nowrap"}}>{s.prioridade}</span>
                          <span style={{fontSize:8,color:uc,fontWeight:600}}>{"Urgência: "+s.urgencia}</span>
                        </div>
                      </div>
                      {match&&(
                        <div style={{background:"rgba(99,102,241,.08)",border:"1px solid rgba(99,102,241,.2)",borderRadius:8,padding:"6px 10px",marginBottom:8}}>
                          <div style={{fontSize:11,fontWeight:700,color:"#a5b4fc",marginBottom:3}}>{"✓ Match: "+match.nome}</div>
                          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                            {match.email&&<a href={"mailto:"+match.email} style={{fontSize:10,color:"#0ea5e9",textDecoration:"none"}}>{match.email}</a>}
                            {match.linkedin&&<a href={match.linkedin.startsWith("http")?match.linkedin:"https://www.linkedin.com/in/"+match.linkedin} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:"#0a66c2",textDecoration:"none",fontWeight:600}}>Ver LinkedIn -></a>}
                          </div>
                        </div>
                      )}
                      <div style={{fontSize:11,color:"#52617a",lineHeight:1.6}}>{s.angulo}</div>
                    </div>
                  );
                })}
              </div>
              </Sec>
            </div>
          )}
          {activeTab==="favoritos"&&(
            <div>
              {(function(){
                var favs = enrichedContacts.map(function(c,i){return Object.assign({},c,{_idx:i});}).filter(function(c){return c.favorite;});
                if (!favs.length) {
                  return (
                    <div style={{textAlign:"center",padding:"48px 20px"}}>
                      <div style={{marginBottom:12,opacity:.35,display:"flex",justifyContent:"center"}}><Icon name="star" size={40} color="#94a3b8"/></div>
                      <div style={{fontSize:14,fontWeight:700,color:"#475569",marginBottom:6}}>{"Nenhum contato favoritado ainda"}</div>
                      <div style={{fontSize:12,color:"#94a3b8",maxWidth:340,margin:"0 auto",lineHeight:1.6}}>{"Vá até a aba Stakeholders e clique na estrela dos contatos que você quer priorizar nesta conta."}</div>
                    </div>
                  );
                }
                return (
                  <Sec title={favs.length+" contato"+(favs.length>1?"s":"")+" favoritado"+(favs.length>1?"s":"")}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10}}>
                      {favs.map(function(contact){
                        return (
                          <div key={contact._idx} style={{background:"linear-gradient(145deg,#fffbeb,#fff)",border:"1.5px solid rgba(245,158,11,.4)",borderRadius:14,padding:"14px 16px",position:"relative"}}>
                            <button onClick={function(){toggleFavoriteContact(contact._idx);}} title="Remover dos favoritos" style={{position:"absolute",top:10,right:10,background:"rgba(245,158,11,.12)",border:"1px solid rgba(245,158,11,.4)",borderRadius:7,padding:5,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                              <Icon name="star" size={14} fill={true} color="#f59e0b"/>
                            </button>
                            <div style={{fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:1,paddingRight:26}}>{contact.nome||contact.name||""}</div>
                            {(contact.cargo||contact.title)&&<div style={{fontSize:10,color:"#b45309",marginBottom:6,fontWeight:600}}>{contact.cargo||contact.title}</div>}
                            <div style={{display:"flex",flexDirection:"column",gap:5}}>
                              {contact.email&&(
                                <a href={"mailto:"+contact.email} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#0ea5e9",textDecoration:"none",background:"rgba(14,165,233,.06)",borderRadius:6,padding:"4px 8px"}}>
                                  <span>{"@"}</span>
                                  <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{contact.email}</span>
                                </a>
                              )}
                              {contact.linkedin&&(
                                <a href={contact.linkedin.startsWith("http")?contact.linkedin:"https://www.linkedin.com/in/"+contact.linkedin} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#0a66c2",textDecoration:"none",background:"rgba(10,102,194,.06)",borderRadius:6,padding:"4px 8px",fontWeight:600}}>
                                  <span>in</span><span>Ver perfil LinkedIn</span>
                                </a>
                              )}
                              {contact.phone&&<span style={{fontSize:10,color:"#52617a",padding:"2px 0"}}>{contact.phone}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Sec>
                );
              })()}
            </div>
          )}
          {activeTab==="spin"&&(
            <div>
              <Sec title="Perguntas SPIN">
                {spin.length === 0 ? (
                  (_mappingInProgress.has((acc.nome||"").toLowerCase())) ? (
                    <div style={{background:"linear-gradient(135deg,rgba(99,102,241,.06),rgba(139,92,246,.03))",border:"1.5px dashed rgba(99,102,241,.3)",borderRadius:14,padding:"16px 20px",display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:"#6366f1",flexShrink:0,animation:"pulse 1.2s ease-in-out infinite"}}/>
                      <div style={{fontSize:12,color:"#4f46e5",fontWeight:500}}>{"IA gerando perguntas SPIN... Feche e reabra este card em alguns segundos."}</div>
                    </div>
                  ) : (
                    <div style={{fontSize:12,color:"#94a3b8",padding:"16px 0"}}>{"Nenhuma pergunta SPIN gerada. Tente enriquecer novamente via Account Mapping."}</div>
                  )
                ) : spin.map(function(q,i){
                  var tipo=q.startsWith("SITUAÇÃO")||q.startsWith("SITUAÇÃO")?"S":q.startsWith("PROBLEMA")?"P":q.startsWith("IMPLICAÇÃO")||q.startsWith("IMPLICAÇÃO")?"I":"N";
                  var tc=tipo==="S"?"#0ea5e9":tipo==="P"?"#92400e":tipo==="I"?"#991b1b":"#2d3a8c";
                  var clean=q.indexOf(": ")>-1?q.slice(q.indexOf(": ")+2):q;
                  return (
                    <div key={i} style={{display:"flex",gap:10,padding:"10px 0",borderBottom:"1px solid #f1f5f9",alignItems:"flex-start"}}>
                      <span style={{background:tc+"20",border:"1px solid "+tc+"50",color:tc,borderRadius:6,padding:"2px 8px",fontSize:9,fontWeight:800,flexShrink:0,marginTop:1}}>{tipo}</span>
                      <span style={{fontSize:12.5,color:"#334155",lineHeight:1.6,flex:1}}>{clean}</span>
                      <CopyBtn text={clean}/>
                    </div>
                  );
                })}
              </Sec>
              {objecoes.length>0&&(
                <Sec title="Objeções e Respostas">
                  {objecoes.map(function(o,i){
                    var objTxt = o.objeção || o.objecao || o.objection || "";
                    var respTxt = o.resposta || o.response || "";
                    return (
                      <div key={i} style={{background:"#fbfbfd",border:"1.5px solid #e6e9ef",borderRadius:14,padding:"14px 16px",marginBottom:10}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,gap:8}}>
                          <div style={{fontSize:12,fontWeight:700,color:"#92400e",lineHeight:1.4,flex:1}}>{'"'+objTxt+'"'}</div>
                          <CopyBtn text={'"'+objTxt+'"\n-> '+respTxt}/>
                        </div>
                        <div style={{fontSize:12,color:"#334155",lineHeight:1.65}}>{"-> "+respTxt}</div>
                      </div>
                    );
                  })}
                </Sec>
              )}
            </div>
          )}
          {activeTab==="attachment"&&(
            <AttachmentAnalysis acc={acc}/>
          )}
          {activeTab==="plan"&&(
            <div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:18}}>
                <Sec title="AE , Ações Imediatas">
                  {ae.map(function(a,i){return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"8px 0",borderBottom:"1px solid #f1f5f9",gap:8}}><div style={{display:"flex",gap:8,flex:1}}><span style={{color:"#a5b4fc",flexShrink:0,fontWeight:700}}>{">"}</span><span style={{fontSize:12,color:"#334155",lineHeight:1.5}}>{a}</span></div><CopyBtn text={a}/></div>;})}
                </Sec>
                <Sec title="BDR , Ações de Suporte">
                  {bdr.map(function(a,i){return <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"8px 0",borderBottom:"1px solid #f1f5f9",gap:8}}><div style={{display:"flex",gap:8,flex:1}}><span style={{color:"#f59e0b",flexShrink:0,fontWeight:700}}>{">"}</span><span style={{fontSize:12,color:"#334155",lineHeight:1.5}}>{a}</span></div><CopyBtn text={a}/></div>;})}
                </Sec>
              </div>
              {prazo&&<div style={{background:"rgba(99,102,241,.06)",border:"1px solid rgba(99,102,241,.2)",borderRadius:14,padding:"14px 18px",display:"flex",alignItems:"center",gap:12}}><div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#6366f1,#4f46e5)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg></div><div><div style={{fontSize:9,color:"#a5b4fc",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:2}}>Prazo</div><div style={{fontSize:13,color:"#0f172a",fontWeight:600}}>{prazo}</div></div></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
function CollapsibleChannels(props) {
  var sd = props.sd; var CHANNELS = props.CHANNELS;
  var _st_open = useState({"emails":true,"inmails":false,"whatsapps":false,"cold_calls":false}); var open = _st_open[0]; var setOpen = _st_open[1];
  function toggle(key) { setOpen(function(prev){var n=Object.assign({},prev);n[key]=!n[key];return n;}); }
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {CHANNELS.map(function(cfg){
        var items=safeArr(sd("estratégia."+cfg.key));
        if(!items.length)return null;
        var isOpen=open[cfg.key];
        return (
          <div key={cfg.key} style={{border:"1.5px solid #e6e9ef",borderRadius:16,overflow:"hidden",transition:"all .25s"}}>
            <div onClick={function(){toggle(cfg.key);}} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 18px",background:isOpen?cfg.bg:"#fafafa",cursor:"pointer",userSelect:"none",transition:"background .2s"}}>
              <div style={{width:32,height:32,borderRadius:9,background:cfg.bg,border:"1.5px solid "+cfg.color+"40",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{fontSize:11,fontWeight:800,color:cfg.color}}>{cfg.label.slice(0,2)}</span>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{cfg.label}</div>
                <div style={{fontSize:10,color:"#64748b"}}>{items.length+" template"+(items.length>1?"s":"")}</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{transition:"transform .25s cubic-bezier(.22,1,.36,1)",transform:isOpen?"rotate(180deg)":"rotate(0deg)"}}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
            {isOpen&&(
              <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:12,borderTop:"1px solid #f1f5f9"}}>
                {items.map(function(item,i){
                  var text=cfg.isObj?item.corpo:item;
                  var ck=cfg.key+"-"+i;
                  return (
                    <div key={i} style={{border:"1px solid #e6e9ef",borderRadius:12,overflow:"hidden"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 14px",background:cfg.bg}}>
                        <span style={{fontSize:10,fontWeight:700,color:cfg.color}}>{"Template "+(i+1)}</span>
                        {cfg.isObj&&item.assunto&&<span style={{fontSize:11,color:"#52617a",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{", "+item.assunto}</span>}
                        <CopyBtn text={(cfg.isObj&&item.assunto?"Assunto: "+item.assunto+"\n\n":"")+text}/>
                      </div>
                      <div style={{padding:"14px 16px",fontSize:12.5,color:"#0f172a",whiteSpace:"pre-wrap",lineHeight:1.85,borderLeft:"3px solid "+cfg.color}}>{text}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
function downloadSeqPDF(seq) {
  var TOUCH_LABELS = {email:"E-mail",linkedin:"InMail",whatsapp:"WhatsApp",call:"Cold Call",follow:"Follow-up",breakup:"Breakup"};
  var html = "<html><head><title>"+((seq.account&&seq.account.nome)||"Sequencia")+"</title><style>body{font-family:Verdana,sans-serif;padding:32px;color:#0f172a;font-size:12px;line-height:1.7}h1{font-size:16px;color:#059669}h2{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#6366f1;margin:20px 0 6px;border-bottom:2px solid #e2e8f0;padding-bottom:4px}.msg{background:#f8fafc;border-left:4px solid #10b981;padding:12px 16px;white-space:pre-wrap;margin:6px 0;font-size:11px;line-height:1.8}.day{display:inline-block;background:#dcfce7;color:#065f46;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;margin-bottom:6px}.footer{margin-top:24px;border-top:1px solid #e2e8f0;padding-top:10px;font-size:10px;color:#94a3b8}</style></head><body>";
  html += "<h1>Sequencia: "+((seq.account&&seq.account.nome)||"")+((seq.profile&&seq.profile.label)?" , "+seq.profile.label:"")+"</h1>";
  html += "<p style='color:#64748b;font-size:11px'>Gerado em "+fmtDate(seq.createdAt)+" - Mais Pipe Beta</p>";
  (seq.touches||[]).forEach(function(t,i) {
    html += "<h2>"+(TOUCH_LABELS[t.type]||t.type)+" , Dia "+t.day+"</h2>";
    if (t.subject) html += "<div class='day'>Assunto: "+t.subject+"</div>";
    html += "<div class='msg'>"+t.body+"</div>";
  });
  html += "<div class='footer'>"+"Mais Pipe Beta - "+new Date().toLocaleDateString("pt-BR")+"</div></body></html>";
  var w = window.open("","_blank");
  w.document.write(html);
  w.document.close();
  setTimeout(function(){w.print();}, 400);
}
function BibliotecaView(props) {
  var _st_seqs = useState([]); var seqs = _st_seqs[0]; var setSeqs = _st_seqs[1];
  var _st_loading = useState(true); var loading = _st_loading[0]; var setLoading = _st_loading[1];
  var _st_search = useState(""); var search = _st_search[0]; var setSearch = _st_search[1];
  var _st_sortOrder = useState("az"); var sortOrder = _st_sortOrder[0]; var setSortOrder = _st_sortOrder[1];
  // Default: all collapsed. opened[key]=true means explicitly opened.
  var _st_opened = useState({}); var opened = _st_opened[0]; var setOpened = _st_opened[1];

  useEffect(function() {
    storageList("seq:").then(function(keys) {
      if (!keys.length) { setLoading(false); props.onCountChange(0); return; }
      Promise.all(keys.map(storageGet)).then(function(items) {
        var valid = items.filter(Boolean); setSeqs(valid);
        setLoading(false); props.onCountChange(valid.length);
      });
    }).catch(function(){setLoading(false);});
  }, []);

  function deleteSeq(id) {
    if (!window.confirm("Remover esta sequência?")) return;
    storageDel(id).then(function() {
      setSeqs(function(prev){var n=prev.filter(function(s){return s.id!==id;});props.onCountChange(n.length);return n;});
      props.showToast("Sequência removida.","#ef4444");
    });
  }

  function toggleGroup(empresa) {
    setOpened(function(c){ return Object.assign({},c,{[empresa]:!c[empresa]}); });
  }

  var filtered = seqs.filter(function(s){
    if (!search) return true;
    var q = search.toLowerCase();
    var nome = ((s.account&&s.account.nome)||"").toLowerCase();
    var perfil = ((s.profile&&s.profile.label)||"").toLowerCase();
    var contato = (s.contactName||"").toLowerCase();
    return nome.includes(q) || perfil.includes(q) || contato.includes(q);
  });

  // Group by empresa
  var groups = {};
  filtered.forEach(function(s){
    var key = (s.account&&s.account.nome) || "Sem empresa";
    if (!groups[key]) groups[key] = [];
    groups[key].push(s);
  });
  var sortedKeys = Object.keys(groups).sort(function(a,b){
    return sortOrder==="za" ? sortZA(a,b) : sortAZ(a,b);
  });

  var TOUCH_TYPES_LOCAL = {
    email:{label:"E-mail",color:"#0ea5e9",bg:"rgba(14,165,233,.08)"},
    linkedin:{label:"InMail",color:"#0a66c2",bg:"rgba(10,102,194,.08)"},
    whatsapp:{label:"WhatsApp",color:"#16a34a",bg:"rgba(22,163,74,.08)"},
    call:{label:"Cold Call",color:"#92400e",bg:"#fef3c7"},
    follow:{label:"Follow-up",color:"#7c3aed",bg:"#f5f3ff"},
    breakup:{label:"Breakup",color:"#52617a",bg:"#f8fafc"},
  };

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"64px 0",gap:10}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:"#6366f1"}}/>
      <span style={{color:"#64748b",fontSize:13}}>{"Carregando..."}</span>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:28,fontWeight:800,color:"#0f172a",marginBottom:4,letterSpacing:"-0.6px"}}>{"Biblioteca"}</div>
          <div style={{fontSize:13,color:"#52617a"}}>
            <strong style={{color:"#0f172a"}}>{filtered.length}</strong>
            {" de "}
            <strong style={{color:"#0f172a"}}>{seqs.length}</strong>
            {" sequência"+(seqs.length!==1?"s":"")+" · "+sortedKeys.length+" empresa"+(sortedKeys.length!==1?"s":"")}
          </div>
        </div>
        <select value={sortOrder} onChange={function(e){setSortOrder(e.target.value);}} style={{background:"#ffffff",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"8px 12px",fontSize:12,color:"#475569",fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
          <option value="az">{"A → Z"}</option>
          <option value="za">{"Z → A"}</option>
        </select>
      </div>

      {/* Search bar */}
      <div style={{position:"relative",marginBottom:18}}>
        <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",display:"flex"}}>
          <Icon name="search" size={15} color="#94a3b8"/>
        </span>
        <input value={search} onChange={function(e){setSearch(e.target.value);}}
          placeholder={"Buscar por empresa, cargo, nome do contato..."}
          style={{width:"100%",boxSizing:"border-box",background:"#fff",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"9px 36px 9px 34px",fontSize:13,color:"#0f172a",fontFamily:"inherit",outline:"none",transition:"border-color .2s"}}
          onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}}
          onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}
        />
        {search && (
          <button onClick={function(){setSearch("");}} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",padding:2,display:"flex",alignItems:"center",color:"#94a3b8"}}>
            <Icon name="close" size={14}/>
          </button>
        )}
      </div>

      {seqs.length === 0 ? (
        <div style={{textAlign:"center",padding:"64px 0",background:"#fbfbfd",borderRadius:20,border:"1.5px dashed #e6e9ef"}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:12}}><Icon name="local_library" size={40} color="#d1d5db"/></div>
          <div style={{fontSize:15,fontWeight:700,color:"#334155",marginBottom:6}}>{"Nenhuma sequência salva ainda"}</div>
          <div style={{fontSize:12,color:"#64748b",lineHeight:1.6}}>{"Vá para Sequências e gere uma cadência — ela é salva aqui automaticamente."}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{textAlign:"center",padding:"48px 0",background:"#fbfbfd",borderRadius:20,border:"1.5px dashed #e6e9ef"}}>
          <div style={{fontSize:13,fontWeight:700,color:"#334155",marginBottom:4}}>{"Nenhum resultado encontrado"}</div>
          <div style={{fontSize:12,color:"#94a3b8"}}>{"Tente outro termo de busca."}</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {sortedKeys.map(function(empresa){
            var group = groups[empresa].slice().sort(function(a,b){ return (b.createdAt||0)-(a.createdAt||0); });
            var isOpen = !!opened[empresa];
            var fc = FIT_CONFIG[(group[0].account&&group[0].account.fit)||"ALTO"]||FIT_CONFIG.ALTO;
            return (
              <div key={empresa} style={{border:"1px solid #e6e9ef",borderRadius:14,overflow:"hidden"}}>
                {/* Group header */}
                <div onClick={function(){toggleGroup(empresa);}} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",background:"linear-gradient(135deg,rgba(99,102,241,.05),rgba(14,165,233,.03))",cursor:"pointer",userSelect:"none"}} onMouseEnter={function(e){e.currentTarget.style.background="linear-gradient(135deg,rgba(99,102,241,.1),rgba(14,165,233,.06))";}} onMouseLeave={function(e){e.currentTarget.style.background="linear-gradient(135deg,rgba(99,102,241,.05),rgba(14,165,233,.03))";}}>
                  <Icon name="business" size={15} color="#6366f1"/>
                  <span style={{fontSize:13,fontWeight:700,color:"#0f172a",flex:1}}>{empresa}</span>
                  <span style={{fontSize:10,color:"#64748b",background:"#f1f5f9",borderRadius:20,padding:"2px 8px",fontWeight:600}}>
                    {group.length+" sequência"+(group.length!==1?"s":"")}
                  </span>
                  <Icon name={isOpen?"expand_less":"expand_more"} size={18} color="#94a3b8"/>
                </div>
                {/* Sequences list */}
                {isOpen && (
                  <div style={{borderTop:"1px solid #f1f5f9"}}>
                    {group.map(function(seq, si){
                      var isLast = si === group.length - 1;
                      return (
                        <div key={seq.id} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",background:"#ffffff",borderBottom:isLast?"none":"1px solid #f8fafc",transition:"background .15s"}} onMouseEnter={function(e){e.currentTarget.style.background="rgba(99,102,241,.02)";}} onMouseLeave={function(e){e.currentTarget.style.background="#ffffff";}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3,flexWrap:"wrap"}}>
                              <span style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>{seq.profile&&seq.profile.label}</span>
                              {seq.contactName && <span style={{fontSize:10,color:"#64748b"}}>{"· "+seq.contactName}</span>}
                              <span style={{background:fc.bg,border:"1px solid "+fc.border,color:fc.text,borderRadius:6,padding:"1px 7px",fontSize:8,fontWeight:700}}>{"FIT "+(seq.account&&seq.account.fit)}</span>
                            </div>
                            <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:3}}>
                              {safeArr(seq.touches).map(function(t,ti){
                                var tc=TOUCH_TYPES_LOCAL[t.type]||TOUCH_TYPES_LOCAL.email;
                                return <span key={ti} style={{background:tc.bg,color:tc.color,borderRadius:5,padding:"1px 6px",fontSize:8,fontWeight:700}}>{"D"+t.day+" "+tc.label}</span>;
                              })}
                            </div>
                            <div style={{fontSize:10,color:"#94a3b8"}}>{fmtDate(seq.createdAt)}</div>
                          </div>
                          <button onClick={function(){props.onOpenSeq(seq);}} style={{background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>{"Abrir"}</button>
                          <button onClick={function(){downloadSeqPDF(seq);}} title="PDF" style={{background:"rgba(99,102,241,.1)",border:"1px solid rgba(56,189,248,.3)",color:"#0369a1",borderRadius:8,padding:"6px 10px",cursor:"pointer",fontFamily:"inherit",flexShrink:0,display:"flex",alignItems:"center"}}>
                            <Icon name="download" size={13}/>
                          </button>
                          <button onClick={function(){deleteSeq(seq.id);}} style={{background:"none",border:"1px solid rgba(248,113,113,.25)",color:"#ef4444",borderRadius:8,padding:"6px 8px",cursor:"pointer",fontFamily:"inherit",flexShrink:0,display:"flex",alignItems:"center"}}>
                            <Icon name="delete" size={13}/>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
function Sec(props) {
  return (
    <div style={{marginBottom:22}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:"#a5b4fc",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
        <div style={{width:3,height:14,background:"linear-gradient(180deg,#6366f1,#4f46e5)",borderRadius:3,boxShadow:"0 0 8px rgba(99,102,241,.4)"}}/>
        {props.title}
      </div>
      {props.children}
    </div>
  );
}
function R(props) {
  return <div style={{display:"flex",gap:8,padding:"7px 0",borderBottom:"1px solid #f1f5f9",fontSize:12.5,color:"#334155",lineHeight:1.55}}><span style={{color:props.color,flexShrink:0,fontWeight:700}}>{props.icon}</span>{props.children}</div>;
}
// -- SEARCH VIEW ---------------------------------------------------------------
function LoadingStatus() {
  var steps = [
    { text:"Consultando fontes públicas com IA...",           icon:"🔍" },
    { text:"Mapeando estrutura e mercado da empresa...",      icon:"🧭" },
    { text:"Gerando fit score e análise de oportunidade...", icon:"⚡" },
    { text:"Criando mensagens personalizadas por canal...",   icon:"✉"  },
    { text:"Montando plano de prospecção completo...",        icon:"🎯" },
  ];
  var _st_step = useState(0); var step = _st_step[0]; var setStep = _st_step[1];
  useEffect(function() {
    var t = setInterval(function() {
      setStep(function(s) { return (s+1) % steps.length; });
    }, 1800);
    return function() { clearInterval(t); };
  }, []);
  return (
    <div style={{marginTop:16,background:"linear-gradient(135deg,rgba(99,102,241,.06),rgba(14,165,233,.04))",border:"1.5px solid rgba(99,102,241,.2)",borderRadius:16,padding:"16px 20px"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
        <div style={{width:8,height:8,borderRadius:"50%",background:"#6366f1",boxShadow:"0 0 0 3px rgba(99,102,241,.2)",animation:"pulse 1s ease-in-out infinite",flexShrink:0}}/>
        <span style={{fontSize:13,color:"#a5b4fc",fontWeight:700}}>Mais Pipe com IA</span>
        <span style={{fontSize:10,color:"#64748b",marginLeft:"auto"}}>{"análise em tempo real"}</span>
      </div>
      <div style={{fontSize:13,color:"#334155",lineHeight:1.6,display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:16}}>{steps[step].icon}</span>
        <span style={{transition:"opacity .3s"}}>{steps[step].text}</span>
      </div>
      <div style={{marginTop:12,height:3,background:"#eceef2",borderRadius:3,overflow:"hidden"}}>
        <div style={{height:"100%",background:"linear-gradient(90deg,#10b981,#0ea5e9)",borderRadius:3,animation:"shimmer 1.5s ease-in-out infinite",backgroundSize:"200% 100%"}}/>
      </div>
    </div>
  );
}


// -- CONTACTS VIEW -------------------------------------------------------------
// -- CONTACTS TABLE (shared by Todos + Favoritos tabs) ------------------------
function ContactsTable(props) {
  var contacts = props.contacts || [];
  var enriching = props.enriching || {};
  var enrichProgress = props.enrichProgress || {};

  // Column sort: { col: "nome"|"empresa"|null, dir: "az"|"za" }
  var _st_sort = useState({col:"nome", dir:"az"}); var sort = _st_sort[0]; var setSort = _st_sort[1];

  function toggleSort(col) {
    setSort(function(prev) {
      if (prev.col === col) return {col:col, dir: prev.dir==="az"?"za":"az"};
      return {col:col, dir:"az"};
    });
  }

  function SortIcon(p) {
    var active = sort.col === p.col;
    return (
      <span style={{display:"inline-flex",flexDirection:"column",marginLeft:4,opacity:active?1:.35,verticalAlign:"middle"}}>
        <svg width="7" height="5" viewBox="0 0 7 5" fill={active&&sort.dir==="az"?"#4f46e5":"#94a3b8"}><path d="M3.5 0L7 5H0z"/></svg>
        <svg width="7" height="5" viewBox="0 0 7 5" fill={active&&sort.dir==="za"?"#4f46e5":"#94a3b8"} style={{marginTop:1}}><path d="M3.5 5L0 0h7z"/></svg>
      </span>
    );
  }

  var sorted = contacts.slice().sort(function(a, b) {
    if (sort.col === "empresa") {
      var base = sortAZ(a.empresa||a.nome, b.empresa||b.nome);
      return sort.dir === "za" ? -base : base;
    }
    var base2 = sortAZ(a.nome, b.nome);
    return sort.dir === "za" ? -base2 : base2;
  });

  var thBase = {
    padding:"9px 12px",fontSize:10,fontWeight:700,color:"#52617a",
    textTransform:"uppercase",letterSpacing:.6,background:"#f8fafc",
    borderBottom:"2px solid #e6e9ef",whiteSpace:"nowrap",
    cursor:"pointer",userSelect:"none",textAlign:"left",
  };

  return (
    <div style={{overflowX:"auto",borderRadius:14,border:"1px solid #e6e9ef"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:700}}>
        <thead>
          <tr>
            <th onClick={function(){toggleSort("nome");}} style={Object.assign({},thBase,{borderRadius:"14px 0 0 0",minWidth:130})}>
              {"Contato"}<SortIcon col="nome"/>
            </th>
            <th style={Object.assign({},thBase,{minWidth:120,cursor:"default"})}>{"Cargo"}</th>
            <th style={Object.assign({},thBase,{minWidth:200,cursor:"default"})}>{"E-mail"}</th>
            <th onClick={function(){toggleSort("empresa");}} style={Object.assign({},thBase,{minWidth:140})}>
              {"Empresa"}<SortIcon col="empresa"/>
            </th>
            <th style={Object.assign({},thBase,{borderRadius:"0 14px 0 0",minWidth:220,textAlign:"right",cursor:"default"})}>{"Ações"}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(function(c, i) {
            var canSeq = !!(c.cargo || c.nome);
            var isLast = i === sorted.length - 1;
            var rowBg = i % 2 === 0 ? "#ffffff" : "#fafbff";
            return (
              <tr key={c.id} style={{background:rowBg,borderBottom:isLast?"none":"1px solid #f1f5f9",transition:"background .15s"}}
                onMouseEnter={function(e){e.currentTarget.style.background="rgba(99,102,241,.04)";}}
                onMouseLeave={function(e){e.currentTarget.style.background=rowBg;}}>

                {/* Contato */}
                <td style={{padding:"10px 12px",verticalAlign:"middle"}}>
                  <div style={{display:"flex",alignItems:"center",gap:7}}>
                    <div style={{width:26,height:26,borderRadius:7,background:"linear-gradient(135deg,#6366f1,#0ea5e9)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{fontSize:10,color:"#fff",fontWeight:700}}>{(c.nome||c.empresa||"?")[0].toUpperCase()}</span>
                    </div>
                    <span style={{fontWeight:600,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>{c.nome||"—"}</span>
                  </div>
                </td>

                {/* Cargo */}
                <td style={{padding:"10px 12px",verticalAlign:"middle",color:"#64748b",fontSize:12,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:150}}>{c.cargo||"—"}</td>

                {/* E-mail */}
                <td style={{padding:"10px 12px",verticalAlign:"middle"}}>
                  {c.email ? (
                    <div style={{display:"flex",alignItems:"center",gap:5,minWidth:0}}>
                      <a href={"mailto:"+c.email} style={{color:"#0ea5e9",textDecoration:"none",fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:170}}>{c.email}</a>
                      {c.emailConfirmed >= 2
                        ? <span style={{fontSize:8,fontWeight:700,color:"#047857",background:"rgba(52,211,153,.12)",border:"1px solid rgba(52,211,153,.3)",borderRadius:5,padding:"1px 5px",flexShrink:0}}>{c.emailConfirmed+"/3 ✓"}</span>
                        : c.emailConfirmed === 1
                          ? <span style={{fontSize:8,fontWeight:700,color:"#92400e",background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",borderRadius:5,padding:"1px 5px",flexShrink:0}}>{"1/3"}</span>
                          : c.emailConfidence
                            ? <span style={{fontSize:8,fontWeight:700,color:"#047857",background:"rgba(52,211,153,.12)",border:"1px solid rgba(52,211,153,.3)",borderRadius:5,padding:"1px 4px",flexShrink:0}}>{c.emailConfidence+"%"}</span>
                            : null
                      }
                      <CopyBtn text={c.email}/>
                    </div>
                  ) : enriching[c.id] ? (
                    <div style={{display:"flex",flexDirection:"column",gap:2,minWidth:150}}>
                      <div style={{fontSize:9,fontWeight:700,color:"#4f46e5"}}>{"Buscando..."}</div>
                      {["hunter","apollo","snov"].map(function(key){
                        var labels = {hunter:"Hunter.io",apollo:"Apollo.io",snov:"Snov.io"};
                        var st = (enrichProgress[c.id]||{})[key] || "pending";
                        var col = st==="found"?"#10b981":st==="miss"?"#94a3b8":st==="err"?"#ef4444":"#a5b4fc";
                        return (
                          <div key={key} style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:"#64748b"}}>
                            <span style={{color:col,fontWeight:700,width:8}}>{st==="found"?"✓":st==="miss"?"–":st==="err"?"✕":"⋯"}</span>
                            {labels[key]}
                            <span style={{color:col,marginLeft:"auto",fontSize:8}}>{st==="pending"?"aguardando":st==="found"?"encontrado":st==="miss"?"não encontrado":"erro"}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <button onClick={function(){props.enrichEmail(c);}} style={{background:"#eff6ff",color:"#4f46e5",border:"1px solid #c7d0fa",borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                      {"Buscar e-mail"}
                    </button>
                  )}
                </td>

                {/* Ações */}
                <td style={{padding:"10px 12px",verticalAlign:"middle"}}>
                  <div style={{display:"flex",alignItems:"center",gap:5,justifyContent:"flex-end",flexWrap:"nowrap"}}>
                    {/* Gerar sequência */}
                    <button onClick={function(){if(canSeq && props.onGenerateSequence) props.onGenerateSequence(c);}} disabled={!canSeq} title="Gerar sequência" style={{display:"flex",alignItems:"center",gap:4,background:"linear-gradient(135deg,#7c3aed,#6366f1)",color:"#fff",border:"none",borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:canSeq?"pointer":"not-allowed",opacity:canSeq?1:.45,fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                      {"Sequência"}
                    </button>
                    {/* LinkedIn */}
                    {c.linkedin && (
                      <a href={c.linkedin} target="_blank" rel="noreferrer" title="LinkedIn" style={{background:"rgba(10,102,194,.1)",border:"1px solid rgba(10,102,194,.25)",color:"#0a66c2",borderRadius:7,padding:"5px 9px",fontSize:11,fontWeight:700,textDecoration:"none",display:"flex",alignItems:"center",flexShrink:0}}>{"in"}</a>
                    )}
                    {/* Favorito */}
                    <button onClick={function(){props.toggleFavorite(c);}} title={c.favorite?"Remover dos favoritos":"Favoritar"} style={{background:c.favorite?"rgba(245,158,11,.12)":"none",border:"1px solid "+(c.favorite?"rgba(245,158,11,.4)":"#e2e8f0"),borderRadius:7,padding:"5px 7px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s"}}>
                      <Icon name="star" size={13} fill={c.favorite} color={c.favorite?"#f59e0b":"#94a3b8"}/>
                    </button>
                    {/* Excluir */}
                    <button onClick={function(){props.deleteContact(c.id);}} title="Remover" style={{background:"none",border:"1px solid rgba(248,113,113,.25)",color:"#ef4444",borderRadius:7,padding:"5px 8px",fontSize:11,cursor:"pointer",fontFamily:"inherit",flexShrink:0,display:"flex",alignItems:"center"}}>
                      <Icon name="delete" size={13}/>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// -- GROUPED CONTACTS VIEW (collapsible by company, like Biblioteca) -----------
function GroupedContactsView(props) {
  var contacts = props.contacts || [];
  var enriching = props.enriching || {};
  var enrichProgress = props.enrichProgress || {};
  // Default: all collapsed. opened[key]=true means explicitly opened.
  var _st_opened = useState({}); var opened = _st_opened[0]; var setOpened = _st_opened[1];

  function toggleGroup(empresa) {
    setOpened(function(c){ return Object.assign({},c,{[empresa]:!c[empresa]}); });
  }

  // Group by empresa
  var groups = {};
  contacts.forEach(function(c) {
    var key = c.empresa || "Sem empresa";
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  });
  var sortedKeys = Object.keys(groups).sort(function(a,b){
    return sortAZ(a, b);
  });

  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {sortedKeys.map(function(empresa){
        var group = groups[empresa];
        var isOpen = !!opened[empresa];
        return (
          <div key={empresa} style={{border:"1px solid #e6e9ef",borderRadius:14,overflow:"hidden"}}>
            {/* Group header */}
            <div onClick={function(){toggleGroup(empresa);}} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 16px",background:"linear-gradient(135deg,rgba(99,102,241,.05),rgba(14,165,233,.03))",cursor:"pointer",userSelect:"none",transition:"background .15s"}} onMouseEnter={function(e){e.currentTarget.style.background="linear-gradient(135deg,rgba(99,102,241,.1),rgba(14,165,233,.06))";}} onMouseLeave={function(e){e.currentTarget.style.background="linear-gradient(135deg,rgba(99,102,241,.05),rgba(14,165,233,.03))";}}>
              <Icon name="business" size={15} color="#6366f1"/>
              <span style={{fontSize:13,fontWeight:700,color:"#0f172a",flex:1}}>{empresa}</span>
              <span style={{fontSize:10,color:"#64748b",background:"#f1f5f9",borderRadius:20,padding:"2px 8px",fontWeight:600}}>
                {group.length+" contato"+(group.length!==1?"s":"")}
              </span>
              <Icon name={isOpen?"expand_less":"expand_more"} size={18} color="#94a3b8"/>
            </div>
            {/* Contacts list */}
            {isOpen && (
              <div style={{borderTop:"1px solid #f1f5f9"}}>
                {group.map(function(c, ci){
                  var isLast = ci === group.length-1;
                  var canSeq = !!(c.cargo || c.nome);
                  return (
                    <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",background:"#fff",borderBottom:isLast?"none":"1px solid #f8fafc",flexWrap:"wrap",gap:8,transition:"background .15s"}} onMouseEnter={function(e){e.currentTarget.style.background="rgba(99,102,241,.02)";}} onMouseLeave={function(e){e.currentTarget.style.background="#fff";}}>
                      {/* Avatar */}
                      <div style={{width:32,height:32,borderRadius:9,background:"linear-gradient(135deg,#6366f1,#0ea5e9)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <span style={{fontSize:11,color:"#fff",fontWeight:700}}>{(c.nome||"?")[0].toUpperCase()}</span>
                      </div>
                      {/* Info */}
                      <div style={{minWidth:140,flex:"1 1 140px"}}>
                        <div style={{fontSize:13,fontWeight:700,color:"#0f172a",marginBottom:1}}>{c.nome||"—"}</div>
                        {c.cargo && <div style={{fontSize:11,color:"#64748b"}}>{c.cargo}</div>}
                      </div>
                      {/* Email */}
                      <div style={{flex:"2 1 180px",minWidth:0}}>
                        {c.email ? (
                          <div style={{display:"flex",alignItems:"center",gap:5}}>
                            <a href={"mailto:"+c.email} style={{color:"#0ea5e9",textDecoration:"none",fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{c.email}</a>
                            {c.emailConfidence && <span style={{fontSize:8,fontWeight:700,color:"#047857",background:"rgba(52,211,153,.12)",border:"1px solid rgba(52,211,153,.3)",borderRadius:5,padding:"1px 5px",flexShrink:0}}>{c.emailConfidence+"%"}</span>}
                            <CopyBtn text={c.email}/>
                          </div>
                        ) : enriching[c.id] ? (
                          <div style={{display:"flex",flexDirection:"column",gap:2}}>
                            <div style={{fontSize:9,fontWeight:700,color:"#4f46e5"}}>{"Buscando..."}</div>
                            {["hunter","apollo","snov"].map(function(key){
                              var labels={hunter:"Hunter.io",apollo:"Apollo.io",snov:"Snov.io"};
                              var st=(enrichProgress[c.id]||{})[key]||"pending";
                              var col=st==="found"?"#10b981":st==="miss"?"#94a3b8":st==="err"?"#ef4444":"#a5b4fc";
                              return <div key={key} style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:"#64748b"}}><span style={{color:col,fontWeight:700,width:8}}>{st==="found"?"✓":st==="miss"?"–":st==="err"?"✕":"⋯"}</span>{labels[key]}</div>;
                            })}
                          </div>
                        ) : (
                          <button onClick={function(){props.enrichEmail(c);}} style={{background:"#eff6ff",color:"#4f46e5",border:"1px solid #c7d0fa",borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{"Buscar e-mail"}</button>
                        )}
                      </div>
                      {/* Actions */}
                      <div style={{display:"flex",alignItems:"center",gap:5,flexShrink:0,flexWrap:"nowrap"}}>
                        <button onClick={function(){if(canSeq&&props.onGenerateSequence)props.onGenerateSequence(c);}} disabled={!canSeq} title="Gerar sequência de 6 toques" style={{display:"flex",alignItems:"center",gap:5,background:"linear-gradient(135deg,#7c3aed,#6366f1)",color:"#fff",border:"none",borderRadius:7,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:canSeq?"pointer":"not-allowed",opacity:canSeq?1:.45,fontFamily:"inherit",whiteSpace:"nowrap"}}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                          {"Gerar Sequência"}
                        </button>
                        {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" title="LinkedIn" style={{background:"rgba(10,102,194,.1)",border:"1px solid rgba(10,102,194,.25)",color:"#0a66c2",borderRadius:7,padding:"5px 9px",fontSize:11,fontWeight:700,textDecoration:"none",display:"flex",alignItems:"center"}}>{"in"}</a>}
                        <button onClick={function(){props.toggleFavorite(c);}} title={c.favorite?"Remover dos favoritos":"Favoritar"} style={{background:c.favorite?"rgba(245,158,11,.12)":"none",border:"1px solid "+(c.favorite?"rgba(245,158,11,.4)":"#e2e8f0"),borderRadius:7,padding:"5px 7px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>
                          <Icon name="star" size={13} fill={c.favorite} color={c.favorite?"#f59e0b":"#94a3b8"}/>
                        </button>
                        <button onClick={function(){props.deleteContact(c.id);}} title="Remover" style={{background:"none",border:"1px solid rgba(248,113,113,.25)",color:"#ef4444",borderRadius:7,padding:"5px 8px",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center"}}>
                          <Icon name="delete" size={13}/>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ContactsView(props) {
  var _st_contacts = useState([]); var contacts = _st_contacts[0]; var setContacts = _st_contacts[1];
  var _st_loading = useState(true); var loadingC = _st_loading[0]; var setLoadingC = _st_loading[1];
  var _st_csort = useState("az"); var csort = _st_csort[0]; var setCsort = _st_csort[1];
  var _st_search = useState(props.defaultSearch||""); var search = _st_search[0]; var setSearch = _st_search[1];
  var _st_enriching = useState({}); var enriching = _st_enriching[0]; var setEnriching = _st_enriching[1];
  var _st_toast = useState(null); var toastC = _st_toast[0]; var setToastC = _st_toast[1];
  var _st_expanded = useState({}); var expandedGroups = _st_expanded[0]; var setExpandedGroups = _st_expanded[1];
  var _st_addModal = useState(false); var addModal = _st_addModal[0]; var setAddModal = _st_addModal[1];
  var _st_newNome = useState(""); var newNome = _st_newNome[0]; var setNewNome = _st_newNome[1];
  var _st_newCargo = useState(""); var newCargo = _st_newCargo[0]; var setNewCargo = _st_newCargo[1];
  var _st_newEmail = useState(""); var newEmail = _st_newEmail[0]; var setNewEmail = _st_newEmail[1];
  var _st_newLinkedin = useState(""); var newLinkedin = _st_newLinkedin[0]; var setNewLinkedin = _st_newLinkedin[1];
  var _st_newDomain = useState(""); var newDomain = _st_newDomain[0]; var setNewDomain = _st_newDomain[1];
  var _st_saving = useState(false); var saving = _st_saving[0]; var setSaving = _st_saving[1];
  // Account picker state
  var _st_accMode = useState("existing"); var accMode = _st_accMode[0]; var setAccMode = _st_accMode[1];
  var _st_selAccId = useState(""); var selAccId = _st_selAccId[0]; var setSelAccId = _st_selAccId[1];
  var _st_newAccNome = useState(""); var newAccNome = _st_newAccNome[0]; var setNewAccNome = _st_newAccNome[1];
  var _st_accSearch = useState(""); var accSearch = _st_accSearch[0]; var setAccSearch = _st_accSearch[1];
  var _st_tab = useState("all"); var activeTab = _st_tab[0]; var setActiveTab = _st_tab[1];

  var accounts = props.accounts || [];

  function resetModal() {
    setNewNome(""); setNewCargo(""); setNewEmail(""); setNewLinkedin(""); setNewDomain("");
    setAccMode("existing"); setSelAccId(""); setNewAccNome(""); setAccSearch("");
    setAddModal(false);
  }

  function toggleGroup(empresa) {
    setExpandedGroups(function(prev) { var n=Object.assign({},prev); n[empresa]=!prev[empresa]; return n; });
  }

  function addContactManual() {
    var empresaNome = "";
    if (accMode === "existing" && selAccId) {
      var found = accounts.find(function(a){ return a.id === selAccId; });
      empresaNome = found ? found.nome : "";
    } else if (accMode === "new" && newAccNome.trim()) {
      empresaNome = newAccNome.trim();
      if (props.onCreateAccount) props.onCreateAccount(empresaNome);
    }
    setSaving(true);
    var cid = "contact:" + Date.now() + "-" + Math.random().toString(36).slice(2,7);
    var c = {
      id:cid, nome:newNome||(newCargo||"Contato"), cargo:newCargo||"",
      empresa:empresaNome, email:newEmail||"", emailValidated:false,
      linkedin:newLinkedin||"", domain:newDomain||"", savedAt:Date.now(), manual:true
    };
    storageSet(cid, c).then(function() {
      setContacts(function(prev){ return [c].concat(prev); });
      resetModal();
      showToastC("Contato adicionado!", "#10b981");
    }).finally(function(){ setSaving(false); });
  }

  useEffect(function() {
    if (props.onMounted) props.onMounted();
    setLoadingC(true);
    storageList("contact:").then(function(keys) {
      if (!keys.length) { setContacts([]); setLoadingC(false); return; }
      Promise.all(keys.map(storageGet)).then(function(items) {
        var valid = items.filter(Boolean);
        setContacts(valid);
        setLoadingC(false);
      });
    }).catch(function(){ setLoadingC(false); });
  }, [props.refreshKey]);

  function showToastC(msg, color) {
    setToastC({msg:msg,color:color||"#4f46e5"});
    setTimeout(function(){ setToastC(null); }, 3000);
  }

  function deleteContact(id) {
    if (!window.confirm("Remover este contato?")) return;
    storageDel(id).then(function() {
      setContacts(function(prev){ return prev.filter(function(c){ return c.id !== id; }); });
      showToastC("Contato removido.", "#ef4444");
    });
  }

  function toggleFavorite(c) {
    var updated = Object.assign({}, c, { favorite: !c.favorite });
    storageSet(c.id, updated).then(function(){
      setContacts(function(prev){ return prev.map(function(p){ return p.id===c.id ? updated : p; }); });
      showToastC(updated.favorite ? "Adicionado aos favoritos." : "Removido dos favoritos.", updated.favorite ? "#f59e0b" : "#64748b");
      if (props.onFavoriteChange) props.onFavoriteChange();
    });
  }

  function deleteAllFromGroup(empresa, group) {
    if (!window.confirm("Excluir todos os " + group.length + " contatos de " + empresa + "?")) return;
    Promise.all(group.map(function(c){ return storageDel(c.id); })).then(function() {
      var ids = new Set(group.map(function(c){ return c.id; }));
      setContacts(function(prev){ return prev.filter(function(c){ return !ids.has(c.id); }); });
      showToastC(group.length + " contatos removidos.", "#ef4444");
    });
  }

  // enrichProgress[contactId] = { hunter:"pending"|"found"|"miss"|"err", apollo:"...", snov:"..." }
  var _st_enrichProgress = useState({}); var enrichProgress = _st_enrichProgress[0]; var setEnrichProgress = _st_enrichProgress[1];

  function setSourceStatus(contactId, source, status) {
    setEnrichProgress(function(prev){
      var n = Object.assign({}, prev);
      n[contactId] = Object.assign({}, n[contactId]||{}, {[source]: status});
      return n;
    });
  }

  function enrichEmail(contact) {
    var cid   = contact.id;
    var parts = (contact.nome||"").trim().split(/\s+/);
    var first = parts[0] || "";
    var last  = parts.slice(1).join(" ") || "";
    var org   = contact.empresa || "";
    // Use domain from contact if set, otherwise derive from account site
    var dom   = contact.domain || "";
    if (!dom && contact.empresa) {
      // Try to find matching account to get its site/domain
      var accs = props.accounts || [];
      var matchAcc = accs.find(function(a){ return a.nome && a.nome.toLowerCase()===contact.empresa.toLowerCase(); });
      if (matchAcc) {
        var site = matchAcc.site || (matchAcc.data && matchAcc.data.empresa && matchAcc.data.empresa.site) || "";
        if (site) dom = site.replace(/^https?:\/\//,"").replace(/^www\./,"").split("/")[0];
      }
    }

    // Mark overall loading + all sources pending
    setEnriching(function(e){ var n=Object.assign({},e); n[cid]=true; return n; });
    setEnrichProgress(function(prev){
      var n=Object.assign({},prev);
      n[cid]={hunter:"pending", apollo:"pending", snov:"pending"};
      return n;
    });

    // ── HUNTER ──────────────────────────────────────────────────────────────
    var pHunter = fetch("/api/hunter", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({first_name:first, last_name:last, organization_name:org, domain:dom})
    }).then(function(r){ return r.json(); }).then(function(d){
      var email = (d.person && d.person.email) || null;
      var conf  = (d.person && d.person.email_confidence) || 0;
      setSourceStatus(cid, "hunter", email ? "found" : "miss");
      return email ? {email:email, confidence:conf, source:"Hunter.io"} : null;
    }).catch(function(){ setSourceStatus(cid, "hunter", "err"); return null; });

    // ── APOLLO ───────────────────────────────────────────────────────────────
    var pApollo = fetch("/api/apollo", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({first_name:first, last_name:last, organization_name:org, domain:dom})
    }).then(function(r){ return r.json(); }).then(function(d){
      var email = (d.person && d.person.email) || (d.email) || null;
      var conf  = (d.person && d.person.email_confidence) || (d.confidence) || 0;
      setSourceStatus(cid, "apollo", email ? "found" : "miss");
      return email ? {email:email, confidence:conf, source:"Apollo.io"} : null;
    }).catch(function(){ setSourceStatus(cid, "apollo", "err"); return null; });

    // ── SNOV.IO ───────────────────────────────────────────────────────────────
    var pSnov = dom
      ? fetch("/api/snov", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({first_name:first, last_name:last, domain:dom})
        }).then(function(r){ return r.json(); }).then(function(d){
          var email = d.email || null;
          var conf  = d.confidence || 0;
          setSourceStatus(cid, "snov", email ? "found" : "miss");
          return email ? {email:email, confidence:conf, source:"Snov.io"} : null;
        }).catch(function(){ setSourceStatus(cid, "snov", "err"); return null; })
      : Promise.resolve(null).then(function(){ setSourceStatus(cid,"snov","miss"); return null; });

    // ── CONSOLIDATE ──────────────────────────────────────────────────────────
    Promise.all([pHunter, pApollo, pSnov]).then(function(results) {
      var found = results.filter(Boolean);
      // Majority vote: pick email confirmed by 2+ sources, else highest confidence
      var emailCounts = {};
      found.forEach(function(r){ emailCounts[r.email] = (emailCounts[r.email]||0)+1; });
      var majority = null;
      Object.keys(emailCounts).forEach(function(e){ if(emailCounts[e]>=2) majority=e; });

      var best = null;
      if (majority) {
        // Use the result from the majority email with highest confidence
        best = found.filter(function(r){ return r.email===majority; })
                    .reduce(function(a,b){ return (a.confidence||0)>=(b.confidence||0)?a:b; });
        best = Object.assign({}, best, {confirmed: emailCounts[majority]});
      } else if (found.length > 0) {
        // Only 1 source found — use it, flag as unconfirmed
        best = found.reduce(function(a,b){ return (a.confidence||0)>=(b.confidence||0)?a:b; });
        best = Object.assign({}, best, {confirmed: 1});
      }

      if (!best) {
        showToastC("Nenhum e-mail encontrado nas 3 fontes para este contato.", "#f59e0b");
      } else {
        var sources = found.map(function(r){return r.source;}).join(", ");
        var confirmLabel = best.confirmed >= 2
          ? ("✓ Confirmado em "+best.confirmed+"/3 fontes")
          : ("1/3 fonte — não confirmado");
        var updated = Object.assign({}, contact, {
          email:           best.email,
          emailValidated:  best.confirmed >= 2,
          emailConfidence: best.confidence || 0,
          emailSources:    sources,
          emailConfirmed:  best.confirmed,
          domain:          dom || contact.domain || ""
        });
        storageSet(cid, updated).then(function() {
          setContacts(function(prev){ return prev.map(function(c){ return c.id===cid?updated:c; }); });
          showToastC(confirmLabel + " · " + best.email, best.confirmed>=2?"#10b981":"#f59e0b");
        });
      }
    }).finally(function() {
      setTimeout(function(){
        setEnriching(function(e){ var n=Object.assign({},e); delete n[cid]; return n; });
        setEnrichProgress(function(p){ var n=Object.assign({},p); delete n[cid]; return n; });
      }, 1800); // keep status visible briefly after completion
    });
  }

  var favContacts = contacts.filter(function(c){ return c.favorite; });
  var filtered = contacts.filter(function(c) {
    if (!search) return true;
    var q = search.toLowerCase();
    return (c.nome||"").toLowerCase().includes(q) || (c.empresa||"").toLowerCase().includes(q) || (c.cargo||"").toLowerCase().includes(q) || (c.email||"").toLowerCase().includes(q);
  });
  var filteredFavs = favContacts.filter(function(c) {
    if (!search) return true;
    var q = search.toLowerCase();
    return (c.nome||"").toLowerCase().includes(q) || (c.empresa||"").toLowerCase().includes(q) || (c.cargo||"").toLowerCase().includes(q) || (c.email||"").toLowerCase().includes(q);
  });

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12,marginBottom:16}}>
          <div>
            <div style={{fontSize:22,fontWeight:800,color:"#0f172a",letterSpacing:"-0.4px"}}>{"Contatos"}</div>
            <div style={{fontSize:12,color:"#52617a",marginTop:2}}>
              {contacts.length === 0
                ? "Os contatos aparecem aqui ao mapear contas com IA."
                : <><strong style={{color:"#0f172a"}}>{(activeTab==="all" ? filtered : filteredFavs).length}</strong>{" de "}<strong style={{color:"#0f172a"}}>{(activeTab==="all" ? contacts.length : favContacts.length)}</strong>{" contato"+(contacts.length!==1?"s":" ")}{activeTab==="favs"?" favorito"+(favContacts.length!==1?"s":""): ""}</>
              }
            </div>
          </div>
          <button onClick={function(){setAddModal(true);}} style={{background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:10,padding:"9px 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",boxShadow:"0 4px 12px rgba(99,102,241,.25)",display:"flex",alignItems:"center",gap:6}}>
            <Icon name="person_add" size={14}/>{"Novo contato"}
          </button>
        </div>

        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div style={{display:"flex",gap:0,borderBottom:"1px solid #e6e9ef",marginBottom:16}}>
          {[
            {id:"all",  label:"Todos",      icon:"contacts",  count:contacts.length},
            {id:"favs", label:"Favoritos",  icon:"star",      count:favContacts.length},
          ].map(function(t){
            var active = activeTab === t.id;
            return (
              <button key={t.id} onClick={function(){setActiveTab(t.id);}} style={{display:"flex",alignItems:"center",gap:6,padding:"9px 18px",border:"none",borderBottom:"2.5px solid "+(active?"#6366f1":"transparent"),background:"transparent",color:active?"#4f46e5":"#64748b",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:active?700:500,transition:"all .15s",whiteSpace:"nowrap"}}>
                <Icon name={t.icon} size={14} fill={active} color={active?"#4f46e5":"#94a3b8"}/>
                {t.label}
                <span style={{background:active?"rgba(99,102,241,.15)":"#f1f5f9",color:active?"#4f46e5":"#64748b",borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:700,minWidth:18,textAlign:"center"}}>{t.count}</span>
              </button>
            );
          })}
        </div>

        {/* ── Search + Sort ─────────────────────────────────────────────────── */}
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{position:"relative",flex:1,minWidth:200}}>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",display:"flex",alignItems:"center"}}>
              <Icon name="search" size={16} color="#94a3b8"/>
            </span>
            <input
              value={search}
              onChange={function(e){setSearch(e.target.value);}}
              placeholder={"Buscar por nome, empresa, cargo ou e-mail..."}
              style={{width:"100%",boxSizing:"border-box",background:"#ffffff",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"9px 14px 9px 34px",fontSize:13,color:"#0f172a",fontFamily:"inherit",outline:"none",transition:"border-color .2s"}}
              onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}}
              onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}
            />
            {search && (
              <button onClick={function(){setSearch("");}} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",padding:2,display:"flex",alignItems:"center",color:"#94a3b8"}}>
                <Icon name="close" size={14}/>
              </button>
            )}
          </div>
          <select value={csort} onChange={function(e){setCsort(e.target.value);}} style={{background:"#ffffff",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"9px 12px",fontSize:12,color:"#475569",fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
            <option value="az">A - Z</option>
            <option value="za">Z - A</option>
          </select>
        </div>
      </div>
      {addModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.32)",zIndex:9999,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"60px 20px 20px"}} onClick={function(e){if(e.target===e.currentTarget)resetModal();}}>
          <div style={{background:"#ffffff",border:"1px solid #dde1e8",borderRadius:20,width:"100%",maxWidth:460,padding:"24px",boxShadow:"0 24px 80px rgba(15,23,42,.12)",maxHeight:"90vh",overflowY:"auto"}} onClick={function(e){e.stopPropagation();}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <div style={{fontSize:16,fontWeight:800,color:"#0f172a"}}>{"Novo Contato"}</div>
              <button onClick={resetModal} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:20,fontWeight:300,lineHeight:1,padding:4}} onMouseEnter={function(e){e.currentTarget.style.color="#0f172a";}} onMouseLeave={function(e){e.currentTarget.style.color="#94a3b8";}}>{"✕"}</button>
            </div>

            {/* Account picker */}
            <div style={{marginBottom:16,background:"#f8fafc",borderRadius:12,padding:"14px 16px",border:"1px solid #e8edf4"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#52617a",marginBottom:10,textTransform:"uppercase",letterSpacing:.5}}>{"Empresa / Conta"}</div>
              <div style={{display:"flex",gap:6,marginBottom:12}}>
                <button onClick={function(){setAccMode("existing");setNewAccNome("");}} style={{flex:1,padding:"7px 0",borderRadius:8,border:"1.5px solid "+(accMode==="existing"?"#6366f1":"#e2e8f0"),background:accMode==="existing"?"rgba(99,102,241,.08)":"#fff",color:accMode==="existing"?"#4f46e5":"#64748b",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>{"Conta existente"}</button>
                <button onClick={function(){setAccMode("new");setSelAccId("");setAccSearch("");}} style={{flex:1,padding:"7px 0",borderRadius:8,border:"1.5px solid "+(accMode==="new"?"#6366f1":"#e2e8f0"),background:accMode==="new"?"rgba(99,102,241,.08)":"#fff",color:accMode==="new"?"#4f46e5":"#64748b",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>{"Criar conta nova"}</button>
                <button onClick={function(){setAccMode("none");setSelAccId("");setNewAccNome("");setAccSearch("");}} style={{flex:1,padding:"7px 0",borderRadius:8,border:"1.5px solid "+(accMode==="none"?"#6366f1":"#e2e8f0"),background:accMode==="none"?"rgba(99,102,241,.08)":"#fff",color:accMode==="none"?"#4f46e5":"#64748b",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>{"Sem empresa"}</button>
              </div>
              {accMode==="existing" && (
                <div>
                  <input value={accSearch} onChange={function(e){setAccSearch(e.target.value);}} placeholder={"Buscar conta..."} style={{width:"100%",boxSizing:"border-box",background:"#fff",border:"1.5px solid #e6e9ef",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#0f172a",fontFamily:"inherit",outline:"none",marginBottom:6}} onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}/>
                  <div style={{maxHeight:140,overflowY:"auto",border:"1px solid #e8edf4",borderRadius:8,background:"#fff"}}>
                    {(accSearch ? accounts.filter(function(a){return (a.nome||"").toLowerCase().includes(accSearch.toLowerCase());}) : accounts).map(function(a){
                      var isSel = selAccId === a.id;
                      return (
                        <div key={a.id} onClick={function(){setSelAccId(a.id);}} style={{padding:"8px 12px",cursor:"pointer",background:isSel?"rgba(99,102,241,.08)":"transparent",borderBottom:"1px solid #f1f5f9",display:"flex",alignItems:"center",gap:8}} onMouseEnter={function(e){if(!isSel)e.currentTarget.style.background="#f8fafc";}} onMouseLeave={function(e){if(!isSel)e.currentTarget.style.background="transparent";}}>
                          {isSel && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                          <span style={{fontSize:12,fontWeight:isSel?700:500,color:isSel?"#4f46e5":"#0f172a",flex:1}}>{a.nome}</span>
                          {a.manualOnly && <span style={{fontSize:8,color:"#94a3b8",background:"#f1f5f9",borderRadius:4,padding:"1px 5px"}}>{"manual"}</span>}
                          {a.mapped && <span style={{fontSize:8,color:"#4f46e5",background:"rgba(99,102,241,.08)",borderRadius:4,padding:"1px 5px"}}>{"mapeada"}</span>}
                        </div>
                      );
                    })}
                    {accounts.length === 0 && <div style={{padding:"12px",fontSize:11,color:"#94a3b8",textAlign:"center"}}>{"Nenhuma conta ainda. Use 'Criar conta nova'."}</div>}
                  </div>
                </div>
              )}
              {accMode==="new" && (
                <div>
                  <input value={newAccNome} onChange={function(e){setNewAccNome(e.target.value);}} placeholder={"Nome da empresa..."} style={{width:"100%",boxSizing:"border-box",background:"#fff",border:"1.5px solid #e6e9ef",borderRadius:8,padding:"8px 12px",fontSize:12,color:"#0f172a",fontFamily:"inherit",outline:"none"}} onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}/>
                  <div style={{fontSize:10,color:"#94a3b8",marginTop:6,lineHeight:1.5}}>{"A conta será criada como manual. Ao fazer um Account Mapping futuro com esse nome, as informações serão somadas."}</div>
                </div>
              )}
              {accMode==="none" && (
                <div style={{fontSize:11,color:"#94a3b8"}}>{"Contato salvo sem vínculo com conta."}</div>
              )}
            </div>

            {/* Contact fields — all optional */}
            <div style={{fontSize:10,fontWeight:700,color:"#52617a",marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>{"Dados do contato"}<span style={{color:"#94a3b8",fontWeight:400,marginLeft:6,textTransform:"none",letterSpacing:0}}>{"(todos opcionais)"}</span></div>
            {[
              {label:"Nome completo", val:newNome, set:setNewNome, ph:"Ex: Ana Lima"},
              {label:"Cargo", val:newCargo, set:setNewCargo, ph:"Ex: VP de Operações"},
              {label:"Domínio (melhora busca de e-mail)", val:newDomain, set:setNewDomain, ph:"Ex: nubank.com.br"},
              {label:"E-mail", val:newEmail, set:setNewEmail, ph:"Ex: ana@nubank.com"},
              {label:"LinkedIn URL", val:newLinkedin, set:setNewLinkedin, ph:"Ex: linkedin.com/in/analima"},
            ].map(function(f) {
              return (
                <div key={f.label} style={{marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#52617a",marginBottom:4,textTransform:"uppercase",letterSpacing:.5}}>{f.label}</div>
                  <input value={f.val} onChange={function(e){f.set(e.target.value);}} placeholder={f.ph} style={{width:"100%",boxSizing:"border-box",background:"#fbfbfd",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"9px 12px",fontSize:13,color:"#0f172a",fontFamily:"inherit",outline:"none"}} onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}/>
                </div>
              );
            })}
            <div style={{display:"flex",gap:8,marginTop:18}}>
              <button onClick={resetModal} style={{flex:1,background:"#fbfbfd",border:"1px solid #e6e9ef",color:"#52617a",borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{"Cancelar"}</button>
              <button onClick={addContactManual} disabled={saving} style={{flex:2,background:saving?"#e2e8f0":"linear-gradient(135deg,#6366f1,#4f46e5)",color:saving?"#94a3b8":"#fff",border:"none",borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:700,cursor:saving?"default":"pointer",fontFamily:"inherit",transition:"all .2s"}}>
                {saving ? "Salvando..." : "Salvar contato"}
              </button>
            </div>
          </div>
        </div>
      )}
      {loadingC ? (
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"64px 0",gap:10}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:"#6366f1"}}/>
          <span style={{color:"#64748b",fontSize:13}}>{"Carregando..."}</span>
        </div>
      ) : (activeTab==="favs" ? filteredFavs : filtered).length === 0 ? (
        <div style={{textAlign:"center",padding:"64px 0",background:"#fbfbfd",borderRadius:20,border:"1.5px dashed #e6e9ef"}}>
          <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
            <Icon name={activeTab==="favs"?"star":"contacts"} size={40} color="#d1d5db"/>
          </div>
          <div style={{fontSize:15,fontWeight:700,color:"#334155",marginBottom:6}}>
            {search
              ? "Nenhum contato encontrado"
              : activeTab==="favs"
                ? "Nenhum contato favorito ainda"
                : "Nenhum contato ainda"
            }
          </div>
          <div style={{fontSize:12,color:"#64748b",lineHeight:1.6,maxWidth:360,margin:"0 auto"}}>
            {search
              ? "Tente outro termo de busca."
              : activeTab==="favs"
                ? "Clique na estrela de qualquer contato para adicioná-lo aos favoritos."
                : "Os contatos são criados automaticamente ao mapear contas com IA."
            }
          </div>
        </div>
      ) : (
        <GroupedContactsView
          contacts={activeTab==="favs" ? filteredFavs : filtered}
          enriching={enriching}
          enrichProgress={enrichProgress}
          enrichEmail={enrichEmail}
          toggleFavorite={toggleFavorite}
          deleteContact={deleteContact}
          onGenerateSequence={props.onGenerateSequence}
        />
      )}
      {toastC && (
        <div style={{position:"fixed",bottom:28,right:28,background:toastC.color,color:"#fff",borderRadius:14,padding:"14px 22px",fontSize:13,fontWeight:600,boxShadow:"0 12px 40px rgba(15,23,42,.10)",zIndex:400,maxWidth:340}}>
          {toastC.msg}
        </div>
      )}
    </div>
  );
}


// -- INTEGRATIONS VIEW ---------------------------------------------------------
function IntegrationsView() {
  var INTEGRATIONS = [
    {id:"salesforce", name:"Salesforce", icon:"cloud",        desc:"Sincronize contas, contatos e oportunidades com o Salesforce CRM.", color:"#00A1E0", connected:false},
    {id:"hubspot",    name:"HubSpot",    icon:"hub",          desc:"Exporte leads e sequencias diretamente para o HubSpot CRM.",      color:"#FF7A59", connected:false},
    {id:"pipedrive",  name:"Pipedrive",  icon:"target",       desc:"Crie deals automaticamente no Pipedrive ao salvar uma conta.",    color:"#272D35", connected:false},
    {id:"pipefy",     name:"Pipefy",     icon:"view_kanban",  desc:"Dispare cards e automatize pipes no Pipefy a cada conta mapeada.", color:"#3B5BFE", connected:false},
    {id:"zapier",     name:"Zapier",     icon:"bolt",         desc:"Conecte o +Pipe a milhares de apps via automações Zapier.",        color:"#FF4A00", connected:false},
    {id:"make",       name:"Make",       icon:"account_tree", desc:"Crie cenários de automação visual com o Make (ex-Integromat).",     color:"#6D00CC", connected:false},
  ];
  var _st_states = useState(function(){
    var saved = {};
    try { var r = localStorage.getItem("bdrhelper_integrations"); if(r) saved = JSON.parse(r); } catch(e){}
    return saved;
  }); var intStates = _st_states[0]; var setIntStates = _st_states[1];
  var _st_modal = useState(null); var modalInt = _st_modal[0]; var setModalInt = _st_modal[1];
  var _st_apiKey = useState(""); var apiKey = _st_apiKey[0]; var setApiKey = _st_apiKey[1];
  var _st_customModal = useState(false); var customModal = _st_customModal[0]; var setCustomModal = _st_customModal[1];
  var _st_customName = useState(""); var customName = _st_customName[0]; var setCustomName = _st_customName[1];
  var _st_customKey = useState(""); var customKey = _st_customKey[0]; var setCustomKey = _st_customKey[1];
  var _st_customURL = useState(""); var customURL = _st_customURL[0]; var setCustomURL = _st_customURL[1];
  var _st_customs = useState(function(){
    try { var r = localStorage.getItem("bdrhelper_custom_integrations"); if(r) return JSON.parse(r); } catch(e){} return [];
  }); var customs = _st_customs[0]; var setCustoms = _st_customs[1];

  function saveIntState(id, data) {
    var next = Object.assign({}, intStates);
    next[id] = data;
    setIntStates(next);
    try { localStorage.setItem("bdrhelper_integrations", JSON.stringify(next)); } catch(e){}
  }

  function connect(intId) {
    saveIntState(intId, {connected:true, apiKey:apiKey, connectedAt:Date.now()});
    setModalInt(null);
    setApiKey("");
  }

  function disconnect(intId) {
    if (!window.confirm("Desconectar esta integracao?")) return;
    saveIntState(intId, {connected:false});
  }

  function addCustom() {
    if (!customName) return;
    var c = {id:"custom_"+Date.now(), name:customName, apiKey:customKey, webhookURL:customURL, connectedAt:Date.now()};
    var next = customs.concat([c]);
    setCustoms(next);
    try { localStorage.setItem("bdrhelper_custom_integrations", JSON.stringify(next)); } catch(e){}
    setCustomModal(false); setCustomName(""); setCustomKey(""); setCustomURL("");
  }

  function removeCustom(id) {
    if (!window.confirm("Remover esta integracao?")) return;
    var next = customs.filter(function(c){ return c.id !== id; });
    setCustoms(next);
    try { localStorage.setItem("bdrhelper_custom_integrations", JSON.stringify(next)); } catch(e){}
  }

  return (
    <div>
      <div style={{marginBottom:28}}>
        <div style={{fontSize:28,fontWeight:800,color:"#0f172a",marginBottom:4,letterSpacing:"-0.6px"}}>{"Integrações"}</div>
        <div style={{fontSize:13,color:"#52617a"}}>{"Conecte o + Pipe ao seu CRM e ferramentas de vendas."}</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16,marginBottom:32}}>
        {INTEGRATIONS.map(function(int) {
          var st = intStates[int.id] || {};
          var isConn = st.connected;
          return (
            <div key={int.id} style={{background:"#ffffff",border:"1.5px solid "+(isConn?"#bbf7d0":"#e8edf4"),borderRadius:20,padding:"24px",boxShadow:"0 2px 12px rgba(15,23,42,.06)",transition:"all .25s"}} onMouseEnter={function(e){e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 32px rgba(15,23,42,.07)";}} onMouseLeave={function(e){e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="0 2px 12px rgba(15,23,42,.06)";}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                <div style={{width:44,height:44,borderRadius:12,background:int.color+"18",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name={int.icon} size={22} color={int.color}/></div>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:"#0f172a"}}>{int.name}</div>
                  {isConn && <div style={{fontSize:9,fontWeight:700,color:"#047857",background:"rgba(52,211,153,.12)",border:"1px solid rgba(52,211,153,.3)",borderRadius:6,padding:"1px 7px",display:"inline-block",marginTop:2}}>{"CONECTADO"}</div>}
                </div>
              </div>
              <div style={{fontSize:12,color:"#52617a",lineHeight:1.6,marginBottom:16}}>{int.desc}</div>
              {isConn ? (
                <div style={{display:"flex",gap:8}}>
                  <div style={{flex:1,background:"rgba(52,211,153,.12)",border:"1px solid rgba(52,211,153,.3)",borderRadius:10,padding:"8px 12px",fontSize:11,color:"#047857",fontWeight:600}}>{"Ativo"}</div>
                  <button onClick={function(){disconnect(int.id);}} style={{background:"none",border:"1px solid rgba(248,113,113,.25)",color:"#ef4444",borderRadius:10,padding:"8px 12px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{"Desconectar"}</button>
                </div>
              ) : (
                <button onClick={function(){setModalInt(int);setApiKey("");}} style={{width:"100%",background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(99,102,241,.25)"}}>{"Conectar"}</button>
              )}
            </div>
          );
        })}
        {customs.map(function(c) {
          return (
            <div key={c.id} style={{background:"#ffffff",border:"1.5px solid rgba(52,211,153,.3)",borderRadius:20,padding:"24px",boxShadow:"0 2px 12px rgba(15,23,42,.06)"}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                <div style={{width:44,height:44,borderRadius:12,background:"#fbfbfd",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="cable" size={22} color="#6366f1"/></div>
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:"#0f172a"}}>{c.name}</div>
                  <div style={{fontSize:9,fontWeight:700,color:"#047857",background:"rgba(52,211,153,.12)",border:"1px solid rgba(52,211,153,.3)",borderRadius:6,padding:"1px 7px",display:"inline-block",marginTop:2}}>{"CUSTOMIZADO"}</div>
                </div>
              </div>
              <div style={{fontSize:11,color:"#52617a",marginBottom:14,wordBreak:"break-all"}}>{c.webhookURL || "Webhook configurado"}</div>
              <button onClick={function(){removeCustom(c.id);}} style={{width:"100%",background:"none",border:"1px solid rgba(248,113,113,.25)",color:"#ef4444",borderRadius:10,padding:"8px 0",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>{"Remover"}</button>
            </div>
          );
        })}
        <button onClick={function(){setCustomModal(true);}} style={{background:"#fbfbfd",border:"2px dashed #e6e9ef",borderRadius:20,padding:"24px",cursor:"pointer",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,transition:"all .2s",minHeight:180}} onMouseEnter={function(e){e.currentTarget.style.borderColor="rgba(99,102,241,.5)";e.currentTarget.style.background="rgba(99,102,241,.08)";}} onMouseLeave={function(e){e.currentTarget.style.borderColor="#e6e9ef";e.currentTarget.style.background="#f1f3f6";}}>
          <Icon name="add" size={32} color="#94a3b8"/>
          <span style={{fontSize:13,fontWeight:600,color:"#52617a"}}>{"Adicionar integração"}</span>
          <span style={{fontSize:11,color:"#94a3b8"}}>{"Via webhook ou API key"}</span>
        </button>
      </div>
      {modalInt && (
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.32)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}}>
          <div style={{background:"#ffffff",backdropFilter:"blur(32px)",WebkitBackdropFilter:"blur(32px)",border:"1px solid #dde1e8",borderRadius:24,width:"100%",maxWidth:460,padding:"28px",boxShadow:"0 32px 100px rgba(15,23,42,.28)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><Icon name={modalInt.icon} size={20} color={modalInt.color}/><span style={{fontSize:18,fontWeight:800,color:"#0f172a"}}>{"Conectar " + modalInt.name}</span></div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:20}}>{"Insira sua API Key do " + modalInt.name + " para ativar a integracao."}</div>
            <input value={apiKey} onChange={function(e){setApiKey(e.target.value);}} placeholder={"API Key do " + modalInt.name} style={{width:"100%",boxSizing:"border-box",background:"#fbfbfd",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#0f172a",fontFamily:"inherit",outline:"none",marginBottom:16}} onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={function(){setModalInt(null);setApiKey("");}} style={{flex:1,background:"#fbfbfd",border:"1px solid #e6e9ef",color:"#52617a",borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{"Cancelar"}</button>
              <button onClick={function(){connect(modalInt.id);}} disabled={!apiKey} style={{flex:2,background:apiKey?"linear-gradient(135deg,#6366f1,#4f46e5)":"#e2e8f0",color:apiKey?"#fff":"#94a3b8",border:"none",borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:600,cursor:apiKey?"pointer":"default",fontFamily:"inherit"}}>{"Conectar " + modalInt.name}</button>
            </div>
          </div>
        </div>
      )}
      {customModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.32)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}}>
          <div style={{background:"#ffffff",backdropFilter:"blur(32px)",WebkitBackdropFilter:"blur(32px)",border:"1px solid #dde1e8",borderRadius:24,width:"100%",maxWidth:460,padding:"28px",boxShadow:"0 32px 100px rgba(15,23,42,.28)"}}>
            <div style={{fontSize:18,fontWeight:800,color:"#0f172a",marginBottom:16}}>{"Adicionar integração personalizada"}</div>
            <input value={customName} onChange={function(e){setCustomName(e.target.value);}} placeholder={"Nome da ferramenta (ex: RD Station)"} style={{width:"100%",boxSizing:"border-box",background:"#fbfbfd",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#0f172a",fontFamily:"inherit",outline:"none",marginBottom:10}} onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}/>
            <input value={customURL} onChange={function(e){setCustomURL(e.target.value);}} placeholder={"Webhook URL (opcional)"} style={{width:"100%",boxSizing:"border-box",background:"#fbfbfd",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#0f172a",fontFamily:"inherit",outline:"none",marginBottom:10}} onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}/>
            <input value={customKey} onChange={function(e){setCustomKey(e.target.value);}} placeholder={"API Key (opcional)"} style={{width:"100%",boxSizing:"border-box",background:"#fbfbfd",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#0f172a",fontFamily:"inherit",outline:"none",marginBottom:16}} onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={function(){setCustomModal(false);}} style={{flex:1,background:"#fbfbfd",border:"1px solid #e6e9ef",color:"#52617a",borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{"Cancelar"}</button>
              <button onClick={addCustom} disabled={!customName} style={{flex:2,background:customName?"linear-gradient(135deg,#6366f1,#4f46e5)":"#e2e8f0",color:customName?"#fff":"#94a3b8",border:"none",borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:600,cursor:customName?"pointer":"default",fontFamily:"inherit"}}>{"Adicionar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -- PLAN DROPDOWN ------------------------------------------------------------
function PlanDropdown(props) {
  var usage = props.usage;
  var _st_open = useState(false); var open = _st_open[0]; var setOpen = _st_open[1];
  var ref = useRef(null);
  useEffect(function(){
    function handler(e){ if(ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return function(){ document.removeEventListener("mousedown", handler); };
  }, []);
  if (!usage) return null;
  return (
    <div ref={ref} style={{position:"relative"}}>
      <button onClick={function(){setOpen(!open);}} style={{display:"flex",alignItems:"center",gap:7,background:"rgba(255,255,255,.1)",backdropFilter:"blur(12px)",border:"1px solid rgba(255,255,255,.2)",borderRadius:10,padding:"8px 14px",cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}} onMouseEnter={function(e){e.currentTarget.style.background="rgba(255,255,255,.16)";}} onMouseLeave={function(e){e.currentTarget.style.background="rgba(255,255,255,.1)";}}>
        <span style={{width:8,height:8,borderRadius:"50%",background:usage.planColor,flexShrink:0}}/>
        <span style={{fontSize:12,fontWeight:700,color:"#fff"}}>{usage.planLabel}</span>
        <span style={{fontSize:11,color:"rgba(255,255,255,.5)"}}>{usage.used + "/" + usage.limit}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2.5" style={{transition:"transform .2s",transform:open?"rotate(180deg)":"rotate(0deg)"}}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:"#ffffff",border:"1px solid #dde1e8",borderRadius:14,boxShadow:"0 16px 48px rgba(15,23,42,.2)",zIndex:200,minWidth:220,overflow:"hidden"}}>
          <div style={{padding:"10px 14px",fontSize:9,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:.8,borderBottom:"1px solid #f1f5f9"}}>{"Plano (demo)"}</div>
          {["free","starter","professional"].map(function(pid){
            var p = PLANS[pid]; var isCurrent = usage.plan===pid;
            return (
              <div key={pid} onClick={function(){ if(props.onChangePlan) props.onChangePlan(pid); setOpen(false); }} style={{padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,background:isCurrent?"#f0f3ff":"#fff",transition:"background .15s"}} onMouseEnter={function(e){if(!isCurrent)e.currentTarget.style.background="#f8fafc";}} onMouseLeave={function(e){if(!isCurrent)e.currentTarget.style.background=isCurrent?"#f0f3ff":"#fff";}}>
                <span style={{width:10,height:10,borderRadius:"50%",background:p.color,flexShrink:0}}/>
                <span style={{fontSize:13,fontWeight:700,color:"#0f172a",flex:1}}>{p.label}</span>
                <span style={{fontSize:11,color:"#64748b"}}>{p.limit + "/mês"}</span>
                {isCurrent && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -- ONBOARDING FLOW ----------------------------------------------------------
function OnboardingFlow(props) {
  var onFinish = props.onFinish;
  var _st_step = useState(0); var step = _st_step[0]; var setStep = _st_step[1];
  var _st_exiting = useState(false); var exiting = _st_exiting[0]; var setExiting = _st_exiting[1];

  // Step 1: Company site
  var _st_site = useState(""); var site = _st_site[0]; var setSite = _st_site[1];
  var _st_siteLoading = useState(false); var siteLoading = _st_siteLoading[0]; var setSiteLoading = _st_siteLoading[1];

  // Step 2: ICP
  var icpDefaults = {};
  var _st_icp = useState(function(){
    try { var s=localStorage.getItem("pipe_icp"); return s?JSON.parse(s):icpDefaults; } catch(e){ return icpDefaults; }
  }); var icp = _st_icp[0]; var setIcp = _st_icp[1];
  function saveIcp(val) { setIcp(val); try { localStorage.setItem("pipe_icp",JSON.stringify(val)); } catch(e){} }

  // Step 3: Product
  var _st_prod = useState({nome:"",descricao:"",beneficios:"",publico:"",preco:""});
  var prod = _st_prod[0]; var setProd = _st_prod[1];

  function advanceTo(nextStep) {
    setExiting(true);
    setTimeout(function(){ setExiting(false); setStep(nextStep); }, 350);
  }

  function handleSiteNext() {
    if (site.trim()) {
      setSiteLoading(true);
      try { localStorage.setItem("pipe_company_site", site.trim()); } catch(e){}
      // Call Claude to generate company DNA in background (continues even if slow)
      var icp = {};
      var produtos = [];
      try { var s=localStorage.getItem("pipe_icp"); if(s) icp=JSON.parse(s); } catch(e){}
      try { var s2=localStorage.getItem("pipe_produtos"); if(s2) produtos=JSON.parse(s2); } catch(e){}
      fetch("/api/setup", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ companySite: site.trim(), icp: icp, produtos: produtos }),
      })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d && d.ok && d.dna) {
          try { localStorage.setItem("pipe_setup_dna", JSON.stringify(d.dna)); } catch(e){}
        }
      })
      .catch(function(){})
      .finally(function(){ setSiteLoading(false); advanceTo(1); });
    } else {
      advanceTo(1);
    }
  }

  function handleIcpNext() {
    // Re-run setup with ICP now filled in
    var site2 = getCompanySite();
    var produtos2 = getStoredProducts();
    if (site2 && Object.values(icp).some(Boolean)) {
      fetch("/api/setup", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ companySite: site2, icp: icp, produtos: produtos2 }),
      })
      .then(function(r){ return r.json(); })
      .then(function(d){ if(d&&d.ok&&d.dna){ try{localStorage.setItem("pipe_setup_dna",JSON.stringify(d.dna));}catch(e){} } })
      .catch(function(){});
    }
    advanceTo(2);
  }

  function handleProdNext() {
    var produtosFinais = [];
    if (prod.nome.trim()) {
      var existing = [];
      try { var s = localStorage.getItem("pipe_produtos"); existing = s?JSON.parse(s):[]; } catch(e){}
      produtosFinais = existing.concat([Object.assign({id:Date.now()},prod)]);
      try { localStorage.setItem("pipe_produtos",JSON.stringify(produtosFinais)); } catch(e){}
    } else {
      try { var s2 = localStorage.getItem("pipe_produtos"); produtosFinais = s2?JSON.parse(s2):[]; } catch(e){}
    }
    // Final Claude setup call with complete context — most precise version
    var site3 = getCompanySite();
    var icp3 = {};
    try { var s3=localStorage.getItem("pipe_icp"); if(s3) icp3=JSON.parse(s3); } catch(e){}
    fetch("/api/setup", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ companySite: site3, icp: icp3, produtos: produtosFinais }),
    })
    .then(function(r){ return r.json(); })
    .then(function(d){ if(d&&d.ok&&d.dna){ try{localStorage.setItem("pipe_setup_dna",JSON.stringify(d.dna));}catch(e){} } })
    .catch(function(){});
    setExiting(true);
    setTimeout(function(){ if (onFinish) onFinish(); }, 350);
  }

  var STEP_LABELS = ["Sua empresa","Seu ICP","Seu Produto"];
  var inputStyle = {width:"100%",boxSizing:"border-box",background:"#f8fafc",border:"1.5px solid #e6e9ef",borderRadius:12,padding:"12px 16px",fontSize:14,color:"#0f172a",fontFamily:"inherit",outline:"none",transition:"border-color .2s"};
  var labelStyle = {fontSize:10,fontWeight:700,color:"#52617a",marginBottom:6,textTransform:"uppercase",letterSpacing:.5,display:"block"};

  return (
    <div style={{maxWidth:560,margin:"0 auto",padding:"0 4px"}}>
      {/* Progress indicator */}
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:32}}>
        {STEP_LABELS.map(function(lbl,i){
          var done = i < step;
          var active = i === step;
          return (
            <div key={i} style={{display:"flex",alignItems:"center",gap:6,flex:i<2?1:"auto"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:done?"#6366f1":active?"#6366f1":"#e2e8f0",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .3s",boxShadow:active?"0 0 0 4px rgba(99,102,241,.15)":"none"}}>
                  {done
                    ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                    : <span style={{fontSize:11,fontWeight:800,color:active?"#fff":"#94a3b8"}}>{i+1}</span>
                  }
                </div>
                <span style={{fontSize:11,fontWeight:active?700:500,color:active?"#4f46e5":done?"#6366f1":"#94a3b8",whiteSpace:"nowrap"}}>{lbl}</span>
              </div>
              {i < 2 && <div style={{flex:1,height:2,background:done?"#6366f1":"#e2e8f0",borderRadius:2,transition:"background .4s",minWidth:20}}/>}
            </div>
          );
        })}
      </div>

      {/* Card wrapper with slide animation */}
      <div className={exiting?"onb-card-exit":"onb-card"} key={step}>

        {/* ── STEP 1: Company site ─────────────────────────────────────────── */}
        {step === 0 && (
          <div style={{background:"#fff",borderRadius:22,padding:"32px",border:"1px solid #e6e9ef",boxShadow:"0 4px 24px rgba(15,23,42,.07)"}}>
            <div style={{width:52,height:52,borderRadius:15,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20,boxShadow:"0 6px 18px rgba(99,102,241,.4)"}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </div>
            <div style={{fontSize:22,fontWeight:900,color:"#0f172a",letterSpacing:"-.5px",marginBottom:6}}>{"Vamos começar!"}</div>
            <div style={{fontSize:13,color:"#64748b",marginBottom:24,lineHeight:1.65}}>{"Digite o site da sua empresa e vamos configurar o +pipe para você. Pode pular se preferir configurar depois."}</div>
            <div style={{marginBottom:20}}>
              <label style={labelStyle}>{"Site da sua empresa"}</label>
              <input
                value={site}
                onChange={function(e){setSite(e.target.value);}}
                placeholder={"Ex: minhaempresa.com.br"}
                style={inputStyle}
                onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.6)";e.target.style.background="#fff";}}
                onBlur={function(e){e.target.style.borderColor="#e6e9ef";e.target.style.background="#f8fafc";}}
                onKeyDown={function(e){if(e.key==="Enter")handleSiteNext();}}
              />
              <div style={{fontSize:11,color:"#94a3b8",marginTop:8,lineHeight:1.5}}>{"Usaremos isso para personalizar o mapeamento e as sequências de prospecção."}</div>
            </div>
            <div style={{display:"flex",gap:10,marginTop:8}}>
              <button onClick={function(){advanceTo(1);}} style={{flex:1,background:"#f8fafc",border:"1.5px solid #e2e8f0",color:"#64748b",borderRadius:12,padding:"12px 0",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}}>{"Pular"}</button>
              <button onClick={handleSiteNext} disabled={siteLoading} style={{flex:2,background:"linear-gradient(135deg,#6366f1,#7c3aed)",color:"#fff",border:"none",borderRadius:12,padding:"12px 0",fontSize:13,fontWeight:700,cursor:siteLoading?"default":"pointer",fontFamily:"inherit",boxShadow:"0 6px 18px rgba(99,102,241,.35)",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all .2s"}}>
                {siteLoading
                  ? <><div style={{width:14,height:14,borderRadius:"50%",border:"2.5px solid rgba(255,255,255,.4)",borderTopColor:"#fff",animation:"spin .7s linear infinite"}}/> {"Configurando..."}</>
                  : "Próximo →"
                }
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: ICP ──────────────────────────────────────────────────── */}
        {step === 1 && (
          <div style={{background:"#fff",borderRadius:22,padding:"32px",border:"1px solid e6e9ef",boxShadow:"0 4px 24px rgba(15,23,42,.07)"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20}}>
              <div>
                <div style={{width:52,height:52,borderRadius:15,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16,boxShadow:"0 6px 18px rgba(99,102,241,.4)"}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>
                </div>
                <div style={{fontSize:22,fontWeight:900,color:"#0f172a",letterSpacing:"-.5px",marginBottom:4}}>{"Defina seu ICP"}</div>
                <div style={{fontSize:13,color:"#64748b",lineHeight:1.65}}>{"Ideal Customer Profile — define quem é seu cliente ideal e melhora o scoring de fit em cada conta."}</div>
              </div>
              <span style={{fontSize:9,fontWeight:800,background:"linear-gradient(135deg,#f59e0b,#f97316)",color:"#fff",borderRadius:"0 12px 12px 0",padding:"4px 10px",letterSpacing:.5,marginTop:-32,marginRight:-32,whiteSpace:"nowrap"}}>{"RECOMENDADO"}</span>
            </div>
            <div style={{maxHeight:320,overflowY:"auto",paddingRight:4,marginBottom:20}}>
              {[
                {key:"segmento", label:"Segmento / Vertical-alvo", ph:"Ex: Tecnologia, Fintech, Saúde, Indústria"},
                {key:"porte",    label:"Porte (colaboradores ou receita)", ph:"Ex: 50–1000 colaboradores"},
                {key:"faturamento",label:"Faturamento estimado", ph:"Ex: R$ 20M – R$ 1B/ano"},
                {key:"regiao",   label:"Região / Mercado", ph:"Ex: Brasil, LATAM, Sul e Sudeste"},
                {key:"cargos",   label:"Cargos decisores", ph:"Ex: CEO, CFO, CTO, Diretor Comercial, VP"},
              ].map(function(f){ return (
                <div key={f.key} style={{marginBottom:12}}>
                  <label style={labelStyle}>{f.label}</label>
                  <input value={icp[f.key]||""} onChange={function(e){ var v=e.target.value; saveIcp(Object.assign({},icp,{[f.key]:v})); }} placeholder={f.ph} style={inputStyle} onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.6)";e.target.style.background="#fff";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";e.target.style.background="#f8fafc";}}/>
                </div>
              ); })}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={function(){advanceTo(2);}} style={{flex:1,background:"#f8fafc",border:"1.5px solid #e2e8f0",color:"#64748b",borderRadius:12,padding:"12px 0",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{"Pular"}</button>
              <button onClick={handleIcpNext} style={{flex:2,background:"linear-gradient(135deg,#6366f1,#7c3aed)",color:"#fff",border:"none",borderRadius:12,padding:"12px 0",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 6px 18px rgba(99,102,241,.35)"}}>{"Próximo →"}</button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Product ──────────────────────────────────────────────── */}
        {step === 2 && (
          <div style={{background:"#fff",borderRadius:22,padding:"32px",border:"1px solid #e6e9ef",boxShadow:"0 4px 24px rgba(15,23,42,.07)"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20}}>
              <div>
                <div style={{width:52,height:52,borderRadius:15,background:"linear-gradient(135deg,#059669,#10b981)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16,boxShadow:"0 6px 18px rgba(5,150,105,.4)"}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
                </div>
                <div style={{fontSize:22,fontWeight:900,color:"#0f172a",letterSpacing:"-.5px",marginBottom:4}}>{"Cadastre seu produto"}</div>
                <div style={{fontSize:13,color:"#64748b",lineHeight:1.65}}>{"O que você vende? Com produtos cadastrados, a IA personaliza dores, perguntas SPIN e sequências para a sua oferta."}</div>
              </div>
              <span style={{fontSize:9,fontWeight:800,background:"linear-gradient(135deg,#059669,#0d9488)",color:"#fff",borderRadius:"0 12px 12px 0",padding:"4px 10px",letterSpacing:.5,marginTop:-32,marginRight:-32,whiteSpace:"nowrap"}}>{"RECOMENDADO"}</span>
            </div>
            <div style={{maxHeight:280,overflowY:"auto",paddingRight:4,marginBottom:20}}>
              {[
                {key:"nome",       label:"Nome do produto *",         ph:"Ex: Consultoria de Segurança / Plataforma SaaS / Serviço Gerenciado"},
                {key:"descricao",  label:"Descrição curta",           ph:"Ex: O que é e como funciona em uma linha"},
                {key:"beneficios", label:"Benefícios principais",     ph:"Ex: Reduz tempo, elimina risco, aumenta receita"},
                {key:"publico",    label:"Público-alvo",              ph:"Ex: CEO e CTO de empresas de 50 a 500 funcionários"},
                {key:"preco",      label:"Faixa de preço / modelo",   ph:"Ex: A partir de R$ 5k/mês ou por projeto"},
              ].map(function(f){ return (
                <div key={f.key} style={{marginBottom:12}}>
                  <label style={labelStyle}>{f.label}</label>
                  <input value={prod[f.key]||""} onChange={function(e){ var v=e.target.value; setProd(function(p){ return Object.assign({},p,{[f.key]:v}); }); }} placeholder={f.ph} style={inputStyle} onFocus={function(e){e.target.style.borderColor="rgba(5,150,105,.6)";e.target.style.background="#fff";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";e.target.style.background="#f8fafc";}}/>
                </div>
              ); })}
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={handleProdNext} style={{flex:1,background:"#f8fafc",border:"1.5px solid #e2e8f0",color:"#64748b",borderRadius:12,padding:"12px 0",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{"Pular e entrar"}</button>
              <button onClick={handleProdNext} disabled={!prod.nome.trim()} style={{flex:2,background:prod.nome.trim()?"linear-gradient(135deg,#059669,#10b981)":"#e2e8f0",color:prod.nome.trim()?"#fff":"#94a3b8",border:"none",borderRadius:12,padding:"12px 0",fontSize:13,fontWeight:700,cursor:prod.nome.trim()?"pointer":"default",fontFamily:"inherit",boxShadow:prod.nome.trim()?"0 6px 18px rgba(5,150,105,.35)":"none",transition:"all .2s"}}>{"Salvar e entrar na plataforma 🚀"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HomeView(props) {
  var accounts = props.accounts || [];
  var onNav = props.onNav;
  var setupDone = props.setupDone;
  var onFinishSetup = props.onFinishSetup;
  var onResetSetup = props.onResetSetup;
  var _st_hidden   = useState({}); var hidden = _st_hidden[0]; var setHidden = _st_hidden[1];
  var _st_icpModal = useState(false); var icpModal = _st_icpModal[0]; var setIcpModal = _st_icpModal[1];
  var _st_prodModal= useState(false); var prodModal = _st_prodModal[0]; var setProdModal = _st_prodModal[1];

  // ── ICP state (persisted in localStorage) ────────────────────────────────
  var icpDefaults = {};
  var _st_icp = useState(function(){
    try { var s=localStorage.getItem("pipe_icp"); return s?JSON.parse(s):icpDefaults; } catch(e){ return icpDefaults; }
  }); var icp = _st_icp[0]; var setIcp = _st_icp[1];
  var icpSaved = !!(icp && (icp.segmento||icp.porte||icp.faturamento));

  function saveIcp(val) {
    setIcp(val);
    try { localStorage.setItem("pipe_icp", JSON.stringify(val)); } catch(e){}
  }

  // ── Product state (persisted in localStorage) ─────────────────────────────
  var _st_prods = useState(function(){
    try { var s=localStorage.getItem("pipe_produtos"); return s?JSON.parse(s):[]; } catch(e){ return []; }
  }); var produtos = _st_prods[0]; var setProdutos = _st_prods[1];
  var _st_newProd = useState({nome:"",descricao:"",beneficios:"",publico:"",preco:""});
  var newProd = _st_newProd[0]; var setNewProd = _st_newProd[1];

  function saveProduto() {
    if (!newProd.nome.trim()) return;
    var updated = produtos.concat([Object.assign({id:Date.now()},newProd)]);
    setProdutos(updated);
    try { localStorage.setItem("pipe_produtos",JSON.stringify(updated)); } catch(e){}
    setNewProd({nome:"",descricao:"",beneficios:"",publico:"",preco:""});
  }
  function deleteProduto(id) {
    var updated = produtos.filter(function(p){return p.id!==id;});
    setProdutos(updated);
    try { localStorage.setItem("pipe_produtos",JSON.stringify(updated)); } catch(e){}
  }

  // ── Re-sync ICP/Produtos from localStorage the instant setup finishes ─────
  // OnboardingFlow writes directly to localStorage (separate component, separate
  // state) so HomeView's lazily-initialized state never picks it up without this.
  var _prevSetupDone = useRef(setupDone);
  useEffect(function(){
    if (!_prevSetupDone.current && setupDone) {
      try { var s=localStorage.getItem("pipe_icp"); if(s) setIcp(JSON.parse(s)); } catch(e){}
      try { var s2=localStorage.getItem("pipe_produtos"); if(s2) setProdutos(JSON.parse(s2)); } catch(e){}
    }
    _prevSetupDone.current = setupDone;
  }, [setupDone]);

  function toggleCard(id) {
    setHidden(function(h){ var n=Object.assign({},h); n[id]=!n[id]; return n; });
  }

  var byStatus = {};
  STATUS_ORDER.forEach(function(s){ byStatus[s]=accounts.filter(function(a){return a.status===s;}).length; });
  var total     = accounts.length;
  var converted = byStatus.won||0;
  var taxa      = total>0?Math.round(converted/total*100):0;

  var CARDS = [
    {id:"prospect", label:"Busca Geral",      icon:"target",           nav:"prospect",
     desc:"Gere uma lista de 30 empresas reais com base no seu ICP. Explore, filtre e enriqueça com um clique.",
     stat:"Grátis — sem consumir créditos", statColor:"#059669"},
    {id:"busca",    label:"Account Mapping",  icon:"travel_explore",   nav:"search",
     desc:"Pesquise qualquer empresa e gere inteligência de conta completa: fit score, stakeholders, dores, mensagens e plano de ação.",
     stat:total+" conta"+(total!==1?"s":"")+" mapeada"+(total!==1?"s":""), statColor:"#6366f1"},
    {id:"contas",   label:"Contas",           icon:"folder_open",      nav:"accounts",
     desc:"Todas as empresas mapeadas organizadas por fit, tier e estágio.",
     stat:total+" no total", statColor:"#0369a1"},
    {id:"contatos", label:"Contatos",         icon:"contacts",         nav:"contacts",
     desc:"Todos os contatos mapeados com e-mail, LinkedIn e geração de sequência em 1 clique.",
     stat:"Favoritos e por conta", statColor:"#0891b2"},
    {id:"seqs",     label:"Sequências",       icon:"forward_to_inbox", nav:"sequences",
     desc:"Gere cadências de 6 toques personalizadas por stakeholder com e-mail, InMail, WhatsApp e cold call.",
     stat:"6 toques por perfil", statColor:"#7c3aed"},
    {id:"biblio",   label:"Biblioteca",       icon:"local_library",    nav:"biblioteca",
     desc:"Todas as sequências salvas organizadas. Exporte qualquer cadência em PDF com um clique.",
     stat:"Sequências salvas", statColor:"#059669"},
    {id:"pipe",     label:"Pipeline Kanban",  icon:"view_kanban",      nav:"pipeline",
     desc:"Visualize todas as contas por estágio. Arraste os cards entre colunas para atualizar o status.",
     stat:converted+" convertida"+(converted!==1?"s":""), statColor:"#065f46"},
    {id:"relat",    label:"Relatórios",       icon:"monitoring",       nav:"relatorios",
     desc:"Dashboard com funil de conversão, distribuição por fit e tier, gráficos e export em PDF.",
     stat:taxa+"% taxa de conversão", statColor:"#92400e"},
    {id:"integ",    label:"Integrações",      icon:"hub",              nav:"integracoes",
     desc:"Conecte HubSpot, Salesforce, Pipedrive, Zapier, Make e muito mais ao +Pipe.",
     stat:"HubSpot · Salesforce · Zapier", statColor:"#4f46e5"},
  ];

  var visible = CARDS.filter(function(c2){ return !hidden[c2.id]; });
  var now = new Date();
  var hr  = now.getHours();
  var greet = hr<12?"Bom dia":hr<18?"Boa tarde":"Boa noite";

  // ── Fit criteria from clientLoader ────────────────────────────────────────
  var fitCriteria = [];

  return (
    <div>
      {/* ── ONBOARDING FLOW (first access) ── */}
      {!setupDone && (
        <div>
          {/* Hero banner - always visible */}
          <div style={{position:"relative",borderRadius:24,overflow:"hidden",marginBottom:32,background:"linear-gradient(135deg,#0a0a14 0%,#171430 45%,#1e1b4b 100%)",border:"1px solid rgba(99,102,241,.2)",padding:"36px 40px 32px"}}>
            <div style={{position:"absolute",top:-80,right:-60,width:320,height:320,borderRadius:"50%",background:"radial-gradient(circle,rgba(99,102,241,.4),transparent 70%)",filter:"blur(20px)"}}/>
            <div style={{position:"absolute",bottom:-100,left:-40,width:280,height:280,borderRadius:"50%",background:"radial-gradient(circle,rgba(139,92,246,.3),transparent 70%)",filter:"blur(20px)"}}/>
            <div style={{position:"relative",zIndex:2}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                <span style={{fontSize:10,fontWeight:700,color:"#4f46e5",background:"rgba(99,102,241,.15)",border:"1px solid rgba(129,140,248,.3)",borderRadius:20,padding:"4px 12px",letterSpacing:.5}}>{"PROSPECTING TOOL"}</span>
                <span style={{fontSize:12,color:"#94a3b8"}}>{"Configuração inicial"}</span>
              </div>
              <div style={{fontSize:32,fontWeight:900,letterSpacing:"-1px",lineHeight:1.1,color:"#fff",marginBottom:8}}>
                <span style={{color:"#818cf8"}}>{"+"}</span>{"pipe"}
                <span style={{display:"block",fontSize:16,fontWeight:600,color:"#94a3b8",letterSpacing:"-.2px",marginTop:6}}>{"Account mapping com IA para times de vendas"}</span>
              </div>
              <div style={{fontSize:13,color:"#94a3b8",maxWidth:480,lineHeight:1.7}}>{"Faça a configuração inicial em 3 etapas rápidas e deixe a plataforma pronta para o seu perfil. Você pode pular qualquer etapa."}</div>
            </div>
          </div>
          {/* Onboarding steps title */}
          <div style={{marginBottom:20}}>
            <div style={{fontSize:12,fontWeight:700,color:"#52617a",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{"Comece por aqui"}</div>
          </div>
          <OnboardingFlow onFinish={onFinishSetup}/>
        </div>
      )}

      {/* ── NORMAL HOME VIEW (post-setup) ── */}
      {setupDone && (
      <div>
      {/* ── Hero ── */}
      <div style={{position:"relative",borderRadius:24,overflow:"hidden",marginBottom:28,background:"linear-gradient(135deg,#0a0a14 0%,#171430 45%,#1e1b4b 100%)",border:"1px solid #e6e9ef",padding:"28px 24px 28px"}}>
        <div style={{position:"absolute",top:-80,right:-60,width:320,height:320,borderRadius:"50%",background:"radial-gradient(circle,rgba(99,102,241,.4),transparent 70%)",filter:"blur(20px)"}}/>
        <div style={{position:"absolute",bottom:-100,left:-40,width:280,height:280,borderRadius:"50%",background:"radial-gradient(circle,rgba(139,92,246,.3),transparent 70%)",filter:"blur(20px)"}}/>
        <div style={{position:"relative",zIndex:2}}>
          {/* Top row: label + plan badge */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:16,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <span style={{fontSize:10,fontWeight:700,color:"#4f46e5",background:"rgba(99,102,241,.15)",border:"1px solid rgba(129,140,248,.3)",borderRadius:20,padding:"4px 12px",letterSpacing:.5}}>{"PROSPECTING TOOL"}</span>
              <span style={{fontSize:12,color:"#94a3b8"}}>{greet + ", vamos gerar pipeline"}</span>
            </div>
            {props.usage && <PlanDropdown usage={props.usage} onChangePlan={props.onChangePlan}/>}
          </div>
          <div style={{fontSize:38,fontWeight:900,letterSpacing:"-1.2px",lineHeight:1.05,color:"#fff",marginBottom:10}}>
            <span style={{color:"#818cf8"}}>{"+"}</span>{"pipe"}
            <span style={{display:"block",fontSize:18,fontWeight:600,color:"#94a3b8",letterSpacing:"-.3px",marginTop:6}}>{"Account mapping com IA para times de vendas"}</span>
          </div>
          <div style={{fontSize:13.5,color:"#94a3b8",maxWidth:520,lineHeight:1.7,marginBottom:26}}>{"Pesquise qualquer empresa, gere inteligência de conta completa e cadências de prospecção em segundos. Chegue preparado, feche mais rápido."}</div>
          <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
            {[
              {label:"Contas mapeadas",   value:total,      accent:"#818cf8"},
              {label:"Convertidas",       value:converted,  accent:"#34d399"},
              {label:"Taxa de conversão", value:taxa+"%",   accent:"#c084fc"},
            ].map(function(m){ return (
              <div key={m.label} style={{background:"rgba(255,255,255,.06)",border:"1px solid rgba(255,255,255,.12)",borderRadius:16,padding:"16px 22px",minWidth:128}}>
                <div style={{fontSize:30,fontWeight:800,color:m.accent,lineHeight:1,letterSpacing:"-.5px"}}>{m.value}</div>
                <div style={{fontSize:10.5,color:"#cbd5e1",fontWeight:500,marginTop:6,whiteSpace:"nowrap"}}>{m.label}</div>
              </div>
            ); })}
          </div>
        </div>
      </div>

      {/* ── Comece por aqui ───────────────────────────────────────────────── */}
      <div style={{marginBottom:28}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <div style={{width:4,height:18,background:"linear-gradient(180deg,#6366f1,#8b5cf6)",borderRadius:2,flexShrink:0}}/>
          <div style={{fontSize:14,fontWeight:800,color:"#1e293b",letterSpacing:"-.2px"}}>{"Comece por aqui"}</div>
        </div>
        {/* Busca Geral CTA card */}
        <div onClick={function(){onNav("prospect");}} style={{background:"linear-gradient(135deg,#0a0a14,#171430)",border:"1px solid rgba(99,102,241,.3)",borderRadius:18,padding:"24px 28px",cursor:"pointer",display:"flex",alignItems:"center",gap:20,transition:"all .25s cubic-bezier(.22,1,.36,1)",position:"relative",overflow:"hidden"}} onMouseEnter={function(e){e.currentTarget.style.borderColor="rgba(99,102,241,.6)";e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 12px 36px rgba(99,102,241,.2)";}} onMouseLeave={function(e){e.currentTarget.style.borderColor="rgba(99,102,241,.3)";e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
          <div style={{position:"absolute",top:-40,right:-20,width:160,height:160,borderRadius:"50%",background:"radial-gradient(circle,rgba(99,102,241,.25),transparent 70%)",filter:"blur(12px)"}}/>
          <div style={{width:52,height:52,borderRadius:15,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 6px 18px rgba(99,102,241,.45)"}}>
            <Icon name="target" size={24} color="#ffffff"/>
          </div>
          <div style={{flex:1,position:"relative",zIndex:1}}>
            <div style={{fontSize:16,fontWeight:800,color:"#fff",marginBottom:4,letterSpacing:"-.3px"}}>{"Busca Geral — mapeamento inicial"}</div>
            <div style={{fontSize:12.5,color:"#94a3b8",lineHeight:1.6}}>{"Gere uma lista de 30 empresas reais com base no seu ICP. Explore, filtre por fit e enriqueça com 1 clique. Gratuito."}</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(99,102,241,.2)",border:"1px solid rgba(99,102,241,.35)",borderRadius:10,padding:"8px 16px",flexShrink:0,position:"relative",zIndex:1}}>
            <span style={{fontSize:12,fontWeight:700,color:"#a5b4fc",whiteSpace:"nowrap"}}>{"Iniciar →"}</span>
          </div>
        </div>
      </div>

      {/* ── Configurações ─────────────────────────────────────────────────── */}
      <div style={{marginBottom:28}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
          <div style={{width:4,height:18,background:"linear-gradient(180deg,#6366f1,#8b5cf6)",borderRadius:2,flexShrink:0}}/>
          <div style={{fontSize:14,fontWeight:800,color:"#1e293b",letterSpacing:"-.2px"}}>{"Configurações"}</div>
          {icpSaved && produtos.length>0
            ? <span style={{fontSize:10,fontWeight:700,color:"#059669",background:"rgba(5,150,105,.1)",border:"1px solid rgba(5,150,105,.25)",borderRadius:20,padding:"3px 10px",marginLeft:4}}>{"✓ Tudo configurado"}</span>
            : <span style={{fontSize:10,fontWeight:700,color:"#d97706",background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",borderRadius:20,padding:"3px 10px",marginLeft:4}}>{(!icpSaved&&!produtos.length)?"2 itens pendentes":!icpSaved?"ICP pendente":"Produto pendente"}</span>
          }
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:14}}>

          {/* ICP Card */}
          <div onClick={function(){setIcpModal(true);}} style={{background:icpSaved?"linear-gradient(135deg,rgba(99,102,241,.07),rgba(139,92,246,.04))":"linear-gradient(135deg,#fff,rgba(99,102,241,.03))",border:"1.5px solid "+(icpSaved?"rgba(99,102,241,.4)":"rgba(99,102,241,.2)"),borderRadius:16,padding:"20px",cursor:"pointer",transition:"all .2s",position:"relative",boxShadow:icpSaved?"0 2px 12px rgba(99,102,241,.1)":"0 2px 8px rgba(99,102,241,.06)"}}
            onMouseEnter={function(e){e.currentTarget.style.borderColor="rgba(99,102,241,.6)";e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 24px rgba(99,102,241,.15)";}}
            onMouseLeave={function(e){e.currentTarget.style.borderColor=icpSaved?"rgba(99,102,241,.4)":"rgba(99,102,241,.2)";e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=icpSaved?"0 2px 12px rgba(99,102,241,.1)":"0 2px 8px rgba(99,102,241,.06)";}}>
            {icpSaved
              ? <div style={{position:"absolute",top:-1,right:16,background:"linear-gradient(135deg,#059669,#10b981)",color:"#fff",fontSize:9,fontWeight:800,borderRadius:"0 0 8px 8px",padding:"3px 10px",letterSpacing:.5}}>{"✓ CONCLUÍDO"}</div>
              : <div style={{position:"absolute",top:-1,right:16,background:"linear-gradient(135deg,#f59e0b,#f97316)",color:"#fff",fontSize:9,fontWeight:800,borderRadius:"0 0 8px 8px",padding:"3px 10px",letterSpacing:.5}}>{"RECOMENDADO"}</div>
            }
            <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
              <div style={{width:44,height:44,borderRadius:13,background:icpSaved?"linear-gradient(135deg,#6366f1,#8b5cf6)":"linear-gradient(135deg,#818cf8,#a78bfa)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:icpSaved?"0 4px 14px rgba(99,102,241,.4)":"0 4px 10px rgba(99,102,241,.2)"}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/></svg>
              </div>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                  <div style={{fontSize:14,fontWeight:800,color:"#0f172a"}}>{icpSaved?"ICP Configurado ✓":"1. Configure seu ICP"}</div>
                </div>
                <div style={{fontSize:11.5,color:icpSaved?"#4f46e5":"#64748b",lineHeight:1.55,fontWeight:icpSaved?500:400}}>{icpSaved?("Segmento: "+(icp.segmento||"—")):"Defina quem é seu cliente ideal: segmento, porte, faturamento e cargos decisores. O ICP é usado em todo o mapeamento e na Busca Geral."}</div>
              </div>
              {icpSaved && <span style={{fontSize:9,fontWeight:700,color:"#4f46e5",background:"rgba(99,102,241,.1)",border:"1px solid rgba(99,102,241,.25)",borderRadius:6,padding:"2px 7px",flexShrink:0}}>{"✓ ativo"}</span>}
            </div>
            {icpSaved && fitCriteria.length>0 && (
              <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
                {fitCriteria.map(function(c){ return (
                  <span key={c.id} style={{fontSize:9,color:"#6366f1",background:"rgba(99,102,241,.08)",borderRadius:5,padding:"2px 7px",fontWeight:600}}>{c.label}</span>
                ); })}
              </div>
            )}
            {!icpSaved && (
              <div style={{background:"rgba(99,102,241,.06)",borderRadius:10,padding:"10px 12px",marginTop:8}}>
                <div style={{fontSize:10.5,color:"#4338ca",lineHeight:1.6,fontWeight:500}}>{"Sem ICP configurado, o fit score é genérico e a Busca Geral usa critérios padrão. Com ICP, cada conta recebe um score personalizado para o seu negócio."}</div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginTop:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:"#6366f1",flexShrink:0}}/>
                  <span style={{fontSize:11,color:"#6366f1",fontWeight:700}}>{"Configurar agora →"}</span>
                </div>
              </div>
            )}
          </div>

          {/* Produto Card */}
          <div onClick={function(){setProdModal(true);}} style={{background:produtos.length>0?"linear-gradient(135deg,rgba(5,150,105,.06),rgba(16,185,129,.03))":"linear-gradient(135deg,#fff,rgba(5,150,105,.02))",border:"1.5px solid "+(produtos.length>0?"rgba(5,150,105,.4)":"rgba(5,150,105,.2)"),borderRadius:16,padding:"20px",cursor:"pointer",transition:"all .2s",position:"relative",boxShadow:produtos.length>0?"0 2px 12px rgba(5,150,105,.08)":"0 2px 8px rgba(5,150,105,.04)"}}
            onMouseEnter={function(e){e.currentTarget.style.borderColor="rgba(5,150,105,.6)";e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 24px rgba(5,150,105,.12)";}}
            onMouseLeave={function(e){e.currentTarget.style.borderColor=produtos.length>0?"rgba(5,150,105,.4)":"rgba(5,150,105,.2)";e.currentTarget.style.transform="";e.currentTarget.style.boxShadow=produtos.length>0?"0 2px 12px rgba(5,150,105,.08)":"0 2px 8px rgba(5,150,105,.04)";}}>
            {produtos.length>0
              ? <div style={{position:"absolute",top:-1,right:16,background:"linear-gradient(135deg,#059669,#10b981)",color:"#fff",fontSize:9,fontWeight:800,borderRadius:"0 0 8px 8px",padding:"3px 10px",letterSpacing:.5}}>{"✓ CONCLUÍDO"}</div>
              : <div style={{position:"absolute",top:-1,right:16,background:"linear-gradient(135deg,#059669,#0d9488)",color:"#fff",fontSize:9,fontWeight:800,borderRadius:"0 0 8px 8px",padding:"3px 10px",letterSpacing:.5}}>{"RECOMENDADO"}</div>
            }
            <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
              <div style={{width:44,height:44,borderRadius:13,background:produtos.length>0?"linear-gradient(135deg,#059669,#10b981)":"linear-gradient(135deg,#34d399,#6ee7b7)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:produtos.length>0?"0 4px 14px rgba(5,150,105,.35)":"0 4px 10px rgba(5,150,105,.15)"}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:3}}>{produtos.length>0?(produtos.length+" produto"+(produtos.length!==1?"s":"")+" ✓"):"2. Cadastre seu Produto"}</div>
                <div style={{fontSize:11.5,color:produtos.length>0?"#059669":"#64748b",lineHeight:1.55,fontWeight:produtos.length>0?500:400}}>{produtos.length>0?(produtos.map(function(p){return p.nome;}).join(", ")):"Descreva o que você vende. Com produtos cadastrados, o mapeamento de conta relaciona dores e oportunidades diretamente à sua oferta."}</div>
              </div>
              {produtos.length>0 && <span style={{fontSize:9,fontWeight:700,color:"#059669",background:"rgba(5,150,105,.1)",border:"1px solid rgba(5,150,105,.25)",borderRadius:6,padding:"2px 7px",flexShrink:0}}>{"✓ ativo"}</span>}
            </div>
            {!produtos.length && (
              <div style={{background:"rgba(5,150,105,.05)",borderRadius:10,padding:"10px 12px",marginTop:8}}>
                <div style={{fontSize:10.5,color:"#065f46",lineHeight:1.6,fontWeight:500}}>{"Sem produtos, o mapeamento usa os serviços padrão do seu plano. Com produtos cadastrados, a IA personaliza dores, perguntas SPIN e sequências para o que você vende."}</div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginTop:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:"#059669",flexShrink:0}}/>
                  <span style={{fontSize:11,color:"#059669",fontWeight:700}}>{"Adicionar produto →"}</span>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Acesso rápido ─────────────────────────────────────────────────── */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:10}}>
        <div style={{fontSize:13,fontWeight:700,color:"#1e293b"}}>{"Acesso rápido"}</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {CARDS.map(function(c2){
            var isHidden = hidden[c2.id];
            return (
              <button key={c2.id} onClick={function(){toggleCard(c2.id);}} style={{display:"flex",alignItems:"center",gap:5,background:isHidden?"rgba(255,255,255,.04)":"rgba(99,102,241,.15)",border:"1px solid "+(isHidden?"rgba(255,255,255,.08)":"rgba(99,102,241,.3)"),color:isHidden?"rgba(255,255,255,.4)":"#a5b4fc",borderRadius:8,padding:"4px 10px",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all .2s",opacity:isHidden?.6:1}}>
                <Icon name={c2.icon} size={12}/>{c2.label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(290px,1fr))",gap:18}}>
        {visible.map(function(card){
          return (
            <div key={card.id} onClick={function(){onNav(card.nav);}} style={{background:"#ffffff",border:"1px solid #e6e9ef",borderRadius:18,padding:"24px",cursor:"pointer",transition:"all .25s cubic-bezier(.22,1,.36,1)",position:"relative",overflow:"hidden"}}
              onMouseEnter={function(e){e.currentTarget.style.borderColor="rgba(99,102,241,.35)";e.currentTarget.style.background="rgba(99,102,241,.06)";e.currentTarget.style.transform="translateY(-4px)";e.currentTarget.style.boxShadow="0 16px 48px rgba(15,23,42,.10)";}}
              onMouseLeave={function(e){e.currentTarget.style.borderColor="#e6e9ef";e.currentTarget.style.background="#fff";e.currentTarget.style.transform="";e.currentTarget.style.boxShadow="";}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16}}>
                <div style={{width:48,height:48,borderRadius:14,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 6px 16px rgba(99,102,241,.4)",flexShrink:0}}>
                  <Icon name={card.icon} size={22} color="#ffffff"/>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
              </div>
              <div style={{fontSize:16,fontWeight:800,color:"#0f172a",marginBottom:8,letterSpacing:"-.3px"}}>{card.label}</div>
              <div style={{fontSize:12.5,color:"#64748b",lineHeight:1.65,marginBottom:16,minHeight:48}}>{card.desc}</div>
              <div style={{display:"flex",alignItems:"center",gap:7,paddingTop:14,borderTop:"1px solid rgba(0,0,0,.05)"}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:card.statColor,flexShrink:0}}/>
                <span style={{fontSize:11,color:card.statColor,fontWeight:600}}>{card.stat}</span>
              </div>
            </div>
          );
        })}
      </div>

      {total === 0 && (
        <div style={{marginTop:28,background:"linear-gradient(135deg,rgba(99,102,241,.12),rgba(255,255,255,.02))",border:"1px solid rgba(99,102,241,.25)",borderRadius:18,padding:"32px",textAlign:"center"}}>
          <div style={{marginBottom:12,display:"flex",justifyContent:"center"}}><Icon name="rocket_launch" size={40} color="#6366f1"/></div>
          <div style={{fontSize:18,fontWeight:700,color:"#0f172a",marginBottom:8}}>{"Bem-vindo ao +pipe"}</div>
          <div style={{fontSize:13,color:"#64748b",marginBottom:20,lineHeight:1.7,maxWidth:400,margin:"0 auto 20px"}}>{"Comece mapeando sua primeira conta. Digite o nome de uma empresa ou cole o site dela na Busca."}</div>
          <button onClick={function(){onNav("search");}} style={{background:"linear-gradient(135deg,#6366f1,#7c3aed)",color:"#fff",border:"none",borderRadius:12,padding:"12px 28px",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(99,102,241,.45)"}}>
            {"Mapear primeira conta"}
          </button>
        </div>
      )}

      {/* ══ MODAL ICP ══════════════════════════════════════════════════════ */}
      {icpModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.4)",zIndex:10000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"60px 20px 20px",overflowY:"auto"}} onClick={function(e){if(e.target===e.currentTarget)setIcpModal(false);}}>
          <div style={{background:"#fff",borderRadius:22,width:"100%",maxWidth:560,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 32px 80px rgba(15,23,42,.18)"}} onClick={function(e){e.stopPropagation();}}>
            <div style={{padding:"24px 28px 0",position:"sticky",top:0,background:"#fff",zIndex:2,borderBottom:"1px solid #f1f5f9",paddingBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:18,fontWeight:800,color:"#0f172a",letterSpacing:"-.3px"}}>{"Configurar ICP"}</div>
                  <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{"Ideal Customer Profile — enriquece o fit score de todas as contas mapeadas"}</div>
                </div>
                <button onClick={function(){setIcpModal(false);}} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:20,lineHeight:1,padding:4}} onMouseEnter={function(e){e.currentTarget.style.color="#0f172a";}} onMouseLeave={function(e){e.currentTarget.style.color="#94a3b8";}}>{"✕"}</button>
              </div>
            </div>
            <div style={{padding:"20px 28px 28px"}}>
              {/* ICP fields */}
              {[
                {key:"segmento",    label:"Segmento / Vertical-alvo",         ph:"Ex: Tecnologia, Fintech, Saúde, Indústria"},
                {key:"porte",       label:"Porte (colaboradores ou receita)",  ph:"Ex: 50–1000 colaboradores / R$ 10M–R$ 500M"},
                {key:"faturamento", label:"Faturamento estimado",              ph:"Ex: R$ 20M – R$ 1B/ano"},
                {key:"regiao",      label:"Região / Mercado",                  ph:"Ex: Brasil, LATAM, Sul e Sudeste"},
                {key:"cargos",      label:"Cargos decisores",                  ph:"Ex: CEO, CFO, CTO, Diretor Comercial, VP"},
              ].map(function(f){ return (
                <div key={f.key} style={{marginBottom:14}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#52617a",marginBottom:5,textTransform:"uppercase",letterSpacing:.5}}>{f.label}</div>
                  <input value={icp[f.key]||""} onChange={function(e){ var v=e.target.value; saveIcp(Object.assign({},icp,{[f.key]:v})); }} placeholder={f.ph} style={{width:"100%",boxSizing:"border-box",background:"#f8fafc",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#0f172a",fontFamily:"inherit",outline:"none"}} onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}/>
                </div>
              ); })}
              <div style={{marginBottom:20}}>
                <div style={{fontSize:10,fontWeight:700,color:"#52617a",marginBottom:5,textTransform:"uppercase",letterSpacing:.5}}>{"Observações / Contexto adicional"}</div>
                <textarea value={icp.observacoes||""} onChange={function(e){ saveIcp(Object.assign({},icp,{observacoes:e.target.value})); }} placeholder={"Ex: Empresas sem CISO dedicado, em crescimento ou expansão para mercados regulados."} rows={3} style={{width:"100%",boxSizing:"border-box",background:"#f8fafc",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#0f172a",fontFamily:"inherit",outline:"none",resize:"vertical"}} onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}/>
              </div>

              {/* 5 critérios de fit */}
              {fitCriteria.length>0 && (
                <div style={{background:"rgba(99,102,241,.04)",border:"1px solid rgba(99,102,241,.15)",borderRadius:14,padding:"16px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#4f46e5",marginBottom:12,textTransform:"uppercase",letterSpacing:.5}}>{"5 critérios de fit — aplicados ao scoring de conta"}</div>
                  {fitCriteria.map(function(c,i){ return (
                    <div key={c.id} style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:i<fitCriteria.length-1?10:0}}>
                      <div style={{width:22,height:22,borderRadius:7,background:"linear-gradient(135deg,#6366f1,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
                        <span style={{fontSize:10,color:"#fff",fontWeight:800}}>{i+1}</span>
                      </div>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:"#0f172a"}}>{c.label}</div>
                        <div style={{fontSize:11,color:"#64748b",lineHeight:1.5}}>{c.desc}</div>
                      </div>
                    </div>
                  ); })}
                </div>
              )}

              <div style={{display:"flex",gap:10,marginTop:20}}>
                <button onClick={function(){ var empty={segmento:"",porte:"",faturamento:"",regiao:"",cargos:"",observacoes:""}; saveIcp(empty); }} style={{flex:1,background:"#fff",border:"1.5px solid rgba(239,68,68,.3)",color:"#ef4444",borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{"Resetar ICP"}</button>
                <button onClick={function(){setIcpModal(false); if(props.showToast) props.showToast("ICP atualizado!", "#10b981");}} style={{flex:2,background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(99,102,241,.3)"}}>{"Salvar e fechar"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL PRODUTO ══════════════════════════════════════════════════ */}
      {prodModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.4)",zIndex:10000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"60px 20px 20px",overflowY:"auto"}} onClick={function(e){if(e.target===e.currentTarget)setProdModal(false);}}>
          <div style={{background:"#fff",borderRadius:22,width:"100%",maxWidth:560,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 32px 80px rgba(15,23,42,.18)"}} onClick={function(e){e.stopPropagation();}}>
            <div style={{padding:"24px 28px 16px",position:"sticky",top:0,background:"#fff",zIndex:2,borderBottom:"1px solid #f1f5f9"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:18,fontWeight:800,color:"#0f172a",letterSpacing:"-.3px"}}>{"Produtos / Serviços"}</div>
                  <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{"Cadastre o que você vende para enriquecer o mapeamento de conta com IA"}</div>
                </div>
                <button onClick={function(){setProdModal(false);}} style={{background:"none",border:"none",cursor:"pointer",color:"#94a3b8",fontSize:20,lineHeight:1,padding:4}} onMouseEnter={function(e){e.currentTarget.style.color="#0f172a";}} onMouseLeave={function(e){e.currentTarget.style.color="#94a3b8";}}>{"✕"}</button>
              </div>
            </div>
            <div style={{padding:"20px 28px 28px"}}>
              {/* Existing products */}
              {produtos.length>0 && (
                <div style={{marginBottom:20}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#52617a",marginBottom:10,textTransform:"uppercase",letterSpacing:.5}}>{"Cadastrados"}</div>
                  {produtos.map(function(p){ return (
                    <div key={p.id} style={{background:"#f8fafc",border:"1px solid #e6e9ef",borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"flex-start",gap:10}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{p.nome}</div>
                        {p.descricao && <div style={{fontSize:11,color:"#64748b",marginTop:2,lineHeight:1.5}}>{p.descricao}</div>}
                        {p.publico   && <div style={{fontSize:10,color:"#6366f1",marginTop:4}}>{"Público: "+p.publico}</div>}
                      </div>
                      <button onClick={function(){deleteProduto(p.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"#ef4444",fontSize:14,padding:"2px 4px",flexShrink:0}}>{"×"}</button>
                    </div>
                  ); })}
                </div>
              )}
              {/* Add new product */}
              <div style={{background:"rgba(5,150,105,.03)",border:"1px solid rgba(5,150,105,.15)",borderRadius:14,padding:"16px"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#059669",marginBottom:12,textTransform:"uppercase",letterSpacing:.5}}>{"Adicionar produto / serviço"}</div>
                {[
                  {key:"nome",       label:"Nome do produto *",         ph:"Ex: Consultoria / Plataforma SaaS / Serviço Gerenciado"},
                  {key:"descricao",  label:"Descrição curta",           ph:"Ex: O que é e como funciona em uma linha"},
                  {key:"beneficios", label:"Benefícios principais",     ph:"Ex: Reduz custo, elimina risco, escala receita"},
                  {key:"publico",    label:"Público-alvo",              ph:"Ex: CEO e CTO de empresas de 50 a 500 funcionários"},
                  {key:"preco",      label:"Faixa de preço / modelo",   ph:"Ex: A partir de R$ 5k/mês ou por projeto"},
                  {key:"preco",      label:"Faixa de preço / modelo",   ph:"Ex: A partir de R$ 8k/mês · as-a-service"},
                ].map(function(f){ return (
                  <div key={f.key} style={{marginBottom:10}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#52617a",marginBottom:4,textTransform:"uppercase",letterSpacing:.5}}>{f.label}</div>
                    <input value={newProd[f.key]||""} onChange={function(e){ var v=e.target.value; setNewProd(function(p){ return Object.assign({},p,{[f.key]:v}); }); }} placeholder={f.ph} style={{width:"100%",boxSizing:"border-box",background:"#fff",border:"1.5px solid #e6e9ef",borderRadius:9,padding:"9px 12px",fontSize:12,color:"#0f172a",fontFamily:"inherit",outline:"none"}} onFocus={function(e){e.target.style.borderColor="rgba(5,150,105,.5)";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}/>
                  </div>
                ); })}
                <button onClick={saveProduto} disabled={!newProd.nome.trim()} style={{width:"100%",marginTop:8,background:!newProd.nome.trim()?"#e2e8f0":"linear-gradient(135deg,#059669,#10b981)",color:!newProd.nome.trim()?"#94a3b8":"#fff",border:"none",borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:700,cursor:!newProd.nome.trim()?"default":"pointer",fontFamily:"inherit"}}>{"+ Adicionar produto"}</button>
              </div>

              <button onClick={function(){setProdModal(false); if(props.showToast) props.showToast("Produtos atualizados!", "#10b981");}} style={{width:"100%",marginTop:14,background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:10,padding:"11px 0",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(99,102,241,.3)"}}>{"Concluído"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset setup option ── */}
      <div style={{marginTop:32,paddingTop:20,borderTop:"1px solid #f1f5f9",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:12,fontWeight:600,color:"#94a3b8"}}>{"Trocou de empresa?"}</div>
          <div style={{fontSize:11,color:"#b9c0cc",marginTop:2}}>{"Refaça o setup para configurar o +pipe para um novo contexto."}</div>
        </div>
        <button onClick={function(){ if(window.confirm("Resetar as configurações da plataforma? Suas contas e sequências não serão apagadas.")) onResetSetup(); }} style={{background:"#fff",border:"1.5px solid rgba(239,68,68,.25)",color:"#ef4444",borderRadius:10,padding:"8px 16px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",transition:"all .2s"}} onMouseEnter={function(e){e.currentTarget.style.background="rgba(239,68,68,.05)";}} onMouseLeave={function(e){e.currentTarget.style.background="#fff";}}>{"↺ Resetar setup"}</button>
      </div>
      </div>
      )}
    </div>
  );
}

// -- SHARED MAPPING HELPERS (module scope so App + SearchView can both use) ---
function isUrl(v) { return /^https?:\/\//i.test(v) || /^www\./.test(v); }
function extractDomain(val) {
  if (!isUrl(val)) return "";
  try {
    var url = val.startsWith("http") ? val : "https://" + val;
    return new URL(url).hostname.replace(/^www\./, "");
  } catch(e) { return ""; }
}
function buildData(company, searchResults) {
  var lower = company.toLowerCase();
  var tavilyAnswers = [];
  if (Array.isArray(searchResults)) {
    searchResults.forEach(function(block) {
      if (block.answer && block.answer.trim().length > 20) tavilyAnswers.push(block.answer.trim());
    });
  }
  var allText = tavilyAnswers.join(" ");
  function extractVal(pats) {
    for (var pi=0;pi<pats.length;pi++) { var m=allText.match(pats[pi]); if(m) return m[0]; }
    return "";
  }
  var faturamento = extractVal([/R$[\s]*[\d,\.]+[\s]*(bilh[oo]es?|milh[oo]es?)/i]);
  var funcionarios = extractVal([/[\d\.]+[\s]*mil[\s]*funcion[aa]rios?/i, /[\d\.]+([\s])*(funcion[aa]rios?|colaboradores?)/i]);
  var clientes = extractVal([/[\d,\.]+[\s]*(milh[oo]es?|mil)[\s]*(de[\s]*)?(clientes?|usuarios?)/i]);
  // Setor detection — generic regex covering broad verticals
  var setor = "Empresarial / Mid Market"; var tier = "Tier 2";
  var setorRegexes = [
    { pattern:/banco|financeira|seguradora|fintech|nubank|stone|pagbank|btg|xp|bradesco|itau|c6|inter|cielo/i, label:"Financeiro / Fintech",          tier1:true  },
    { pattern:/software|saas|startup|tecnologia|plataforma|totvs|vtex|linx|rdstation|contaazul/i,             label:"Software / SaaS / Tech",       tier1:true  },
    { pattern:/hospital|clinica|saude|pharma|healthtech|hapvida|unimed|dasa|fleury|amil/i,                     label:"Saúde / Healthtech",            tier1:true  },
    { pattern:/industria|manufatura|fabrica|logistica|transporte|supply chain/i,                                label:"Industrial / Logística",        tier1:false },
    { pattern:/varejo|retail|e-commerce|ecommerce/i,                                                            label:"Varejo / E-commerce",           tier1:false },
    { pattern:/governo|publico|prefeitura|municipal|federal|govtech/i,                                          label:"Setor Público / Govtech",       tier1:false },
    { pattern:/educacao|edtech|ensino|faculdade|universidade/i,                                                  label:"Educação / EdTech",             tier1:false },
  ];
  setorRegexes.forEach(function(r){ if(r.pattern.test(lower)){ setor=r.label; tier=r.tier1?"Tier 1":"Tier 2"; } });

  // ICP from localStorage — used to enrich fit justification
  var icp = getStoredIcp();
  var produtos = getStoredProducts();
  var prodNomes = produtos.map(function(p){return p.nome;}).filter(Boolean);
  var icpSegmento = icp.segmento || setor;
  var fitJust = company+" atua em "+setor+(icp.segmento?", segmento dentro do ICP configurado ("+icp.segmento+")":" ")+". "+
    (prodNomes.length?"Pode ser cliente para: "+prodNomes.join(", ")+".":"Avaliar fit com base no perfil e estágio da empresa.");

  function buildResumo() {
    // Return a minimal placeholder — the real resumo will be generated by Claude via enhanceResumo
    // Only extract basic facts if they're clearly in Portuguese
    if (!tavilyAnswers.length) return "";
    var ptSentences = [];
    tavilyAnswers.forEach(function(a) {
      a.split(/\n/).forEach(function(line) {
        // Only keep lines that have Portuguese words and no CSV/tracking noise
        if (/;.*;/.test(line)) return;
        if (/trk=|utm_|cnpj|cep|\d{5}-\d{3}/i.test(line)) return;
        if (!/\b(empresa|brasil|ltda|s\.a\.|fundad|anos|mercado|setor|produz|fabrica|atua|oferece|cliente|receita|colaborador|funcionário|sede|operação)\b/i.test(line)) return;
        line.replace(/([^.!?]+[.!?]+)/g, function(s) {
          var clean = s.trim().replace(/https?:\/\/\S+/g,"").replace(/\[.*?\]/g,"").trim();
          if (clean.length > 40 && clean.length < 300) ptSentences.push(clean);
        });
      });
    });
    // Only use if we have good Portuguese content
    if (ptSentences.length >= 2) {
      return ptSentences.slice(0,3).join(" ").slice(0,500);
    }
    return ""; // Let Claude fill this via enhanceResumo
  }
  var resumo = buildResumo();
  var allSources = [];
  if (Array.isArray(searchResults)) {
    searchResults.forEach(function(b) { (b.sources||[]).forEach(function(s){allSources.push(s);}); });
  }
  // Build noticias — sources have {title, url, content} from search API
  var noticiasSources = allSources
    .filter(function(s){ return s.url && (s.title||s.titulo); })
    .filter(function(s){ return !/linkedin\.com|facebook\.com|instagram\.com|twitter\.com/.test(s.url||""); })
    .slice(0,5)
    .map(function(s){
      var title = s.title || s.titulo || "";
      var snippet = (s.content || s.resumo || "").replace(/https?:\/\/\S+/g,"").replace(/\s+/g," ").trim().slice(0,180);
      return {titulo:title, resumo:snippet, url:s.url, relevancia:"Fonte de contexto"};
    });
  var noticias = noticiasSources.length ? noticiasSources : [{titulo:"Buscar noticias recentes de "+company, resumo:"Clique para pesquisar noticias sobre a empresa.", url:"https://google.com/search?q="+encodeURIComponent(company)+" seguranca privacidade LGPD 2025", relevancia:"Pesquisa sugerida"}];
  return {
    empresa:{nome:company,setor:setor,resumo:resumo,rawContext:allText.slice(0,4000),tamanho:funcionarios||(tier==="Tier 1"?"500-1000 funcionarios":"200-500 funcionarios"),faturamento:faturamento||"Nao disponível",clientes:clientes||""},
    fit:{score:"—", justificativa:fitJust, solucoes:prodNomes.length?prodNomes:[]},
    mercado:{competidores_provedor:[], concorrentes_mercado:[]},
    dores:{principais:[]},
    triggers:[],
    stakeholders:[
      { cargo:"CEO / Sócio-Diretor",        angulo:"Decisão estratégica e resultados do negócio",    prioridade:"PRIMARIO",   urgencia:"Alta",  email:"", linkedin:"", phone:"" },
      { cargo:"Diretor Comercial / VP",     angulo:"Crescimento de receita e ciclo de vendas",        prioridade:"PRIMARIO",   urgencia:"Alta",  email:"", linkedin:"", phone:"" },
      { cargo:"CFO / Diretor Financeiro",   angulo:"ROI e previsibilidade financeira",                prioridade:"SECUNDARIO", urgencia:"Média", email:"", linkedin:"", phone:"" },
      { cargo:"Diretor de Operações / COO", angulo:"Processos, escala e continuidade",                prioridade:"SECUNDARIO", urgencia:"Média", email:"", linkedin:"", phone:"" },
      { cargo:"Diretor / Gerente Técnico",  angulo:"Stack tecnológico e eficiência operacional",      prioridade:"TERCIARIO",  urgencia:"Baixa", email:"", linkedin:"", phone:"" },
    ],
    noticias: noticias,
    estrategia:{
      tier:tier,
      emails:[],
      inmails:[],
      whatsapps:[],
      cold_calls:[],
      perguntas_spin:[],
      objeções:[]
    },
    proximos_passos:{
      ae:[
        "Mapear decisores no LinkedIn — CEO, Comercial e Financeiro de "+company,
        "Pesquisar vagas abertas em "+company+" — sinal de crescimento e momento",
        "Buscar notícias recentes de "+company+" no Google",
        "Preparar diagnóstico com base no setor ("+setor+") e porte",
        "InMail ao decisor com ângulo personalizado",
      ],
      bdr:[
        "Cold call focado no CEO e Diretor Comercial",
        "WhatsApp com pergunta direta sobre desafio atual",
        "Sequência de 3 emails: desafio, resultado, prova social",
        "Monitorar LinkedIn — posts e movimentações da "+company,
      ],
      prazo:"Primeira abordagem em até 48 horas — prioridade "+tier+"."
    }
  };
}

// In-memory set of account names currently being AI-mapped (never persisted)
var _mappingInProgress = new Set();

// ── Module-level enrichment — callable from anywhere without nav side-effects ──
function runAccountEnrich(nome, onUpdateAccount, onContactsRefresh) {
  var icp       = getStoredIcp();
  var produtos  = getStoredProducts();
  var dna       = getStoredDna();
  var site      = getCompanySite();
  var assinatura = site ? ("Consultor | " + site) : "Consultor";

  storageList("acc:").then(function(keys){
    keys.forEach(function(k){
      storageGet(k).then(function(stored){
        if (!stored || stored.nome.toLowerCase() !== nome.toLowerCase()) return;
        var nomeKey = stored.nome.toLowerCase();
        if (_mappingInProgress.has(nomeKey)) return;

        // Force re-run: clear guards set by re-enrich callers
        var hasDores = stored.aiMapped && stored.data && stored.data.dores && (stored.data.dores.principais||[]).length > 0;
        var hasSpin  = stored.data && stored.data.estrategia && (stored.data.estrategia.perguntas_spin||[]).length > 0;
        // Only block if BOTH are already populated (not a forced re-enrich)
        if (hasDores && hasSpin && stored._forceEnrich !== true) return;

        _mappingInProgress.add(nomeKey);

        var emp        = (stored.data && stored.data.empresa) || {};
        var rawContext = emp.rawContext || emp.resumo || "";
        var setor      = emp.setor || stored.setor || "tecnologia";
        var domain     = (emp.site||"").replace(/^https?:\/\//,"").replace(/^www\./,"").split("/")[0] || "";

        // ── Resumo enhancement (fire-and-forget) ──────────────────────────────
        (function(){
          if (stored.data && stored.data.empresa && stored.data.empresa.resumoAI) return;
          var cleanRaw = rawContext.split("\n").filter(function(l){
            return l.trim().length >= 20 && !(/;.*;/.test(l)) && !(/trk=|utm_|cnpj/i.test(l));
          }).join("\n").slice(0,3000);
          fetch("/api/gemini",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
            mode:"resumo", empresa:nome, setor:setor, rawContext:cleanRaw, icp:icp, produtos:produtos, companySite:site, dna:dna,
          })}).then(function(r){return r.json();}).then(function(d){
            if(!d||!d.resumo) return;
            storageGet(k).then(function(cur){
              if(!cur) return;
              var up = Object.assign({},cur,{data:Object.assign({},cur.data,{empresa:Object.assign({},(cur.data&&cur.data.empresa)||{},{resumo:d.resumo,resumoAI:true})})});
              storageSet(k,up);
              if(onUpdateAccount) onUpdateAccount(up);
            });
          }).catch(function(){});
        })();

        // ── Full AI mapping ───────────────────────────────────────────────────
        fetch("/api/gemini",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
          mode:"mapeamento", empresa:nome, setor:setor, rawContext:rawContext,
          icp:icp, produtos:produtos, companySite:site, dna:dna, assinatura:assinatura,
        })})
        .then(function(r){ return r.ok ? r.json() : null; })
        .then(function(mapped){
          _mappingInProgress.delete(nomeKey);
          if (!mapped || mapped.error) { console.warn("Enrich failed:", mapped&&mapped.error); return; }
          var est = mapped.estrategia || mapped["estratégia"] || {};
          var spinFlat = est.perguntas_spin || [];
          if (!spinFlat.length && mapped.perguntas_spin) {
            var ps = mapped.perguntas_spin;
            spinFlat = [
              ...(ps.situacao   ||[]).map(function(q){return "SITUAÇÃO: "+q;}),
              ...(ps.problema   ||[]).map(function(q){return "PROBLEMA: "+q;}),
              ...(ps.implicacao ||[]).map(function(q){return "IMPLICAÇÃO: "+q;}),
              ...(ps.necessidade||[]).map(function(q){return "NECESSIDADE: "+q;}),
            ];
          }
          var objecoesFlat = est.objecoes || est["objeções"] || mapped.objecoes || [];
          storageGet(k).then(function(cur){
            if (!cur) return;
            var updated = Object.assign({}, cur, {
              _forceEnrich: false,
              aiMapped: !!(mapped.dores && (mapped.dores.principais||[]).length > 0),
              data: Object.assign({}, cur.data, {
                fit:          mapped.fit          || cur.data.fit,
                dores:        mapped.dores        || cur.data.dores,
                triggers:     mapped.triggers     || cur.data.triggers,
                stakeholders: mapped.stakeholders || cur.data.stakeholders,
                empresa: Object.assign({}, (cur.data.empresa||{}), {
                  resumo:   mapped.resumo || (cur.data.empresa && cur.data.empresa.resumo) || "",
                  resumoAI: !!mapped.resumo,
                }),
                estrategia: Object.assign({}, (cur.data.estrategia||{}), {
                  emails:         est.emails      || [],
                  inmails:        est.inmails     || [],
                  whatsapps:      est.whatsapps   || [],
                  cold_calls:     est.cold_calls  || [],
                  perguntas_spin: spinFlat,
                  "objeções":     objecoesFlat,
                  objecoes:       objecoesFlat,
                  tier: (cur.data.estrategia && cur.data.estrategia.tier) || "Tier 2",
                }),
                proximos_passos: mapped.proximos_passos || cur.data.proximos_passos,
              }),
            });
            storageSet(k, updated);
            if (onUpdateAccount) onUpdateAccount(updated);
          });
        })
        .catch(function(){ _mappingInProgress.delete(nomeKey); });

        // ── Stakeholders via /api/stakeholders ────────────────────────────────
        fetch("/api/stakeholders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({company:nome,domain:domain,dna:dna})})
          .then(function(r){return r.ok?r.json():null;})
          .then(function(stakhData){
            if(!stakhData||!stakhData.contacts||!stakhData.contacts.length) return;
            storageList("contact:").then(function(ckeys){
              Promise.all(ckeys.map(storageGet)).then(function(existing){
                var existingSet={};
                existing.filter(Boolean).forEach(function(ec){ existingSet[((ec.nome||"")+"|"+(ec.empresa||"")).toLowerCase()]=true; });
                stakhData.contacts.forEach(function(s){
                  var nomeReal = s.nome||s.name||"";
                  if(!nomeReal) return;
                  var dedupKey = (nomeReal+"|"+nome).toLowerCase();
                  if(existingSet[dedupKey]) return;
                  existingSet[dedupKey]=true;
                  var cid = "contact:"+Date.now()+"-"+Math.random().toString(36).slice(2,8);
                  storageSet(cid,{id:cid,nome:nomeReal,cargo:s.cargo||s.title||"",empresa:nome,email:s.email||"",emailValidated:!!s.email,linkedin:s.linkedin||"",savedAt:Date.now()});
                });
                if(onContactsRefresh) onContactsRefresh();
              });
            });
            storageList("acc:").then(function(akeys){
              akeys.forEach(function(ak){
                storageGet(ak).then(function(st){
                  if(!st||st.nome.toLowerCase()!==nome.toLowerCase()) return;
                  var merged = mergeStakeholders((st.data&&st.data.stakeholders)||[], stakhData.contacts);
                  var up = Object.assign({},st,{data:Object.assign({},st.data,{stakeholders:merged}),enriched:{contacts:stakhData.contacts,sources:stakhData.sources||[]}});
                  storageSet(ak,up);
                  if(onUpdateAccount) onUpdateAccount(up);
                });
              });
            });
          }).catch(function(){});
      });
    });
  });
}

function SearchView(props) {
  var _st_inputVal = useState(""); var inputVal = _st_inputVal[0]; var setInputVal = _st_inputVal[1];
  var _st_loading = useState(false); var loading = _st_loading[0]; var setLoading = _st_loading[1];
  var _st_done = useState(null); var done = _st_done[0]; var setDone = _st_done[1];
  var _st_doneAcc = useState(null); var doneAcc = _st_doneAcc[0]; var setDoneAcc = _st_doneAcc[1];
  var _st_searchError = useState(""); var searchError = _st_searchError[0]; var setSearchError = _st_searchError[1];
  var _st_duplicate = useState(null); var duplicate = _st_duplicate[0]; var setDuplicate = _st_duplicate[1];
  var _st_attachment = useState(null); var attachment = _st_attachment[0]; var setAttachment = _st_attachment[1];
  var _st_attachName = useState(""); var attachName = _st_attachName[0]; var setAttachName = _st_attachName[1];
  var _st_csvPreview = useState(null); var csvPreview = _st_csvPreview[0]; var setCsvPreview = _st_csvPreview[1];
  var _st_planMenu = useState(false); var planMenu = _st_planMenu[0]; var setPlanMenu = _st_planMenu[1];
  var _st_csvInfo = useState(false); var csvInfo = _st_csvInfo[0]; var setCsvInfo = _st_csvInfo[1];
  var csvRef = useRef(null);
  var usage = props.usage;
  function onCsvPick(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev){ setCsvPreview(parseCSV(String(ev.target.result||""))); };
    reader.readAsText(file);
    e.target.value = "";
  }
  function confirmImport() {
    if (csvPreview && csvPreview.rows && csvPreview.rows.length && props.onImport) props.onImport(csvPreview.rows);
    setCsvPreview(null);
  }
  // Reescreve o resumo da conta com IA (especialista em outbound), depois atualiza no storage
  function enhanceResumo(nome) {
    storageList("acc:").then(function(keys){
      keys.forEach(function(k){
        storageGet(k).then(function(stored){
          if(!stored || stored.nome.toLowerCase()!==nome.toLowerCase()) return;
          if(stored.data && stored.data.empresa && stored.data.empresa.resumoAI) return; // already have AI resumo
          var emp = (stored.data && stored.data.empresa) || {};
          var raw = emp.rawContext || "";
          // Strip lines that are clearly not Portuguese content
          var cleanRaw = raw.split("\n").filter(function(line){
            if (!line.trim() || line.length < 20) return false;
            if (/;.*;/.test(line)) return false;
            if (/trk=|utm_|cnpj|\d{5}-\d{3}/i.test(line)) return false;
            return true;
          }).join("\n").slice(0, 3000);
          fetch("/api/gemini",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
            mode:"resumo", empresa:nome, setor:emp.setor||stored.setor||"tecnologia", rawContext:cleanRaw,
            icp: getStoredIcp(), produtos: getStoredProducts(), companySite: getCompanySite(), dna: getStoredDna(),
          })})
            .then(function(r){return r.json();})
            .then(function(d){
              if(!d || !d.resumo) return;
              storageGet(k).then(function(cur){
                if(!cur) return;
                var updated = Object.assign({},cur,{
                  data:Object.assign({},cur.data,{empresa:Object.assign({},(cur.data&&cur.data.empresa)||{},{resumo:d.resumo,resumoAI:true})})
                });
                storageSet(k, updated);
                if(props.onUpdateAccount) props.onUpdateAccount(updated);
              });
            })
            .catch(function(){});
        });
      });
    });
  }

  function doEnrich(nome, domain) {
    enhanceResumo(nome);

    // ── Full AI mapping — dores, triggers, SPIN, emails, stakeholders, próximos passos ──
    var icp = getStoredIcp();
    var produtos = getStoredProducts();
    var assinatura = getCompanySite() ? ("Consultor | " + getCompanySite()) : "Consultor";

    // Get rawContext from stored account to feed the AI
    storageList("acc:").then(function(keys){
      keys.forEach(function(k){
        storageGet(k).then(function(stored){
          if (!stored || stored.nome.toLowerCase() !== nome.toLowerCase()) return;
          var nomeKey = stored.nome.toLowerCase();
          if (_mappingInProgress.has(nomeKey)) return;
          // Only block retry if BOTH dores AND spin are present
          var hasDores = stored.aiMapped && stored.data && stored.data.dores && (stored.data.dores.principais||[]).length > 0;
          var hasSpin  = stored.data && stored.data.estrategia && (stored.data.estrategia.perguntas_spin||[]).length > 0;
          if (hasDores && hasSpin) return;
          _mappingInProgress.add(nomeKey);

          var emp = (stored.data && stored.data.empresa) || {};
          var rawContext = emp.rawContext || emp.resumo || "";
          var setor = emp.setor || stored.setor || "tecnologia";

          fetch("/api/gemini", {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body: JSON.stringify({
              mode: "mapeamento",
              empresa: nome,
              setor: setor,
              rawContext: rawContext,
              icp: icp,
              produtos: produtos,
              companySite: getCompanySite(), dna: getStoredDna(),
              assinatura: assinatura,
            })
          })
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(mapped){
            _mappingInProgress.delete(nomeKey);
            if (!mapped || mapped.error) {
              console.warn("Mapping failed:", mapped && mapped.error);
              return;
            }
            var est = mapped.estrategia || mapped["estratégia"] || {};
            // Support both flat perguntas_spin array and structured {situacao,problema,...}
            var spinFlat = est.perguntas_spin || [];
            if (!spinFlat.length && mapped.perguntas_spin) {
              var ps = mapped.perguntas_spin;
              spinFlat = [
                ...(ps.situacao   ||[]).map(function(q){return "SITUAÇÃO: "+q;}),
                ...(ps.problema   ||[]).map(function(q){return "PROBLEMA: "+q;}),
                ...(ps.implicacao ||[]).map(function(q){return "IMPLICAÇÃO: "+q;}),
                ...(ps.necessidade||[]).map(function(q){return "NECESSIDADE: "+q;}),
              ];
            }
            var objecoesFlat = est.objecoes || est["objeções"] || mapped.objecoes || [];
            storageGet(k).then(function(cur){
              if (!cur) return;
              var updated = Object.assign({}, cur, {
                data: Object.assign({}, cur.data, {
                  fit:           mapped.fit           || cur.data.fit,
                  dores:         mapped.dores         || cur.data.dores,
                  triggers:      mapped.triggers      || cur.data.triggers,
                  stakeholders:  mapped.stakeholders  || cur.data.stakeholders,
                  empresa:       Object.assign({}, (cur.data.empresa||{}), {
                    resumo:      mapped.resumo         || (cur.data.empresa && cur.data.empresa.resumo) || "",
                    resumoAI:    !!mapped.resumo,
                  }),
                  estrategia:    Object.assign({}, (cur.data.estrategia||{}), {
                    emails:         est.emails         || [],
                    inmails:        est.inmails        || [],
                    whatsapps:      est.whatsapps      || [],
                    cold_calls:     est.cold_calls     || [],
                    perguntas_spin: spinFlat,
                    "objeções":     objecoesFlat,
                    objecoes:       objecoesFlat,
                    tier: (cur.data.estrategia && cur.data.estrategia.tier) || "Tier 2",
                  }),
                  proximos_passos: mapped.proximos_passos || cur.data.proximos_passos,
                }),
                aiMapped: !!(mapped.dores && (mapped.dores.principais||[]).length > 0),
              });
              storageSet(k, updated);
              if (props.onUpdateAccount) props.onUpdateAccount(updated);
            });
          })
          .catch(function(){ _mappingInProgress.delete(nomeKey); });
        });
      });
    });

    // ── Real contacts via stakeholders API ────────────────────────────────────
    fetch("/api/stakeholders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({company:nome,domain:domain,dna:getStoredDna()})})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(stakhData){
        if(!stakhData||!stakhData.contacts||!stakhData.contacts.length) return;
        storageList("contact:").then(function(ckeys){
          Promise.all(ckeys.map(storageGet)).then(function(existing){
            var existingSet = {};
            existing.filter(Boolean).forEach(function(ec){
              existingSet[((ec.nome||"")+"|"+(ec.empresa||"")).toLowerCase()] = true;
            });
            stakhData.contacts.forEach(function(s){
              var nomeReal = s.nome || s.name || "";
              if(!nomeReal) return;
              var dedupKey = (nomeReal+"|"+nome).toLowerCase();
              if(existingSet[dedupKey]) return;
              existingSet[dedupKey] = true;
              var cid = "contact:" + Date.now() + "-" + Math.random().toString(36).slice(2,8);
              var contact = { id:cid, nome:nomeReal, cargo:s.cargo||s.title||"", empresa:nome, email:s.email||"", emailValidated:!!s.email, linkedin:s.linkedin||"", savedAt:Date.now() };
              storageSet(cid, contact);
            });
            if (props.onContactsRefresh) props.onContactsRefresh();
          });
        });
        storageList("acc:").then(function(keys){
          keys.forEach(function(k){
            storageGet(k).then(function(stored){
              if(!stored||stored.nome.toLowerCase()!==nome.toLowerCase()) return;
              var merged = mergeStakeholders((stored.data&&stored.data.stakeholders)||[], stakhData.contacts);
              var updated = Object.assign({},stored,{
                data:Object.assign({},stored.data,{stakeholders:merged}),
                enriched:{contacts:stakhData.contacts,sources:stakhData.sources||[]}
              });
              storageSet(k, updated);
              if(props.onUpdateAccount) props.onUpdateAccount(updated);
            });
          });
        });
      }).catch(function(){});
  }
  function handleSearch() {
    if (!inputVal.trim() || loading) return;
    var raw = inputVal.trim();
    // Se é URL/domínio: extrai domínio e usa como nome provisório até o Gemini refinar
    var domain = "";
    var nome   = raw;
    if (isUrl(raw) || /\.\w{2,}$/.test(raw)) {
      var withProto = raw.startsWith("http") ? raw : "https://" + raw;
      try {
        var u = new URL(withProto);
        domain = u.hostname.replace(/^www\./,"");
        // Transforma "nubank.com.br" → "nubank" como nome inicial
        nome = domain.split(".")[0];
        nome = nome.charAt(0).toUpperCase() + nome.slice(1);
      } catch(e) {
        domain = extractDomain(raw);
      }
    } else {
      domain = extractDomain(raw);
    }
    var nomeLower = nome.toLowerCase().trim();
    if (props.accounts) {
      var dup = props.accounts.find(function(a){ return a.nome && a.nome.toLowerCase().trim() === nomeLower; });
      if (dup) {
        if (dup.manualOnly) {
          if (props.onRequestCredit) {
            props.onRequestCredit().then(function(ok){ if (!ok) return; runSearch(nome, domain, dup); });
          } else { runSearch(nome, domain, dup); }
          return;
        }
        setDuplicate(dup); setInputVal(""); return;
      }
    }
    if (props.onRequestCredit) {
      props.onRequestCredit().then(function(ok){ if (!ok) return; runSearch(nome, domain, null); });
    } else {
      runSearch(nome, domain, null);
    }
  }
  function runSearch(nome, domain, existingAcc) {
    setLoading(true); setDone(null); setDoneAcc(null); setSearchError("");
    fetch("/api/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({company:nome,domain:domain||"",context:""})})
      .then(function(r){if(!r.ok)return r.json().then(function(j){throw new Error(j.error||"HTTP "+r.status);}); return r.json();})
      .then(function(resp){
        var data = buildData(nome, resp.results);
        props.onSave(nome, data, true, attachment, attachName, function(acc){ setDoneAcc(acc); }, existingAcc);
        setAttachment(null); setAttachName("");
        doEnrich(nome, domain);
        setLoading(false); setDone(nome); setInputVal("");
      })
      .catch(function(){
        var data = buildData(nome, null);
        props.onSave(nome, data, false, attachment, attachName, function(acc){ setDoneAcc(acc); }, existingAcc);
        setAttachment(null); setAttachName("");
        doEnrich(nome, domain);
        setLoading(false); setDone(nome); setInputVal("");
        setSearchError("Busca online indisponivel. Account mapping gerado com base de conhecimento.");
      });
  }
  return (
    <div>
      <div style={{marginBottom:32}}>
        <div style={{fontSize:26,fontWeight:800,color:"#0f172a",marginBottom:6,letterSpacing:"-0.5px"}}>
          {"Account "}<span style={{color:"#a5b4fc"}}>{"Mapping"}</span>
        </div>
        <div style={{fontSize:13,color:"#52617a",marginBottom:20,lineHeight:1.7}}>{"Digite o nome da empresa para gerar o mapeamento completo. O resultado é salvo automaticamente em Contas."}</div>

        {usage && (
          <div style={{background:"#ffffff",border:"1.5px solid "+(usage.remaining<=0?"#fecdd3":"#e8edf4"),borderRadius:16,padding:"16px 18px",marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:9,fontWeight:700,color:"#fff",background:usage.planColor,borderRadius:6,padding:"4px 10px",textTransform:"uppercase",letterSpacing:.5}}>{usage.planLabel}</span>
                <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{"Mapeamentos: " + usage.used + " / " + usage.limit}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <span style={{fontSize:11,color:usage.remaining<=3?"#ef4444":"#64748b",fontWeight:usage.remaining<=3?700:500}}>{usage.remaining + " restante" + (usage.remaining!==1?"s":"") + " este mês"}</span>
                <input ref={csvRef} type="file" accept=".csv,text/csv" onChange={onCsvPick} style={{display:"none"}}/>
                <button onClick={function(){csvRef.current&&csvRef.current.click();}} style={{background:"#ffffff",border:"1.5px solid rgba(99,102,241,.4)",color:"#4f46e5",borderRadius:9,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"}}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  {"Importar CSV"}
                </button>
                <div style={{position:"relative",display:"flex"}}>
                  <button onClick={function(){setCsvInfo(!csvInfo);}} onMouseEnter={function(){setCsvInfo(true);}} onMouseLeave={function(){setCsvInfo(false);}} title="Modelo do CSV" style={{background:"#fbfbfd",border:"1.5px solid #e6e9ef",color:"#52617a",borderRadius:"50%",width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,padding:0}}>{"i"}</button>
                  {csvInfo && (
                    <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,background:"#0f172a",color:"#fff",borderRadius:12,padding:"14px 16px",width:260,zIndex:70,boxShadow:"0 12px 40px rgba(15,23,42,.3)",fontSize:11,lineHeight:1.6}} onMouseEnter={function(){setCsvInfo(true);}} onMouseLeave={function(){setCsvInfo(false);}}>
                      <div style={{fontWeight:700,marginBottom:8,fontSize:12}}>{"Modelo do arquivo CSV"}</div>
                      <div style={{color:"#94a3b8",marginBottom:10}}>{"Use as colunas abaixo (nome é obrigatório, as demais opcionais):"}</div>
                      <div style={{background:"rgba(255,255,255,.08)",borderRadius:8,padding:"10px 12px",fontFamily:"monospace",fontSize:10.5,color:"#e2e8f0",overflowX:"auto",whiteSpace:"nowrap"}}>
                        <div style={{fontWeight:700,color:"#7dd3fc"}}>{"nome,site,linkedin"}</div>
                        <div>{"Nubank,nubank.com.br,linkedin.com/company/nubank"}</div>
                        <div>{"Stone,stone.com.br,"}</div>
                        <div>{"TOTVS,totvs.com,"}</div>
                      </div>
                      <div style={{color:"#94a3b8",marginTop:10,fontSize:10}}>{"Aceita separador vírgula ou ponto-e-vírgula. A ordem das colunas não importa."}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div style={{height:8,background:"#f6f7f9",borderRadius:8,overflow:"hidden"}}>
              <div style={{height:"100%",width:Math.min(100,Math.round((usage.used/usage.limit)*100))+"%",background:usage.remaining<=3?"linear-gradient(90deg,#ef4444,#f59e0b)":"linear-gradient(90deg,"+usage.planColor+",#4f46e5)",borderRadius:8,transition:"width .4s"}}/>
            </div>
            {usage.remaining<=0 && (
              <div style={{marginTop:14,background:"linear-gradient(135deg,#fff7ed,#fef2f2)",border:"1.5px solid rgba(251,146,60,.3)",borderRadius:12,padding:"14px 16px"}}>
                <div style={{fontSize:13,fontWeight:800,color:"#9a3412",marginBottom:4}}>{"Limite do plano " + usage.planLabel + " atingido"}</div>
                <div style={{fontSize:12,color:"#7c2d12",lineHeight:1.6,marginBottom:12}}>{"Você usou os " + usage.limit + " mapeamentos deste mês. " + (nextPlanMsg(usage.plan))}</div>
                {nextPlanId(usage.plan) && (
                  <button onClick={function(){ if(props.onChangePlan)props.onChangePlan(nextPlanId(usage.plan)); }} style={{background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:10,padding:"10px 18px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(99,102,241,.3)"}}>
                    {"Migrar para " + PLANS[nextPlanId(usage.plan)].label + " (" + PLANS[nextPlanId(usage.plan)].limit + "/mês)"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {csvPreview && (
          <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.32)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",overflowY:"auto"}} onClick={function(e){if(e.target===e.currentTarget)setCsvPreview(null);}}>
            <div style={{background:"#ffffff",backdropFilter:"blur(32px)",WebkitBackdropFilter:"blur(32px)",border:"1px solid #dde1e8",borderRadius:20,width:"100%",maxWidth:520,padding:"24px",boxShadow:"0 24px 80px rgba(15,23,42,.12)",maxHeight:"85vh",display:"flex",flexDirection:"column"}} onClick={function(e){e.stopPropagation();}}>
              <div style={{fontSize:17,fontWeight:800,color:"#0f172a",marginBottom:6}}>{"Importar contas"}</div>
              {csvPreview.error ? (
                <div style={{fontSize:13,color:"#ef4444",background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.3)",borderRadius:10,padding:"12px 14px",marginTop:8}}>{csvPreview.error}</div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",minHeight:0}}>
                  <div style={{fontSize:12,color:"#52617a",marginBottom:12}}>{csvPreview.rows.length + " conta" + (csvPreview.rows.length!==1?"s":"") + " encontrada" + (csvPreview.rows.length!==1?"s":"") + ". Serao importadas para Contas como nao mapeadas (sem consumir creditos)."}</div>
                  <div style={{overflowY:"auto",border:"1px solid #eef0f4",borderRadius:10,marginBottom:16}}>
                    {csvPreview.rows.slice(0,50).map(function(r,i){
                      return (
                        <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderBottom:i<csvPreview.rows.length-1?"1px solid #f8fafc":"none"}}>
                          <span style={{fontSize:12,fontWeight:600,color:"#0f172a",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.nome}</span>
                          {r.site && <span style={{fontSize:10,color:"#94a3b8",flexShrink:0}}>{r.site}</span>}
                        </div>
                      );
                    })}
                    {csvPreview.rows.length>50 && <div style={{padding:"8px 12px",fontSize:11,color:"#94a3b8"}}>{"+ " + (csvPreview.rows.length-50) + " outras..."}</div>}
                  </div>
                </div>
              )}
              <div style={{display:"flex",gap:8}}>
                <button onClick={function(){setCsvPreview(null);}} style={{flex:1,background:"#fbfbfd",border:"1px solid #e6e9ef",color:"#52617a",borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{"Cancelar"}</button>
                {!csvPreview.error && <button onClick={confirmImport} style={{flex:2,background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{"Importar " + csvPreview.rows.length + " conta" + (csvPreview.rows.length!==1?"s":"")}</button>}
              </div>
            </div>
          </div>
        )}
        <div style={{display:"flex",gap:10}}>
          <input value={inputVal} onChange={function(e){setInputVal(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter")handleSearch();}} placeholder="Nome da empresa ou site (ex: nubank.com.br)" style={{flex:1,background:"#ffffff",border:"1.5px solid #e6e9ef",borderRadius:12,padding:"14px 18px",fontSize:13.5,color:"#0f172a",fontFamily:"inherit",outline:"none",boxShadow:"0 1px 3px rgba(15,23,42,.06)",transition:"border-color .2s"}} onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}/>
          <button onClick={handleSearch} disabled={loading||!inputVal.trim()} style={{background:loading||!inputVal.trim()?"#e2e8f0":"linear-gradient(135deg,#6366f1,#4f46e5)",color:loading||!inputVal.trim()?"#94a3b8":"#fff",border:"none",borderRadius:12,padding:"14px 28px",fontSize:13,fontWeight:600,cursor:loading||!inputVal.trim()?"not-allowed":"pointer",fontFamily:"inherit",boxShadow:loading||!inputVal.trim()?"none":"0 4px 14px rgba(99,102,241,.35)",transition:"all .2s",whiteSpace:"nowrap"}}>
            {loading?"Buscando na internet...":"Analisar"}
          </button>
        </div>

        {/* Dica: busca por site quando o usuário digitou nome sem domínio */}
        {inputVal.trim() && !isUrl(inputVal) && !/\.\w{2,}/.test(inputVal) && (
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,padding:"8px 12px",background:"rgba(99,102,241,.05)",border:"1px solid rgba(99,102,241,.15)",borderRadius:10}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style={{fontSize:11.5,color:"#475569",flex:1}}>{"Buscar pelo site da empresa traz resultados mais precisos."}</span>
            <button onClick={function(){
              var sugerido = inputVal.trim().toLowerCase().replace(/\s+/g,"")+".com.br";
              setInputVal(sugerido);
            }} style={{background:"rgba(99,102,241,.1)",border:"1px solid rgba(99,102,241,.25)",color:"#4f46e5",borderRadius:7,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
              {"Tentar " + inputVal.trim().toLowerCase().replace(/\s+/g,"") + ".com.br"}
            </button>
          </div>
        )}

        <div style={{marginTop:12,background:"#fbfbfd",border:"1.5px dashed #e6e9ef",borderRadius:12,padding:"13px 16px",cursor:"pointer",transition:"all .2s"}}
          onMouseEnter={function(e){e.currentTarget.style.borderColor="rgba(99,102,241,.5)";e.currentTarget.style.background="rgba(99,102,241,.12)";}}
          onMouseLeave={function(e){e.currentTarget.style.borderColor="#e6e9ef";e.currentTarget.style.background="#f1f3f6";}}
          onClick={function(){document.getElementById("mpipe-attach").click();}}>
          <input id="mpipe-attach" type="file" accept=".pdf,.xlsx,.xls,.docx,.doc,.txt" style={{display:"none"}} onChange={function(e){
            var file=e.target.files&&e.target.files[0];
            if(!file)return;
            setAttachName(file.name);
            var reader=new FileReader();
            reader.onload=function(ev){setAttachment(ev.target.result);};
            reader.readAsDataURL(file);
          }}/>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:32,height:32,borderRadius:8,background:attachment?"rgba(99,102,241,.12)":"#fff",border:"1px solid "+(attachment?"#6366f1":"#e2e8f0"),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .2s"}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={attachment?"#6366f1":"#94a3b8"} strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,color:attachment?"#6366f1":"#475569",marginBottom:2}}>{attachment?"Arquivo anexado":"Deseja enriquecer a sua pesquisa?"}</div>
              <div style={{fontSize:11,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{attachment?attachName:"Anexe aqui o RI da empresa, relatorios, etc (pdf, xlsx, docx)"}</div>
            </div>
            {attachment&&(
              <button onClick={function(e){e.stopPropagation();setAttachment(null);setAttachName("");}} style={{background:"none",border:"1px solid #e6e9ef",borderRadius:6,color:"#94a3b8",cursor:"pointer",fontSize:11,padding:"3px 8px",fontFamily:"inherit",flexShrink:0}}>{"Remover"}</button>
            )}
          </div>
        </div>
        {searchError && (
          <div style={{marginTop:12,background:"rgba(251,191,36,.1)",border:"1px solid rgba(251,191,36,.3)",borderRadius:12,padding:"12px 16px",fontSize:12,color:"#92400e"}}>{searchError}</div>
        )}
        {duplicate && (
          <div style={{marginTop:14,background:"#fff7ed",border:"1.5px solid rgba(251,146,60,.4)",borderRadius:14,padding:"14px 18px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:"#9a3412",marginBottom:3}}>{"Conta já mapeada: "+duplicate.nome}</div>
                <div style={{fontSize:11,color:"#c2410c"}}>{duplicate.setor + " , " + (STATUS_CONFIG[duplicate.status]&&STATUS_CONFIG[duplicate.status].label)}</div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={function(){props.onOpenAccount(duplicate);}} style={{background:"#ea580c",color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                  {"Ver mapeamento"}
                </button>
                <button onClick={function(){setDuplicate(null);}} style={{background:"none",border:"1px solid rgba(251,146,60,.4)",color:"#ea580c",borderRadius:10,padding:"8px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>x</button>
              </div>
            </div>
          </div>
        )}
        {done && (
          <div style={{marginTop:14,background:"rgba(99,102,241,.08)",border:"1px solid rgba(52,211,153,.35)",borderRadius:14,padding:"14px 18px"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{fontSize:13,color:"#0f172a",fontWeight:700}}>{done + " mapeado e salvo em Contas!"}</span>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {doneAcc && (
                <button onClick={function(){ if(props.onOpenAccount) props.onOpenAccount(doneAcc); }} style={{background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:10,padding:"9px 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 12px rgba(99,102,241,.3)"}}>
                  {"Ver mapeamento"}
                </button>
              )}
              <button onClick={function(){
                storageList("contact:").then(function(keys){
                  if (keys.length > 0) {
                    if(props.onSetContactSearch && done) props.onSetContactSearch(done);
                    if(props.onNav) props.onNav("contacts");
                  } else {
                    alert("Nenhum contato mapeado ainda. Clique em \"Buscar Contatos no LinkedIn\" dentro do mapeamento de uma conta.");
                  }
                });
              }} style={{background:"#fff",color:"#4f46e5",border:"1.5px solid rgba(99,102,241,.4)",borderRadius:10,padding:"9px 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                {"Ver contatos mapeados"}
              </button>
            </div>
          </div>
        )}
      </div>
      <div style={{background:"linear-gradient(160deg,#f0fdf8 0%,#fff 60%)",border:"1px solid rgba(99,102,241,.2)",borderRadius:20,padding:"20px 24px",marginBottom:24,position:"relative",overflow:"hidden"}}>
        <div style={{fontSize:10,fontWeight:700,color:"#a5b4fc",letterSpacing:2,textTransform:"uppercase",marginBottom:16}}>Como funciona o + Pipe</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:14}}>
          {[
            {n:"1",title:"Busca",desc:"Analise qualquer empresa e gere account mapping com riscos de seguranca, dores, stakeholders e mensagens personalizadas."},
            {n:"2",title:"Contas",desc:"Todas as empresas ficam salvas com status de prospecção, organizadas por fit, tier e estágio."},
            {n:"3",title:"Sequências",desc:"Gere cadencias de 6 toques personalizadas por stakeholder com scripts focados em seguranca, privacidade e compliance."},
            {n:"4",title:"Pipeline",desc:"Kanban visual para acompanhar cada conta do mapeamento até a conversão."},
          ].map(function(item) {
            return (
              <div key={item.n}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <div style={{width:24,height:24,borderRadius:7,background:"rgba(99,102,241,.1)",border:"1px solid rgba(99,102,241,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:"#4f46e5",flexShrink:0}}>{item.n}</div>
                  <div style={{fontSize:12.5,fontWeight:700,color:"#0f172a"}}>{item.title}</div>
                </div>
                <div style={{fontSize:11,color:"#52617a",lineHeight:1.55}}>{item.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
// -- ACCOUNTS VIEW -------------------------------------------------------------
function AccountsView(props) {
  var accounts = props.accounts;
  var usage = props.usage;
  var _st_filter = useState({fit:"",tier:"",status:""}); var filter = _st_filter[0]; var setFilter = _st_filter[1];
  var _st_search = useState(""); var search = _st_search[0]; var setSearch = _st_search[1];
  var _st_viewMode = useState("list"); var viewMode = _st_viewMode[0]; var setViewMode = _st_viewMode[1];
  var _st_sortOrder = useState("az"); var sortOrder = _st_sortOrder[0]; var setSortOrder = _st_sortOrder[1];
  var _st_csvPreview = useState(null); var csvPreview = _st_csvPreview[0]; var setCsvPreview = _st_csvPreview[1];
  var _st_selected = useState({}); var selected = _st_selected[0]; var setSelected = _st_selected[1];
  var _st_planMenu = useState(false); var planMenu = _st_planMenu[0]; var setPlanMenu = _st_planMenu[1];
  var fileRef = useRef(null);

  function onCsvPick(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      var parsed = parseCSV(String(ev.target.result||""));
      setCsvPreview(parsed);
    };
    reader.readAsText(file);
    e.target.value = "";
  }
  function confirmImport() {
    if (csvPreview && csvPreview.rows && csvPreview.rows.length && props.onImport) {
      props.onImport(csvPreview.rows);
    }
    setCsvPreview(null);
  }
  function toggleSelect(id) {
    setSelected(function(prev){ var n=Object.assign({},prev); if(n[id]) delete n[id]; else n[id]=true; return n; });
  }
  function mapSelected() {
    var ids = Object.keys(selected);
    var toMap = accounts.filter(function(a){ return ids.indexOf(a.id)>=0 && !a.mapped; });
    if (!toMap.length) return;
    // Sequential mapping to respect the usage limit one-by-one
    (function next(i){
      if (i>=toMap.length) { setSelected({}); return; }
      props.onMap(toMap[i]).then(function(ok){
        if (!ok) { setSelected({}); return; } // limite atingido, para
        next(i+1);
      });
    })(0);
  }
  var selectedCount = Object.keys(selected).length;
  var filtered = accounts.filter(function(a) {
    if (filter.fit && a.fit !== filter.fit) return false;
    if (filter.tier && a.tier !== filter.tier) return false;
    if (filter.status && a.status !== filter.status) return false;
    if (search && !a.nome.toLowerCase().includes(search.toLowerCase()) && !a.setor.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).slice().sort(function(a,b) {
    if (sortOrder === "date") return (b.savedAt||0) - (a.savedAt||0);
    return sortOrder === "za" ? sortZA(a.nome, b.nome) : sortAZ(a.nome, b.nome);
  });
  var statCounts = {};
  STATUS_ORDER.forEach(function(s) { statCounts[s] = accounts.filter(function(a){return a.status===s;}).length; });
  function clearFilters() { setFilter({fit:"",tier:"",status:""}); setSearch(""); }
  function toggleStatus(s) { setFilter(function(f){return Object.assign({},f,{status:f.status===s?"":s});}); }
  function changeFit(v) { setFilter(function(f){return Object.assign({},f,{fit:v});}); }
  function changeTier(v) { setFilter(function(f){return Object.assign({},f,{tier:v});}); }
  var hasFilter = filter.fit || filter.tier || filter.status || search;
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:28,fontWeight:800,color:"#0f172a",marginBottom:4,letterSpacing:"-0.6px"}}>Contas</div>
          <div style={{fontSize:13,color:"#52617a"}}>{accounts.length + " conta" + (accounts.length!==1?"s":"") + " na lista"}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <select value={sortOrder} onChange={function(e){setSortOrder(e.target.value);}} style={{background:"#ffffff",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"8px 12px",fontSize:12,color:"#475569",fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
            <option value="az">A - Z</option>
            <option value="za">Z - A</option>
            <option value="date">Mais recente</option>
          </select>
          <div style={{display:"flex",background:"#ffffff",border:"1.5px solid #e6e9ef",borderRadius:10,overflow:"hidden"}}>
            <button onClick={function(){setViewMode("cards");}} title="Cards" style={{padding:"8px 12px",border:"none",background:viewMode==="cards"?"linear-gradient(135deg,#6366f1,#4f46e5)":"transparent",color:viewMode==="cards"?"#fff":"#94a3b8",cursor:"pointer",lineHeight:1,fontFamily:"inherit"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </button>
            <button onClick={function(){setViewMode("list");}} title="Lista" style={{padding:"8px 12px",border:"none",background:viewMode==="list"?"linear-gradient(135deg,#6366f1,#4f46e5)":"transparent",color:viewMode==="list"?"#fff":"#94a3b8",cursor:"pointer",lineHeight:1,fontFamily:"inherit"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      {selectedCount>0 && (
        <div style={{background:"linear-gradient(135deg,rgba(99,102,241,.08),rgba(14,165,233,.05))",border:"1.5px solid rgba(99,102,241,.2)",borderRadius:14,padding:"12px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
          <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{selectedCount + " selecionada" + (selectedCount!==1?"s":"")}</span>
          <div style={{display:"flex",gap:8}}>
            <button onClick={function(){setSelected({});}} style={{background:"#ffffff",border:"1px solid #e6e9ef",color:"#52617a",borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{"Limpar"}</button>
            <button onClick={mapSelected} style={{background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:10,padding:"8px 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 12px rgba(99,102,241,.25)"}}>{"Mapear selecionadas"}</button>
          </div>
        </div>
      )}
      {csvPreview && (
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.32)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px",overflowY:"auto"}} onClick={function(e){if(e.target===e.currentTarget)setCsvPreview(null);}}>
          <div style={{background:"#ffffff",backdropFilter:"blur(32px)",WebkitBackdropFilter:"blur(32px)",border:"1px solid #dde1e8",borderRadius:20,width:"100%",maxWidth:520,padding:"24px",boxShadow:"0 24px 80px rgba(15,23,42,.12)",maxHeight:"85vh",display:"flex",flexDirection:"column"}} onClick={function(e){e.stopPropagation();}}>
            <div style={{fontSize:17,fontWeight:800,color:"#0f172a",marginBottom:6}}>{"Importar contas"}</div>
            {csvPreview.error ? (
              <div style={{fontSize:13,color:"#ef4444",background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.3)",borderRadius:10,padding:"12px 14px",marginTop:8}}>{csvPreview.error}</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",minHeight:0}}>
                <div style={{fontSize:12,color:"#52617a",marginBottom:12}}>{csvPreview.rows.length + " conta" + (csvPreview.rows.length!==1?"s":"") + " encontrada" + (csvPreview.rows.length!==1?"s":"") + ". Serao importadas como nao mapeadas (sem consumir creditos)."}</div>
                <div style={{overflowY:"auto",border:"1px solid #eef0f4",borderRadius:10,marginBottom:16}}>
                  {csvPreview.rows.slice(0,50).map(function(r,i){
                    return (
                      <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderBottom:i<csvPreview.rows.length-1?"1px solid #f8fafc":"none"}}>
                        <span style={{fontSize:12,fontWeight:600,color:"#0f172a",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.nome}</span>
                        {r.site && <span style={{fontSize:10,color:"#94a3b8",flexShrink:0}}>{r.site}</span>}
                      </div>
                    );
                  })}
                  {csvPreview.rows.length>50 && <div style={{padding:"8px 12px",fontSize:11,color:"#94a3b8"}}>{"+ " + (csvPreview.rows.length-50) + " outras..."}</div>}
                </div>
              </div>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={function(){setCsvPreview(null);}} style={{flex:1,background:"#fbfbfd",border:"1px solid #e6e9ef",color:"#52617a",borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{"Cancelar"}</button>
              {!csvPreview.error && <button onClick={confirmImport} style={{flex:2,background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:10,padding:"10px 0",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{"Importar " + csvPreview.rows.length + " conta" + (csvPreview.rows.length!==1?"s":"")}</button>}
            </div>
          </div>
        </div>
      )}
      <div className="stats-row" style={{display:"flex",gap:10,marginBottom:24,overflowX:"auto",paddingBottom:4,WebkitOverflowScrolling:"touch"}}>
        {STATUS_ORDER.map(function(s) {
          var sc = STATUS_CONFIG[s];
          var cnt = statCounts[s];
          var isActive = filter.status === s;
          return (
            <div key={s} onClick={function(){toggleStatus(s);}} style={{flexShrink:0,background:isActive?sc.bg:"#fff",border:"1.5px solid "+(isActive?sc.border:"#e8edf4"),borderRadius:14,padding:"10px 14px",cursor:"pointer",transition:"all .2s",textAlign:"center",minWidth:90}}>
              <div style={{fontSize:20,fontWeight:800,color:isActive?sc.color:"#52617a"}}>{cnt}</div>
              <div style={{fontSize:9,fontWeight:600,color:isActive?sc.color:"#64748b",textTransform:"uppercase",letterSpacing:.8,marginTop:2}}>{sc.label}</div>
            </div>
          );
        })}
      </div>
      <div className="filter-row" style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap"}}>
        <input value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="Buscar por nome ou setor..." style={{flex:1,minWidth:160,background:"#ffffff",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"9px 14px",fontSize:13,color:"#0f172a",fontFamily:"inherit",outline:"none",transition:"border-color .2s"}} onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}/>
        <select value={filter.fit} onChange={function(e){changeFit(e.target.value);}} style={{background:"#ffffff",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"9px 14px",fontSize:12,color:filter.fit?"#0f172a":"#94a3b8",fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
          <option value="">Fit</option>
          <option value="ALTO">Fit Alto</option>
          <option value="MEDIO">Fit Médio</option>
          <option value="BAIXO">Fit Baixo</option>
        </select>
        <select value={filter.tier} onChange={function(e){changeTier(e.target.value);}} style={{background:"#ffffff",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"9px 14px",fontSize:12,color:filter.tier?"#0f172a":"#94a3b8",fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
          <option value="">Tier</option>
          <option value="Tier 1">Tier 1</option>
          <option value="Tier 2">Tier 2</option>
          <option value="Tier 3">Tier 3</option>
        </select>
        {hasFilter && (
          <button onClick={clearFilters} style={{background:"rgba(248,113,113,.14)",border:"1px solid rgba(248,113,113,.3)",color:"#991b1b",borderRadius:10,padding:"9px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
            {"Limpar"}
          </button>
        )}
      </div>
      {filtered.length===0 ? (
        <div style={{textAlign:"center",padding:"64px 0",background:"#fbfbfd",borderRadius:20,border:"1.5px dashed #e6e9ef"}}>
          <div style={{fontSize:36,marginBottom:12}}>{"🔍"}</div>
          <div style={{fontSize:15,fontWeight:700,color:"#334155",marginBottom:6}}>{accounts.length===0?"Nenhuma conta ainda":"Nenhuma conta com esses filtros"}</div>
          <div style={{fontSize:12,color:"#64748b"}}>{accounts.length===0?"Importe uma lista CSV ou va para Busca para analisar empresas":"Tente limpar os filtros"}</div>
        </div>
      ) : viewMode==="cards" ? (
        <div className="card-grid acc-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}}>
          {filtered.map(function(acc) {
            return <AccountCard key={acc.id} acc={acc} onOpen={props.onOpen} onStatusChange={props.onStatusChange} onDelete={props.onDelete} onMap={props.onMap} mapping={props.mappingId===acc.id} selected={!!selected[acc.id]} onToggleSelect={toggleSelect}/>;
          })}
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {filtered.map(function(acc) {
            var fc = FIT_CONFIG[acc.fit]||FIT_CONFIG.ALTO;
            var sc = STATUS_CONFIG[acc.status]||STATUS_CONFIG.prospecting;
            if (!acc.mapped) {
              var isMapping = props.mappingId===acc.id;
              return (
                <div key={acc.id} style={{background:"#ffffff",border:"1px solid "+(selected[acc.id]?"#6366f1":"#e8edf4"),borderRadius:14,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"nowrap"}}>
                  <input type="checkbox" checked={!!selected[acc.id]} onChange={function(){toggleSelect(acc.id);}} disabled={isMapping} style={{width:16,height:16,accentColor:"#6366f1",cursor:"pointer",flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:3}}>{acc.nome}</div>
                    <div style={{fontSize:10,color:"#94a3b8"}}>{acc.site||"Importada da lista"}</div>
                  </div>
                  <button onClick={function(){if(!isMapping)props.onMap(acc);}} disabled={isMapping} style={{background:isMapping?"#f1f5f9":"linear-gradient(135deg,#6366f1,#4f46e5)",color:isMapping?"#94a3b8":"#fff",border:"none",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:isMapping?"default":"pointer",fontFamily:"inherit",flexShrink:0}}>{isMapping?"Mapeando...":"Mapear"}</button>
                  <button onClick={function(){props.onDelete(acc.id);}} disabled={isMapping} style={{background:"none",border:"1px solid rgba(248,113,113,.25)",color:"#ef4444",borderRadius:8,padding:"6px 9px",fontSize:11,cursor:isMapping?"default":"pointer",fontFamily:"inherit",flexShrink:0}}>{"×"}</button>
                </div>
              );
            }
            return (
              <div key={acc.id} onClick={function(){props.onOpen(acc);}} style={{background:"#ffffff",border:"1px solid #e6e9ef",borderRadius:14,padding:"12px 14px",display:"flex",alignItems:"center",gap:10,transition:"all .2s",cursor:"pointer"}} onMouseEnter={function(e){e.currentTarget.style.borderColor="rgba(99,102,241,.5)";e.currentTarget.style.boxShadow="0 2px 12px rgba(99,102,241,.08)";}} onMouseLeave={function(e){e.currentTarget.style.borderColor="#e6e9ef";e.currentTarget.style.boxShadow="";}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:5}}>{acc.nome}</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{background:fc.bg,border:"1px solid "+fc.border,color:fc.text,borderRadius:6,padding:"2px 7px",fontSize:8,fontWeight:700,flexShrink:0}}>{"FIT "+acc.fit}</span>
                    <span style={{background:"#fbfbfd",border:"1px solid "+(TIER_COLOR[acc.tier]||"#e2e8f0"),color:TIER_COLOR[acc.tier]||"#94a3b8",borderRadius:6,padding:"2px 7px",fontSize:8,fontWeight:700,flexShrink:0}}>{acc.tier}</span>
                    <span style={{background:sc.bg,border:"1px solid "+sc.border,color:sc.color,borderRadius:6,padding:"2px 7px",fontSize:8,fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>{sc.label}</span>
                    <span style={{fontSize:9,color:"#94a3b8",flexShrink:0}}>{fmtDate(acc.savedAt)}</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={function(e){e.stopPropagation();props.onOpen(acc);}} style={{background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>{"Ver"}</button>
                  <button onClick={function(e){e.stopPropagation();props.onDelete(acc.id);}} style={{background:"none",border:"1px solid rgba(248,113,113,.25)",color:"#ef4444",borderRadius:8,padding:"6px 9px",fontSize:11,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>{"×"}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
// -- INSIGHTS VIEW -------------------------------------------------------------
// Merge API-enriched contacts into stakeholder profiles
function mergeStakeholders(stakeholders, contacts) {
  var kwmap = {
    "Head de CX":["head of cx","head cx","customer experience","atendimento","customer service","support manager","director of cx","vp cx"],
    "CEO":["ceo","chief executive","diretor geral","founder","president","presidente"],
    "VP Operacoes":["vp operacoes","director of operations","head of operations","chief operating","coo"],
    "Customer Success":["customer success","head of cs","cs manager","csm","vp customer success"],
    "TI/CTO":["cto","chief technology","vp engineering","head of engineering","gerente de ti","it manager"],
    "CFO":["cfo","chief financial","diretor financeiro","vp finance"],
  };
  return stakeholders.map(function(s) {
    if (s.linkedin || s.email) return s;
    var cargo = (s.cargo||"").toLowerCase();
    var matched = null;
    Object.keys(kwmap).forEach(function(k) {
      if (matched) return;
      kwmap[k].forEach(function(kw) {
        if (!matched) contacts.forEach(function(c) {
          if (!matched && c.cargo && c.cargo.toLowerCase().includes(kw)) matched = c;
        });
      });
    });
    if (!matched) contacts.forEach(function(c) {
      if (matched) return;
      var ct=(c.cargo||"").toLowerCase();
      if (cargo.split(" ").some(function(w){return w.length>3&&ct.includes(w);})) matched=c;
    });
    if (matched) return Object.assign({},s,{nome:matched.nome||s.nome||"",email:matched.email||s.email||"",linkedin:matched.linkedin||s.linkedin||"",phone:matched.phone||s.phone||"",source:matched.source||""});
    return s;
  });
}
function SemiCircleChart(props) {
  var convSteps = props.convSteps||[];
  var colors=["#0f172a","#0369a1","#7c3aed","#2d3a8c","#991b1b"];
  var radii=[90,76,62,48,34];
  var steps=convSteps.slice(0,5);
  var pathData=steps.map(function(step,i){
    var pct=step.pct/100;
    var r=radii[i];
    if(pct<=0) return null;
    var startA=Math.PI; var endA=Math.PI+(Math.PI*pct);
    var x1=100+r*Math.cos(startA); var y1=100+r*Math.sin(startA);
    var x2=100+r*Math.cos(endA);   var y2=100+r*Math.sin(endA);
    var large=pct>0.5?1:0;
    return {d:"M "+x1+" "+y1+" A "+r+" "+r+" 0 "+large+" 1 "+x2+" "+y2,color:colors[i],key:i};
  }).filter(Boolean);
  return (
    <svg width="200" height="110" viewBox="0 0 200 110">
      {pathData.map(function(p){return <path key={p.key} d={p.d} fill="none" stroke={p.color} strokeWidth="10" strokeLinecap="round" opacity="0.85"/>;})}
      <text x="100" y="98" textAnchor="middle" fontSize="11" fill="#94a3b8">0%</text>
      <text x="10" y="105" textAnchor="middle" fontSize="11" fill="#94a3b8">Map.</text>
      <text x="190" y="105" textAnchor="middle" fontSize="11" fill="#2d3a8c">Conv.</text>
    </svg>
  );
}
function exportRelatoriosPDF(accounts, filters) {
  var filtered = accounts.filter(function(a) {
    if (filters.fit && a.fit !== filters.fit) return false;
    if (filters.tier && a.tier !== filters.tier) return false;
    if (filters.nome && !a.nome.toLowerCase().includes(filters.nome.toLowerCase())) return false;
    if (filters.from) { var d = new Date(filters.from); if (new Date(a.savedAt) < d) return false; }
    if (filters.to)   { var d2 = new Date(filters.to); d2.setHours(23,59,59); if (new Date(a.savedAt) > d2) return false; }
    return true;
  });
  var byStatus = {};
  STATUS_ORDER.forEach(function(s){byStatus[s]=filtered.filter(function(a){return a.status===s;}).length;});
  var html = "<html><head><title>Relatórios Mais Pipe</title><style>body{font-family:Verdana,sans-serif;padding:32px;color:#0f172a;font-size:12px}h1{color:#059669;font-size:18px}h2{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#6366f1;margin:20px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#f8fafc;padding:8px 12px;text-align:left;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.8px}td{padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:11px}.fit-alto{color:#065f46;background:#dcfce7;padding:2px 7px;border-radius:5px;font-size:9px;font-weight:700}.fit-medio{color:#92400e;background:#fef3c7;padding:2px 7px;border-radius:5px;font-size:9px;font-weight:700}.fit-baixo{color:#991b1b;background:#fee2e2;padding:2px 7px;border-radius:5px;font-size:9px;font-weight:700}.footer{margin-top:24px;border-top:1px solid #e2e8f0;padding-top:10px;font-size:10px;color:#94a3b8}</style></head><body>";
  html += "<h1>Relatório de Prospecção , Mais Pipe Beta</h1>";
  html += "<p style='color:#64748b;font-size:11px'>Gerado em "+new Date().toLocaleDateString("pt-BR")+" - "+filtered.length+" contas</p>";
  html += "<h2>Funil de Status</h2><table><tr>";
  STATUS_ORDER.forEach(function(s){html+="<th>"+STATUS_CONFIG[s].label+"</th>";});
  html+="</tr><tr>";
  STATUS_ORDER.forEach(function(s){html+="<td><strong>"+byStatus[s]+"</strong></td>";});
  html+="</tr></table>";
  html += "<h2>Lista de Contas ("+filtered.length+")</h2><table><tr><th>Empresa</th><th>Setor</th><th>Fit</th><th>Tier</th><th>Status</th><th>Salvo em</th></tr>";
  filtered.forEach(function(a) {
    var fitClass = a.fit==="ALTO"?"fit-alto":a.fit==="MEDIO"?"fit-medio":"fit-baixo";
    html += "<tr><td><strong>"+a.nome+"</strong></td><td>"+a.setor+"</td><td><span class='"+fitClass+"'>"+a.fit+"</span></td><td>"+a.tier+"</td><td>"+(STATUS_CONFIG[a.status]&&STATUS_CONFIG[a.status].label||a.status)+"</td><td>"+fmtDate(a.savedAt)+"</td></tr>";
  });
  html += "</table><div class='footer'>"+"Mais Pipe Beta - "+new Date().toLocaleDateString("pt-BR")+"</div></body></html>";
  var w = window.open("","_blank");
  w.document.write(html);
  w.document.close();
  setTimeout(function(){w.print();}, 400);
}
function InsightsView(props) {
  var accounts = props.accounts;
  var total = accounts.length;
  var _st_pdfFilters = useState({fit:"",tier:"",nome:"",from:"",to:""}); var pdfFilters = _st_pdfFilters[0]; var setPdfFilters = _st_pdfFilters[1];

  var ALL_METRICS = [
    {id:"funil",     label:"Funil de Status",         emoji:"📊"},
    {id:"fit",       label:"Distribuição de Fit",      emoji:"🎯"},
    {id:"tier",      label:"Distribuição por Tier",    emoji:"🏆"},
    {id:"velocidade",label:"Velocidade de Mapeamento", emoji:"⚡"},
    {id:"setor",     label:"Top Setores",              emoji:"🏭"},
    {id:"lista",     label:"Lista de Contas",          emoji:"📋"},
    {id:"conversao", label:"Taxa de Conversão",        emoji:"📈"},
  ];
  var _st_selMetrics = useState({"funil":true,"fit":true,"tier":true,"lista":true}); var selMetrics = _st_selMetrics[0]; var setSelMetrics = _st_selMetrics[1];
  var _st_showMetricPicker = useState(false); var showMetricPicker = _st_showMetricPicker[0]; var setShowMetricPicker = _st_showMetricPicker[1];
  function toggleMetric(id) { setSelMetrics(function(s){ var n=Object.assign({},s); if(n[id]) delete n[id]; else n[id]=true; return n; }); }
  // -- SVG Donut chart helper
  function buildDonutPaths(segments, cx, cy, r, innerR) {
    var total2=segments.reduce(function(s,seg){return s+(seg.value||0);},0)||1;
    var startAngle=-Math.PI/2;
    var result=[];
    for(var i=0;i<segments.length;i++){
      var seg=segments[i];
      var angle=(seg.value/total2)*Math.PI*2;
      var endAngle=startAngle+angle;
      var x1=cx+r*Math.cos(startAngle); var y1=cy+r*Math.sin(startAngle);
      var x2=cx+r*Math.cos(endAngle);   var y2=cy+r*Math.sin(endAngle);
      var ix1=cx+innerR*Math.cos(endAngle); var iy1=cy+innerR*Math.sin(endAngle);
      var ix2=cx+innerR*Math.cos(startAngle); var iy2=cy+innerR*Math.sin(startAngle);
      var large=angle>Math.PI?1:0;
      if(seg.value>0) result.push({d:"M "+x1+" "+y1+" A "+r+" "+r+" 0 "+large+" 1 "+x2+" "+y2+" L "+ix1+" "+iy1+" A "+innerR+" "+innerR+" 0 "+large+" 0 "+ix2+" "+iy2+" Z",fill:seg.color,key:i});
      startAngle=endAngle;
    }
    return result;
  }
  function DonutChart(dprops) {
    var segments=dprops.segments; var size=dprops.size||120; var hole=dprops.hole||0.62;
    var cx=size/2; var cy=size/2; var r=size/2-8; var innerR=r*hole;
    var pathData=buildDonutPaths(segments,cx,cy,r,innerR);
    return (
      <svg width={size} height={size} viewBox={"0 0 "+size+" "+size}>
        {pathData.map(function(p){return <path key={p.key} d={p.d} fill={p.fill} opacity="0.9"/>;})}
        {dprops.centerLabel&&<text x={cx} y={cy-5} textAnchor="middle" fontSize="18" fontWeight="800" fill="#0f172a">{dprops.centerLabel}</text>}
        {dprops.centerSub&&<text x={cx} y={cy+14} textAnchor="middle" fontSize="10" fill="#94a3b8">{dprops.centerSub}</text>}
      </svg>
    );
  }
  // -- Funnel by status
  var funnel = STATUS_ORDER.map(function(s) {
    return { status:s, label:STATUS_CONFIG[s].label, count:accounts.filter(function(a){return a.status===s;}).length, color:STATUS_CONFIG[s].color, bg:STATUS_CONFIG[s].bg, border:STATUS_CONFIG[s].border };
  });
  var maxFunnel = Math.max.apply(null, funnel.map(function(f){return f.count;})) || 1;
  // -- By fit score
  var byFit = ["ALTO","MEDIO","BAIXO"].map(function(f) {
    var cnt = accounts.filter(function(a){return a.fit===f;}).length;
    return { fit:f, count:cnt, pct:total?Math.round(cnt/total*100):0, color:FIT_CONFIG[f].text, bg:FIT_CONFIG[f].bg, border:FIT_CONFIG[f].border };
  });
  // -- By tier
  var byTier = ["Tier 1","Tier 2","Tier 3"].map(function(t) {
    var cnt = accounts.filter(function(a){return a.tier===t;}).length;
    return { tier:t, count:cnt, pct:total?Math.round(cnt/total*100):0, color:TIER_COLOR[t]||"#94a3b8" };
  });
  // -- By setor (top 6)
  var setorMap = {};
  accounts.forEach(function(a) {
    var s = (a.setor||"Outros").split("/")[0].trim();
    setorMap[s] = (setorMap[s]||0) + 1;
  });
  var bySetor = Object.keys(setorMap).map(function(s){return {setor:s,count:setorMap[s]};})
    .sort(function(a,b){return b.count-a.count;}).slice(0,6);
  var maxSetor = (bySetor[0]&&bySetor[0].count)||1;
  // -- Velocity: accounts saved by week (last 8 weeks)
  var now = Date.now();
  var weeks = [];
  for (var w = 7; w >= 0; w--) {
    var wStart = now - (w+1)*7*24*60*60*1000;
    var wEnd   = now - w*7*24*60*60*1000;
    var label  = w===0?"Esta semana":"Sem -"+(w);
    var cnt    = accounts.filter(function(a){return a.savedAt>=wStart && a.savedAt<wEnd;}).length;
    weeks.push({label:label, count:cnt});
  }
  var maxWeek = Math.max.apply(null, weeks.map(function(w){return w.count;})) || 1;
  // -- Conversion rates
  var contacted  = accounts.filter(function(a){return ["contacted","meeting","proposal","won"].indexOf(a.status)>-1;}).length;
  var meeting    = accounts.filter(function(a){return ["meeting","proposal","won"].indexOf(a.status)>-1;}).length;
  var proposal   = accounts.filter(function(a){return ["proposal","won"].indexOf(a.status)>-1;}).length;
  var won        = accounts.filter(function(a){return a.status==="won";}).length;
  var convSteps = [
    {label:"Mapeado",   count:total,     pct:100},
    {label:"Contatado", count:contacted, pct:total?Math.round(contacted/total*100):0},
    {label:"Reunião",   count:meeting,   pct:total?Math.round(meeting/total*100):0},
    {label:"Proposta",  count:proposal,  pct:total?Math.round(proposal/total*100):0},
    {label:"Ganho",     count:won,       pct:total?Math.round(won/total*100):0},
  ];
  // -- KPI cards
  var kpis = [
    {label:"Total Mapeado",    value:total,     sub:"empresas",          color:"#0f172a", icon:"T"},
    {label:"Fit Alto",         value:byFit[0]&&byFit[0].count||0, sub:"prospects prime",  color:"#818cf8", icon:"A"},
    {label:"Em Andamento",     value:contacted, sub:"contatados ou mais", color:"#7c3aed", icon:"C"},
    {label:"Taxa de Ganho",    value:(total?Math.round(won/total*100):0)+"%", sub:"dos mapeados",color:"#a5b4fc", icon:"G"},
  ];
  if (total === 0) {
    return (
      <div>
        <div style={{fontSize:28,fontWeight:800,color:"#0f172a",marginBottom:4,letterSpacing:"-0.6px"}}>{"Relatórios"}</div>
        <div style={{fontSize:13,color:"#52617a",marginBottom:32}}>{"Dashboard de performance da sua prospecção."}</div>
        <div style={{textAlign:"center",padding:"64px 0",background:"#fbfbfd",borderRadius:20,border:"1.5px dashed #e6e9ef"}}>
          <div style={{fontSize:36,marginBottom:12}}>{"📊"}</div>
          <div style={{fontSize:15,fontWeight:700,color:"#334155",marginBottom:6}}>Nenhum dado ainda</div>
          <div style={{fontSize:12,color:"#64748b"}}>Mapeie sua primeira empresa em Busca para começar a ver insights.</div>
        </div>
      </div>
    );
  }
  // -- Animation keyframes (injected once)
  var animCss = "@keyframes repBarGrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}@keyframes repFunnelGrow{from{width:0;opacity:0}to{opacity:1}}@keyframes repFadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}@keyframes repDonut{from{stroke-dashoffset:var(--circ)}to{stroke-dashoffset:var(--off)}}@keyframes repLineDraw{from{stroke-dashoffset:1000}to{stroke-dashoffset:0}}";

  // -- Line chart (velocity) points
  var lineW = 560, lineH = 160, lpad = 30;
  var linePts = weeks.map(function(wk, i) {
    var x = lpad + (i * (lineW - lpad*2) / (weeks.length - 1));
    var y = lineH - 24 - (wk.count / maxWeek) * (lineH - 50);
    return { x: x, y: y, label: wk.label, count: wk.count };
  });
  var linePath = linePts.map(function(p, i) { return (i===0?"M":"L") + " " + p.x.toFixed(1) + " " + p.y.toFixed(1); }).join(" ");
  var areaPath = linePath + " L " + linePts[linePts.length-1].x.toFixed(1) + " " + (lineH-24) + " L " + linePts[0].x.toFixed(1) + " " + (lineH-24) + " Z";

  // Pie data for fit (using DonutChart segments)
  var FITCOL = {ALTO:"#6366f1", MEDIO:"#0ea5e9", "MÉDIO":"#0ea5e9", BAIXO:"#94a3b8"};
  var fitSeg = byFit.map(function(f){ return {label:f.fit, value:f.count, color:FITCOL[f.fit]||"#7c3aed"}; });
  var TIERCOL = {"Tier 1":"#6366f1","Tier 2":"#7c3aed","Tier 3":"#c084fc"};
  var tierSeg = byTier.map(function(t){ return {label:t.tier, value:t.count, color:TIERCOL[t.tier]||"#94a3b8"}; });

  return (
    <div>
      <style>{animCss}</style>
      {/* HEADER */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:24,flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:28,fontWeight:800,color:"#0f172a",letterSpacing:"-0.6px"}}>{"Relatórios"}</div>
          <div style={{fontSize:13,color:"#52617a",marginTop:2}}>{"Dashboard de performance da sua prospecção."}</div>
        </div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
          {/* Metric picker */}
          <div style={{position:"relative"}}>
            <button onClick={function(){setShowMetricPicker(!showMetricPicker);}} style={{display:"flex",alignItems:"center",gap:6,background:"#fff",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"8px 14px",fontSize:12,fontWeight:600,color:"#475569",cursor:"pointer",fontFamily:"inherit"}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              {"Métricas (" + Object.keys(selMetrics).length + ")"}
            </button>
            {showMetricPicker && (
              <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,background:"#fff",border:"1px solid #e6e9ef",borderRadius:14,boxShadow:"0 12px 40px rgba(15,23,42,.15)",zIndex:100,minWidth:230,padding:"8px 0",overflow:"hidden"}}>
                <div style={{padding:"8px 14px 6px",fontSize:9,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:.8}}>{"Selecionar métricas"}</div>
                {ALL_METRICS.map(function(m){
                  var checked = !!selMetrics[m.id];
                  return (
                    <div key={m.id} onClick={function(){toggleMetric(m.id);}} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 14px",cursor:"pointer",background:checked?"#f0f3ff":"transparent",transition:"background .15s"}} onMouseEnter={function(e){if(!checked)e.currentTarget.style.background="#f8fafc";}} onMouseLeave={function(e){if(!checked)e.currentTarget.style.background="transparent";}}>
                      <div style={{width:16,height:16,borderRadius:4,border:"2px solid "+(checked?"#6366f1":"#d1d5db"),background:checked?"#6366f1":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s"}}>
                        {checked && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <span style={{fontSize:12}}>{m.emoji}</span>
                      <span style={{fontSize:12,fontWeight:checked?600:400,color:checked?"#1e293b":"#475569"}}>{m.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <button onClick={function(){setShowMetricPicker(false); exportRelatoriosPDF(accounts,pdfFilters);}} style={{display:"flex",alignItems:"center",gap:7,background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:11,padding:"10px 18px",fontSize:12.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 14px rgba(99,102,241,.3)"}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {"Exportar PDF"}
          </button>
        </div>
      </div>

      {/* KPI ROW — always shown */}
      <div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:18}}>
        {kpis.map(function(k, i) {
          return (
            <div key={k.label} style={{background:"linear-gradient(145deg,#fff,#fbfcff)",border:"1px solid #e6e9ef",borderRadius:18,padding:"20px 22px",boxShadow:"0 2px 12px rgba(15,23,42,.05)",animation:"repFadeUp .5s cubic-bezier(.22,1,.36,1) both",animationDelay:(i*0.08)+"s",position:"relative",overflow:"hidden"}}>
              <div style={{position:"absolute",top:-20,right:-20,width:80,height:80,borderRadius:"50%",background:"radial-gradient(circle,"+k.color+"14,transparent 70%)"}}/>
              <div style={{fontSize:11,color:"#94a3b8",fontWeight:600,marginBottom:8,textTransform:"uppercase",letterSpacing:.5}}>{k.label}</div>
              <div style={{fontSize:34,fontWeight:900,color:k.color,lineHeight:1,letterSpacing:"-1px"}}>{k.value}</div>
              <div style={{fontSize:11,color:"#52617a",marginTop:6}}>{k.sub}</div>
            </div>
          );
        })}
      </div>

      {/* ROW: Funnel + Conversion */}
      {(selMetrics.funil||selMetrics.conversao) && <div className="chart-grid" style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:16,marginBottom:16}}>
        <div style={{background:"#ffffff",border:"1px solid #e6e9ef",borderRadius:20,padding:"22px 24px",boxShadow:"0 2px 12px rgba(15,23,42,.05)",animation:"repFadeUp .5s ease .1s both"}}>
          <div style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:4}}>{"Funil de Conversão"}</div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:18}}>{"Jornada do mapeamento ao ganho"}</div>
          {convSteps.map(function(step, i) {
            var grad = ["#6366f1","#5566f0","#6a6ef0","#8b6ee8","#a855f7"][i] || "#6366f1";
            return (
              <div key={step.label} style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:12,fontWeight:600,color:"#334155"}}>{step.label}</span>
                  <span style={{fontSize:12,color:"#52617a"}}>{step.count + " · " + step.pct + "%"}</span>
                </div>
                <div style={{height:26,background:"#f6f7f9",borderRadius:8,overflow:"hidden"}}>
                  <div style={{height:"100%",width:Math.max(step.pct,3)+"%",background:"linear-gradient(90deg,"+grad+","+grad+"cc)",borderRadius:8,animation:"repFunnelGrow .8s cubic-bezier(.22,1,.36,1) both",animationDelay:(i*0.12+0.2)+"s",display:"flex",alignItems:"center",paddingLeft:10}}>
                    <span style={{fontSize:10,fontWeight:700,color:"#fff"}}>{step.pct+"%"}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{background:"#ffffff",border:"1px solid #e6e9ef",borderRadius:20,padding:"22px 24px",boxShadow:"0 2px 12px rgba(15,23,42,.05)",animation:"repFadeUp .5s ease .18s both",display:"flex",flexDirection:"column"}}>
          <div style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:4}}>{"Distribuição por Fit"}</div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:10}}>{"Qualidade dos prospects"}</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",flex:1}}>
            <DonutChart segments={fitSeg} size={150} centerLabel={String(total)} centerSub="contas"/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:12}}>
            {fitSeg.map(function(s){return (
              <div key={s.label} style={{display:"flex",alignItems:"center",gap:8,fontSize:11.5}}>
                <span style={{width:10,height:10,borderRadius:3,background:s.color,flexShrink:0}}/>
                <span style={{color:"#475569",fontWeight:600,flex:1}}>{"Fit "+s.label}</span>
                <span style={{color:"#94a3b8"}}>{s.value+" ("+(total?Math.round(s.value/total*100):0)+"%)"}</span>
              </div>
            );})}
          </div>
        </div>
      </div>}

      {/* ROW: Velocity line + Tier donut */}
      {(selMetrics.velocidade||selMetrics.tier) && <div className="chart-grid" style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:16,marginBottom:16}}>
        <div style={{background:"#ffffff",border:"1px solid #e6e9ef",borderRadius:20,padding:"22px 24px",boxShadow:"0 2px 12px rgba(15,23,42,.05)",animation:"repFadeUp .5s ease .24s both"}}>
          <div style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:4}}>{"Velocidade de Mapeamento"}</div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:16}}>{"Contas mapeadas nas últimas 8 semanas"}</div>
          <svg width="100%" viewBox={"0 0 "+lineW+" "+lineH} style={{display:"block"}}>
            <defs>
              <linearGradient id="repArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25"/>
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0"/>
              </linearGradient>
            </defs>
            {[0,0.5,1].map(function(g,gi){var gy=lineH-24-g*(lineH-50);return <line key={gi} x1={lpad} y1={gy} x2={lineW-lpad} y2={gy} stroke="#f1f5f9" strokeWidth="1"/>;})}
            <path d={areaPath} fill="url(#repArea)"/>
            <path d={linePath} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1000" style={{animation:"repLineDraw 1.4s ease .3s both"}}/>
            {linePts.map(function(p,i){return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke="#6366f1" strokeWidth="2.5" style={{animation:"repFadeUp .4s ease both",animationDelay:(0.6+i*0.08)+"s"}}/>
                <text x={p.x} y={p.y-10} textAnchor="middle" fontSize="10" fontWeight="700" fill="#6366f1">{p.count>0?p.count:""}</text>
                <text x={p.x} y={lineH-8} textAnchor="middle" fontSize="9" fill="#94a3b8">{p.label}</text>
              </g>
            );})}
          </svg>
        </div>
        <div style={{background:"#ffffff",border:"1px solid #e6e9ef",borderRadius:20,padding:"22px 24px",boxShadow:"0 2px 12px rgba(15,23,42,.05)",animation:"repFadeUp .5s ease .3s both",display:"flex",flexDirection:"column"}}>
          <div style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:4}}>{"Distribuição por Tier"}</div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:10}}>{"Prioridade estratégica"}</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",flex:1}}>
            <DonutChart segments={tierSeg} size={150} centerLabel={String(byTier.length)} centerSub="tiers"/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:12}}>
            {tierSeg.map(function(s){return (
              <div key={s.label} style={{display:"flex",alignItems:"center",gap:8,fontSize:11.5}}>
                <span style={{width:10,height:10,borderRadius:3,background:s.color,flexShrink:0}}/>
                <span style={{color:"#475569",fontWeight:600,flex:1}}>{s.label}</span>
                <span style={{color:"#94a3b8"}}>{s.value+" ("+(total?Math.round(s.value/total*100):0)+"%)"}</span>
              </div>
            );})}
          </div>
        </div>
      </div>}

      {/* ROW: Sector bar chart + Status pipeline */}
      {(selMetrics.setor||selMetrics.funil) && <div className="chart-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
        <div style={{background:"#ffffff",border:"1px solid #e6e9ef",borderRadius:20,padding:"22px 24px",boxShadow:"0 2px 12px rgba(15,23,42,.05)",animation:"repFadeUp .5s ease .36s both"}}>
          <div style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:4}}>{"Top Setores"}</div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:18}}>{"Concentração da carteira"}</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:10,height:160,paddingTop:10}}>
            {bySetor.slice(0,6).map(function(s,i){
              var h = Math.max((s.count/maxSetor)*130, 8);
              var grad = ["#6366f1","#5566f0","#6a6ef0","#8b6ee8","#a855f7","#c084fc"][i]||"#6366f1";
              return (
                <div key={s.setor} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#334155"}}>{s.count}</span>
                  <div style={{width:"100%",maxWidth:40,height:h,background:"linear-gradient(180deg,"+grad+","+grad+"99)",borderRadius:"7px 7px 0 0",transformOrigin:"bottom",animation:"repBarGrow .7s cubic-bezier(.22,1,.36,1) both",animationDelay:(i*0.1+0.3)+"s"}}/>
                  <span style={{fontSize:9,color:"#94a3b8",textAlign:"center",lineHeight:1.2,maxWidth:54,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",width:"100%"}} title={s.setor}>{s.setor}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{background:"#ffffff",border:"1px solid #e6e9ef",borderRadius:20,padding:"22px 24px",boxShadow:"0 2px 12px rgba(15,23,42,.05)",animation:"repFadeUp .5s ease .42s both"}}>
          <div style={{fontSize:14,fontWeight:800,color:"#0f172a",marginBottom:4}}>{"Pipeline por Status"}</div>
          <div style={{fontSize:11,color:"#94a3b8",marginBottom:18}}>{"Distribuição atual das contas"}</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {funnel.map(function(f,i){
              var pct = total?Math.round(f.count/total*100):0;
              return (
                <div key={f.status} style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:11,fontWeight:600,color:"#475569",width:90,flexShrink:0}}>{f.label}</span>
                  <div style={{flex:1,height:18,background:"#f6f7f9",borderRadius:6,overflow:"hidden"}}>
                    <div style={{height:"100%",width:Math.max(pct,2)+"%",background:f.color,borderRadius:6,animation:"repFunnelGrow .7s ease both",animationDelay:(i*0.08+0.4)+"s"}}/>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:f.color,width:32,textAlign:"right",flexShrink:0}}>{f.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>}
    </div>
  );
}
// -- MAIN APP ------------------------------------------------------------------
function BetaBanner() {
  var _st_open = useState(false); var open = _st_open[0]; var setOpen = _st_open[1];
  var _st_form = useState({nome:"",assunto:"",mensagem:""}); var form = _st_form[0]; var setForm = _st_form[1];
  var _st_sending = useState(false); var sending = _st_sending[0]; var setSending = _st_sending[1];
  var _st_sent = useState(false); var sent = _st_sent[0]; var setSent = _st_sent[1];
  var _st_err = useState(""); var err = _st_err[0]; var setErr = _st_err[1];
  function handleSend() {
    if (!form.nome.trim() || !form.assunto.trim() || !form.mensagem.trim()) {
      setErr("Preencha todos os campos.");
      return;
    }
    setSending(true); setErr("");
    fetch("/api/feedback", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({nome:form.nome, assunto:form.assunto, mensagem:form.mensagem})
    })
    .then(function(r){ return r.json(); })
    .then(function(resp) {
      if (resp.ok) {
        setSending(false); setSent(true); setOpen(false);
        setForm({nome:"",assunto:"",mensagem:""});
      } else {
        setSending(false);
        setErr(resp.error || "Erro ao enviar. Tente novamente.");
      }
    })
    .catch(function() {
      setSending(false);
      setErr("Erro de conexao. Tente novamente.");
    });
  }
  function update(field, val) { setForm(function(f){ var n=Object.assign({},f); if(field==="nome")n.nome=val; else if(field==="assunto")n.assunto=val; else n.mensagem=val; return n; }); }
  var inputStyle = {width:"100%",background:"#ffffff",border:"1.5px solid #e6e9ef",borderRadius:8,padding:"9px 12px",fontSize:12,color:"#0f172a",fontFamily:"inherit",outline:"none",boxSizing:"border-box"};
  return (
    <div style={{position:"relative",zIndex:200}}>
      <div style={{background:"linear-gradient(90deg,#0a0a14 0%,#0d0d1a 100%)",borderBottom:"1px solid rgba(99,102,241,.25)",padding:"0 20px",height:40,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{background:"rgba(99,102,241,.15)",border:"1px solid rgba(99,102,241,.3)",color:"#4f46e5",borderRadius:6,padding:"2px 9px",fontSize:9,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>{"Beta"}</span>
          <span style={{fontSize:12,color:"#ffffff",opacity:.8}}>{"Esta é uma versão Beta , deixe sua sugestão ou comentário no botão ao lado"}</span>
        </div>
        <button onClick={function(){setOpen(true);setSent(false);setErr("");}} style={{background:"linear-gradient(135deg,#6366f1,#7c3aed)",color:"#fff",border:"none",borderRadius:8,padding:"6px 16px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 2px 8px rgba(99,102,241,.35)",letterSpacing:.3}}>
          {"Enviar Feedback"}
        </button>
      </div>
      {open && (
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,.32)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(2px)"}} onClick={function(){setOpen(false);}}>
          <div style={{background:"#ffffff",backdropFilter:"blur(32px)",WebkitBackdropFilter:"blur(32px)",border:"1px solid #dde1e8",borderRadius:20,padding:"28px 32px",width:"100%",maxWidth:440,boxShadow:"0 32px 80px rgba(15,23,42,.12)"}} onClick={function(e){e.stopPropagation();}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div>
                <div style={{fontSize:17,fontWeight:800,color:"#0f172a",marginBottom:2}}>{"Feedback , Mais Pipe Beta"}</div>
                <div style={{fontSize:11,color:"#64748b"}}>{"Sua mensagem será enviada para a equipe Mais Pipe"}</div>
              </div>
              <button onClick={function(){setOpen(false);}} style={{background:"#f6f7f9",border:"none",borderRadius:8,width:28,height:28,cursor:"pointer",fontSize:14,color:"#52617a",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"}}>{"x"}</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:"#52617a",display:"block",marginBottom:5}}>{"Nome"}</label>
                <input value={form.nome} onChange={function(e){update("nome",e.target.value);}} placeholder="Seu nome" style={inputStyle} onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:"#52617a",display:"block",marginBottom:5}}>{"Assunto"}</label>
                <input value={form.assunto} onChange={function(e){update("assunto",e.target.value);}} placeholder="Ex: Sugestão de funcionalidade, Bug encontrado..." style={inputStyle} onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:"#52617a",display:"block",marginBottom:5}}>{"Mensagem"}</label>
                <textarea value={form.mensagem} onChange={function(e){update("mensagem",e.target.value);}} placeholder="Descreva sua sugestão, problema ou comentário em detalhes..." rows={4} style={Object.assign({},inputStyle,{resize:"vertical",lineHeight:1.6})} onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}/>
              </div>
              {err && <div style={{fontSize:11,color:"#ef4444",background:"rgba(248,113,113,.1)",border:"1px solid rgba(248,113,113,.3)",borderRadius:8,padding:"7px 12px"}}>{err}</div>}
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <button onClick={handleSend} disabled={sending} style={{flex:1,background:sending?"#94a3b8":"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:10,padding:"11px 0",fontSize:12,fontWeight:700,cursor:sending?"not-allowed":"pointer",fontFamily:"inherit",boxShadow:sending?"none":"0 4px 12px rgba(99,102,241,.3)",transition:"all .2s"}}>
                  {sending?"Enviando...":"Enviar Feedback"}
                </button>
                <button onClick={function(){setOpen(false);}} style={{background:"#fbfbfd",border:"1.5px solid #e6e9ef",color:"#52617a",borderRadius:10,padding:"11px 20px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{"Cancelar"}</button>
              </div>
              <div style={{fontSize:10,color:"#94a3b8",textAlign:"center"}}>{"Sua mensagem sera enviada diretamente para a equipe + Pipe."}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ── PROSPECT VIEW ─────────────────────────────────────────────────────────────
function ProspectView(props) {
  var accounts   = props.accounts || [];
  var usage      = props.usage || {};

  var icp = (function(){
    try { var s=localStorage.getItem("pipe_icp"); return s?JSON.parse(s):{}; } catch(e){ return {}; }
  })();

  var lista    = props.lista    || [];
  var loadingP = props.loadingP || false;
  var errorP   = props.errorP   || "";
  var saveLista  = props.setLista;
  var setLoadingP= props.setLoadingP;
  var setErrorP  = props.setErrorP;
  var _st_enriching = useState({}); var enriching = _st_enriching[0]; var setEnriching = _st_enriching[1];
  var _st_enriched  = useState({}); var enriched = _st_enriched[0]; var setEnriched = _st_enriched[1];
  var _st_filter    = useState("TODOS"); var filter = _st_filter[0]; var setFilter = _st_filter[1];
  var _st_search    = useState(""); var search = _st_search[0]; var setSearch = _st_search[1];

  var icpPreenchido = (function(){
    try {
      var s = localStorage.getItem("pipe_icp");
      if (!s) return false;
      var obj = JSON.parse(s);
      return !!(obj && (obj.segmento || obj.porte || obj.faturamento || obj.cargos));
    } catch(e){ return false; }
  })();
  var mappedNames = new Set(accounts.map(function(a){ return (a.nome||"").toLowerCase().trim(); }));

  function gerarLista() {
    setLoadingP(true); setErrorP(""); saveLista([]);
    fetch("/api/prospect", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        icp: icp,
        clienteNome: getCompanySite() || "",
        quantidade: 30,
      }),
    })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d.error) { setErrorP(d.error); return; }
        saveLista(d.empresas || []);
      })
      .catch(function(e){ setErrorP("Erro ao gerar lista: " + e.message); })
      .finally(function(){ setLoadingP(false); });
  }

  function enriquecerEmpresa(emp) {
    if (props.onRequestCredit) {
      props.onRequestCredit().then(function(ok){ if (ok) doEnrich(emp); });
    } else {
      doEnrich(emp);
    }
  }

  function doEnrich(emp) {
    var key = emp.nome;
    setEnriching(function(e){ var n=Object.assign({},e); n[key]=true; return n; });
    var domain = emp.site ? emp.site.replace(/^https?:\/\//,"").replace(/^www\./,"").split("/")[0] : "";
    fetch("/api/search", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ company:emp.nome, domain:domain, context:"" }),
    })
      .then(function(r){ return r.json(); })
      .then(function(resp){
        if (props.onSaveRaw) {
          props.onSaveRaw(emp.nome, resp.results, true, null, "", function(acc){
            setEnriched(function(e){ var n=Object.assign({},e); n[key]=acc; return n; });
            var nomeKeyP = emp.nome.toLowerCase();
            if (_mappingInProgress.has(nomeKeyP)) return;
            var hasDoresP = acc && acc.aiMapped && acc.data && acc.data.dores && (acc.data.dores.principais||[]).length > 0;
            var hasSpinP  = acc && acc.data && acc.data.estrategia && (acc.data.estrategia.perguntas_spin||[]).length > 0;
            if (hasDoresP && hasSpinP) return;
            _mappingInProgress.add(nomeKeyP);
            // Trigger full AI mapping after account saved
            var icpLocal = getStoredIcp();
            var produtosLocal = getStoredProducts();
            var rawCtx = (acc && acc.data && acc.data.empresa && acc.data.empresa.rawContext) || "";
            var setorLocal = (acc && acc.data && acc.data.empresa && acc.data.empresa.setor) || "tecnologia";
            fetch("/api/gemini", {
              method:"POST", headers:{"Content-Type":"application/json"},
              body: JSON.stringify({ mode:"mapeamento", empresa:emp.nome, setor:setorLocal, rawContext:rawCtx, icp:icpLocal, produtos:produtosLocal, companySite:getCompanySite(), assinatura:getCompanySite()?("Consultor | "+getCompanySite()):"Consultor", dna:getStoredDna() })
            })
            .then(function(r2){ return r2.ok?r2.json():null; })
            .then(function(mapped){
              _mappingInProgress.delete(nomeKeyP);
              if (!mapped||mapped.error) return;
              var est = mapped.estrategia || mapped["estratégia"] || {};
              var spinFlatP = est.perguntas_spin || [];
              if (!spinFlatP.length && mapped.perguntas_spin) {
                var ps2 = mapped.perguntas_spin;
                spinFlatP = [
                  ...(ps2.situacao   ||[]).map(function(q){return "SITUAÇÃO: "+q;}),
                  ...(ps2.problema   ||[]).map(function(q){return "PROBLEMA: "+q;}),
                  ...(ps2.implicacao ||[]).map(function(q){return "IMPLICAÇÃO: "+q;}),
                  ...(ps2.necessidade||[]).map(function(q){return "NECESSIDADE: "+q;}),
                ];
              }
              var objecoesFlatP = est.objecoes || est["objeções"] || mapped.objecoes || [];
              storageList("acc:").then(function(ks){
                ks.forEach(function(k){
                  storageGet(k).then(function(stored){
                    if (!stored||stored.nome.toLowerCase()!==emp.nome.toLowerCase()) return;
                    var updated=Object.assign({},stored,{
                      aiMapped: !!(mapped.dores && (mapped.dores.principais||[]).length > 0),
                      data:Object.assign({},stored.data,{
                        fit:mapped.fit||stored.data.fit, dores:mapped.dores||stored.data.dores,
                        triggers:mapped.triggers||stored.data.triggers, stakeholders:mapped.stakeholders||stored.data.stakeholders,
                        empresa: Object.assign({}, (stored.data.empresa||{}), {
                          resumo: mapped.resumo || (stored.data.empresa && stored.data.empresa.resumo) || "",
                          resumoAI: !!mapped.resumo,
                        }),
                        estrategia:Object.assign({},(stored.data.estrategia||{}),{
                          emails:est.emails||[], inmails:est.inmails||[],
                          whatsapps:est.whatsapps||[], cold_calls:est.cold_calls||[],
                          perguntas_spin:spinFlatP.length?spinFlatP:(est.perguntas_spin||[]),
                          "objeções":objecoesFlatP, objecoes:objecoesFlatP,
                          tier:(stored.data.estrategia&&stored.data.estrategia.tier)||"Tier 2",
                        }),
                        proximos_passos:mapped.proximos_passos||stored.data.proximos_passos,
                    })});
                    storageSet(k,updated);
                    if(props.onUpdateAccount) props.onUpdateAccount(updated);
                  });
                });
              });
            }).catch(function(){ _mappingInProgress.delete(nomeKeyP); });
          }, null);
        }
      })
      .catch(function(){})
      .finally(function(){
        setEnriching(function(e){ var n=Object.assign({},e); delete n[key]; return n; });
      });
  }

  var _st_selected = useState({}); var selected = _st_selected[0]; var setSelected = _st_selected[1];
  function toggleSelect(nome) { setSelected(function(s){ var n=Object.assign({},s); if(n[nome]) delete n[nome]; else n[nome]=true; return n; }); }
  function clearSelection() { setSelected({}); }
  var selectedNomes = Object.keys(selected);
  var selectedCount = selectedNomes.length;

  function enrichSelected() {
    var toEnrich = listaFiltrada.filter(function(e){ return selected[e.nome] && !mappedNames.has((e.nome||"").toLowerCase().trim()) && !enriched[e.nome] && !enriching[e.nome]; });
    toEnrich.forEach(function(emp){ enriquecerEmpresa(emp); });
    clearSelection();
  }

  var listaFiltrada = lista.filter(function(e){
    if (filter !== "TODOS" && e.score_fit !== filter) return false;
    if (search) {
      var q = search.toLowerCase();
      return (e.nome||"").toLowerCase().includes(q)||(e.setor||"").toLowerCase().includes(q)||(e.cidade||"").toLowerCase().includes(q);
    }
    return true;
  });

  var FIT_STYLE = {
    "ALTO":  { bg:"rgba(52,211,153,.12)", border:"rgba(52,211,153,.4)", color:"#047857" },
    "MÉDIO": { bg:"rgba(251,191,36,.12)", border:"rgba(251,191,36,.4)", color:"#92400e" },
  };

  return (
    <div>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:28,fontWeight:800,color:"#0f172a",letterSpacing:"-.6px",marginBottom:4}}>{"Busca Geral"}</div>
        <div style={{fontSize:13,color:"#52617a"}}>{"Empresas sugeridas pela IA com base no seu ICP. Clique em Enriquecer para gerar o account mapping completo."}</div>
      </div>

      {!icpPreenchido && (
        <div style={{background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.3)",borderRadius:14,padding:"14px 18px",marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:"#92400e"}}>{"ICP não configurado"}</div>
            <div style={{fontSize:12,color:"#92400e",opacity:.8}}>{"Configure seu ICP na seção "}<strong>{"Configurações"}</strong>{" da Home para sugestões mais precisas. Você ainda pode gerar uma lista com critérios padrão."}</div>
          </div>
          {props.onNav && <button onClick={function(){props.onNav("home");}} style={{background:"rgba(245,158,11,.15)",border:"1px solid rgba(245,158,11,.4)",color:"#92400e",borderRadius:9,padding:"6px 14px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{"Ir para Home →"}</button>}
        </div>
      )}

      {lista.length === 0 && !loadingP && (
        <div style={{textAlign:"center",padding:"60px 20px",background:"linear-gradient(135deg,rgba(99,102,241,.06),rgba(139,92,246,.03))",border:"1.5px dashed rgba(99,102,241,.3)",borderRadius:20,marginBottom:24}}>
          <div style={{marginBottom:16,display:"flex",justifyContent:"center"}}><Icon name="target" size={48} color="#6366f1"/></div>
          <div style={{fontSize:20,fontWeight:800,color:"#0f172a",marginBottom:8}}>{"Gerar lista de prospecção"}</div>
          <div style={{fontSize:13,color:"#64748b",maxWidth:440,margin:"0 auto 16px",lineHeight:1.7}}>
            {icpPreenchido
              ? ("A IA vai gerar 30 empresas reais brasileiras que se encaixam no ICP: " + (icp.segmento||"") + (icp.porte?", "+icp.porte:"") + ".")
              : "A IA vai gerar 30 empresas reais brasileiras com base nos critérios padrão do produto."}
          </div>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(16,185,129,.1)",border:"1px solid rgba(16,185,129,.3)",borderRadius:20,padding:"5px 14px",fontSize:11,fontWeight:700,color:"#047857",marginBottom:24}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            {"Gratuito — não consome créditos de Account Mapping"}
          </div>
          <div>
            <button onClick={gerarLista} style={{background:"linear-gradient(135deg,#6366f1,#7c3aed)",color:"#fff",border:"none",borderRadius:14,padding:"14px 32px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 8px 28px rgba(99,102,241,.4)",display:"inline-flex",alignItems:"center",gap:10}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              {"Gerar 30 empresas com IA — grátis"}
            </button>
          </div>
        </div>
      )}

      {loadingP && (
        <div style={{textAlign:"center",padding:"60px 20px"}}>
          <div style={{width:48,height:48,borderRadius:"50%",border:"3px solid rgba(99,102,241,.2)",borderTopColor:"#6366f1",animation:"spin .8s linear infinite",margin:"0 auto 20px"}}/>
          <div style={{fontSize:15,fontWeight:700,color:"#0f172a",marginBottom:6}}>{"Consultando a IA..."}</div>
          <div style={{fontSize:12,color:"#64748b",marginBottom:4}}>{"Gerando 30 empresas com base no ICP. Aguarde alguns segundos."}</div>
          <div style={{fontSize:11,color:"#94a3b8"}}>{"Em caso de alta demanda da IA, a lista é gerada automaticamente na segunda tentativa."}</div>
        </div>
      )}

      {errorP && (
        <div style={{background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.3)",borderRadius:12,padding:"14px 18px",marginBottom:20,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#991b1b" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style={{flex:1,fontSize:12,color:"#991b1b",lineHeight:1.5}}>{errorP.includes("high demand") || errorP.includes("alta demanda") ? "A IA está com alta demanda no momento. Aguarde alguns segundos e tente novamente — normalmente resolve na segunda tentativa." : errorP}</span>
          <button onClick={gerarLista} style={{background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:8,padding:"8px 16px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>{"Tentar novamente"}</button>
        </div>
      )}

      {lista.length > 0 && (
        <div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18,flexWrap:"wrap"}}>
            <input value={search} onChange={function(e){setSearch(e.target.value);}} placeholder="Filtrar por nome, setor ou cidade..." style={{flex:1,minWidth:180,background:"#fff",border:"1.5px solid #e6e9ef",borderRadius:10,padding:"9px 14px",fontSize:12,color:"#0f172a",fontFamily:"inherit",outline:"none"}} onFocus={function(e){e.target.style.borderColor="rgba(99,102,241,.5)";}} onBlur={function(e){e.target.style.borderColor="#e6e9ef";}}/>
            {["TODOS","ALTO","MÉDIO"].map(function(f){
              var active=filter===f;
              return <button key={f} onClick={function(){setFilter(f);}} style={{background:active?"linear-gradient(135deg,#6366f1,#4f46e5)":"#fff",color:active?"#fff":"#64748b",border:"1.5px solid "+(active?"transparent":"#e6e9ef"),borderRadius:9,padding:"8px 14px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>{f==="TODOS"?"Todos ("+lista.length+")":f}</button>;
            })}
            <button onClick={gerarLista} style={{background:"none",border:"1.5px solid rgba(99,102,241,.3)",color:"#6366f1",borderRadius:9,padding:"8px 14px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.44-5.5"/></svg>
              {"Refazer"}
            </button>
          </div>

          <div style={{display:"flex",gap:12,marginBottom:18,flexWrap:"wrap"}}>
            {[
              {label:"Total gerado",      value:lista.length,                                                                              color:"#6366f1"},
              {label:"Fit ALTO",          value:lista.filter(function(e){return e.score_fit==="ALTO";}).length,                            color:"#10b981"},
              {label:"Fit MÉDIO",         value:lista.filter(function(e){return e.score_fit==="MÉDIO";}).length,                           color:"#f59e0b"},
              {label:"Já mapeadas",       value:lista.filter(function(e){return mappedNames.has((e.nome||"").toLowerCase().trim());}).length,color:"#64748b"},
              {label:"Enriquecidas agora",value:Object.keys(enriched).length,                                                              color:"#7c3aed"},
            ].map(function(s){ return (
              <div key={s.label} style={{background:"#fff",border:"1px solid #e6e9ef",borderRadius:10,padding:"10px 16px",display:"flex",flexDirection:"column",gap:2}}>
                <div style={{fontSize:20,fontWeight:800,color:s.color,lineHeight:1}}>{s.value}</div>
                <div style={{fontSize:10,color:"#64748b",fontWeight:500,whiteSpace:"nowrap"}}>{s.label}</div>
              </div>
            ); })}
          </div>

          {/* Bulk selection bar */}
          {selectedCount > 0 && (
            <div style={{position:"sticky",top:44,zIndex:50,background:"linear-gradient(135deg,#6366f1,#4f46e5)",borderRadius:14,padding:"12px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:12,boxShadow:"0 6px 24px rgba(99,102,241,.35)"}}>
              <span style={{fontSize:13,fontWeight:700,color:"#fff"}}>{selectedCount + " empresa"+(selectedCount!==1?"s":"")+" selecionada"+(selectedCount!==1?"s":"")}</span>
              <div style={{flex:1}}/>
              <button onClick={clearSelection} style={{background:"rgba(255,255,255,.15)",border:"1px solid rgba(255,255,255,.25)",color:"#fff",borderRadius:8,padding:"6px 12px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{"Limpar"}</button>
              <button onClick={enrichSelected} style={{background:"#fff",border:"none",color:"#4f46e5",borderRadius:8,padding:"7px 16px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,boxShadow:"0 2px 8px rgba(0,0,0,.15)"}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                {"Enriquecer " + selectedCount + " conta"+(selectedCount!==1?"s":"")}
              </button>
            </div>
          )}

          <div className="prospect-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
            {listaFiltrada.map(function(emp, idx){
              var fitStyle    = FIT_STYLE[emp.score_fit] || FIT_STYLE["MÉDIO"];
              var jaMapeada   = mappedNames.has((emp.nome||"").toLowerCase().trim());
              var jaEnriq     = !!enriched[emp.nome];
              var isEnriching = !!enriching[emp.nome];
              var isSelected  = !!selected[emp.nome];
              return (
                <div key={idx} onClick={function(){ if(!jaMapeada&&!jaEnriq&&!isEnriching) toggleSelect(emp.nome); }} style={{background:"#fff",border:"1.5px solid "+(isSelected?"#6366f1":jaEnriq?"rgba(99,102,241,.3)":"#e6e9ef"),borderRadius:16,padding:"18px",transition:"all .2s",boxShadow:isSelected?"0 0 0 3px rgba(99,102,241,.2)":jaEnriq?"0 4px 20px rgba(99,102,241,.1)":"none",cursor:(!jaMapeada&&!jaEnriq&&!isEnriching)?"pointer":"default",position:"relative"}}>
                  {/* Checkbox */}
                  {!jaMapeada && !jaEnriq && !isEnriching && (
                    <div style={{position:"absolute",top:14,right:14,width:18,height:18,borderRadius:5,border:"2px solid "+(isSelected?"#6366f1":"#d1d5db"),background:isSelected?"#6366f1":"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s"}}>
                      {isSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                  )}
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:10,paddingRight:(!jaMapeada&&!jaEnriq&&!isEnriching)?26:0}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:800,color:"#0f172a",lineHeight:1.3,marginBottom:3}}>{emp.nome}</div>
                      <div style={{fontSize:11,color:"#64748b"}}>{[emp.setor,emp.cidade].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",gap:4,alignItems:"flex-end",flexShrink:0}}>
                      <span style={{fontSize:8,fontWeight:800,background:fitStyle.bg,border:"1px solid "+fitStyle.border,color:fitStyle.color,borderRadius:6,padding:"2px 8px",whiteSpace:"nowrap"}}>{"FIT "+emp.score_fit}</span>
                      {jaMapeada && <span style={{fontSize:8,fontWeight:700,background:"rgba(100,116,139,.1)",border:"1px solid rgba(100,116,139,.25)",color:"#475569",borderRadius:6,padding:"2px 7px",whiteSpace:"nowrap"}}>{"✓ mapeada"}</span>}
                      {jaEnriq && !jaMapeada && <span style={{fontSize:8,fontWeight:700,background:"rgba(99,102,241,.1)",border:"1px solid rgba(99,102,241,.25)",color:"#4f46e5",borderRadius:6,padding:"2px 7px",whiteSpace:"nowrap"}}>{"✓ enriquecida"}</span>}
                    </div>
                  </div>
                  {emp.porte_estimado && <div style={{fontSize:10,color:"#94a3b8",marginBottom:8,display:"flex",alignItems:"center",gap:4}}><Icon name="groups" size={12} color="#94a3b8"/>{emp.porte_estimado}</div>}
                  <div style={{fontSize:12,color:"#475569",lineHeight:1.6,marginBottom:8}}>{emp.resumo}</div>
                  {emp.motivo_fit && (
                    <div style={{background:"rgba(99,102,241,.05)",border:"1px solid rgba(99,102,241,.12)",borderRadius:8,padding:"7px 10px",fontSize:11,color:"#4338ca",lineHeight:1.5,marginBottom:12}}>
                      <span style={{fontWeight:700}}>{"Fit: "}</span>{emp.motivo_fit}
                    </div>
                  )}
                  {emp.site && <div style={{fontSize:10,color:"#94a3b8",marginBottom:12}}><a href={"https://"+emp.site.replace(/^https?:\/\//,"")} target="_blank" rel="noopener noreferrer" style={{color:"#6366f1",textDecoration:"none",display:"inline-flex",alignItems:"center",gap:4}} onClick={function(e){e.stopPropagation();}}><Icon name="link" size={11} color="#6366f1"/>{emp.site}</a></div>}
                  <div style={{display:"flex",gap:8}} onClick={function(e){e.stopPropagation();}}>
                    {jaMapeada ? (
                      <button onClick={function(){
                        if(props.onNav) props.onNav("accounts");
                        var found = props.accounts.find(function(a){ return a.nome.toLowerCase()===emp.nome.toLowerCase(); });
                        if(found && props.onOpenAccount) props.onOpenAccount(found);
                      }} style={{flex:1,background:"#f8fafc",border:"1px solid #e2e8f0",color:"#475569",borderRadius:9,padding:"8px 0",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{"Ver em Contas →"}</button>
                    ) : jaEnriq ? (
                      <button onClick={function(){
                        if(props.onNav) props.onNav("accounts");
                        // Fetch latest version from storage — avoids stale pre-mapping snapshot
                        storageList("acc:").then(function(keys){
                          var found = null;
                          var pending = keys.length;
                          if (!pending) { if(props.onOpenAccount) props.onOpenAccount(enriched[emp.nome]); return; }
                          keys.forEach(function(k){
                            storageGet(k).then(function(stored){
                              if (stored && stored.nome && stored.nome.toLowerCase()===emp.nome.toLowerCase()) found=stored;
                              pending--;
                              if (pending===0 && props.onOpenAccount) props.onOpenAccount(found || enriched[emp.nome]);
                            });
                          });
                        });
                      }} style={{flex:1,background:"linear-gradient(135deg,#6366f1,#4f46e5)",color:"#fff",border:"none",borderRadius:9,padding:"8px 0",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 12px rgba(99,102,241,.3)"}}>{"Ver conta mapeada →"}</button>
                    ) : (
                      <button onClick={function(){enriquecerEmpresa(emp);}} disabled={isEnriching} style={{flex:1,background:isEnriching?"#f1f5f9":"linear-gradient(135deg,#6366f1,#4f46e5)",color:isEnriching?"#94a3b8":"#fff",border:"none",borderRadius:9,padding:"8px 0",fontSize:11,fontWeight:700,cursor:isEnriching?"default":"pointer",fontFamily:"inherit",boxShadow:isEnriching?"none":"0 4px 12px rgba(99,102,241,.3)",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all .2s"}}>
                        {isEnriching
                          ? <><div style={{width:10,height:10,borderRadius:"50%",border:"2px solid #c7d2fe",borderTopColor:"#6366f1",animation:"spin .7s linear infinite"}}/> {"Mapeando..."}</>
                          : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>{"Enriquecer — 1 crédito"}</>
                        }
                      </button>
                    )}
                    {emp.site && !jaMapeada && !jaEnriq && !isEnriching && (
                      <button onClick={function(){if(props.onNav)props.onNav("search");}} title="Buscar manualmente" style={{background:"#f8fafc",border:"1px solid #e2e8f0",color:"#64748b",borderRadius:9,padding:"8px 10px",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center"}}><Icon name="search" size={14}/></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {listaFiltrada.length===0 && <div style={{textAlign:"center",padding:"40px",color:"#94a3b8",fontSize:13}}>{"Nenhuma empresa com esses filtros."}</div>}
        </div>
      )}
    </div>
  );
}

// -- MOBILE NAV ---------------------------------------------------------------
var ALL_NAV = [
  {id:"home",       icon:"home",                label:"Home"},
  {id:"prospect",   icon:"target",               label:"Busca"},
  {id:"search",     icon:"travel_explore",        label:"Mapping"},
  {id:"accounts",   icon:"folder_open",           label:"Contas"},
  {id:"contacts",   icon:"contacts",              label:"Contatos"},
  {id:"sequences",  icon:"forward_to_inbox",      label:"Sequências"},
  {id:"biblioteca", icon:"local_library",         label:"Biblioteca"},
  {id:"pipeline",   icon:"view_kanban",           label:"Pipeline"},
  {id:"relatorios", icon:"monitoring",            label:"Relatórios"},
  {id:"integracoes",icon:"hub",                   label:"Integrações"},
];
var PRIMARY_NAV = ALL_NAV.slice(0, 5);
var MORE_NAV    = ALL_NAV.slice(5);

function MobileNav(props) {
  var nav = props.nav; var setNav = props.setNav; var setupDone = props.setupDone;
  var _st_open = useState(false); var open = _st_open[0]; var setOpen = _st_open[1];
  var moreActive = MORE_NAV.some(function(i){ return i.id === nav; });

  function goTo(id) {
    if (!setupDone && id !== "home") return;
    setNav(id); setOpen(false);
  }

  return (
    <>
      {/* Drawer backdrop */}
      {open && <div onClick={function(){setOpen(false);}} style={{position:"fixed",inset:0,background:"rgba(15,23,42,.5)",zIndex:498,backdropFilter:"blur(2px)"}}/>}

      {/* More drawer — slides up */}
      <div style={{position:"fixed",bottom:open?64:"-100%",left:0,right:0,background:"linear-gradient(180deg,#1a1f35,#10131f)",borderRadius:"20px 20px 0 0",zIndex:499,padding:"8px 0 12px",transition:"bottom .3s cubic-bezier(.22,1,.36,1)",boxShadow:"0 -8px 32px rgba(15,23,42,.4)"}}>
        <div style={{width:36,height:4,background:"rgba(255,255,255,.2)",borderRadius:2,margin:"0 auto 16px"}}/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:4,padding:"0 8px"}}>
          {MORE_NAV.map(function(item){
            var active = nav === item.id;
            var locked = !setupDone;
            return (
              <button key={item.id} onClick={function(){goTo(item.id);}} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:active?"rgba(99,102,241,.15)":"none",border:active?"1px solid rgba(99,102,241,.3)":"1px solid transparent",cursor:locked?"default":"pointer",padding:"10px 4px",borderRadius:12,opacity:locked?.3:1}}>
                <Icon name={item.icon} size={22} color={active?"#818cf8":"#7c869b"}/>
                <span style={{fontSize:9,fontWeight:active?700:400,color:active?"#818cf8":"#7c869b"}}>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav className="mobile-nav" style={{position:"fixed",bottom:0,left:0,right:0,background:"linear-gradient(180deg,#15192b,#10131f)",borderTop:"1px solid #1f2438",zIndex:500,paddingBottom:"max(8px,env(safe-area-inset-bottom))",boxShadow:"0 -4px 24px rgba(15,23,42,.3)"}}>
        <div style={{display:"flex",justifyContent:"space-around",alignItems:"center",maxWidth:500,margin:"0 auto",padding:"6px 0 0"}}>
          {PRIMARY_NAV.map(function(item){
            var active = nav === item.id;
            var locked = !setupDone && item.id !== "home";
            return (
              <button key={item.id} onClick={function(){ if(!locked){ setOpen(false); goTo(item.id); } }} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:"none",border:"none",cursor:locked?"default":"pointer",padding:"4px 6px",borderRadius:10,opacity:locked?.28:1,minWidth:44,flexShrink:0}}>
                <Icon name={item.icon} size={20} color={active?"#818cf8":"#5a6478"}/>
                <span style={{fontSize:9,fontWeight:active?700:400,color:active?"#818cf8":"#5a6478"}}>{item.label}</span>
                {active && <div style={{width:14,height:2,background:"#6366f1",borderRadius:2}}/>}
              </button>
            );
          })}
          {/* Mais button */}
          <button onClick={function(){setOpen(!open);}} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:"none",border:"none",cursor:"pointer",padding:"4px 6px",borderRadius:10,minWidth:44,flexShrink:0}}>
            <span style={{fontSize:20,lineHeight:1,color:moreActive||open?"#818cf8":"#5a6478"}}>{"⋯"}</span>
            <span style={{fontSize:9,fontWeight:moreActive||open?700:400,color:moreActive||open?"#818cf8":"#5a6478"}}>{"Mais"}</span>
            {(moreActive||open) && <div style={{width:14,height:2,background:"#6366f1",borderRadius:2}}/>}
          </button>
        </div>
      </nav>
    </>
  );
}

export default function App() {
  var _st_nav = useState("home"); var nav = _st_nav[0]; var setNav = _st_nav[1];
  var _st_accounts = useState([]); var accounts = _st_accounts[0]; var setAccounts = _st_accounts[1];
  var _st_loading = useState(true); var loading = _st_loading[0]; var setLoading = _st_loading[1];
  // ── Onboarding setup state ─────────────────────────────────────────────────
  var _st_setupDone = useState(function(){
    try { return !!localStorage.getItem("pipe_setup_done"); } catch(e){ return false; }
  }); var setupDone = _st_setupDone[0]; var setSetupDone = _st_setupDone[1];
  var _st_setupUnlocking = useState(false); var setupUnlocking = _st_setupUnlocking[0]; var setSetupUnlocking = _st_setupUnlocking[1];
  var _st_pendingContactSearch = useState(""); var pendingContactSearch = _st_pendingContactSearch[0]; var setPendingContactSearch = _st_pendingContactSearch[1];
  var _st_openAcc = useState(null); var openAcc = _st_openAcc[0]; var setOpenAcc = _st_openAcc[1];
  var _st_toast = useState(null); var toast = _st_toast[0]; var setToast = _st_toast[1];
  var _st_sidebarOpen = useState(false); var sidebarOpen = _st_sidebarOpen[0]; var setSidebarOpen = _st_sidebarOpen[1];
  var _st_sidebarExpanded = useState(true); var sidebarExpanded = _st_sidebarExpanded[0]; var setSidebarExpanded = _st_sidebarExpanded[1];
  var _st_seqCount = useState(0); var seqCount = _st_seqCount[0]; var setSeqCount = _st_seqCount[1];
  var _st_openSeq = useState(null); var openSeq = _st_openSeq[0]; var setOpenSeq = _st_openSeq[1];
  var _st_usage = useState(null); var usage = _st_usage[0]; var setUsage = _st_usage[1];
  var _st_mappingId = useState(null); var mappingId = _st_mappingId[0]; var setMappingId = _st_mappingId[1];
  var _st_seqRequest = useState(null); var seqRequest = _st_seqRequest[0]; var setSeqRequest = _st_seqRequest[1];

  // ── Prospect state — lifted to App so search runs in background ──────────
  var _st_pLista = useState(function(){ try{var s=localStorage.getItem("pipe_prospect_lista");return s?JSON.parse(s):[];}catch(e){return [];} });
  var prospectLista = _st_pLista[0]; var setProspectListaRaw = _st_pLista[1];
  function setProspectLista(empresas){ setProspectListaRaw(empresas); try{localStorage.setItem("pipe_prospect_lista",JSON.stringify(empresas));}catch(e){} }
  var _st_pLoading = useState(false); var prospectLoading = _st_pLoading[0]; var setProspectLoading = _st_pLoading[1];
  var _st_pError   = useState("");    var prospectError   = _st_pError[0];   var setProspectError   = _st_pError[1];

  // refreshKey: incrementado sempre que novos contatos são salvos externamente
  // (ex: enriquecimento de stakeholders). ContactsView observa esse valor como dep do useEffect.
  var _st_cRefresh = useState(0); var contactsRefreshKey = _st_cRefresh[0]; var setContactsRefreshKey = _st_cRefresh[1];
  function triggerContactsRefresh() { setContactsRefreshKey(function(k){ return k+1; }); }
  // Dispara a geração de uma sequência a partir de um contato real (nome + cargo).
  function generateSequenceFromContact(contact) {
    setSeqRequest({
      contact: contact,
      empresa: contact.empresa || "",
      cargo: contact.cargo || "",
      nome: contact.nome || "",
      ts: Date.now()
    });
    setNav("sequences");
  }
  function refreshUsage() { getUsage().then(setUsage); }

  // Re-enrich any account by name — runs directly without navigating away
  function doEnrichAccount(accOrName) {
    var nome    = typeof accOrName === "string" ? accOrName : (accOrName && accOrName.nome) || "";
    var accId   = typeof accOrName === "object" && accOrName ? accOrName.id : null;
    var nomeKey = nome.toLowerCase();

    // Clear in-progress guard so this can run fresh
    _mappingInProgress.delete(nomeKey);

    // onUpdateAccount: refresh accounts list + keep modal open with fresh data
    function onUpdate(updated) {
      setAccounts(function(prev){
        return prev.map(function(a){ return a.id === updated.id ? updated : a; });
      });
      // Update the open modal if it belongs to this account (use id or nome match)
      setOpenAcc(function(cur) {
        if (!cur) return cur;
        if ((accId && cur.id === accId) || cur.nome.toLowerCase() === nomeKey) return updated;
        return cur;
      });
    }

    // Write force flag then immediately kick off enrichment — no navigation needed
    storageList("acc:").then(function(keys){
      var found = false;
      keys.forEach(function(k){
        storageGet(k).then(function(stored){
          if (!stored || stored.nome.toLowerCase() !== nomeKey) return;
          if (found) return; // dedup
          found = true;
          storageSet(k, Object.assign({}, stored, { aiMapped: false, _forceEnrich: true }))
            .then(function(){
              runAccountEnrich(nome, onUpdate, triggerContactsRefresh);
            });
        });
      });
    });
  }

  // ── Finish onboarding ──────────────────────────────────────────────────────
  function finishSetup() {
    try { localStorage.setItem("pipe_setup_done","1"); } catch(e){}
    setSetupUnlocking(true);
    setTimeout(function(){ setSetupDone(true); setSetupUnlocking(false); }, 1200);
  }
  function resetSetup() {
    try {
      localStorage.removeItem("pipe_setup_done");
      localStorage.removeItem("pipe_icp");
      localStorage.removeItem("pipe_produtos");
      localStorage.removeItem("pipe_company_site");
      localStorage.removeItem("pipe_setup_dna");
    } catch(e){}
    setSetupDone(false);
    setSetupUnlocking(false);
    setNav("home");
    showToast("Configurações resetadas. Bem-vindo ao setup inicial!", "#6366f1");
  }
  function changePlan(planId) {
    var isDifferent = !usage || usage.plan !== planId;
    setPlan(planId, isDifferent).then(function(){ refreshUsage(); });
  }
  // Verifica e consome 1 crédito para uma busca manual. Retorna Promise<bool>.
  function requestMapCredit() {
    return new Promise(function(resolve) {
      consumeMapping().then(function(res) {
        setUsage(res.usage);
        if (!res.ok) {
          if (res.reason === "limit") {
            showToast("Limite do plano atingido (" + res.usage.used + "/" + res.usage.limit + "). Faça upgrade para mapear mais.", "#ef4444");
          } else {
            showToast("Nao foi possivel registrar o uso.", "#ef4444");
          }
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }
  function showToast(msg, color, duration) {
    setToast({msg:msg,color:color||"#4f46e5"});
    setTimeout(function(){setToast(null);}, duration||3000);
    setTimeout(function(){setToast(null);}, 3000);
  }
  useEffect(function() {
    refreshUsage();
    Promise.all([
      storageList("acc:"),
      storageList("seq:")
    ]).then(function(results) {
      var accKeys = results[0]; var seqKeys = results[1];
      setSeqCount(seqKeys.length);
      if (!accKeys.length) { setLoading(false); return; }
      return Promise.all(accKeys.map(storageGet)).then(function(items) {
        var valid = items.filter(Boolean).map(function(a){ if(a.mapped===undefined) a.mapped = !!a.data; return a; }).sort(function(a,b){return (b.savedAt||0)-(a.savedAt||0);});
        setAccounts(valid); setLoading(false);
      });
    }).catch(function(){setLoading(false);});
  }, []);
  function saveAccount(nome, data, liveMode, attachData, attachFileName, onCreated, existingAcc) {
    // Se é uma conta manual sendo mapeada pela primeira vez — atualiza em vez de criar
    if (existingAcc && existingAcc.manualOnly) {
      var merged = Object.assign({}, existingAcc, {
        setor: (data.empresa&&data.empresa.setor) || existingAcc.setor || "Empresa",
        fit:   (data.fit&&data.fit.score) || existingAcc.fit || "ALTO",
        tier:  (data.estratégia&&data.estratégia.tier) || existingAcc.tier || "Tier 2",
        mapped: true,
        manualOnly: false,
        liveMode: liveMode||false,
        mappedAt: Date.now(),
        data: data,
        attachData: attachData||existingAcc.attachData||null,
        attachFileName: attachFileName||existingAcc.attachFileName||""
      });
      storageSet(existingAcc.id, merged).then(function() {
        setAccounts(function(prev){ return prev.map(function(a){ return a.id===existingAcc.id ? merged : a; }); });
        if (onCreated) onCreated(merged);
      });
      return;
    }
    var id = "acc:" + Date.now() + "-" + Math.random().toString(36).slice(2,7);
    var acc = { id:id, nome:nome, setor:(data.empresa&&data.empresa.setor)||"Empresa", fit:(data.fit&&data.fit.score)||"ALTO", tier:(data.estratégia&&data.estratégia.tier)||"Tier 2", status:"prospecting", mapped:true, liveMode:liveMode||false, savedAt:Date.now(), data:data, attachData:attachData||null, attachFileName:attachFileName||"" };
    storageSet(id, acc).then(function() {
      setAccounts(function(prev){return [acc].concat(prev);});
      if (onCreated) onCreated(acc);
    });
    var enriched = (data.enriched && data.enriched.contacts && Array.isArray(data.enriched.contacts)) ? data.enriched.contacts : [];
    enriched.forEach(function(s) {
      var nomeReal = s.nome || s.name || "";
      if (!nomeReal) return;
      var cid = "contact:" + Date.now() + "-" + Math.random().toString(36).slice(2,7);
      var contact = { id:cid, nome:nomeReal, cargo:s.cargo||s.title||"", empresa:nome, email:s.email||"", emailValidated:false, linkedin:s.linkedin||"", savedAt:Date.now() };
      storageSet(cid, contact);
    });
  }
  // Importa contas da lista CSV como "unmapped" (sem custo, sem IA)
  function importAccounts(rows) {
    var existingNames = {};
    accounts.forEach(function(a){ existingNames[(a.nome||"").toLowerCase().trim()] = true; });
    var created = [];
    rows.forEach(function(row) {
      var key = (row.nome||"").toLowerCase().trim();
      if (!key || existingNames[key]) return;
      existingNames[key] = true;
      var id = "acc:" + Date.now() + "-" + Math.random().toString(36).slice(2,8);
      var acc = {
        id:id, nome:row.nome, setor:"Aguardando mapeamento",
        fit:"-", tier:"-", status:"prospecting",
        mapped:false, site:row.site||"", linkedin:row.linkedin||"",
        liveMode:false, savedAt:Date.now(), data:null
      };
      created.push(acc);
      storageSet(id, acc);
    });
    if (created.length) {
      setAccounts(function(prev){ return created.concat(prev); });
      showToast(created.length + " conta" + (created.length!==1?"s":"") + " importada" + (created.length!==1?"s":"") + " (aguardando mapeamento).", "#10b981");
    } else {
      showToast("Nenhuma conta nova (todas ja existem na lista).", "#f59e0b");
    }
    return created.length;
  }

  // Mapeia uma conta sob demanda -> consome 1 crédito do plano
  function mapAccount(acc) {
    return new Promise(function(resolve) {
      consumeMapping().then(function(res) {
        if (!res.ok) {
          if (res.reason === "limit") {
            showToast("Limite do plano atingido (" + res.usage.used + "/" + res.usage.limit + "). Faça upgrade para mapear mais.", "#ef4444");
          } else {
            showToast("Nao foi possivel registrar o uso.", "#ef4444");
          }
          setUsage(res.usage);
          resolve(false);
          return;
        }
        setUsage(res.usage);
        setMappingId(acc.id);
        var nome = acc.nome;
        var domain = acc.site ? extractDomain(acc.site) : extractDomain(nome);
        fetch("/api/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({company:nome,domain:domain||"",context:""})})
          .then(function(r){ if(!r.ok) throw new Error("http"); return r.json(); })
          .then(function(resp){
            finishMapping(acc, buildData(nome, resp.results), true, domain);
            resolve(true);
          })
          .catch(function(){
            finishMapping(acc, buildData(nome, null), false, domain);
            resolve(true);
          });
      });
    });
  }

  function finishMapping(acc, data, liveMode, domain) {
    var updated = Object.assign({}, acc, {
      mapped:true, liveMode:liveMode, data:data,
      setor:(data.empresa&&data.empresa.setor)||"Empresa",
      fit:(data.fit&&data.fit.score)||"ALTO",
      tier:(data.estratégia&&data.estratégia.tier)||"Tier 2",
      mappedAt:Date.now()
    });
    storageSet(acc.id, updated);
    setAccounts(function(prev){ return prev.map(function(a){ return a.id===acc.id ? updated : a; }); });
    setMappingId(null);
    showToast("Conta mapeada: " + acc.nome, "#10b981");
  }

  function updateStatus(id, status) {
    setAccounts(function(prev) {
      return prev.map(function(a) {
        if (a.id!==id) return a;
        var updated = Object.assign({},a,{status:status});
        storageSet(id, updated);
        if (openAcc&&openAcc.id===id) setOpenAcc(updated);
        return updated;
      });
    });
    showToast("Status: " + STATUS_CONFIG[status].label);
  }
  function deleteAccount(id) {
    if (!window.confirm("Remover esta conta?")) return;
    storageDel(id).then(function() {
      setAccounts(function(prev){return prev.filter(function(a){return a.id!==id;});});
      showToast("Conta removida.", "#ef4444");
    });
  }
  var css = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    ":root{--mp-bg:#eef1f6;--mp-bg-2:#f6f7f9;--mp-surface:#ffffff;--mp-surface-2:#f6f7f9;--mp-border:#e6e9ef;--mp-border-2:#d6dbe3;--mp-text:#0f172a;--mp-text-2:#52617a;--mp-text-3:#94a3b8;--mp-indigo:#6366f1;--mp-violet:#8b5cf6;--mp-grad:linear-gradient(135deg,#6366f1 0%,#7c3aed 100%);--mp-grad-soft:linear-gradient(135deg,rgba(99,102,241,.1),rgba(139,92,246,.08))}",
    "body{font-family:Inter,system-ui,Verdana,sans-serif;background:#eef1f6;min-height:100vh;color:var(--mp-text)}",
    "@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}",
    "@keyframes toastIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}",
    "@keyframes pulseDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}",
    "@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.75)}}",
    "@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}",
    "::-webkit-scrollbar{width:8px;height:8px}",
    "::-webkit-scrollbar-track{background:transparent}",
    "::-webkit-scrollbar-thumb{background:#cbd2dc;border-radius:4px}",
    "::-webkit-scrollbar-thumb:hover{background:#aab4c2}",
    "@media(max-width:768px){html,body{overflow-x:hidden!important;max-width:100vw!important}.main-content{padding:16px 12px!important;width:100%!important;box-sizing:border-box!important;min-width:0!important}.g2{grid-template-columns:1fr!important}.modal-grid{grid-template-columns:1fr!important}.kpi-grid{grid-template-columns:1fr 1fr!important}.chart-grid{grid-template-columns:1fr!important}.card-grid{grid-template-columns:1fr!important}.modal-box{max-width:calc(100vw - 16px)!important;border-radius:16px!important;width:100%!important}.modal-tabs{overflow-x:auto!important}.modal-tabs button{font-size:10px!important;padding:8px 10px!important}.status-chips{overflow-x:auto!important}}",
    "@keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}",
    "@keyframes glow{0%,100%{box-shadow:0 0 0 0 rgba(99,102,241,0)}50%{box-shadow:0 0 0 6px rgba(99,102,241,.12)}}",
    "@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}",
    "@keyframes slideInRight{from{opacity:0;transform:translateX(80px)}to{opacity:1;transform:translateX(0)}}",
    "@keyframes slideOutLeft{from{opacity:1;transform:translateX(0)}to{opacity:0;transform:translateX(-80px)}}",
    "@keyframes unlockPop{0%{transform:scale(.85);opacity:0}60%{transform:scale(1.04)}100%{transform:scale(1);opacity:1}}",
    "@keyframes navUnlock{from{opacity:.35;filter:grayscale(1)}to{opacity:1;filter:grayscale(0)}}",
    ".onb-card{animation:slideInRight .45s cubic-bezier(.22,1,.36,1) both}",
    ".onb-card-exit{animation:slideOutLeft .35s cubic-bezier(.4,0,.2,1) both}",
    ".nav-locked{opacity:.35!important;pointer-events:none!important;filter:grayscale(1)!important}",
    ".nav-unlocking{animation:navUnlock .6s cubic-bezier(.22,1,.36,1) forwards}",
    ".sidebar{transition:width .3s cubic-bezier(.22,1,.36,1)}",
    ".sidebar-label{transition:opacity .3s cubic-bezier(.4,0,.2,1),transform .3s cubic-bezier(.4,0,.2,1);white-space:nowrap;overflow:hidden}",
    ".sidebar-label.hidden{opacity:0;transform:translateX(-6px);pointer-events:none;width:0}",
    ".sidebar-label.visible{opacity:1;transform:translateX(0)}",
    ".toggle-btn{transition:all .25s cubic-bezier(.22,1,.36,1)}",
    ".toggle-btn:hover{background:rgba(99,102,241,.14) !important}",
    ".card-hover{transition:all .25s cubic-bezier(.22,1,.36,1)}",
    ".card-hover:hover{transform:translateY(-4px);box-shadow:0 20px 60px rgba(15,23,42,.12)}",
    ".glass{background:rgba(255,255,255,.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}",
    ".mp-ambient{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}",
    ".mp-orb{position:absolute;border-radius:50%;filter:blur(60px)}",
    ".mp-orb1{width:480px;height:480px;background:radial-gradient(circle,rgba(99,102,241,.08),transparent 70%);top:-140px;right:-90px}",
    ".mp-orb2{width:360px;height:360px;background:radial-gradient(circle,rgba(139,92,246,.06),transparent 70%);bottom:-80px;left:8%}",
    ".mp-orb3{width:260px;height:260px;background:radial-gradient(circle,rgba(34,211,238,.05),transparent 70%);top:30%;right:18%}",
    ".mp-gridlines{position:absolute;inset:0;background-image:linear-gradient(rgba(15,23,42,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.018) 1px,transparent 1px);background-size:32px 32px}",
    ".gradient-border{position:relative;background:#fff;border-radius:18px}",
    ".gradient-border::before{content:'';position:absolute;inset:-1.5px;border-radius:19px;background:linear-gradient(135deg,#6366f1,#8b5cf6,#22d3ee);z-index:-1;opacity:.4}",
    ".badge-glow{animation:glow 2.5s ease-in-out infinite}",
    "input::placeholder,textarea::placeholder{color:#9aa5b4}",
    ".mobile-nav{display:none}",
    "@media(max-width:767px){" +
      ".sidebar-desktop{display:none!important}" +
      ".main-content{padding:12px 12px 84px!important;width:100%!important;box-sizing:border-box!important}" +
      ".mobile-nav{display:flex!important}" +
      ".acc-grid,.card-grid,.prospect-grid{grid-template-columns:1fr!important;gap:10px!important}" +
      ".filter-row{flex-wrap:wrap!important;gap:8px!important}" +
      ".hero-banner{padding:20px 16px!important}" +
      ".hero-title{font-size:24px!important;letter-spacing:-.5px!important}" +
      ".hero-stats{gap:8px!important;flex-wrap:wrap!important}" +
      ".hero-stat{padding:10px 12px!important;min-width:72px!important}" +
      ".config-grid{grid-template-columns:1fr!important}" +
      ".account-modal{width:100vw!important;max-width:100vw!important;border-radius:0!important;margin:0!important}" +
      ".modal-tabs{overflow-x:auto!important;-webkit-overflow-scrolling:touch!important}" +
      ".modal-tabs button{white-space:nowrap!important;flex-shrink:0!important;font-size:11px!important;padding:9px 11px!important}" +
      ".seq-grid{grid-template-columns:1fr!important}" +
      ".stats-row{gap:8px!important;overflow-x:auto!important;-webkit-overflow-scrolling:touch!important}" +
      ".modal-grid{grid-template-columns:1fr!important}" +
      ".kpi-grid{grid-template-columns:1fr 1fr!important}" +
      ".chart-grid{grid-template-columns:1fr!important}" +
      ".g2{grid-template-columns:1fr!important}" +
    "}",
  ].join("");
  var NAV = [
    {id:"home",         icon:"home",                   label:"Home"},
    {id:"prospect",     icon:"target",                 label:"Busca Geral"},
    {id:"search",       icon:"travel_explore",          label:"Account Mapping"},
    {id:"accounts",     icon:"folder_open",             label:"Contas"},
    {id:"contacts",     icon:"contacts",                label:"Contatos"},
    {id:"sequences",    icon:"forward_to_inbox",        label:"Sequências"},
    {id:"biblioteca",   icon:"local_library",           label:"Biblioteca"},
    {id:"pipeline",     icon:"view_kanban",             label:"Pipeline"},
    {id:"relatorios",   icon:"monitoring",              label:"Relatórios"},
    {id:"integracoes",  icon:"hub",                     label:"Integrações"},
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#eef1f6",overflowX:"clip",maxWidth:"100vw"}}>
      <BetaBanner/>
    <div style={{display:"flex",flex:1,overflowX:"clip",minWidth:0,width:"100%"}}>
      <style>{css}</style>
      <div className="sidebar sidebar-desktop" style={{width:sidebarExpanded?224:64,background:"linear-gradient(180deg,#15192b 0%,#10131f 100%)",borderRight:"1px solid #1f2438",display:"flex",flexDirection:"column",flexShrink:0,boxShadow:"4px 0 24px rgba(15,23,42,.18)",position:"relative",overflow:"hidden",transition:"width .35s cubic-bezier(.4,0,.2,1)",zIndex:2}}>
        <div style={{height:3,background:"linear-gradient(90deg,#6366f1,#7c3aed,#a78bfa)",flexShrink:0}}/>
        {sidebarExpanded ? (
          <div style={{padding:"14px 14px 10px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:9,overflow:"hidden",flex:1,minWidth:0}}>
                            <img src="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCACYAKEDASIAAhEBAxEB/8QAHAABAAICAwEAAAAAAAAAAAAAAAEHBggCBAUD/8QAQxAAAQIEAgYECwUGBwAAAAAAAAECAwQFEQYhBxIxQWGRE1FxsiY1UlNkc4GTlLPRFBUiVXQWIzM2YsElMkJjg4Tw/8QAGwEBAAIDAQEAAAAAAAAAAAAAAAQFAgYHAQP/xAAzEQACAQICBQkJAQEAAAAAAAAAAQIDBAURBhIhcdETMTM0QVKRobEVFiI1UVNhcsEUgf/aAAwDAQACEQMRAD8A0yAAAAAAAAAAAABKJdcj2aXhWv1KAkeSpc1FhrsejLNXsVbX9h9qNvVrvVpRcn+FmYynGCzk8jxQd+rUepUqJ0dQkpiWcuzpGKiL2LsX2HQMKlOdKTjNZP8AJ6pKSzQABgegAAAAAAAAAE3AAIAAAAAAAAABKbQDPtEOGYFWn41SnoSRJaUsjYbku18Rc0vwRM7b7oXQz8KIm5Cv9B+WHZ1fS0+W0sC9zsmi9rSo4dCUVtltf52s1nEJynWefYdOtU+Uq0jEkZ+EkWBESyou1q9adSp1mueIKdEpNZmqfEW7oEVzL9aJsX2pZTZZ6ZGv+k7+d6n61O40p9OLan/np1svizy/5k+BKwmb13HsyMaBKEHMy8AAAAAAAAAAAAAJIAAAAAAABJCAAuTQgvg/Op6Uny2lhohXmg9P8AnV9KTuNLERTtmjvyylufqzVr3p5HF+w1/0nfzvU/XJ3GmwD8kNftJy3xxU/XJ3WlNpx1GH7L0ZKwrpXu/qMaABywvwAAAAAAAAAAAAAAAATqr2e09yBAJ1V4cxqrw5jJggltr5ko3PO3MK1b5KnMZMFy6EEvhyd/Vp8tpn7MtpgOg1fB6ezS32tPltLAVM8jtejvy2lu/rNWvenkcYmZr/AKTUtjep+uTuNL/dkUDpOS+OKna38VN/9DSm036jD9l6MlYV0r3f1GMA5aq8OZGqvDmctyZfggnVXhzGqvDmMmCASqKm1CDwAkgAAAAAAltrpfYAZ3owwZCrrolQqSPSRhO1EY1bLFdvS+5E327OstiFQKLAhJCg0mRYxNiJAav9jytFPR/sHTuj23io/r1tdbmULkp2XR/C7a3soSUU3JJt79prF5cTnVkm9iZ0EpFLalvuuS+Hb9CUo1JXbS5L4dv0O+uYvYvOQpd1eBF15fU85aRS2rlS5L4dv0OTaRSnJnTJK/qG/Q7yhMhyFLurwGvL6nwlpSXlWqyWl4UFqrdUhsRqKvXkfdFJVSLH0UVBZRRjmSqXQ6cWm06LFdFjU+UiRHZuc+C1VXtVUO4ihczyUIzXxLMJtHnOpFLVfFcj8O36D7mpabKXJfDt+h6KC6XMFQpd1eBlryPPSjUq+dLkfcN+hzSk0lE8VSPw7fod29jjrZh29LurwDlJ9pi2KME0WsS0RIcpBkptU/dx4LEbnu1kTJUKKqUnHkJ6NJzLFZGgvVj2ruVDaBbauZQ+lxYC45n+htsho+3laiX/ALGiaZ4bQhRjcwilLPJ5duxvx2FthdxNydN7VkYeADnJdgAAAAAGa6NcaLhyM+TnWvi0+M7Wcjc3QnbNZE38U4XQtiWxdhmYgtjNrki1HbokTUcnai5oa5HNIsREsj3InabNhmlN1Y0uRyUormz7PPmIFxh9OtLW5mbHuxRhq3j6m/EIcFxThz89p3v0Nc+li+cdzJSNE847mWfvxc/bXnxI6wmHeZsYzFGG99epqf8AOgdijDd8q9Tffoa6dM9P9buZxWLE8t3MLTm5+2vPiPZMO8zZqnVGRqMJ0WQm4E0xrtVzoL9ZEXqO3uMA0HLfDs85y3X7Uma+raZ9tN9wu7ld2sK8lk3xKivTVKo4LsCnnzGIKFKTL5abrEhAisWzmRIyNc1eKHoZWKB0nOezG9U1XOT98mxf6GkHSHFqmGUI1aaTzeW3c+B9rO2VxNxby2F0vxPhpNlfpq/9hDimKMN/n1O9+hrn00Ty3cx0sTzjuZqHvxc/bXnxLH2TDvM2MXFGG/z6m+/QJifDaJ4+pvv0NculiecdzJSLE8t3Me/Nz9tefEeyYd5l3Yo0i0WnysSHTorahNqlmJDv0bV61dv7EKUnpmPOTcWZmYixI0Vyve5dqqp8nOVy3VVVTia/i+N3OKSXK7EuZLmJ1taQt18POwT2kApiSTlxBAAAAAAJQgAAAAE2yIABc2hBfB2d/Vp8tpYLSvdB/iCd/VJ8tpYNrKds0d+W0tz9Wate9PIPyQ1+0mOVcbVS/nk7rTYB65FAaT1RccVO3nU7jSm046jD9l6MlYV0r3cDGQAcsL8AAAAAAAAAAAAAAAAAAAAAAAAufQcng7Or6Wny2lgXK+0Hu8HZ1PS0+W0sFM0O2aO/LaW5+rNWvenkcX2sa/6Tktjepp/up3GmwERFtka/aTFVcbVO/nU7rSm046jD9l6Ml4V0r3cDGwAcsL4AAAAAAAlCAAAAAAAAAAAAAASm0gAGcaK8UQKHUIsnPPVknNat3rshvTY5eCpkvsLwgq2LBZGhOSIx6Xa5i3RU4Khqwm253pKsVSSh9FJ1GclmeTBjuYnJFsbfgmlU8Po8hVjrRXN9UVl3h/LS14vJmw+I63T6BIPnKhFRiIn4ISf54jtzWp/6xrrWp+LU6rMz8b+JHiOiKm5LrsTs2ew+c3NzE3FWLMx4seIqWV8R6uVfap8CFjukFTFXGOWrBdn5+rPtZ2at03nm2CATwNdJpAAAAAAAAAJy4ggAAAAAAAAAAAAAAAAAAAAbgAAAAAAAAAACb8AAAf/Z" alt="+pipe" style={{width:36,height:36,borderRadius:10,objectFit:"contain",flexShrink:0}}/>
              <div style={{minWidth:0,overflow:"hidden"}}>
                <div style={{fontSize:14,fontWeight:800,letterSpacing:"-0.3px",lineHeight:1.2,whiteSpace:"nowrap"}}><span style={{color:"#818cf8"}}>+</span><span style={{color:"#ffffff"}}> pipe</span></div>
                <div style={{fontSize:7.5,color:"#7c869b",fontWeight:600,letterSpacing:1.5,textTransform:"uppercase",whiteSpace:"nowrap"}}>PROSPECTING TOOL</div>
              </div>
            </div>
            <button onClick={function(){setSidebarExpanded(false);}} title="Recolher menu" style={{width:26,height:26,borderRadius:7,border:"none",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#8b93a7",flexShrink:0,padding:0,transition:"all .2s"}} onMouseEnter={function(e){e.currentTarget.style.background="rgba(255,255,255,.06)";e.currentTarget.style.color="#fff";}} onMouseLeave={function(e){e.currentTarget.style.background="transparent";e.currentTarget.style.color="rgba(255,255,255,.5)";}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          </div>
        ) : (
          <div style={{padding:"14px 0 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,flexShrink:0}}>
                      <img src="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCACYAKEDASIAAhEBAxEB/8QAHAABAAICAwEAAAAAAAAAAAAAAAEHBggCBAUD/8QAQxAAAQIEAgYECwUGBwAAAAAAAAECAwQFEQYhBxIxQWGRE1FxsiY1UlNkc4GTlLPRFBUiVXQWIzM2YsElMkJjg4Tw/8QAGwEBAAIDAQEAAAAAAAAAAAAAAAQFAgYHAQP/xAAzEQACAQICBQkJAQEAAAAAAAAAAQIDBAURBhIhcdETMTM0QVKRobEVFiI1UVNhcsEUgf/aAAwDAQACEQMRAD8A0yAAAAAAAAAAAABKJdcj2aXhWv1KAkeSpc1FhrsejLNXsVbX9h9qNvVrvVpRcn+FmYynGCzk8jxQd+rUepUqJ0dQkpiWcuzpGKiL2LsX2HQMKlOdKTjNZP8AJ6pKSzQABgegAAAAAAAAAE3AAIAAAAAAAAABKbQDPtEOGYFWn41SnoSRJaUsjYbku18Rc0vwRM7b7oXQz8KIm5Cv9B+WHZ1fS0+W0sC9zsmi9rSo4dCUVtltf52s1nEJynWefYdOtU+Uq0jEkZ+EkWBESyou1q9adSp1mueIKdEpNZmqfEW7oEVzL9aJsX2pZTZZ6ZGv+k7+d6n61O40p9OLan/np1svizy/5k+BKwmb13HsyMaBKEHMy8AAAAAAAAAAAAAJIAAAAAAABJCAAuTQgvg/Op6Uny2lhohXmg9P8AnV9KTuNLERTtmjvyylufqzVr3p5HF+w1/0nfzvU/XJ3GmwD8kNftJy3xxU/XJ3WlNpx1GH7L0ZKwrpXu/qMaABywvwAAAAAAAAAAAAAAAATqr2e09yBAJ1V4cxqrw5jJggltr5ko3PO3MK1b5KnMZMFy6EEvhyd/Vp8tpn7MtpgOg1fB6ezS32tPltLAVM8jtejvy2lu/rNWvenkcYmZr/AKTUtjep+uTuNL/dkUDpOS+OKna38VN/9DSm036jD9l6MlYV0r3f1GMA5aq8OZGqvDmctyZfggnVXhzGqvDmMmCASqKm1CDwAkgAAAAAAltrpfYAZ3owwZCrrolQqSPSRhO1EY1bLFdvS+5E327OstiFQKLAhJCg0mRYxNiJAav9jytFPR/sHTuj23io/r1tdbmULkp2XR/C7a3soSUU3JJt79prF5cTnVkm9iZ0EpFLalvuuS+Hb9CUo1JXbS5L4dv0O+uYvYvOQpd1eBF15fU85aRS2rlS5L4dv0OTaRSnJnTJK/qG/Q7yhMhyFLurwGvL6nwlpSXlWqyWl4UFqrdUhsRqKvXkfdFJVSLH0UVBZRRjmSqXQ6cWm06LFdFjU+UiRHZuc+C1VXtVUO4ihczyUIzXxLMJtHnOpFLVfFcj8O36D7mpabKXJfDt+h6KC6XMFQpd1eBlryPPSjUq+dLkfcN+hzSk0lE8VSPw7fod29jjrZh29LurwDlJ9pi2KME0WsS0RIcpBkptU/dx4LEbnu1kTJUKKqUnHkJ6NJzLFZGgvVj2ruVDaBbauZQ+lxYC45n+htsho+3laiX/ALGiaZ4bQhRjcwilLPJ5duxvx2FthdxNydN7VkYeADnJdgAAAAAGa6NcaLhyM+TnWvi0+M7Wcjc3QnbNZE38U4XQtiWxdhmYgtjNrki1HbokTUcnai5oa5HNIsREsj3InabNhmlN1Y0uRyUormz7PPmIFxh9OtLW5mbHuxRhq3j6m/EIcFxThz89p3v0Nc+li+cdzJSNE847mWfvxc/bXnxI6wmHeZsYzFGG99epqf8AOgdijDd8q9Tffoa6dM9P9buZxWLE8t3MLTm5+2vPiPZMO8zZqnVGRqMJ0WQm4E0xrtVzoL9ZEXqO3uMA0HLfDs85y3X7Uma+raZ9tN9wu7ld2sK8lk3xKivTVKo4LsCnnzGIKFKTL5abrEhAisWzmRIyNc1eKHoZWKB0nOezG9U1XOT98mxf6GkHSHFqmGUI1aaTzeW3c+B9rO2VxNxby2F0vxPhpNlfpq/9hDimKMN/n1O9+hrn00Ty3cx0sTzjuZqHvxc/bXnxLH2TDvM2MXFGG/z6m+/QJifDaJ4+pvv0NculiecdzJSLE8t3Me/Nz9tefEeyYd5l3Yo0i0WnysSHTorahNqlmJDv0bV61dv7EKUnpmPOTcWZmYixI0Vyve5dqqp8nOVy3VVVTia/i+N3OKSXK7EuZLmJ1taQt18POwT2kApiSTlxBAAAAAAJQgAAAAE2yIABc2hBfB2d/Vp8tpYLSvdB/iCd/VJ8tpYNrKds0d+W0tz9Wate9PIPyQ1+0mOVcbVS/nk7rTYB65FAaT1RccVO3nU7jSm046jD9l6MlYV0r3cDGQAcsL8AAAAAAAAAAAAAAAAAAAAAAAAufQcng7Or6Wny2lgXK+0Hu8HZ1PS0+W0sFM0O2aO/LaW5+rNWvenkcX2sa/6Tktjepp/up3GmwERFtka/aTFVcbVO/nU7rSm046jD9l6Ml4V0r3cDGwAcsL4AAAAAAAlCAAAAAAAAAAAAAASm0gAGcaK8UQKHUIsnPPVknNat3rshvTY5eCpkvsLwgq2LBZGhOSIx6Xa5i3RU4Khqwm253pKsVSSh9FJ1GclmeTBjuYnJFsbfgmlU8Po8hVjrRXN9UVl3h/LS14vJmw+I63T6BIPnKhFRiIn4ISf54jtzWp/6xrrWp+LU6rMz8b+JHiOiKm5LrsTs2ew+c3NzE3FWLMx4seIqWV8R6uVfap8CFjukFTFXGOWrBdn5+rPtZ2at03nm2CATwNdJpAAAAAAAAAJy4ggAAAAAAAAAAAAAAAAAAAAbgAAAAAAAAAACb8AAAf/Z" alt="+pipe" style={{width:40,height:40,borderRadius:12,objectFit:"contain"}}/>
            <button onClick={function(){setSidebarExpanded(true);}} title="Expandir menu" style={{width:26,height:26,borderRadius:7,border:"none",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#8b93a7",padding:0}} onMouseEnter={function(e){e.currentTarget.style.background="rgba(255,255,255,.06)";e.currentTarget.style.color="#fff";}} onMouseLeave={function(e){e.currentTarget.style.background="transparent";e.currentTarget.style.color="rgba(255,255,255,.5)";}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        )}
        <div style={{height:1,background:"rgba(255,255,255,.07)",margin:"0 10px 8px",flexShrink:0}}/>
        <nav style={{padding:"0 8px",flex:1,overflow:"hidden"}}>
          {NAV.map(function(item) {
            var active = nav===item.id;
            var isHome = item.id === "home";
            var locked = !setupDone && !isHome;
            var unlocking = setupUnlocking && !isHome;
            return (
              <button key={item.id} onClick={function(){ if (!locked) setNav(item.id); }} title={sidebarExpanded?"":item.label} className={locked?"nav-locked":unlocking?"nav-unlocking":""} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:sidebarExpanded?"10px 12px":"8px 0",justifyContent:sidebarExpanded?"flex-start":"center",borderRadius:11,border:"1px solid "+(active?"rgba(99,102,241,.3)":"transparent"),background:active?"linear-gradient(135deg,rgba(99,102,241,.22),rgba(139,92,246,.15))":"transparent",color:active?"#ffffff":"rgba(255,255,255,.92)",cursor:locked?"default":"pointer",fontFamily:"inherit",fontSize:13,fontWeight:active?700:600,marginBottom:3,transition:"all .25s cubic-bezier(.4,0,.2,1)",textAlign:"left",boxShadow:active?"0 4px 14px rgba(99,102,241,.25)":"none",position:"relative",willChange:"background,color"}} onMouseEnter={function(e){if(!active&&!locked){e.currentTarget.style.background="rgba(255,255,255,.05)";e.currentTarget.style.color="rgba(255,255,255,.85)";}}} onMouseLeave={function(e){if(!active&&!locked){e.currentTarget.style.background="transparent";e.currentTarget.style.color="rgba(255,255,255,.92)";}}}> 
                {active && <span style={{position:"absolute",left:0,top:"50%",transform:"translateY(-50%)",width:3,height:18,background:"linear-gradient(180deg,#6366f1,#8b5cf6)",borderRadius:"0 3px 3px 0"}}/>}
                <span style={{display:"flex",alignItems:"center",justifyContent:"center",width:sidebarExpanded?20:22,flexShrink:0,transition:"width .2s ease",position:"relative"}}>
                  <Icon name={item.icon} size={sidebarExpanded?18:21} color={active?"#ffffff":"rgba(255,255,255,.78)"}/>
                  {item.id==="prospect" && prospectLoading && <span style={{position:"absolute",top:-3,right:-3,width:7,height:7,borderRadius:"50%",background:"#a5b4fc",animation:"pulse 1.2s ease-in-out infinite"}}/>}
                </span>
                <span className={"sidebar-label " + (sidebarExpanded?"visible":"hidden")} style={{flex:1,display:"flex",alignItems:"center",gap:6}}>
                  {item.label}
                  {item.id==="prospect" && prospectLoading && sidebarExpanded && <span style={{fontSize:9,color:"#a5b4fc",fontWeight:600,animation:"pulse 1.2s ease-in-out infinite"}}>{"buscando..."}</span>}
                  {locked && sidebarExpanded && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{opacity:.5,flexShrink:0,marginLeft:"auto"}}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
                </span>
              </button>
            );
          })}
        </nav>
        {sidebarExpanded && (
          <div style={{padding:"12px 14px 16px",borderTop:"1px solid rgba(255,255,255,.07)",flexShrink:0}}>
            {usage ? (
              <div style={{background:"rgba(99,102,241,.1)",border:"1px solid rgba(99,102,241,.2)",borderRadius:11,padding:"11px 13px"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
                  <span style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1,color:"#818cf8"}}>{"Plano "+(usage.planLabel||"")}</span>
                  <span style={{fontSize:9,fontWeight:700,color:"#8b93a7"}}>{usage.used+"/"+usage.limit}</span>
                </div>
                <div style={{background:"rgba(255,255,255,.08)",borderRadius:4,height:5,overflow:"hidden"}}>
                  <div style={{background:"linear-gradient(90deg,#6366f1,#8b5cf6)",borderRadius:4,height:5,width:Math.min(100,Math.round((usage.used/(usage.limit||1))*100))+"%",transition:"width .4s ease"}}/>
                </div>
                <div style={{fontSize:10,color:"#8b93a7",marginTop:6}}>{usage.remaining+" mapeamento"+(usage.remaining!==1?"s":"")+" restante"+(usage.remaining!==1?"s":"")}</div>
              </div>
            ) : (
              <div style={{fontSize:10,color:"#94a3b8",lineHeight:1.6}}>
                {accounts.length+" conta"+(accounts.length!==1?"s":"")+" salva"+(accounts.length!==1?"s":"")}
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0,minWidth:0,width:0,position:"relative"}}>
        <div className="mp-ambient"><div className="mp-orb mp-orb1"/><div className="mp-orb mp-orb2"/><div className="mp-orb mp-orb3"/><div className="mp-gridlines"/></div>
        <div className="main-content" style={{flex:1,overflowY:"auto",padding:"24px 28px",boxSizing:"border-box",width:"100%",minWidth:0,position:"relative",zIndex:1}}>
          {loading ? (
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",gap:12}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:"#818cf8",animation:"pulseDot 1s infinite"}}/>
              <span style={{color:"#64748b",fontSize:13}}>Carregando...</span>
            </div>
          ) : (
            <div key={nav} style={{animation:"fadeUp .4s cubic-bezier(.4,0,.2,1) both"}}>
              {nav==="home"      && <HomeView accounts={accounts} onNav={setNav} setupDone={setupDone} onFinishSetup={finishSetup} onResetSetup={resetSetup} usage={usage} onChangePlan={changePlan} showToast={showToast}/>}
              {nav==="search"    && <SearchView accounts={accounts} onSave={saveAccount} onOpenAccount={function(acc){setOpenAcc(acc);}} onUpdateAccount={function(updated){setAccounts(function(prev){return prev.map(function(a){return a.id===updated.id?updated:a;});});if(openAcc&&openAcc.id===updated.id)setOpenAcc(updated);}} usage={usage} onRequestCredit={requestMapCredit} onImport={importAccounts} onChangePlan={changePlan} onNav={setNav} onContactsRefresh={triggerContactsRefresh} onSetContactSearch={setPendingContactSearch}/>}
              {nav==="prospect"  && <ProspectView accounts={accounts} usage={usage} onRequestCredit={requestMapCredit} onNav={setNav} onOpenAccount={function(acc){setOpenAcc(acc);}} onUpdateAccount={function(updated){setAccounts(function(prev){return prev.map(function(a){return a.id===updated.id?updated:a;});});if(openAcc&&openAcc.id===updated.id)setOpenAcc(updated);}} onContactsRefresh={triggerContactsRefresh} onSaveRaw={function(nome,results,live,att,attName,onCreated,existing){ saveAccount(nome,buildData(nome,results),live,att,attName,onCreated,existing); }} lista={prospectLista} setLista={setProspectLista} loadingP={prospectLoading} setLoadingP={setProspectLoading} errorP={prospectError} setErrorP={setProspectError}/>}
              {nav==="accounts"  && <AccountsView accounts={accounts} onOpen={setOpenAcc} onStatusChange={updateStatus} onDelete={deleteAccount} usage={usage} onImport={importAccounts} onMap={mapAccount} mappingId={mappingId} onChangePlan={changePlan}/>}
              {nav==="sequences" && <SequenceView accounts={accounts} showToast={showToast} seqRequest={seqRequest} onConsumeSeqRequest={function(){setSeqRequest(null);}}/>}
              {nav==="relatorios"&& <InsightsView accounts={accounts}/>}
              {nav==="biblioteca" && <BibliotecaView showToast={showToast} onCountChange={setSeqCount} onOpenSeq={setOpenSeq}/>}
              {nav==="contacts" && <ContactsView showToast={showToast} onGenerateSequence={generateSequenceFromContact} accounts={accounts} refreshKey={contactsRefreshKey} defaultSearch={pendingContactSearch} onMounted={function(){ setPendingContactSearch(""); }} onFavoriteChange={triggerContactsRefresh} onCreateAccount={function(nome){
                var id="acc:"+Date.now()+"-"+Math.random().toString(36).slice(2,7);
                var acc={id:id,nome:nome,setor:"Criada manualmente",fit:"-",tier:"-",status:"prospecting",mapped:false,manualOnly:true,savedAt:Date.now(),data:null};
                storageSet(id,acc).then(function(){setAccounts(function(prev){return [acc].concat(prev);});});
                return acc;
              }}/>}
              {nav==="integracoes" && <IntegrationsView/>}
              {nav==="pipeline"  && (
                <div>
                  <div style={{fontSize:28,fontWeight:800,color:"#0f172a",marginBottom:4,letterSpacing:"-0.6px"}}>Pipeline</div>
                  <div style={{fontSize:13,color:"#52617a",marginBottom:24}}>{"Arraste os cards entre colunas para avançar ou recuar o estágio da prospecção."}</div>
                  <PipelineView accounts={accounts} onOpen={setOpenAcc} onStatusChange={updateStatus}/>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {openAcc && <AccountModal acc={openAcc} onClose={function(){setOpenAcc(null);}} onStatusChange={updateStatus} onNav={setNav} onContactsRefresh={triggerContactsRefresh} onSetContactSearch={setPendingContactSearch} onUpdateAccount={function(updated){setAccounts(function(prev){return prev.map(function(a){return a.id===updated.id?updated:a;});});if(openAcc&&openAcc.id===updated.id)setOpenAcc(updated);}} onReEnrich={function(acc){doEnrichAccount(acc);}}/>}
      {openSeq && <SequenceModal seq={openSeq} onClose={function(){setOpenSeq(null);}}/>}
      {toast && (
        <div style={{position:"fixed",bottom:28,right:28,background:toast.color,color:"#fff",borderRadius:14,padding:"14px 22px",fontSize:13,fontWeight:600,boxShadow:"0 12px 40px rgba(15,23,42,.10),0 0 0 1px rgba(255,255,255,.15)",animation:"toastIn .35s cubic-bezier(.22,1,.36,1)",zIndex:300,maxWidth:480,display:"flex",alignItems:"flex-start",gap:10,wordBreak:"break-word",lineHeight:1.5}}>
          {toast.msg}
        </div>
      )}
      {/* ── Mobile bottom nav ─────────────────────────────────────────────── */}
      <MobileNav nav={nav} setNav={setNav} setupDone={setupDone}/>
    </div>
    </div>
  );
}
