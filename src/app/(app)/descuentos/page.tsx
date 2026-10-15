import Link from 'next/link'
import { BadgeMinus, Plus, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito } from '@/lib/session'
import { fmtDate, fmtSoles, hoyLima } from '@/lib/format'
import { sp } from '@/lib/utils'
import { PageHeader, Section, Table, Th, Td, FilterBar, FilterField, EmptyState, EstadoBadge, LinkButton, LocalBadge, Badge } from '@/components/ui'
import { Select } from '@/components/select'
import { ExportButton } from '@/components/export-button'
import { PagedTable } from '@/components/pager'

export const metadata = { title: 'Descuentos' }

const ORIGEN: Record<string, string> = { conteo: 'Conteo de almacén', rotura: 'Roturas', bebidas: 'Bebidas', caja: 'Caja', manual: 'Manual' }

export default async function DescuentosPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const { local } = await getAmbito()
  const supabase = await createClient()
  const desde = sp(params, 'desde', `${hoyLima().slice(0, 4)}-01-01`), hasta = sp(params, 'hasta', hoyLima())
  const estado = sp(params, 'estado'), origen = sp(params, 'origen')
  let q = supabase.from('v_descuento_resumen').select('*').gte('fecha', desde).lte('fecha', hasta)
  if (local) q = q.eq('local_id', local.id)
  if (estado) q = q.eq('estado', estado)
  if (origen) q = q.eq('origen', origen)
  const { data } = await q.order('fecha', { ascending: false }).limit(1000)
  type D = { id: string; numero: string; fecha: string; periodo: string; local_id: string; local_nombre: string; local_codigo: string; personal_id: string; personal: string; cargo: string | null
    origen: string; monto: number; estado: string; items: number; observacion: string | null }
  const rows = ((data ?? []) as D[])
  const vigentes = rows.filter((r) => r.estado !== 'anulado')
  const porPersona = new Map<string, { nombre: string; cargo: string | null; total: number; n: number }>()
  for (const r of vigentes) {
    const p = porPersona.get(r.personal_id) ?? { nombre: r.personal, cargo: r.cargo, total: 0, n: 0 }
    p.total += Number(r.monto); p.n++; porPersona.set(r.personal_id, p)
  }

  return (
    <>
      <PageHeader title="Descuentos al personal" description="Descuentos por faltantes de conteo, roturas de utensilios, bebidas y caja. Cada uno genera su informe formal para firma."
        actions={<>
          <ExportButton filename="descuentos" table="v_descuento_resumen" dateColumn="fecha" desde={desde} hasta={hasta} order="fecha" filters={{ local_id: local?.id }}
            columns={{ numero: 'N°', fecha: 'Fecha', local_nombre: 'Negocio', personal: 'Colaborador', cargo: 'Cargo', origen: 'Origen', monto: 'Monto S/', estado: 'Estado', observacion: 'Observación' }} />
          <LinkButton href="/descuentos/nuevo"><Plus className="size-4" /> Descuento manual</LinkButton>
        </>} />
      <FilterBar>
        <FilterField label="Desde"><input type="date" name="desde" defaultValue={desde} className="field" /></FilterField>
        <FilterField label="Hasta"><input type="date" name="hasta" defaultValue={hasta} className="field" /></FilterField>
        <FilterField label="Origen"><Select name="origen" defaultValue={origen} placeholder="Todos" options={Object.entries(ORIGEN).map(([id, nombre]) => ({ id, nombre }))} /></FilterField>
        <FilterField label="Estado"><Select name="estado" defaultValue={estado} placeholder="Todos" options={['propuesto', 'aprobado', 'aplicado', 'anulado'].map((e) => ({ id: e, nombre: e }))} /></FilterField>
      </FilterBar>
      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Section icon={BadgeMinus} title="Descuentos" bodyClassName="p-0" stats={[{ label: 'Total', value: fmtSoles(vigentes.reduce((s, r) => s + Number(r.monto), 0)) }]}>
          {rows.length ? (
            <PagedTable head={<tr><Th>N°</Th><Th>Fecha</Th><Th>Colaborador</Th><Th>Origen</Th><Th right>Monto</Th><Th>Estado</Th></tr>}>{rows.map((r) => (
                <tr key={r.id} className="hover:bg-canvas/60">
                  <Td><Link href={`/descuentos/${r.id}`} className="font-semibold text-brand-600">{r.numero}</Link></Td>
                  <Td className="tabular">{fmtDate(r.fecha)}</Td>
                  <Td><span className="block font-medium">{r.personal}</span><span className="text-xs text-muted">{r.cargo} · <LocalBadge codigo={r.local_codigo} /></span></Td>
                  <Td><Badge tone="gray">{ORIGEN[r.origen] ?? r.origen}</Badge></Td>
                  <Td right className="font-semibold">{fmtSoles(r.monto)}</Td>
                  <Td><EstadoBadge estado={r.estado} /></Td>
                </tr>
              ))}</PagedTable>
          ) : <EmptyState title="Sin descuentos en el periodo" />}
        </Section>
        <Section icon={Users} title="Acumulado por colaborador" bodyClassName="p-0">
          <PagedTable head={<tr><Th>Colaborador</Th><Th right>N°</Th><Th right>Total</Th></tr>}>{[...porPersona.values()].sort((a, b) => b.total - a.total).map((p) => (
              <tr key={p.nombre}><Td><span className="block font-medium">{p.nombre}</span><span className="text-xs text-muted">{p.cargo}</span></Td><Td right>{p.n}</Td><Td right className="font-bold">{fmtSoles(p.total)}</Td></tr>
            ))}</PagedTable>
        </Section>
      </div>
    </>
  )
}
