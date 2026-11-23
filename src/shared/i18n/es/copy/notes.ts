import { IMAGE_CREDITS } from "../../../credits";

/**
 * Spanish wording for fee notes shared by the landing pages.
 *
 * The amounts stay in their source modules (`credits`, `pricing-copy`); this
 * file only supplies the translated sentences so the pages cannot drift apart.
 */
export const OWN_API_COST_NOTE_ES =
  "Cuando usas tu propia API de modelo, búsqueda o generación de imágenes, el proveedor factura esas tarifas por separado y no están incluidas en la membresía ni en los créditos de Wechatai.";

export const CLOUD_AGENT_COST_NOTE_ES = `Xiaowei está disponible para miembros Plus cuando el operador lo habilita. Usa el modelo de texto que configures en Wechatai y el proveedor factura las tarifas de la API del modelo por separado. La plataforma cobra créditos por el texto de entrada de la tarea y de la respuesta final, y ${IMAGE_CREDITS} créditos por cada imagen devuelta; los archivos que no son imágenes no se cobran aparte. El número de ejecuciones tiene límites independientes.`;
