import Link from 'next/link'
import { Layers, CalendarClock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getAlmacenActivo, getPanel } from '@/lib/session'
import { fmtDate, fmtPct, fmtQty, fmtSoles } from '@/lib/format'
import { sp } from '@/lib/utils'
import { PageHeader, Section, Table, Th, Td, FilterBar, FilterField, EmptyState, EstadoBadge, Stat, Note, Badge } from '@/components/ui'
import { Select } from '@/components/select'
import { PagedTable } from '@/components/pager'

export async function generateMetadata() {
  return { title: (await getPanel()) === 'almacen' ? 'Vencimientos' : 'FIFO' }
}

/**
 * Almacén → «Vencimientos»: qué vence y cuándo, con el aviso que eligió para cada producto.
 *   El FIFO lo hace el sistema solo (cada salida descuenta lo más antiguo): el almacén no ve lotes.
 * Logística → «FIFO»: reporte del cumplimiento FIFO (meta 100%) y los lotes en su orden de salida.
 */
export default async function LotesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const [{ local }, sel, panel, supabase] = await Promise.all([getAmbito(), getAlmacenActivo(), getPanel(), createClient()])
  return panel === 'almacen'
    ? <Vencimientos supabase={supabase} local={local?.id ?? null} almacen={sel.id} estado={sp(params, 'estado')} />
    : <ReporteFifo supabase={supabase} local={local?.id ?? null} />
}

type Cliente = Awaited<ReturnType<typeof createClient>>

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
        <FilterField label="Estado"><Select name="estado" defaultValue={estado} placeholder="Todos" options={[{ id: 'vencido', nombre: 'Vencido' }, { id: 'por_vencer', nombre: 'Por vencer' }, { id: 'vigente', nombre: 'Vigente' }]} /></FilterField>
      </FilterBar>
      <Section icon={CalendarClock} title="Vencimientos" bodyClassName="p-0" stats={[{ label: 'Registros', value: filas.length }]}>
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
        ) : <EmptyState title="Sin fechas de vencimiento" description="La fecha se escribe al registrar cada entrada (o en la ficha del producto)." />}
      </Section>
    </>
  )
}

async function ReporteFifo({ supabase, local }: { supabase: Cliente; local: string | null }) {
  let q = supabase.from('v_lote_fifo').select('id, producto, codigo_almacen, almacen, fecha_ingreso, cantidad_inicial, cantidad_disponible, costo_unitario, orden_salida')
  if (local) q = q.eq('local_id', local)
  const [{ data }, { data: fifoData }] = await Promise.all([
    q.order('producto').order('orden_salida').limit(1000),
    supabase.rpc('fn_fifo_resumen', { p_local: local }),
  ])
  const fifo = fifoData as { cumplimiento: number | null; salidas: number } | null
  type L = { id: string; producto: string; codigo_almacen: number | null; almacen: string; fecha_ingreso: string; cantidad_inicial: number; cantidad_disponible: number; costo_unitario: number; orden_salida: number }
  const rows = (data ?? []) as L[]

  return (
    <>
      <PageHeader title="FIFO" description="Reporte: cuánto se cumple que salga primero lo que vence primero (meta 100%; lo que no vence, por orden de llegada) y los lotes de cada almacén en su orden de salida. Lo calcula el sistema solo." />
      <div className="mb-5 grid grid-cols-2 gap-4 lg:max-w-xl">
        <Stat label="Cumplimiento FIFO" value={fmtPct(fifo?.cumplimiento)} meta={{ valor: fifo?.cumplimiento ?? null, meta: 1 }} hint={`${fifo?.salidas ?? 0} salidas`} />
        <Stat label="Lotes activos" value={rows.length} />
      </div>
      <div className="mb-4"><Note>Las salidas descuentan automáticamente el lote que vence primero. Si alguien elige manualmente otro lote, la salida queda marcada “fuera de FIFO” y baja el indicador.</Note></div>
      <Section icon={Layers} title="Lotes en almacén" bodyClassName="p-0">
        {rows.length ? (
          <PagedTable head={<tr><Th right>Cód.</Th><Th>Producto</Th><Th>Almacén</Th><Th right>Orden de salida</Th><Th>Ingreso</Th><Th right>Saldo</Th><Th right>Valor</Th></tr>}>{rows.map((r) => (
              <tr key={r.id}><Td right className="font-mono text-xs font-semibold">{r.codigo_almacen ?? '—'}</Td><Td className="font-medium">{r.producto}</Td><Td className="text-xs">{r.almacen}</Td>
                <Td right>{r.orden_salida === 1 ? <Badge tone="dark">Sale primero</Badge> : `${r.orden_salida}º`}</Td>
                <Td className="tabular">{fmtDate(r.fecha_ingreso)}</Td>
                <Td right>{fmtQty(r.cantidad_disponible)} / {fmtQty(r.cantidad_inicial)}</Td><Td right>{fmtSoles(r.cantidad_disponible * r.costo_unitario)}</Td></tr>
            ))}</PagedTable>
        ) : <EmptyState title="No hay lotes activos" />}
      </Section>
    </>
  )
}
