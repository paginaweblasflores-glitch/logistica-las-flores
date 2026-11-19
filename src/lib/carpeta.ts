import { nombreComprobante, SIN_COMPROBANTE_VALIDO } from '@/lib/documentos'

/**
 * Carpeta de la compra: los 6 documentos que sustentan cada orden de compra (formato de Fernanda).
 * 01 y 05 los genera el sistema; 02, 03 (archivo), 04 y 06 se registran (tabla compra_documento).
 */
export type TipoDocCarpeta = 'proforma' | 'comprobante' | 'guia' | 'pago'

export type DocCarpeta = {
  tipo: TipoDocCarpeta; estado: 'registrado' | 'no_aplica'; numero: string | null; fecha: string | null
  monto: number | null; medio: string | null; nota: string | null
  archivo_path: string | null; archivo_nombre: string | null; archivo_mime: string | null
}

export type EstadoItem = 'listo' | 'pendiente' | 'no_aplica' | 'invalido' | 'observado'

/** Lo que registró la contadora sobre el comprobante (03). */
export type Contable = { estado: 'registrado' | 'observado'; observacion: string | null; serie: string | null; numero: string | null }

export type ItemCarpeta = {
  n: string; titulo: string; responsable: string; estado: EstadoItem
  /** texto corto: número, fecha, monto, motivo… */
  detalle: string | null
  /** enlace dentro del sistema (la OC imprimible, la cotización, la entrada) */
  enlace?: { href: string; label: string }
  /** documento editable (02, 03, 04, 06) y lo ya registrado */
  tipo?: TipoDocCarpeta; doc?: DocCarpeta | null
}

export const MEDIOS_PAGO = [
  { id: 'Transferencia', nombre: 'Transferencia' }, { id: 'Depósito', nombre: 'Depósito' }, { id: 'Efectivo', nombre: 'Efectivo' },
  { id: 'Yape / Plin', nombre: 'Yape / Plin' }, { id: 'Cheque', nombre: 'Cheque' },
]

type CompraCarpeta = {
  id: string; estado: string; sin_orden: boolean; solo_fuera_catalogo?: boolean
  tipo_documento: string | null; numero_documento: string | null
  cotizacion?: { id: string; numero: string } | null
  /** la entrada al almacén (nota de ingreso), si ya se conoce */
  entrada?: { id: string; numero: string | null } | null
  contable?: Contable | null
}

const soles = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const unir = (...p: (string | null | undefined | false)[]) => p.filter(Boolean).join(' · ') || null

/** Arma las 6 filas de la carpeta con su estado. */
export function carpetaDeCompra(c: CompraCarpeta, docs: DocCarpeta[]): ItemCarpeta[] {
  const de = (t: TipoDocCarpeta) => docs.find((d) => d.tipo === t) ?? null
  const proforma = de('proforma'), comp = de('comprobante'), guia = de('guia'), pago = de('pago')
  const recibida = c.estado === 'recibida'
  const segun = (d: DocCarpeta | null): EstadoItem => (!d ? 'pendiente' : d.estado === 'no_aplica' ? 'no_aplica' : 'listo')
  const motivo = (d: DocCarpeta | null) => (d?.estado === 'no_aplica' ? `No aplica: ${d.nota ?? ''}` : null)

  // 03: el tipo y número los registra el almacén al recibir; aquí se ve si sustenta la compra
  const tipoComp = c.tipo_documento
  const k = c.contable
  // lo que decide la contadora manda: registrado (listo) u observado; si aún no lo revisa, lo que trajo la llegada
  const estadoComp: EstadoItem = k?.estado === 'registrado' ? 'listo' : k?.estado === 'observado' ? 'observado'
    : !tipoComp ? 'pendiente' : SIN_COMPROBANTE_VALIDO.has(tipoComp) ? 'invalido' : 'listo'
  const detalleComp = k?.estado === 'observado' ? `Observado por Contabilidad: ${k.observacion ?? ''}`
    : k?.estado === 'registrado' ? unir(nombreComprobante(tipoComp), k.serie && k.numero ? `${k.serie}-${k.numero}` : c.numero_documento, 'Registrado por Contabilidad')
    : tipoComp ? unir(nombreComprobante(tipoComp), c.numero_documento, estadoComp === 'invalido' && 'Sin comprobante válido', 'Falta registrar en Contabilidad') : null

  return [
    { n: '01', titulo: 'Orden de compra', responsable: 'Logística', estado: c.sin_orden ? 'no_aplica' : c.estado === 'borrador' ? 'pendiente' : 'listo',
      detalle: c.sin_orden ? 'Compra directa del almacén (sin orden)' : c.estado === 'borrador' ? 'Falta aprobarla' : null,
      enlace: c.sin_orden ? undefined : { href: `/compras/${c.id}/orden`, label: 'Ver / imprimir' } },
    { n: '02', titulo: 'Proforma / cotización', responsable: 'Logística', tipo: 'proforma', doc: proforma,
      estado: c.cotizacion ? 'listo' : c.sin_orden && !proforma ? 'no_aplica' : segun(proforma),
      detalle: motivo(proforma) ?? unir(proforma?.numero && `N° ${proforma.numero}`, c.sin_orden && !proforma && 'Compra directa'),
      enlace: c.cotizacion ? { href: `/cotizaciones/${c.cotizacion.id}`, label: `Cotización ${c.cotizacion.numero}` } : undefined },
    { n: '03', titulo: 'Comprobante de pago', responsable: 'Almacén · lo registra Contabilidad', tipo: 'comprobante', doc: comp, estado: estadoComp,
      detalle: detalleComp },
    { n: '04', titulo: 'Guía de remisión', responsable: 'Almacén', tipo: 'guia', doc: guia, estado: segun(guia),
      detalle: motivo(guia) ?? unir(guia?.numero) },
    { n: '05', titulo: 'Nota de ingreso', responsable: 'Sistema', estado: c.solo_fuera_catalogo ? 'no_aplica' : recibida ? 'listo' : 'pendiente',
      detalle: c.solo_fuera_catalogo ? 'Va directo al área: no entra al almacén' : recibida ? unir(c.entrada?.numero) : 'Al registrar la llegada',
      enlace: c.entrada ? { href: `/entradas/${c.entrada.id}`, label: 'Ver entrada' } : undefined },
    { n: '06', titulo: 'Constancia de pago', responsable: 'Logística', tipo: 'pago', doc: pago, estado: segun(pago),
      detalle: motivo(pago) ?? (pago ? unir(pago.monto != null && soles(Number(pago.monto)), pago.medio, pago.numero && `Op. ${pago.numero}`) : null) },
  ]
}

/** Para la lista de órdenes: cuántos de los 6 están resueltos y si alguno no sustenta la compra. */
export function avanceCarpeta(items: ItemCarpeta[]) {
  return { listos: items.filter((i) => i.estado === 'listo' || i.estado === 'no_aplica').length, total: items.length,
    invalido: items.some((i) => i.estado === 'invalido' || i.estado === 'observado') }
}

/** Estado del comprobante en Contabilidad (registro de compras). */
export const ESTADOS_CONTABLES = [
  { id: 'pendiente', nombre: 'Pendiente', tone: 'amber' }, { id: 'registrado', nombre: 'Registrado', tone: 'green' }, { id: 'observado', nombre: 'Observado', tone: 'red' },
] as const
