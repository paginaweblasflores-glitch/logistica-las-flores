/** Tipos de proveedor (qué clase de negocio es) y formas de compra (cómo se compra en cada oferta). */
export const TIPOS_PROVEEDOR = [
  { id: 'cadena', nombre: 'Tienda grande o cadena', ej: 'Plaza Vea, Promart, Dollarcity…' },
  { id: 'tienda_en_linea', nombre: 'Solo en línea', ej: 'AliExpress, Temu, Amazon…' },
  { id: 'negocio_local', nombre: 'Negocio local', ej: 'ferretería, mercado, bodega…' },
  { id: 'proveedor', nombre: 'Proveedor formal', ej: 'distribuidora, mayorista…' },
] as const
export type TipoProveedor = (typeof TIPOS_PROVEEDOR)[number]['id']

export const esTipoProveedor = (t: unknown): t is TipoProveedor => TIPOS_PROVEEDOR.some((x) => x.id === t)
export const etiquetaTipo = (t?: string | null) => TIPOS_PROVEEDOR.find((x) => x.id === t)?.nombre ?? 'Proveedor formal'

export const CANALES = [
  { id: 'tienda', nombre: 'En tienda / directo' },
  { id: 'en_linea', nombre: 'Por internet' },
] as const
export type Canal = (typeof CANALES)[number]['id']

export const etiquetaCanal = (c?: string | null) => CANALES.find((x) => x.id === c)?.nombre ?? null
/** Forma de compra que se propone según el tipo: las "solo en línea" por internet, el resto en tienda. */
export const canalSugerido = (tipo?: string | null): Canal => (tipo === 'tienda_en_linea' ? 'en_linea' : 'tienda')

/** «MAKRO (en tienda / directo)»: proveedor y forma de compra (se usa en el servidor y en el navegador). */
export const nombreOferta = (o: { proveedor: string; canal: string | null }) => `${o.proveedor}${o.canal ? ` (${etiquetaCanal(o.canal)?.toLowerCase()})` : ''}`
