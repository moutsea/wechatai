import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";

const OWN_API_COST_NOTE =
  "Ao usar seu próprio modelo, busca ou API de imagens, você paga o provedor separadamente; isso não está incluído na assinatura nem nos credits do Wechatai.";

const CLOUD_AGENT_COST_NOTE =
  "A Xiaowei fica disponível para membros Plus quando o operador a libera. Ela usa o modelo de texto que você configurou no Wechatai, e as taxas de API do modelo são pagas separadamente ao provedor. A plataforma cobra credits pelo texto de entrada da tarefa e da resposta final, e cada imagem devolvida custa 5 credits; arquivos que não são imagens não têm cobrança extra. O número de execuções tem limite separado.";

const content: SeoPage = {
  path: "/wechat-ai",
  kind: "product",
  title: "WeChat AI: conecte seu próprio LLM ao chat do WeChat",
  description:
    "WeChat AI significa usar um LLM diretamente no WeChat. Traga sua própria API key para o Wechatai. Quando o operador liberar, a assistente em nuvem Xiaowei, do Plus, usa seu próprio modelo, consome credits e limita o número de execuções.",
  eyebrow: "WeChat AI",
  h1: "WeChat AI: leve seu próprio modelo para o chat do WeChat",
  lede: "Sem trocar de app e sem copiar perguntas para uma página web. Conecte um modelo com sua própria API key; quando precisar de tarefas em segundo plano, verifique na página de Plugins se a assistente em nuvem Xiaowei, do Plus, está disponível. Por padrão, ela segue o modelo normal do perfil do WeChat e também pode ser definida separadamente.",
  answer: `WeChat AI significa chamar um grande modelo de linguagem diretamente no WeChat para perguntas, textos, tradução, geração de imagens e tarefas. O Wechatai aceita sua própria API key e também oferece a assistente em nuvem Xiaowei. ${OWN_API_COST_NOTE}${CLOUD_AGENT_COST_NOTE}`,
  primaryKeyword: "WeChat AI",
  secondaryKeywords: [
    "assistente de IA no WeChat",
    "conectar IA ao WeChat",
    "usar ChatGPT no WeChat",
    "bot de IA no WeChat",
    "chamar um LLM pelo WeChat",
  ],
  highlights: [
    "Traga sua própria API key, com custos transparentes",
    "Alterne entre vários modelos em um único WeChat",
    "Seis plugins integrados para o dia a dia",
  ],
  steps: [
    {
      title: "Configure sua própria API: cadastre-se e adicione um canal",
      text: "Escolha um provedor e insira a API key, confirme se um modelo de texto foi importado ou adicione um manualmente e clique em Testar conexão na linha do modelo. Use a entrada Personalizado para endpoints de terceiros.",
    },
    {
      title: "Escaneie o código QR para conectar o WeChat",
      text: "Depois de configurar o canal e o modelo de texto, gere um código QR. No WeChat, abra Configurações, entre no grupo Recursos e acesse Plugins → WeChat ClawBot → Escanear para vincular.",
    },
    {
      title: "Envie uma mensagem",
      text: "Faça uma pergunta na conversa. Use /wx models para listar os números dos modelos, /wx model <número> para trocar e /wx status para ver o estado atual.",
    },
  ],
  sections: [
    {
      id: "what",
      title: "“WeChat AI” costuma significar três coisas diferentes",
      body: `Os resultados de busca para “WeChat AI” muitas vezes misturam três coisas. Separe-as primeiro para saber qual delas você precisa:

- **IA nativa do WeChat**: recursos leves, como busca no histórico de conversas e sugestões de digitação. O WeChat decide o modelo e a cota, e você não pode substituí-los pelos seus.
- **IA dentro de uma conta oficial ou mini program**: você pergunta dentro daquela conta ou mini program, não consegue sair daquela janela e não leva o contexto para outro lugar.
- **Um modelo conectado ao chat do WeChat**: a IA vira um contato do WeChat que você usa como um amigo. É possível trocar de modelo, manter o contexto e acoplar plugins. O Wechatai faz a terceira opção.

A principal diferença entre a terceira opção e uma ferramenta de AIGC é o ponto de entrada. A ferramenta pede que você abra uma página web, entre na conta e cole a pergunta. Depois de conectar ao WeChat, o próprio WeChat é o ponto de entrada: encaminhar um texto, tirar uma foto ou enviar um áudio podem virar entrada.`,
    },
    {
      id: "how-it-works",
      title: "Como o Wechatai conecta o modelo ao WeChat",
      body: `O Wechatai não é um provedor de modelos e não vende tokens. Ao usar sua própria API, ele faz três coisas:

1. **Recebe sua chave**: ao adicionar um canal, você escolhe o provedor e insere a API key; depois de salvar, importa ou adiciona um modelo manualmente. Os presets preenchem o endereço e o protocolo; endpoints de terceiros podem ser configurados em “Personalizado”. O Wechatai encaminha as solicitações conforme o protocolo do canal.
2. **Recebe as mensagens do WeChat**: o plugin WeChat ClawBot transforma a mensagem em uma solicitação ao modelo e devolve a resposta à conversa.
3. **Adiciona o que só existe no WeChat**: gerenciamento de conversas, comandos, plugins, notificações e medição de credits.

O resultado do modelo nesse caminho depende do modelo que você escolher; o custo das chamadas é cobrado pelo seu provedor de API; o Wechatai cobra credits pela parte de texto com base em tokens ponderados, e a geração de imagens custa 5 credits por imagem, com o texto da descrição à parte. As duas contas são separadas.

${CLOUD_AGENT_COST_NOTE}Primeiro configure um modelo de texto e uma API key em “Canais e modelos”, depois habilite a Xiaowei liberada. Sem um modelo definido separadamente, ela segue o modelo comum selecionado para aquele WeChat e, ao entrar no plugin, mantém o último modelo comum; defina um modelo fixo no plugin quando precisar. As etapas de configuração e uso estão no [guia da Xiaowei](/docs/cloud-agent).`,
    },
    {
      id: "what-you-can-do",
      title: "O que dá para fazer depois de conectar ao WeChat",
      body: `Além das perguntas comuns, o Wechatai traz alguns cenários de uso frequente, todos acessíveis por comandos no WeChat:

| Plugin | O que faz | Para quem |
| --- | --- | --- |
| DS Chat | O modelo pesquisa ou lê páginas web quando necessário, usando sua própria API de busca | Quem precisa de informação atualizada |
| Geração de imagens | Gera imagens com o seu modelo de imagem | Criação de materiais e ilustrações |
| Role-play | Cartões de personagem, personalidade e memória da história | Escrita e conversa |
| Assistente pessoal | Notas, finanças, tarefas e lembretes programados | Organização do dia a dia |
| OpenClaw / Hermes | Conecta seu próprio agente ao WeChat | Automação e execução de tarefas |
| Notificações | Envio por webhook HTTP para o WeChat | Pedidos, alertas e resultados de tarefas |

O DS Chat também pode responder diretamente; entrar no plugin não significa que toda resposta passa por verificação online.

Envie \`/wx plugins\` para ver os aliases configurados e depois \`/use alias\` para entrar ou trocar de plugin (por exemplo, \`/use ds\`); aqui se usa o alias curto, não o nome exibido do plugin. Para voltar ao chat comum, envie \`/exit\`; para ver o estado atual, envie \`/wx status\`. Cada plugin tem um artigo próprio na [documentação](/docs). As notificações recebem envios por HTTP e não exigem entrar no modo de conversa.`,
    },
    {
      id: "models",
      title: "Quais modelos podem ser conectados",
      body: `Basta que o provedor ofereça um dos três protocolos acima. Entre os mais comuns:

- **DeepSeek**: preço baixo e bom desempenho em português e chinês, uma escolha principal para perguntas e textos do dia a dia. As etapas estão em [Usar DeepSeek no WeChat](/docs/deepseek-in-wechat).
- **Claude**: mais estável para entender textos longos e ler código, adequado para documentos extensos.
- **Série GPT**: o ecossistema mais completo, com suporte maduro a plugins e chamadas de ferramentas.
- **Serviços próprios ou intermediários**: desde que o endereço seja compatível com um dos protocolos, incluindo gateways que você mesmo mantenha.

É possível configurar vários modelos em um mesmo link do WeChat. Use \`/wx models\` para ver os números dos modelos do canal atual e \`/wx model número\` para trocar; entre canais, envie primeiro \`/wx channels\` para ver os números e depois \`/wx channel número\`. A troca não exige vincular de novo, mas entra na conversa própria do modelo de destino. Também é possível vincular vários links do WeChat ao mesmo tempo (o Plus suporta 10), separando a conta de trabalho da pessoal.`,
    },
    {
      id: "cost",
      title: "Como os custos são calculados",
      body: `Com sua própria API, o custo se divide em duas partes:

- **Os credits do Wechatai**: na parte de texto, cada 5.000 tokens ponderados = 1 credit, com a saída contando com peso 8; a geração de imagens custa 5 credits por imagem, com o texto da descrição à parte. O plano Free inclui 100 credits por dia e o Plus inclui 1.000 credits por dia.
- **Taxas da API do modelo**: cobradas pelo seu provedor de API conforme a tabela de preços dele. O Wechatai não intermedeia nem acrescenta margem.

${CLOUD_AGENT_COST_NOTE}

As notificações do plugin de mensagens não consomem credits. Anexos (imagens e arquivos) exigem Plus. Preços e cotas detalhados estão na [página de preços](/pricing) e em [Assinatura e credits](/docs/credits).`,
    },
    {
      id: "fit",
      title: "Quando faz sentido e quando não faz",
      body: `**Faz sentido**: você já usa a API de algum modelo e quer tê-la à mão no WeChat; não quer instalar vários apps no celular; quer reunir pequenas ferramentas (finanças, lembretes, imagens) em um único ponto de entrada; quer chamar seu próprio agente pelo WeChat.

**Confirme antes de escolher**: se precisar de tarefas em segundo plano, veja primeiro o status de liberação na nuvem na página do plugin; por padrão, a nuvem usa o modelo comum daquele WeChat, mas também pode ser definida separadamente. A nuvem exige Plus, ainda consome credits e limita o número de execuções; não é um modelo gratuito ilimitado. Equipes que precisam de auditoria de conformidade e isolamento de dados em nível empresarial devem seguir o processo de compra corporativa; este site é uma ferramenta para uso pessoal.

O Wechatai é um projeto open source sob a licença MIT, com código público, e também pode ser implantado por você.`,
    },
  ],
  faq: [
    {
      question: "O WeChat AI é um recurso oficial do WeChat?",
      answer:
        "Não. Os recursos de IA oficiais do WeChat são funcionalidades integradas, como busca no histórico de conversas e sugestões de digitação. O Wechatai é um serviço de terceiros que, pelo plugin WeChat ClawBot, conecta seu próprio modelo ao chat do WeChat, sem interferir nos recursos oficiais.",
    },
    {
      question: "Para usar IA no WeChat, preciso preparar minha própria API key?",
      answer: `O chat comum com modelos exige primeiro abrir uma conta no provedor do modelo e obter uma API key, que você insere nas configurações de canal do Wechatai. ${CLOUD_AGENT_COST_NOTE}As etapas completas estão no guia da Xiaowei.`,
    },
    {
      question: "Quantos modelos um único WeChat pode usar ao mesmo tempo?",
      answer:
        "É possível adicionar vários canais e modelos em um mesmo link do WeChat. Use /wx models para ver os números e /wx model número para trocar; entre canais, use primeiro /wx channels e /wx channel número. O plano Free permite vincular 1 link do WeChat; o Plus permite 10.",
    },
    {
      question: "Se eu trocar de modelo, o contexto da conversa continua?",
      answer:
        "As conversas e o histórico antigos são mantidos, mas a troca leva à conversa ativa mais recente do modelo de destino ou cria uma nova. O contexto atual não é transferido automaticamente. Se você estava em um plugin, também sai do modo de plugin. Para abrir uma conversa em branco com o modelo de destino, envie /wx new; para redefinir o contexto da conversa atual, envie /wx reset.",
    },
    {
      question: "Só com a cota grátis dá para o uso diário?",
      answer:
        "O plano Free inclui 100 credits por dia, o que equivale aproximadamente a dezenas de milhares de tokens de perguntas e respostas por dia; para perguntas pessoais do dia a dia, costuma ser suficiente. A saída conta com peso 8, então textos longos consomem mais rápido. Se faltar, compre um pacote de credits ou faça upgrade para o Plus.",
    },
    {
      question: "A IA funciona quando o celular não está por perto?",
      answer:
        "Sim. As chamadas ao modelo acontecem no servidor. Apenas agentes conectados ao seu próprio dispositivo (como OpenClaw ou Hermes) dependem de esse dispositivo estar online. Perguntas comuns, geração de imagens e plugins de assistente não dependem da conexão do seu celular.",
    },
  ],
  related: [
    { label: "Usar DeepSeek no WeChat", href: "/wechat-deepseek" },
    { label: "Usar GPT no WeChat", href: "/wechat-gpt" },
    { label: "Como funciona o plugin WeChat ClawBot", href: "/wechat-clawbot" },
    { label: "Usar IA no WeChat pode bloquear minha conta?", href: "/wechat-ai-ban-risk" },
    { label: "WeChat AI com sua própria API key", href: "/bring-your-own-api-key" },
    { label: "Comparar opções de conexão", href: "/wechat-ai-options" },
    { label: "Preços e cota grátis", href: "/pricing" },
    { label: "Primeiros passos", href: "/docs/getting-started" },
    { label: "Referência de comandos do WeChat", href: "/docs/commands" },
  ],
  updatedAt: "2026-11-12",
};

export default [
  {
    path: "/wechat-ai",
    title: "WeChat AI: conecte seu próprio LLM ao chat do WeChat | Wechatai",
    description: content.description,
    updatedAt: "2026-11-21",
    content,
  },
] satisfies readonly TranslationPage[];
