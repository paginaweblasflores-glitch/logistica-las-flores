import { AvisoStockDia } from '@/components/aviso-stock-dia'
import { getAmbito, getAlmacenActivo, soloConsulta } from '@/lib/session'
import { ElegirAlmacen } from '@/components/elegir-almacen'
import { getAlmacenes, getProveedores } from '@/lib/queries'
import { PageHeader, Section } from '@/components/ui'
import { Select } from '@/components/select'
import { ProveedorPicker } from '@/components/proveedor-picker'
import { TotalComprobante } from '@/components/total-comprobante'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import Link from 'next/link'
import { Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { IngresoLineas } from './lineas'
import { LlegadaCompra, type LineaPedida } from './llegada'
import { registrarIngreso } from '../../compras/actions'
import { COMPROBANTES } from '@/lib/documentos'

/**
 * Ingreso directo del almacén: compras que el almacén maneja solo (sin requerimiento ni orden de compra),
 * con la boleta en mano. Es lo que antes se anotaba en el Excel "ALMACEN F1 Y H2".
 */
export async function FormularioCompraBoleta({ tabs, compraId }: { tabs?: React.ReactNode; compraId?: string }) {
  const [{ local }, sel, supabase] = await Promise.all([getAmbito(), getAlmacenActivo(), createClient()])
  if (soloConsulta(sel)) return <ElegirAlmacen titulo="Nueva entrada" volver={{ href: '/entradas', label: 'Entradas' }} />
  // compras que Logística ya marcó «Comprado» y deben llegar a este almacén (del requerimiento del almacén)
  let qCamino = supabase.from('compra')
    .select(`id, numero, fecha, fecha_compromiso, proveedor_id, oferta_id, proveedor:proveedor_id(razon_social), requerimiento:requerimiento_id(numero),
             compra_detalle(id, producto_id, cantidad_solicitada, cantidad_pedida, requerimiento_detalle_id, pedida:unidad_pedido_id(id, nombre), producto:producto_id(nombre, controla_lote, costo_referencia, unidad_id, contenido, contenido_unidad_id, unidad:unidad_id(codigo), alm:producto_almacen(almacen_id, codigo)))`)
    .eq('estado', 'aprobada').order('fecha')
  qCamino = sel.id ? qCamino.eq('almacen_id', sel.id) : local ? qCamino.eq('local_id', local.id) : qCamino
  const [almacenes, proveedores, { data: camino }] = await Promise.all([getAlmacenes(local?.id, ['almacen']), getProveedores(), qCamino])
  type CC = { id: string; numero: string; fecha: string; fecha_compromiso: string | null; proveedor_id: string | null; oferta_id: string | null; proveedor: { razon_social: string } | null; requerimiento: { numero: string } | null
    compra_detalle: { id: string; producto_id: string | null; cantidad_solicitada: number; cantidad_pedida: number | null; requerimiento_detalle_id: string | null; pedida: { id: string; nombre: string } | null
      producto: { nombre: string; controla_lote: boolean; costo_referencia: number; unidad_id: string; contenido: number | null; contenido_unidad_id: string | null; unidad: { codigo: string }; alm: { almacen_id: string; codigo: number | null }[] } | null }[] }
  // solo las que traen productos del almacén (lo fuera de catálogo va al área, no aquí)
  const enCamino = ((camino ?? []) as unknown as CC[]).filter((c) => c.compra_detalle.some((d) => d.producto_id))
  const elegida = enCamino.find((c) => c.id === compraId)
  const titulo = `Nueva entrada${sel.actual ? ` · ${sel.actual.corto}` : ''}`
  const lista = enCamino.length > 0 && (
    <section className="card mb-5 p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Truck className="size-4 text-brand-600" /> ¿Es la llegada de un requerimiento? Elíjalo y se carga lo pedido</p>
      <div className="flex flex-wrap gap-2">
        {enCamino.map((c) => (
          <Link key={c.id} href={`/entradas/nueva?tipo=compra&compra=${c.id}`}
            className={cn('rounded-lg border px-3 py-2 text-sm', c.id === compraId ? 'border-brand-600 bg-brand-50' : 'border-line hover:border-brand-200 hover:bg-canvas')}>
            <b>{c.requerimiento?.numero ?? c.numero}</b>{c.proveedor && <> · {c.proveedor.razon_social}</>}
            <span className="block text-xs text-muted">{((n) => `${n} ${n === 1 ? 'producto' : 'productos'}`)(c.compra_detalle.filter((d) => d.producto_id).length)} · comprado el {fmtDate(c.fecha)}{c.fecha_compromiso ? ` · llega ${fmtDate(c.fecha_compromiso, true)}` : ''}</span>
          </Link>
        ))}
        {compraId && <Link href="/entradas/nueva?tipo=compra" className="self-center px-2 text-xs font-semibold text-muted hover:text-brand-600">No es de un requerimiento</Link>}
      </div>
    </section>
  )
  // Llegada de la compra elegida: lo pedido viene cargado; se completa lo de la boleta
  if (elegida && sel.actual) {
    const almId = sel.actual.id
    // comprada por cotización: el precio adjudicado de cada producto (viene sugerido)
    const { data: cot } = elegida.oferta_id
      ? await supabase.from('cotizacion_precio').select('precio_unitario, item:item_id(requerimiento_detalle_id)').eq('oferta_id', elegida.oferta_id)
      : { data: [] }
    const cotizado = new Map(((cot ?? []) as unknown as { precio_unitario: number; item: { requerimiento_detalle_id: string | null } }[])
      .filter((x) => x.item.requerimiento_detalle_id).map((x) => [x.item.requerimiento_detalle_id!, Number(x.precio_unitario)]))
    const lineas: LineaPedida[] = elegida.compra_detalle.filter((d) => d.producto_id && d.producto).map((d) => ({
      detalle_id: d.id, producto_id: d.producto_id!, codigo: String(d.producto!.alm.find((a) => a.almacen_id === almId)?.codigo ?? '—'),
      nombre: d.producto!.nombre, unidad: d.producto!.unidad.codigo, pedido: Number(d.cantidad_solicitada), controla_lote: d.producto!.controla_lote,
      unidad_id: d.producto!.unidad_id, contenido: d.producto!.contenido, contenido_unidad_id: d.producto!.contenido_unidad_id,
      ultimo: Number(d.producto!.costo_referencia) > 0 ? Number(d.producto!.costo_referencia) : null,
      cotizado: d.requerimiento_detalle_id ? cotizado.get(d.requerimiento_detalle_id) ?? null : null,
      enPedido: d.pedida && Number(d.cantidad_pedida) > 0 && Number(d.cantidad_pedida) !== Number(d.cantidad_solicitada)
        ? { cantidad: Number(d.cantidad_pedida), unidad_id: d.pedida.id, nombre: d.pedida.nombre, factor: Number(d.cantidad_solicitada) / Number(d.cantidad_pedida) } : null,
    }))
    return (
      <>
        <PageHeader title={titulo} back={{ href: '/entradas', label: 'Entradas' }}
          description={`Llegada de ${elegida.requerimiento?.numero ?? elegida.numero}${elegida.proveedor ? ` · ${elegida.proveedor.razon_social}` : ''}. Lo pedido ya está cargado y el precio viene sugerido: corrija lo que llegó y el precio solo si la boleta trae otro.`} />
        <AvisoStockDia compacto />
        {lista}
        <Section title="Productos que llegaron y datos de la boleta">
          <div className="mb-5 grid gap-4 md:grid-cols-4">{tabs}</div>
          <LlegadaCompra compraId={elegida.id} lineas={lineas} almacenId={almId} proveedores={proveedores} proveedorId={elegida.proveedor_id} />
        </Section>
      </>
    )
  }
  // viene elegido el almacén de la barra superior; con «Todos», el Almacén 01
  const principal = almacenes.find((a) => a.id === sel.id) ?? almacenes.find((a) => a.tipo === 'almacen')
  const ahora = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 16)
  return (
    <>
      <PageHeader title={titulo} back={{ href: '/entradas', label: 'Entradas' }} />
        <AvisoStockDia compacto />
      {lista}
      <ActionForm action={registrarIngreso} className="space-y-5">
        <Section title="Productos que ingresaron y datos de la boleta">
          {/* orden estándar: tipo → productos → datos → observación */}
          <div className="grid gap-4 md:grid-cols-4">{tabs}</div>
          <div className="mt-5 space-y-3">
            <IngresoLineas almacenId={sel.id} />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2"><span className="label">Proveedor</span><ProveedorPicker name="proveedor" proveedores={proveedores} placeholder="Escriba para buscar: distraroj, backus…" /></div>
            {sel.actual
              ? <div><span className="label">Almacén</span><input type="hidden" name="almacen" value={sel.actual.id} /><p className="field flex items-center bg-canvas font-semibold">{sel.actual.corto}</p></div>
              : <label><span className="label">Almacén *</span><Select name="almacen" options={almacenes} defaultValue={principal?.id} required /></label>}
            <label><span className="label">Fecha y hora de ingreso</span><input type="datetime-local" name="fecha" defaultValue={ahora} className="field" /><input type="hidden" name="fecha_inicial" value={ahora} /></label>
            <label><span className="label">Comprobante</span>
              <Select name="tipo_documento" options={COMPROBANTES} defaultValue="boleta" required /></label>
            <label><span className="label">N° del comprobante</span><input name="numero_documento" className="field" placeholder="B001-000123" /></label>
            <TotalComprobante />
          </div>
          <label className="mt-4 block"><span className="label">Observación <span className="font-normal normal-case text-subtle">(opcional)</span></span><input name="observacion" className="field" /></label>
        </Section>
        <div className="flex justify-end"><SubmitButton confirm="¿Registrar la compra? Los productos se sumarán al stock del almacén.">Registrar entrada</SubmitButton></div>
      </ActionForm>
    </>
  )
}
