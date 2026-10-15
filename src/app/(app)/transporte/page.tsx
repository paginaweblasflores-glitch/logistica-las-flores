import Link from 'next/link'
import { Route } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito } from '@/lib/session'
import { fmtDate, fmtPct, fmtSoles, hoyLima, MESES_CORTO } from '@/lib/format'
import { sp } from '@/lib/utils'
import { PageHeader, Section, Th, Td, FilterBar, FilterField, EmptyState, Stat, LocalBadge, Note } from '@/components/ui'
import { Bars } from '@/components/charts'
import { PagedTable } from '@/components/pager'

export const metadata = { title: 'Transporte' }

export default async function TransportePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const { local } = await getAmbito()
  const supabase = await createClient()
  const desde = sp(params, 'desde', `${hoyLima().slice(0, 4)}-01-01`), hasta = sp(params, 'hasta', hoyLima())

  let q = supabase.from('transporte')
    .select('id, fecha, costo, peso_kg, bultos, documento, destino, transportista, local:local_id(codigo), proveedor:transportista_id(razon_social), ciudad:ciudad_origen_id(nombre), compra:compra_id(id, numero)')
    .gte('fecha', desde).lte('fecha', hasta)
  if (local) q = q.eq('local_id', local.id)
  const { data } = await q.order('fecha', { ascending: false }).order('created_at').limit(1000)
  type T = { id: string; fecha: string; costo: number; peso_kg: number | null; bultos: number | null; documento: string | null; destino: string | null; transportista: string | null
    local: { codigo: string } | null; proveedor: { razon_social: string } | null; ciudad: { nombre: string } | null; compra: { id: string; numero: string } | null }
  const rows = (data ?? []) as unknown as T[]
  const total = rows.reduce((s, r) => s + Number(r.costo), 0)
  // un flete puede tener varios tramos (agencia + taxi): se cuentan las compras que tuvieron flete
  const conFlete = new Set(rows.filter((r) => r.compra).map((r) => r.compra!.id)).size

  // Costo de compras del periodo para medir el peso del flete
  const { data: resumen } = await supabase.rpc('fn_compras_resumen', { p_local: local?.id ?? null, p_desde: desde, p_hasta: hasta })
  const compras = Number((resumen as { total?: number } | null)?.total ?? 0)
  const nCompras = Number((resumen as { cantidad?: number } | null)?.cantidad ?? 0)

  const porMes = new Map<number, number>()
  const porTransp = new Map<string, number>()
  for (const r of rows) {
    const m = Number(r.fecha.slice(5, 7)); porMes.set(m, (porMes.get(m) ?? 0) + Number(r.costo))
    const k = r.proveedor?.razon_social ?? r.transportista ?? 'Sin transportista'; porTransp.set(k, (porTransp.get(k) ?? 0) + Number(r.costo))
  }
  const serieMes = [...porMes.entries()].sort((a, b) => a[0] - b[0]).map(([m, v]) => ({ mes: MESES_CORTO[m - 1], costo: Math.round(v) }))
  const serieTr = [...porTransp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ transportista: k, costo: Math.round(v) }))

  return (
    <>
      <PageHeader title="Transporte" description="Reporte del costo de los fletes: por mes, por transportista y cuánto representan sobre lo comprado. Se suma al costo real de cada compra." />
      <div className="mb-4"><Note>Los fletes se registran en <b>cada compra</b> (sección «Transporte (opcional)»), por tramos: por ejemplo Shalom de Lima a la agencia y luego el taxi al local. Aquí solo se consultan.</Note></div>
      <FilterBar>
        <FilterField label="Desde"><input type="date" name="desde" defaultValue={desde} className="field" /></FilterField>
        <FilterField label="Hasta"><input type="date" name="hasta" defaultValue={hasta} className="field" /></FilterField>
      </FilterBar>
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Costo de transporte" value={fmtSoles(total)} hint={`${rows.length} ${rows.length === 1 ? 'tramo' : 'tramos'}`} />
        <Stat label="% sobre compras" value={fmtPct(compras ? total / compras : null)} hint={`Compras ${fmtSoles(compras)}`} />
        <Stat label="Compras con flete" value={conFlete} hint={nCompras ? `${fmtPct(conFlete / nCompras)} de ${nCompras} compras` : undefined} />
        <Stat label="Flete promedio por compra" value={fmtSoles(conFlete ? total / conFlete : null)} hint="Sumando todos sus tramos" />
      </div>
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Section title="Costo por mes"><Bars data={serieMes} x="mes" series={[{ key: 'costo', name: 'Transporte' }]} height={220} /></Section>
        <Section title="Costo por transportista"><Bars data={serieTr} x="transportista" horizontal series={[{ key: 'costo', name: 'Transporte', color: '#1F2228' }]} height={220} /></Section>
      </div>
      <Section icon={Route} title="Fletes registrados" bodyClassName="p-0" stats={[{ label: 'Total', value: fmtSoles(total) }]}>
        {rows.length ? (
          <PagedTable head={<tr><Th>Fecha</Th><Th>Negocio</Th><Th>Compra</Th><Th>Transportista</Th><Th>Desde → hasta</Th><Th>Guía / boleta</Th><Th right>Costo</Th></tr>}>{rows.map((r) => (
              <tr key={r.id}><Td className="tabular">{fmtDate(r.fecha)}</Td><Td><LocalBadge codigo={r.local?.codigo} /></Td>
                <Td>{r.compra ? <Link href={`/compras/${r.compra.id}`} className="font-semibold text-brand-600">{r.compra.numero}</Link> : <span className="text-xs text-muted">Sin compra</span>}</Td>
                <Td>{r.proveedor?.razon_social ?? r.transportista ?? '—'}</Td><Td className="text-xs">{r.ciudad?.nombre ?? '—'} → {r.destino ?? '—'}</Td>
                <Td className="text-xs">{r.documento ?? '—'}</Td><Td right className="font-semibold">{fmtSoles(r.costo)}</Td></tr>
            ))}</PagedTable>
        ) : <EmptyState title="Sin fletes en el periodo" />}
      </Section>
    </>
  )
}
