import Link from 'next/link'
import { PackagePlus, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getPanel, getAlmacenActivo, soloConsulta } from '@/lib/session'
import { getAlmacenes } from '@/lib/queries'
import { Select } from '@/components/select'
import { fmtDate, fmtPct, fmtQty, fmtSoles, hoyLima, inicioMes, MESES_CORTO } from '@/lib/format'
import { sp } from '@/lib/utils'
import { COLOR_LOCAL } from '@/lib/palette'
import { PageHeader, Section, Th, Td, FilterBar, FilterField, EmptyState, Stat, LocalBadge, Badge, LinkButton, Note } from '@/components/ui'
import { Bars } from '@/components/charts'
import { ExportButton } from '@/components/export-button'
import { PagedTable } from '@/components/pager'

export const metadata = { title: 'Ingresos de almacén' }

const ALERTAS = [
  { id: '', nombre: 'Todos' },
  { id: 'alertas', nombre: 'Solo con alertas' },
  { id: 'diferencia', nombre: 'Precio distinto a la orden' },
  { id: 'sube', nombre: 'Precio subió' },
  { id: 'sin_orden', nombre: 'Sin orden de compra' },
  { id: 'cuadre', nombre: 'Comprobante no cuadra' },
]

type Row = {
  id: string; compra_id: string; numero: string; sin_orden: boolean; local_codigo: string; almacen: string; fecha_ingreso: string
  proveedor: string | null; tipo_documento: string | null; numero_documento: string | null; total_documento: number | null
  producto: string; producto_codigo: string | null; codigo_almacen: number | null; marca: string | null; presentacion: string | null; unidad: string; fuera_de_catalogo: boolean
  cantidad: number; precio_unitario: number; precio_orden: number | null; total: number; diferencia_precio: boolean
  variacion_pct: number | null; recibido_por: string | null
}

/**
 * Ingresos de almacén: el Excel "ALMACEN F1 Y H2" dentro del sistema. Lo registra cada almacén al recibir
 * (con la boleta); Logística lo supervisa: precio unitario, total, proveedor, comprobante y alertas.
 */
export default async function IngresosPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const [{ local }, panel, sel, supabase] = await Promise.all([getAmbito(), getPanel(), getAlmacenActivo(), createClient()])
  const almacen = panel === 'almacen'
  const desde = sp(params, 'desde', inicioMes()), hasta = sp(params, 'hasta', hoyLima()), alerta = sp(params, 'alerta')
  const almacenId = sp(params, 'almacen') || sel.id || ''
  const anio = hoyLima().slice(0, 4)


  let q = supabase.from('v_ingreso_almacen')
    .select('id, compra_id, numero, sin_orden, local_codigo, almacen, fecha_ingreso, proveedor, tipo_documento, numero_documento, total_documento, producto, producto_codigo, codigo_almacen, marca, presentacion, unidad, fuera_de_catalogo, cantidad, precio_unitario, precio_orden, total, diferencia_precio, variacion_pct, recibido_por')
    .gte('fecha_ingreso', desde).lte('fecha_ingreso', `${hasta}T23:59:59`).eq('fuera_de_catalogo', false)   // los bienes fuera de catálogo van al área, no al almacén
  let qAnio = supabase.from('v_ingreso_almacen').select('fecha_ingreso, local_codigo, total').gte('fecha_ingreso', `${anio}-01-01`).eq('fuera_de_catalogo', false)
  if (local) { q = q.eq('local_id', local.id); qAnio = qAnio.eq('local_id', local.id) }
  if (almacenId) { q = q.eq('almacen_id', almacenId); qAnio = qAnio.eq('almacen_id', almacenId) }
  // ingresos, totales del año, umbral de alerta y almacenes: al mismo tiempo
  const [{ data }, { data: delAnio }, { data: umbralRow }, almacenes] = await Promise.all([
    q.order('fecha_ingreso', { ascending: false }).limit(3000),
    qAnio.limit(20000),
    supabase.from('parametro').select('valor').eq('clave', 'umbral_alerta_precio').maybeSingle(),
    getAlmacenes(local?.id, ['almacen']),
  ])
  const umbral = Number(umbralRow?.valor ?? 0.1)
  const todas = (data ?? []) as Row[]

  // ¿El total del comprobante cuadra con la suma de sus productos?
  const sumaPorDoc = new Map<string, { suma: number; doc: number | null }>()
  for (const r of todas) {
    const s = sumaPorDoc.get(r.compra_id) ?? { suma: 0, doc: r.total_documento }
    s.suma += Number(r.total); sumaPorDoc.set(r.compra_id, s)
  }
  const noCuadra = new Set([...sumaPorDoc].filter(([, s]) => s.doc != null && Math.abs(Number(s.doc) - s.suma) > 0.05).map(([id]) => id))
  const sube = (r: Row) => r.variacion_pct != null && Number(r.variacion_pct) > umbral
  const conAlerta = (r: Row) => r.diferencia_precio || sube(r) || noCuadra.has(r.compra_id) || Number(r.precio_unitario) === 0
  const filas = todas.filter((r) =>
    !alerta ? true
      : alerta === 'alertas' ? conAlerta(r)
      : alerta === 'diferencia' ? r.diferencia_precio
      : alerta === 'sube' ? sube(r)
      : alerta === 'sin_orden' ? r.sin_orden
      : alerta === 'cuadre' ? noCuadra.has(r.compra_id) : true)

  const total = todas.reduce((s, r) => s + Number(r.total), 0)
  const docs = new Set(todas.map((r) => r.compra_id)).size
  const docsSinOrden = new Set(todas.filter((r) => r.sin_orden).map((r) => r.compra_id)).size
  const nDif = todas.filter((r) => r.diferencia_precio).length
  const nSube = todas.filter(sube).length

  // Ingresos por mes y negocio en el año (lo que era la hoja ANUAL)
  const porMes = new Map<number, Record<string, number>>()
  for (const r of (delAnio ?? []) as { fecha_ingreso: string; local_codigo: string; total: number }[]) {
    const m = Number(r.fecha_ingreso.slice(5, 7)); const o = porMes.get(m) ?? {}
    o[r.local_codigo] = (o[r.local_codigo] ?? 0) + Number(r.total); porMes.set(m, o)
  }
  const codigos = local ? [local.codigo] : ['LF', 'UM']
  const nombre = (c: string) => (c === 'LF' ? 'Las Flores' : 'Umaru')
  const serieAnio = Array.from({ length: Number(hoyLima().slice(5, 7)) }, (_, i) => ({
    mes: MESES_CORTO[i], ...Object.fromEntries(codigos.map((c) => [c, Math.round((porMes.get(i + 1)?.[c] ?? 0) * 100) / 100])),
  }))

  return (
    <>
      <PageHeader title={almacen ? 'Ingresos del almacén' : 'Ingresos de almacén'}
        description={almacen
          ? 'Todo lo que entró a su almacén con su precio y comprobante: compras recibidas e ingresos directos.'
          : 'Lo que registra cada almacén al recibir, con la boleta: precio unitario, total, proveedor y comprobante. Aquí se supervisa que cuadre.'}
        actions={<>
          <ExportButton filename="ingresos_almacen" table="v_ingreso_almacen" order="fecha_ingreso" dateColumn="fecha_ingreso" desde={desde} hasta={hasta}
            filters={{ local_id: local?.id, almacen_id: almacenId || undefined, fuera_de_catalogo: 'false' }}
            columns={{ fecha_ingreso: 'Fecha', local_codigo: 'Negocio', almacen: 'Almacén', numero: 'N° ingreso / compra', proveedor: 'Proveedor', tipo_documento: 'Comprobante', numero_documento: 'N° comprobante',
              producto: 'Producto', marca: 'Marca', presentacion: 'Presentación', unidad: 'Unidad', cantidad: 'Cantidad', precio_unitario: 'Precio unidad', total: 'Total', precio_orden: 'Precio en la orden', recibido_por: 'Registró' }} />
          {almacen && !soloConsulta(sel) && <LinkButton href="/entradas/nueva?tipo=compra"><Plus className="size-4" /> Registrar ingreso</LinkButton>}
        </>} />

      {!almacen && <div className="mb-4"><Note>Los ingresos los registra el responsable de cada almacén. Se marcan: <b>precio distinto</b> al de la orden de compra, <b>precio que subió</b> más del {fmtPct(umbral)} frente a la compra anterior, ingresos <b>sin orden de compra</b> y comprobantes cuyo total <b>no cuadra</b> con la suma.</Note></div>}

      <FilterBar>
        <FilterField label="Desde"><input type="date" name="desde" defaultValue={desde} className="field" /></FilterField>
        <FilterField label="Hasta"><input type="date" name="hasta" defaultValue={hasta} className="field" /></FilterField>
        {!sel.lista.length && <FilterField label="Almacén"><Select name="almacen" options={almacenes} defaultValue={almacenId} placeholder="Todos" /></FilterField>}
        <FilterField label="Mostrar"><Select name="alerta" options={ALERTAS} defaultValue={alerta} required /></FilterField>
      </FilterBar>

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total ingresado" value={fmtSoles(total)} hint={`${docs} ${docs === 1 ? 'comprobante' : 'comprobantes'} · ${todas.length} productos`} />
        <Stat label="Precio distinto a la orden" value={nDif} tone={nDif ? 'warn' : 'default'} hint="La boleta trajo otro precio" />
        <Stat label="Precio subió" value={nSube} tone={nSube ? 'bad' : 'default'} hint={`Más del ${fmtPct(umbral)} vs. compra anterior`} />
        <Stat label="Sin orden de compra" value={docsSinOrden} hint={noCuadra.size ? `${noCuadra.size} comprobante(s) no cuadran` : 'Ingresos directos del almacén'} tone={noCuadra.size ? 'warn' : 'default'} />
      </div>

      <Section title={`Ingresos por mes · ${anio}`} className="mb-5">
        <Bars data={serieAnio} x="mes" height={220} series={codigos.map((c) => ({ key: c, name: nombre(c), color: COLOR_LOCAL[c] }))} />
      </Section>

      <Section icon={PackagePlus} title="Detalle de ingresos" bodyClassName="p-0" stats={[{ label: 'Mostrando', value: filas.length }]}>
        {filas.length ? (
          <PagedTable head={<tr><Th>Fecha</Th><Th>Almacén</Th><Th>Comprobante</Th><Th>Proveedor</Th><Th>Producto</Th><Th right>Cantidad</Th><Th right>Precio unid.</Th><Th right>Total</Th><Th>Alertas</Th></tr>}>
            {filas.map((r) => (
              <tr key={r.id} className={conAlerta(r) ? 'bg-amber-50/40' : ''}>
                <Td className="text-xs tabular whitespace-nowrap">{fmtDate(r.fecha_ingreso)}</Td>
                <Td><LocalBadge codigo={r.local_codigo} /><span className="block text-xs text-muted">{r.almacen}</span></Td>
                <Td className="text-xs"><Link href={`/compras/${r.compra_id}`} className="font-semibold text-brand-600">{r.numero}</Link>
                  <span className="block text-muted capitalize">{r.tipo_documento ?? '—'} {r.numero_documento ?? ''}</span></Td>
                <Td className="text-xs">{r.proveedor ?? '—'}{r.recibido_por && <span className="block text-muted">Registró {r.recibido_por}</span>}</Td>
                <Td><span className="font-medium">{r.producto}</span>
                  <span className="block text-xs text-muted">{[r.marca, r.presentacion].filter(Boolean).join(' · ') || (r.fuera_de_catalogo ? 'Fuera de catálogo' : almacen ? `Cód. ${r.codigo_almacen ?? '—'}` : r.producto_codigo)}</span></Td>
                <Td right className="tabular whitespace-nowrap">{fmtQty(r.cantidad)} {r.unidad}</Td>
                <Td right className="tabular">{fmtSoles(r.precio_unitario)}{r.diferencia_precio && <span className="block text-[11px] text-muted">orden {fmtSoles(r.precio_orden)}</span>}</Td>
                <Td right className="font-semibold tabular">{fmtSoles(r.total)}</Td>
                <Td><span className="flex flex-wrap gap-1">
                  {r.diferencia_precio && <Badge tone="amber">Precio ≠ orden</Badge>}
                  {sube(r) && <Badge tone="red">Subió {fmtPct(r.variacion_pct)}</Badge>}
                  {Number(r.precio_unitario) === 0 && <Badge tone="red">Sin precio</Badge>}
                  {noCuadra.has(r.compra_id) && <Badge tone="amber">No cuadra</Badge>}
                  {r.sin_orden && <Badge tone="gray">Sin orden</Badge>}
                </span></Td>
              </tr>
            ))}
          </PagedTable>
        ) : <EmptyState title="Sin ingresos en el periodo" description={almacen ? 'Registre las compras que reciba con su boleta.' : 'Los almacenes aún no registran ingresos en estas fechas.'}
              action={almacen && !soloConsulta(sel) ? <LinkButton href="/entradas/nueva?tipo=compra">Registrar ingreso</LinkButton> : undefined} />}
      </Section>
    </>
  )
}
