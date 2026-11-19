/**
 * Paneles del sistema (misma base de datos, distinto trabajo):
 *  - logística: Fernanda y jefatura. Ve ambos negocios. Gestiona requerimientos, compras e indicadores.
 *    En lo operativo del almacén solo CONSULTA.
 *  - almacén: un usuario por negocio (Almacén Las Flores / Almacén Umaru). Registra entradas, salidas,
 *    traspasos, recepción de compras y su catálogo local.
 *  - área: usuario compartido "Jefe de Area" (el personal rota). Solo crea requerimientos y ve su estado.
 *  - contabilidad: la contadora. Solo los documentos de las compras (carpetas) y el registro de sus comprobantes;
 *    no maneja dinero, stock ni requerimientos.
 * Conteos, descuentos, Producción (carnes), bebidas y roturas viven en otro sistema (conteo-las-flores).
 */
export type Panel = 'logistica' | 'almacen' | 'area' | 'contabilidad'

export const panelDe = (rol: string): Panel =>
  rol === 'almacen' ? 'almacen' : rol === 'jefe_area' ? 'area' : rol === 'contabilidad' ? 'contabilidad' : 'logistica'

/** Roles de OTROS sistemas (p. ej. Producción → sistema de conteos): no entran a Logística. */
export const ROLES_OTRO_SISTEMA = ['produccion']
export const esDeOtroSistema = (rol: string) => ROLES_OTRO_SISTEMA.includes(rol)

/** Pantalla de inicio de cada panel. */
export const inicioDe = (panel: Panel) => (panel === 'area' ? '/requerimientos' : '/')

/** Rutas que solo abre Logística. */
const SOLO_LOGISTICA = [
  '/cotizaciones', '/proveedores', '/precios', '/transporte',
  '/configuracion', '/compras/nueva', '/almacenes',
]
/** Rutas de registro que solo abre el almacén (Logística solo consulta). */
const SOLO_ALMACEN = ['/entradas/nueva', '/salidas/nueva', '/traslados/nuevo', '/ingresos/nuevo', '/productos']   // el catálogo es de los almacenes

const coincide = (path: string, base: string) => path === base || path.startsWith(base + '/')

/** La contadora: su inicio, las carpetas, la ficha de cada compra (con su OC y su nota de ingreso) y los proveedores (consulta). */
const esDeContabilidad = (path: string) =>
  path === '/' || coincide(path, '/carpetas')
  || (path.startsWith('/compras/') && !coincide(path, '/compras/nueva'))
  || (path.startsWith('/entradas/') && !coincide(path, '/entradas/nueva'))
  || (coincide(path, '/proveedores') && !coincide(path, '/proveedores/nuevo'))

export function rutaPermitida(panel: Panel, path: string | null) {
  if (!path) return true
  if (panel === 'area') return coincide(path, '/requerimientos')
  if (panel === 'contabilidad') return esDeContabilidad(path)
  if (panel === 'almacen') return !SOLO_LOGISTICA.some((b) => coincide(path, b))
  return !SOLO_ALMACEN.some((b) => coincide(path, b))
}

/** Lo que dice debajo de «Las Flores» en la barra lateral. */
export const subtituloDe = (panel: Panel, negocio?: string | null) =>
  panel === 'almacen' ? `Almacén ${negocio === 'UM' ? 'Umaru' : 'Las Flores'}` : panel === 'area' ? 'Jefes de área'
    : panel === 'contabilidad' ? 'Contabilidad' : 'Logística'
