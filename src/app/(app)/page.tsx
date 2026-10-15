import Link from 'next/link'
import { ShoppingCart, ClipboardCheck, ClipboardList, TrendingUp, Layers, Truck, Target, BellRing, PackageX, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getPanel } from '@/lib/session'
import { PanelAlmacen } from './panel-almacen'
import { etiquetaNegocio } from '@/lib/empresa'
import { resolverPeriodo } from '@/lib/periodo'
import { fmtDate, fmtPct, fmtQty, fmtSoles, fmtSolesCompact, MESES_CORTO } from '@/lib/format'
import { PageHeader, Section, Stat, EmptyState } from '@/components/ui'
import { PeriodoSelector } from '@/components/periodo-selector'
import { Bars, BarList, Lines } from '@/components/charts'
import { COLOR_LOCAL, PALETTE } from '@/lib/palette'

export const metadata = { title: 'Panel principal' }

type Dashboard = {
  stock: { valor_total: number; productos: number; criticos: number; agotados: number }
  compras: { total: number; cantidad: number; transporte: number; ahorro: number; sobrecosto: number; ahorro_neto_pct: number | null
    pendientes: number; por_local: { local: string; codigo: string; total: number }[]; por_ciudad: { ciudad: string; total: number }[] }
  otif: { pedidos: number; on_time: number | null; in_full: number | null; otif: number | null; meta: number }
  inventario: { conteos: number; sobrante: number; faltante: number; pct_diferencia: number | null; meta: number; pendientes: number }
  requerimientos: { pendientes: number; periodo: number; pct_24h: number | null }
  fifo: { cumplimiento: number | null; salidas: number; por_vencer: number }
  descuentos: { total: number; roturas: number }
  carnes: { alertas: number }
}

/** Título de cada gráfico escrito como la pregunta que responde. */
function Pregunta({ children, detalle }: { children: React.ReactNode; detalle?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="text-sm font-semibold text-ink-900">{children}</p>
      {detalle && <p className="text-xs text-muted">{detalle}</p>}
    </div>
  )
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  // Usuarios de almacén: su propio panel
  if ((await getPanel()) === 'almacen') {
    const { local } = await getAmbito()
    if (local) return <PanelAlmacen local={local} />
  }
  const periodo = resolverPeriodo(params)
  const { local } = await getAmbito()
  const pLocal = local?.id ?? null
  const anio = Number(periodo.hasta.slice(0, 4))
  const supabase = await createClient()

  const [dash, mensual, topProv, variacion, criticos, kpiInv] = await Promise.all([
    supabase.rpc('fn_dashboard', { p_local: pLocal, p_desde: periodo.desde, p_hasta: periodo.hasta }),
    supabase.rpc('fn_compras_mensual', { p_local: pLocal, p_anio: anio }),
    supabase.rpc('fn_top_proveedores', { p_local: pLocal, p_desde: periodo.desde, p_hasta: periodo.hasta, p_limite: 5 }),
    supabase.rpc('fn_variacion_precios', { p_desde: `${anio}-01-01`, p_hasta: periodo.hasta, p_limite: 5 }),
    (() => { let q = supabase.from('v_stock').select('nombre, almacen_nombre, local_codigo, cantidad, stock_minimo, unidad, estado')
      .in('estado', ['critico', 'agotado']).gt('stock_minimo', 0).order('cantidad').limit(5)
      if (pLocal) q = q.eq('local_id', pLocal); return q })(),
    supabase.rpc('fn_kpi_inventario_mensual', { p_local: pLocal, p_anio: anio }),
  ])

  const d = (dash.data ?? {}) as Dashboard
  if (dash.error || !d.stock) {
    return (
      <>
        <PageHeader title="Panel principal" />
        <div className="card"><EmptyState title="No se pudo cargar el panel" description={dash.error?.message ?? 'Verifique la conexión con Supabase.'} /></div>
      </>
    )
  }

  // Compras y OTIF por mes (OTIF ponderado por pedidos, nunca promedio de porcentajes)
  type Row = { mes: number; local_codigo: string; total: number; otif: number | null; pedidos: number }
  const porMes = new Map<number, { mes: string; LF: number; UM: number; otifSum: number; otifN: number }>()
  for (let m = 1; m <= Number(periodo.hasta.slice(5, 7)); m++) porMes.set(m, { mes: MESES_CORTO[m - 1], LF: 0, UM: 0, otifSum: 0, otifN: 0 })
  for (const r of (mensual.data ?? []) as Row[]) {
    const e = porMes.get(r.mes); if (!e) continue
    if (r.local_codigo === 'LF') e.LF += Number(r.total); else e.UM += Number(r.total)
    if (r.otif !== null) { e.otifSum += Number(r.otif) * r.pedidos; e.otifN += r.pedidos }
  }
  const serie = [...porMes.values()].map((e) => ({ mes: e.mes, LF: Math.round(e.LF), UM: Math.round(e.UM), otif: e.otifN ? e.otifSum / e.otifN : null }))

  // Diferencia de inventario por mes (valorizada)
  type Inv = { mes: number; valor_sistema: number; diferencia_bruta: number }
  const invMes = new Map<number, { v: number; d: number }>()
  for (const r of (kpiInv.data ?? []) as Inv[]) {
    const e = invMes.get(r.mes) ?? { v: 0, d: 0 }; e.v += Number(r.valor_sistema); e.d += Number(r.diferencia_bruta); invMes.set(r.mes, e)
  }
  const serieInv = [...invMes.entries()].sort((a, b) => a[0] - b[0]).map(([m, e]) => ({ mes: MESES_CORTO[m - 1], pct: e.v ? e.d / e.v : 0 }))

  const c = d.compras
  const barrasNegocio = local
    ? [{ key: local.codigo, name: local.nombre, color: COLOR_LOCAL[local.codigo] }]
    : [{ key: 'LF', name: 'Las Flores', color: COLOR_LOCAL.LF, stack: 'a' }, { key: 'UM', name: 'Umaru', color: COLOR_LOCAL.UM, stack: 'a' }]
  const ciudades = [...c.por_ciudad].sort((a, b) => Number(b.total) - Number(a.total))
  const proveedores = (topProv.data ?? []) as { proveedor_id: string; proveedor: string; total: number; participacion: number }[]
  const subidas = ((variacion.data ?? []) as { producto_id: string; producto: string; precio_inicial: number; precio_final: number; variacion_pct: number }[])
  const stockCritico = (criticos.data ?? []) as { nombre: string; almacen_nombre: string; cantidad: number; stock_minimo: number; unidad: string }[]

  const pendientes = [
    { label: 'Requerimientos por atender', value: d.requerimientos.pendientes, href: '/requerimientos' },
    { label: 'Compras por recibir', value: c.pendientes, href: '/compras?estado=aprobada' },
    { label: 'Conteos sin cerrar', value: d.inventario.pendientes, href: '/conteos' },
    { label: 'Diferencias de viandas vs Kardex', value: d.carnes.alertas, href: '/carnes' },
  ]

  return (
    <>
      <PageHeader
        title="Panel principal"
        description={<>{local ? <b className="text-ink-900">{etiquetaNegocio(local)}</b> : <b className="text-ink-900">Ambos negocios</b>} · del {fmtDate(periodo.desde)} al {fmtDate(periodo.hasta)}</>}
        actions={<PeriodoSelector actual={periodo.key} desde={periodo.desde} hasta={periodo.hasta} />}
      />

      {/* 1 · ¿Cumplimos las metas del MOF? → un número por meta, con su estado */}
      <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase"><Target className="size-3.5" /> Metas del puesto (MOF)</h2>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="OTIF" value={fmtPct(d.otif.otif)} meta={{ valor: d.otif.otif, meta: d.otif.meta }}
              hint={`Meta ≥ ${fmtPct(d.otif.meta)} · a tiempo y completo · ${d.otif.pedidos} pedidos`} />
        <Stat label="Diferencia de inventario" value={fmtPct(d.inventario.pct_diferencia)} meta={{ valor: d.inventario.pct_diferencia, meta: d.inventario.meta, menorEsMejor: true }}
              hint={`Meta ≤ ${fmtPct(d.inventario.meta)} · ${d.inventario.conteos} conteos`} />
        <Stat label="Cumplimiento FIFO" value={fmtPct(d.fifo.cumplimiento)} meta={{ valor: d.fifo.cumplimiento, meta: 1 }}
              hint={`Meta 100% · ${d.fifo.salidas} salidas de perecibles`} />
        <Stat label="Ahorro en compras" value={fmtPct(c.ahorro_neto_pct)} meta={{ valor: c.ahorro_neto_pct, meta: 0.05 }}
              hint={<>Meta ≥ 5% · ahorro {fmtSolesCompact(c.ahorro)} · sobrecosto {fmtSolesCompact(c.sobrecosto)}</>} />
        <Stat label="Requerimientos < 24 h" value={fmtPct(d.requerimientos.pct_24h)} meta={{ valor: d.requerimientos.pct_24h, meta: 1 }}
              hint={`Meta 100% · ${d.requerimientos.periodo} en el periodo`} />
      </div>

      {/* 2 · Compras */}
      <Section icon={ShoppingCart} title="Compras" className="mb-5"
        stats={[{ label: 'Total', value: fmtSoles(c.total) }, { label: 'N° compras', value: c.cantidad }, { label: 'Transporte', value: fmtSoles(c.transporte) }]}
        bodyClassName="grid gap-8 p-5 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <Pregunta detalle={local ? `Monto comprado por mes · ${anio}` : `Monto comprado por mes y por negocio · ${anio}. Pase el cursor para ver el total.`}>
            ¿Cuánto compramos cada mes?
          </Pregunta>
          <Bars data={serie} x="mes" series={barrasNegocio} height={280} total />
        </div>
        <div className="space-y-7">
          <div>
            <Pregunta detalle="Participación de cada origen en el monto del periodo">¿Dónde compramos?</Pregunta>
            {ciudades.length
              ? <BarList color={PALETTE.ink} items={ciudades.map((x) => ({ key: x.ciudad, label: x.ciudad, value: Number(x.total), share: c.total ? Number(x.total) / c.total : 0 }))} />
              : <p className="text-sm text-muted">Sin compras en el periodo</p>}
          </div>
          <div>
            <Pregunta detalle="Los 5 proveedores con mayor monto">¿A quién le compramos más?</Pregunta>
            {proveedores.length
              ? <BarList color={PALETTE.ink} items={proveedores.map((p) => ({ key: p.proveedor_id, value: Number(p.total), share: Number(p.participacion),
                  label: <Link href={`/proveedores/${p.proveedor_id}`} className="hover:text-brand-600">{p.proveedor}</Link> }))} />
              : <p className="text-sm text-muted">Sin datos</p>}
          </div>
        </div>
      </Section>

      {/* 3 · Tendencia de las metas */}
      <Section icon={TrendingUp} title="¿Estamos mejorando mes a mes?" className="mb-5" bodyClassName="grid gap-8 p-5 lg:grid-cols-2">
        <div>
          <Pregunta detalle={`Pedidos entregados a tiempo y completos · ${anio}. Por encima de la línea se cumple la meta.`}>
            <Truck className="mr-1.5 inline size-4 text-muted" />¿Los proveedores entregan a tiempo y completo?
          </Pregunta>
          <Lines data={serie} x="mes" series={[{ key: 'otif', name: 'OTIF', color: PALETTE.ink }]} format="pct" meta={d.otif.meta} domain={[0, 1]} height={250} />
        </div>
        <div>
          <Pregunta detalle={`Diferencia valorizada entre sistema y conteo físico · ${anio}. Por debajo de la línea se cumple la meta.`}>
            <ClipboardCheck className="mr-1.5 inline size-4 text-muted" />¿El inventario físico cuadra con el sistema?
          </Pregunta>
          {serieInv.length
            ? <Bars data={serieInv} x="mes" series={[{ key: 'pct', name: 'Diferencia' }]} format="pct" estado={{ meta: d.inventario.meta, menorEsMejor: true }} height={226} />
            : <EmptyState title="Sin conteos cerrados en el año" />}
        </div>
      </Section>

      {/* 4 · Qué requiere acción */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Section icon={BellRing} title="Pendientes de atención" bodyClassName="p-3">
          <ul className="space-y-1">
            {pendientes.map((x) => (
              <li key={x.label}>
                <Link href={x.href} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-canvas">
                  <span>{x.label}</span>
                  <span className="flex items-center gap-1.5">
                    <span className={x.value ? 'rounded-md bg-brand-50 px-2 py-0.5 font-bold text-brand-700 tabular' : 'px-2 font-semibold text-subtle tabular'}>{x.value}</span>
                    <ChevronRight className="size-4 text-subtle" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section icon={PackageX} title="Stock por debajo del mínimo" bodyClassName="p-3"
                 actions={<Link href="/inventario?estado=critico" className="text-xs font-semibold text-brand-600">Ver todo ({d.stock.criticos})</Link>}>
          {stockCritico.length ? (
            <ul className="divide-y divide-line text-sm">
              {stockCritico.map((s, i) => (
                <li key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0"><span className="block truncate font-medium">{s.nombre}</span><span className="text-xs text-muted">{s.almacen_nombre}</span></span>
                  <span className="shrink-0 text-right text-xs"><span className="block font-bold text-brand-700 tabular">{fmtQty(s.cantidad)} {s.unidad}</span>
                    <span className="text-muted">mínimo {fmtQty(s.stock_minimo)}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="py-8 text-center text-sm text-muted">Todo el stock está sobre el mínimo</p>}
        </Section>

        <Section icon={Layers} title="Precios que más cambiaron" bodyClassName="p-3"
                 actions={<Link href="/precios" className="text-xs font-semibold text-brand-600">Trazabilidad</Link>}>
          {subidas.length ? (
            <ul className="divide-y divide-line text-sm">
              {subidas.map((r) => (
                <li key={r.producto_id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <Link href={`/precios?producto=${r.producto_id}`} className="block truncate font-medium hover:text-brand-600">{r.producto}</Link>
                    <span className="text-xs text-muted tabular">{fmtSoles(r.precio_inicial)} → {fmtSoles(r.precio_final)}</span>
                  </span>
                  <span className={r.variacion_pct > 0 ? 'shrink-0 text-xs font-bold text-brand-700 tabular' : 'shrink-0 text-xs font-bold text-leaf-600 tabular'}>
                    {r.variacion_pct > 0 ? '▲ subió' : '▼ bajó'} {fmtPct(Math.abs(r.variacion_pct))}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="py-8 text-center text-sm text-muted">Sin cambios de precio</p>}
        </Section>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted"><ClipboardList className="size-3.5" />
        Descuentos del periodo: {fmtSoles(d.descuentos.total)} (roturas {fmtSoles(d.descuentos.roturas)}) · detalle en <Link href="/descuentos" className="font-semibold text-brand-600">Descuentos</Link> y <Link href="/reportes" className="font-semibold text-brand-600">Reportes</Link>.
      </p>
    </>
  )
}
