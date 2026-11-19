import Link from 'next/link'
import { PackageX, Users, TrendingDown, BadgeAlert, Warehouse } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito } from '@/lib/session'
import { getAlmacenes } from '@/lib/queries'
import { fmtDate, fmtPct, fmtQty, fmtSoles, hoyLima, inicioDiaLima, finDiaLima } from '@/lib/format'
import { agruparPorZona } from '@/lib/categorias'
import { TablaPorCategoria } from '@/components/tabla-por-categoria'
import { sp } from '@/lib/utils'
import { PageHeader, Section, Stat, Table, Th, Td, FilterBar, FiltroFechas, EmptyState } from '@/components/ui'
import { BarList } from '@/components/charts'
import { PALETTE } from '@/lib/palette'

export const metadata = { title: 'Resumen de almacenes' }

/**
 * Supervisión de Logística (Fernanda no opera el almacén): lo que le importa de cada almacén en una sola
 * pantalla. Valor del inventario, stock bajo el mínimo, consumo por área, mermas y los
 * ingresos con un precio distinto al de la orden. El detalle de cada movimiento está en el Kardex.
 * Los vencimientos no van aquí: son de cada almacén (su campanita y su página de vencimientos).
 */
export default async function ResumenAlmacenesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  // la sesión y los almacenes al mismo tiempo (los almacenes no esperan a la sesión: se filtran después)
  const [params, { local }, supabase, todos] = await Promise.all([searchParams, getAmbito(), createClient(), getAlmacenes(null, ['almacen'])])
  const desde = sp(params, 'desde', `${hoyLima().slice(0, 7)}-01`), hasta = sp(params, 'hasta', hoyLima())
  const almacenes = todos.filter((a) => !local || a.local_id === local.id).sort((a, b) => a.nombre.localeCompare(b.nombre))   // 01, 02, Umaru
  const ids = almacenes.map((a) => a.id)

  // los totales ya vienen sumados de la base (antes se traían hasta 20 000 filas y se sumaban aquí)
  const [resumenR, ingresosR, traspasosR] = await Promise.all([
    supabase.rpc('fn_resumen_almacenes', { p_almacenes: ids, p_desde: desde, p_hasta: hasta }),
    supabase.from('v_ingreso_almacen').select('id, compra_id, numero, almacen_id, almacen, fecha_ingreso, proveedor, producto, precio_orden, precio_unitario, sin_orden')
      .in('almacen_id', ids).eq('diferencia_precio', true)
      .gte('fecha_ingreso', inicioDiaLima(desde)).lte('fecha_ingreso', finDiaLima(hasta)).order('fecha_ingreso', { ascending: false }).limit(50),
    supabase.from('traslado').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente').or(`almacen_origen_id.in.(${ids.join(',')}),almacen_destino_id.in.(${ids.join(',')})`),
  ])
  if (resumenR.error) throw resumenR.error

  type Bajo = { producto_id: string; almacen_id: string; almacen_nombre: string; nombre: string; unidad: string; cantidad: number; stock_minimo: number
    categoria: string | null; zona: string | null }
  type Resumen = {
    por_almacen: { almacen_id: string; productos: number; valor: number; bajo: number; compras: number; consumo: number; mermas: number }[]
    por_area: { area: string; valor: number }[]; top_productos: { producto_id: string; producto: string; valor: number }[]
    fifo_total: number; fifo_cumplidas: number; bajo_minimo: Bajo[]
  }
  type I = { id: string; compra_id: string; numero: string; almacen: string; fecha_ingreso: string; proveedor: string | null; producto: string; precio_orden: number; precio_unitario: number; sin_orden: boolean }
  const r = resumenR.data as Resumen
  const ingresos = (ingresosR.data ?? []) as I[]
  const bajoMinimo = r.bajo_minimo

  const porAlmacen = almacenes.map((a) => ({ ...a, ...(r.por_almacen.find((x) => x.almacen_id === a.id) ?? { productos: 0, valor: 0, bajo: 0, compras: 0, consumo: 0, mermas: 0 }) }))
  const tot = porAlmacen.reduce((t, a) => ({ valor: t.valor + Number(a.valor), consumo: t.consumo + Number(a.consumo), mermas: t.mermas + Number(a.mermas), compras: t.compras + Number(a.compras) }),
    { valor: 0, consumo: 0, mermas: 0, compras: 0 })
  const areas = r.por_area, top = r.top_productos
  const fifoPct = r.fifo_total ? r.fifo_cumplidas / r.fifo_total : null
  const variosAlmacenes = almacenes.length > 1

  // cada producto bajo el mínimo abre su Kardex en ese almacén
  const filaBajo = (s: Bajo) => (
    <tr key={s.producto_id + s.almacen_id} className="hover:bg-canvas/60">
      <Td><Link href={`/inventario/kardex?producto=${s.producto_id}&almacen=${s.almacen_id}`} className="font-medium hover:text-brand-600">{s.nombre}</Link></Td>
      {variosAlmacenes && <Td className="text-xs">{s.almacen_nombre}</Td>}
      <Td right className={Number(s.cantidad) <= 0 ? 'font-semibold text-brand-700' : 'font-semibold text-amber-700'}>{fmtQty(s.cantidad)} {s.unidad}</Td>
      <Td right className="text-muted">{fmtQty(s.stock_minimo)}</Td>
    </tr>
  )

  return (
    <>
      <PageHeader title="Resumen de almacenes"
        description="Lo que importa de cada almacén para supervisar: valor, stock mínimo, consumo por área y mermas. Cada movimiento en detalle está en el Kardex." />
      <FilterBar>
        <FiltroFechas desde={desde} hasta={hasta} />
      </FilterBar>

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Valor del inventario" value={fmtSoles(tot.valor)} hint="Hoy, al costo promedio" />
        <Stat label="Bajo el mínimo" value={bajoMinimo.length} tone={bajoMinimo.length ? 'warn' : 'default'} hint="Productos por reponer" />
        <Stat label="Consumo de áreas" value={fmtSoles(tot.consumo)} hint="Salidas del periodo" />
        <Stat label="Mermas y faltantes" value={fmtSoles(tot.mermas)} tone={tot.mermas ? 'warn' : 'default'} hint="Del periodo" />
        <Stat label="Cumplimiento FIFO" value={fmtPct(fifoPct)} meta={fifoPct === null ? undefined : { valor: fifoPct, meta: 1 }} hint={r.fifo_total ? `${r.fifo_total} salidas con lote` : 'Sin salidas con lote'} />
      </div>

      <Section icon={Warehouse} title="Por almacén" className="mb-5" bodyClassName="p-0" stats={[{ label: 'Traspasos sin recibir', value: traspasosR.count ?? 0 }]}>
        <Table>
          <thead><tr><Th>Almacén</Th><Th right>Productos con stock</Th><Th right>Valor</Th><Th right>Bajo mínimo</Th>
            <Th right>Compras</Th><Th right>Consumo de áreas</Th><Th right>Mermas y faltantes</Th></tr></thead>
          <tbody>
            {porAlmacen.map((a) => (
              <tr key={a.id}>
                <Td className="font-medium">{a.nombre}</Td>
                <Td right>{a.productos}</Td>
                <Td right className="font-semibold">{fmtSoles(a.valor)}</Td>
                <Td right className={a.bajo ? 'font-semibold text-amber-700' : 'text-muted'}>{a.bajo}</Td>
                <Td right>{fmtSoles(a.compras)}</Td>
                <Td right>{fmtSoles(a.consumo)}</Td>
                <Td right className={a.mermas ? 'text-brand-700' : ''}>{fmtSoles(a.mermas)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Section icon={Users} title="¿Cuánto consume cada área?" bodyClassName="p-5">
          {areas.length
            ? <BarList color={PALETTE.ink} items={areas.map((x) => ({ key: x.area, label: x.area, value: Number(x.valor), share: tot.consumo ? Number(x.valor) / tot.consumo : 0 }))} />
            : <EmptyState title="Sin salidas a áreas en el periodo" />}
        </Section>
        <Section icon={TrendingDown} title="Productos que más salen" bodyClassName="p-5">
          {top.length
            ? <BarList color={PALETTE.red} items={top.map((p) => ({ key: p.producto_id, label: p.producto, value: Number(p.valor), share: tot.consumo ? Number(p.valor) / tot.consumo : 0 }))} />
            : <EmptyState title="Sin salidas en el periodo" />}
        </Section>
      </div>

      <div className="mb-5">
        <Section icon={PackageX} title="Bajo el stock mínimo" bodyClassName="p-0" stats={[{ label: 'Productos', value: bajoMinimo.length }]}>
          {bajoMinimo.length ? (
            <TablaPorCategoria id="bajo-minimo" columnas={variosAlmacenes ? 4 : 3} anchos={variosAlmacenes ? [undefined, '13rem', '9rem', '7rem'] : [undefined, '9rem', '7rem']}
              head={<tr><Th>Producto</Th>{variosAlmacenes && <Th>Almacén</Th>}<Th right>Hay</Th><Th right>Mínimo</Th></tr>}
              zonas={agruparPorZona(bajoMinimo, (s) => s.zona, (s) => s.categoria).map((z) => ({
                zona: z.zona, categorias: z.categorias.map(([cat, xs]) => ({ categoria: cat, cantidad: xs.length, filas: xs.map(filaBajo) })),
              }))} />
          ) : <EmptyState title="Todo sobre el mínimo" description="Cada almacén fija el mínimo de sus productos en su ficha." />}
        </Section>
      </div>

      <Section icon={BadgeAlert} title="Ingresos con precio distinto al de la orden" bodyClassName="p-0" stats={[{ label: 'En el periodo', value: ingresos.length }]}>
        {ingresos.length ? (
          <Table>
            <thead><tr><Th>Fecha</Th><Th>Compra</Th><Th>Almacén</Th><Th>Proveedor</Th><Th>Producto</Th><Th right>Orden</Th><Th right>Boleta</Th></tr></thead>
            <tbody>{ingresos.map((i) => (
              <tr key={i.id}>
                <Td className="whitespace-nowrap tabular">{fmtDate(i.fecha_ingreso)}</Td>
                <Td><Link href={`/compras/${i.compra_id}`} className="enlace">{i.numero}</Link></Td>
                <Td className="text-xs">{i.almacen}</Td><Td className="text-sm">{i.proveedor ?? '—'}</Td><Td className="font-medium">{i.producto}</Td>
                <Td right className="text-muted">{fmtSoles(i.precio_orden)}</Td>
                <Td right className={Number(i.precio_unitario) > Number(i.precio_orden) ? 'font-semibold text-brand-700' : 'font-semibold text-leaf-600'}>{fmtSoles(i.precio_unitario)}</Td>
              </tr>
            ))}</tbody>
          </Table>
        ) : <EmptyState title="Sin diferencias de precio en el periodo" />}
      </Section>
    </>
  )
}
