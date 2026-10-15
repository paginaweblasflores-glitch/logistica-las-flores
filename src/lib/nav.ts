import {
  LayoutDashboard, Boxes, ClipboardCheck, Drumstick, ShoppingCart, BadgeMinus, BarChart3, Settings,
  ArrowLeftRight, ArrowDownToLine, ArrowUpFromLine, ClipboardList, Package, FilePlus2, type LucideIcon,
} from 'lucide-react'
import type { Panel } from '@/lib/panel'

/** Sub-pantalla dentro de un módulo desplegable */
export type NavLink = { href: string; label: string }
/**
 * Un módulo del menú: o es un enlace directo (`href`) o un desplegable con sub-pantallas (`items`).
 * Regla: se usa desplegable solo cuando el módulo tiene varias pantallas y estas se usan con menos
 * frecuencia que la principal (la primera de la lista es siempre la pantalla principal).
 */
export type NavModule = { label: string; icon: LucideIcon; href?: string; items?: NavLink[] }

export const NAV: NavModule[] = [
  { label: 'Panel principal', icon: LayoutDashboard, href: '/' },
  {
    label: 'Compras', icon: ShoppingCart,
    // en el orden del flujo: requerimiento → cotización → orden de compra; luego las consultas de apoyo
    items: [
      { href: '/requerimientos', label: 'Requerimientos' },
      { href: '/cotizaciones', label: 'Cotizaciones' },
      { href: '/compras', label: 'Órdenes de compra' },
      { href: '/proveedores', label: 'Proveedores' },
      { href: '/precios', label: 'Trazabilidad de precios' },
      { href: '/transporte', label: 'Transporte' },
    ],
  },
  {
    // Logística no opera los almacenes: los supervisa. Un resumen gerencial (valor, mínimos,
    // consumo por área, mermas, ingresos con precio distinto) y, para el detalle, el Kardex y FIFO.
    // Los vencimientos son solo de los almacenes.
    label: 'Almacenes', icon: Boxes,
    items: [
      { href: '/almacenes', label: 'Resumen de almacenes' },
      { href: '/almacenes/stock-diario', label: 'Stock del día' },
      { href: '/inventario/kardex', label: 'Kardex' },
      { href: '/inventario/lotes', label: 'FIFO' },
    ],
  },
  { label: 'Conteos físicos', icon: ClipboardCheck, href: '/conteos' },
  {
    label: 'Controles', icon: Drumstick,
    items: [
      { href: '/carnes', label: 'Carnes y viandas' },
      { href: '/bebidas', label: 'Bebidas oficinas' },
      { href: '/utensilios', label: 'Utensilios y roturas' },
    ],
  },
  { label: 'Descuentos', icon: BadgeMinus, href: '/descuentos' },
  { label: 'Reportes', icon: BarChart3, href: '/reportes' },
  { label: 'Configuración', icon: Settings, href: '/configuracion' },
]

/** Menú del panel de ALMACÉN (un negocio): registra el día a día; Logística lo consulta. */
export const NAV_ALMACEN: NavModule[] = [
  { label: 'Panel del almacén', icon: LayoutDashboard, href: '/' },
  {
    label: 'Inventario', icon: Boxes,
    items: [
      { href: '/inventario', label: 'Stock' },
      // el Kardex de cada producto se abre desde su fila en Stock o desde su ficha (la lista general repetía Entradas/Salidas)
      { href: '/inventario/lotes', label: 'Vencimientos' },
    ],
  },
  // cada uno con su formulario, su historial y su numeración (E-00001 / S-00001)
  { label: 'Entradas', icon: ArrowDownToLine, href: '/entradas' },
  { label: 'Salidas', icon: ArrowUpFromLine, href: '/salidas' },
  { label: 'Traspasos', icon: ArrowLeftRight, href: '/traslados' },
  { label: 'Requerimientos', icon: ClipboardList, href: '/requerimientos' },
  { label: 'Productos', icon: Package, href: '/productos' },
  { label: 'Reportes', icon: BarChart3, href: '/reportes' },
]

/** Menú del panel de JEFES DE ÁREA: solo requerimientos. */
export const NAV_AREA: NavModule[] = [
  { label: 'Nuevo requerimiento', icon: FilePlus2, href: '/requerimientos/nuevo' },
  { label: 'Requerimientos enviados', icon: ClipboardList, href: '/requerimientos' },
]

export const navDe = (panel: Panel) => (panel === 'almacen' ? NAV_ALMACEN : panel === 'area' ? NAV_AREA : NAV)

/** ¿La ruta actual corresponde a este enlace? (incluye sus fichas de detalle: /compras/123) */
export function rutaActiva(pathname: string, href: string) {
  if (href === '/' || href === '/inventario' || href === '/almacenes') return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}

/**
 * Pantallas donde el selector Global / Restaurante / Hotel realmente filtra la información.
 * En el resto (fichas de detalle, formularios, maestros, configuración) se oculta para no confundir.
 * Carnes y viandas tiene sus propias pestañas de negocio.
 */
export const RUTAS_CON_AMBITO = new Set([
  '/', '/inventario', '/inventario/kardex', '/inventario/movimientos', '/inventario/lotes', '/entradas', '/salidas', '/almacenes',
  '/conteos', '/traslados', '/bebidas', '/utensilios',
  '/requerimientos', '/cotizaciones', '/compras', '/transporte', '/ingresos',
  '/descuentos', '/reportes', '/productos',
])
