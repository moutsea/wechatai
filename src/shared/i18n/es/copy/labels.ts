/**
 * Spanish chrome shared by the landing pages rendered through `SeoPageView`.
 *
 * The object mirrors `SeoPageLabels` in `src/client/pages/seo-page-labels.ts`;
 * the shared page shell imports it once the landing-page wiring for this
 * locale lands, so the labels cannot drift from the Chinese and English ones.
 */
export const seoPageLabelsEs = {
  skipToContent: "Saltar al contenido",
  home: "Inicio",
  breadcrumb: "Ruta de navegación",
  comparisonTable: "Tabla comparativa",
  compareMissing:
    "No se encontró una fuente pública verificable; esto no significa que la otra parte no lo admita",
  commands: "Comandos habituales de WeChat",
  copyCommand: (command: string) => `Copiar el comando ${command}`,
  copy: "Copiar",
  copied: "Copiado",
  copyFailed: "Error al copiar",
  faq: "Preguntas frecuentes",
  contents: "En esta página",
  tableOfContents: "Contenido de la página",
  ctaTitle: "Comprueba los requisitos y configura tu IA para WeChat",
  ctaBody:
    "Empieza por la entrada de WeChat ClawBot y luego configura un modelo, un agente o notificaciones. El uso del modelo se factura aparte.",
  ctaAction: "Empezar gratis",
  updated: "Actualizado",
  checkRequirements: "Comprueba los requisitos de acceso antes de registrarte",
  estimateCosts: "Estima los costes de la plataforma y del modelo",
  startFree: "Empezar gratis",
  estimateFirst: "Calcular primero el coste de uso",
  setupGuide: "Leer la guía de configuración",
} as const;
