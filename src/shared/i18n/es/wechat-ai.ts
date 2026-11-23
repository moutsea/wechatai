import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";
import { DAILY_CREDIT_DEFAULTS, IMAGE_CREDITS } from "../../credits";
import { WECHAT_LINK_LIMITS } from "../../wechat-links";
import { CLOUD_AGENT_COST_NOTE_ES, OWN_API_COST_NOTE_ES } from "./copy/notes";

/**
 * Spanish body for /wechat-ai. Facts, amounts and limits mirror
 * `src/shared/seo-content/wechat-ai.ts`; links stay canonical so the renderer
 * localizes the ones that are published in this locale.
 */
export const wechatAiContent: SeoPage = {
  path: "/wechat-ai",
  kind: "product",
  title: "IA para WeChat: conecta tu propio modelo de lenguaje",
  description:
    "La IA para WeChat consiste en llamar a un modelo de lenguaje directamente dentro de WeChat. Trae tu propia clave de API a Wechatai; cuando el operador lo habilite, el asistente en la nube Plus Xiaowei usa tu propio modelo, consume créditos y limita las ejecuciones.",
  eyebrow: "IA para WeChat",
  h1: "IA para WeChat: lleva tu propio modelo al chat de WeChat",
  lede: "Sin cambiar de aplicación y sin copiar preguntas en una página web. Conecta un modelo con tu propia clave de API; si necesitas tareas en segundo plano, comprueba en la página de plugins si el asistente en la nube Plus Xiaowei está disponible. Sigue por defecto el modelo normal del perfil de WeChat y también puede configurarse aparte.",
  answer: `La IA para WeChat consiste en llamar a un modelo de lenguaje grande directamente dentro de WeChat para preguntas, redacción, traducción, generación de imágenes y gestión de tareas. Wechatai admite claves de API propias y también ofrece el asistente en la nube Xiaowei. ${OWN_API_COST_NOTE_ES} ${CLOUD_AGENT_COST_NOTE_ES}`,
  primaryKeyword: "IA para WeChat",
  secondaryKeywords: [
    "asistente de IA para WeChat",
    "conectar IA a WeChat",
    "usar ChatGPT en WeChat",
    "bot de IA para WeChat",
    "llamar a un modelo de lenguaje desde WeChat",
  ],
  highlights: [
    "Trae tu propia clave de API, con costes transparentes",
    "Cambia entre varios modelos en un mismo WeChat",
    "Seis plugins de uso diario integrados",
  ],
  steps: [
    {
      title: "Configura tu propia API: regístrate y añade un canal",
      text: "Elige un proveedor e introduce su clave de API, confirma que se importó un modelo de texto o añade uno manualmente y pulsa Probar conexión en la fila del modelo. Usa la entrada Personalizado para endpoints de terceros.",
    },
    {
      title: "Escanea el código QR para conectar WeChat",
      text: "Cuando el canal y el modelo de texto estén configurados, genera un código QR. En WeChat, abre Ajustes, entra en el grupo Funciones y luego en Plugins → WeChat ClawBot → Escanear para vincular.",
    },
    {
      title: "Envía un mensaje",
      text: "Haz una pregunta en el chat. Usa /wx models para ver los números de modelo, /wx model <número> para cambiar y /wx status para comprobar el estado actual.",
    },
  ],
  sections: [
    {
      id: "what",
      title: "«IA para WeChat» suele significar tres cosas distintas",
      body: `Los resultados de búsqueda de «IA para WeChat» suelen mezclar tres cosas. Sepáralas primero para saber cuál necesitas:

- **IA integrada en WeChat**: funciones ligeras como la búsqueda en el historial de chat y las sugerencias del teclado. WeChat decide el modelo y la cuota, y tú no puedes sustituirlo por el tuyo.
- **IA dentro de una cuenta oficial o un miniprograma**: preguntas dentro de esa cuenta o miniprograma, no puedes salir de esa ventana y el contexto no te acompaña a otro sitio.
- **Un modelo conectado al chat de WeChat**: la IA se convierte en un contacto de WeChat que usas como a un amigo. Puedes cambiar de modelo, conservar el contexto y añadir plugins. Wechatai hace lo tercero.

La diferencia principal entre la tercera opción y una herramienta de IA generativa es el punto de entrada. Una herramienta te pide abrir una página web, iniciar sesión y pegar la pregunta. Cuando el modelo está conectado a WeChat, el propio WeChat es la entrada: reenviar un texto, hacer una foto o enviar un mensaje de voz pueden convertirse en entrada.`,
    },
    {
      id: "how-it-works",
      title: "Cómo conecta Wechatai un modelo a WeChat",
      body: `Wechatai no es un proveedor de modelos ni revende tokens. Cuando usas tu propia API, hace tres cosas:

1. **Guarda tu clave**: elige un proveedor e introduce la clave de API al añadir un canal, luego importa o añade un modelo. Los ajustes predefinidos rellenan el endpoint y el protocolo; los endpoints de terceros pueden configurarse con Personalizado. Wechatai reenvía las solicitudes según el protocolo del canal.
2. **Recibe los mensajes de WeChat**: el plugin WeChat ClawBot convierte los mensajes en solicitudes al modelo y devuelve las respuestas a la ventana del chat.
3. **Añade lo que solo WeChat necesita**: gestión de sesiones, comandos, plugins, notificaciones programadas y medición de créditos.

Con esta ruta, la calidad del modelo depende del modelo que elijas. Tu proveedor de API cobra el uso del modelo; Wechatai cobra créditos por el texto según tokens ponderados, las imágenes generadas con IA cuestan ${IMAGE_CREDITS} créditos cada una con el texto de la descripción facturado aparte, y ambas facturas se liquidan por separado.

${CLOUD_AGENT_COST_NOTE_ES} Primero configura un modelo de texto y una clave de API utilizables en Canales y modelos, y después habilita Xiaowei donde esté disponible. Si no le asignas un modelo aparte, sigue el modelo normal seleccionado para ese perfil de WeChat y mantiene el último modelo normal al entrar en el plugin; asigna un modelo fijo en el plugin cuando lo necesites. Para la configuración y el uso, consulta la [guía de Xiaowei](/docs/cloud-agent).`,
    },
    {
      id: "what-you-can-do",
      title: "Qué puedes hacer tras conectar WeChat",
      body: `Además de las preguntas normales, Wechatai incluye varios escenarios frecuentes entre los que puedes cambiar con comandos en WeChat:

| Plugin | Qué hace | Para quién |
| --- | --- | --- |
| DS Chat | El modelo busca o lee la web cuando hace falta, usando tu propia API de búsqueda | Quien necesita información actual |
| Imágenes con IA | Genera imágenes con tu propio modelo de imagen | Quien crea recursos o ilustraciones |
| Juego de rol | Tarjetas de personaje, personalidades y memoria de la historia | Escritura y conversación informal |
| Asistente personal | Notas, gastos, tareas pendientes y recordatorios programados | Gestión diaria |
| OpenClaw / Hermes | Conecta tu propio agente a WeChat | Automatización y ejecución de tareas |
| Notificaciones | Envía webhooks HTTP a WeChat | Pedidos, alertas y resultados de tareas |

DS Chat también puede responder directamente; entrar en el plugin no significa que todas las respuestas se hayan verificado en línea.

Primero envía \`/wx plugins\` para ver los alias configurados y luego \`/use <alias>\` para entrar o cambiar de plugin (por ejemplo, \`/use ds\`). Son alias rápidos, no los nombres visibles del plugin. Envía \`/exit\` para volver al chat normal y \`/wx status\` para ver el estado actual. Cada plugin tiene su propia página en la [documentación de uso](/docs). Las notificaciones reciben envíos por HTTP y no requieren entrar en el modo de chat.`,
    },
    {
      id: "models",
      title: "Qué modelos puedes conectar",
      body: `Cualquier proveedor que ofrezca uno de los tres protocolos anteriores puede conectarse. Algunas opciones habituales:

- **DeepSeek**: bajo coste y buen rendimiento en chino, una opción principal para preguntas y redacción diarias. Consulta [Usar DeepSeek en WeChat](/docs/deepseek-in-wechat) para la configuración.
- **Claude**: comprensión más estable de documentos largos y lectura de código, útil para archivos extensos.
- **Serie GPT**: el ecosistema más amplio, con soporte maduro de plugins y llamadas a herramientas.
- **Servicios autoalojados o de retransmisión**: cualquier cosa compatible con los protocolos anteriores, incluida tu propia pasarela.

Un enlace de WeChat puede tener varios modelos. Usa \`/wx models\` para ver los números de modelo del canal actual y luego \`/wx model <número>\` para cambiar. Entre canales, envía primero \`/wx channels\` y luego \`/wx channel <número>\`. El cambio no requiere volver a vincular, pero entras en la sesión propia del modelo de destino. También puedes vincular varios enlaces de WeChat a la vez (Plus admite ${WECHAT_LINK_LIMITS.plus} enlaces) para separar el trabajo de la cuenta personal.`,
    },
    {
      id: "cost",
      title: "Cómo se calculan los costes",
      body: `Con tu propia API, los costes se dividen en dos partes:

- **Créditos de Wechatai**: el texto cuesta 1 crédito por cada 5.000 tokens ponderados, con la salida contada con un peso de 8×; las imágenes generadas con IA cuestan ${IMAGE_CREDITS} créditos cada una, con el texto de la descripción facturado aparte. El plan gratuito incluye ${DAILY_CREDIT_DEFAULTS.free} créditos al día y Plus incluye ${DAILY_CREDIT_DEFAULTS.plus} créditos al día.
- **Tarifas de la API del modelo**: las cobra tu proveedor de API según su propia lista de precios. Wechatai no las gestiona ni les añade margen.

${CLOUD_AGENT_COST_NOTE_ES}

Las notificaciones por webhook no consumen créditos. Los archivos adjuntos (imágenes y documentos) requieren Plus. Para precios y cuotas actuales, consulta [Precios](/pricing) y [Membresía y créditos](/docs/credits).`,
    },
    {
      id: "fit",
      title: "Cuándo encaja y cuándo no",
      body: `**Encaja si**: ya usas una API de modelo y quieres tenerla disponible en WeChat; no quieres muchas aplicaciones en el teléfono; quieres pequeñas herramientas (notas, recordatorios, generación de imágenes) detrás de un solo punto de entrada; o quieres llamar a tu propio agente de forma remota desde WeChat.

**Compruébalo antes**: cuando necesites ejecución en segundo plano, revisa el estado de disponibilidad en la nube en la página de plugins. Las tareas en la nube siguen por defecto el modelo normal del perfil de WeChat y también pueden configurarse aparte. Las tareas en la nube requieren Plus, siguen consumiendo créditos y tienen un límite de ejecuciones; no son un modelo gratuito ilimitado. Los equipos que necesiten auditorías de cumplimiento empresarial y aislamiento de datos deben seguir un proceso formal de compra empresarial; este sitio es una herramienta de uso personal.

Wechatai es un proyecto de código abierto con licencia MIT; el código es público y también puedes desplegarlo por tu cuenta.`,
    },
  ],
  faq: [
    {
      question: "¿La IA para WeChat es una función oficial de WeChat?",
      answer:
        "No. Las capacidades de IA oficiales de WeChat son funciones integradas como la búsqueda en el historial de chat y las sugerencias del teclado. Wechatai es un servicio de terceros que conecta tu propio modelo al chat de WeChat mediante el plugin WeChat ClawBot, sin interferir con las funciones oficiales.",
    },
    {
      question: "¿Necesito mi propia clave de API para usar IA en WeChat?",
      answer: `El chat normal con modelos requiere abrir primero una cuenta en el proveedor del modelo, obtener una clave de API e introducirla en la configuración de canales de Wechatai. ${CLOUD_AGENT_COST_NOTE_ES} Los pasos completos están en la guía de Xiaowei.`,
    },
    {
      question: "¿Cuántos modelos puede usar un mismo WeChat a la vez?",
      answer: `En un enlace de WeChat pueden añadirse varios canales y modelos. Usa /wx models para ver los números y luego /wx model <número> para cambiar; entre canales, usa primero /wx channels y /wx channel <número>. El plan gratuito permite vincular ${WECHAT_LINK_LIMITS.free} enlace de WeChat y Plus permite ${WECHAT_LINK_LIMITS.plus}.`,
    },
    {
      question: "Si cambio de modelo, ¿se conserva el contexto de la conversación?",
      answer:
        "La conversación anterior y su historial se conservan, pero al cambiar entras en la sesión activa más reciente del modelo de destino o se crea una nueva; el contexto actual no se transfiere automáticamente. Si estabas dentro de un plugin, también sales del modo de plugin. Para abrir una conversación vacía con el modelo de destino, envía /wx new; para reiniciar el contexto de la conversación actual, envía /wx reset.",
    },
    {
      question: "Con solo la cuota gratuita, ¿alcanza para el uso diario?",
      answer: `El plan gratuito incluye ${DAILY_CREDIT_DEFAULTS.free} créditos al día, aproximadamente el equivalente a decenas de miles de tokens de preguntas y respuestas diarias, normalmente suficiente para el uso personal. La salida se cuenta con un peso de 8×, así que generar textos largos consume más rápido; si no te alcanza, puedes comprar un paquete de créditos o pasar a Plus.`,
    },
    {
      question: "¿Puedo usar la IA si no tengo el teléfono cerca?",
      answer:
        "Sí. Las llamadas al modelo se realizan en el servidor. Solo los agentes conectados a tu propio dispositivo (por ejemplo, OpenClaw o Hermes) dependen de que ese dispositivo esté en línea. Las preguntas normales, la generación de imágenes y los plugins de asistente no dependen de que tu teléfono tenga conexión.",
    },
  ],
  related: [
    { label: "Usar DeepSeek en WeChat", href: "/wechat-deepseek" },
    { label: "Usar GPT en WeChat", href: "/wechat-gpt" },
    { label: "Cómo funciona el plugin WeChat ClawBot", href: "/wechat-clawbot" },
    {
      label: "¿Puede provocar el bloqueo de mi cuenta usar IA en WeChat?",
      href: "/wechat-ai-ban-risk",
    },
    { label: "IA para WeChat con tu propia clave de API", href: "/bring-your-own-api-key" },
    { label: "Comparar opciones de conexión", href: "/wechat-ai-options" },
    { label: "Precios y cuota gratuita", href: "/pricing" },
    { label: "Guía de inicio", href: "/docs/getting-started" },
    { label: "Referencia de comandos de WeChat", href: "/docs/commands" },
  ],
  updatedAt: "2026-11-12",
};

export default [
  {
    path: "/wechat-ai",
    title: "IA para WeChat: conecta tu propio modelo de lenguaje | Wechatai",
    description: wechatAiContent.description,
    updatedAt: "2026-11-21",
    content: wechatAiContent,
  },
] satisfies readonly TranslationPage[];
