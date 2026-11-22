export const seoCopy = {
  organizationDescription:
    "Serviço mantido de forma independente que conecta modelos de IA e agentes a conversas individuais do WeChat ClawBot. Sem vínculo oficial com a Tencent ou o WeChat.",
  freeOfferDescription: (connections: number, plugins: number) =>
    `Inclui credits diários, ${connections} conexão do WeChat e ${plugins} configuração de plugin.`,
  serviceName: "Wechatai Free e Plus",
  serviceType: "Serviço de integração de IA ao WeChat",
  featureList: [
    "Use sua própria API key e endpoint de modelo",
    "Alterne modelos e gerencie conversas no WeChat",
    "Compatível com OpenAI Chat Completions, Responses e Anthropic Messages",
    "Conecte agentes Muse, Hermes e OpenClaw existentes",
    "Configure um modelo de imagem para gerar e receber imagens no WeChat",
    "Personalize personagens e histórias com o plugin de role-play",
    "A assistente em nuvem Xiaowei, do Plus, processa arquivos, cria documentos e executa tarefas; exige um modelo de texto",
  ],
  imageAlt: "Wechatai: converse com os modelos que você escolher no WeChat.",
} as const;
