// ============================================================
// CLIENT CONFIG — MGT Gestão Tributária
// ============================================================
// Para ativar: no App.jsx, troque o import para:
//   import { CLIENT_CONFIG } from "./src/config/client-mgt.js";
// ============================================================

export const CLIENT_CONFIG = {

  empresa: {
    nome:        "MGT Gestão Tributária",
    assinatura:  "Consultor | MGT Gestão Tributária",
    site:        "https://mgt3r.com.br",
    whatsapp:    "5551900000000",
    rodape:      "Mais Pipe Beta , MGT Gestão Tributária",
    fitLabel:    "Fit MGT",
    solucoesKey: "solucoes_mgt",
  },

  ui: {
    loadingSteps: [
      { text: "Consultando fontes públicas com IA...",                              icon: "🔍" },
      { text: "Mapeando estrutura da empresa e histórico tributário...",             icon: "🧭" },
      { text: "Gerando fit score e oportunidades de recuperação fiscal...",          icon: "⚡" },
      { text: "Criando mensagens personalizadas por canal...",                      icon: "✉"  },
      { text: "Montando plano de prospecção focado em gestão tributária...",        icon: "🎯" },
    ],
    cardBusca: "Analise qualquer empresa e gere account mapping completo com oportunidades tributárias, dores, stakeholders e mensagens personalizadas.",
    cardSeqs:  "Gere cadências de 6 toques personalizadas por stakeholder com e-mail, InMail, WhatsApp e cold call — focados em recuperação tributária e metodologia 3Rs.",
    statSeqs:  "6 perfis tributários",
  },

  setorConfig: {
    regexes: [
      { key: "isFarma",    pattern: /farmaceutica|pharma|laboratorio|generico|medicamento|saude|hospital|clinica|hapvida|amil|unimed|dasa|fleury/i,                            label: "Farmacêutico / Saúde",            tier1: true  },
      { key: "isFintech",  pattern: /nubank|c6|inter|stone|pagseguro|pagbank|picpay|cielo|btg|xp|itau|bradesco|banco|financeira|seguradora/i,                                 label: "Financeiro / Fintech",            tier1: true  },
      { key: "isIndustria",pattern: /industria|manufatura|fabrica|producao|metalurgia|siderurgia|quimica|plastico|embalagem|alimento|bebida|frigorifico|agro/i,               label: "Industrial / Manufatura",         tier1: true  },
      { key: "isComercio", pattern: /varejo|atacado|distribuidora|loja|supermercado|farmacia|drogaria|magazine|lojista/i,                                                     label: "Comércio / Varejo",               tier1: false },
      { key: "isSaaS",     pattern: /totvs|linx|vtex|rdstation|senior|sankhya|contaazul|omie|piperun|agendor|software|tecnologia|saas/i,                                     label: "Software / SaaS B2B",             tier1: false },
      { key: "isServicos", pattern: /servicos|consultoria|contabilidade|advocacia|escritorio|imobiliaria|construtora|engenharia|logistica|transporte/i,                       label: "Serviços / Consultoria",          tier1: false },
    ],
    fallbackLabel: "Empresarial / Mid Market",
    fallbackTier1: false,
  },

  stakeholderProfiles: [
    { id: "ceo",      label: "CEO / Sócio-Diretor",                   angle: "caixa, crescimento e carga tributária",          pain: "pagando impostos a maior sem saber, carga tributária comprimindo margem" },
    { id: "cfo",      label: "CFO / Diretor Financeiro",              angle: "redução de carga tributária e fluxo de caixa",   pain: "IRPJ/CSLL/PIS/COFINS elevados sem revisão crítica nos últimos anos" },
    { id: "contabil", label: "Contador / Controller",                 angle: "compliance fiscal e oportunidades de crédito",   pain: "histórico tributário complexo, risco de passivo não mapeado" },
    { id: "ops",      label: "Diretor de Operações",                  angle: "custo operacional e eficiência financeira",      pain: "carga tributária como custo fixo pesado sem questionamento" },
    { id: "juridico", label: "Diretor Jurídico / Advogado Interno",   angle: "compliance tributário e gestão de passivos",     pain: "risco de autuação fiscal e passivos tributários não provisionados" },
    { id: "csuite",   label: "Conselho / Investidor / Holding",       angle: "retorno sobre capital e estrutura societária",   pain: "tributação ineficiente na estrutura holding/subsidiárias" },
  ],

  sequenceTemplates: {
    ceo: [
      { day: 1,  type: "linkedin", subject: "Carga tributária da {empresa} em {setor}",                           body: "Olá, tudo bem?\n\nComo CEO de uma empresa de {setor}, você provavelmente paga entre 30% e 45% do faturamento em impostos.\n\nA pergunta que nenhum contador faz: quanto disso vocês pagaram a mais nos últimos 5 anos?\n\nA MGT já recuperou mais de R$ 1 bilhão em créditos tributários para empresas exatamente nesse perfil — sem custo inicial, sem compromisso.\n\nVale uma conversa de 15 minutos?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { day: 3,  type: "email",    subject: "[{empresa}] Vocês já revisaram o histórico fiscal dos últimos 5 anos?", body: "Olá,\n\nUma pergunta direta: a {empresa} já fez uma revisão crítica do histórico tributário dos últimos 5 anos?\n\nNa maioria das empresas de {setor}, encontramos:\n\n— IRPJ e CSLL calculados com base de cálculo incorreta\n— PIS/COFINS com créditos não aproveitados\n— Tributos pagos em duplicidade ou com alíquota maior que o devido\n\nO processo da MGT levanta esse histórico em 5 dias, gratuitamente, sem compromisso.\n\nTem disponibilidade essa semana?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { day: 7,  type: "whatsapp", subject: "WhatsApp — CEO {empresa}",                                           body: "Oi [Nome], consultor da MGT. Direto ao ponto: empresas de {setor} com o porte da {empresa} costumam ter entre R$ 200k e R$ 2M em créditos tributários não aproveitados. A avaliação é gratuita. Posso te explicar em 5 minutos como funciona?" },
      { day: 12, type: "email",    subject: "[{empresa}] Metodologia 3Rs — como funciona na prática",             body: "Olá,\n\nDeixa eu ser objetivo sobre o que a MGT faz:\n\n1) REORGANIZAR: revisamos o regime tributário da {empresa} e identificamos se o enquadramento atual é o mais eficiente\n2) RECUPERAR: levantamos tributos pagos a maior nos últimos 5 anos e pedimos a restituição\n3) REDUZIR: estruturamos o pagamento futuro para que vocês arquem apenas com o que é devido por lei\n\nA avaliação inicial do CNPJ é gratuita e leva 5 dias. Já administramos mais de R$ 5 bilhões em créditos no Brasil.\n\nQuer agendar?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { day: 17, type: "call",     subject: "Cold call — CEO {empresa}",                                          body: "Bom dia [Nome], consultor da MGT Gestão Tributária. Tenho 30 segundos?\n\n[PAUSA]\n\nLigo porque {empresa} atua em {setor} e esse é um dos setores onde mais encontramos tributos pagos a maior nos últimos 5 anos.\n\nUma pergunta direta: vocês já fizeram uma revisão crítica do histórico fiscal de vocês?\n\n[ouvir]\n\nEntendi. A nossa avaliação é gratuita, leva 5 dias e vocês só pagam se encontrarmos crédito real. Faz sentido eu te contar como funciona?" },
      { day: 22, type: "breakup",  subject: "Última mensagem — {empresa}",                                        body: "Olá,\n\nVou respeitar o seu tempo — essa é minha última mensagem.\n\nSe em algum momento a conversa sobre redução de carga tributária ou recuperação de impostos pagos a maior ganhar espaço na agenda da {empresa}, pode me chamar.\n\nA avaliação continua gratuita e sem compromisso.\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
    ],
    cfo: [
      { day: 1,  type: "email",    subject: "[{empresa}] Créditos tributários não aproveitados em {setor}",       body: "Olá,\n\nUma pergunta objetiva para um CFO de empresa de {setor}: quando foi a última vez que a {empresa} fez uma revisão crítica de PIS, COFINS, IRPJ e CSLL dos últimos 5 anos?\n\nNa MGT, identificamos em média entre 8% e 15% do faturamento em créditos tributários não aproveitados em empresas do porte da {empresa}.\n\nO processo é simples: avaliamos o CNPJ em 5 dias, sem custo, sem compromisso.\n\nTem 20 minutos essa semana?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { day: 4,  type: "linkedin", subject: "CFO da {empresa} — pergunta sobre carga tributária",                 body: "Olá,\n\nComo CFO de empresa de {setor}, você provavelmente tem uma visão clara da carga tributária da {empresa}.\n\nMas uma pergunta mais específica: vocês já revisaram se o regime tributário atual (Lucro Real, Presumido ou Simples) ainda é o mais eficiente para o momento e porte de hoje?\n\nÉ uma revisão que fazemos gratuitamente e que já gerou mais de R$ 1 bilhão em créditos e descontos para nossos clientes.\n\nVale um papo?" },
      { day: 8,  type: "call",     subject: "Cold call — CFO {empresa}",                                          body: "Bom dia [Nome], consultor da MGT. Tenho 30 segundos?\n\n[PAUSA]\n\nLigo porque trabalho com CFOs de empresas de {setor} e a pergunta que sempre abro é: vocês têm certeza que não pagaram impostos a maior nos últimos 5 anos?\n\n[ouvir]\n\nEntendi. A MGT faz essa avaliação gratuitamente em 5 dias. Já recuperamos mais de R$ 1 bilhão para empresas similares a {empresa}. Faz sentido eu explicar como funciona?" },
      { day: 13, type: "email",    subject: "[{empresa}] Business case: recuperação tributária sem risco",         body: "Olá,\n\nUm modelo que costuma fazer sentido para CFOs:\n\nSe a {empresa} tem faturamento de R$ 10M/ano, é típico encontrarmos entre R$ 500k e R$ 1,5M em créditos tributários dos últimos 5 anos.\n\nO processo da MGT:\n— Avaliação gratuita do CNPJ em 5 dias\n— Honorários só sobre o que recuperamos (sem recuperação, sem cobrança)\n— Média de 90 dias para início da restituição\n\nNão é custo — é fluxo de caixa positivo.\n\nConsigo fazer o cálculo estimado para {empresa} essa semana.\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { day: 19, type: "whatsapp", subject: "WhatsApp — CFO {empresa}",                                           body: "Oi [Nome], MGT Gestão Tributária. Uma pergunta rápida: {empresa} já aproveitou todos os créditos de PIS/COFINS disponíveis nos últimos 5 anos? Tenho um levantamento específico para {setor}. Posso te enviar?" },
      { day: 25, type: "breakup",  subject: "Encerrando — {empresa}",                                             body: "Olá,\n\nNão quero continuar incomodando. Encerro o contato por aqui.\n\nSe a revisão do histórico tributário da {empresa} entrar na pauta em algum momento, pode me chamar — a avaliação continua gratuita.\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
    ],
    contabil: [
      { day: 1,  type: "linkedin", subject: "Oportunidade tributária em {setor} para a {empresa}",                body: "Olá,\n\nComo contador/controller da {empresa}, você provavelmente já tem visão da carga tributária do negócio.\n\nUma pergunta técnica: vocês já fizeram um levantamento de créditos de PIS/COFINS não cumulativos dos últimos 5 anos?\n\nA MGT tem software próprio que faz esse levantamento em 5 dias — e já encontrou mais de R$ 5 bilhões em créditos em empresas de todos os portes.\n\nVale um papo técnico?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { day: 3,  type: "email",    subject: "[{empresa}] Revisão de PIS/COFINS e IRPJ — metodologia MGT",         body: "Olá,\n\nA complexidade do sistema tributário brasileiro faz com que, mesmo contadores experientes, deixem créditos na mesa sem querer.\n\nA MGT tem tecnologia própria que cruza o histórico fiscal dos últimos 5 anos com a legislação vigente e identifica:\n\n— Créditos de PIS/COFINS não aproveitados\n— Base de cálculo de IRPJ/CSLL que pode ser revisada\n— Tributos recolhidos com alíquota incorreta\n— Passivos com desconto via transação tributária\n\nO levantamento é gratuito. Trabalhamos em parceria com o time contábil interno da empresa.\n\nVale uma conversa?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { day: 7,  type: "call",     subject: "Cold call — Contabilidade {empresa}",                                body: "Bom dia [Nome], consultor da MGT. Tenho 30 segundos?\n\n[PAUSA]\n\nLigo porque a {empresa} atua em {setor} e esse setor tem particularidades tributárias que frequentemente geram créditos não aproveitados.\n\nUma pergunta técnica: vocês revisaram o enquadramento de PIS/COFINS da empresa recentemente?\n\n[ouvir]\n\nA MGT faz esse levantamento gratuitamente em 5 dias e trabalha em total alinhamento com o contador interno. Faz sentido eu te explicar como funciona?" },
      { day: 12, type: "email",    subject: "[{empresa}] Parceria com contador interno — como a MGT trabalha",    body: "Olá,\n\nUm ponto importante: a MGT não substitui o contador ou controller interno. Trabalhamos em parceria.\n\nNossa equipe de especialistas tributários faz a camada de análise técnica profunda que complementa o trabalho contábil do dia a dia.\n\nO resultado vai direto para o caixa da empresa, e o contador parceiro fica com visibilidade total do processo.\n\nPosso te mostrar como funcionou para empresas de {setor} similares a {empresa}?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { day: 18, type: "whatsapp", subject: "WhatsApp — Controller {empresa}",                                    body: "Oi [Nome], MGT Gestão Tributária. Empresa de {setor} com porte similar a {empresa} recuperou R$ 800k em créditos de PIS/COFINS em parceria com o time contábil interno. Posso te mandar o case?" },
      { day: 24, type: "breakup",  subject: "Encerrando contato — {empresa}",                                     body: "Olá,\n\nEncerro o contato por aqui. Se em algum momento a revisão tributária dos últimos 5 anos da {empresa} entrar na pauta, pode me chamar.\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
    ],
    ops: [
      { day: 1,  type: "email",    subject: "[{empresa}] Carga tributária como custo operacional em {setor}",     body: "Olá,\n\nUma pergunta para quem gerencia operações em {setor}: a carga tributária da {empresa} é tratada como custo fixo ou como variável que pode ser otimizada?\n\nNa maioria das empresas que atendemos, ela é custo fixo — até o dia que a MGT faz a revisão.\n\nJá administramos mais de R$ 5 bilhões em créditos tributários para empresas de todos os portes. O levantamento é gratuito e leva 5 dias.\n\nTem disponibilidade para eu te explicar como funciona?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { day: 5,  type: "linkedin", subject: "Eficiência financeira na {empresa} — redução de carga tributária",   body: "Olá,\n\nComo Diretor de Operações de empresa de {setor}, você sabe que custo tributário impacta diretamente a margem operacional.\n\nA pergunta que poucos fazem: vocês já otimizaram esse custo nos últimos 5 anos?\n\nA MGT Gestão Tributária faz isso com uma avaliação gratuita do CNPJ — sem compromisso. Se não encontrarmos oportunidade, você não paga nada.\n\nVale 15 minutos?" },
      { day: 9,  type: "call",     subject: "Cold call — Operações {empresa}",                                    body: "Bom dia [Nome], consultor da MGT. Rápido.\n\nLigo porque empresas de {setor} com o porte da {empresa} normalmente têm entre 30% e 45% da receita comprometida com impostos.\n\nUma pergunta: a {empresa} já fez uma revisão para saber se está pagando mais do que deve?\n\n[ouvir]\n\nEntendido. A MGT faz essa avaliação gratuitamente em 5 dias. Faz sentido eu te explicar como?" },
      { day: 14, type: "email",    subject: "[{empresa}] Margem operacional vs carga tributária — benchmark {setor}", body: "Olá,\n\nUm número que costuma surpreender gestores operacionais de {setor}:\n\nEmpresas que fizeram a revisão tributária com a MGT reduziram a carga fiscal em média 12% ao ano — sem mudança no modelo de negócio, sem riscos jurídicos.\n\nIsso representa diretamente mais margem operacional para {empresa} reinvestir ou distribuir.\n\nPosso montar uma estimativa específica para o porte da {empresa}?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { day: 20, type: "whatsapp", subject: "WhatsApp — Ops {empresa}",                                           body: "Oi [Nome], MGT Gestão Tributária. Redução de carga tributária é um alavancador de margem que muitas empresas de {setor} ignoram. Avaliação gratuita em 5 dias. Posso te explicar rapidamente?" },
      { day: 26, type: "breakup",  subject: "Encerrando — {empresa}",                                             body: "Olá,\n\nEncerro o contato aqui. Se otimização tributária entrar na agenda da {empresa}, pode me chamar.\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
    ],
    juridico: [
      { day: 1,  type: "email",    subject: "[{empresa}] Passivos tributários e oportunidades de transação em {setor}", body: "Olá,\n\nComo responsável jurídico de empresa de {setor}, você provavelmente tem visibilidade dos passivos tributários da {empresa}.\n\nUma pergunta: vocês já avaliaram oportunidades de transação tributária para redução ou parcelamento desses passivos com desconto?\n\nA MGT Gestão Tributária trabalha tanto na recuperação de créditos como na negociação e redução de passivos — já geramos mais de R$ 1 bilhão em descontos para clientes no Brasil.\n\nVale uma conversa?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { day: 4,  type: "linkedin", subject: "Compliance tributário e oportunidades na {empresa}",                  body: "Olá,\n\nA interseção entre compliance fiscal e oportunidade tributária é o espaço onde a MGT atua.\n\nNão é só sobre pagar menos — é sobre pagar o que é devido por lei, com segurança jurídica.\n\nVale um papo?" },
      { day: 9,  type: "call",     subject: "Cold call — Jurídico {empresa}",                                      body: "Bom dia [Nome], consultor da MGT Gestão Tributária. Tenho 30 segundos?\n\n[PAUSA]\n\nLigo porque a {empresa} atua em {setor} — um setor com complexidade tributária relevante.\n\nUma pergunta: vocês têm clareza sobre os riscos e oportunidades tributárias do histórico dos últimos 5 anos?\n\n[ouvir]\n\nEntendido. A MGT faz essa análise gratuitamente, com total segurança jurídica. Faz sentido eu explicar o processo?" },
      { day: 15, type: "email",    subject: "[{empresa}] Transação tributária — redução de passivos com desconto",  body: "Olá,\n\nAlgo que muitos advogados internos não sabem: o programa de Transação Tributária da PGFN permite negociar dívidas fiscais com descontos de até 65% para empresas em situação específica.\n\nA MGT tem expertise nessa modalidade e já gerou mais de R$ 1 bilhão em descontos para clientes.\n\nVale conversar 20 minutos?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { day: 22, type: "breakup",  subject: "Última mensagem — {empresa}",                                        body: "Olá,\n\nÚltima mensagem — prometo.\n\nSe gestão de passivos tributários ou recuperação de créditos entrar na pauta jurídica da {empresa}, pode me chamar.\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
    ],
    csuite: [
      { day: 1,  type: "linkedin", subject: "Estrutura tributária e retorno sobre capital na {empresa}",           body: "Olá,\n\nTrabalho com holdings e grupos empresariais de {setor} em uma área que costuma ser negligenciada: a eficiência tributária da estrutura societária.\n\nA pergunta que raramente chega ao conselho: qual o impacto da carga tributária atual no retorno sobre capital dos sócios?\n\nA MGT já administrou mais de R$ 5 bilhões em créditos e estruturou redução de carga fiscal para grupos com múltiplas empresas.\n\nVale uma conversa estratégica?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { day: 5,  type: "email",    subject: "[{empresa}] Eficiência tributária para holdings e grupos empresariais", body: "Olá,\n\nGrupos empresariais de {setor} com estrutura holding normalmente têm oportunidades de eficiência tributária que não aparecem na visão contábil tradicional:\n\n— JCP (Juros sobre Capital Próprio) para redução de IRPJ\n— Aproveitamento de créditos tributários entre empresas do grupo\n— Revisão do regime de consolidação fiscal\n— Recuperação de tributos dos últimos 5 anos em cada CNPJ do grupo\n\nA MGT faz a avaliação completa gratuitamente.\n\nTem disponibilidade para uma conversa estratégica?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { day: 10, type: "call",     subject: "Cold call — Conselho/Holding {empresa}",                             body: "Bom dia [Nome], consultor da MGT Gestão Tributária. Rápido.\n\nLigo porque grupos empresariais de {setor} com o porte da {empresa} normalmente têm oportunidades de eficiência tributária na estrutura holding que ainda não foram exploradas.\n\nUma pergunta estratégica: vocês já avaliaram o impacto tributário da estrutura societária atual no retorno de capital?\n\n[ouvir]\n\nEntendido. A avaliação é gratuita e pode mudar o número final de distribuição de lucros. Vale 20 minutos?" },
      { day: 16, type: "email",    subject: "[{empresa}] Case: grupo de {setor} recuperou R$ 3M em créditos tributários", body: "Olá,\n\nUm exemplo recente: um grupo empresarial de {setor} com estrutura de holding e 4 CNPJs — perfil similar ao da {empresa} — passou pelo processo da MGT e:\n\n— Recuperou R$ 3,2M em créditos tributários dos últimos 5 anos\n— Reduziu a carga fiscal anual em 11%\n— Estruturou JCP que gerou economia adicional de R$ 800k/ano\n\nTodo o processo durou 8 meses e o modelo de honorários é 100% atrelado ao resultado.\n\nFaz sentido eu te contar como foi?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { day: 23, type: "breakup",  subject: "Encerrando — {empresa}",                                             body: "Olá,\n\nEncerro o contato por aqui. Se eficiência tributária da estrutura do grupo entrar na pauta estratégica, pode me chamar.\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
    ],
  },

  oneTouchVariants: {
    email: [
      { subject: "[{nome}] {nome} já revisou o histórico tributário dos últimos 5 anos?",  body: "Olá,\n\nUma pergunta direta para um {cargo}:\n\nA {nome} tem certeza de que não pagou impostos a maior nos últimos 5 anos?\n\nEmpresas de {setor} com esse perfil normalmente têm entre R$ 300k e R$ 2M em créditos tributários não aproveitados — PIS, COFINS, IRPJ e CSLL.\n\nA avaliação da MGT é gratuita, leva 5 dias e você só paga se encontrarmos resultado.\n\nVale 20 minutos?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { subject: "[{nome}] Quanto {nome} paga de impostos por ano?",                      body: "Olá,\n\nEm conversas com {cargo}s de {setor}, a pergunta que mais provoca reflexão é:\n\nVocês têm certeza de que pagam exatamente o que devem — nem mais, nem menos?\n\nA MGT Gestão Tributária já identificou mais de R$ 5 bilhões em créditos para empresas similares. A avaliação é gratuita e sem compromisso.\n\nFaz sentido conversar?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { subject: "[{nome}] Benchmark tributário para {cargo}s de {setor}",                body: "Olá,\n\nUm número que costuma surpreender {cargo}s de {setor}:\n\nEmpresas do porte da {nome} pagam em média entre 30% e 45% do faturamento em impostos. Mas muitas poderiam pagar entre 5% e 15% a menos — dentro da lei — se tivessem feito a revisão tributária.\n\nA avaliação da MGT é gratuita e leva 5 dias. Vale verificar?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
    ],
    linkedin: [
      { subject: "Pergunta tributária para o {cargo} da {nome}",                          body: "Olá,\n\nVi que você cuida de {angulo} na {nome}.\n\nUma pergunta direta: vocês já fizeram uma revisão crítica do histórico fiscal dos últimos 5 anos?\n\nPergunto porque empresas de {setor} com esse perfil normalmente têm créditos tributários não aproveitados que impactam diretamente o caixa.\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { subject: "{nome} — oportunidade tributária em {setor}",                           body: "Olá!\n\nUm dado sobre {setor}: empresas que não revisam o histórico tributário deixam, em média, 8% a 15% do faturamento anual em créditos na mesa.\n\nVocês já avaliaram isso na {nome}?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
      { subject: "Vi algo sobre a {nome} que vale compartilhar",                          body: "Olá,\n\nPesquisando empresas de {setor} encontrei o perfil da {nome} — empresa com histórico sólido.\n\nEmpresas com esse perfil normalmente têm entre 5 e 15 anos de histórico tributário não revisado. É exatamente onde a MGT gera mais resultado.\n\nVale 15 minutos?\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
    ],
    call: [
      { subject: "Script Cold Call {cargo} {nome}",                                       body: "Bom dia [Nome], consultor da MGT Gestão Tributária. Tenho 30 segundos?\n\n[PAUSA] Ótimo.\n\nLigo porque {nome} atua em {setor} e esse é um dos setores onde mais encontramos tributos pagos a maior nos últimos 5 anos.\n\nUma pergunta direta: vocês já fizeram uma revisão crítica do histórico fiscal de vocês?\n\n[ouvir]\n\nEntendido. A nossa avaliação é gratuita e leva 5 dias — e só cobramos se encontrarmos crédito real. Faz sentido eu te explicar como funciona?" },
      { subject: "Script Cold Call 2 — {cargo} {nome}",                                   body: "[Nome], bom dia! MGT Gestão Tributária. Rápido.\n\nTrabalhamos com {cargo}s de {setor} em uma pergunta específica: vocês têm certeza de que não pagaram impostos a maior nos últimos 5 anos?\n\nIsso acontece na {nome}?\n\n[ouvir]\n\nPerfeito. A avaliação é gratuita — se não encontrarmos nada, não há custo. Vale 20 minutos?" },
    ],
    whatsapp: [
      { subject: "WhatsApp {cargo} {nome}",                                               body: "Oi [Nome], MGT Gestão Tributária. Você cuida de {angulo} na {nome}? Empresa de {setor} com o porte de vocês normalmente tem créditos tributários não aproveitados dos últimos 5 anos. Avaliação gratuita em 5 dias. Posso te contar?" },
      { subject: "WhatsApp 2 — {cargo} {nome}",                                           body: "Oi [Nome]! Vi que {nome} atua em {setor}. Empresas nesse setor frequentemente pagam mais impostos do que devem. A MGT faz a avaliação gratuita em 5 dias. Posso te explicar em 2 minutos?" },
    ],
    breakup: [
      { subject: "Encerrando — {nome}",                                                   body: "Olá,\n\nNão quero continuar incomodando.\n\nSe em algum momento a revisão do histórico tributário da {nome} entrar na pauta, pode me chamar — a avaliação continua gratuita e sem compromisso.\n\nGuardo a {nome} no radar.\n\nAbraço,\nConsultor | MGT Gestão Tributária" },
    ],
  },

  buildData: {
    fitJustificativa: (company, setor) =>
      `${company} atua em ${setor}, vertical com alta carga tributária e potencial de recuperação de créditos. Empresas nesse perfil normalmente têm entre 5% e 15% do faturamento em tributos pagos a maior nos últimos 5 anos — ICP principal da MGT Gestão Tributária.`,
    solucoes: [
      "Avaliação gratuita de CNPJ (5 dias)", "Recuperação de PIS/COFINS", "Revisão de IRPJ e CSLL",
      "Redução de carga tributária futura", "Transação tributária (passivos com desconto)",
      "Reorganização do regime tributário", "Gestão de créditos tributários", "Planejamento tributário estratégico",
    ],
    competidores: ["Outras consultorias tributárias","Escritórios de advocacia tributária","Big Four (Deloitte, PwC, EY, KPMG)","Consultores tributários independentes","Escritório contábil interno","BPC Partners","Tributação online"],
    dores: [
      "Carga tributária acima do mínimo legal necessário — não revisada nos últimos 5 anos",
      "PIS/COFINS com créditos não aproveitados ou calculados com base incorreta",
      "IRPJ e CSLL com base de cálculo acima do necessário por falta de planejamento",
      "Passivos tributários em aberto sem avaliação de transação com desconto",
      "Risco de autuação fiscal por inconsistências no histórico tributário",
      "Regime tributário (Lucro Real x Presumido x Simples) não revisado com o crescimento",
      "Fluxo de caixa comprimido por antecipar impostos que poderiam ser diferidos",
    ],
    triggers: [
      "Crescimento de faturamento recente — mudança de enquadramento tributário",
      "Fusão, aquisição ou reestruturação societária nos últimos 3 anos",
      "Empresa com mais de 5 anos de história e histórico tributário não revisado",
      "Setor com alta incidência de PIS/COFINS ou ICMS-ST",
      "Mudança de contador ou auditoria recente",
      "Expansão geográfica — novos estabelecimentos com CNPJ próprio",
      "Abertura de holding ou estrutura multisocietária",
    ],
    stakeholdersDefault: (company) => [
      { cargo: "CEO / Sócio-Diretor",   angulo: "Decisor final. Quer resultado no caixa e segurança jurídica. Porta de entrada principal.", prioridade: "PRIMARIO",   urgencia: "Alta",  email: "", linkedin: "", phone: "" },
      { cargo: "CFO / Diretor Financeiro", angulo: "Co-decisor. Olha carga tributária, fluxo de caixa e ROI da operação.",                 prioridade: "PRIMARIO",   urgencia: "Alta",  email: "", linkedin: "", phone: "" },
      { cargo: "Contador / Controller", angulo: "Influenciador técnico. Pode ser aliado (parceria) ou resistente.",                         prioridade: "PRIMARIO",   urgencia: "Média" },
      { cargo: "Diretor Jurídico",      angulo: "Avalia risco e compliance. Essencial para passivos e transação tributária.",               prioridade: "SECUNDARIO", urgencia: "Média" },
      { cargo: "Diretor de Operações",  angulo: "Vê carga tributária como custo fixo. Quer otimizar margem operacional.",                   prioridade: "SECUNDARIO", urgencia: "Baixa" },
    ],
    emails: (company, setor) => [
      { assunto: `${company} — vocês revisaram o histórico tributário dos últimos 5 anos?`, corpo: `Olá,\n\nUma pergunta direta: a ${company} já fez uma revisão crítica de PIS/COFINS, IRPJ e CSLL dos últimos 5 anos?\n\nEmpresas de ${setor} com o porte da ${company} normalmente têm entre R$ 300k e R$ 2M em créditos tributários não aproveitados.\n\nA avaliação da MGT é gratuita, leva 5 dias e só pagamos se encontrarmos resultado real.\n\nTem disponibilidade?\n\nAbraço,\nConsultor | MGT Gestão Tributária` },
      { assunto: `[${company}] Quanto ${company} pagou a mais em impostos nos últimos 5 anos?`, corpo: `Olá,\n\nO sistema tributário brasileiro é complexo o suficiente para que até empresas bem geridas paguem impostos a maior sem perceber.\n\nA MGT Gestão Tributária identificou mais de R$ 5 bilhões em créditos para clientes usando tecnologia própria.\n\nA avaliação do CNPJ da ${company} é gratuita e leva 5 dias. Zero compromisso.\n\nVale uma conversa?\n\nAbraço,\nConsultor | MGT Gestão Tributária` },
      { assunto: `Metodologia 3Rs — como a MGT gera resultado para empresas de ${setor}`, corpo: `Olá,\n\nDeixa eu ser objetivo:\n\n1. REORGANIZAR: revisamos o regime tributário da ${company}\n2. RECUPERAR: levantamos tributos pagos a maior nos últimos 5 anos\n3. REDUZIR: estruturamos o pagamento futuro\n\nAvaliação gratuita em 5 dias. Honorários só sobre o que recuperamos.\n\nFaz sentido?\n\nAbraço,\nConsultor | MGT Gestão Tributária` },
    ],
    inmails: (company, setor) => [
      { assunto: `Pergunta tributária para a ${company}`, corpo: `Olá!\n\nEmpresa de ${setor} com porte similar a ${company} recuperou R$ 1,2M em créditos tributários com a MGT. A avaliação foi gratuita e levou 5 dias. Vale um papo?\n\nAbraço,\nConsultor | MGT Gestão Tributária` },
      { assunto: `Redução de carga tributária em ${setor} — como funciona`, corpo: `Vocês já revisaram se o regime tributário da ${company} ainda é o mais eficiente para o porte atual? É uma revisão gratuita que pode mudar o fluxo de caixa de vocês.\n\nAbraço,\nConsultor | MGT Gestão Tributária` },
      { assunto: `${company} — oportunidade tributária identificada`, corpo: `Vi que ${company} atua em ${setor}. Esse setor tem particularidades fiscais que frequentemente geram créditos não aproveitados. A avaliação é gratuita e sem compromisso. Vale 15 minutos?\n\nAbraço,\nConsultor | MGT Gestão Tributária` },
    ],
    whatsapps: (company, setor) => [
      `Oi [Nome], MGT Gestão Tributária. ${company} já fez uma revisão de PIS/COFINS e IRPJ dos últimos 5 anos? Empresas de ${setor} com esse perfil normalmente têm créditos não aproveitados. Avaliação gratuita em 5 dias. Posso te contar como?`,
      `Oi [Nome]! MGT Gestão Tributária. Empresa de ${setor} com perfil da ${company} recuperou R$ 900k em créditos tributários — avaliação gratuita. Posso te mandar os detalhes?`,
      `Oi [Nome], MGT. Você é o responsável pela parte financeira da ${company}? Tenho um levantamento de oportunidades tributárias para ${setor}. Posso te enviar?`,
    ],
    coldCalls: (company, setor) => [
      `Bom dia [Nome], consultor da MGT Gestão Tributária. Tenho 30 segundos? [PAUSA] Ligo porque ${company} tem o perfil de empresas onde encontramos mais créditos tributários em ${setor}. Uma pergunta: vocês revisaram o histórico fiscal dos últimos 5 anos? [ouvir] A nossa avaliação é gratuita e leva 5 dias — e só cobramos se encontrarmos resultado. Faz sentido eu te explicar?`,
      `[Nome], bom dia! MGT Gestão Tributária. Pergunta direta: vocês têm certeza que não pagaram impostos a maior nos últimos 5 anos? [ouvir] A MGT faz esse levantamento gratuitamente em 5 dias. Já administramos mais de R$ 5 bilhões em créditos no Brasil. Vale 20 minutos?`,
      `Oi [Nome], MGT Gestão Tributária. Empresa de ${setor} com porte da ${company} normalmente tem entre R$ 300k e R$ 2M em créditos tributários não aproveitados. Avaliação gratuita em 5 dias. Vale 2 minutos agora?`,
    ],
    spin: (company) => [
      `SITUAÇÃO: Qual o regime tributário atual da ${company} — Lucro Real, Presumido ou Simples? Há quanto tempo está nesse regime?`,
      `SITUAÇÃO: Vocês têm um contador interno ou terceirizado? Como funciona a relação com o time fiscal?`,
      `SITUAÇÃO: A ${company} já passou por alguma auditoria ou revisão fiscal nos últimos 5 anos?`,
      `SITUAÇÃO: Qual o faturamento médio anual da ${company} nos últimos 3 anos?`,
      `PROBLEMA: Vocês têm clareza de quanto a ${company} paga de PIS, COFINS, IRPJ e CSLL mensalmente?`,
      `PROBLEMA: Já identificaram alguma inconsistência ou pagamento em duplicidade no histórico fiscal?`,
      `PROBLEMA: O regime tributário atual foi revisto desde que a empresa cresceu para o porte atual?`,
      `PROBLEMA: Vocês têm passivos tributários em aberto que ainda não foram negociados?`,
      `IMPLICAÇÃO: Se vocês estiverem pagando 10% a mais em impostos do que o necessário, qual o impacto no caixa anual?`,
      `IMPLICAÇÃO: Com a complexidade tributária atual, como vocês garantem que não há risco de autuação no histórico?`,
      `IMPLICAÇÃO: Se não revisarem agora, perdem o direito de recuperar créditos com mais de 5 anos. Já avaliaram esse risco?`,
      `NECESSIDADE: Se a MGT encontrasse R$ 500k em créditos tributários da ${company}, como isso impactaria o caixa e os planos de vocês?`,
      `NECESSIDADE: O que seria necessário para a ${company} iniciar uma revisão do histórico tributário nos próximos 30 dias?`,
      `NECESSIDADE: Se a avaliação fosse 100% gratuita e sem compromisso, o que impediria de avançar?`,
    ],
    objecoes: (company, setor) => [
      { objeção: "Já temos contador e ele cuida disso",       resposta: "A MGT não substitui o contador — trabalhamos em parceria. Fazemos a camada de análise tributária profunda que complementa o trabalho contábil do dia a dia. Muitos contadores parceiros nossos ficam surpresos com o que encontramos." },
      { objeção: "Não temos interesse em recuperação de impostos", resposta: `Entendo. A pergunta é: a ${company} tem certeza de que não pagou nada a mais? A avaliação é gratuita e sem compromisso — se não encontrarmos nada, não há custo algum.` },
      { objeção: "Já fizemos isso e não encontraram nada",    resposta: "Interessante — pode me dizer qual empresa fez a revisão? Pergunto porque nossa metodologia usa tecnologia própria que cruza legislação com histórico fiscal de um jeito diferente. Vale comparar." },
      { objeção: "Isso parece arriscado juridicamente",       resposta: "Entendo a preocupação. Todo o trabalho da MGT é dentro da legislação vigente — nenhum planejamento agressivo ou zona cinza. Temos mais de 100 contratos ativos no setor farmacêutico, um dos mais regulados do Brasil." },
      { objeção: "Não é prioridade agora",                   resposta: `Faz sentido. Mas vale lembrar que o direito de recuperar créditos prescreve em 5 anos. Se a ${company} tem mais de 5 anos, já perdeu parte da janela. Vale ao menos a avaliação gratuita?` },
      { objeção: "Precisamos envolver o financeiro/contador", resposta: "Perfeito — é exatamente o que recomendamos. Posso te ajudar a preparar uma apresentação do processo para levar para eles?" },
      { objeção: "Quanto custa?",                            resposta: "A avaliação inicial é 100% gratuita. Os honorários são 100% atrelados ao resultado — só cobramos uma percentagem sobre o que efetivamente recuperamos ou reduzimos. Se não encontrarmos nada, não há custo algum." },
      { objeção: "Já tentamos e foi um processo longo e trabalhoso", resposta: "Entendo. Nosso processo dura em média 90 dias do levantamento até o início da restituição. Cuidamos de toda a parte operacional — o time interno precisa apenas liberar documentação no início." },
    ],
    proximosPassos: {
      ae: (company) => [
        `Mapear decisores no LinkedIn — CEO, CFO e Contador/Controller da ${company}`,
        "Verificar porte e regime tributário via CNPJ (Receita Federal)",
        `Pesquisar crescimento recente da ${company} — expansão, novos sócios ou M&A`,
        `Buscar notícias financeiras ou de expansão da ${company} no Google`,
        "Preparar estimativa de potencial de créditos com base no porte e setor",
        "InMail ao CEO e CFO com ângulo de avaliação gratuita sem compromisso",
      ],
      bdr: (company, setor) => [
        "Cold call focado em CEO e CFO com abertura pela avaliação gratuita",
        "WhatsApp com pergunta direta sobre histórico tributário dos últimos 5 anos",
        "Sequência de 3 emails: Pergunta direta, Metodologia 3Rs, Case do setor",
        "Monitorar LinkedIn — posts sobre crescimento, expansão ou mudança de liderança",
        "Eventos: Fenacon, ENAT, Fenainfo, Sicoob/Sicredi para empresários regionais",
      ],
      prazo: "Primeira abordagem em até 48 horas — foco em CEO e CFO. Mencionar sempre a avaliação gratuita como porta de entrada sem atrito.",
    },
    noticiaFallbackUrl: (company) =>
      `https://google.com/search?q=${encodeURIComponent(company + " tributário fiscal 2025")}`,
  },
};
