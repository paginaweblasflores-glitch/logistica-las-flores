/**
 * Paneles del sistema (misma base de datos, distinto trabajo):
 *  - logística: Fernanda y jefatura. Ve ambos negocios. Gestiona requerimientos, compras, conteos,
 *    descuentos e indicadores. En lo operativo del almacén solo CONSULTA.
 *  - almacén: un usuario por negocio (Almacén Las Flores / Almacén Umaru). Registra entradas, salidas,
 *    traspasos, recepción de compras, controles (carnes, bebidas, roturas) y su catálogo local.
 *  - área: usuario compartido "Jefe de Area" (el personal rota). Solo crea requerimientos y ve su estado.
 */
export type Panel = 'logistica' | 'almacen' | 'area'

export const panelDe = (rol: string): Panel => (rol === 'almacen' ? 'almacen' : rol === 'jefe_area' ? 'area' : 'logistica')

/** Pantalla de inicio de cada panel. */
export const inicioDe = (panel: Panel) => (panel === 'area' ? '/requerimientos' : '/')

/** Rutas que solo abre Logística. */
const SOLO_LOGISTICA = [
  '/cotizaciones', '/proveedores', '/precios', '/transporte', '/descuentos',
  '/configuracion', '/compras/nueva', '/almacenes',
  // controles y conteos son de Logística (el almacén no los ve)
  '/carnes', '/bebidas', '/utensilios', '/conteos',
]
/** Rutas de registro que solo abre el almacén (Logística solo consulta). */
const SOLO_ALMACEN = ['/inventario/movimientos/nuevo', '/entradas/nueva', '/salidas/nueva', '/traslados/nuevo', '/ingresos/nuevo', '/productos']   // el catálogo es de los almacenes

const coincide = (path: string, base: string) => path === base || path.startsWith(base + '/')

export function rutaPermitida(panel: Panel, path: string | null) {
  if (!path) return true
  if (panel === 'area') return coincide(path, '/requerimientos')
  if (panel === 'almacen') return !SOLO_LOGISTICA.some((b) => coincide(path, b))
  return !SOLO_ALMACEN.some((b) => coincide(path, b))
}
