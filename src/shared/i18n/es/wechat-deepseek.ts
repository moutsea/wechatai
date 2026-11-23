import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";
import { DAILY_CREDIT_DEFAULTS } from "../../credits";

/**
 * Spanish body for /wechat-deepseek. Facts, commands and troubleshooting order
 * mirror `src/shared/seo-content/wechat-deepseek.ts`.
 */
export const wechatDeepseekContent: SeoPage = {
  path: "/wechat-deepseek",
  kind: "product",
  title: "Cómo usar DeepSeek en WeChat: configuración, costes y tutorial",
  description:
    "¿Quieres usar DeepSeek en WeChat? Conoce los requisitos de ClawBot, la clave de API, los créditos gratuitos y las tarifas del modelo, sigue un tutorial con capturas y resuelve problemas de acceso web, voz y falta de respuesta.",
  eyebrow: "DeepSeek × WeChat",
  h1: "¿Quieres usar DeepSeek en WeChat? Empieza aquí",
  lede: "No deberías cambiar de aplicación para hacer una sola pregunta. Conecta tu propia API de DeepSeek a WeChat y resuelve preguntas, redacción y organización del día a día en la ventana del chat. Comprueba primero los requisitos y luego sigue las capturas.",
  answer:
    "Para usar DeepSeek en WeChat puedes introducir una clave de API en Wechatai y dejar que aloje el chat normal, o ejecutar OpenClaw en tu propio dispositivo y conectarlo a WeChat. Ambos pueden usar la API de DeepSeek; la diferencia es quién lo ejecuta y lo mantiene. Wechatai sigue conectándose mediante el plugin ClawBot y no puede saltarse esa entrada.",
  primaryKeyword: "usar DeepSeek en WeChat",
  secondaryKeywords: [
    "cómo usar DeepSeek en WeChat",
    "tutorial para conectar DeepSeek a WeChat",
    "bot de DeepSeek para WeChat",
    "usar la API de DeepSeek en WeChat",
    "¿DeepSeek en WeChat es gratis?",
    "asistente DeepSeek para WeChat",
  ],
  highlights: [
    "El chat normal no necesita un equipo siempre encendido",
    "Empieza con Gratis; las tarifas del modelo se facturan aparte",
    "Tutorial con capturas y guía de resolución de problemas",
  ],
  ctaLabel: "Ver el tutorial de DeepSeek para WeChat",
  ctaHref: "/docs/deepseek-in-wechat",
  sections: [
    {
      id: "start-here",
      title: "Las cuatro preguntas que probablemente te importan",
      body: `| Tu pregunta | Respuesta con Wechatai |
| --- | --- |
| ¿Puedo usar DeepSeek dentro de WeChat? | Sí, mediante el chat directo de Wechatai entre tu propia API de DeepSeek y WeChat ClawBot; primero confirma que tu cuenta tiene la entrada. |
| ¿Tengo que instalar software o dejar un equipo encendido? | El chat normal con modelos se retransmite por los servidores de Wechatai, así que tu equipo no necesita estar encendido; solo un agente local necesita un dispositivo en línea. |
| ¿Es gratis? | Wechatai Gratis incluye ${DAILY_CREDIT_DEFAULTS.free} créditos de retransmisión al día; la API de DeepSeek la factura el proveedor por separado y no es una cuota gratuita de modelo. |
| ¿Por dónde empiezo? | Si ya tienes una clave y la entrada de WeChat, ve directamente al [tutorial de configuración con capturas](/docs/deepseek-in-wechat). Si falta la entrada, lee primero la [comprobación de ClawBot](/wechat-clawbot). |

Wechatai es una herramienta de conexión multimodelo, y DeepSeek es una de las opciones. También puedes configurar Claude, GPT u otros modelos compatibles y cambiar según lo necesites; el contexto no pasa de un modelo a otro automáticamente.`,
    },
    {
      id: "three-paths",
      title: "Chat alojado o agente local",
      body: `| | Chat normal alojado por Wechatai | Conexión local con OpenClaw |
| --- | --- | --- |
| Necesita un dispositivo siempre encendido | No | Sí |
| Necesita un agente instalado | No | Sí |
| Qué hay que mantener | Configuración del canal y saldo de la API | Además, el agente, las herramientas y los conectores |
| Para quién | Quien principalmente quiere conversar en WeChat | Quien necesita acceder a archivos, ejecutar herramientas y automatizar tareas |

Ambos pueden usar una clave de API de DeepSeek. **ClawBot es el canal del lado de WeChat**, no un servicio de chat alternativo que compita con Wechatai; cuando usas Wechatai, sigues vinculando mediante el escaneo de WeChat ClawBot.

Elegir OpenClaw local significa que tu dispositivo debe permanecer en línea. Con el chat normal alojado por Wechatai, la solicitud al modelo se retransmite por sus servidores, así que tu equipo puede estar apagado. Si conectas un OpenClaw local a través de Wechatai, el agente sigue ejecutándose en tu propio dispositivo.`,
    },
    {
      id: "key",
      title: "Primero consigue una clave; después elige la ruta",
      body: `El chat normal requiere una clave de API válida y saldo en el proveedor; un agente local también requiere un dispositivo en línea y un agente en ejecución. Ambas rutas necesitan primero la entrada de WeChat ClawBot.

Una vez elijas el chat alojado por Wechatai, abre el [tutorial de DeepSeek](/docs/deepseek-in-wechat): añade el canal campo por campo, comprueba el modelo, prueba la conexión, vincula WeChat y envía el primer mensaje. Esta página sirve para elegir un enfoque; los pasos y la gestión de errores están en el tutorial.

Comprueba el endpoint, el modelo y los precios en la [documentación oficial de la API de DeepSeek](https://api-docs.deepseek.com/zh-cn/); las solicitudes de prueba también pueden generar tarifas del proveedor.`,
    },
    {
      id: "byok-or-platform",
      title: "DeepSeek con tu propia clave o con crédito de la plataforma",
      body: `Traer tu propia clave te permite gestionar la cuenta del proveedor y la factura de forma independiente; el crédito de la plataforma puede reducir pasos de configuración. El coste total depende del modelo real, el volumen de entrada y salida, la caché, el plan y la vigencia de los créditos, y no puede deducirse solo de la frecuencia de uso.

Usa el [estimador de costes](/pricing#estimate) para calcular por separado los créditos de Wechatai y el precio unitario del modelo que introduzcas, y compáralo con la cotización de otra opción para el mismo uso. Sin datos de precios con el mismo criterio, no prometemos que una forma sea más barata.`,
    },
    {
      id: "config",
      title: "Configurado pero sin respuesta: cuatro problemas habituales de DeepSeek",
      body: `| Síntoma | Causa | Solución |
| --- | --- | --- |
| 401 / fallo de autenticación | La clave copiada tiene espacios de más o se eliminó | Crea una clave nueva y asegúrate de que no tiene espacios al principio ni al final |
| Modelo no encontrado | El nombre del modelo no coincide con la documentación de la plataforma | Compara el nombre del modelo carácter por carácter con la documentación del proveedor |
| Saldo insuficiente | El saldo de la cuenta del proveedor es 0 | Recarga y vuelve a intentarlo; recuerda que la factura del proveedor y los créditos de Wechatai son dos facturas distintas |
| Ninguna respuesta | Protocolo incorrecto (protocolo Anthropic contra un servicio compatible con OpenAI) | Cambia a OpenAI Chat Completions y vuelve a intentarlo |

Dos puntos fáciles de pasar por alto: **enviar demasiado texto largo de una vez supera el límite de entrada**, que puedes ajustar en la configuración del canal; **los archivos adjuntos requieren Plus**, mientras que las preguntas de solo texto no se ven afectadas. Para un orden de resolución más detallado, consulta [cómo funciona el plugin WeChat ClawBot](/wechat-clawbot#no-reply).`,
    },
    {
      id: "usage",
      title: "Para qué sirve DeepSeek tras conectar WeChat",
      body: `Con DeepSeek como modelo predeterminado, estos son los escenarios más cómodos:

- **Preguntas rápidas y traducción**: pregunta directamente en WeChat sin cambiar de aplicación.
- **Redacción y edición**: pega un párrafo largo para revisarlo; es más rápido que editar frase por frase en el teléfono.
- **Organizar historiales de chat pegados**: pega manualmente texto que tengas derecho a procesar y pide al modelo que extraiga conclusiones. Este sitio no se conecta a grupos de WeChat ni lee mensajes de grupo automáticamente.
- **Acceso web mediante DS Chat**: tras configurar tu propia API de búsqueda, el modelo busca o lee páginas cuando hace falta y también puede responder directamente; entrar en el plugin no significa que todas las respuestas se hayan verificado en línea.
- **Con el asistente personal**: notas, gastos, tareas pendientes y recordatorios programados requieren el plugin correspondiente, y el modelo elegido debe admitir llamadas a herramientas.

Si necesitas leer un documento largo o código, usa primero \`/wx models\` para ver los números del canal actual y luego \`/wx model <número>\` para cambiar a un modelo más adecuado. Entre canales, envía primero \`/wx channels\` y luego \`/wx channel <número>\`. Los registros anteriores se conservan, pero cada modelo continúa su propia sesión activa y el contexto no se comparte automáticamente; vuelve a facilitar el material en la sesión de destino.`,
    },
  ],
  faq: [
    {
      question: "¿Cómo uso DeepSeek en WeChat?",
      answer:
        "Primero confirma que el WeChat de tu teléfono tiene la entrada ClawBot; después añade un canal de DeepSeek en Wechatai, introduce tu propia clave de API y prueba el modelo. A continuación, escanea para conectar WeChat y envía texto en la conversación individual correspondiente. Los pasos completos y las capturas están en el tutorial de DeepSeek de este sitio.",
    },
    {
      question:
        "Mi WeChat no tiene la entrada ClawBot. ¿Puedo conectarme igualmente mediante Wechatai?",
      answer:
        "Por ahora no puedes completar la vinculación de WeChat. Wechatai no puede habilitar la entrada en tu cuenta ni ofrece una forma de saltarla. Lee primero la guía de la entrada de WeChat y no pagues ni envíes una clave de API antes de confirmar que está disponible; mientras tanto, puedes leer el tutorial de DeepSeek con capturas de este sitio.",
    },
    {
      question: "Tras conectarlo, ¿tiene acceso web como la versión web de DeepSeek?",
      answer:
        "El chat normal con la API no hereda automáticamente el acceso web de la versión web. Puedes configurar aparte el modelo de respuesta y el servicio de búsqueda de DS Chat; que se ejecute una búsqueda depende de la pregunta, del criterio del modelo y de la disponibilidad de la API, y las tarifas del modelo y de la búsqueda se facturan por separado.",
    },
    {
      question: "¿Usar DeepSeek en WeChat requiere dejar un equipo encendido?",
      answer:
        "Depende del método de conexión. Un OpenClaw autoalojado necesita un equipo siempre encendido y se desconecta al apagarlo; con un servicio de retransmisión vinculado por código QR, las llamadas al modelo se ejecutan en la nube y no necesitan tu equipo en línea.",
    },
    {
      question: "¿Puede usarse una misma clave de API de DeepSeek en varios sitios?",
      answer:
        "Sí, una clave no está limitada a una sola herramienta. Pero el uso de la misma clave se factura junto y es más difícil de atribuir, así que conviene crear claves separadas por finalidad.",
    },
    {
      question: "¿Cuál es la diferencia entre DeepSeek en WeChat y la versión web?",
      answer:
        "La conexión de WeChat usa el modelo de API que configures y no sincroniza tu cuenta, membresía ni historial de la versión web de DeepSeek. La voz depende de la transcripción de WeChat; la búsqueda, la generación de imágenes y el asistente personal deben configurarse aparte y no heredan automáticamente las funciones de la versión web.",
    },
    {
      question: "¿Cuesta dinero conectar DeepSeek?",
      answer: `Las llamadas al modelo se facturan según los precios oficiales de DeepSeek y se descuentan del saldo de tu cuenta. Con Wechatai hay además un coste en créditos según el volumen de texto de los mensajes; el plan gratuito incluye ${DAILY_CREDIT_DEFAULTS.free} créditos al día, y el número real de turnos depende de la entrada, la salida y el contexto del historial.`,
    },
    {
      question: "¿Puedo usar los modelos de razonamiento de DeepSeek?",
      answer:
        "Sí, siempre que el modelo se ofrezca mediante un endpoint compatible con OpenAI Chat Completions. Los modelos de razonamiento suelen producir respuestas más largas, lo que consume más créditos y más tokens del proveedor.",
    },
  ],
  related: [
    {
      label: "Usar DeepSeek en WeChat (tutorial de documentación)",
      href: "/docs/deepseek-in-wechat",
    },
    { label: "Qué modelos admite WeChat ClawBot", href: "/wechat-clawbot-models" },
    { label: "Usar Claude en WeChat", href: "/wechat-claude" },
    { label: "IA para WeChat con tu propia clave de API", href: "/bring-your-own-api-key" },
    { label: "Precios y cuota gratuita", href: "/pricing" },
    { label: "Configuración de canales y modelos", href: "/docs/channels-models" },
  ],
  updatedAt: "2026-11-08",
};

export default [
  {
    path: "/wechat-deepseek",
    title: "Cómo usar DeepSeek en WeChat: configuración, costes y tutorial | Wechatai",
    description: wechatDeepseekContent.description,
    updatedAt: "2026-11-21",
    content: wechatDeepseekContent,
  },
] satisfies readonly TranslationPage[];
