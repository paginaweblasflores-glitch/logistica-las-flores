import Link from 'next/link'
import { ClipboardCheck, Plus, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getPanel, getAlmacenActivo } from '@/lib/session'
import { fmtDate, fmtPct, fmtSoles, hoyLima, MESES_CORTO } from '@/lib/format'
import { sp } from '@/lib/utils'
import { paginar } from '@/lib/paginacion'
import { PageHeader, Section, Table, Th, Td, FilterBar, FilterField, Pagination, EmptyState, LinkButton, EstadoBadge, Badge, LocalBadge, Note } from '@/components/ui'
import { Select } from '@/components/select'
import { Bars } from '@/components/charts'
import { PagedTable } from '@/components/pager'

export const metadata = { title: 'Conteos físicos' }

const TIPOS = [{ id: 'almacen', nombre: 'Almacén' }, { id: 'bebidas', nombre: 'Bebidas' }, { id: 'carnes', nombre: 'Carnes' }, { id: 'utensilios', nombre: 'Utensilios' }]
const ESTADOS = [{ id: 'abierto', nombre: 'Abierto' }, { id: 'verificacion', nombre: 'En verificación' }, { id: 'cerrado', nombre: 'Cerrado' }]

export default async function ConteosPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const [{ local }, panel] = await Promise.all([getAmbito(), getPanel()])
  const supabase = await createClient()
  const { page, size, from, to } = paginar(params)
  const tipo = sp(params, 'tipo'), estado = sp(params, 'estado')
  const anio = Number(hoyLima().slice(0, 4))

  let q = supabase.from('v_conteo_resumen')
    .select('id, numero, fecha, hora, tipo, estado, local_codigo, almacen_nombre, responsable_conteo, responsable_almacen, items, items_contados, items_con_diferencia, valor_sistema, sobrante_valor, faltante_valor, pct_diferencia, meta', { count: 'exact' })
  if (local) q = q.eq('local_id', local.id)
  const sel = await getAlmacenActivo()
  if (sel.id) q = q.eq('almacen_id', sel.id)
  if (tipo) q = q.eq('tipo', tipo)
  if (estado) q = q.eq('estado', estado)
  const [{ data, count }, kpi] = await Promise.all([
    q.order('fecha', { ascending: false }).order('numero', { ascending: false }).range(from, to),
    supabase.rpc('fn_kpi_inventario_mensual', { p_local: local?.id ?? null, p_anio: anio }),
  ])

  type Kpi = { mes: number; local_codigo: string; responsable: string; conteos: number; valor_sistema: number; sobrante: number; faltante: number; diferencia_bruta: number; pct_diferencia: number | null; meta: number; cumple: boolean }
  const kpis = (kpi.data ?? []) as Kpi[]
  const serie = Array.from({ length: 12 }, (_, i) => {
    const m = kpis.filter((k) => k.mes === i + 1)
    const lf = m.filter((k) => k.local_codigo === 'LF'), um = m.filter((k) => k.local_codigo === 'UM')
    const pct = (arr: Kpi[]) => { const v = arr.reduce((s, k) => s + Number(k.valor_sistema), 0); return v ? arr.reduce((s, k) => s + Number(k.diferencia_bruta), 0) / v : null }
    return { mes: MESES_CORTO[i], LF: pct(lf), UM: pct(um) }
  }).filter((r) => r.LF !== null || r.UM !== null)
  const meta = kpis[0]?.meta ? Number(kpis[0].meta) : 0.01

  type Row = { id: string; numero: string; fecha: string; hora: string | null; tipo: string; estado: string; local_codigo: string; almacen_nombre: string
    responsable_conteo: string | null; responsable_almacen: string | null; items: number; items_contados: number; items_con_diferencia: number
    valor_sistema: number; sobrante_valor: number; faltante_valor: number; pct_diferencia: number | null; meta: number }

  return (
    <>
      <PageHeader title="Conteos físicos"
        description="Conteo cíclico (2 veces al mes) de almacenes, conteo sabatino de carnes y conteo mensual de bebidas. Todo el flujo del Excel —reporte inicial, conteo, verificación, resultado, descuento y reporte final— en un solo lugar."
        actions={panel === 'almacen' ? undefined : <LinkButton href="/conteos/nuevo"><Plus className="size-4" /> Nuevo conteo</LinkButton>} />

      <Section icon={Target} title={`Exactitud de inventario ${anio}`} className="mb-5"
        stats={[{ label: 'Meta', value: `≤ ${fmtPct(meta)}` }]} bodyClassName="grid gap-6 p-5 lg:grid-cols-[1.4fr_1fr]">
        <Bars data={serie} x="mes" format="pct" meta={meta} height={250}
              series={local ? [{ key: local.codigo, name: local.nombre }] : [{ key: 'LF', name: 'Las Flores' }, { key: 'UM', name: 'Hotel Umaru' }]} />
        <div className="overflow-x-auto">
          <PagedTable head={<tr><th className="th">Mes</th><th className="th">Responsable</th><th className="th text-right">Dif. S/</th><th className="th text-right">%</th></tr>}>
              {[...kpis].reverse().map((k) => (
                <tr key={`${k.mes}${k.local_codigo}${k.responsable}`}>
                  <td className="td">{MESES_CORTO[k.mes - 1]} <LocalBadge codigo={k.local_codigo} /></td>
                  <td className="td text-xs">{k.responsable}</td>
                  <td className="td text-right tabular">{fmtSoles(k.diferencia_bruta)}</td>
                  <td className="td text-right"><Badge tone={k.cumple ? 'green' : 'red'}>{fmtPct(k.pct_diferencia)}</Badge></td>
                </tr>
              ))}
            </PagedTable>
        </div>
      </Section>

      <div className="mb-4">
        <Note>
          <b>Cómo se calcula:</b> % diferencia = (sobrantes + |faltantes| valorizados al costo) ÷ valor del stock del sistema contado.
          En el Excel se sumaban unidades de distinta medida (kg, botellas, gramos) como “stock inicial”; aquí todo se valoriza en soles para que el porcentaje sea comparable entre almacenes y meses.
        </Note>
      </div>

      <FilterBar>
        <FilterField label="Tipo"><Select name="tipo" options={TIPOS} defaultValue={tipo} placeholder="Todos" /></FilterField>
        <FilterField label="Estado"><Select name="estado" options={ESTADOS} defaultValue={estado} placeholder="Todos" /></FilterField>
      </FilterBar>
      <Section icon={ClipboardCheck} title="Conteos" bodyClassName="p-0" stats={[{ label: 'Registros', value: count ?? 0 }]}>
        {data?.length ? (
          <>
            <Table>
              <thead><tr><Th>N°</Th><Th>Fecha</Th><Th>Tipo</Th><Th>Almacén</Th><Th>Responsables</Th><Th right>Avance</Th><Th right>Sobrante</Th><Th right>Faltante</Th><Th right>% dif.</Th><Th>Estado</Th></tr></thead>
              <tbody>
                {(data as Row[]).map((r) => (
                  <tr key={r.id} className="hover:bg-canvas/60">
                    <Td><Link href={`/conteos/${r.id}`} className="font-semibold text-brand-600">{r.numero}</Link></Td>
                    <Td className="whitespace-nowrap tabular">{fmtDate(r.fecha)} {r.hora?.slice(0, 5)}</Td>
                    <Td className="capitalize">{r.tipo}</Td>
                    <Td><span className="block">{r.almacen_nombre}</span><LocalBadge codigo={r.local_codigo} /></Td>
                    <Td className="text-xs"><span className="block">{r.responsable_almacen ?? '—'}</span><span className="text-muted">Conteo: {r.responsable_conteo ?? '—'}</span></Td>
                    <Td right className="text-xs">{r.items_contados}/{r.items}<span className="block text-muted">{r.items_con_diferencia} con dif.</span></Td>
                    <Td right className="text-leaf-600">{fmtSoles(r.sobrante_valor)}</Td>
                    <Td right className="text-brand-700">{fmtSoles(r.faltante_valor)}</Td>
                    <Td right>{r.estado === 'abierto' ? '—' : <Badge tone={r.pct_diferencia !== null && r.pct_diferencia <= r.meta ? 'green' : 'red'}>{fmtPct(r.pct_diferencia)}</Badge>}</Td>
                    <Td><EstadoBadge estado={r.estado} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination total={count ?? 0} />
          </>
        ) : <EmptyState title="Aún no hay conteos" action={panel === 'almacen' ? undefined : <LinkButton href="/conteos/nuevo">Iniciar un conteo</LinkButton>} />}
      </Section>
    </>
  )
}
