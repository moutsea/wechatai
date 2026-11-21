/**
 * Brazilian Portuguese copy for the homepage, shared by the rendered page and
 * its JSON-LD.
 *
 * Prices and allowances always come from the billing, credit, WeChat-link and
 * plugin-limit modules. This file supplies wording only, never a second source
 * of amounts or commercial terms.
 */
import { DAILY_CREDIT_DEFAULTS } from "../../../credits";
import { PLUGIN_LIMITS } from "../../../plugin-access";
import { PLUS_MONTHLY_YUAN, PLUS_YEARLY_YUAN, approxYuan } from "../../../pricing-copy";
import { WECHAT_LINK_LIMITS } from "../../../wechat-links";

const yearlySaving = Number((PLUS_MONTHLY_YUAN * 12 - PLUS_YEARLY_YUAN).toFixed(1));
const number = (value: number) => value.toLocaleString("pt-BR");

export const homeCopyPt = {
  seo: {
    title: "WeChat AI: DeepSeek, Claude, GPT e agentes | Wechatai",
    description:
      "O Wechatai conecta modelos e agentes ao WeChat: converse com DeepSeek, Claude e GPT, gere imagens, conecte Muse, Hermes e OpenClaw e deixe a assistente em nuvem Xiaowei, do Plus, cuidar de arquivos e tarefas. Comece grátis com sua própria API key de modelo; as taxas do modelo são cobradas pelo provedor.",
  },
  plans: {
    free: {
      name: "Free",
      description: "Comece com perguntas do dia a dia",
      unit: "Grátis para sempre",
      note: "Não é preciso assinatura para começar",
      badge: "Para começar",
      action: "Comece grátis",
    },
    month: {
      name: "Plus Mensal",
      description: "Mais credits, mais possibilidades",
      unit: "/ mês",
      note: "Pagamento único de um mês. Renove quando precisar.",
      badge: "Flexível",
      action: "Escolher Plus mensal",
    },
    year: {
      name: "Plus Anual",
      description: "IA ao seu lado todos os dias",
      unit: "/ ano",
      note: `Cerca de ${approxYuan((PLUS_YEARLY_YUAN * 100) / 12)} / mês`,
      badge: `Economize ¥${yearlySaving} em relação ao mensal`,
      action: "Escolher Plus anual",
    },
    features: {
      creditsPrefix: "Todos os dias",
      creditsSuffix: "credits",
      wechatConnections: (count: number) =>
        count === 1 ? "conexão do WeChat" : "conexões do WeChat",
      unlimitedPlugins: "Configurações de plugins ilimitadas",
      unlimitedPluginsEmphasis: null,
      pluginConfigurations: (count: number) =>
        count === 1 ? "configuração de plugin" : "configurações de plugins",
      imageInput: "Entrada de imagens e arquivos",
      noImageInput: "Sem entrada de imagens e arquivos",
      xiaoweiName: "Xiaowei AI",
      xiaoweiCloud: "assistente em nuvem",
      noXiaowei: "Sem Xiaowei AI",
    },
    switchLabel: "Periodicidade do Plus",
    monthly: "Mensal",
    yearly: "Anual · economize mais",
  },
  hero: {
    titleLead: "Leve sua IA",
    titleAccent: "para o WeChat",
    body: "O Wechatai conecta modelos e agentes ao WeChat, com chat, geração de imagens e tarefas em nuvem da Xiaowei para arquivos e documentos. Conecte DeepSeek, Claude, GPT, Muse, Hermes e OpenClaw em uma única conta.",
    ctaWorkspace: "Abrir o painel",
    ctaStart: "Comece grátis",
    how: "Veja como conectar",
    note: `Todos os dias, ${DAILY_CREDIT_DEFAULTS.free} credits grátis; traga sua própria API key de modelo e as taxas do modelo são cobradas pelo provedor.`,
    imageAlt:
      "DeepSeek, Claude, GPT, Muse, Hermes e OpenClaw acima, conectados por linhas ao WeChat abaixo.",
  },
  ctaSteps: "Comece grátis",
  pricingSection: {
    title: "Comece grátis e desbloqueie mais com o Plus",
    intro:
      "Comece com o plano Free para perguntas do dia a dia. Escolha o Plus para mais credits, mais conexões do WeChat e a Xiaowei AI.",
    note: "Os credits são a cota de uso da plataforma Wechatai, descontada conforme o uso. As assinaturas são compras avulsas, sem renovação automática; os credits diários não acumulam. As taxas de API do modelo são pagas separadamente ao provedor.",
    noteSecond:
      "A Xiaowei AI usa o modelo que você configurar; o número de execuções e o status do serviço aparecem na página do plugin. Os planos mensal e anual incluem os mesmos benefícios.",
    estimate: "Como funcionam os credits? Estime seu uso diário",
    details: "Ver preços e detalhes dos credits",
  },
  privacy: {
    title: "Segurança dos dados e privacidade",
    intro:
      "Saiba como as chaves são armazenadas, como as conversas são tratadas e como excluir registros.",
    policy: "Ler a política de privacidade",
    items: {
      keys: {
        title: "Chaves armazenadas com criptografia",
        body: "As API keys e credenciais de conexão do WeChat são criptografadas em repouso no servidor. Chaves salvas nunca são enviadas de volta ao navegador.",
      },
      inspection: {
        title: "Sem revisão proativa",
        body: "Não revisamos proativamente suas conversas ou anexos. As mensagens são processadas automaticamente e entregues aos serviços conectados. Os registros necessários de conversa e tarefa são mantidos conforme a política de privacidade.",
      },
      deletion: {
        title: "Exclua registros de conversa",
        body: "Limpe os registros de conversa do Wechatai no painel; cópias mantidas pelo WeChat e por serviços de terceiros precisam ser tratadas separadamente.",
      },
    },
    openSource: {
      title: "Código aberto no GitHub",
      body: "O Wechatai é open source sob a licença MIT. Explore o código, relate problemas ou contribua.",
      repositoryAria: "Ver o repositório moutsea/wechatai no GitHub (abre em nova janela)",
    },
  },
  faqSection: {
    title: "Perguntas frequentes",
    intro: "Dúvidas sobre preços, configuração e uso.",
    more: "Ler todas as perguntas frequentes",
  },
  faq: [
    {
      question: "Preciso da minha própria API key?",
      answer:
        "O chat comum com modelos e a Xiaowei exigem uma API key de modelo configurada no Wechatai; as taxas do modelo são cobradas separadamente pelo provedor. Se você conectar um Muse, Hermes ou OpenClaw existente, ele mantém a própria configuração de modelo. Apenas notificações de serviço não precisam de chave de modelo.",
      guide: {
        href: "/docs/channels-models",
        label: "Ver o guia de API key e configuração de modelos",
      },
    },
    {
      question: "O plano Free inclui credits? Eles expiram?",
      answer: `Sim. O plano Free é grátis para sempre e inclui ${number(DAILY_CREDIT_DEFAULTS.free)} credits por dia, ${WECHAT_LINK_LIMITS.free} conexão do WeChat e ${PLUGIN_LIMITS.free} configuração de plugin. Os credits diários valem para o dia e não acumulam; as taxas de API do modelo são cobradas separadamente pelo provedor.`,
      guide: { href: "/pricing#estimate", label: "Estime seu uso diário" },
    },
    {
      question: "Quanto custa o Plus e o que ele adiciona?",
      answer: `O Plus custa ¥${PLUS_MONTHLY_YUAN}/mês ou ¥${PLUS_YEARLY_YUAN}/ano, com ${number(DAILY_CREDIT_DEFAULTS.plus)} credits por dia, ${WECHAT_LINK_LIMITS.plus} conexões do WeChat, configurações de plugins ilimitadas, entrada de imagens e arquivos e o assistente em nuvem Xiaowei AI. A Xiaowei precisa de um modelo configurado, e as taxas de API do modelo são cobradas separadamente. Os planos mensal e anual têm os mesmos benefícios; ambos são compras avulsas, sem renovação automática.`,
      guide: { href: "/docs/cloud-agent", label: "Saiba o que a Xiaowei pode fazer" },
    },
    {
      question: "Quais modelos são compatíveis?",
      answer:
        "Conecte DeepSeek, Claude e GPT, além de Kimi, Qwen, MiniMax e outros, e alterne entre eles na mesma conta do WeChat. Provedores oficiais e compatíveis são suportados; os modelos disponíveis dependem do provedor e da sua API key. O suporte a imagens e ferramentas também depende do modelo e do provedor.",
      guide: { href: "/docs/channels-models", label: "Ver provedores e modelos compatíveis" },
    },
    {
      question: "Quantos passos até conversar no WeChat?",
      answer:
        "O chat comum leva três passos: configurar um modelo, escanear o código para conectar o WeChat e enviar uma mensagem. Antes de começar, confirme se o WeChat tem a entrada do ClawBot e prepare uma API key. No celular, mostre o código QR a partir de um computador ou outro dispositivo. Agentes existentes podem seguir o próprio guia e não precisam de uma configuração de modelo separada aqui.",
      guide: { href: "/docs/getting-started", label: "Seguir o guia de primeiros passos" },
    },
    {
      question: "Posso explorar antes de me cadastrar?",
      answer:
        "Sim. Os guias públicos incluem etapas de configuração e capturas reais da interface e podem ser lidos sem conta. As conversas, tarefas e prévias de QR code na página inicial são ilustrativas. O cadastro e a leitura do QR code não exigem chave de modelo; configure um modelo antes do chat comum ou de executar tarefas da Xiaowei.",
      guide: { href: "/docs/getting-started", label: "Ver as etapas de configuração e a interface" },
    },
    {
      question: "Onde ficam as API keys e o histórico de conversas?",
      answer:
        "As API keys são criptografadas nos servidores do Wechatai e usadas para enviar solicitações ao provedor que você configurar; elas nunca são enviadas ao navegador. O histórico de conversas pertence à sua conta. O plano Free não permite ver o histórico completo no navegador, mas você pode excluir conversas. Excluir registros do Wechatai não apaga cópias mantidas pelo WeChat ou pelo provedor.",
      guide: { href: "/privacy", label: "Ler a política de privacidade" },
    },
  ],
  steps: {
    eyebrow: "Começo fácil",
    title: "Configure em 2 minutos e comece grátis",
    guide: "Ler o guia de primeiros passos",
    requirementsPrefix: "Primeiro, confirme se o WeChat tem a",
    requirementsLink: "entrada do ClawBot",
    requirementsSuffix:
      "; o chat comum exige sua própria API key de modelo. Ao escanear no celular, mostre o código QR a partir de um computador ou outro dispositivo.",
    tabsLabel: "Etapas de configuração",
    items: [
      {
        title: "Conecte os modelos que você usa",
        tab: "Configurar modelos",
        description:
          "Compatível com DeepSeek, SiliconFlow, Alibaba Cloud, OpenAI, Anthropic e outros provedores. Insira uma API key e sincronize os modelos com um clique.",
        guideLabel: "Ver o guia de configuração de modelos",
      },
      {
        title: "Conecte seu WeChat",
        tab: "Conectar o WeChat",
        description:
          "Obtenha um código QR no painel e confirme com o WeChat ClawBot. No celular, mostre o código QR a partir de outro dispositivo.",
        guideLabel: "Ver o guia de conexão do WeChat",
      },
      {
        title: "Converse como sempre",
        tab: "Começar a conversar",
        description:
          "Abra uma conversa no WeChat e pergunte à IA diretamente. Troque de modelo ou comece um novo assunto com um único comando.",
        guideLabel: "Ver a referência de comandos do WeChat",
      },
    ],
    preview: {
      providersTitle: "Provedores de modelos compatíveis",
      providersNote: "Coding Plan e provedores compatíveis personalizados também são suportados",
      connectLabel: "Prévia da conexão",
      connectTitle: "Escaneie para conectar seu WeChat",
      connectHint: "Escaneie com o WeChat ClawBot · confirme no celular",
      connectNote: "Apenas ilustração; obtenha seu código QR no painel",
      connectSuccess: "Conexão pessoal",
      chatBrand: "Wechatai",
      chatSent: "Me dê três ideias para um passeio no fim de semana.",
      chatReceived: "Claro. Você prefere ir ao ar livre ou passear pela cidade?",
      chatNote: "Nova conversa iniciada. A anterior continua salva.",
    },
    previous: "Etapa anterior",
    next: "Próxima etapa",
    status: (index: number, total: number, title: string) =>
      `Etapa ${index} de ${total}: ${title}`,
    alternativesPrefix:
      "Configure um modelo, conecte o WeChat e comece a conversar. Você também pode",
    alternativesAgent: "conectar um agente existente",
    alternativesMiddle: "ou",
    alternativesNotifications: "receber notificações de serviço",
    alternativesEnd: ".",
  },
  useCases: {
    title: "Várias IAs, mais escolhas",
    intro: "De uma única pergunta a uma tarefa concluída.",
    caption: "As conversas, seleções de modelo e resultados de tarefas acima são ilustrativos.",
    items: [
      {
        lead: "Um WeChat",
        title: "Conecte vários agentes",
        description:
          "Use Muse, Hermes e OpenClaw com suas ferramentas e configuração existentes, envie tarefas e receba resultados no WeChat.",
        action: "Conectar agentes existentes",
      },
      {
        lead: "Uma descrição",
        title: "Gere imagens no WeChat",
        description:
          "Descreva uma cena e receba uma imagem no WeChat; ative o role-play para personalizar personagens e histórias.",
        note: "A geração de imagens exige um modelo de imagem; as taxas de API são cobradas separadamente pelo provedor",
        action: "Explorar a geração de imagens por IA",
      },
      {
        lead: "DeepSeek, Claude, GPT",
        title: "Os melhores modelos, sua escolha",
        description:
          "Conecte sua própria API de modelo e alterne entre modelos na mesma conta do WeChat para perguntas, textos e tradução.",
        note: "Traga sua própria API key; as taxas do modelo são cobradas separadamente pelo provedor",
        action: "Ver configuração de modelos",
      },
      {
        lead: "Xiaowei, sua assistente em nuvem",
        title: "Processe arquivos e crie documentos",
        description:
          "Atribua tarefas e receba arquivos no WeChat. Sem instalação ou implantação; basta configurar um modelo. No exemplo, substitua <shortcut> pelo atalho do WeChat que você configurou.",
        note: "Apenas para membros Plus",
        action: "Conheça a Xiaowei e comece",
      },
    ],
    scenes: {
      creative: {
        title: "Geração de imagens por IA",
        chat: "Conversa do WeChat",
        prompt: "@draw uma foto de rua na cidade, 3:4",
        done: "Imagem gerada",
        resultLead: "Sua ideia,",
        resultAccent: "vira arte no WeChat.",
        resultNote: "As imagens geradas voltam direto para a conversa",
        roleplay: "Role-play",
        roleplayNote: "Personagens e histórias personalizados",
      },
      modelsAria: "Usar DeepSeek no WeChat: ver o guia de configuração de modelos",
      currentModel: "Modelo atual",
      agentGuide: (name: string) => `Guia de configuração do ${name}`,
      wechat: "WeChat",
      bridge: "Envie tarefas · receba resultados",
      cloud: {
        title: "Xiaowei",
        subtitle: "Uma assistente de tarefas que vive na nuvem do Wechatai",
        task: "Entregar à Xiaowei",
        done: "Concluído",
        prompt: "@<atalho> converta este Markdown em Word",
        fileName: "Notas do projeto.docx",
        fileNote: "Arquivo gerado, enviado de volta ao WeChat",
      },
    },
  },
} as const;
