import Image from 'next/image'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getLocales, getPanel } from '@/lib/session'
import { LOGO_DOC } from '@/lib/empresa'
import { fmtDate, fmtQty, fmtSoles } from '@/lib/format'
import { PageHeader, EstadoBadge, LinkButton, Note } from '@/components/ui'
import { ocCompleta, imprimeOC, AVISO_OC } from '@/lib/orden-compra'
import { PrintButton } from '@/components/print-button'

export const metadata = { title: 'Orden de compra' }

const IGV = 0.18
const celda = 'border border-ink-900/40 px-2 py-1.5'
const titulo = 'border border-ink-900/40 bg-canvas px-2 py-1 text-[11px] font-bold tracking-wide uppercase'

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return <tr><th className={`${celda} w-40 text-left font-semibold`}>{label}</th><td className={celda}>{children}</td></tr>
}
const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Orden de compra imprimible, con el formato en papel de Logística (Fernanda): información de la compra,
 * detalle, condiciones, subtotal / IGV / total a pagar y las firmas «Elaborado por» y «Aprobado por».
 */
export default async function OrdenCompraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: c }, { data: det }, locales, panel, { data: plazo }, { data: firmasNeg }, { data: almDet }] = await Promise.all([
    supabase.from('compra')
      .select('numero, fecha, estado, sin_orden, local_id, fecha_aprobacion, fecha_compromiso, observacion, incluye_igv, almacen:almacen_id(nombre), proveedor:proveedor_id(razon_social, ruc, direccion, telefono), requerimiento:requerimiento_id(numero, solicitante, area:area_id(nombre))')
      .eq('id', id).maybeSingle(),
    supabase.from('v_compra_detalle').select('id, producto, producto_codigo, unidad, cantidad_solicitada, precio_unitario').eq('compra_id', id),
    getLocales(), getPanel(),
    // entrega pactada o, si no se pactó, la aprobación + el plazo de Configuración (lo mismo que «Debe llegar»)
    supabase.from('v_compra_resumen').select('fecha_objetivo').eq('id', id).maybeSingle(),
    // las firmas de la OC del negocio (Configuración → Firmas de la orden de compra)
    supabase.from('compra').select('local:local_id(oc_elaborado_por, oc_aprobado_por)').eq('id', id).maybeSingle(),
    // una factura con productos de varios almacenes: a qué almacén entra cada producto
    supabase.from('compra_detalle').select('id, almacen:almacen_id(nombre)').eq('compra_id', id),
  ])
  // la OC es de Logística y Contabilidad; el almacén no la abre. La compra con boleta del almacén también tiene la
  // suya: se genera al registrar la entrada, con lo que trae la boleta
  if (!c || !imprimeOC(panel)) notFound()
  const firmas = (firmasNeg?.local as unknown as { oc_elaborado_por: string | null; oc_aprobado_por: string | null } | null) ?? null

  const negocio = locales.find((l) => l.id === c.local_id)
  const proveedor = c.proveedor as unknown as { razon_social: string; ruc: string | null; direccion: string | null; telefono: string | null } | null
  const req = c.requerimiento as unknown as { numero: string; solicitante: string | null; area: { nombre: string } | null } | null
  const almacen = (c.almacen as unknown as { nombre: string } | null)?.nombre ?? '—'
  // el almacén de cada producto (si la factura trae productos para varios almacenes)
  const almDe = new Map(((almDet ?? []) as unknown as { id: string; almacen: { nombre: string } | null }[]).map((x) => [x.id, x.almacen?.nombre ?? almacen]))
  const lugares = [...new Set([...almDe.values()])]
  const corto = (n: string) => n.replace(/\s*—.*$/, '')
  const lineas = (det ?? []) as { id: string; producto: string; producto_codigo: string | null; unidad: string; cantidad_solicitada: number; precio_unitario: number }[]

  // los precios de la orden incluyen IGV (lo habitual) o no: el total a pagar siempre lleva IGV
  const suma = r2(lineas.reduce((s, l) => s + Number(l.cantidad_solicitada) * Number(l.precio_unitario), 0))
  const subtotal = c.incluye_igv ? r2(suma / (1 + IGV)) : suma
  const total = c.incluye_igv ? suma : r2(suma * (1 + IGV))
  const igv = r2(total - subtotal)
  const sinPrecio = suma === 0
  // incompleta (sin proveedor o sin precios): no se imprime todavía
  if (!ocCompleta({ estado: c.estado, proveedor, total: suma })) {
    return (
      <>
        <PageHeader title={`Orden de compra ${c.numero}`} back={{ href: `/compras/${id}`, label: 'Volver a la compra' }} actions={<EstadoBadge estado={c.estado} />} />
        <Note tone="warn">{c.estado === 'anulada' ? 'Esta orden está anulada.' : AVISO_OC}</Note>
      </>
    )
  }

  return (
    <>
      <PageHeader title={`Orden de compra ${c.numero}`} back={{ href: `/compras/${id}`, label: 'Volver a la compra' }}
        actions={<><EstadoBadge estado={c.estado} /><PrintButton label="Imprimir / PDF" /></>} />
      {c.estado !== 'aprobada' && c.estado !== 'recibida' && (
        <p className="no-print mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {c.estado === 'anulada' ? 'Esta orden está anulada.' : 'Esta orden aún no está aprobada: se imprime como borrador.'}
          {c.estado === 'borrador' && panel === 'logistica' && <> <LinkButton href={`/compras/${id}`} variant="outline" size="sm" className="ml-2">Ir a aprobarla</LinkButton></>}
        </p>
      )}

      <section className="documento card print-area mx-auto max-w-4xl p-6 text-sm sm:p-8">
        <header className="mb-4 flex items-center justify-between gap-4 border-b-2 border-ink-900 pb-4">
          <div className="flex items-center gap-4">
            <Image src={LOGO_DOC[negocio?.codigo ?? 'LF'] ?? LOGO_DOC.LF} alt="" width={150} height={64} priority className="h-16 w-auto object-contain" />
            <div>
              <p className="font-bold">{negocio?.razon_social ?? 'CORPORACIÓN LAS FLORES S.A.C.'}</p>
              <p className="text-xs">RUC {negocio?.ruc ?? '—'} · {negocio?.nombre}</p>
            </div>
          </div>
          <div className="rounded-lg border-2 border-ink-900 px-4 py-2 text-center">
            <p className="text-xs font-bold tracking-wide uppercase">Orden de compra</p>
            <p className="text-lg font-bold whitespace-nowrap">N° {c.numero}</p>
            {c.estado === 'borrador' && <p className="text-[10px] font-bold text-brand-700 uppercase">Borrador · sin aprobar</p>}
            {c.estado === 'anulada' && <p className="text-[10px] font-bold text-brand-700 uppercase">Anulada</p>}
          </div>
        </header>

        <table className="mb-4 w-full border-collapse">
          <thead><tr><th colSpan={2} className={`${titulo} text-left`}>1. Información de compra</th></tr></thead>
          <tbody>
            <Dato label="Fecha">{fmtDate(c.fecha_aprobacion ?? c.fecha)}</Dato>
            <Dato label="Área solicitante">{req?.area?.nombre ?? almacen}{req && <span className="text-muted"> · Requerimiento {req.numero}{req.solicitante ? ` (${req.solicitante})` : ''}</span>}</Dato>
            <Dato label="Proveedor">{proveedor ? <><b>{proveedor.razon_social}</b>{proveedor.ruc && <> · RUC {proveedor.ruc}</>}</> : '—'}
              {proveedor?.direccion && <span className="block text-xs text-muted">{proveedor.direccion}{proveedor.telefono ? ` · Tel. ${proveedor.telefono}` : ''}</span>}</Dato>
          </tbody>
        </table>

        <p className={`${titulo} border-b-0`}>2. Detalle</p>
        <table className="mb-1 w-full border-collapse">
          <thead><tr className="bg-canvas">
            {['N°', 'Cantidad', 'Unidad', 'Producto / servicio', 'P. unitario', 'Importe'].map((h) => <th key={h} className={`${celda} text-left font-semibold`}>{h}</th>)}
          </tr></thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={l.id}>
                <td className={`${celda} w-8`}>{i + 1}</td>
                <td className={`${celda} w-20 text-right tabular`}>{fmtQty(l.cantidad_solicitada)}</td>
                <td className={`${celda} w-20`}>{l.unidad}</td>
                <td className={celda}>{l.producto}{l.producto_codigo && <span className="text-muted"> ({l.producto_codigo})</span>}
                  {lugares.length > 1 && <span className="text-muted"> · {corto(almDe.get(l.id) ?? almacen)}</span>}</td>
                <td className={`${celda} w-24 text-right tabular`}>{Number(l.precio_unitario) > 0 ? fmtSoles(l.precio_unitario) : '—'}</td>
                <td className={`${celda} w-28 text-right tabular`}>{Number(l.precio_unitario) > 0 ? fmtSoles(Number(l.cantidad_solicitada) * Number(l.precio_unitario)) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mb-4 ml-auto w-full max-w-xs">
          <table className="w-full border-collapse">
            <tbody>
              <tr><th className={`${celda} text-left font-semibold`}>Subtotal</th><td className={`${celda} text-right tabular`}>{sinPrecio ? '—' : fmtSoles(subtotal)}</td></tr>
              <tr><th className={`${celda} text-left font-semibold`}>IGV (18 %)</th><td className={`${celda} text-right tabular`}>{sinPrecio ? '—' : fmtSoles(igv)}</td></tr>
              <tr className="bg-canvas"><th className={`${celda} text-left font-bold`}>Total a pagar</th><td className={`${celda} text-right font-bold tabular`}>{sinPrecio ? '—' : fmtSoles(total)}</td></tr>
            </tbody>
          </table>
          {sinPrecio && <p className="mt-1 text-[11px] text-muted">El precio llega con el comprobante.</p>}
        </div>

        <table className="mb-8 w-full border-collapse">
          <thead><tr><th colSpan={2} className={`${titulo} text-left`}>3. Condiciones</th></tr></thead>
          <tbody>
            {/* la compra con boleta del almacén: el día en que llegó */}
            <Dato label="Fecha de entrega">{c.sin_orden ? fmtDate(c.fecha) : plazo?.fecha_objetivo ? fmtDate(plazo.fecha_objetivo) : 'Al aprobar la orden'}</Dato>
            <Dato label="Lugar de entrega">{lugares.length > 1 ? lugares.join(' · ') : almacen}</Dato>
            <Dato label="Observaciones">{c.observacion ?? '—'}</Dato>
          </tbody>
        </table>

        {/* solo los nombres (sin línea de firma): los guardados en Configuración para el negocio */}
        <div className="firmas grid grid-cols-2 gap-10 pt-4 text-xs">
          {[['Elaborado por', firmas?.oc_elaborado_por ?? null, `Almacén ${negocio?.nombre ?? ''}`.trim()], ['Aprobado por', firmas?.oc_aprobado_por ?? null, 'Logística']].map(([t, n, cargo]) => (
            <div key={t}>
              <p className="font-bold uppercase">{t}</p>
              <p className="text-sm">{n ?? '—'}</p>
              {cargo && <p className="text-muted">{cargo}</p>}
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
