/**
 * Cada negocio pertenece a una empresa (RUC):
 *   20494980801 - CORPORACIÓN LAS FLORES S.A.C. (Restaurante Las Flores)
 *   20609784254 - CLUB LAS FLORES S.A.C.        (Hotel Umaru)
 * Esta es la forma única de mostrarlo en pedidos, compras, actas e informes.
 */
export type ConEmpresa = { nombre: string; ruc?: string | null; razon_social?: string | null }

export function etiquetaNegocio(n: ConEmpresa) {
  return n.ruc && n.razon_social ? `${n.ruc} - ${n.razon_social} (${n.nombre})` : n.nombre
}

/** Logo de cada negocio para los documentos impresos (requerimiento, resumen de compra…). */
export const LOGO_DOC: Record<string, string> = { LF: '/doc/logo-doc-las-flores.png', UM: '/doc/logo-doc-hotel-umaru.png' }
