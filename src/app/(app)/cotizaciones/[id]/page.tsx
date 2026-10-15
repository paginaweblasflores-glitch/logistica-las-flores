import { notFound } from 'next/navigation'
import { FileSpreadsheet, ShoppingCart } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getProveedores } from '@/lib/queries'
import { fmtDate, fmtPct, fmtQty, fmtSoles } from '@/lib/format'
import Link from 'next/link'
import { PageHeader, Section, EstadoBadge, Stat, LinkButton, Table, Th, Td } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { comprarDesdeCotizacion } from '../actions'
import { CotizacionesAnteriores, type Anterior } from './anteriores'
import { OfertaForm } from './oferta-form'
import { Comparativo, type OfertaCmp } from './comparativo'
import { nombreOferta } from '@/lib/proveedor-tipo'

export const metadata = { title: 'Cotización' }

export default async function CotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: c }, { data: items }, { data: ofertas }, proveedores, { data: comprasCot }, { data: origenRow }, { data: anteriores }] = await Promise.all([
    supabase.from('v_cotizacion_ahorro').select('*').eq('id', id).maybeSingle(),
    supabase.from('cotizacion_item').select('id, descripcion, cantidad, unidad, producto_id, oferta_ganadora_id, cantidad_pedida, unidad_pedido, factor').eq('cotizacion_id', id).order('descripcion'),
    supabase.from('cotizacion_oferta').select('id, ronda, fecha, canal, observacion, proveedor_id, proveedor:proveedor_id(razon_social), cotizacion_precio(item_id, precio_unitario, precio_unidad)').eq('cotizacion_id', id),
    getProveedores(),
    supabase.from('compra').select('id, numero, estado, oferta_id').eq('cotizacion_id', id).neq('estado', 'anulada'),
    supabase.from('cotizacion').select('requerimiento:requerimiento_id(origen)').eq('id', id).maybeSingle(),
    // lo que cada proveedor ya cotizó por estos productos (en cotizaciones anteriores)
    supabase.rpc('fn_cotizaciones_anteriores', { p_cotizacion: id }),
  ])
  // del requerimiento del almacén: «Comprado» sin precios (los pone el almacén con la boleta)
  const delAlmacen = (origenRow?.requerimiento as unknown as { origen: string } | null)?.origen === 'almacen'
  if (!c) notFound()
  type Of = { id: string; ronda: number; fecha: string; canal: string | null; observacion: string | null; proveedor_id: string; proveedor: { razon_social: string }; cotizacion_precio: { item_id: string; precio_unitario: number; precio_unidad: number | null }[] }
  const its = (items ?? []) as { id: string; descripcion: string; cantidad: number; unidad: string | null; producto_id: string | null; oferta_ganadora_id: string | null
    cantidad_pedida: number | null; unidad_pedido: string | null; factor: number }[]
  const ofs = ((ofertas ?? []) as unknown as Of[]).sort((a, b) => a.proveedor.razon_social.localeCompare(b.proveedor.razon_social) || (a.canal ?? '').localeCompare(b.canal ?? '') || a.ronda - b.ronda)
  // una "opción" = proveedor + forma de compra (Plaza Vea en tienda y por internet se comparan por separado);
  // de cada opción vale su última ronda
  const clave = (o: Of) => `${o.proveedor_id}|${o.canal ?? 'tienda'}`
  const ultimas = new Map<string, Of>()
  for (const o of ofs) ultimas.set(clave(o), o)
  const cmp: OfertaCmp[] = ofs.map((o) => ({
    id: o.id, proveedor: o.proveedor.razon_social, canal: o.canal, ronda: o.ronda, fecha: o.fecha, vigente: ultimas.get(clave(o)) === o,
    anterior: o.observacion === 'Precios de una cotización anterior',
    precios: Object.fromEntries(o.cotizacion_precio.map((p) => [p.item_id, Number(p.precio_unitario)])),
    sueltos: Object.fromEntries(o.cotizacion_precio.filter((p) => p.precio_unidad !== null).map((p) => [p.item_id, Number(p.precio_unidad)])),
  }))

  // Adjudicada: una compra por cada oferta ganadora
  const compras = (comprasCot ?? []) as { id: string; numero: string; estado: string; oferta_id: string | null }[]
  const partes = [...new Set(its.map((i) => i.oferta_ganadora_id).filter(Boolean))].map((oid) => {
    const o = cmp.find((x) => x.id === oid)!
    const suyos = its.filter((i) => i.oferta_ganadora_id === oid)
    return { oferta: o, productos: suyos.length, total: suyos.reduce((s, i) => s + (o.precios[i.id] ?? 0) * Number(i.cantidad), 0),
      compra: compras.find((x) => x.oferta_id === oid) ?? (compras.length === 1 && !compras[0].oferta_id ? compras[0] : undefined) }
  })
  const pendientes = partes.filter((p) => !p.compra).length
  // adjudicada: cada producto con su proveedor ganador y la compra que le toca
  const adjudicados = its.filter((i) => i.oferta_ganadora_id).map((i) => {
    const parte = partes.find((x) => x.oferta.id === i.oferta_ganadora_id)!
    return { i, o: parte.oferta, compra: parte.compra }
  })
  // Mientras está abierta: cuántos productos tienen precio y el mejor total posible (lo más barato de cada uno)
  const vigentesCmp = cmp.filter((o) => o.vigente)
  const minimo = (item: string) => Math.min(...vigentesCmp.map((o) => o.precios[item] ?? Infinity))
  const conPrecio = its.filter((i) => Number.isFinite(minimo(i.id))).length
  const mejorCombinacion = its.reduce((s, i) => s + (Number.isFinite(minimo(i.id)) ? minimo(i.id) * Number(i.cantidad) : 0), 0)

  return (
    <>
      <PageHeader title={`Cotización ${c.numero}`} back={{ href: '/cotizaciones', label: 'Cotizaciones' }} description={`${c.titulo} · ${fmtDate(c.fecha)}`}
        actions={<><EstadoBadge estado={c.estado} />
          {delAlmacen && pendientes > 0 && (
            <ActionForm action={comprarDesdeCotizacion}><input type="hidden" name="cotizacion_id" value={id} />
              <SubmitButton confirm={partes.length > 1 ? `¿Marcar como comprado? Se registran ${partes.length} compras (una por proveedor). El almacén las verá en Entradas y pondrá los precios de la boleta.` : '¿Marcar como comprado? El almacén la verá en Entradas y pondrá los precios de la boleta.'}>Comprado</SubmitButton></ActionForm>
          )}
          {!delAlmacen && partes.length === 1 && !partes[0].compra && <LinkButton href={`/compras/nueva?cotizacion=${id}&oferta=${partes[0].oferta.id}`}>Generar compra</LinkButton>}
          {partes.length === 1 && partes[0].compra && <LinkButton href={`/compras/${partes[0].compra.id}`} variant="outline">Ver compra {partes[0].compra.numero}</LinkButton>}</>} />

      {/* Indicadores según el paso: abierta = cómo va la comparación; adjudicada = resultado y compras */}
      {c.estado === 'abierta' ? (
        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
          <Stat label="Opciones cotizadas" value={ultimas.size} hint={`${ofs.length} ofertas en total`} />
          <Stat label="Productos con precio" value={`${conPrecio} de ${its.length}`} tone={conPrecio < its.length ? 'warn' : 'default'}
                hint={conPrecio < its.length ? 'Falta cotizar algunos productos' : 'Todos tienen al menos un precio'} />
          <Stat label="Mejor combinación" value={fmtSoles(mejorCombinacion)} hint="El precio más bajo de cada producto" />
        </div>
      ) : c.estado === 'adjudicada' ? (
        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Adjudicado" value={fmtSoles(c.total_adjudicado)} hint={c.proveedor_aprobado ?? undefined} />
          <Stat label="Mejor precio 1ª ronda" value={fmtSoles(c.total_primera_ronda)} />
          <Stat label="Ahorro por negociación" value={fmtSoles(c.ahorro)} tone={Number(c.ahorro) > 0 ? 'good' : 'default'}
                hint={c.ahorro && c.total_primera_ronda ? fmtPct(Number(c.ahorro) / Number(c.total_primera_ronda)) : undefined} />
          <Stat label="Compras generadas" value={`${partes.length - pendientes} de ${partes.length}`} tone={pendientes ? 'warn' : 'good'}
                hint={pendientes ? 'Falta generar alguna compra' : 'Todas generadas'} />
        </div>
      ) : null}

      {/* adjudicada: ya no el cuadro, sino lo que ganó cada proveedor y su compra */}
      {c.estado === 'adjudicada' ? (
        <Section icon={ShoppingCart} title="Productos adjudicados" className="print-area mb-5" bodyClassName="p-0">
          <Table>
            <thead><tr><Th>Producto</Th><Th>Proveedor</Th><Th right>Cantidad</Th><Th right>Precio</Th><Th right>Precio por unidad</Th><Th right>Importe</Th><Th className="no-print">Compra</Th></tr></thead>
            <tbody>
              {adjudicados.map(({ i, o, compra }) => {
                const p = o.precios[i.id] ?? 0
                const enPedido = !!i.unidad_pedido && Number(i.factor) !== 1
                return (
                  <tr key={i.id}>
                    <Td className="font-medium">{i.descripcion}</Td>
                    <Td>{nombreOferta(o)}</Td>
                    <Td right className="tabular">{enPedido ? <>{fmtQty(i.cantidad_pedida)} {i.unidad_pedido}<span className="block text-[11px] text-muted">= {fmtQty(i.cantidad)} {i.unidad}</span></> : <>{fmtQty(i.cantidad)} {i.unidad}</>}</Td>
                    <Td right className="tabular">{enPedido ? <>{fmtSoles(p * Number(i.factor))} <span className="text-xs text-muted">/{i.unidad_pedido!.toLowerCase()}</span></> : <>{fmtSoles(p)} <span className="text-xs text-muted">/{i.unidad}</span></>}</Td>
                    <Td right className="tabular">{enPedido ? <>{fmtSoles(o.sueltos?.[i.id] ?? p)} <span className="text-xs text-muted">/{i.unidad}</span></> : '—'}</Td>
                    <Td right className="font-semibold tabular">{fmtSoles(p * Number(i.cantidad))}</Td>
                    <Td className="no-print">{compra
                      ? <Link href={`/compras/${compra.id}`} className="font-semibold text-brand-600 hover:underline">{compra.numero}</Link>
                      : delAlmacen ? <span className="text-xs text-muted">Por marcar como comprado</span>
                      : <LinkButton href={`/compras/nueva?cotizacion=${id}&oferta=${o.id}`} size="sm">Generar compra</LinkButton>}</Td>
                  </tr>
                )
              })}
              <tr className="bg-canvas/70"><Td colSpan={5} className="text-right font-bold">Total adjudicado</Td>
                <Td right className="font-bold tabular">{fmtSoles(adjudicados.reduce((s, { i, o }) => s + (o.precios[i.id] ?? 0) * Number(i.cantidad), 0))}</Td><Td className="no-print" /></tr>
            </tbody>
          </Table>
        </Section>
      ) : (
      <Section icon={FileSpreadsheet} title="Cuadro comparativo de proveedores" className="print-area mb-5" bodyClassName="p-0">
        {ofs.length
          ? <Comparativo key={ofs.map((o) => o.id).join()} cotizacionId={id} abierta={c.estado === 'abierta'} ofertas={cmp}
              items={its.map((i) => ({ id: i.id, descripcion: i.descripcion, cantidad: Number(i.cantidad), unidad: i.unidad, ganadora: i.oferta_ganadora_id,
                cantidadPedida: i.cantidad_pedida === null ? null : Number(i.cantidad_pedida), unidadPedido: i.unidad_pedido, factor: Number(i.factor || 1) }))} />
          : <div className="p-6 text-sm text-muted">Aún no hay ofertas. Registre la primera cotización de un proveedor.</div>}
      </Section>
      )}

      {c.estado === 'abierta' && (anteriores ?? []).length > 0 && (
        <CotizacionesAnteriores cotizacionId={id} anteriores={(anteriores ?? []) as Anterior[]} items={its.map((i) => ({ id: i.id, descripcion: i.descripcion }))} />
      )}
      {c.estado === 'abierta' && (
        <Section title="Registrar oferta / nueva ronda" className="no-print">
          <OfertaForm cotizacionId={id} proveedores={proveedores} items={its.map((i) => ({ id: i.id, descripcion: i.descripcion, cantidad: Number(i.cantidad), unidad: i.unidad,
            cantidadPedida: i.cantidad_pedida === null ? null : Number(i.cantidad_pedida), unidadPedido: i.unidad_pedido, factor: Number(i.factor || 1) }))} />
        </Section>
      )}
    </>
  )
}
