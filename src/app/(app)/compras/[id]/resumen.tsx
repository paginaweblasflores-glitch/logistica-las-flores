import Link from 'next/link'
import Image from 'next/image'
import { CheckCircle2 } from 'lucide-react'
import { fmtDate, fmtPct, fmtQty, fmtSoles } from '@/lib/format'
import { LOGO_DOC } from '@/lib/empresa'
import { PageHeader, EstadoBadge, Badge, LinkButton } from '@/components/ui'
import { PrintButton } from '@/components/print-button'
import { AnularConMotivo } from '@/components/anular-con-motivo'
import { btnClass } from '@/components/ui'
import { anularIngreso } from '../actions'

export type LineaResumen = { id: string; producto_id: string | null; producto: string; producto_codigo: string | null; unidad: string
  cantidad_solicitada: number; cantidad_recibida: number | null; precio_unitario: number; precio_orden?: number | null; fecha_vencimiento: string | null }
export type FleteResumen = { id: string; fecha: string; costo: number; documento: string | null; destino: string | null; transportista: string | null
  proveedor: { razon_social: string } | null; ciudad: { nombre: string } | null }

const DOC: Record<string, string> = { factura: 'Factura', boleta: 'Boleta', guia: 'Guía', ticket: 'Ticket', recibo: 'Recibo', sin_documento: 'Sin documento' }

/**
 * Compra recibida = compra CERRADA. Ya no se edita: se muestra el resumen final con todos sus datos
 * (proveedor, documento, fechas, lo que llegó, fletes y totales), listo para imprimir.
 */
/** Tiempo entre dos fechas: «5.0 h» o, si pasa de 2 días, «3 días» */
function horasDesde(desde: string, hasta: string) {
  const h = (new Date(hasta).getTime() - new Date(desde).getTime()) / 3_600_000
  return h < 48 ? `${h.toFixed(1)} h` : `${Math.round(h / 24)} días`
}

export function ResumenCompra({ c, lineas, fletes, negocio, localCodigo, proveedorRuc, requerimiento, cotizacion, fechaCompromiso, observacion, almacen, recibidoPor, id }: {
  c: {
    numero: string; fecha: string; estado: string; proveedor: string | null; ciudad: string | null; tipo_documento: string | null; numero_documento: string | null
    forma_pago: string | null; fecha_aprobacion: string | null; fecha_entrega: string | null; fecha_objetivo: string | null; total: number
    costo_transporte: number; costo_total: number; on_time: boolean | null; fill_rate: number | null; in_full: boolean | null; horas_entrega: number | null
    solo_fuera_catalogo: boolean; sin_orden?: boolean; total_documento?: number | null
  }
  lineas: LineaResumen[]; fletes: FleteResumen[]; negocio: string; localCodigo: string; proveedorRuc: string | null
  requerimiento: { id: string; numero: string; created_at?: string; aprobado_at?: string | null } | null; cotizacion: { id: string; numero: string } | null
  fechaCompromiso: string | null; observacion: string | null; almacen: boolean; recibidoPor?: string | null; id?: string
}) {
  const recibido = (l: LineaResumen) => Number(l.cantidad_recibida ?? 0)
  const hayVence = lineas.some((l) => l.fecha_vencimiento)
  const faltantes = lineas.filter((l) => recibido(l) < Number(l.cantidad_solicitada))
  const difPrecio = (l: LineaResumen) => l.precio_orden != null && Number(l.precio_orden) !== Number(l.precio_unitario)
  const conDiferencia = lineas.filter(difPrecio)
  const directo = !!c.sin_orden
  const noCuadra = c.total_documento != null && Math.abs(Number(c.total_documento) - Number(c.total)) > 0.05
  const fila = 'border border-line px-2 py-1.5'

  return (
    <>
      <PageHeader title={`${directo ? 'Ingreso' : 'Compra'} ${c.numero}`} back={{ href: '/compras', label: almacen ? 'Recepción de compras' : 'Compras' }}
        description={directo ? 'Ingreso directo del almacén (sin orden de compra). Este es su resumen.' : 'Compra cerrada: la mercadería ya llegó. Este es su resumen final.'}
        actions={<>
          <EstadoBadge estado={c.estado} />
          {requerimiento && <LinkButton href={`/requerimientos/${requerimiento.id}`} variant="outline">Ver requerimiento {requerimiento.numero}</LinkButton>}
          <PrintButton label="Imprimir" />
          {/* un ingreso directo registrado por error lo anula el almacén que lo registró (con motivo) */}
          {almacen && directo && id && (
            <AnularConMotivo action={anularIngreso} campos={{ id }} className={btnClass('outline')} titulo={`Anular el ingreso ${c.numero}`}
              detalle="Se revierte el stock de estos productos y el ingreso queda anulado con su motivo. Luego regístrelo de nuevo bien.">Anular ingreso</AnularConMotivo>
          )}
        </>} />

      <div className="no-print mb-5 flex items-start gap-3 rounded-xl border border-leaf-500/30 bg-leaf-50 px-4 py-3 text-sm text-leaf-600">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
        <p>Llegó el <b>{fmtDate(c.fecha_entrega, true)}</b>{c.on_time !== null && <> · {c.on_time ? 'a tiempo' : 'fuera de plazo'}</>}
          {c.fill_rate !== null && <> · {c.in_full ? 'completa' : `incompleta (${fmtPct(c.fill_rate)})`}</>}{recibidoPor && <> · registró {recibidoPor}</>}.
          {' '}La compra ya no se puede modificar{c.solo_fuera_catalogo ? '' : '; lo recibido ya está en el stock del almacén'}.</p>
      </div>

      {(conDiferencia.length > 0 || noCuadra) && (
        <div className="no-print mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {conDiferencia.length > 0 && <p><b>Precio distinto a la orden</b> en {conDiferencia.map((l) => `${l.producto} (orden ${fmtSoles(l.precio_orden)} → boleta ${fmtSoles(l.precio_unitario)})`).join(', ')}.</p>}
          {noCuadra && <p><b>El total del comprobante</b> ({fmtSoles(c.total_documento)}) no cuadra con la suma de productos ({fmtSoles(c.total)}).</p>}
        </div>
      )}

      {/* Documento imprimible */}
      <section className="documento card print-area p-6 sm:p-8">
        <header className="mb-5 flex items-center justify-between gap-4 border-b-2 border-ink-900 pb-4">
          <Image src={LOGO_DOC[localCodigo] ?? LOGO_DOC.LF} alt="" width={150} height={64} priority className="h-16 w-auto object-contain" />
          <div className="text-right">
            <p className="text-sm font-bold tracking-wide uppercase">{directo ? 'Ingreso de almacén' : 'Resumen de compra'}</p>
            <p className="text-xs text-muted">{negocio}</p>
            <p className="mt-1 text-lg font-bold">N° {c.numero}</p>
          </div>
        </header>

        <div className="mb-5 grid gap-4 text-sm md:grid-cols-2">
          <div className="rounded-lg border border-line">
            <p className="border-b border-line bg-canvas px-3 py-1.5 text-xs font-bold tracking-wide uppercase">1. Proveedor y documento</p>
            <dl className="grid grid-cols-[130px_1fr] gap-x-2 gap-y-1 px-3 py-2">
              <dt className="text-muted">Proveedor</dt><dd className="font-semibold">{c.proveedor ?? '—'}{proveedorRuc && <span className="font-normal text-muted"> · RUC {proveedorRuc}</span>}</dd>
              <dt className="text-muted">Documento</dt><dd>{c.tipo_documento ? DOC[c.tipo_documento] ?? c.tipo_documento : '—'} {c.numero_documento ?? ''}{c.total_documento != null && <span className="text-muted"> · total {fmtSoles(c.total_documento)}</span>}</dd>
              <dt className="text-muted">Forma de pago</dt><dd>{c.forma_pago ?? '—'}</dd>
              <dt className="text-muted">Origen</dt><dd>{c.ciudad ?? '—'}</dd>
              {requerimiento && <><dt className="text-muted">Requerimiento</dt><dd><Link href={`/requerimientos/${requerimiento.id}`} className="font-semibold text-brand-600 print:text-ink-900">{requerimiento.numero}</Link></dd></>}
              {cotizacion && <><dt className="text-muted">Cotización</dt><dd><Link href={`/cotizaciones/${cotizacion.id}`} className="font-semibold text-brand-600 print:text-ink-900">{cotizacion.numero}</Link></dd></>}
            </dl>
          </div>
          <div className="rounded-lg border border-line">
            <p className="border-b border-line bg-canvas px-3 py-1.5 text-xs font-bold tracking-wide uppercase">2. Fechas y entrega</p>
            <dl className="grid grid-cols-[130px_1fr] gap-x-2 gap-y-1 px-3 py-2">
              {/* en el orden real: el área pide → se aprueba el requerimiento → (cotización) → se compra → llega */}
              {requerimiento?.created_at && <><dt className="text-muted">Requerimiento</dt><dd>{fmtDate(requerimiento.created_at, true)}</dd></>}
              {requerimiento?.aprobado_at && <><dt className="text-muted">Aprobado</dt><dd>{fmtDate(requerimiento.aprobado_at, true)}</dd></>}
              {!directo && <><dt className="text-muted">Compra</dt><dd>{fmtDate(c.fecha_aprobacion, true)}</dd>
              <dt className="text-muted">Debía llegar</dt><dd>{fmtDate(fechaCompromiso ?? c.fecha_objetivo, true)}</dd></>}
              <dt className="text-muted">Llegó</dt><dd className="font-semibold">{fmtDate(c.fecha_entrega, true)}{!directo && c.horas_entrega !== null && <span className="font-normal text-muted"> · {c.horas_entrega} h desde la compra</span>}
                {requerimiento?.created_at && c.fecha_entrega && <span className="font-normal text-muted"> · {horasDesde(requerimiento.created_at, c.fecha_entrega)} desde el requerimiento</span>}</dd>
              {recibidoPor && <><dt className="text-muted">Registró</dt><dd>{recibidoPor}</dd></>}
              <dt className="text-muted">Resultado</dt>
              <dd className="flex flex-wrap gap-1">
                {c.on_time !== null && <Badge tone={c.on_time ? 'green' : 'red'}>{c.on_time ? 'A tiempo' : 'Fuera de plazo'}</Badge>}
                {c.in_full !== null && <Badge tone={c.in_full ? 'green' : 'amber'}>{c.in_full ? 'Completa' : `Incompleta · ${fmtPct(c.fill_rate)}`}</Badge>}
                {directo && <Badge tone="gray">Sin orden de compra</Badge>}
              </dd>
            </dl>
          </div>
        </div>

        <p className="mb-2 text-xs font-bold tracking-wide uppercase">3. Detalle de lo comprado</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead><tr className="bg-canvas">
              {['N°', 'Bien / producto', 'Pedido', 'Llegó', 'Precio unit.', 'Importe', ...(hayVence ? ['Vence'] : [])].map((h) => (
                <th key={h} className={`${fila} text-left font-semibold`}>{h}</th>))}
            </tr></thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={l.id}>
                  <td className={fila}>{i + 1}</td>
                  <td className={fila}><span className="font-medium">{l.producto}</span>
                    {l.producto_id ? l.producto_codigo && <span className="ml-1 text-muted">({l.producto_codigo})</span> : <span className="ml-1 text-muted">· fuera de catálogo</span>}</td>
                  <td className={`${fila} text-right tabular`}>{fmtQty(l.cantidad_solicitada)} {l.unidad}</td>
                  <td className={`${fila} text-right tabular ${recibido(l) < Number(l.cantidad_solicitada) ? 'font-semibold text-amber-700' : ''}`}>{fmtQty(recibido(l))}</td>
                  <td className={`${fila} text-right tabular ${difPrecio(l) ? 'font-semibold text-amber-700' : ''}`}>{fmtSoles(l.precio_unitario)}
                    {difPrecio(l) && <span className="block text-[10px] font-normal text-muted">orden {fmtSoles(l.precio_orden)}</span>}</td>
                  <td className={`${fila} text-right font-semibold tabular`}>{fmtSoles(recibido(l) * Number(l.precio_unitario))}</td>
                  {hayVence && <td className={fila}>{fmtDate(l.fecha_vencimiento)}</td>}
                </tr>
              ))}
              <tr><td colSpan={5} className={`${fila} text-right font-semibold`}>Total compra</td><td className={`${fila} text-right font-bold tabular`}>{fmtSoles(c.total)}</td>{hayVence && <td className={fila} />}</tr>
            </tbody>
          </table>
        </div>
        {faltantes.length > 0 && <p className="mt-2 text-xs text-amber-700">No llegó completo: {faltantes.map((l) => `${l.producto} (${fmtQty(recibido(l))} de ${fmtQty(l.cantidad_solicitada)})`).join(', ')}.</p>}

        <p className="mt-5 mb-2 text-xs font-bold tracking-wide uppercase">4. Transporte</p>
        {fletes.length ? (
          <table className="w-full border-collapse text-xs">
            <thead><tr className="bg-canvas">{['Tramo', 'Fecha', 'Transportista', 'Desde → hasta', 'Guía / boleta', 'Costo'].map((h) => <th key={h} className={`${fila} text-left font-semibold`}>{h}</th>)}</tr></thead>
            <tbody>
              {fletes.map((t, i) => (
                <tr key={t.id}><td className={fila}>{i + 1}</td><td className={fila}>{fmtDate(t.fecha)}</td><td className={fila}>{t.proveedor?.razon_social ?? t.transportista ?? '—'}</td>
                  <td className={fila}>{t.ciudad?.nombre ?? '—'} → {t.destino ?? '—'}</td><td className={fila}>{t.documento ?? '—'}</td><td className={`${fila} text-right tabular`}>{fmtSoles(t.costo)}</td></tr>
              ))}
              <tr><td colSpan={5} className={`${fila} text-right font-semibold`}>Total flete</td><td className={`${fila} text-right font-bold tabular`}>{fmtSoles(c.costo_transporte)}</td></tr>
            </tbody>
          </table>
        ) : <p className="text-xs text-muted">Sin flete: el proveedor la entregó en el local.</p>}

        <div className="mt-5 ml-auto w-full max-w-xs rounded-lg border border-line text-sm">
          <div className="flex justify-between px-3 py-1.5"><span className="text-muted">Compra</span><span className="tabular">{fmtSoles(c.total)}</span></div>
          <div className="flex justify-between border-t border-line px-3 py-1.5"><span className="text-muted">Flete</span><span className="tabular">{fmtSoles(c.costo_transporte)}</span></div>
          <div className="flex justify-between border-t-2 border-ink-900 px-3 py-2 font-bold"><span>Costo total</span><span className="tabular">{fmtSoles(c.costo_total)}</span></div>
        </div>
        {observacion && <p className="mt-3 text-sm"><span className="text-muted">Observación:</span> {observacion}</p>}
      </section>
    </>
  )
}
