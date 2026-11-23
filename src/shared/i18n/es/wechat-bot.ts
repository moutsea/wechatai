import type { SeoPage } from "../../seo-pages";
import type { TranslationPage } from "../index";
import { DAILY_CREDIT_DEFAULTS } from "../../credits";
import { PLUS_MONTHLY_YUAN, PLUS_YEARLY_YUAN } from "../../pricing-copy";
import { PLUGIN_LIMITS } from "../../plugin-access";
import { WECHAT_LINK_LIMITS } from "../../wechat-links";
import { CLOUD_AGENT_COST_NOTE_ES } from "./copy/notes";

/**
 * Spanish body for /wechat-bot. Facts, amounts and limits mirror
 * `src/shared/seo-content/wechat-bot.ts`.
 */
export const wechatBotContent: SeoPage = {
  path: "/wechat-bot",
  kind: "comparison",
  title: "Cómo crear un bot de WeChat: tres rutas y sus riesgos",
  description:
    "Hay tres formas de crear un bot de WeChat: un bot por protocolo en una cuenta personal, una aplicación autoalojada en WeCom y el plugin WeChat ClawBot. Esta guía compara sus casos de uso y el riesgo para la cuenta, y explica qué puede y qué no puede hacer la ruta de Wechatai.",
  eyebrow: "Bot de WeChat",
  h1: "Cómo crear un bot de WeChat: elige primero la ruta correcta",
  lede: "La búsqueda «bot de WeChat» mezcla tres cosas muy distintas: un bot que responde automáticamente a los amigos, una aplicación para empresas y un asistente de IA dentro del canal oficial de plugins. Si eliges la ruta equivocada, todos los tutoriales que vienen después no sirven de nada.",
  answer:
    "Hay tres rutas para crear un bot de WeChat. La primera usa un protocolo o una inyección en el cliente sobre una cuenta personal para responder automáticamente; es una herramienta de terceros, incumple las reglas de la plataforma y conlleva riesgo de bloqueo, así que este sitio no la recomienda. La segunda crea una aplicación autoalojada en WeCom para uso interno, donde los mensajes viajan por WeCom y no por el WeChat personal. La tercera autoriza un servicio mediante Ajustes de WeChat → Plugins → WeChat ClawBot, que es la entrada oficial que usa Wechatai.",
  primaryKeyword: "bot de WeChat",
  secondaryKeywords: [
    "bot de IA para WeChat",
    "respuesta automática con IA en WeChat",
    "cómo crear un bot de WeChat",
  ],
  highlights: [
    "Primero, separa las tres rutas",
    "Sin ocultar el riesgo del protocolo en cuentas personales",
    "Wechatai usa la entrada oficial ClawBot",
  ],
  sections: [
    {
      id: "routes",
      title: "Tres rutas en una tabla",
      body: `| Ruta | Para quién | Qué necesita | Límite principal |
| --- | --- | --- | --- |
| Bot por protocolo en cuenta personal | Quien quiere responder automáticamente a amigos o enviar mensajes masivos | Una herramienta de terceros, normalmente con las credenciales de la cuenta | Cliente no oficial, incumple las reglas de la plataforma, riesgo de bloqueo |
| Aplicación autoalojada en WeCom | Alertas y escenarios de oficina de una empresa o equipo | Permisos de administrador de WeCom, configuración de la aplicación y de las devoluciones de llamada | Orientada a organizaciones; los mensajes quedan dentro de WeCom, no en el WeChat personal |
| Plugin WeChat ClawBot | Personas que quieren IA en su propio WeChat | Una plataforma que ofrezca IA del lado del servidor | Solo chat individual, y la plataforma debe admitir el acceso por ClawBot |

La pregunta no es qué ruta es más potente, sino cuál se mantiene dentro de las reglas. Cada una se explica a continuación.`,
    },
    {
      id: "protocol-bot",
      title: "Bot por protocolo en cuenta personal: responde solo, y puede costar un bloqueo",
      body: `Estas herramientas suelen iniciar sesión simulando el cliente de WeChat (lo que se conoce como protocolo iPad o protocolo PC) o inyectando código en el cliente de WeChat para enviar, recibir y responder automáticamente.

Sí puede hacer «un amigo envía un mensaje y el bot responde», y ese es precisamente el problema: el [Acuerdo de licencia y servicio del software Tencent WeChat](https://oper.my-qcloud.com/cgi-bin/readtemplate?lang=zh_CN&s=default&t=weixin_agreement) limita expresamente iniciar sesión o operar WeChat con software, plugins o complementos de terceros no desarrollados ni autorizados por Tencent. La definición de complementos del soporte de Tencent también incluye emuladores y clientes no oficiales con varias instancias.

La consecuencia no es «un bloqueo seguro», sino que **la plataforma tiene plena discreción**: puede limitar algunas funciones o bloquear la cuenta directamente, sin comprometerse a avisar antes. Aún más práctico: estas herramientas suelen exigir entregar las credenciales de la cuenta a un tercero, lo que crea por sí mismo un problema de seguridad de la cuenta.

Este sitio no ofrece instrucciones de uso para esta ruta y no recomienda ejecutar estas herramientas en una cuenta personal. El mecanismo del riesgo, los niveles de sanción y una lista de autocomprobación están en [¿puede provocar el bloqueo de mi cuenta usar IA en WeChat?](/wechat-ai-ban-risk).`,
    },
    {
      id: "wecom",
      title: "Aplicación autoalojada en WeCom: para organizaciones, no para el WeChat personal",
      body: `Si la necesidad es «notificaciones y preguntas dentro de la empresa», la forma correcta es una **aplicación autoalojada en WeCom**: un administrador crea la aplicación en la consola de administración, configura la URL de devolución de llamada y el dominio de confianza para recibir mensajes, y el servidor verifica la firma antes de enviar y recibir.

Su límite es claro:

- Los mensajes viajan dentro de **WeCom**, no de tu WeChat personal. Usarla para responder automáticamente a amigos personales no es esta ruta.
- Requiere permisos de administrador de WeCom, así que una persona no puede habilitarla por su cuenta.
- Las conversaciones con clientes externos de WeChat implican capacidades y permisos como el contacto con clientes, con más requisitos de configuración y cumplimiento.

Encaja para asistentes internos, bots de alertas, aprobaciones y preguntas sobre conocimiento; no sustituye a un asistente de IA para el WeChat personal.`,
    },
    {
      id: "clawbot",
      title: "Plugin WeChat ClawBot: la entrada oficial para particulares",
      body: `WeChat abrió un canal para la IA: en Yo → Ajustes, dentro del grupo Funciones, abre Plugins → WeChat ClawBot y escanea para vincular un servicio que ofrezca IA. Entonces aparece un contacto de IA en WeChat.

- El canal no ofrece un modelo por sí mismo; responde el servicio vinculado.
- No hay que modificar el cliente de WeChat ni iniciar sesión con un protocolo simulado.
- La vinculación pertenece a la cuenta de WeChat: cambiar de teléfono no la afecta, pero cambiar de cuenta de WeChat requiere volver a escanear.

Wechatai usa esta ruta: configura tu propia clave de API y tu modelo de texto, y luego vincula con el código QR de WeChat ClawBot. Para usar el asistente en la nube Plus Xiaowei cuando esté disponible, añade y habilita el plugin y envía \`/use <atajo>\` para entrar. Si no le asignas un modelo aparte, sigue el modelo normal seleccionado para esa cuenta de WeChat y, tras entrar en el plugin, continúa con el último modelo normal; asigna un modelo fijo en el plugin cuando lo necesites. **No hay forma de saltarse ClawBot**, y un escaneo normal no sustituye el flujo de vinculación dentro del plugin. Los pasos completos están en [cómo usar el plugin WeChat ClawBot](/wechat-clawbot).`,
    },
    {
      id: "scope",
      title: "Qué puede y qué no puede hacer Wechatai",
      body: `| Puede | No puede |
| --- | --- |
| Chatear en una conversación individual de ClawBot y cambiar modelos y plugins | Usar chats grupales ni ofrecer un interruptor para grupos |
| Preguntas con acceso a la web, imágenes con IA, juego de rol, asistente personal y notificaciones | Responder automáticamente a tus amigos de WeChat ni ocuparse de tu vida social |
| Conectar agentes OpenClaw o Hermes en tu equipo | Leer contactos u obtener listas de amigos |
| Vincular hasta ${WECHAT_LINK_LIMITS.plus} enlaces de WeChat con Plus | Añadir amigos automáticamente, enviar mensajes masivos ni actuar en Momentos |

Wechatai es una plataforma de retransmisión y plugins que conecta modelos y agentes a WeChat. Con tu propia API, las tarifas del modelo se pagan por separado a tu proveedor de API; el texto se cobra según tokens ponderados. Gratis incluye ${DAILY_CREDIT_DEFAULTS.free} créditos al día, ${WECHAT_LINK_LIMITS.free} enlace de WeChat y ${PLUGIN_LIMITS.free} plugin; Plus cuesta ¥${PLUS_MONTHLY_YUAN}/mes o ¥${PLUS_YEARLY_YUAN}/año.

${CLOUD_AGENT_COST_NOTE_ES} La configuración se explica en la [guía de Xiaowei](/docs/cloud-agent).`,
    },
    {
      id: "risk",
      title: "Límite del riesgo: la entrada oficial tampoco es riesgo cero",
      body: `Usar la entrada oficial ClawBot significa no modificar el cliente ni simular protocolos, así que ese tipo de riesgo no existe. Pero **no exime de la gestión del comportamiento de la cuenta**: una cuenta que además envía mensajes masivos de marketing, usa complementos o ejecuta clientes no oficiales con varias instancias puede seguir siendo sancionada por la plataforma.

Otro riesgo que suele pasarse por alto es la cadena de suministro: si conectas un agente con capacidad de ejecutar herramientas, las instrucciones dentro de habilidades o plugins de terceros también pueden causar problemas, y ese riesgo no tiene relación con la IA en sí.

El criterio puede resumirse en una frase: **¿la entrada es oficial y la cuenta se comporta como un usuario normal?** Cuando ambas cosas se cumplen, el riesgo no es esencialmente distinto del uso cotidiano de WeChat; ningún servicio de terceros puede garantizar que una cuenta nunca reciba limitaciones.`,
    },
  ],
  faq: [
    {
      question: "¿Hay bots de WeChat gratuitos?",
      answer: `Sí. Wechatai Gratis no cobra nada, concede ${DAILY_CREDIT_DEFAULTS.free} créditos al día y permite vincular ${WECHAT_LINK_LIMITS.free} enlace de WeChat y ${PLUGIN_LIMITS.free} plugin a través del canal del plugin ClawBot. Con tu propio modelo, las llamadas a la API se pagan por separado al proveedor del modelo, una factura distinta de los créditos. Xiaowei requiere Plus y un servicio habilitado.`,
    },
    {
      question: "¿Puede bloquearse la cuenta por usar un bot en una cuenta personal de WeChat?",
      answer:
        "Existe riesgo de bloqueo. Un bot por protocolo en una cuenta personal necesita un cliente simulado o código inyectado, que es una herramienta de terceros expresamente restringida por la plataforma. La plataforma tiene discreción, puede limitar funciones o bloquear la cuenta y no se compromete a avisar antes; este sitio no lo recomienda.",
    },
    {
      question:
        "¿Puede una aplicación autoalojada en WeCom responder automáticamente a amigos del WeChat personal?",
      answer:
        "No puede sustituir al WeChat personal. Los mensajes de una aplicación autoalojada en WeCom viajan dentro de WeCom y requieren que un administrador la configure; las conversaciones con clientes externos de WeChat necesitan permisos adicionales de contacto con clientes y no sirven para responder automáticamente a amigos desde una cuenta personal.",
    },
    {
      question: "¿Wechatai admite chats grupales?",
      answer:
        "Actualmente no. Wechatai solo gestiona tus mensajes individuales con WeChat ClawBot y no tiene interruptor para chats grupales; @atajo es la sintaxis para invocar plugins dentro de un chat individual, no una función de grupo.",
    },
    {
      question: "¿El bot de Wechatai necesita instalar un cliente o dejar un equipo encendido?",
      answer:
        "La conversación normal y los plugins integrados no. Configura tu propia clave de API, escanea para vincular WeChat y úsalo; las llamadas al modelo se hacen en el servidor. Solo cuando conectas un agente como OpenClaw o Hermes que se ejecuta en tu equipo, ese dispositivo debe permanecer en línea.",
    },
  ],
  related: [
    {
      label: "¿Puede provocar el bloqueo de mi cuenta usar IA en WeChat?",
      href: "/wechat-ai-ban-risk",
    },
    { label: "Comparar formas de usar IA en WeChat", href: "/wechat-ai-options" },
    { label: "Cómo usar el plugin WeChat ClawBot", href: "/wechat-clawbot" },
    { label: "Conectar WeChat (documentación)", href: "/docs/getting-started" },
    { label: "Precios y cuota gratuita", href: "/pricing" },
  ],
  updatedAt: "2026-11-12",
};

export default [
  {
    path: "/wechat-bot",
    title: "Cómo crear un bot de WeChat: tres rutas y sus riesgos | Wechatai",
    description: wechatBotContent.description,
    updatedAt: "2026-11-21",
    content: wechatBotContent,
  },
] satisfies readonly TranslationPage[];
