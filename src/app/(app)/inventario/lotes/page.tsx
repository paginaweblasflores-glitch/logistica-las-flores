import Link from 'next/link'
import { Layers, CalendarClock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getAlmacenActivo, getPanel } from '@/lib/session'
import { fmtDate, fmtQty, fmtSoles } from '@/lib/format'
import { sp } from '@/lib/utils'
import { PageHeader, Section, Table, Th, Td, FilterBar, FilterField, EmptyState, EstadoBadge, Stat, Badge } from '@/components/ui'
import { Select } from '@/components/select'
import { getAlmacenes } from '@/lib/queries'
import { PagedTable } from '@/components/pager'

export async function generateMetadata() {
  return { title: 'Vencimientos' }
}

/**
 * Almacén → «Vencimientos»: qué vence y cuándo, con el aviso que eligió para cada producto.
 *   El FIFO lo hace el sistema solo (cada salida descuenta lo más antiguo): el almacén no ve lotes.
 * Logística → «Vencimientos»: lo que vence pronto o ya venció (con su valor) y los lotes en su orden de salida.
 */
export default async function LotesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const [{ local }, sel, panel, supabase] = await Promise.all([getAmbito(), getAlmacenActivo(), getPanel(), createClient()])
  return panel === 'almacen'
    ? <Vencimientos supabase={supabase} local={local?.id ?? null} almacen={sel.id} estado={sp(params, 'estado')} />
    : <ReporteLotes supabase={supabase} local={local?.id ?? null} almacen={sp(params, 'almacen')} estado={sp(params, 'estado')} />
}

type Cliente = Awaited<ReturnType<typeof createClient>>

const ESTADOS_LOTE = [{ id: 'vencido', nombre: 'Vencido' }, { id: 'por_vencer', nombre: 'Por vencer' }, { id: 'vigente', nombre: 'Vigente' }]

async function Vencimientos({ supabase, local, almacen, estado }: { supabase: Cliente; local: string | null; almacen: string | null; estado: string }) {
  let v = supabase.from('v_vencimiento').select('id, producto_id, producto, codigo_almacen, almacen, fecha_vencimiento, dias_para_vencer, dias_aviso, cantidad, unidad, estado')
  if (local) v = v.eq('local_id', local)
  if (almacen) v = v.eq('almacen_id', almacen)   // solo el almacén elegido arriba
  if (estado) v = v.eq('estado', estado)
  const { data } = await v.order('fecha_vencimiento').limit(1000)
  type V = { id: string; producto_id: string; producto: string; codigo_almacen: number | null; almacen: string; fecha_vencimiento: string; dias_para_vencer: number; dias_aviso: number
    cantidad: number; unidad: string; estado: string }
  const filas = (data ?? []) as V[]
  const vencidos = filas.filter((r) => r.estado === 'vencido').length
  const porVencer = filas.filter((r) => r.estado === 'por_vencer').length

  return (
    <>
      <PageHeader title="Vencimientos" />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:max-w-xl">
        <Stat label="Por vencer" value={porVencer} tone={porVencer ? 'warn' : 'default'} hint="Dentro de sus días de aviso" />
        <Stat label="Vencidos" value={vencidos} tone={vencidos ? 'bad' : 'good'} hint="Aún en el almacén" />
      </div>
      <FilterBar>
        <FilterField label="Estado"><Select name="estado" defaultValue={estado} placeholder="Todos" options={ESTADOS_LOTE} /></FilterField>
      </FilterBar>
      <Section icon={CalendarClock} title="Productos con fecha de vencimiento" bodyClassName="p-0" stats={[{ label: 'Registros', value: filas.length }]}>
        {filas.length ? (
          <Table>
            <thead><tr><Th right>Cód.</Th><Th>Producto</Th>{!almacen && <Th>Almacén</Th>}<Th>Vence</Th><Th right>Días</Th><Th right>Aviso</Th><Th right>Cantidad</Th><Th>Estado</Th></tr></thead>
            <tbody>{filas.map((r) => (
              <tr key={r.id}>
                <Td right className="font-mono text-xs font-semibold">{r.codigo_almacen ?? '—'}</Td>
                <Td><Link href={`/productos/${r.producto_id}`} className="font-medium hover:text-brand-600">{r.producto}</Link></Td>
                {!almacen && <Td className="text-xs">{r.almacen}</Td>}
                <Td className="tabular">{fmtDate(r.fecha_vencimiento)}</Td>
                <Td right className="text-xs">{r.dias_para_vencer < 0 ? `venció hace ${-r.dias_para_vencer}` : r.dias_para_vencer === 0 ? 'vence hoy' : `faltan ${r.dias_para_vencer}`}</Td>
                <Td right className="text-xs text-muted">{r.dias_aviso} días antes</Td>
                <Td right>{fmtQty(r.cantidad)} <span className="text-xs text-muted">{r.unidad}</span></Td>
                <Td><EstadoBadge estado={r.estado} /></Td>
              </tr>
            ))}</tbody>
          </Table>
        ) : <EmptyState title="Sin fechas de vencimiento" description="La fecha se escribe en cada entrada o en el stock inicial." />}
      </Section>
    </>
  )
}

async function ReporteLotes({ supabase, local, almacen, estado }: { supabase: Cliente; local: string | null; almacen: string; estado: string }) {
  let q = supabase.from('v_lote_fifo').select('id, producto, codigo_almacen, almacen, fecha_ingreso, fecha_vencimiento, dias_para_vencer, estado, cantidad_inicial, cantidad_disponible, costo_unitario, orden_salida')
  if (local) q = q.eq('local_id', local)
  if (almacen) q = q.eq('almacen_id', almacen)
  if (estado) q = q.eq('estado', estado)
  // los lotes y los almacenes del filtro, al mismo tiempo
  const [{ data }, almacenes] = await Promise.all([q.order('producto').order('orden_salida').limit(1000), getAlmacenes(local, ['almacen'])])
  type L = { id: string; producto: string; codigo_almacen: number | null; almacen: string; fecha_ingreso: string; fecha_vencimiento: string | null; dias_para_vencer: number | null
    estado: string; cantidad_inicial: number; cantidad_disponible: number; costo_unitario: number; orden_salida: number }
  // lo urgente primero: vencido, por vencer y luego lo vigente; dentro, por producto y su orden de salida
  const URGENCIA: Record<string, number> = { vencido: 0, por_vencer: 1, vigente: 2 }
  const rows = ((data ?? []) as L[]).sort((a, b) => (URGENCIA[a.estado] ?? 3) - (URGENCIA[b.estado] ?? 3))
  const valor = (r: L) => Number(r.cantidad_disponible) * Number(r.costo_unitario)
  // por vencer = dentro del aviso de cada producto (30 días si no se cambió); vencidos = ya vencieron y siguen en el almacén
  const porVencer = rows.filter((r) => r.estado === 'por_vencer'), vencidos = rows.filter((r) => r.estado === 'vencido')
  const suma = (xs: L[]) => xs.reduce((s, r) => s + valor(r), 0)

  return (
    <>
      <PageHeader title="Vencimientos" />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label="Por vencer" value={porVencer.length} tone={porVencer.length ? 'warn' : 'default'} hint={`${fmtSoles(suma(porVencer))} en riesgo · según el aviso de cada producto`} />
        <Stat label="Vencidos con stock" value={vencidos.length} tone={vencidos.length ? 'bad' : 'good'} hint={`${fmtSoles(suma(vencidos))} en el almacén`} />
        <Stat label="Lotes activos" value={rows.length} hint={`${fmtSoles(suma(rows))} en total`} />
      </div>
      <FilterBar>
        <FilterField label="Almacén"><Select name="almacen" options={almacenes} defaultValue={almacen} placeholder="Todos" /></FilterField>
        <FilterField label="Estado"><Select name="estado" defaultValue={estado} placeholder="Todos" options={ESTADOS_LOTE} /></FilterField>
      </FilterBar>
      <Section icon={Layers} title="Lotes en almacén" bodyClassName="p-0">
        {rows.length ? (
          <PagedTable head={<tr><Th right>Cód.</Th><Th>Producto</Th><Th>Almacén</Th><Th right>Orden de salida</Th><Th>Ingreso</Th><Th>Vence</Th><Th right>Queda en el lote</Th><Th right>Valor</Th></tr>}>{rows.map((r) => (
              <tr key={r.id}><Td right className="font-mono text-xs font-semibold">{r.codigo_almacen ?? '—'}</Td><Td className="font-medium">{r.producto}</Td><Td className="text-xs">{r.almacen}</Td>
                <Td right>{r.orden_salida === 1 ? <Badge tone="dark">Sale primero</Badge> : `${r.orden_salida}º`}</Td>
                <Td className="tabular">{fmtDate(r.fecha_ingreso)}</Td>
                <Td className="tabular">{r.fecha_vencimiento ? <>{fmtDate(r.fecha_vencimiento)}{r.estado !== 'vigente' && <span className="ml-1.5"><EstadoBadge estado={r.estado} /></span>}</> : <span className="text-subtle">—</span>}</Td>
                <Td right><b>{fmtQty(r.cantidad_disponible)}</b> <span className="text-xs text-muted">de {fmtQty(r.cantidad_inicial)} que entraron</span></Td><Td right>{fmtSoles(valor(r))}</Td></tr>
            ))}</PagedTable>
        ) : <EmptyState title={almacen || estado ? 'Sin lotes con estos filtros' : 'No hay lotes activos'} />}
      </Section>
    </>
  )
}
