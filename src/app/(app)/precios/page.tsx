import Link from 'next/link'
import { TrendingUp, ListOrdered, CalendarDays } from 'lucide-react'
import { getAmbito, getLocales } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtPct, fmtSoles, MESES } from '@/lib/format'
import { sp } from '@/lib/utils'
import { paginar } from '@/lib/paginacion'
import { PageHeader, Section, Table, Th, Td, FilterBar, FilterField, Pagination, EmptyState, Badge, Stat, LocalBadge, Note } from '@/components/ui'
import { ProductPicker, type ProductoLite } from '@/components/product-picker'
import { Lines, Bars } from '@/components/charts'
import { ExportButton } from '@/components/export-button'
import { PagedTable } from '@/components/pager'
import { Select } from '@/components/select'

export const metadata = { title: 'Trazabilidad de precios' }

export default async function PreciosPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const [supabase, { local }, locales] = await Promise.all([createClient(), getAmbito(), getLocales()])
  const producto = sp(params, 'producto'), q = sp(params, 'q'), orden = sp(params, 'orden', 'variacion')
  const { page, size, from, to } = paginar(params)
  const umbralQ = supabase.from('parametro').select('valor').eq('clave', 'umbral_alerta_precio').maybeSingle()

  if (producto) {
    // el producto y su grupo de precios (código maestro + unidad: las compras de Las Flores y Umaru juntas)
    const { data: grupo } = await supabase.from('producto').select('maestro_id, unidad_id').eq('id', producto).maybeSingle()
    const gm = grupo?.maestro_id ?? producto, gu = grupo?.unidad_id ?? ''
    // todo al mismo tiempo: producto, historial, estadística, umbral y el precio por mes (calculado en la base)
    const [{ data: prod }, { data: hist }, { data: est }, { data: umbralRow }, { data: porMes }] = await Promise.all([
      supabase.from('producto').select('id, codigo, nombre, tipo, costo_referencia, unidad:unidad_id(codigo)').eq('id', producto).maybeSingle(),
      supabase.from('v_trazabilidad_precios').select('id, fecha, precio, precio_anterior, variacion, variacion_pct, proveedor, proveedor_anterior, local_id, compra_id, compra_numero').eq('maestro_id', gm).eq('unidad_id', gu).order('fecha'),
      supabase.from('v_precio_estadistica').select('*').eq('maestro_id', gm).eq('unidad_id', gu).maybeSingle(),
      umbralQ,
      supabase.rpc('fn_precio_mensual', { p_producto: producto, p_local: local?.id ?? null }),
    ])
    const umbral = Number(umbralRow?.valor ?? 0.1)
    const cod = new Map(locales.map((l) => [l.id, l.codigo]))
    // Tendencia por mes (del negocio elegido arriba, o de los dos con «Global»)
    type Mes = { anio: number; mes: number; promedio: number; minimo: number; maximo: number; compras: number; proveedor_mas_barato: string | null }
    const meses = ((porMes ?? []) as Mes[]).map((m) => ({ ...m, promedio: Number(m.promedio), minimo: Number(m.minimo), maximo: Number(m.maximo) }))
    const anios = [...new Set(meses.map((m) => m.anio))].sort((a, b) => b - a)
    const anio = Number(sp(params, 'anio', String(anios[0] ?? new Date().getFullYear())))
    const delAnio = meses.filter((m) => m.anio === anio)
    const masBarato = delAnio.length ? delAnio.reduce((a, b) => (b.promedio < a.promedio ? b : a)) : null
    const masCaro = delAnio.length ? delAnio.reduce((a, b) => (b.promedio > a.promedio ? b : a)) : null
    const anterior = new Map(meses.filter((m) => m.anio === anio - 1).map((m) => [m.mes, m.promedio]))
    const barras = Array.from({ length: 12 }, (_, i) => ({ mes: MESES[i].slice(0, 3), precio: delAnio.find((m) => m.mes === i + 1)?.promedio ?? null }))
    type H = { id: string; fecha: string; precio: number; precio_anterior: number | null; variacion: number | null; variacion_pct: number | null; proveedor: string | null; proveedor_anterior: string | null; local_id: string | null; compra_id: string | null; compra_numero: string | null }
    const rows = (hist ?? []) as H[]
    const p = prod as unknown as (ProductoLite & { unidad: { codigo: string } }) | null
    const picker = p ? { ...p, unidad: p.unidad.codigo } : null
    const serie = rows.map((r) => ({ fecha: fmtDate(r.fecha).slice(0, 5), precio: Number(r.precio) }))
    return (
      <>
        <PageHeader title={p?.nombre ?? 'Producto'} back={{ href: '/precios', label: 'Trazabilidad de precios' }} description={`Evolución del precio de compra por ${p?.unidad.codigo ?? 'unidad'}`} />
        <FilterBar><FilterField label="Cambiar producto" className="min-w-80"><ProductPicker name="producto" defaultValue={picker} /></FilterField></FilterBar>
        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label="Precio actual" value={fmtSoles(est?.precio_actual)} hint={`Última compra ${fmtDate(est?.ultima_compra)}`} />
          <Stat label="Mínimo" value={fmtSoles(est?.precio_min)} tone="good" />
          <Stat label="Máximo" value={fmtSoles(est?.precio_max)} tone="bad" />
          <Stat label="Promedio" value={fmtSoles(est?.precio_promedio)} hint={`${est?.compras ?? 0} compras`} />
          <Stat label="Variación total" value={fmtPct(est?.variacion_pct)} tone={Number(est?.variacion_pct) > umbral ? 'bad' : 'default'} hint={`Desde ${fmtSoles(est?.precio_inicial)}`} />
        </div>
        <Section icon={CalendarDays} title={`¿En qué mes conviene comprar? · ${anio}${local ? ` · ${local.nombre}` : ''}`} className="mb-5"
          stats={masBarato && masCaro && delAnio.length > 1 ? [{ label: 'Más barato', value: `${MESES[masBarato.mes - 1]} (${fmtSoles(masBarato.promedio)})` },
            { label: 'Más caro', value: `${MESES[masCaro.mes - 1]} (${fmtSoles(masCaro.promedio)})` }] : []}
          actions={anios.length > 1 ? <span className="flex gap-2 text-xs font-semibold">{anios.map((a) => (
            <Link key={a} href={`?producto=${producto}&anio=${a}`} className={a === anio ? 'text-ink-900' : 'text-brand-600'}>{a}</Link>))}</span> : undefined}>
          {delAnio.length ? (
            <>
              <Bars data={barras} x="mes" series={[{ key: 'precio', name: 'Precio promedio' }]} height={220} />
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <thead><tr><Th>Mes</Th><Th right>Promedio</Th><Th right>Mínimo</Th><Th right>Máximo</Th><Th right>Compras</Th><Th>Más barato con</Th>{anterior.size > 0 && <Th right>{anio - 1}</Th>}</tr></thead>
                  <tbody>{delAnio.map((m) => (
                    <tr key={m.mes} className={m === masBarato && delAnio.length > 1 ? 'bg-leaf-50' : ''}>
                      <Td className="font-medium">{MESES[m.mes - 1]}{m === masBarato && delAnio.length > 1 && <Badge tone="green" className="ml-2">Más barato</Badge>}</Td>
                      <Td right className="font-semibold">{fmtSoles(m.promedio)}</Td><Td right>{fmtSoles(m.minimo)}</Td><Td right>{fmtSoles(m.maximo)}</Td>
                      <Td right>{m.compras}</Td><Td className="text-xs">{m.proveedor_mas_barato ?? '—'}</Td>
                      {anterior.size > 0 && <Td right className="text-muted">{fmtSoles(anterior.get(m.mes) ?? null)}</Td>}
                    </tr>
                  ))}</tbody>
                </Table>
              </div>
            </>
          ) : <EmptyState title="Aún no hay compras de este producto" description="El precio de cada mes sale de las boletas que registra el almacén." />}
        </Section>
        <Section icon={TrendingUp} title="Línea evolutiva del precio" className="mb-5">
          {serie.length ? <Lines data={serie} x="fecha" series={[{ key: 'precio', name: 'Precio' }]} height={260} area /> : <EmptyState title="Sin compras registradas" />}
        </Section>
        <Section title="Historial de compras" bodyClassName="p-0">
          <PagedTable head={<tr><Th>Fecha</Th><Th>Negocio</Th><Th>Compra</Th><Th>Proveedor</Th><Th>Proveedor anterior</Th><Th right>Precio anterior</Th><Th right>Precio</Th><Th right>Variación S/</Th><Th right>Variación %</Th></tr>}>
              {[...rows].reverse().map((r) => (
                <tr key={r.id} className={Number(r.variacion_pct) > umbral ? 'bg-brand-50/40' : ''}>
                  <Td className="tabular">{fmtDate(r.fecha)}</Td><Td><LocalBadge codigo={r.local_id ? cod.get(r.local_id) : null} /></Td>
                  <Td>{r.compra_id ? <Link href={`/compras/${r.compra_id}`} className="font-semibold text-brand-600">{r.compra_numero}</Link> : <span className="text-xs text-muted">Histórico</span>}</Td>
                  <Td>{r.proveedor ?? '—'}</Td><Td className={r.proveedor_anterior && r.proveedor_anterior !== r.proveedor ? 'text-amber-700' : 'text-muted'}>{r.proveedor_anterior ?? '—'}</Td>
                  <Td right className="text-muted">{fmtSoles(r.precio_anterior)}</Td><Td right className="font-semibold">{fmtSoles(r.precio)}</Td>
                  <Td right>{r.variacion === null ? '—' : fmtSoles(r.variacion)}</Td>
                  <Td right>{r.variacion_pct === null ? '—' : <Badge tone={r.variacion_pct > umbral ? 'red' : r.variacion_pct > 0 ? 'amber' : 'green'}>{fmtPct(r.variacion_pct)}</Badge>}</Td>
                </tr>
              ))}
            </PagedTable>
        </Section>
      </>
    )
  }

  let query = supabase.from('v_precio_estadistica').select('*', { count: 'exact' })
  if (q) query = query.ilike('producto', `%${q}%`)
  query = orden === 'variacion' ? query.order('variacion_pct', { ascending: false, nullsFirst: false })
        : orden === 'reciente' ? query.order('ultima_compra', { ascending: false }) : query.order('producto')
  const [{ data, count }, { data: umbralRow }] = await Promise.all([query.range(from, to), umbralQ])
  const umbral = Number(umbralRow?.valor ?? 0.1)
  type E = { producto_id: string; codigo: string; producto: string; unidad: string; categoria: string | null; compras: number; precio_min: number; precio_max: number
    precio_promedio: number; precio_actual: number; precio_inicial: number; ultima_compra: string; variacion_pct: number | null }

  return (
    <>
      <PageHeader title="Trazabilidad y lista de precios"
        description="Precio vigente de cada producto del almacén según su última compra, con mínimo, máximo, promedio y variación. Se alimenta sola cuando llega cada compra (los bienes fuera de catálogo no entran aquí)."
        actions={<ExportButton filename="lista_precios" table="v_precio_estadistica" order="producto"
          columns={{ codigo: 'Código', producto: 'Producto', categoria: 'Categoría', unidad: 'Unidad', precio_actual: 'Precio vigente', precio_min: 'Mínimo', precio_max: 'Máximo', precio_promedio: 'Promedio', variacion_pct: 'Variación %', compras: 'N° compras', ultima_compra: 'Última compra' }} />} />
      <div className="mb-4"><Note>Se resaltan en rojo los productos cuyo precio subió más del <b>{fmtPct(umbral)}</b> (umbral configurable en Configuración). Haga clic en un producto para ver su línea evolutiva.</Note></div>
      <FilterBar>
        <FilterField label="Buscar producto" className="min-w-64"><input name="q" defaultValue={q} className="field" /></FilterField>
        <FilterField label="Ordenar por"><Select name="orden" defaultValue={orden} required options={[{ id: 'variacion', nombre: 'Mayor variación' }, { id: 'reciente', nombre: 'Compra más reciente' }, { id: 'nombre', nombre: 'Nombre' }]} /></FilterField>
      </FilterBar>
      <Section icon={ListOrdered} title="Lista general de precios" bodyClassName="p-0" stats={[{ label: 'Productos', value: count ?? 0 }]}>
        {data?.length ? (
          <>
            <Table>
              <thead><tr><Th>Producto</Th><Th right>Vigente</Th><Th right>Mín.</Th><Th right>Máx.</Th><Th right>Promedio</Th><Th right>Variación</Th><Th right>Compras</Th><Th>Última</Th></tr></thead>
              <tbody>{(data as E[]).map((e) => (
                <tr key={e.producto_id} className="hover:bg-canvas/60">
                  <Td><Link href={`?producto=${e.producto_id}`} className="font-medium hover:text-brand-600">{e.producto}</Link><span className="block text-xs text-muted">{e.codigo} · {e.categoria ?? 'Sin categoría'}</span></Td>
                  <Td right className="font-semibold">{fmtSoles(e.precio_actual)}<span className="text-xs font-normal text-muted"> /{e.unidad}</span></Td>
                  <Td right className="text-muted">{fmtSoles(e.precio_min)}</Td><Td right className="text-muted">{fmtSoles(e.precio_max)}</Td><Td right>{fmtSoles(e.precio_promedio)}</Td>
                  <Td right>{e.variacion_pct === null ? '—' : <Badge tone={e.variacion_pct > umbral ? 'red' : e.variacion_pct > 0 ? 'amber' : 'green'}>{e.variacion_pct > 0 ? '▲' : '▼'} {fmtPct(Math.abs(e.variacion_pct))}</Badge>}</Td>
                  <Td right>{e.compras}</Td><Td className="text-xs tabular">{fmtDate(e.ultima_compra)}</Td>
                </tr>
              ))}</tbody>
            </Table>
            <Pagination total={count ?? 0} />
          </>
        ) : <EmptyState title="Aún no hay precios" description="Los precios se registran al recibir compras." />}
      </Section>
    </>
  )
}
