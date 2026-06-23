// ============================================================
// CLIENT CONFIG — Zendesk
// ============================================================
// Para ativar: em clientLoader.js, importe este arquivo e
// adicione "zendesk" no objeto configs.
// VITE_CLIENT=zendesk no painel do Vercel.
// ============================================================

export const CLIENT_CONFIG = {

  // ----------------------------------------------------------
  // 1. IDENTIDADE
  // ----------------------------------------------------------
  empresa: {
    nome:        "Zendesk",
    assinatura:  "BDR/SDR | Zendesk",
    site:        "https://www.zendesk.com.br",
    whatsapp:    "551130030908",
    rodape:      "Mais Pipe Beta , Zendesk",
    fitLabel:    "Fit Zendesk",
    solucoesKey: "solucoes_mgt",
  },

  // ----------------------------------------------------------
  // 2. UI
  // ----------------------------------------------------------
  ui: {
    loadingSteps: [
      { text: "Consultando fontes públicas com IA...",                              icon: "🔍" },
      { text: "Mapeando estrutura de atendimento e canais da empresa...",           icon: "🧭" },
      { text: "Gerando fit score e dores de CX...",                                 icon: "⚡" },
      { text: "Criando mensagens personalizadas por canal...",                      icon: "✉"  },
      { text: "Montando plano de prospecção focado em CX e atendimento...",        icon: "🎯" },
    ],
    cardBusca: "Analise qualquer empresa Mid Market e gere account mapping completo com fit de CX, dores, stakeholders e mensagens personalizadas.",
    cardSeqs:  "Gere cadências de 6 toques personalizadas por stakeholder com e-mail, InMail, WhatsApp e cold call — focados em CSAT, custo por ticket e omnichannel.",
    statSeqs:  "6 perfis de CX",
  },

  // ----------------------------------------------------------
  // 3. ICP DEFAULT + CRITÉRIOS DE FIT (5 dimensões)
  // ----------------------------------------------------------
  icpDefault: {
    segmento:     "E-commerce / Varejo / Fintech / SaaS / Saúde / Telecomunicações",
    porte:        "200–2000 colaboradores",
    faturamento:  "R$ 30M – R$ 1B/ano",
    regiao:       "Brasil",
    cargos:       "Head de CX, Diretor de Atendimento, CEO, VP de Ops, Head de CS, CFO",
    observacoes:  "Empresas com time de atendimento ativo sob pressão de CSAT e custo por ticket. Preferência por empresas com múltiplos canais (chat, e-mail, WhatsApp, voz) ainda desconectados ou com ferramenta legada.",
  },

  fitCriteria: [
    {
      id:    "volume",
      label: "Volume de tickets",
      desc:  "Time de atendimento ativo com volume relevante — sinais de contratação de agentes ou reclamações públicas no Reclame Aqui",
      peso:  2,
    },
    {
      id:    "setor",
      label: "Setor / Vertical",
      desc:  "Atua em vertical com alta demanda de suporte ao cliente: E-commerce, Fintech, SaaS, Saúde, Telecom ou Varejo",
      peso:  2,
    },
    {
      id:    "canais",
      label: "Multi-canal desconectado",
      desc:  "Opera em múltiplos canais (e-mail, chat, WhatsApp, voz) sem plataforma unificada — fragmentação de atendimento",
      peso:  2,
    },
    {
      id:    "csat",
      label: "Pressão de CSAT / NPS",
      desc:  "CSAT abaixo do benchmark do setor, alto tempo médio de atendimento ou reclamações públicas recorrentes",
      peso:  2,
    },
    {
      id:    "crescimento",
      label: "Momento de crescimento",
      desc:  "Empresa em crescimento acelerado — novo produto, expansão de base ou aquisição recente que pressiona o atendimento",
      peso:  2,
    },
  ],

  // ----------------------------------------------------------
  // 4. CLASSIFICAÇÃO DE SETOR
  // ----------------------------------------------------------
  setorConfig: {
    regexes: [
      { key: "isEcomm",   pattern: /magalu|americanas|shopee|mercado livre|amazon|via varejo|renner|centauro|dafiti|loja|varejo|e-commerce|ecommerce|retail/i,   label: "E-commerce / Varejo",              tier1: true  },
      { key: "isFintech", pattern: /nubank|c6|inter|stone|pagseguro|pagbank|picpay|cielo|btg|xp|itau|bradesco|banco|financeira|seguradora|fintec/i,               label: "Fintech / Serviços Financeiros",   tier1: true  },
      { key: "isSaaS",    pattern: /totvs|linx|vtex|rdstation|senior|sankhya|contaazul|omie|piperun|agendor|software|tecnologia|saas|plataforma|startup/i,        label: "Software / SaaS B2B",             tier1: true  },
      { key: "isHealth",  pattern: /hapvida|amil|unimed|dasa|fleury|einstein|afya|hospital|clinica|farmaceutica|pharma|healthtech|saude/i,                        label: "Saúde / Healthtech",              tier1: true  },
      { key: "isTelecom", pattern: /\bvivo\b|claro|\btim\b|algar|embratel|telecom|telefonia|internet|provedor/i,                                                  label: "Telecomunicações",                tier1: false },
      { key: "isLogistic",pattern: /logística|transporte|entrega|frete|correios|jadlog|ifood|rappi|delivery|courier/i,                                             label: "Logística / Delivery",           tier1: false },
    ],
    fallbackLabel: "Mid Market / Serviços",
    fallbackTier1: false,
  },

  // ----------------------------------------------------------
  // 5. STAKEHOLDER PROFILES
  // ----------------------------------------------------------
  stakeholderProfiles: [
    { id: "headcx",  label: "Head de CX / Diretor de Atendimento",  angle: "CSAT, SLA e escala do time",         pain: "volume crescendo mais rápido que headcount, CSAT caindo e custo por ticket estourando" },
    { id: "ceo",     label: "CEO / Diretor Geral",                   angle: "retenção, churn e crescimento",      pain: "atendimento ruim travando expansão — cliente churna por má experiência" },
    { id: "ops",     label: "VP / Diretor de Operações",             angle: "custo por ticket e eficiência",      pain: "budget de CX estourado sem visibilidade de ROI e SLA imprevisível" },
    { id: "cs",      label: "Head de Customer Success",              angle: "health score e retenção",            pain: "sem visibilidade de clientes em risco antes de churnarem" },
    { id: "ti",      label: "Gerente de TI / CTO",                   angle: "integração e migração",              pain: "sistema atual sem API robusta, customizações caras e migração travada" },
    { id: "cfo",     label: "CFO / Diretor Financeiro",              angle: "ROI e redução de custo",             pain: "custo por ticket alto sem benchmark claro e payback difícil de calcular" },
  ],

  // ----------------------------------------------------------
  // 6. SEQUÊNCIAS POR PERFIL
  // ----------------------------------------------------------
  sequenceTemplates: {
    headcx: [
      { day: 1,  type: "linkedin",  subject: "Atendimento omnichannel na {empresa}", body: "Olá, tudo bem?\n\nVi que {empresa} atua em {setor} e tem uma operação de atendimento ativa.\n\nComo Head de CX, imagino que você equilibra diariamente a pressão por SLA com a necessidade de escalar o time sem explodir o custo.\n\nEmpresas similares no {setor} conseguiram aumentar CSAT em 25% e reduzir 40% do custo por ticket ao unificar todos os canais na Zendesk Suite com IA nativa.\n\nFaz sentido um papo de 20 minutos para eu entender como está o processo de atendimento de vocês hoje?\n\nAbraço,\nBDR/SDR | Zendesk" },
      { day: 3,  type: "email",     subject: "[{empresa}] Quanto custa um ticket sem resposta?", body: "Olá,\n\nUma pergunta direta: qual o impacto no churn quando um cliente fica mais de 24h sem resposta na {empresa}?\n\nNa média do setor de {setor}, cada 1% de queda no CSAT representa aumento de 2 a 3% no churn. Com a Zendesk Suite, empresas similares:\n\n— Reduziram TMA em 35% com macros e IA de sugestão de resposta\n— Aumentaram first contact resolution de 52% para 78%\n— Deflexionaram 28% dos tickets via self-service inteligente\n\nConsigo te mostrar em 20 minutos com dados do seu setor.\n\nTem disponibilidade essa semana?\n\nAbraço,\nBDR/SDR | Zendesk" },
      { day: 6,  type: "call",      subject: "Cold call — Head de CX {empresa}", body: "Bom dia [Nome], aqui é o BDR da Zendesk. Tenho 30 segundos?\n\n[PAUSA]\n\nPerfeito. Ligo porque {empresa} tem o perfil exato onde a Zendesk gera mais impacto em {setor}: time de atendimento ativo com pressão crescente de CSAT e custo.\n\nEmpresas similares aumentaram CSAT em 25% e reduziram 40% do custo por ticket nos primeiros 90 dias. Faz sentido eu te mostrar como funcionou? Quando você tem 20 minutos?" },
      { day: 10, type: "email",     subject: "[{empresa}] Case: CSAT de 68% para 89% em 90 dias", body: "Olá,\n\nRecentemente ajudamos uma empresa de {setor} com perfil muito similar ao da {empresa} a:\n\n— Unificar e-mail, chat, WhatsApp e voz em uma única plataforma em 30 dias\n— Aumentar CSAT de 68% para 89% nos primeiros 90 dias\n— Reduzir TMA em 35% com macros inteligentes e IA de sugestão\n— Deflexionar 28% dos tickets via self-service — sem agente\n\nO time de CX não parou as operações — a implementação foi conduzida pelo nosso CS.\n\nFaz sentido eu te contar como funcionou? 20 minutos essa semana.\n\nAbraço,\nBDR/SDR | Zendesk" },
      { day: 15, type: "whatsapp",  subject: "WhatsApp — Head CX {empresa}", body: "Oi [Nome], BDR da Zendesk. Vi que {empresa} está crescendo em {setor}. Empresas nessa fase costumam ter CSAT caindo por volume — unificamos todos os canais em 30 dias. Vale 15 minutos?" },
      { day: 21, type: "breakup",   subject: "Última mensagem — {empresa}", body: "Olá,\n\nVou respeitar o seu tempo — essa é minha última mensagem sobre o tema.\n\nSe CX e self-service não são prioridade agora na {empresa}, faz todo sentido. Mas se em algum momento a conversa sobre CSAT, custo por ticket ou escala do time de atendimento ganhar urgência, pode me chamar.\n\nGuardo a {empresa} no radar.\n\nAbraço,\nBDR/SDR | Zendesk" },
    ],
    ceo: [
      { day: 1,  type: "linkedin",  subject: "Retenção de clientes na {empresa}", body: "Olá, tudo bem?\n\nVi que {empresa} está crescendo em {setor} — parabéns pelo trabalho.\n\nUma realidade comum em empresas que crescem rápido: a base de clientes cresce mais rápido que a capacidade de atendimento, e o CSAT começa a cair — gerando churn justamente quando mais precisam reter.\n\nEmpresas similares no {setor} resolveram isso com Zendesk Suite: escalaram o atendimento com IA e self-service sem aumentar headcount.\n\nVale um papo de 15 minutos?" },
      { day: 3,  type: "email",     subject: "[{empresa}] Atendimento como vantagem competitiva", body: "Olá,\n\nPara uma empresa de {setor} em crescimento como a {empresa}, atendimento ao cliente pode ser o maior diferencial competitivo — ou o maior risco de churn.\n\nO que empresas líderes do setor estão fazendo:\n— Self-service com IA que resolve 30% dos tickets sem agente\n— Omnichannel unificado: o cliente não precisa repetir o problema\n— CSAT em tempo real para antecipar clientes em risco de churn\n\nConsigo te mostrar em 20 minutos como isso se aplicaria à {empresa}.\n\nTem disponibilidade?\n\nAbraço,\nBDR/SDR | Zendesk" },
      { day: 7,  type: "whatsapp",  subject: "WhatsApp — CEO {empresa}", body: "Oi [Nome], BDR da Zendesk. Direto ao ponto: empresa de {setor} com perfil da {empresa} reduziu churn em 15% ao melhorar CSAT com nossa plataforma. Vale 15 minutos para eu mostrar como?" },
      { day: 12, type: "email",     subject: "[{empresa}] O custo do atendimento ruim", body: "Olá,\n\nUm número que costuma surpreender CEOs de empresas de {setor}: adquirir um novo cliente custa de 5 a 7x mais do que reter um cliente existente.\n\nE o principal motivo de churn evitável? Atendimento lento ou fragmentado.\n\nCom a Zendesk Suite, a {empresa} poderia:\n— Responder mais rápido com IA e automação\n— Dar ao cliente a opção de resolver sozinho (self-service)\n— Ter visibilidade em tempo real do CSAT e NPS\n\nVale 20 minutos para ver o potencial?\n\nAbraço,\nBDR/SDR | Zendesk" },
      { day: 17, type: "call",      subject: "Cold call — CEO {empresa}", body: "Bom dia [Nome], BDR da Zendesk. Vou ser rápido.\n\nLigo porque {empresa} está crescendo em {setor} e esse é exatamente o momento em que CX pode ser vantagem competitiva ou gargalo de crescimento.\n\nUma pergunta: qual o CSAT atual de vocês e qual o impacto no churn quando um cliente não é bem atendido?" },
      { day: 22, type: "breakup",   subject: "Encerrando contato — {empresa}", body: "Olá,\n\nEncerro o contato por aqui. Se em algum momento o tema de CX, retenção de clientes ou escala do atendimento ganhar urgência na {empresa}, pode me chamar.\n\nAbraço e sucesso!\nBDR/SDR | Zendesk" },
    ],
    ops: [
      { day: 1,  type: "email",     subject: "[{empresa}] Custo por ticket no {setor}", body: "Olá,\n\nUma pergunta direta para um Diretor de Operações: qual o custo por ticket do time de atendimento da {empresa} hoje?\n\nNa média do setor de {setor}, o custo por ticket varia de R$15 a R$45. Com deflexão via self-service e IA da Zendesk, empresas similares reduziram esse custo em 40% em 90 dias.\n\nConsigo te mostrar o cálculo aplicado ao perfil da {empresa} em 20 minutos.\n\nTem disponibilidade?\n\nAbraço,\nBDR/SDR | Zendesk" },
      { day: 4,  type: "linkedin",  subject: "Eficiência operacional no atendimento — {empresa}", body: "Olá,\n\nComo Diretor de Operações, imagino que você olha constantemente para a relação entre headcount do time de CX e volume de tickets.\n\nO desafio mais comum em {setor}: o volume cresce 20% ao ano mas o budget não acompanha — e a saída é ou contratar mais agentes ou encontrar eficiência com tecnologia.\n\nA Zendesk Suite resolve isso com automação, IA e self-service. Vale um papo?" },
      { day: 8,  type: "call",      subject: "Cold call — Ops {empresa}", body: "Bom dia [Nome], BDR da Zendesk. Tenho 30 segundos?\n\n[PAUSA]\n\nPerfeito. Ligo porque {empresa} apareceu no nosso radar em {setor}. Uma pergunta objetiva: qual o custo mensal do time de atendimento de vocês — e vocês têm visibilidade do custo por ticket hoje?\n\n[ouvir]\n\nEntendi. E quando o volume de tickets sobe, o que acontece com o SLA e com o headcount?" },
      { day: 13, type: "email",     subject: "[{empresa}] ROI de CX: cálculo rápido", body: "Olá,\n\nUm cálculo que costuma mudar a perspectiva de Diretores de Operações:\n\nSe {empresa} tem 50 agentes com custo médio de R$4.000/mês = R$200k/mês\nDeflexionando 30% dos tickets com self-service = 15 agentes equivalentes economizados\nImpacto potencial: R$60k/mês = R$720k/ano\n\nIsso sem contar a melhora de CSAT e redução de churn.\n\nConsigo te montar um business case específico para {empresa} em 20 minutos de conversa.\n\nAbraço,\nBDR/SDR | Zendesk" },
      { day: 19, type: "whatsapp",  subject: "WhatsApp — Ops {empresa}", body: "Oi [Nome], BDR da Zendesk. Diretor de Ops de empresa de {setor} com porte da {empresa} reduziu 40% do custo por ticket em 90 dias. Tenho o case. Vale 15 minutos?" },
      { day: 25, type: "breakup",   subject: "Encerrando — {empresa}", body: "Olá,\n\nNão quero continuar incomodando. Encerro o contato por aqui.\n\nSe em algum momento a conversa sobre custo de atendimento ou eficiência operacional de CX ganhar espaço, pode me chamar.\n\nAbraço,\nBDR/SDR | Zendesk" },
    ],
    cs: [
      { day: 1,  type: "linkedin",  subject: "Customer Success e retenção na {empresa}", body: "Olá,\n\nVi que {empresa} está investindo em Customer Success em {setor} — ótima estratégia.\n\nUma pergunta: vocês conseguem identificar proativamente quais clientes estão em risco de churn antes de eles cancelarem?\n\nCom a Zendesk Suite, equipes de CS de empresas similares passaram a cruzar dados de CSAT, histórico de tickets e engajamento para gerar health score automático — e reduziram churn evitável em 20%.\n\nVale um papo?" },
      { day: 4,  type: "email",     subject: "[{empresa}] Self-service reduz churn — dados do {setor}", body: "Olá,\n\nUm insight relevante para quem cuida de Customer Success em {setor}:\n\nClientes que resolvem problemas via self-service têm taxa de churn 30% menor do que clientes que precisam abrir ticket para resolver o mesmo problema.\n\nMotivo: self-service gera sensação de autonomia. Ticket aberto gera sensação de dependência e frustração.\n\nA {empresa} tem um Help Center estruturado hoje? Se não, consigo mostrar como montar um em 30 dias com a base de conhecimento da Zendesk.\n\nAbraço,\nBDR/SDR | Zendesk" },
      { day: 9,  type: "whatsapp",  subject: "WhatsApp — CS {empresa}", body: "Oi [Nome], BDR da Zendesk. {empresa} tem algum processo de health score para identificar clientes em risco antes de churnarem? Tenho um case relevante do {setor}. Posso te mandar?" },
      { day: 15, type: "email",     subject: "[{empresa}] Integração Zendesk + CRM de CS", body: "Olá,\n\nUm dos maiores problemas de times de CS em {setor}: os dados de atendimento ficam no helpdesk e os dados de conta ficam no CRM — e os dois não conversam.\n\nA Zendesk Suite integra nativamente com Salesforce, HubSpot e principais CRMs, trazendo histórico completo de tickets para dentro do contexto de conta.\n\nIsso significa que o CSM vê, em tempo real, se o cliente abriu ticket crítico, qual foi a resolução e como o CSAT está evoluindo.\n\nVale 20 minutos para ver isso na prática?\n\nAbraço,\nBDR/SDR | Zendesk" },
      { day: 20, type: "call",      subject: "Cold call — CS {empresa}", body: "Bom dia [Nome], BDR da Zendesk. Tenho 30 segundos?\n\nLigo porque {empresa} está investindo em CS em {setor} e a pergunta que abro com Heads de CS é: vocês conseguem identificar um cliente em risco de churn antes de ele pedir cancelamento?\n\n[ouvir]\n\nEntendi. A Zendesk cruza CSAT, histórico de tickets e engajamento para gerar esse alerta automático. Vale 20 minutos?" },
      { day: 26, type: "breakup",   subject: "Encerrando — {empresa}", body: "Olá,\n\nEncerro o contato por aqui. Se o tema de retenção, health score ou integração de CX com CS ganhar relevância, pode me chamar.\n\nAbraço,\nBDR/SDR | Zendesk" },
    ],
    ti: [
      { day: 1,  type: "email",     subject: "[{empresa}] API e integração Zendesk no {setor}", body: "Olá,\n\nChego até você porque {empresa} provavelmente tem um ecossistema de sistemas — ERP, CRM, e-commerce — que precisam conversar com a plataforma de atendimento.\n\nA Zendesk Suite tem API REST completa, marketplace com mais de 1.500 integrações nativas e webhooks flexíveis. Empresas de {setor} integraram com SAP, TOTVS, Salesforce e plataformas de e-commerce em média em 4 semanas.\n\nPosso te mostrar como funciona a arquitetura de integração?\n\nAbraço,\nBDR/SDR | Zendesk" },
      { day: 4,  type: "linkedin",  subject: "Migração de helpdesk — {empresa}", body: "Olá,\n\nVi que {empresa} usa uma ferramenta de atendimento atual. Uma pergunta técnica: qual a maior dor de integração que vocês enfrentam hoje?\n\nPergunto porque a migração para Zendesk é conduzida pelo nosso time de CS com script de migração de dados — histórico de tickets, base de conhecimento e configurações.\n\nMuitas empresas de {setor} reduziram o trabalho de TI na migração em mais de 60%. Vale um papo técnico?" },
      { day: 9,  type: "call",      subject: "Cold call — TI {empresa}", body: "Bom dia [Nome], BDR da Zendesk. Tenho 30 segundos?\n\n[PAUSA]\n\nLigo porque {empresa} pode estar usando uma ferramenta de atendimento que exige muito trabalho de TI para manter. Uma pergunta: quanto tempo por mês o time de TI de vocês gasta mantendo customizações e integrações do sistema de atendimento atual?" },
      { day: 14, type: "email",     subject: "[{empresa}] SLA de implementação Zendesk", body: "Olá,\n\nPara quem cuida de TI, o maior medo de trocar de plataforma é o tempo e risco de implementação.\n\nO que nosso time de CS garante:\n— Go-live em 30 dias para Mid Market\n— Migração de dados com script automatizado\n— Integrações com ERP e CRM em 4 semanas em média\n— Treinamento do time de atendimento incluído\n— Suporte dedicado nos primeiros 90 dias\n\nVale 20 minutos para ver o plano de implementação para {empresa}?\n\nAbraço,\nBDR/SDR | Zendesk" },
      { day: 20, type: "breakup",   subject: "Encerrando — {empresa}", body: "Olá,\n\nEncerro o contato por aqui. Se o tema de migração de plataforma de atendimento ou integração com sistemas internos ganhar prioridade, pode me chamar.\n\nAbraço,\nBDR/SDR | Zendesk" },
    ],
    cfo: [
      { day: 1,  type: "email",     subject: "[{empresa}] ROI de CX — calcular antes de decidir", body: "Olá,\n\nUma pergunta direta para um CFO de empresa de {setor}: qual é o custo mensal do time de atendimento da {empresa}, incluindo salários, ferramentas e overhead?\n\nNa média do mercado Mid Market brasileiro, esse custo varia de R$150k a R$600k/mês dependendo do tamanho do time.\n\nCom deflexão via self-service e IA da Zendesk, empresas similares reduziram esse custo em 30 a 40% em 6 meses. O payback costuma ser em menos de 4 meses.\n\nConsigo te mostrar o business case específico para {empresa} em 20 minutos.\n\nAbraço,\nBDR/SDR | Zendesk" },
      { day: 5,  type: "linkedin",  subject: "Custo de atendimento vs retenção — {empresa}", body: "Olá,\n\nTrabalho com CFOs de empresas de {setor} em um item que normalmente não está no radar do budget de tecnologia: a plataforma de atendimento ao cliente.\n\nO argumento que tem funcionado: o custo de perder 1% da base de clientes por atendimento ruim é muito maior do que o investimento em CX estruturado. Com a Zendesk, o payback é em menos de 4 meses.\n\nVale 20 minutos para te mostrar o business case?" },
      { day: 10, type: "email",     subject: "[{empresa}] Business case: CX como centro de lucro", body: "Olá,\n\nUm número que costuma mudar a perspectiva de CFOs em {setor}:\n\nCusto de adquirir um novo cliente: 5 a 7x maior do que reter um existente\nImpacto de 1% de redução no churn: ARR preservado diretamente\nDeflexão de 30% dos tickets: redução de 10 a 15 agentes equivalentes\n\nIsso significa que investir em CX não é custo — é redução de custo de aquisição e aumento de LTV.\n\nPosso montar o business case específico para {empresa} em 20 minutos de conversa.\n\nAbraço,\nBDR/SDR | Zendesk" },
      { day: 16, type: "call",      subject: "Cold call — CFO {empresa}", body: "Bom dia [Nome], BDR da Zendesk. Tenho 30 segundos?\n\nLigo porque tenho um business case específico para CFOs de empresas de {setor} — sobre redução de custo operacional de atendimento e ROI de CX.\n\nO número que costuma surpreender: deflexionar 30% dos tickets com self-service representa economia de 10 a 15 agentes equivalentes. Faz sentido eu te mostrar o cálculo aplicado à {empresa}?" },
      { day: 22, type: "breakup",   subject: "Encerrando — {empresa}", body: "Olá,\n\nÚltima mensagem. Entendo que o timing pode não ser o ideal.\n\nSe o tema de custo operacional de atendimento ou ROI de CX ganhar relevância na agenda da {empresa}, pode me chamar.\n\nAbraço,\nBDR/SDR | Zendesk" },
    ],
  },

  // ----------------------------------------------------------
  // 7. VARIANTS DE TOQUE ÚNICO (gerador dinâmico)
  // ----------------------------------------------------------
  oneTouchVariants: {
    email: [
      { subject: "[{nome}] Quanto custa um ticket sem resposta na {nome}?",           body: "Olá,\n\nUma pergunta direta para um {cargo} de empresa de {setor}:\n\nQual o impacto no churn quando um cliente da {nome} fica mais de 24h sem resposta?\n\nNa média do setor, cada 1% de queda no CSAT representa 2 a 3% de aumento no churn. Com a Zendesk Suite, empresas similares reduziram TMA em 35% e deflexionaram 28% dos tickets via self-service.\n\nConsigo te mostrar como em 20 minutos.\n\nAbraço,\nBDR/SDR | Zendesk" },
      { subject: "[{nome}] {nome} está deixando dinheiro na mesa com atendimento fragmentado", body: "Olá,\n\nEm conversas com {cargo}s de {setor}, o que mais ouço é:\n\n'Meu cliente manda mensagem no WhatsApp, depois liga, depois manda e-mail — e o agente não vê o histórico.'\n\nIsso acontece na {nome}?\n\nUnificamos todos os canais em uma única visão do cliente em 30 dias. Empresas de {setor} aumentaram CSAT em 25 pontos.\n\nFaz sentido conversar?\n\nAbraço,\nBDR/SDR | Zendesk" },
      { subject: "[{nome}] Benchmark de CX para {cargo}s de {setor}",                 body: "Olá,\n\nMontei um benchmark específico para {cargo}s de {setor} com o perfil da {nome}:\n\n— CSAT médio do setor: 72%\n— Custo por ticket: R$28\n— Deflexão via self-service: 18%\n\nCom Zendesk Suite, a média dessas empresas foi para CSAT 87%, R$17 por ticket e 31% de deflexão.\n\nQuer ver como {nome} se compara?\n\nAbraço,\nBDR/SDR | Zendesk" },
    ],
    linkedin: [
      { subject: "Uma pergunta sobre {angulo} na {nome}",                             body: "Olá,\n\nVi que você cuida de {angulo} na {nome}.\n\nQuando o volume de tickets sobe 30% em um mês, o que acontece com a operação de vocês?\n\nPergunto porque a resposta me diz muito sobre o momento ideal para a Zendesk entrar em cena.\n\nAbraço,\nBDR/SDR | Zendesk" },
      { subject: "{nome} + Zendesk — pergunta rápida",                               body: "Olá!\n\nUm insight sobre {setor}: empresas que perdem CSAT não percebem até o churn aparecer no relatório trimestral.\n\nVocê tem visibilidade disso em tempo real hoje na {nome}?\n\nAbraço,\nBDR/SDR | Zendesk" },
      { subject: "Vi algo sobre a {nome} que vale compartilhar",                      body: "Olá,\n\nPesquisando empresas de {setor} vi a {nome} crescendo — parabéns.\n\nEmpresa que cresce rápido tem um momento crítico onde o atendimento ou vira vantagem competitiva ou vira gargalo.\n\nJá vi dos dois lados. Vale 15 minutos?\n\nAbraço,\nBDR/SDR | Zendesk" },
    ],
    call: [
      { subject: "Script Cold Call {cargo} {nome}",                                   body: "Bom dia [Nome], BDR da Zendesk. 30 segundos?\n\n[PAUSA] Ótimo.\n\nLigo porque {nome} apareceu no nosso radar e imagino que como {cargo} você lida com {pain} no dia a dia.\n\nUma pergunta: quando um cliente manda mensagem pelo WhatsApp e depois liga, seu time consegue ver o histórico completo ou precisa pedir para ele repetir tudo?\n\n[ouvir]\n\nÉ exatamente esse problema que resolvemos. Vale 20 minutos essa semana?" },
      { subject: "Script Cold Call 2 — {cargo} {nome}",                              body: "[Nome], bom dia! BDR Zendesk. Rápido.\n\nTrabalhamos com {cargo}s de {setor} que têm uma dor específica: o time cresce mas o CSAT não melhora.\n\nIsso acontece na {nome}?\n\n[ouvir]\n\nPerfeito. Tenho um case de empresa idêntica que reverteu isso em 90 dias. Vale 20 minutos?" },
    ],
    whatsapp: [
      { subject: "WhatsApp {cargo} {nome}",                                           body: "Oi [Nome], BDR da Zendesk. Você cuida de {angulo} na {nome}? Tenho um dado de {setor} que acho que vai te surpreender sobre custo por ticket. Posso mandar?" },
      { subject: "WhatsApp 2 — {cargo} {nome}",                                      body: "Oi [Nome]! Vi que {nome} está crescendo em {setor} — parabéns. Empresas nessa fase têm um timing crítico com CX. Posso te contar em 2 minutos?" },
    ],
    breakup: [
      { subject: "Encerrando — {nome}",                                               body: "Olá,\n\nNão quero continuar incomodando.\n\nSe em algum momento {angulo} virar prioridade na {nome} — e normalmente é depois que o CSAT cai — pode me chamar.\n\nGuardo a {nome} no radar.\n\nAbraço,\nBDR/SDR | Zendesk" },
    ],
  },

  // ----------------------------------------------------------
  // 8. DADOS GERADOS NO MAPEAMENTO (buildDefaultData)
  // ----------------------------------------------------------
  buildData: {
    fitJustificativa: (company, setor) =>
      `${company} atua em ${setor}, vertical com alta demanda de suporte ao cliente e pressão crescente de CSAT, custo por ticket e escala do time de atendimento. Empresas nesse perfil com canais fragmentados ou ferramenta legada são o ICP principal da Zendesk Suite Mid Market.`,

    solucoes: [
      "Zendesk Support (ticketing omnichannel)",
      "Zendesk Messaging (chat e WhatsApp)",
      "Help Center com IA generativa",
      "Zendesk Explore (analytics e CSAT)",
      "IA e automação de tickets",
      "QA e automação de qualidade",
      "Workforce Management",
      "Zendesk Sell (CRM de vendas)",
    ],

    competidores: [
      "Freshdesk",
      "Salesforce Service Cloud",
      "HubSpot Service Hub",
      "ServiceNow CSM",
      "Intercom",
      "LivePerson",
      "TOTVS CRM",
      "Sistema interno legado",
    ],

    dores: [
      "Atendimento fragmentado — cliente repete o problema em cada canal",
      "SLA estourado por falta de automação e triagem inteligente",
      "CSAT baixo gerando churn evitável em carteira ativa",
      "Self-service inexistente ou desatualizado — ticket para tudo",
      "Analytics limitado — sem visibilidade de CSAT por canal e agente",
      "Custo por ticket alto — headcount crescendo mais rápido que o volume",
      "Time de CX sem ferramentas de QA — qualidade inconsistente entre agentes",
    ],

    triggers: [
      "Crescimento acelerado do time de atendimento — vagas abertas de agente/CX",
      "Alto volume de reclamações no Reclame Aqui ou redes sociais",
      "Abertura ou expansão de canal digital (WhatsApp, chat, e-commerce)",
      "Contratação recente de Head de CX, VP de Ops ou Diretor de Atendimento",
      "Insatisfação com Freshdesk, sistema legado ou ferramenta sem suporte",
      "Lançamento de novo produto ou expansão de base — aumento de demanda de suporte",
    ],

    stakeholdersDefault: (company) => [
      { cargo: "Head de CX / Diretor de Atendimento", angulo: "Decisor principal. Sente pressão de CSAT, SLA e custo. Quer escalar sem contratar mais agentes.",       prioridade: "PRIMARIO",   urgencia: "Alta",  email: "", linkedin: "", phone: "" },
      { cargo: "CEO / Diretor Geral",                  angulo: "Decisor econômico. Vê CX como alavanca de retenção. Quer ROI claro e redução de churn.",                prioridade: "PRIMARIO",   urgencia: "Alta",  email: "", linkedin: "", phone: "" },
      { cargo: "VP / Diretor de Operações",            angulo: "Co-decisor. Olha custo por ticket e eficiência. Quer redução de custo e SLA previsível.",                prioridade: "PRIMARIO",   urgencia: "Média" },
      { cargo: "Head de Customer Success",             angulo: "Aliado. Quer integração com CRM e visibilidade de clientes em risco de churn.",                          prioridade: "SECUNDARIO", urgencia: "Média" },
      { cargo: "Gerente de TI / CTO",                  angulo: "Avalia viabilidade técnica. Precisa de API robusta e suporte no processo de migração.",                  prioridade: "SECUNDARIO", urgencia: "Média" },
      { cargo: "CFO / Diretor Financeiro",             angulo: "Aprova budget. Quer ROI mensurável e comparativo de custo por ticket antes x depois.",                   prioridade: "TERCIARIO",  urgencia: "Baixa" },
    ],

    emails: (company, setor) => [
      { assunto: `${company} + Zendesk — atendimento que escala`,         corpo: `Olá,\n\nChego até você porque ${company} tem o perfil exato onde a Zendesk gera mais impacto em ${setor}. Empresas similares reduziram TMA em 35% e deflexionaram 28% dos tickets via self-service.\n\nTem disponibilidade para 20 minutos?\n\nAbraço,\nBDR/SDR | Zendesk` },
      { assunto: `[${company}] Quanto custa um ticket sem resposta?`,     corpo: `Olá,\n\nCada 1% de queda no CSAT representa 2 a 3% de aumento no churn. Com Zendesk Suite, empresas de ${setor} reduziram TMA em 35% e deflexionaram 28% dos tickets via self-service.\n\nPosso te mostrar em 20 minutos.\n\nAbraço,\nBDR/SDR | Zendesk` },
      { assunto: `Case: CSAT 68% → 89% em 90 dias — ${setor}`,           corpo: `Olá,\n\nAjudamos recentemente uma empresa de ${setor} a unificar todos os canais em 30 dias, aumentar CSAT de 68% para 89% e reduzir TMA em 35%.\n\nFaz sentido eu te contar como? 20 minutos essa semana.\n\nAbraço,\nBDR/SDR | Zendesk` },
    ],

    inmails: (company, setor) => [
      { assunto: `${company} + Zendesk — vale 20 minutos?`,              corpo: `Olá!\n\nEmpresas de ${setor} com o perfil da ${company} aumentaram CSAT em 25% e reduziram 40% do custo por ticket com Zendesk Suite. Vale um papo?\n\nAbraço,\nBDR/SDR | Zendesk` },
      { assunto: `Pergunta sobre atendimento na ${company}`,             corpo: `Vocês têm visibilidade em tempo real do CSAT e SLA em todos os canais hoje? Se não, tenho um benchmark do ${setor} relevante.\n\nAbraço,\nBDR/SDR | Zendesk` },
      { assunto: `${company} está crescendo — parabéns!`,               corpo: `Vi o crescimento da ${company} em ${setor}. Esse é o momento em que CX pode ser vantagem ou gargalo. Vale 15 minutos?\n\nAbraço,\nBDR/SDR | Zendesk` },
    ],

    whatsapps: (company, setor) => [
      `Oi [Nome], BDR da Zendesk. Vi que ${company} tem operação de atendimento em ${setor}. Empresas similares aumentaram CSAT em 25% e reduziram 40% do custo por ticket. Vale 15 minutos?`,
      `Oi [Nome]! BDR da Zendesk. Empresa de ${setor} com perfil da ${company} aumentou CSAT de 68% para 89% em 90 dias. Tenho o case. Posso te mandar?`,
      `Oi [Nome], BDR da Zendesk. Você cuida de CX na ${company}? Tenho algo sobre CSAT e custo por ticket que pode ser relevante. 15 minutos essa semana?`,
    ],

    coldCalls: (company, setor) => [
      `Bom dia [Nome], BDR da Zendesk. Tenho 30 segundos? [PAUSA] Ligo porque ${company} tem o perfil exato onde geramos impacto em ${setor}. Empresas similares reduziram 40% do custo e aumentaram CSAT em 25% em 90 dias. Quando você tem 20 minutos?`,
      `[Nome], bom dia! BDR da Zendesk. Pergunta direta: qual o CSAT atual de vocês e o que acontece com o SLA quando o volume de tickets sobe?`,
      `Oi [Nome], BDR da Zendesk. Empresa de ${setor} com perfil da ${company} aumentou CSAT em 25 pontos em 90 dias. Vale 2 minutos agora?`,
    ],

    spin: (company) => [
      `SITUAÇÃO: Como está o time de atendimento da ${company} — quantos agentes, quais canais e qual a ferramenta atual?`,
      `SITUAÇÃO: Qual a ferramenta de helpdesk que vocês usam e há quanto tempo?`,
      `SITUAÇÃO: Vocês visualizam CSAT, SLA e volume em tempo real em todos os canais?`,
      `SITUAÇÃO: Existe self-service ou base de conhecimento para os clientes resolverem sozinhos?`,
      `PROBLEMA: Com que frequência o SLA é estourado e qual o impacto no CSAT?`,
      `PROBLEMA: Quando o volume cresce, contratam mais agentes ou o SLA piora?`,
      `PROBLEMA: Os clientes precisam repetir o problema quando mudam de canal (WhatsApp → telefone → e-mail)?`,
      `PROBLEMA: O time de TI gasta tempo mantendo customizações na ferramenta atual?`,
      `IMPLICAÇÃO: Qual o impacto no churn quando um cliente fica insatisfeito com o atendimento?`,
      `IMPLICAÇÃO: Se o CSAT continuar caindo, qual o impacto na renovação e expansão da base?`,
      `IMPLICAÇÃO: Qual o custo mensal do time e vocês têm visibilidade do custo por ticket hoje?`,
      `NECESSIDADE: Se deflexionassem 30% dos tickets com IA e self-service, o que isso liberaria para o time?`,
      `NECESSIDADE: O que precisaria acontecer para CX subir de prioridade na ${company}?`,
      `NECESSIDADE: Se eu mostrasse como aumentar CSAT em 25 pontos em 90 dias sem aumentar headcount, valeria 20 minutos?`,
    ],

    objecoes: (company, setor) => [
      { objeção: "Já usamos Freshdesk e estamos satisfeitos",            resposta: "Entendo. A diferença na prática é na IA nativa, omnichannel real e analytics profundo com Explore. Vale ver lado a lado em 20 minutos?" },
      { objeção: "Não temos budget para isso agora",                     resposta: `Posso mostrar o ROI baseado no custo por ticket atual? Clientes de ${setor} costumam pagar a plataforma com a economia em 4 a 6 meses.` },
      { objeção: "Nossa TI não tem capacidade para implementar",         resposta: `Nosso CS conduz toda a implementação. Empresas de ${setor} ficaram no ar em média em 4 semanas sem demandar TI interna.` },
      { objeção: "Não é prioridade agora",                              resposta: "Quando CX ganha prioridade — é antes ou depois de uma queda de CSAT que impacta churn?" },
      { objeção: "Já usamos Salesforce Service Cloud",                   resposta: "O Salesforce é poderoso. Zendesk é mais rápida para implementar, mais intuitiva para o agente e mais barata para escalar." },
      { objeção: "Precisamos envolver mais áreas",                       resposta: `Posso te ajudar a preparar o business case com ROI e cases do ${setor} para facilitar a conversa interna.` },
      { objeção: "Já tentamos uma ferramenta e o time não adotou",      resposta: "Problema de UX da ferramenta. Zendesk tem NPS de 86 entre agentes. Posso mostrar a interface em 10 minutos?" },
      { objeção: "Preferimos desenvolver internamente",                  resposta: "Manter helpdesk interno custa em média 3x mais que a Zendesk em 2 anos. Posso mostrar o cálculo?" },
    ],

    proximosPassos: {
      ae: (company) => [
        `Mapear organograma no LinkedIn — Head de CX, CEO e VP de Ops da ${company}`,
        `Pesquisar vagas de agente CX e Analista de Atendimento abertas — sinal de crescimento`,
        `Verificar ${company} no Reclame Aqui — alto volume de reclamações é oportunidade`,
        `Buscar notícias de crescimento ou lançamento de produto da ${company}`,
        "Preparar business case com ROI da Zendesk Suite para o setor",
        "InMail ao Head de CX ou CEO com contexto do benchmark do setor",
      ],
      bdr: (company, setor) => [
        "Cold call focado em Head de CX e CEO com abertura pelo CSAT e custo por ticket",
        "WhatsApp com dado do setor sobre custo por ticket ou CSAT",
        "Sequência de 3 emails: Custo de Ticket, Case CSAT, FUP Final",
        "Monitorar LinkedIn — posts sobre CX, vagas abertas, mudança de liderança",
        "Eventos: Conarec, ExpoRelations, NRF Brasil, RD Summit",
      ],
      prazo: "Primeira abordagem em até 48 horas — prioridade Tier 1 se há sinal de crescimento, reclamações públicas ou vagas abertas de agente.",
    },

    noticiaFallbackUrl: (company) =>
      `https://google.com/search?q=${encodeURIComponent(company + " atendimento CX CSAT 2025")}`,
  },
};
