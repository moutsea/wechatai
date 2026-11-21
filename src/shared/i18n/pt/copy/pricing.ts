/**
 * Brazilian Portuguese copy for the pricing page, shared by the rendered page
 * and JSON-LD. Amounts, daily allowances, refund/renewal terms and plan limits
 * still come from the billing, credit, link and plugin modules.
 */
import { BILLING_OFFERS } from "../../../billing-offers";
import { DAILY_CREDIT_DEFAULTS } from "../../../credits";
import { approxYuan } from "../../../pricing-copy";
import { PLUGIN_LIMITS } from "../../../plugin-access";
import { WECHAT_LINK_LIMITS } from "../../../wechat-links";

const monthly = BILLING_OFFERS.find((offer) => offer.id === "plus_monthly")!;
const yearly = BILLING_OFFERS.find((offer) => offer.id === "plus_yearly")!;
const monthlyPrice = `¥${monthly.amount / 100}/mês`;
const yearlyPrice = `¥${yearly.amount / 100}/ano`;

const number = (value: number) => value.toLocaleString("pt-BR");
const packs = BILLING_OFFERS.filter((offer) => offer.kind === "credits")
  .map((offer) => `¥${offer.amount / 100} por ${number(offer.credits)} credits`)
  .join(", ");

export const pricingCopyPt = {
  seo: {
    title: `Preços: ${DAILY_CREDIT_DEFAULTS.free} credits grátis por dia, Plus ${monthlyPrice}`,
    description: `Compare o Free e o Plus do Wechatai: credits diários, conexões do WeChat, plugins, anexos e Xiaowei AI. O Free inclui ${DAILY_CREDIT_DEFAULTS.free} credits por dia; o Plus custa ${monthlyPrice} ou ${yearlyPrice}, uma compra avulsa sem renovação automática. As taxas de API do modelo são cobradas separadamente.`,
    eyebrow: "Preços e planos",
    h1: "Comece grátis e faça upgrade para o Plus quando precisar",
    lede: "O plano Free cobre as perguntas do dia a dia. O Plus adiciona mais credits e a Xiaowei AI. Traga sua própria API key de modelo; as taxas do modelo são cobradas separadamente pelo provedor.",
    answer:
      "O plano Free cobre as perguntas do dia a dia. O Plus adiciona mais credits e a Xiaowei AI. Traga sua própria API key de modelo; as taxas do modelo são cobradas separadamente pelo provedor.",
    primaryKeyword: "preço do WeChat AI",
    secondaryKeywords: [
      "preços do Wechatai",
      "custo do WeChat AI",
      "credits grátis do WeChat AI",
      "preço do ClawBot",
    ],
    faq: [
      {
        question: "A assinatura inclui as taxas do modelo?",
        answer:
          "Não. A assinatura e os credits cobrem o serviço da plataforma Wechatai. O chat comum, a geração de imagens e a Xiaowei usam a API de modelo que você configurar, e as taxas do modelo são cobradas separadamente pelo provedor. Configurações existentes de Muse, Hermes e OpenClaw mantêm o próprio modelo e a própria cobrança.",
        guide: { label: "Saiba mais sobre a configuração de modelos", href: "/docs/channels-models" },
      },
      {
        question: "Como funcionam os credits? Os credits diários acumulam?",
        answer: `Os credits são a cota de uso da plataforma. O texto é medido por entrada, saída e histórico da conversa: por exemplo, 1.000 tokens de entrada e 1.000 tokens de saída em uma solicitação custam cerca de 1,8 credits. A geração de imagens custa 5 credits por imagem, além do texto da descrição. O Free inclui ${number(DAILY_CREDIT_DEFAULTS.free)} credits por dia e o Plus inclui ${number(DAILY_CREDIT_DEFAULTS.plus)}; os credits valem para o dia e não acumulam. As notificações de serviço por webhook não consomem credits.`,
        guide: { label: "Ver as regras completas de cobrança", href: "/docs/credits" },
      },
      {
        question: "O que acontece quando os credits acabam?",
        answer: `Aguarde a renovação da cota diária no dia seguinte ou compre um pacote de recarga: ${packs}. As recargas não exigem Plus, e os credits comprados continuam válidos. Comprar uma recarga não desbloqueia recursos exclusivos do Plus.`,
        guide: { label: "Ir para assinatura e credits", href: "/app/billing" },
      },
      {
        question: "O que a Xiaowei AI do Plus pode fazer?",
        answer:
          "A Xiaowei é uma assistente que roda na nuvem do Wechatai. Ela pode processar arquivos, gerar documentos e executar tarefas, enviando os resultados de volta ao WeChat. Não é preciso instalar nem implantar nada; configure um modelo de texto para habilitá-la. O número de execuções, a cota de armazenamento e o status do serviço aparecem na página do plugin; as taxas de API do modelo são cobradas separadamente.",
        guide: { label: "Conheça a Xiaowei e seus requisitos", href: "/docs/cloud-agent" },
      },
      {
        question: "Quanto custa o Plus? Ele renova automaticamente?",
        answer: `O Plus custa ${monthlyPrice}, ou ${yearlyPrice} (cerca de ${approxYuan(yearly.amount / 12)}/mês). As novas assinaturas são compras avulsas, sem renovação automática; renovar antes do vencimento estende o prazo. Quando a assinatura expira, a conta volta ao plano Free e os credits comprados são mantidos. Assinaturas recorrentes antigas podem ser canceladas em "Gerenciar assinatura".`,
      },
      {
        question: "Posso pedir reembolso depois da compra?",
        answer:
          "Para solicitar um reembolso, fale conosco com os dados do pedido. Analisamos cada solicitação com base no pedido real, no uso e na legislação aplicável; os termos de serviço prevalecem.",
        guide: { label: "Falar com o suporte", href: "/contact" },
      },
      {
        question: "O que preciso antes de começar?",
        answer:
          "Primeiro, confirme se o WeChat do seu celular tem a entrada do ClawBot; o Wechatai não pode habilitá-la na sua conta. O chat comum e a Xiaowei também exigem uma API key de modelo; a geração de imagens exige um modelo de imagem e um plugin. Ao escanear no celular, mostre o código QR a partir de um computador ou outro dispositivo.",
        guide: { label: "Ler o guia de primeiros passos", href: "/docs/getting-started" },
      },
    ],
    related: [{ label: "Assistente gerenciado Muse para WeChat", href: "/wechat-muse" }],
  },
  page: {
    skip: "Pular para o conteúdo",
    breadcrumbLabel: "Navegação estrutural",
    home: "Início",
    breadcrumbCurrent: "Preços e planos",
    faqTitle: "Ainda tem dúvidas?",
    estimatorSummary: "Estimar meu uso diário",
    help: "Precisa de ajuda? Fale conosco",
    terms: "Termos de serviço",
  },
  plans: {
    title: "Comparação entre Free e Plus",
    free: {
      name: "Free",
      badge: "Começo fácil",
      description: "Comece com perguntas do dia a dia",
      unit: "Grátis para sempre",
      note: "Não é preciso assinatura para começar",
      workspace: "Abrir o painel",
      start: "Comece grátis",
    },
    badgeFlexible: "Flexível",
    badgeSave: (saving: string) => `Economize ${saving}`,
    descriptionAnnual: "Uso prolongado; o plano anual vale mais a pena",
    descriptionMonthly: "Mais credits e Xiaowei AI",
    unitYear: "/ ano",
    unitMonth: "/ mês",
    noteAnnual: (approx: string, saving: string) =>
      `Cerca de ${approx} / mês, ${saving} a menos que o mensal`,
    noteMonthly: "Pagamento único de um mês. Renove quando precisar.",
    ctaBusy: "Redirecionando para o pagamento…",
    ctaSubscribe: (name: string, price: string) => `Assinar ${name} · ${price}`,
    ctaChoose: (name: string) => `Escolher ${name}`,
    loginAgain: "Entrar novamente",
    checkoutFailed: "Não foi possível iniciar o pagamento. Tente novamente.",
    checkoutErrors: {
      unauthorized: "Sua sessão expirou. Entre novamente para continuar.",
      rate_limited: "Muitas tentativas. Aguarde um momento e tente novamente.",
      billing_unavailable: "Este plano não está disponível para compra agora. Tente mais tarde.",
      already_subscribed:
        "Você já tem uma assinatura recorrente ou pendente. Desative a renovação automática em Gerenciar assinatura antes de comprar uma assinatura avulsa. Seu tempo restante será mantido.",
      payment_processing: "Seu pagamento está sendo confirmado. Atualize a página em instantes.",
      checkout_in_progress: "Um pedido já está sendo criado. Tente novamente em breve.",
    },
    offerName: (interval: "month" | "year") => (interval === "year" ? "Plus Anual" : "Plus Mensal"),
    features: [
      {
        label: "Credits por dia",
        free: DAILY_CREDIT_DEFAULTS.free,
        plus: DAILY_CREDIT_DEFAULTS.plus,
      },
      {
        label: "Conexões do WeChat",
        free: WECHAT_LINK_LIMITS.free,
        plus: WECHAT_LINK_LIMITS.plus,
      },
      { label: "Configurações de plugins", free: PLUGIN_LIMITS.free, plus: "Ilimitadas" },
      { label: "Entrada de imagens e arquivos", free: false, plus: true },
      { label: "Ver histórico de conversas na web", free: false, plus: true },
      {
        label: "Assistente de IA em nuvem Xiaowei",
        free: false,
        plus: true,
        href: "/docs/cloud-agent",
      },
    ],
    highlights: ["Credits por dia", "Conexões do WeChat", "Configurações de plugins"],
    supported: "Suportado",
    unsupported: "Não suportado",
    comparisonCaption: "Comparação de benefícios · Plus mensal e anual têm os mesmos benefícios",
    comparisonHeaders: ["Recurso e limite", "Free", "Plus"],
    common:
      "Todos os planos incluem chat com modelos, geração de imagens por IA, role-play e notificações de serviço gratuitas.",
    fineprint:
      "O Plus é uma compra avulsa, sem renovação automática; mensal e anual têm os mesmos benefícios. Os credits diários valem para o dia e não acumulam.",
    checked: "Preços verificados em",
  },
  estimator: {
    eyebrow: "Dois custos quando você traz sua própria API",
    title: "Estime primeiro seu uso de texto",
    intro:
      "Cálculo feito apenas no navegador; não é preciso entrar na conta. A tarifa do provedor estima o custo da API do modelo. A Xiaowei também usa seu próprio modelo e pode chamá-lo várias vezes; as taxas reais de API seguem a fatura do provedor. O serviço em nuvem ainda exige Plus e disponibilidade, e o número de tarefas tem limites separados.",
    fields: [
      "Tokens de entrada por turno (incluindo histórico)",
      "Tokens de saída por turno",
      "Solicitações por dia",
      "Preço de entrada do provedor (CNY / milhão de tokens)",
      "Preço de saída do provedor (CNY / milhão de tokens)",
    ],
    placeholder: "Opcional, preço em CNY",
    platformLabel: "Uso do Wechatai / dia",
    platformHint: (free: number, plus: number) =>
      `O Free inclui ${number(free)} por dia; o Plus inclui ${number(plus)}. Os credits diários não acumulam.`,
    providerLabel: "Custo do modelo no provedor / dia",
    providerValue: (amount: string) => `Cerca de ¥${amount}`,
    providerEmpty: "Insira um preço para ver a estimativa",
    providerHint:
      "As taxas de API do modelo são cobradas separadamente pelo provedor; as chamadas internas da Xiaowei também podem gerar taxas de API.",
    invalid: "Insira números válidos e não negativos; tokens e turnos devem ser inteiros.",
    note:
      "Fórmula: (entrada + saída × 8) ÷ 5.000, arredondado para cima em 0,001 credit por turno. A entrada deve incluir o histórico realmente enviado em cada turno. Não cobre diferenças de cache, busca, chamadas extras de ferramentas, anexos, geração de imagens, impostos ou câmbio. É uma estimativa, não uma cotação, e não garante um número fixo de conversas.",
    noteLink: "Ver as regras completas de cobrança",
  },
  relatedHeading: "Continue explorando",
};
