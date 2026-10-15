import Link from 'next/link'
import { FileSpreadsheet, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito } from '@/lib/session'
import { fmtDate, fmtSoles, fmtPct } from '@/lib/format'
import { PageHeader, Section, Table, Th, Td, EmptyState, LinkButton, EstadoBadge, LocalBadge } from '@/components/ui'
import { PagedTable } from '@/components/pager'

export const metadata = { title: 'Cotizaciones' }

export default async function CotizacionesPage() {
  const { local } = await getAmbito()
  const supabase = await createClient()
  let q = supabase.from('v_cotizacion_ahorro').select('id, numero, fecha, local_id, titulo, estado, proveedor_aprobado, total_primera_ronda, total_adjudicado, ahorro')
  if (local) q = q.or(`local_id.eq.${local.id},local_id.is.null`)
  const [{ data }, { data: locales }] = await Promise.all([q.order('fecha', { ascending: false }).limit(200), supabase.from('local').select('id, codigo')])
  const cod = new Map((locales ?? []).map((l) => [l.id, l.codigo]))
  type Row = { id: string; numero: string; fecha: string; local_id: string | null; titulo: string; estado: string; proveedor_aprobado: string | null; total_primera_ronda: number | null; total_adjudicado: number | null; ahorro: number | null }
  const rows = (data ?? []) as Row[]
  const ahorro = rows.reduce((s, r) => s + Number(r.ahorro ?? 0), 0)

  return (
    <>
      <PageHeader title="Cotizaciones" description="Cuadro comparativo de proveedores y rondas de negociación. El ahorro = mejor oferta de la 1ª ronda − oferta adjudicada."
        actions={<LinkButton href="/cotizaciones/nueva"><Plus className="size-4" /> Nueva cotización</LinkButton>} />
      <Section icon={FileSpreadsheet} title="Solicitudes de cotización" bodyClassName="p-0" stats={[{ label: 'Ahorro por negociación', value: fmtSoles(ahorro) }]}>
        {rows.length ? (
          <PagedTable head={<tr><Th>N°</Th><Th>Fecha</Th><Th>Negocio</Th><Th>Título</Th><Th>Adjudicado a</Th><Th right>1ª ronda</Th><Th right>Adjudicado</Th><Th right>Ahorro</Th><Th>Estado</Th></tr>}>{rows.map((r) => (
              <tr key={r.id} className="hover:bg-canvas/60">
                <Td><Link href={`/cotizaciones/${r.id}`} className="font-semibold text-brand-600">{r.numero}</Link></Td>
                <Td className="tabular">{fmtDate(r.fecha)}</Td><Td><LocalBadge codigo={r.local_id ? cod.get(r.local_id) : null} /></Td>
                <Td>{r.titulo}</Td><Td>{r.proveedor_aprobado ?? '—'}</Td>
                <Td right>{fmtSoles(r.total_primera_ronda)}</Td><Td right className="font-semibold">{fmtSoles(r.total_adjudicado)}</Td>
                <Td right className="text-leaf-600">{r.ahorro ? <>{fmtSoles(r.ahorro)} <span className="text-xs text-muted">({fmtPct(Number(r.ahorro) / Number(r.total_primera_ronda))})</span></> : '—'}</Td>
                <Td><EstadoBadge estado={r.estado} /></Td>
              </tr>
            ))}</PagedTable>
        ) : <EmptyState title="Sin cotizaciones" action={<LinkButton href="/cotizaciones/nueva">Crear cotización</LinkButton>} />}
      </Section>
    </>
  )
}
