// ============================================================
// CLIENT CONFIG — El Canary Privacy & Ethics
// ============================================================
// Este arquivo e o UNICO lugar que muda entre clientes.
// Para migrar para um novo cliente: duplique este arquivo,
// renomeie para client-[nome].js e edite cada secao abaixo.
// O App.jsx le tudo daqui via import CLIENT_CONFIG.
// ============================================================

export const CLIENT_CONFIG = {

  // ----------------------------------------------------------
  // 1. IDENTIDADE DA EMPRESA CLIENTE
  // ----------------------------------------------------------
  empresa: {
    nome:        "El Canary Privacy & Ethics",
    assinatura:  "Consultor | El Canary Privacy & Ethics",
    site:        "https://elcanary.com",
    whatsapp:    "5521995150102",
    // Texto do rodape em PDFs e relatorios exportados
    rodape:      "Mais Pipe Beta , El Canary Privacy & Ethics",
    // Label do fit no card de conta
    fitLabel:    "Fit El Canary",
    // Chave interna usada para solucoes no objeto de dados
    solucoesKey: "solucoes_mgt",
  },

  // ----------------------------------------------------------
  // 2. UI — TEXTOS QUE APARECEM NA INTERFACE
  // ----------------------------------------------------------
  ui: {
    // Loading steps durante o mapeamento (Search view)
    loadingSteps: [
      { text: "Consultando fontes públicas com IA...",                         icon: "🔍" },
      { text: "Mapeando riscos de segurança e estrutura da empresa...",        icon: "🧭" },
      { text: "Gerando fit score e exposição a riscos cibernéticos...",        icon: "⚡" },
      { text: "Criando mensagens personalizadas por canal...",                 icon: "✉"  },
      { text: "Montando plano de prospecção focado em segurança e LGPD...",   icon: "🎯" },
    ],
    // Cards da home (apenas os que variam por cliente)
    cardBusca:  "Analise qualquer empresa e gere account mapping completo com riscos de segurança, dores, stakeholders e mensagens personalizadas.",
    cardSeqs:   "Gere cadências de 6 toques personalizadas por stakeholder com e-mail, InMail, WhatsApp e cold call — focados em segurança e privacidade.",
    statSeqs:   "6 perfis de segurança",
  },

  // ----------------------------------------------------------
  // 3. CLASSIFICACAO DE SETOR (ICP por setor)
  // Tier 1 = prioridade maxima de prospecção
  // ----------------------------------------------------------
  // ----------------------------------------------------------
  // 3B. ICP DEFAULT + CRITÉRIOS DE FIT (5 dimensões)
  // Estes são os valores padrão sugeridos ao usuário no modal
  // de Configuração de ICP. O usuário pode sobrescrever em localStorage.
  // ----------------------------------------------------------
  icpDefault: {
    segmento:     "Tecnologia / SaaS / Fintech / Saúde",
    porte:        "50–1000 colaboradores",
    faturamento:  "R$ 10M – R$ 500M/ano",
    regiao:       "Brasil",
    cargos:       "CISO, CTO, CEO, DPO, CFO",
    observacoes:  "Empresas sem CISO ou DPO dedicado, em crescimento acelerado ou expansão para mercados regulados.",
  },

  fitCriteria: [
    {
      id:    "porte",
      label: "Porte da empresa",
      desc:  "Colaboradores ou faturamento dentro da faixa ICP",
      peso:  2,
    },
    {
      id:    "setor",
      label: "Setor / Vertical",
      desc:  "Atua em vertical com alta exposição a risco cibernético (Fintech, Saúde, SaaS, Govtech)",
      peso:  2,
    },
    {
      id:    "maturidade",
      label: "Maturidade de Segurança",
      desc:  "Sem CISO ou DPO dedicado — gestão de segurança pelo time de TI",
      peso:  2,
    },
    {
      id:    "regulacao",
      label: "Exposição Regulatória",
      desc:  "Sujeita a LGPD, ISO 27001, regulações setoriais (BACEN, ANVISA, CFM)",
      peso:  2,
    },
    {
      id:    "stack",
      label: "Stack Tecnológica",
      desc:  "Usa Microsoft 365, cloud pública ou tem pipeline de desenvolvimento ativo",
      peso:  2,
    },
  ],

  setorConfig: {
    regexes: [
      { key: "isFintech",   pattern: /nubank|c6|inter|stone|pagseguro|pagbank|picpay|cielo|btg|xp|itau|bradesco|banco|financeira|seguradora|fintec/i,  label: "Financeiro / Fintech",          tier1: true  },
      { key: "isSaaS",      pattern: /totvs|linx|vtex|rdstation|senior|sankhya|contaazul|omie|piperun|agendor|software|tecnologia|saas|startup|plataforma/i, label: "Software / SaaS B2B",      tier1: true  },
      { key: "isHealth",    pattern: /hapvida|amil|unimed|dasa|fleury|einstein|afya|hospital|clinica|farmaceutica|pharma|healthtech|saude/i,             label: "Saúde / Healthtech",            tier1: true  },
      { key: "isGovtech",   pattern: /govtech|governo|publico|prefeitura|municipio|federal|concession|utilities|energia|saneamento/i,                    label: "Govtech / Setor Público",       tier1: false },
      { key: "isIndustria",  pattern: /industria|manufatura|fabrica|logistica|transporte|supply chain|varejo|retail|e-commerce/i,                        label: "Industrial / Varejo / Logística",tier1: false },
    ],
    fallbackLabel: "Empresarial / Mid Market",
    fallbackTier1: false,
  },

  // ----------------------------------------------------------
  // 4. STAKEHOLDER PROFILES
  // id deve ser unico e corresponder a chave em SEQUENCE_TEMPLATES
  // ----------------------------------------------------------
  stakeholderProfiles: [
    { id: "ciso",    label: "CISO / Diretor de Segurança",         angle: "maturidade de segurança e gestão de riscos cibernéticos",    pain: "sem CISO dedicado ou time interno insuficiente para cobrir todos os vetores de ameaça" },
    { id: "cto",     label: "CTO / VP de Tecnologia",              angle: "segurança na stack tecnológica e resiliência operacional",    pain: "vulnerabilidades no código, cloud e infraestrutura sem visibilidade ou processo de remediação" },
    { id: "ceo",     label: "CEO / Sócio-Diretor",                 angle: "risco reputacional, compliance e confiança do mercado",       pain: "um incidente cibernético ou multa da ANPD pode destruir reputação e paralisar o negócio" },
    { id: "dpo",     label: "DPO / Jurídico / Compliance",         angle: "conformidade LGPD, governança de IA e gestão de evidências",  pain: "adequação LGPD incompleta, ausência de DPO recorrente e risco de notificação da ANPD" },
    { id: "cfo",     label: "CFO / Diretor Financeiro",            angle: "ROI de segurança e custo de um incidente",                   pain: "dificuldade em justificar investimento em segurança sem métricas e benchmarks claros" },
    { id: "devlead", label: "Tech Lead / Head de Engenharia",      angle: "segurança no ciclo de desenvolvimento (DevSecOps)",          pain: "vulnerabilidades identificadas só em produção, sem processo de segurança no pipeline" },
  ],

  // ----------------------------------------------------------
  // 5. SEQUENCIAS POR PERFIL
  // Variaveis disponiveis: {empresa} {setor}
  // ----------------------------------------------------------
  sequenceTemplates: {
    ciso: [
      { day: 1,  type: "linkedin",  subject: "Maturidade de segurança na {empresa}", body: "Olá,\n\nUma pergunta direta para um CISO de empresa de {setor}: vocês têm um programa de gestão de vulnerabilidades com ciclo completo de remediação hoje?\n\nPergunto porque a maioria das empresas de {setor} que atendemos tinha ferramentas de scan — mas não tinha o processo que fecha o loop.\n\nA El Canary entrega EC Operations como serviço recorrente: varredura, priorização por risco real e acompanhamento de correção. Sem headcount interno adicional.\n\nVale 20 minutos?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 3,  type: "email",     subject: "[{empresa}] Pentest ou gestão contínua de vulnerabilidades?", body: "Olá,\n\nUma tensão que ouço muito de CISOs de {setor}: o pentest anual aponta tudo, mas 60% das vulnerabilidades continuam abertas 6 meses depois — porque não há processo de remediação estruturado.\n\nA El Canary resolve essa lacuna com EC Operations:\n\n— Varreduras contínuas com priorização por risco real (não só CVSS)\n— Acompanhamento de remediação com o time técnico\n— Pentest e Red Team para validar defesas sob ataque real\n— Segurança Microsoft 365 com configurações e políticas auditadas\n\nTudo as-a-service, sem contratar time interno.\n\nTem disponibilidade essa semana?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 6,  type: "call",      subject: "Cold call — CISO {empresa}", body: "Bom dia [Nome], consultor da El Canary Privacy & Ethics. Tenho 30 segundos?\n\n[PAUSA]\n\nLigo porque {empresa} atua em {setor} — vertical onde vemos a maior distância entre ferramentas de segurança implementadas e maturidade real do programa.\n\nUma pergunta: vocês têm ciclo completo de remediação de vulnerabilidades hoje, ou o backlog só cresce?\n\n[ouvir]\n\nEntendido. A El Canary entrega EC Operations as-a-service — o processo que fecha esse loop. Vale 20 minutos para eu mostrar como funciona?" },
      { day: 10, type: "email",     subject: "[{empresa}] Red Team vs realidade: suas defesas funcionam de verdade?", body: "Olá,\n\nUma pergunta que muda a perspectiva de CISOs de {setor}: suas defesas foram testadas por alguém tentando ativamente burlar?\n\nFerramentas de segurança são necessárias — mas não suficientes. O Cymulate (parceiro da El Canary) simula ataques reais contra sua infraestrutura e mostra exatamente onde suas defesas falham antes que um atacante real descubra.\n\nA El Canary entrega esse serviço integrado ao EC Operations, com acompanhamento contínuo.\n\nVale ver um diagnóstico do perfil da {empresa}?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 15, type: "whatsapp",  subject: "WhatsApp — CISO {empresa}", body: "Oi [Nome], El Canary. CISO de empresa de {setor} com porte similar a {empresa} reduziu tempo médio de remediação de 47 para 9 dias com nosso EC Operations. Posso te mandar o case?" },
      { day: 21, type: "breakup",   subject: "Última mensagem — {empresa}", body: "Olá,\n\nÚltima mensagem — prometo.\n\nSe gestão contínua de vulnerabilidades, Red Team ou segurança operacional entrarem na pauta da {empresa}, pode me chamar.\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
    ],
    cto: [
      { day: 1,  type: "linkedin",  subject: "Segurança no pipeline de desenvolvimento da {empresa}", body: "Olá,\n\nUma pergunta técnica para um CTO de {setor}: vocês identificam vulnerabilidades no código antes ou depois de ir para produção?\n\nPergunto porque o custo de correção em produção é 6x maior do que no desenvolvimento — e a Snyk (parceira da El Canary) resolve isso integrando segurança diretamente no pipeline.\n\nVale um papo de 20 minutos?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 3,  type: "email",     subject: "[{empresa}] DevSecOps na prática — sem travar o pipeline", body: "Olá,\n\nO maior medo de CTOs quando o assunto é DevSecOps: travar o pipeline de entrega.\n\nA El Canary implementa segurança no ciclo de desenvolvimento da {empresa} com Snyk — identificação e correção de vulnerabilidades em código, dependências e containers, integrado ao CI/CD existente.\n\nResultado: segurança sem atrito para o time de engenharia.\n\nQuero te mostrar em 20 minutos como empresas de {setor} implementaram isso. Tem disponibilidade?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 7,  type: "whatsapp",  subject: "WhatsApp — CTO {empresa}", body: "Oi [Nome], El Canary. CTO de empresa de {setor} implementou Snyk no pipeline em 2 semanas e reduziu vulnerabilidades críticas em produção em 70%. Posso te contar como?" },
      { day: 12, type: "email",     subject: "[{empresa}] Infraestrutura Microsoft 365 auditada?", body: "Olá,\n\nPara uma empresa de {setor} com stack Microsoft como a {empresa}: vocês têm certeza de que as configurações de segurança do M365 estão corretas?\n\nConfigurações incorretas de Exchange, SharePoint, Teams e Azure AD são responsáveis por mais de 40% dos incidentes em ambientes Microsoft.\n\nA El Canary faz auditoria e hardening do Microsoft 365 como parte do EC Operations — políticas, acessos, MFA, DLP e monitoramento.\n\nVale 20 minutos?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 17, type: "call",      subject: "Cold call — CTO {empresa}", body: "Bom dia [Nome], consultor da El Canary. Rápido.\n\nLigo porque {empresa} atua em {setor} e a pergunta que abro com CTOs nesse setor é: vocês têm visibilidade de vulnerabilidades críticas no código e na infraestrutura em tempo real?\n\n[ouvir]\n\nEntendido. A El Canary integra segurança no pipeline de desenvolvimento e na operação — sem contratar headcount. Vale 20 minutos?" },
      { day: 22, type: "breakup",   subject: "Encerrando — {empresa}", body: "Olá,\n\nEncerro o contato por aqui. Se segurança no pipeline, DevSecOps ou auditoria de infraestrutura Microsoft entrarem na agenda da {empresa}, pode me chamar.\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
    ],
    ceo: [
      { day: 1,  type: "linkedin",  subject: "Risco cibernético na {empresa} — você tem visibilidade?", body: "Olá,\n\nUm número que muda a perspectiva de CEOs de {setor}: o custo médio de um incidente de ransomware no Brasil em 2024 foi de R$ 6,2 milhões — entre paralisação, recuperação, multas e reputação.\n\nA pergunta é: a {empresa} está preparada para absorver esse impacto?\n\nA El Canary entrega segurança e privacidade as-a-service — sem você precisar contratar CISO, DPO ou time interno.\n\nVale 20 minutos?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 3,  type: "email",     subject: "[{empresa}] Um incidente cibernético pode paralisar {empresa} em horas", body: "Olá,\n\nPara um CEO de empresa de {setor}: o que acontece com a operação da {empresa} se os sistemas ficarem fora do ar por 48 horas?\n\nPergunto porque continuidade operacional é o ângulo que mais ressoa com CEOs — e é exatamente o que a El Canary protege.\n\nEC Governance: CISO as-a-Service com KPIs de segurança conectados ao negócio\nEC Operations: Gestão contínua de vulnerabilidades, Pentest e resposta a incidentes\nEC Ethics: DPO recorrente, LGPD e Governança de IA\n\nTudo sem contratar um time interno de segurança.\n\nTem disponibilidade essa semana?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 7,  type: "whatsapp",  subject: "WhatsApp — CEO {empresa}", body: "Oi [Nome], El Canary. CEO de empresa de {setor} com perfil similar a {empresa} implementou CISO as-a-Service e em 6 meses passou em auditoria de cliente enterprise que antes era barreira de entrada. Vale 15 minutos?" },
      { day: 12, type: "email",     subject: "[{empresa}] LGPD: {empresa} está pronta para uma notificação da ANPD?", body: "Olá,\n\nUma pergunta direta: se a ANPD notificasse a {empresa} hoje sobre um incidente de dados, vocês teriam todas as evidências de conformidade para responder em 72 horas?\n\nA maioria das empresas de {setor} não tem.\n\nA El Canary entrega EC Ethics: DPO recorrente, mapa de dados atualizado, políticas de privacidade e gestão de incidentes — tudo pronto para auditoria.\n\nVale 20 minutos para eu explicar como funciona?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 17, type: "call",      subject: "Cold call — CEO {empresa}", body: "Bom dia [Nome], consultor da El Canary Privacy & Ethics. Tenho 30 segundos?\n\n[PAUSA]\n\nLigo porque {empresa} atua em {setor} — um dos setores mais visados por ataques cibernéticos e mais expostos a notificações da ANPD no Brasil.\n\nUma pergunta: vocês têm CISO ou DPO dedicado hoje?\n\n[ouvir]\n\nEntendido. A El Canary entrega tudo isso as-a-service, sem contratar headcount. Vale 20 minutos?" },
      { day: 22, type: "breakup",   subject: "Última mensagem — {empresa}", body: "Olá,\n\nÚltima mensagem. Entendo que o timing pode não ser o ideal.\n\nSe segurança, LGPD ou continuidade operacional ganharem prioridade na agenda da {empresa}, pode me chamar.\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
    ],
    dpo: [
      { day: 1,  type: "linkedin",  subject: "Conformidade LGPD na {empresa} — DPO recorrente ou pontual?", body: "Olá,\n\nUma pergunta para quem cuida de compliance e privacidade em {setor}: a {empresa} tem DPO recorrente com gestão ativa de conformidade — ou a adequação foi feita uma vez e nunca mais revisitada?\n\nPergunto porque a LGPD exige evidências continuamente atualizadas, e 90% das empresas que passam por notificação da ANPD não as têm.\n\nA El Canary entrega DPO recorrente como serviço — com mapa de dados, gestão de incidentes e atualização contínua de políticas.\n\nVale um papo?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 3,  type: "email",     subject: "[{empresa}] Governança de IA: {empresa} já tem política definida?", body: "Olá,\n\nEm {setor}, o uso de IA generativa cresceu — e a maioria das empresas ainda não tem política de governança de IA aprovada.\n\nIsso gera risco duplo: exposição de dados sensíveis em ferramentas não auditadas e ausência de responsabilização quando algo dá errado.\n\nA El Canary entrega EC Ethics com Governança de IA: critérios de uso, controles técnicos e responsabilização — em conformidade com o Marco Legal da IA e as expectativas da ANPD.\n\nVale 20 minutos?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 8,  type: "call",      subject: "Cold call — DPO/Jurídico {empresa}", body: "Bom dia [Nome], consultor da El Canary Privacy & Ethics. Tenho 30 segundos?\n\n[PAUSA]\n\nLigo porque {empresa} atua em {setor} — um setor com alto volume de dados pessoais e exposição crescente a notificações da ANPD.\n\nUma pergunta: a {empresa} tem hoje um DPO ativo com evidências de conformidade atualizadas?\n\n[ouvir]\n\nEntendido. A El Canary entrega isso como serviço recorrente. Vale eu explicar como funciona?" },
      { day: 14, type: "email",     subject: "[{empresa}] Checklist LGPD: o que a ANPD vai perguntar", body: "Olá,\n\nSe a ANPD abrir uma investigação sobre a {empresa}, as primeiras perguntas serão:\n\n1. Vocês têm Aviso de Privacidade atualizado?\n2. O mapa de tratamento de dados pessoais está completo?\n3. Vocês têm registros de consentimento e base legal para cada tratamento?\n4. Houve algum incidente não reportado nos últimos 12 meses?\n\nA El Canary garante que a resposta para todas essas perguntas seja 'sim' — com evidências documentadas.\n\nVale 20 minutos?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 20, type: "whatsapp",  subject: "WhatsApp — DPO {empresa}", body: "Oi [Nome], El Canary. Empresa de {setor} com perfil da {empresa} passou em auditoria de cliente enterprise por ter DPO recorrente e evidências de conformidade LGPD prontas. Posso te contar em 10 minutos como funciona?" },
      { day: 26, type: "breakup",   subject: "Encerrando — {empresa}", body: "Olá,\n\nEncerro o contato por aqui. Se conformidade LGPD, DPO recorrente ou governança de IA ganharem urgência, pode me chamar.\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
    ],
    cfo: [
      { day: 1,  type: "email",     subject: "[{empresa}] O custo de um incidente cibernético vs o custo de preveni-lo", body: "Olá,\n\nUma pergunta objetiva para um CFO de empresa de {setor}: qual é o custo mensal que a {empresa} investe em segurança da informação — e quanto custaria um incidente de ransomware ou uma multa da ANPD?\n\nO custo médio de um ransomware no Brasil em 2024 foi de R$ 6,2M. O custo de um DPO recorrente + CISO as-a-Service da El Canary é uma fração disso.\n\nConsigo montar o business case específico para {empresa} em 20 minutos.\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 4,  type: "linkedin",  subject: "ROI de segurança para CFOs de {setor}", body: "Olá,\n\nTrabalho com CFOs de {setor} em um argumento que tem funcionado: o ROI de segurança não é sobre evitar um custo hipotético — é sobre habilitar novos contratos.\n\nEmpresas com evidências de maturidade em segurança fecham contratos enterprise que antes eram bloqueados por due diligence de segurança.\n\nA El Canary entrega esse nível de maturidade as-a-service, sem contratar headcount.\n\nVale 20 minutos?" },
      { day: 9,  type: "call",      subject: "Cold call — CFO {empresa}", body: "Bom dia [Nome], consultor da El Canary. Rápido.\n\nLigo porque tenho um business case específico para CFOs de {setor} — sobre o custo real de um incidente vs o investimento em segurança as-a-service.\n\nO número que costuma surpreender: empresas que implementam EC Governance com a El Canary passam em auditorias de clientes enterprise que antes bloqueavam contratos. Faz sentido eu mostrar o cálculo para {empresa}?" },
      { day: 14, type: "email",     subject: "[{empresa}] Seguro cyber: vocês estão cobrindo o risco certo?", body: "Olá,\n\nUm item que aparece cada vez mais na agenda de CFOs de {setor}: seguro de risco cibernético.\n\nO problema: seguradoras estão exigindo evidências de maturidade em segurança (políticas, gestão de vulnerabilidades, LGPD) antes de emitir — e os prêmios de empresas sem programa estruturado são 3x maiores.\n\nA El Canary entrega o programa de segurança que reduz prêmio de seguro e habilita cobertura adequada.\n\nVale 20 minutos?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 21, type: "breakup",   subject: "Encerrando — {empresa}", body: "Olá,\n\nEncerro o contato por aqui. Se ROI de segurança, redução de risco cibernético ou habilitação de contratos enterprise entrarem na pauta financeira da {empresa}, pode me chamar.\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
    ],
    devlead: [
      { day: 1,  type: "linkedin",  subject: "Segurança no pipeline da {empresa} — Snyk ou revisão manual?", body: "Olá,\n\nUma pergunta técnica para quem lidera engenharia em {setor}: como vocês identificam vulnerabilidades em dependências de código antes de ir para produção?\n\nPergunto porque na maioria dos times de {setor} que atendemos, a resposta é 'revisão manual' ou 'dependabot' — o que deixa vulnerabilidades críticas chegando em prod.\n\nA El Canary implementa Snyk integrado ao CI/CD de vocês — identificação e correção automatizada, sem travar o pipeline.\n\nVale um papo técnico?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 3,  type: "email",     subject: "[{empresa}] Vulnerabilidades em deps: quanto do backlog de vocês é crítico?", body: "Olá,\n\nUm dado que impacta times de engenharia de {setor}: em média, 40% das vulnerabilidades em dependências abertas são de severidade alta ou crítica — mas menos de 20% são remediadas em 30 dias.\n\nO motivo: sem priorização automática por contexto de uso real, tudo parece urgente e nada avança.\n\nA El Canary resolve isso com Snyk:\n— Priorização por risco real (não só CVSS)\n— Fix sugerido automaticamente com PR aberto\n— Integração com GitHub, GitLab ou Bitbucket em horas\n\nVale 20 minutos para ver na prática?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 8,  type: "call",      subject: "Cold call — Tech Lead {empresa}", body: "Bom dia [Nome], consultor da El Canary. Tenho 30 segundos?\n\n[PAUSA]\n\nLigo porque {empresa} atua em {setor} e o desafio que mais ouço de tech leads nesse setor é: vulnerabilidades chegando em produção porque o processo de segurança no desenvolvimento é manual e lento.\n\nA El Canary integra Snyk no pipeline de vocês em horas — sem atrito para o time. Vale 20 minutos técnico?" },
      { day: 13, type: "email",     subject: "[{empresa}] Containers e IaC: vocês escaneiam antes do deploy?", body: "Olá,\n\nPara times de engenharia que usam containers e IaC em {setor}: vocês escaneiam imagens Docker e templates Terraform antes do deploy?\n\nConfiguração incorreta de IaC é responsável por mais de 30% dos incidentes em cloud. O Snyk (parceiro El Canary) identifica esses problemas no próprio IDE ou no pipeline — antes de chegar no ambiente.\n\nVale eu mostrar em 20 minutos como funciona?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { day: 20, type: "breakup",   subject: "Encerrando — {empresa}", body: "Olá,\n\nEncerro o contato aqui. Se segurança no pipeline, Snyk ou DevSecOps entrarem na agenda de engenharia da {empresa}, pode me chamar.\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
    ],
  },

  // ----------------------------------------------------------
  // 6. VARIANTS DE TOQUE UNICO (gerador dinamico)
  // ----------------------------------------------------------
  oneTouchVariants: {
    email: [
      { subject: "[{nome}] {nome} tem visibilidade de risco cibernético em tempo real?",      body: "Olá,\n\nUma pergunta direta para um {cargo} de empresa de {setor}:\n\nA {nome} tem hoje um programa estruturado de gestão de vulnerabilidades — ou as ameaças só aparecem depois que o incidente acontece?\n\nA El Canary entrega segurança e privacidade as-a-service: CISO, DPO e operações de segurança sem contratar headcount interno.\n\nVale 20 minutos?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { subject: "[{nome}] O custo de um incidente vs o custo de preveni-lo em {setor}",      body: "Olá,\n\nEm conversas com {cargo}s de {setor}, a pergunta que mais provoca reflexão é:\n\nVocês estão protegidos — ou apenas com sorte?\n\nO custo médio de um ransomware no Brasil em 2024 foi de R$ 6,2 milhões. A El Canary entrega EC Governance + EC Operations as-a-service por uma fração disso.\n\nFaz sentido conversar?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { subject: "[{nome}] LGPD: {nome} está pronta para uma notificação da ANPD?",           body: "Olá,\n\nUm número que impacta {cargo}s de {setor}: empresas sem DPO recorrente e mapa de dados atualizado respondem a notificações da ANPD com 3x mais dificuldade — e com risco de multa de até R$ 50 milhões.\n\nA El Canary entrega DPO recorrente e conformidade LGPD contínua como serviço.\n\nVale verificar o nível de exposição da {nome}?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
    ],
    linkedin: [
      { subject: "Pergunta de segurança para o {cargo} da {nome}",                            body: "Olá,\n\nVi que você cuida de {angulo} na {nome}.\n\nUma pergunta direta: a {nome} tem CISO ou DPO dedicado hoje — ou a segurança é gerida pelo time de TI entre outras prioridades?\n\nPergunto porque empresas de {setor} nesse perfil são as mais visadas por ataques cibernéticos e autuações da ANPD.\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { subject: "{nome} — risco cibernético em {setor}",                                     body: "Olá!\n\nUm dado sobre {setor}: 68% das empresas que sofreram incidente cibernético não tinham programa estruturado de gestão de vulnerabilidades.\n\nA {nome} tem esse programa hoje?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
      { subject: "Vi algo sobre a {nome} que vale compartilhar",                              body: "Olá,\n\nPesquisando empresas de {setor} vi o trabalho da {nome} — empresa em crescimento e com stack tecnológica robusta.\n\nEmpresa que cresce rápido é exatamente o perfil que mais precisa de segurança estruturada — e o mais visado.\n\nVale 15 minutos?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
    ],
    call: [
      { subject: "Script Cold Call {cargo} {nome}",                                           body: "Bom dia [Nome], consultor da El Canary Privacy & Ethics. Tenho 30 segundos?\n\n[PAUSA] Ótimo.\n\nLigo porque {nome} atua em {setor} — um dos setores mais visados por ataques cibernéticos e notificações da ANPD no Brasil.\n\nUma pergunta direta: vocês têm CISO ou DPO dedicado hoje?\n\n[ouvir]\n\nEntendido. A El Canary entrega tudo isso as-a-service — sem contratar headcount. Faz sentido eu te explicar como funciona?" },
      { subject: "Script Cold Call 2 — {cargo} {nome}",                                       body: "[Nome], bom dia! El Canary. Rápido.\n\nTrabalhamos com {cargo}s de {setor} em uma pergunta específica: se a {nome} sofresse um ransomware hoje, em quanto tempo vocês voltariam a operar?\n\n[ouvir]\n\nPerfeito. É exatamente essa previsibilidade que o EC Operations garante. Vale 20 minutos?" },
    ],
    whatsapp: [
      { subject: "WhatsApp {cargo} {nome}",                                                   body: "Oi [Nome], El Canary Privacy & Ethics. Você cuida de {angulo} na {nome}? Empresa de {setor} com perfil similar implementou CISO as-a-Service e passou em auditoria enterprise que antes bloqueava contratos. Posso te contar?" },
      { subject: "WhatsApp 2 — {cargo} {nome}",                                               body: "Oi [Nome]! Vi que {nome} está crescendo em {setor}. Empresas nessa fase são as mais visadas por ataques — e as menos preparadas. A El Canary entrega segurança as-a-service. Posso te explicar em 2 minutos?" },
    ],
    breakup: [
      { subject: "Encerrando — {nome}",                                                       body: "Olá,\n\nNão quero continuar incomodando.\n\nSe segurança da informação, LGPD ou maturidade cibernética ganharem prioridade na agenda da {nome}, pode me chamar.\n\nGuardo a {nome} no radar.\n\nAbraço,\nConsultor | El Canary Privacy & Ethics" },
    ],
  },

  // ----------------------------------------------------------
  // 7. DADOS GERADOS NO MAPEAMENTO (buildDefaultData)
  // ----------------------------------------------------------
  buildData: {
    fitJustificativa: (company, setor) =>
      `${company} atua em ${setor}, vertical com alta exposição a risco cibernético, dados pessoais sensíveis e obrigações de compliance (LGPD, ISO 27001, regulações setoriais). Empresas nesse perfil sem CISO ou DPO dedicado são o ICP principal da El Canary — que entrega segurança e privacidade as-a-service.`,

    solucoes: [
      "EC Governance (CISO as a Service, SGSI, KPIs)",
      "EC Operations (Gestão de Vulnerabilidades, Pentest, Red Team)",
      "EC Ethics (DPO recorrente, LGPD, Governança de IA)",
      "Snyk (Segurança no ciclo de desenvolvimento)",
      "Acronis (Backup e continuidade operacional)",
      "Microsoft 365 Security (hardening e políticas)",
      "Cymulate (simulação de ataques reais)",
      "ECSF: El Canary Security Foundations (educação)",
    ],

    competidores: [
      "Consultorias de segurança tradicionais",
      "Big Four (Deloitte, PwC, EY, KPMG)",
      "CISOs contratados internamente",
      "Tempest Security",
      "BugHunt",
      "Axur",
      "Stefanini InfoSecurity",
    ],

    dores: [
      "Ausência de CISO dedicado — segurança gerida pelo time de TI entre outras prioridades",
      "Programa de gestão de vulnerabilidades inexistente ou sem ciclo completo de remediação",
      "Conformidade LGPD incompleta — adequação pontual sem DPO recorrente e evidências atualizadas",
      "Exposição a ransomware sem plano de resposta a incidentes testado",
      "Governança de IA ausente — uso de ferramentas generativas sem política ou controle",
      "Segurança Microsoft 365 com configurações incorretas e acessos não auditados",
      "Vulnerabilidades chegando em produção por falta de DevSecOps no pipeline",
    ],

    triggers: [
      "Contratação recente de CISO, DPO ou profissional de segurança — sinal de maturidade emergente",
      "Incidente cibernético recente ou notícia de ataque em concorrente do setor",
      "Notificação da ANPD ou processo relacionado a privacidade de dados",
      "Crescimento acelerado — mais dados, mais usuários, maior superfície de ataque",
      "Auditoria de cliente enterprise exigindo evidências de segurança e LGPD",
      "Expansão para mercado regulado (financeiro, saúde, govtech) com requisitos de compliance",
      "Lançamento de produto com dados pessoais sensíveis ou pagamentos online",
    ],

    stakeholdersDefault: (company) => [
      { cargo: "CISO / Diretor de Segurança",   angulo: "Decisor técnico principal. Quer maturidade operacional, métricas e programa estruturado.",          prioridade: "PRIMARIO",    urgencia: "Alta",   email: "", linkedin: "", phone: "" },
      { cargo: "CEO / Sócio-Diretor",            angulo: "Decisor econômico. Vê segurança como risco reputacional e habilitador de contratos enterprise.",     prioridade: "PRIMARIO",    urgencia: "Alta",   email: "", linkedin: "", phone: "" },
      { cargo: "CTO / VP de Tecnologia",         angulo: "Co-decisor técnico. Quer segurança no pipeline e infraestrutura sem travar o time.",                 prioridade: "PRIMARIO",    urgencia: "Alta"  },
      { cargo: "DPO / Jurídico / Compliance",    angulo: "Responsável pela LGPD e governança. Precisa de evidências contínuas para responder à ANPD.",         prioridade: "SECUNDARIO",  urgencia: "Média" },
      { cargo: "CFO / Diretor Financeiro",       angulo: "Aprova budget. Quer ROI claro — custo do incidente vs investimento em segurança.",                   prioridade: "TERCIARIO",   urgencia: "Baixa" },
    ],

    emails: (company, setor) => [
      { assunto: `${company} — vocês têm CISO ou DPO dedicado hoje?`,                             corpo: `Olá,\n\nUma pergunta direta: a ${company} tem CISO ou DPO dedicado — ou a segurança é gerida pelo time de TI entre outras prioridades?\n\nEmpresas de ${setor} sem programa estruturado de segurança são as mais visadas por ataques cibernéticos e notificações da ANPD.\n\nA El Canary entrega EC Governance + EC Operations + EC Ethics as-a-service — sem contratar headcount interno.\n\nTem disponibilidade?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics` },
      { assunto: `[${company}] O custo de um ransomware vs o custo de preveni-lo`,                corpo: `Olá,\n\nO custo médio de um incidente de ransomware no Brasil em 2024 foi de R$ 6,2 milhões.\n\nA El Canary entrega o programa completo de segurança as-a-service por uma fração desse valor:\n\n— EC Governance: CISO as-a-Service com KPIs de segurança\n— EC Operations: Gestão contínua de vulnerabilidades e Pentest\n— EC Ethics: DPO recorrente e conformidade LGPD\n\nVale 20 minutos?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics` },
      { assunto: `Serviços EC — como a El Canary entrega segurança para empresas de ${setor}`,    corpo: `Olá,\n\nDeixa eu ser objetivo sobre o que a El Canary faz para empresas de ${setor} como a ${company}:\n\n1. EC GOVERNANCE: CISO as-a-Service, SGSI, KPIs de maturidade e gestão de riscos\n2. EC OPERATIONS: Varredura contínua de vulnerabilidades, Pentest, Red Team e segurança M365\n3. EC ETHICS: DPO recorrente, adequação LGPD, Governança de IA e Legal & Compliance\n\nTudo sem contratar um time interno. Equipe de CISOs, auditores e advogados dedicada.\n\nFaz sentido?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics` },
    ],

    inmails: (company, setor) => [
      { assunto: `Pergunta de segurança para a ${company}`,                                        corpo: `Olá!\n\nEmpresa de ${setor} com perfil similar a ${company} implementou CISO as-a-Service com a El Canary e em 6 meses passou em due diligence de cliente enterprise que antes era barreira de entrada. Vale um papo?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics` },
      { assunto: `LGPD e segurança as-a-service em ${setor} — como funciona`,                     corpo: `Vocês têm DPO recorrente e evidências de conformidade LGPD prontas para responder à ANPD em 72 horas? É uma pergunta que muda a conversa. Posso te explicar como a El Canary garante isso.\n\nAbraço,\nConsultor | El Canary Privacy & Ethics` },
      { assunto: `${company} — risco cibernético identificado em ${setor}`,                       corpo: `Vi que ${company} atua em ${setor}. Esse setor tem alta exposição a ataques cibernéticos e obrigações de compliance que exigem programa estruturado. A El Canary entrega isso as-a-service. Vale 15 minutos?\n\nAbraço,\nConsultor | El Canary Privacy & Ethics` },
    ],

    whatsapps: (company, setor) => [
      `Oi [Nome], El Canary Privacy & Ethics. ${company} tem CISO ou DPO dedicado hoje? Empresas de ${setor} sem programa estruturado de segurança são as mais visadas. A El Canary entrega isso as-a-service. Posso te contar como?`,
      `Oi [Nome]! El Canary. Empresa de ${setor} com perfil da ${company} passou em auditoria enterprise de segurança depois de 6 meses com nosso EC Governance. Posso te mandar os detalhes?`,
      `Oi [Nome], El Canary. Você é o responsável por segurança ou compliance na ${company}? Tenho um diagnóstico de exposição a risco para empresas de ${setor} que pode ser relevante. Posso te enviar?`,
    ],

    coldCalls: (company, setor) => [
      `Bom dia [Nome], consultor da El Canary Privacy & Ethics. Tenho 30 segundos? [PAUSA] Ligo porque ${company} atua em ${setor} — um dos setores mais visados por ataques cibernéticos e notificações da ANPD. Uma pergunta: vocês têm CISO ou DPO dedicado hoje? [ouvir] Entendido. A El Canary entrega tudo isso as-a-service — sem contratar headcount. Faz sentido eu te explicar?`,
      `[Nome], bom dia! El Canary. Pergunta direta: se a ${company} sofresse um ransomware hoje, em quanto tempo vocês voltariam a operar? [ouvir] É exatamente essa previsibilidade que o EC Operations garante. Vale 20 minutos?`,
      `Oi [Nome], El Canary Privacy & Ethics. Empresa de ${setor} com perfil da ${company} — sem CISO interno — é o ICP perfeito para nosso serviço as-a-service. Posso te mostrar em 15 minutos como funciona?`,
    ],

    spin: (company) => [
      `SITUAÇÃO: A ${company} tem CISO, DPO ou profissional de segurança dedicado hoje — ou a responsabilidade fica com o time de TI?`,
      `SITUAÇÃO: Qual a principal plataforma de identidade e colaboração de vocês — Microsoft 365, Google Workspace, ou outra?`,
      `SITUAÇÃO: A ${company} realiza algum tipo de scan de vulnerabilidades ou pentest periódico?`,
      `SITUAÇÃO: Já houve algum incidente de segurança ou vazamento de dados na ${company} nos últimos 2 anos?`,
      `PROBLEMA: Como vocês identificam e priorizam vulnerabilidades críticas na infraestrutura hoje?`,
      `PROBLEMA: A adequação LGPD da ${company} foi feita como projeto pontual ou há gestão contínua de conformidade?`,
      `PROBLEMA: O time de desenvolvimento tem processo de segurança no pipeline — ou vulnerabilidades chegam em produção?`,
      `PROBLEMA: Vocês conseguiriam responder a uma notificação da ANPD em 72 horas com todas as evidências de conformidade?`,
      `IMPLICAÇÃO: Se a ${company} sofresse um ransomware agora, qual o impacto na operação e quanto tempo para recuperar?`,
      `IMPLICAÇÃO: Um cliente enterprise pediu evidências de segurança e LGPD para assinar contrato — vocês teriam o que apresentar?`,
      `IMPLICAÇÃO: Sem CISO dedicado, quem toma a decisão de parar um ataque em andamento na ${company}?`,
      `NECESSIDADE: Se a El Canary entregasse CISO, DPO e operações de segurança sem contratar headcount, o que isso liberaria para o time interno?`,
      `NECESSIDADE: Qual seria o valor de passar em uma due diligence de segurança de um cliente enterprise que hoje é uma barreira?`,
      `NECESSIDADE: Se eu mostrasse como a ${company} pode ter maturidade de segurança em 90 dias sem contratar time interno, valeria 20 minutos?`,
    ],

    objecoes: (company, setor) => [
      { objeção: "Já temos um time de TI que cuida disso",              resposta: "Entendo — é o cenário mais comum. A diferença é que TI gerencia operações; segurança é uma disciplina separada que exige CISOs, auditores e advogados dedicados. A El Canary complementa o time de TI sem competir com ele." },
      { objeção: "Não temos budget para isso agora",                    resposta: `Posso mostrar o business case? O custo médio de um ransomware no Brasil foi de R$ 6,2M em 2024. O EC Governance + Operations da El Canary custa uma fração disso. Clientes de ${setor} tipicamente justificam o investimento com o primeiro contrato enterprise habilitado.` },
      { objeção: "Já somos conformes com a LGPD",                       resposta: "Conformidade pontual é diferente de gestão contínua. A ANPD exige evidências atualizadas — mapa de dados, registros de consentimento, políticas revisadas. Vocês têm tudo isso pronto para apresentar em 72 horas?" },
      { objeção: "Não é prioridade agora",                              resposta: "Faz sentido. Segurança raramente é prioridade — até o dia que vira emergência. A pergunta é: vocês preferem estruturar isso agora, no ritmo de vocês, ou depois de um incidente?" },
      { objeção: "Já temos um parceiro de segurança",                   resposta: "Ótimo — vocês podem me dizer o que ele entrega? A maioria dos parceiros entrega ferramentas ou projetos pontuais. A El Canary entrega o programa contínuo — CISO, DPO, operações e educação — tudo integrado." },
      { objeção: "Precisamos envolver o CISO / CTO / CEO",              resposta: `Perfeito — é exatamente o que recomendamos. Posso te ajudar a preparar um diagnóstico de exposição da ${company} para levar para a conversa com eles?` },
      { objeção: "Quanto custa?",                                       resposta: `Depende do escopo — EC Governance, EC Operations e EC Ethics têm planos modulares. O que faz mais sentido é entender o nível de exposição da ${company} primeiro. Posso fazer um diagnóstico e apresentar uma proposta específica.` },
      { objeção: "Preferimos contratar um CISO interno",                resposta: "Faz sentido para algumas empresas. Mas um CISO sênior custa entre R$ 25k e R$ 50k/mês — mais encargos — e ainda não cobre DPO, auditores e advogados. A El Canary entrega o escritório completo por um valor fixo previsível." },
    ],

    proximosPassos: {
      ae: (company) => [
        `Mapear decisores no LinkedIn — CISO, CTO, CEO e DPO/Jurídico da ${company}`,
        `Pesquisar vagas de segurança, compliance ou privacidade abertas na ${company} — sinal de maturidade emergente`,
        `Buscar notícias de incidente cibernético, crescimento ou expansão da ${company} no Google`,
        `Verificar se ${company} menciona LGPD, ISO 27001 ou segurança no site ou materiais públicos`,
        "Preparar diagnóstico de exposição com base no setor e porte",
        "InMail ao CISO/CTO ou CEO com ângulo de risco cibernético e LGPD",
      ],
      bdr: (company, setor) => [
        "Cold call focado em CISO, CTO e CEO com abertura pelo risco cibernético do setor",
        "WhatsApp com pergunta direta sobre CISO/DPO dedicado",
        "Sequência de 3 emails: Pergunta CISO/DPO, Custo do incidente, Serviços EC",
        "Monitorar LinkedIn — posts sobre segurança, LGPD, incidentes ou contratações de segurança",
        "Eventos: Security Leaders, Mind The Sec, CIAB FEBRABAN, HIMSS, RD Summit",
      ],
      prazo: "Primeira abordagem em até 48 horas — prioridade Tier 1 se há sinal de crescimento, incidente recente ou auditoria pendente.",
    },

    noticiaFallbackUrl: (company) =>
      `https://google.com/search?q=${encodeURIComponent(company + " seguranca privacidade LGPD 2025")}`,
  },
};
