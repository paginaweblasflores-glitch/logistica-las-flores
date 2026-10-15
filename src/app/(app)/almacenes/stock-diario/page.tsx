import Link from 'next/link'
import { CalendarCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito } from '@/lib/session'
import { getAlmacenes } from '@/lib/queries'
import { fmtDate, fmtSoles, hoyLima } from '@/lib/format'
import { sp } from '@/lib/utils'
import { PageHeader, Section, Table, Th, Td, FilterBar, FilterField, EmptyState, Badge } from '@/components/ui'

export const metadata = { title: 'Stock del día' }

/**
 * El stock que cada almacén envía cada mañana, antes de sus movimientos (antes era un Excel de Tumisoft).
 * Fernanda ve qué almacén ya lo envió hoy y a qué hora, y abre cada envío (con su Excel).
 */
export default async function StockDiarioPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const [{ local }, supabase] = await Promise.all([getAmbito(), createClient()])
  const desde = sp(params, 'desde', `${hoyLima().slice(0, 7)}-01`), hasta = sp(params, 'hasta', hoyLima())
  let q = supabase.from('reporte_stock').select('id, fecha, enviado_at, productos, valor, almacen_id, almacen:almacen_id(nombre)')
    .gte('fecha', desde).lte('fecha', hasta)
  if (local) q = q.eq('local_id', local.id)
  // envíos del periodo y los almacenes (para ver cuál falta hoy): al mismo tiempo
  const [{ data }, almacenes] = await Promise.all([q.order('fecha', { ascending: false }).order('enviado_at', { ascending: false }).limit(400), getAlmacenes(local?.id, ['almacen'])])
  type R = { id: string; fecha: string; enviado_at: string; productos: number; valor: number; almacen_id: string; almacen: { nombre: string } }
  const filas = (data ?? []) as unknown as R[]
  const hoy = hoyLima()
  const deHoy = new Map(filas.filter((f) => f.fecha === hoy).map((f) => [f.almacen_id, f]))
  const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })

  return (
    <>
      <PageHeader title="Stock del día" description="El stock completo que cada almacén envía cada mañana, antes de registrar sus movimientos. Haga clic en un envío para verlo o descargarlo en Excel." />
      <div className="mb-5 flex flex-wrap gap-2">
        {almacenes.map((a) => {
          const e = deHoy.get(a.id)
          return (
            <span key={a.id} className="card flex items-center gap-2 px-3 py-2 text-sm">
              <b>{a.nombre}</b>
              {e ? <Link href={`/almacenes/stock-diario/${e.id}`}><Badge tone="green">Hoy {hora(e.enviado_at)}</Badge></Link> : <Badge tone="amber">Hoy sin enviar</Badge>}
            </span>
          )
        })}
      </div>
      <FilterBar>
        <FilterField label="Desde"><input type="date" name="desde" defaultValue={desde} className="field" /></FilterField>
        <FilterField label="Hasta"><input type="date" name="hasta" defaultValue={hasta} className="field" /></FilterField>
      </FilterBar>
      <Section icon={CalendarCheck} title="Envíos" bodyClassName="p-0" stats={[{ label: 'Envíos', value: filas.length }]}>
        {filas.length ? (
          <Table>
            <thead><tr><Th>Día</Th><Th>Almacén</Th><Th>Hora de envío</Th><Th right>Productos</Th><Th right>Valor del stock</Th></tr></thead>
            <tbody>{filas.map((f) => (
              <tr key={f.id} className="hover:bg-canvas/60">
                <Td><Link href={`/almacenes/stock-diario/${f.id}`} className="font-semibold text-brand-600">{fmtDate(f.fecha)}</Link></Td>
                <Td>{f.almacen.nombre}</Td>
                <Td className="tabular">{hora(f.enviado_at)}</Td>
                <Td right>{f.productos}</Td>
                <Td right className="font-semibold">{fmtSoles(f.valor)}</Td>
              </tr>
            ))}</tbody>
          </Table>
        ) : <EmptyState title="Sin envíos en el periodo" />}
      </Section>
    </>
  )
}
