/**
 * Spanish copy for the pricing page, shared by the rendered page and JSON-LD.
 * Amounts, daily allowances, refund/renewal terms and plan limits still come
 * from the existing billing, credit, link and plugin modules.
 */
import { BILLING_OFFERS } from "../../../billing-offers";
import { DAILY_CREDIT_DEFAULTS } from "../../../credits";
import { approxYuan } from "../../../pricing-copy";
import { PLUGIN_LIMITS } from "../../../plugin-access";
import { WECHAT_LINK_LIMITS } from "../../../wechat-links";

const monthly = BILLING_OFFERS.find((offer) => offer.id === "plus_monthly")!;
const yearly = BILLING_OFFERS.find((offer) => offer.id === "plus_yearly")!;
const monthlyPrice = `¥${monthly.amount / 100}/mes`;
const yearlyPrice = `¥${yearly.amount / 100}/año`;

const packs = BILLING_OFFERS.filter((offer) => offer.kind === "credits")
  .map((offer) => `¥${offer.amount / 100} por ${offer.credits} créditos`)
  .join(", ");

export const pricingCopy = {
  seo: {
    title: `Precios: ${DAILY_CREDIT_DEFAULTS.free} créditos gratis al día, Plus ${monthlyPrice}`,
    description: `Compara Wechatai Gratis y Plus: créditos diarios, conexiones de WeChat, plugins, archivos adjuntos y Xiaowei IA. Gratis incluye ${DAILY_CREDIT_DEFAULTS.free} créditos al día; Plus cuesta ${monthlyPrice} o ${yearlyPrice}, un pago único sin renovación automática. Las tarifas de la API del modelo se facturan por separado.`,
    eyebrow: "Precios y planes",
    h1: "Empieza gratis y pasa a Plus cuando necesites más",
    lede: "El plan gratuito cubre las preguntas del día a día. Plus añade más créditos y Xiaowei IA. Trae tu propia clave de API del modelo; el proveedor factura las tarifas del modelo por separado.",
    answer:
      "El plan gratuito cubre las preguntas del día a día. Plus añade más créditos y Xiaowei IA. Trae tu propia clave de API del modelo; el proveedor factura las tarifas del modelo por separado.",
    primaryKeyword: "precios de IA para WeChat",
    secondaryKeywords: [
      "precios de Wechatai",
      "coste de la IA para WeChat",
      "créditos gratis de IA para WeChat",
      "precios de ClawBot",
    ],
    faq: [
      {
        question: "¿La membresía incluye las tarifas del modelo?",
        answer:
          "No. La membresía y los créditos cubren el servicio de plataforma de Wechatai. El chat normal, la generación de imágenes y Xiaowei usan la API de modelo que configures, y el proveedor factura las tarifas del modelo por separado. Las instalaciones existentes de Muse, Hermes y OpenClaw conservan su propia configuración de modelo y facturación.",
        guide: { label: "Conocer la configuración de modelos", href: "/docs/channels-models" },
      },
      {
        question: "¿Cómo funcionan los créditos? ¿Se acumulan los diarios?",
        answer: `Los créditos son la cuota de uso de la plataforma. El texto se mide por entrada, salida e historial de la conversación: por ejemplo, 1.000 tokens de entrada y 1.000 de salida en una solicitud cuestan unos 1,8 créditos. La generación de imágenes cuesta 5 créditos por imagen, más el texto de la descripción. Gratis incluye ${DAILY_CREDIT_DEFAULTS.free} créditos al día y Plus incluye ${DAILY_CREDIT_DEFAULTS.plus}; los créditos valen para el día y no se acumulan. Las notificaciones de servicio por webhook no consumen créditos.`,
        guide: { label: "Ver las reglas completas de facturación", href: "/docs/credits" },
      },
      {
        question: "¿Qué pasa cuando se acaban los créditos?",
        answer: `Espera a que la asignación diaria se restablezca al día siguiente o compra un paquete de recarga: ${packs}. Las recargas no requieren Plus y los créditos comprados no caducan. Comprar una recarga no desbloquea las funciones exclusivas de Plus.`,
        guide: { label: "Ir a membresía y créditos", href: "/app/billing" },
      },
      {
        question: "¿Qué puede hacer Xiaowei IA con Plus?",
        answer:
          "Xiaowei es un asistente que se ejecuta en la nube de Wechatai. Puede procesar archivos, generar documentos y realizar tareas, y luego enviar los resultados de vuelta a WeChat. No requiere instalación ni despliegue; configura un modelo de texto para activarlo. El número de tareas, la cuota de almacenamiento y el estado del servicio aparecen en la página del plugin; las tarifas de la API del modelo se facturan por separado.",
        guide: { label: "Conocer a Xiaowei y sus requisitos", href: "/docs/cloud-agent" },
      },
      {
        question: "¿Cuánto cuesta Plus? ¿Se renueva automáticamente?",
        answer: `Plus cuesta ${monthlyPrice} o ${yearlyPrice} (unos ${approxYuan(yearly.amount / 12)}/mes). Las membresías nuevas son pagos únicos sin renovación automática; renovar antes amplía el periodo. Cuando una membresía caduca, la cuenta vuelve al plan gratuito y conserva los créditos comprados. Las suscripciones antiguas con renovación automática pueden cancelarse desde la gestión de la suscripción.`,
      },
      {
        question: "¿Puedo pedir un reembolso después de comprar?",
        answer:
          "Para solicitar un reembolso, contáctanos con los datos de tu pedido. Atendemos las solicitudes según el pedido real, el uso y la legislación aplicable; prevalecen los términos del servicio.",
        guide: { label: "Contactar con soporte", href: "/contact" },
      },
      {
        question: "¿Qué necesito antes de empezar?",
        answer:
          "Primero comprueba que el WeChat de tu teléfono tiene la entrada ClawBot; Wechatai no puede habilitarla en tu cuenta. El chat normal y Xiaowei también necesitan una clave de API del modelo; la generación de imágenes necesita un modelo de imagen y un plugin. Si escaneas en un teléfono, muestra el código QR desde una computadora u otro dispositivo.",
        guide: { label: "Leer la guía de inicio", href: "/docs/getting-started" },
      },
    ],
    related: [{ label: "Asistente gestionado Muse para WeChat", href: "/wechat-muse" }],
  },
  page: {
    skip: "Saltar al contenido",
    breadcrumbLabel: "Ruta de navegación",
    home: "Inicio",
    breadcrumbCurrent: "Precios y planes",
    faqTitle: "¿Todavía tienes dudas?",
    estimatorSummary: "Calcular mi uso diario",
    help: "¿Necesitas ayuda? Contacta con nosotros",
    terms: "Términos del servicio",
  },
  plans: {
    title: "Comparación entre Gratis y Plus",
    free: {
      name: "Gratis",
      badge: "Para empezar",
      description: "Empieza con las preguntas del día a día",
      unit: "Gratis para siempre",
      note: "No necesitas membresía para empezar",
      workspace: "Abrir el espacio de trabajo",
      start: "Empezar gratis",
    },
    badgeFlexible: "Flexible",
    badgeSave: (saving: string) => `Ahorra ${saving}`,
    descriptionAnnual: "Uso a largo plazo; el plan anual sale mejor de precio",
    descriptionMonthly: "Más créditos y Xiaowei IA",
    unitYear: "/ año",
    unitMonth: "/ mes",
    noteAnnual: (approx: string, saving: string) =>
      `Unos ${approx} / mes, ${saving} menos que el mensual`,
    noteMonthly: "Pago único por un mes. Renueva cuando lo necesites.",
    ctaBusy: "Redirigiendo al pago…",
    ctaSubscribe: (name: string, price: string) => `Obtener ${name} · ${price}`,
    ctaChoose: (name: string) => `Elegir ${name}`,
    loginAgain: "Inicia sesión de nuevo",
    checkoutFailed: "No se pudo iniciar el pago. Inténtalo de nuevo.",
    checkoutErrors: {
      unauthorized: "Tu sesión ha caducado. Inicia sesión de nuevo para continuar.",
      rate_limited: "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
      billing_unavailable:
        "Este plan no está disponible para comprar ahora mismo. Inténtalo más tarde.",
      already_subscribed:
        "Ya tienes una suscripción recurrente o pendiente. Desactiva la renovación automática en la gestión de la suscripción antes de comprar una membresía de pago único. Se conservará el tiempo restante.",
      payment_processing: "Tu pago se está confirmando. Actualiza en un momento.",
      checkout_in_progress: "Ya se está creando un pedido. Inténtalo de nuevo en breve.",
    },
    offerName: (interval: "month" | "year") =>
      interval === "year" ? "Plus anual" : "Plus mensual",
    features: [
      {
        label: "Créditos al día",
        free: DAILY_CREDIT_DEFAULTS.free,
        plus: DAILY_CREDIT_DEFAULTS.plus,
      },
      {
        label: "Conexiones de WeChat",
        free: WECHAT_LINK_LIMITS.free,
        plus: WECHAT_LINK_LIMITS.plus,
      },
      { label: "Configuraciones de plugins", free: PLUGIN_LIMITS.free, plus: "Ilimitadas" },
      { label: "Entrada de imágenes y archivos", free: false, plus: true },
      { label: "Ver el historial de chat en la web", free: false, plus: true },
      {
        label: "Asistente en la nube Xiaowei IA",
        free: false,
        plus: true,
        href: "/docs/cloud-agent",
      },
    ],
    highlights: ["Créditos al día", "Conexiones de WeChat", "Configuraciones de plugins"],
    supported: "Compatible",
    unsupported: "No compatible",
    comparisonCaption:
      "Comparación de beneficios · Los planes Plus mensual y anual incluyen los mismos beneficios",
    comparisonHeaders: ["Función y cuota", "Gratis", "Plus"],
    common:
      "Todos los planes incluyen chat con modelos, generación de imágenes con IA, juego de rol y notificaciones de servicio gratuitas.",
    fineprint:
      "Plus es un pago único sin renovación automática; los planes mensual y anual incluyen los mismos beneficios. Los créditos diarios valen para el día y no se acumulan.",
    checked: "Precios comprobados el",
  },
  estimator: {
    eyebrow: "Dos costes cuando traes tu propia API",
    title: "Calcula primero tu uso de texto",
    intro:
      "Se calcula solo en tu navegador; no necesitas iniciar sesión. La tarifa del proveedor estima el coste de la API del modelo. Xiaowei también usa tu propio modelo y puede llamarlo varias veces; las tarifas reales de la API siguen la factura del proveedor. El servicio en la nube sigue requiriendo Plus y disponibilidad, y el número de tareas tiene límites aparte.",
    fields: [
      "Tokens de entrada por turno (incluido el historial)",
      "Tokens de salida por turno",
      "Solicitudes al día",
      "Precio de entrada del proveedor (CNY / millón de tokens)",
      "Precio de salida del proveedor (CNY / millón de tokens)",
    ],
    placeholder: "Opcional, precio en CNY",
    creditsUnit: "créditos",
    platformLabel: "Uso de Wechatai / día",
    platformHint: (free: number, plus: number) =>
      `Gratis incluye ${free} al día; Plus incluye ${plus}. Los créditos diarios no se acumulan.`,
    providerLabel: "Coste del modelo del proveedor / día",
    providerValue: (amount: string) => `Unos ¥${amount}`,
    providerEmpty: "Introduce un precio para ver la estimación",
    providerHint:
      "El proveedor factura las tarifas de la API del modelo por separado; las llamadas internas de Xiaowei también pueden generar tarifas de API.",
    invalid:
      "Introduce números válidos no negativos; los tokens y las solicitudes deben ser números enteros.",
    note: "Fórmula: (entrada + salida × 8) ÷ 5.000, redondeado hacia arriba al siguiente múltiplo de 0,001 crédito por turno. La entrada debe incluir el historial que realmente se envía en cada turno. No cubre diferencias de caché, búsqueda, llamadas adicionales a herramientas, archivos adjuntos, generación de imágenes, impuestos ni tipos de cambio. Es una estimación, no una cotización, y no garantiza un número fijo de conversaciones.",
    noteLink: "Ver las reglas completas de facturación",
  },
  relatedHeading: "Sigue explorando",
};
