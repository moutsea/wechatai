/**
 * Spanish copy for the homepage, shared by the rendered page and its JSON-LD.
 *
 * Prices and allowances are always derived from the existing billing, credit,
 * WeChat-link and plugin-limit modules. This file only supplies wording; it is
 * not a second source for amounts or commercial terms.
 */
import { DAILY_CREDIT_DEFAULTS } from "../../../credits";
import { PLUGIN_LIMITS } from "../../../plugin-access";
import { PLUS_MONTHLY_YUAN, PLUS_YEARLY_YUAN, approxYuan } from "../../../pricing-copy";
import { WECHAT_LINK_LIMITS } from "../../../wechat-links";

const yearlySaving = Number((PLUS_MONTHLY_YUAN * 12 - PLUS_YEARLY_YUAN).toFixed(1));

export interface SpanishFaqItem {
  question: string;
  answer: string;
  guide: { href: string; label: string };
}

export const homeCopy = {
  seo: {
    title: "IA para WeChat: DeepSeek, Claude, GPT y agentes | Wechatai",
    description:
      "Wechatai conecta modelos y agentes a WeChat: chatea con DeepSeek, Claude y GPT, genera imágenes, conecta Muse, Hermes y OpenClaw y deja que Xiaowei, el asistente en la nube de Plus, procese archivos y tareas. Empieza gratis con tu propia clave de API del modelo; las tarifas del modelo las factura el proveedor.",
  },
  plans: {
    free: {
      name: "Gratis",
      description: "Empieza con las preguntas del día a día",
      unit: "Gratis para siempre",
      note: "No necesitas membresía para empezar",
      badge: "Para empezar",
      action: "Empezar gratis",
    },
    month: {
      name: "Plus mensual",
      description: "Más créditos, más posibilidades",
      unit: "/ mes",
      note: "Pago único por un mes. Renueva cuando lo necesites.",
      badge: "Flexible",
      action: "Elegir Plus mensual",
    },
    year: {
      name: "Plus anual",
      description: "IA a tu lado cada día",
      unit: "/ año",
      note: `Unos ${approxYuan((PLUS_YEARLY_YUAN * 100) / 12)} / mes`,
      badge: `Ahorra ¥${yearlySaving} frente al mensual`,
      action: "Elegir Plus anual",
    },
    features: {
      creditsPrefix: "Cada día",
      creditsSuffix: "créditos",
      wechatConnections: (count: number) =>
        count === 1 ? "conexión de WeChat" : "conexiones de WeChat",
      unlimitedPlugins: "Configuraciones de plugins ilimitadas",
      unlimitedPluginsEmphasis: null,
      pluginConfigurations: (count: number) =>
        count === 1 ? "configuración de plugin" : "configuraciones de plugins",
      imageInput: "Entrada de imágenes y archivos",
      noImageInput: "Sin entrada de imágenes ni archivos",
      xiaoweiName: "Xiaowei IA",
      xiaoweiCloud: "asistente en la nube",
      noXiaowei: "Sin Xiaowei IA",
    },
    switchLabel: "Periodo de facturación de Plus",
    monthly: "Mensual",
    yearly: "Anual · ahorra más",
  },
  hero: {
    titleLead: "Trae tu IA",
    titleAccent: "a WeChat",
    body: "Wechatai conecta modelos y agentes a WeChat, con chat, generación de imágenes y tareas en la nube de Xiaowei para archivos y documentos. Conecta DeepSeek, Claude, GPT, Muse, Hermes y OpenClaw desde una sola cuenta.",
    ctaWorkspace: "Abrir el espacio de trabajo",
    ctaStart: "Empezar",
    how: "Ver cómo conectar",
    note: `Gratis: ${DAILY_CREDIT_DEFAULTS.free} créditos cada día; trae tu propia clave de API del modelo y el proveedor factura las tarifas del modelo.`,
    imageAlt:
      "DeepSeek, Claude, GPT, Muse, Hermes y OpenClaw arriba, conectados con líneas a WeChat abajo.",
  },
  ctaSteps: "Empezar",
  pricingSection: {
    title: "Empieza gratis y desbloquea más con Plus",
    intro:
      "Empieza con el plan gratuito para las preguntas del día a día. Elige Plus para tener más créditos, más conexiones de WeChat y Xiaowei IA.",
    note: "Los créditos son la cuota de uso de la plataforma Wechatai y se descuentan según el consumo. Las membresías son pagos únicos sin renovación automática; los créditos diarios no se acumulan. Las tarifas de la API del modelo se pagan por separado al proveedor.",
    noteSecond:
      "Xiaowei IA usa el modelo que configures; el número de tareas y el estado del servicio aparecen en la página del plugin. Los planes mensual y anual incluyen los mismos beneficios.",
    estimate: "¿Cómo funcionan los créditos? Calcula tu uso diario",
    details: "Ver precios y créditos completos",
  },
  privacy: {
    title: "Seguridad de datos y privacidad",
    intro:
      "Descubre cómo se guardan las claves, cómo se tratan las conversaciones y cómo eliminar registros.",
    policy: "Leer la política de privacidad",
    items: {
      keys: {
        title: "Claves cifradas",
        body: "Las claves de API y las credenciales de conexión de WeChat se cifran en reposo en el servidor. Las claves guardadas nunca se devuelven al navegador.",
      },
      inspection: {
        title: "Sin revisión proactiva",
        body: "No revisamos de forma proactiva tus conversaciones ni tus archivos adjuntos. Los mensajes se procesan automáticamente y se entregan a los servicios conectados. Los registros necesarios de conversaciones y tareas se conservan conforme a la política de privacidad.",
      },
      deletion: {
        title: "Elimina los registros de conversación",
        body: "Borra los registros de conversación de Wechatai en el espacio de trabajo; las copias que conservan WeChat y los servicios de terceros deben gestionarse por separado.",
      },
    },
    openSource: {
      title: "Código abierto en GitHub",
      body: "Wechatai es código abierto con licencia MIT. Explora el código, informa de problemas o contribuye.",
      repositoryAria:
        "Ver el repositorio moutsea/wechatai en GitHub (se abre en una ventana nueva)",
    },
  },
  faqSection: {
    title: "Preguntas frecuentes",
    intro: "Dudas sobre precios, configuración y uso.",
    more: "Leer todas las preguntas frecuentes",
  },
  faq: [
    {
      question: "¿Necesito mi propia clave de API?",
      answer:
        "El chat normal con modelos y Xiaowei necesitan tu propia clave de API del modelo configurada en Wechatai; las tarifas del modelo las factura el proveedor por separado. Si conectas una instalación existente de Muse, Hermes u OpenClaw, conserva su propia configuración de modelo. Las notificaciones de servicio no necesitan clave de modelo.",
      guide: { href: "/docs/channels-models", label: "Ver la guía de claves de API y modelos" },
    },
    {
      question: "¿El plan gratuito incluye créditos? ¿Caducan?",
      answer: `Sí. El plan gratuito es gratis para siempre e incluye ${DAILY_CREDIT_DEFAULTS.free} créditos al día, ${WECHAT_LINK_LIMITS.free} conexión de WeChat y ${PLUGIN_LIMITS.free} configuración de plugin. Los créditos diarios valen para ese día y no se acumulan; las tarifas de la API del modelo las factura el proveedor por separado.`,
      guide: { href: "/pricing#estimate", label: "Calcula tu uso diario" },
    },
    {
      question: "¿Cuánto cuesta Plus y qué añade?",
      answer: `Plus cuesta ¥${PLUS_MONTHLY_YUAN}/mes o ¥${PLUS_YEARLY_YUAN}/año, con ${DAILY_CREDIT_DEFAULTS.plus} créditos al día, ${WECHAT_LINK_LIMITS.plus} conexiones de WeChat, configuraciones de plugins ilimitadas, entrada de imágenes y archivos y el asistente en la nube Xiaowei IA. Xiaowei necesita un modelo configurado, y las tarifas de la API del modelo se facturan por separado. Los planes mensual y anual incluyen los mismos beneficios; ambos son pagos únicos sin renovación automática.`,
      guide: { href: "/docs/cloud-agent", label: "Descubre qué puede hacer Xiaowei" },
    },
    {
      question: "¿Qué modelos son compatibles?",
      answer:
        "Conecta DeepSeek, Claude y GPT, además de Kimi, Qwen, MiniMax y otros, y cambia entre ellos en la misma cuenta de WeChat. Se admiten proveedores oficiales y compatibles; los modelos disponibles dependen del proveedor y de tu clave de API. La compatibilidad con imágenes y herramientas también depende del modelo y del proveedor.",
      guide: { href: "/docs/channels-models", label: "Ver proveedores y modelos compatibles" },
    },
    {
      question: "¿Cuántos pasos hay desde el registro hasta chatear en WeChat?",
      answer:
        "El chat normal requiere tres pasos: configurar un modelo, escanear para conectar WeChat y enviar un mensaje. Antes de empezar, comprueba que WeChat tiene la entrada ClawBot y ten una clave de API a mano. En un teléfono, muestra el código QR desde una computadora u otro dispositivo. Los agentes existentes pueden seguir su propia guía y no necesitan configurar aquí un modelo aparte.",
      guide: { href: "/docs/getting-started", label: "Seguir la guía de inicio" },
    },
    {
      question: "¿Puedo echar un vistazo antes de registrarme?",
      answer:
        "Sí. Las guías públicas incluyen los pasos de configuración y capturas reales de la interfaz, y pueden leerse sin cuenta. Las conversaciones, tareas y vistas previas del código QR de la página de inicio son ilustrativas. Registrarse y escanear no requieren una clave de modelo; configura un modelo antes del chat normal o de ejecutar tareas de Xiaowei.",
      guide: { href: "/docs/getting-started", label: "Ver los pasos y la interfaz" },
    },
    {
      question: "¿Dónde se guardan las claves de API y el historial de chat?",
      answer:
        "Las claves de API se cifran en los servidores de Wechatai y se usan para enviar solicitudes al proveedor que configures; nunca se envían al navegador. El historial de chat pertenece a tu cuenta. El plan gratuito no muestra el historial completo en el navegador, pero puedes eliminar conversaciones. Eliminar los registros de Wechatai no borra las copias que conservan WeChat o el proveedor.",
      guide: { href: "/privacy", label: "Leer la política de privacidad" },
    },
  ] satisfies readonly SpanishFaqItem[],
  steps: {
    eyebrow: "Empieza fácil",
    title: "Configúralo en 2 minutos y empieza gratis",
    guide: "Leer la guía de inicio",
    requirementsPrefix: "Primero comprueba que WeChat tiene la",
    requirementsLink: "entrada ClawBot",
    requirementsSuffix:
      "; el chat normal requiere tu propia clave de API del modelo. Si escaneas en un teléfono, muestra el código QR desde una computadora u otro dispositivo.",
    tabsLabel: "Pasos de configuración",
    items: [
      {
        title: "Conecta los modelos que usas",
        tab: "Configurar modelos",
        description:
          "Admite DeepSeek, SiliconFlow, Alibaba Cloud, OpenAI, Anthropic y otros proveedores. Introduce una clave de API y sincroniza los modelos con un clic.",
        guideLabel: "Ver la guía de configuración de modelos",
      },
      {
        title: "Conecta tu WeChat",
        tab: "Conectar WeChat",
        description:
          "Obtén un código QR en el espacio de trabajo y confírmalo con WeChat ClawBot. En un teléfono, muestra el código QR desde otro dispositivo.",
        guideLabel: "Ver la guía de conexión de WeChat",
      },
      {
        title: "Chatea como siempre",
        tab: "Empezar a chatear",
        description:
          "Abre una conversación de WeChat y pregunta directamente a la IA. Cambia de modelo o empieza un tema nuevo con un solo comando.",
        guideLabel: "Ver la referencia de comandos de WeChat",
      },
    ],
    preview: {
      providersTitle: "Proveedores de modelos compatibles",
      providersNote: "También se admiten Coding Plan y proveedores compatibles personalizados",
      connectLabel: "Vista previa de la conexión",
      connectTitle: "Escanea para conectar tu WeChat",
      connectHint: "Escanea con WeChat ClawBot · confirma en tu teléfono",
      connectNote: "Solo ilustrativo; obtén tu código QR en el espacio de trabajo",
      connectSuccess: "Conexión personal",
      chatBrand: "Wechatai",
      chatSent: "Dame tres ideas para una salida de fin de semana.",
      chatReceived: "Claro. ¿Prefieres estar al aire libre o recorrer la ciudad?",
      chatNote: "Conversación nueva iniciada. La anterior sigue guardada.",
    },
    previous: "Paso anterior",
    next: "Paso siguiente",
    status: (index: number, total: number, title: string) => `Paso ${index} de ${total}: ${title}`,
    alternativesPrefix: "Configura un modelo, conecta WeChat y empieza a chatear. También puedes",
    alternativesAgent: "conectar un agente existente",
    alternativesMiddle: "o",
    alternativesNotifications: "recibir notificaciones de servicio",
    alternativesEnd: ".",
  },
  useCases: {
    title: "Muchas IA, más opciones",
    intro: "Desde una sola pregunta hasta una tarea terminada.",
    caption:
      "Las conversaciones, selecciones de modelo y resultados de tareas de arriba son ilustrativos.",
    items: [
      {
        lead: "Un solo WeChat",
        title: "Conecta varios agentes",
        description:
          "Usa Muse, Hermes y OpenClaw con tus herramientas y tu configuración actuales, y envía tareas y recibe resultados en WeChat.",
        action: "Conectar agentes existentes",
      },
      {
        lead: "Una descripción",
        title: "Genera imágenes en WeChat",
        description:
          "Describe una escena y recibe una imagen en WeChat; activa el juego de rol para personalizar personajes e historias.",
        note: "La generación de imágenes necesita un modelo de imagen; el proveedor factura las tarifas de API por separado",
        action: "Explorar la generación de imágenes con IA",
      },
      {
        lead: "DeepSeek, Claude, GPT",
        title: "Los mejores modelos, a tu elección",
        description:
          "Conecta tu propia API de modelo y cambia de modelo en la misma cuenta de WeChat para preguntas, redacción y traducción.",
        note: "Trae tu propia clave de API; el proveedor factura las tarifas del modelo por separado",
        action: "Ver la configuración de modelos",
      },
      {
        lead: "Xiaowei, tu asistente en la nube",
        title: "Procesa archivos y crea documentos",
        description:
          "Asigna tareas y recibe archivos en WeChat. Sin instalación ni despliegue; solo configura un modelo. En el ejemplo, sustituye <shortcut> por el atajo de WeChat que hayas configurado.",
        note: "Solo para miembros Plus",
        action: "Conocer a Xiaowei y empezar",
      },
    ],
    scenes: {
      creative: {
        title: "Generación de imágenes con IA",
        chat: "Chat de WeChat",
        prompt: "@draw un retrato callejero en la ciudad, 3:4",
        done: "Imagen generada",
        resultLead: "Tu idea,",
        resultAccent: "convertida en arte dentro de WeChat.",
        resultNote: "Las imágenes generadas vuelven directamente al chat",
        roleplay: "Juego de rol",
        roleplayNote: "Personajes e historias personalizados",
      },
      modelsAria: "Usar DeepSeek en WeChat: ver la guía de configuración de modelos",
      currentModel: "Modelo actual",
      agentGuide: (name: string) => `Guía de configuración de ${name}`,
      wechat: "WeChat",
      bridge: "Envía tareas · recibe resultados",
      cloud: {
        title: "Xiaowei",
        subtitle: "Un asistente de tareas que vive en la nube de Wechatai",
        task: "Entregar a Xiaowei",
        done: "Listo",
        prompt: "@<shortcut> convierte este Markdown a Word",
        fileName: "Notas del proyecto.docx",
        fileNote: "Archivo generado y enviado de vuelta a WeChat",
      },
    },
  },
} as const;
