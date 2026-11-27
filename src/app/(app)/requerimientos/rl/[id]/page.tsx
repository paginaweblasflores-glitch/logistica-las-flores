import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getLocales, getPanel } from '@/lib/session'
import { LOGO_DOC } from '@/lib/empresa'
import { fmtDate, fmtQty } from '@/lib/format'
import { agruparLineas, aprobadoDe, factorDe, type LineaRL } from '@/lib/juntado'
import { RLCliente, type GrupoRL } from './cliente'

export const metadata = { title: 'Requerimiento juntado' }

type Linea = LineaRL & { enviado_at: string | null }
type Req = { id: string; numero: string; created_at: string; almacen: { nombre: string } | null; requerimiento_detalle: Linea[] }

/** «Almacén 01 — Hotel Umaru» → «Alm. 01» */
const almCorto = (n: string | undefined) => (n ?? 'Almacén').replace(/\s*—.*$/, '').replace(/^Almac[eé]n\s*/i, 'Alm. ')

/**
 * RL: los requerimientos del almacén de un negocio en un día, juntados para Logística. Fernanda marca los productos
 * de un proveedor, descarga la imagen (o el PDF) y se envía; esos productos quedan en verde como «Enviado».
 */
export default async function RequerimientoJuntadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [panel, locales, { data: rl }, { data: reqs }, { data: cots }] = await Promise.all([
    getPanel(), getLocales(),
    supabase.from('requerimiento_consolidado').select('id, numero, fecha, local_id').eq('id', id).maybeSingle(),
    supabase.from('requerimiento')
      .select('id, numero, created_at, almacen:almacen_id(nombre), requerimiento_detalle(id, producto_id, descripcion, cantidad_solicitada, cantidad_aprobada, cantidad_pedida, unidad_pedido_id, enviado_at, pedida:unidad_pedido_id(nombre), producto:producto_id(unidad:unidad_id(codigo)))')
      .eq('consolidado_id', id).neq('estado', 'rechazado').order('created_at'),
    supabase.from('cotizacion').select('id, numero, estado').eq('consolidado_id', id).neq('estado', 'anulada').order('created_at'),
  ])
  if (!rl || panel !== 'logistica') notFound()
  const negocio = locales.find((l) => l.id === rl.local_id)
  const requerimientos = (reqs ?? []) as unknown as Req[]
  const almacenDe = new Map<string, string>()
  for (const r of requerimientos) for (const d of r.requerimiento_detalle) almacenDe.set(d.id, almCorto(r.almacen?.nombre))

  // cantidad de una línea en la unidad en que se pidió (3 Paquete) o en la del producto
  const cant = (d: Linea) => factorDe(d) !== 1 ? `${fmtQty(aprobadoDe(d) / factorDe(d))} ${d.pedida!.nombre}` : `${fmtQty(aprobadoDe(d))} ${d.producto?.unidad.codigo ?? ''}`
  const grupos: GrupoRL[] = agruparLineas(requerimientos.flatMap((r) => r.requerimiento_detalle))
    .map((g): GrupoRL => {
      const enviados = g.lineas.filter((d) => d.enviado_at)
      const ultimo = enviados.map((d) => d.enviado_at!).sort().at(-1) ?? null
      return {
        id: g.clave, producto: g.lineas[0].descripcion,
        cantidad: g.pedida ? `${fmtQty(g.pedida.cantidad)} ${g.pedida.nombre}` : `${fmtQty(g.base)} ${g.lineas[0].producto?.unidad.codigo ?? ''}`,
        // pedido en más de un requerimiento: el detalle por almacén
        detalle: g.lineas.length > 1 ? g.lineas.map((d) => `${almacenDe.get(d.id)}: ${cant(d)}`).join(' · ') : null,
        almacenes: [...new Set(g.lineas.map((d) => almacenDe.get(d.id)!))].join(', '),
        lineas: g.lineas.map((d) => d.id),
        envio: enviados.length === g.lineas.length ? 'si' : enviados.length ? 'parcial' : 'no',
        enviadoAt: ultimo,
      }
    })
    .sort((a, b) => a.producto.localeCompare(b.producto))

  return (
    <RLCliente id={rl.id} numero={rl.numero} grupos={grupos}
      descripcion={`${negocio?.nombre ?? ''} · ${fmtDate(rl.fecha)} · ${requerimientos.length} requerimiento${requerimientos.length === 1 ? '' : 's'} del almacén`}
      requerimientos={requerimientos.map((r) => ({ id: r.id, numero: r.numero, almacen: almCorto(r.almacen?.nombre), hora: fmtDate(r.created_at, true) }))}
      cotizaciones={cots ?? []}
      empresa={{ razon: negocio?.razon_social || 'CORPORACIÓN LAS FLORES S.A.C.', ruc: negocio?.ruc ?? '—', direccion: negocio?.direccion ?? '', logo: LOGO_DOC[negocio?.codigo ?? 'LF'] ?? LOGO_DOC.LF }} />
  )
}
