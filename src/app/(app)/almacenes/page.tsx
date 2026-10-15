import Link from 'next/link'
import { PackageX, Users, TrendingDown, BadgeAlert, Warehouse } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito } from '@/lib/session'
import { getAlmacenes } from '@/lib/queries'
import { fmtDate, fmtPct, fmtQty, fmtSoles, hoyLima } from '@/lib/format'
import { sp } from '@/lib/utils'
import { PageHeader, Section, Stat, Table, Th, Td, FilterBar, FilterField, EmptyState } from '@/components/ui'
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
  const params = await searchParams
  const { local } = await getAmbito()
  const supabase = await createClient()
  const desde = sp(params, 'desde', `${hoyLima().slice(0, 7)}-01`), hasta = sp(params, 'hasta', hoyLima())
  const almacenes = [...await getAlmacenes(local?.id, ['almacen'])].sort((a, b) => a.nombre.localeCompare(b.nombre))   // 01, 02, Umaru
  const ids = almacenes.map((a) => a.id)

  const [stockR, movsR, ingresosR, traspasosR] = await Promise.all([
    supabase.from('v_stock').select('producto_id, almacen_id, nombre, unidad, cantidad, valor, stock_minimo, estado').in('almacen_id', ids).limit(20000),
    supabase.from('movimiento')
      .select('tipo, almacen_id, area:area_id(nombre), movimiento_detalle(cantidad, costo_unitario, fifo_cumplido, producto:producto_id(id, nombre))')
      .in('almacen_id', ids).eq('anulado', false)
      .in('tipo', ['salida_consumo', 'merma', 'ajuste_negativo', 'devolucion_proveedor', 'entrada_compra'])
      .gte('fecha', `${desde}T00:00:00-05:00`).lte('fecha', `${hasta}T23:59:59-05:00`).limit(20000),
    supabase.from('v_ingreso_almacen').select('id, compra_id, numero, almacen_id, almacen, fecha_ingreso, proveedor, producto, precio_orden, precio_unitario, sin_orden')
      .in('almacen_id', ids).eq('diferencia_precio', true)
      .gte('fecha_ingreso', `${desde}T00:00:00-05:00`).lte('fecha_ingreso', `${hasta}T23:59:59-05:00`).order('fecha_ingreso', { ascending: false }).limit(50),
    supabase.from('traslado').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente').or(`almacen_origen_id.in.(${ids.join(',')}),almacen_destino_id.in.(${ids.join(',')})`),
  ])

  type S = { producto_id: string; almacen_id: string; nombre: string; unidad: string; cantidad: number; valor: number; stock_minimo: number; estado: string }
  type M = { tipo: string; almacen_id: string; area: { nombre: string } | null
    movimiento_detalle: { cantidad: number; costo_unitario: number | null; fifo_cumplido: boolean | null; producto: { id: string; nombre: string } }[] }
  type I = { id: string; compra_id: string; numero: string; almacen: string; fecha_ingreso: string; proveedor: string | null; producto: string; precio_orden: number; precio_unitario: number; sin_orden: boolean }
  const stock = (stockR.data ?? []) as S[]
  const movs = (movsR.data ?? []) as unknown as M[]
  const ingresos = (ingresosR.data ?? []) as I[]

  const valorDe = (m: M) => m.movimiento_detalle.reduce((s, d) => s + Number(d.cantidad) * Number(d.costo_unitario ?? 0), 0)
  // stock mínimo: lo fija cada almacén (0 = no se controla)
  const bajoMinimo = stock.filter((s) => Number(s.stock_minimo) > 0 && Number(s.cantidad) <= Number(s.stock_minimo))
    .sort((a, b) => Number(a.cantidad) / Number(a.stock_minimo) - Number(b.cantidad) / Number(b.stock_minimo))

  const porAlmacen = almacenes.map((a) => {
    const st = stock.filter((s) => s.almacen_id === a.id)
    const mv = movs.filter((m) => m.almacen_id === a.id)
    const suma = (tipos: string[]) => mv.filter((m) => tipos.includes(m.tipo)).reduce((s, m) => s + valorDe(m), 0)
    return {
      ...a,
      productos: st.filter((s) => Number(s.cantidad) > 0).length,
      valor: st.reduce((s, x) => s + Math.max(0, Number(x.valor)), 0),
      bajo: bajoMinimo.filter((s) => s.almacen_id === a.id).length,
      compras: suma(['entrada_compra']),
      consumo: suma(['salida_consumo']),
      mermas: suma(['merma', 'ajuste_negativo']),
    }
  })
  const tot = porAlmacen.reduce((t, a) => ({ valor: t.valor + a.valor, consumo: t.consumo + a.consumo, mermas: t.mermas + a.mermas, compras: t.compras + a.compras }),
    { valor: 0, consumo: 0, mermas: 0, compras: 0 })

  // consumo por área y productos que más salen (salidas a las áreas)
  const porArea = new Map<string, number>(), porProducto = new Map<string, { nombre: string; valor: number }>()
  for (const m of movs.filter((x) => x.tipo === 'salida_consumo')) {
    const area = m.area?.nombre ?? 'Sin área'
    porArea.set(area, (porArea.get(area) ?? 0) + valorDe(m))
    for (const d of m.movimiento_detalle) {
      const p = porProducto.get(d.producto.id) ?? { nombre: d.producto.nombre, valor: 0 }
      p.valor += Number(d.cantidad) * Number(d.costo_unitario ?? 0)
      porProducto.set(d.producto.id, p)
    }
  }
  const areas = [...porArea].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const top = [...porProducto].sort((a, b) => b[1].valor - a[1].valor).slice(0, 10)
  // FIFO: de las salidas de productos con lote, cuántas tomaron el más antiguo
  const fifo = movs.flatMap((m) => m.movimiento_detalle).filter((d) => d.fifo_cumplido !== null)
  const fifoPct = fifo.length ? fifo.filter((d) => d.fifo_cumplido).length / fifo.length : null
  const nombreAlm = (id: string) => almacenes.find((a) => a.id === id)?.nombre ?? ''

  return (
    <>
      <PageHeader title="Resumen de almacenes"
        description="Lo que importa de cada almacén para supervisar: valor, stock mínimo, consumo por área y mermas. Cada movimiento en detalle está en el Kardex." />
      <FilterBar>
        <FilterField label="Desde"><input type="date" name="desde" defaultValue={desde} className="field" /></FilterField>
        <FilterField label="Hasta"><input type="date" name="hasta" defaultValue={hasta} className="field" /></FilterField>
      </FilterBar>

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Valor del inventario" value={fmtSoles(tot.valor)} hint="Hoy, al costo promedio" />
        <Stat label="Bajo el mínimo" value={bajoMinimo.length} tone={bajoMinimo.length ? 'warn' : 'default'} hint="Productos por reponer" />
        <Stat label="Consumo de áreas" value={fmtSoles(tot.consumo)} hint="Salidas del periodo" />
        <Stat label="Mermas y faltantes" value={fmtSoles(tot.mermas)} tone={tot.mermas ? 'warn' : 'default'} hint="Del periodo" />
        <Stat label="Cumplimiento FIFO" value={fmtPct(fifoPct)} meta={fifoPct === null ? undefined : { valor: fifoPct, meta: 1 }} hint={fifo.length ? `${fifo.length} salidas con lote` : 'Sin salidas con lote'} />
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
            ? <BarList color={PALETTE.ink} items={areas.map(([nombre, v]) => ({ key: nombre, label: nombre, value: v, share: tot.consumo ? v / tot.consumo : 0 }))} />
            : <EmptyState title="Sin salidas a áreas en el periodo" />}
        </Section>
        <Section icon={TrendingDown} title="Productos que más salen" bodyClassName="p-5">
          {top.length
            ? <BarList color={PALETTE.red} items={top.map(([id, p]) => ({ key: id, label: p.nombre, value: p.valor, share: tot.consumo ? p.valor / tot.consumo : 0 }))} />
            : <EmptyState title="Sin salidas en el periodo" />}
        </Section>
      </div>

      <div className="mb-5">
        <Section icon={PackageX} title="Bajo el stock mínimo" bodyClassName="p-0" stats={[{ label: 'Productos', value: bajoMinimo.length }]}>
          {bajoMinimo.length ? (
            <Table>
              <thead><tr><Th>Producto</Th><Th>Almacén</Th><Th right>Hay</Th><Th right>Mínimo</Th></tr></thead>
              <tbody>{bajoMinimo.slice(0, 15).map((s) => (
                <tr key={s.producto_id + s.almacen_id}>
                  <Td className="font-medium">{s.nombre}</Td><Td className="text-xs">{nombreAlm(s.almacen_id)}</Td>
                  <Td right className={Number(s.cantidad) <= 0 ? 'font-semibold text-brand-700' : 'font-semibold text-amber-700'}>{fmtQty(s.cantidad)} {s.unidad}</Td>
                  <Td right className="text-muted">{fmtQty(s.stock_minimo)}</Td>
                </tr>
              ))}</tbody>
            </Table>
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
                <Td><Link href={`/compras/${i.compra_id}`} className="font-semibold text-brand-600">{i.numero}</Link></Td>
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
