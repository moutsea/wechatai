import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";

const CLOUD_AGENT_COST_NOTE =
  "A Xiaowei fica disponível para membros Plus quando o operador a libera. Ela usa o modelo de texto que você configurou no Wechatai, e as taxas de API do modelo são pagas separadamente ao provedor. A plataforma cobra credits pelo texto de entrada da tarefa e da resposta final, e cada imagem devolvida custa 5 credits; arquivos que não são imagens não têm cobrança extra. O número de execuções tem limite separado.";

const content: SeoPage = {
  path: "/wechat-bot",
  kind: "comparison",
  title: "Como criar um bot para WeChat: três rotas e seus riscos",
  description:
    "Há três formas de criar um bot para WeChat: bot de protocolo em conta pessoal, aplicativo próprio no WeCom e plugin WeChat ClawBot. Este guia compara casos de uso e riscos de bloqueio e explica o que a rota Wechatai pode e não pode fazer.",
  eyebrow: "Bot para WeChat",
  h1: "Como criar um bot para WeChat: escolha a rota certa primeiro",
  lede: "O termo de busca “bot para WeChat” mistura três coisas bem diferentes: um bot que responde amigos automaticamente, um aplicativo para empresas e um assistente de IA dentro do canal oficial de plugins. Se escolher a rota errada, todo tutorial seguinte será desperdiçado.",
  answer:
    "Hoje existem três rotas para criar um bot para WeChat. A primeira usa protocolo ou injeção de cliente em uma conta pessoal para responder automaticamente; é uma ferramenta de terceiros, viola as regras da plataforma e corre risco de bloqueio, então este site não a recomenda. A segunda cria um aplicativo próprio no WeCom para uso interno, em que as mensagens passam pelo WeCom e não pelo WeChat pessoal. A terceira autoriza um serviço em Configurações → Plugins → WeChat ClawBot, a entrada oficial usada pelo Wechatai.",
  primaryKeyword: "bot para WeChat",
  secondaryKeywords: [
    "bot de IA para WeChat",
    "resposta automática com IA no WeChat",
    "como criar um bot para WeChat",
  ],
  highlights: [
    "Separe as três rotas antes de tudo",
    "Sem esconder o risco do protocolo em conta pessoal",
    "O Wechatai usa a entrada oficial do ClawBot",
  ],
  sections: [
    {
      id: "routes",
      title: "Três rotas em uma tabela",
      body: `| Rota | Para quem | O que precisa | Principal limite |
| --- | --- | --- | --- |
| Bot de protocolo em conta pessoal | Quem quer responder amigos automaticamente ou enviar mensagens em massa | Uma ferramenta de terceiros, normalmente exigindo as credenciais da conta | Cliente não oficial, viola as regras da plataforma, risco de bloqueio |
| Aplicativo próprio no WeCom | Alertas e rotinas internas de empresas e equipes | Permissão de administrador do WeCom, configuração do aplicativo e dos callbacks | Voltado à organização; as mensagens ficam no WeCom, não no WeChat pessoal |
| Plugin WeChat ClawBot | Pessoas que querem usar IA no próprio WeChat | Uma plataforma que ofereça IA no servidor | Só permite conversar em chat individual, e a plataforma precisa suportar a conexão pelo ClawBot |

As três rotas não se diferenciam por “qual é mais poderosa”, mas por “qual cabe nas regras”. Veja cada uma a seguir.`,
    },
    {
      id: "protocol-bot",
      title: "Bot de protocolo em conta pessoal: responde sozinho, mas pode bloquear a conta",
      body: `Essas ferramentas normalmente simulam o login do cliente do WeChat (as expressões mais comuns são protocolo de iPad e protocolo de PC) ou injetam código no cliente para enviar e receber mensagens e responder automaticamente.

Ele realmente consegue “o amigo manda uma mensagem e o bot responde”, mas é justamente aí que está o problema: o [Contrato de Licença e Serviço de Software do WeChat da Tencent](https://oper.my-qcloud.com/cgi-bin/readtemplate?lang=zh_CN&s=default&t=weixin_agreement) restringe expressamente o uso de software, plugins, add-ons ou clientes de terceiros não desenvolvidos ou autorizados pela Tencent para entrar ou operar o WeChat. A definição de add-on do suporte da Tencent também inclui emuladores e a execução de várias instâncias de clientes não oficiais.

A consequência concreta não é “bloqueio garantido”, mas sim que **o poder de punição fica inteiramente com a plataforma**: pode restringir parte dos recursos ou bloquear a conta diretamente, sem prometer aviso prévio. Mais realista ainda: esse tipo de solução costuma exigir que você entregue as credenciais da conta a uma ferramenta de terceiros, o que também compromete a segurança da conta.

Este site não oferece tutorial de operação nem recomenda usar esse tipo de ferramenta em contas pessoais. Mecanismos de risco, níveis de punição e uma lista de verificação estão em [Usar IA no WeChat pode bloquear minha conta?](/wechat-ai-ban-risk).`,
    },
    {
      id: "wecom",
      title: "Aplicativo próprio no WeCom: para organizações, não para o WeChat pessoal",
      body: `Se a necessidade é “avisos e perguntas dentro da empresa”, o caminho correto é um **aplicativo próprio no WeCom**: o administrador cria o aplicativo no painel, configura o endereço de callback e o domínio confiável para receber mensagens, e o servidor valida a assinatura antes de enviar e receber.

Os limites são claros:

- As mensagens circulam no **WeCom**, não no seu WeChat pessoal. Usá-lo para responder automaticamente a amigos pessoais não faz parte desta rota.
- Exige permissão de administrador do WeCom; um usuário comum não consegue habilitá-lo sozinho.
- Conversas com clientes externos do WeChat envolvem recursos e permissões de “contato do cliente”, com custo de configuração e requisitos de conformidade maiores.

Por isso ele serve para assistentes internos, bots de alerta, aprovações e perguntas sobre conhecimento, mas não substitui um “assistente de IA para o WeChat pessoal”.`,
    },
    {
      id: "clawbot",
      title: "Plugin WeChat ClawBot: a entrada oficial para usuários individuais",
      body: `O próprio WeChat abriu um canal para IA: em “Eu → Configurações”, no grupo “Recursos”, entre em “Plugins → WeChat ClawBot” e use o escanear para vincular um serviço que ofereça IA. Um contato de IA aparece no WeChat.

- O canal em si não fornece modelo; quem responde é o serviço vinculado.
- Não é preciso modificar o cliente do WeChat nem simular login por protocolo.
- A vinculação fica do lado da conta do WeChat: trocar de celular não afeta; trocar de conta exige escanear de novo.

O Wechatai segue essa rota: primeiro configure sua própria API key e o modelo de texto, depois vincule escaneando com o WeChat ClawBot; para usar a assistente em nuvem Xiaowei, do Plus, quando liberada, adicione e habilite o plugin e envie \`/use atalho\` para entrar. Sem um modelo definido separadamente, ela segue o modelo comum selecionado para aquele WeChat e, ao entrar no plugin, mantém o último modelo comum; defina um modelo fixo no plugin quando precisar. **Não existe forma de contornar a vinculação pelo ClawBot**, e o “Escanear” comum não substitui o fluxo de vinculação do plugin. As etapas completas estão em [Como funciona o plugin WeChat ClawBot](/wechat-clawbot).`,
    },
    {
      id: "scope",
      title: "O que o Wechatai pode e não pode fazer",
      body: `| Pode | Não pode |
| --- | --- |
| Conversar no chat individual do ClawBot e trocar de modelo e plugin | Usar em grupos ou oferecer um interruptor de grupo |
| Responder com busca online, gerar imagens por IA, role-play, assistente pessoal e notificações | Responder automaticamente aos seus amigos do WeChat ou substituir sua interação social |
| Conectar agentes OpenClaw e Hermes no seu dispositivo | Ler a agenda de contatos ou obter a lista de amigos |
| O Plus permite vincular até 10 links do WeChat | Adicionar amigos automaticamente, enviar mensagens em massa ou operar o Moments |

O Wechatai é uma plataforma de intermediação e plugins que conecta modelos e agentes ao WeChat. Ao usar sua própria API, as taxas do modelo são pagas separadamente ao seu provedor; a parte de texto é cobrada em credits por tokens ponderados. O plano Free inclui 100 credits por dia, 1 link do WeChat e 1 plugin; o Plus custa ¥9.9/mês ou ¥88/ano.

${CLOUD_AGENT_COST_NOTE}A configuração está no [guia da Xiaowei](/docs/cloud-agent).`,
    },
    {
      id: "risk",
      title: "Limite de risco: a entrada oficial também não é risco zero",
      body: `Usar a entrada oficial do ClawBot significa não alterar o cliente nem simular protocolo; esse tipo de risco não existe. Mas isso **não isenta a conta da gestão de comportamento**: se a conta também fizer envio em massa de marketing, usar add-ons ou rodar várias instâncias de clientes não oficiais, ela ainda pode ser penalizada pela plataforma.

Outro risco frequentemente ignorado é o da cadeia de suprimentos: se você conecta um agente com capacidade de executar ferramentas, instruções dentro de skills ou plugins de terceiros também podem causar problemas; esse risco não tem relação com a IA em si.

O critério pode ser resumido em uma frase: **a entrada é oficial e o comportamento da conta parece o de um usuário normal?** Quando as duas condições valem, o risco não é essencialmente diferente do uso cotidiano do WeChat; nenhum serviço de terceiros pode garantir que a conta nunca será restringida.`,
    },
  ],
  faq: [
    {
      question: "Existe bot para WeChat grátis?",
      answer:
        "Sim. O plano Free do Wechatai não cobra nada e inclui 100 credits por dia, 1 link do WeChat e 1 plugin, usando o canal do plugin WeChat ClawBot. Ao usar seu próprio modelo, as chamadas de API são pagas separadamente ao provedor do modelo, em uma conta diferente dos credits. A Xiaowei exige Plus e que o serviço esteja liberado.",
    },
    {
      question: "Um bot em conta pessoal do WeChat pode ser bloqueado?",
      answer:
        "Há risco de bloqueio. Bots de protocolo em conta pessoal exigem simular o cliente ou injetar código, o que é uma ferramenta de terceiros expressamente restrita pela plataforma. A punição fica a critério da plataforma, que pode restringir recursos ou bloquear a conta, sem prometer aviso prévio. Este site não recomenda o uso.",
    },
    {
      question: "Um aplicativo próprio no WeCom pode responder automaticamente a amigos no WeChat pessoal?",
      answer:
        "Não substitui o WeChat pessoal. As mensagens de um aplicativo próprio no WeCom circulam dentro do WeCom e exigem configuração do administrador da empresa; conversas com clientes externos do WeChat ainda precisam de permissões de contato do cliente e não servem para um usuário comum responder automaticamente aos próprios amigos.",
    },
    {
      question: "O Wechatai suporta grupos?",
      answer:
        "Atualmente não. O Wechatai trata apenas mensagens do chat individual entre você e o WeChat ClawBot, sem interruptor de grupo; @atalho é a sintaxe para chamar um plugin no chat individual, não um recurso de grupo.",
    },
    {
      question: "Para criar um bot com o Wechatai preciso instalar um cliente ou deixar o computador ligado?",
      answer:
        "A conversa comum e os plugins integrados não exigem. Configure sua própria API key e vincule o WeChat escaneando o código; as chamadas ao modelo acontecem no servidor. Apenas ao conectar um agente que roda na sua máquina, como OpenClaw ou Hermes, é que esse dispositivo precisa permanecer online.",
    },
  ],
  related: [
    { label: "Usar IA no WeChat pode bloquear minha conta?", href: "/wechat-ai-ban-risk" },
    { label: "Comparar as formas de usar IA no WeChat", href: "/wechat-ai-options" },
    { label: "Como usar o plugin WeChat ClawBot", href: "/wechat-clawbot" },
    { label: "Conectar o WeChat (documentação)", href: "/docs/getting-started" },
    { label: "Preços e cota grátis", href: "/pricing" },
  ],
  updatedAt: "2026-11-12",
};

export default [
  {
    path: "/wechat-bot",
    title: "Como criar um bot para WeChat: três rotas e seus riscos | Wechatai",
    description: content.description,
    updatedAt: "2026-11-21",
    content,
  },
] satisfies readonly TranslationPage[];
