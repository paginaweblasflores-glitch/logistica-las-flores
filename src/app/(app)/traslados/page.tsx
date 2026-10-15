import Link from 'next/link'
import { ArrowLeftRight, Plus, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getPanel, getAlmacenActivo, soloConsulta } from '@/lib/session'
import { fmtDate, hoyLima } from '@/lib/format'
import { sp, cn } from '@/lib/utils'
import { paginar } from '@/lib/paginacion'
import { PageHeader, Section, Table, Th, Td, Pagination, EmptyState, LinkButton, EstadoBadge, LocalBadge, Note, FilterBar, FilterField } from '@/components/ui'
import { Select } from '@/components/select'

export const metadata = { title: 'Traspasos' }

export default async function TrasladosPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const [{ local }, panel, sel, supabase] = await Promise.all([getAmbito(), getPanel(), getAlmacenActivo(), createClient()])
  const { from, to } = paginar(params)
  // como Entradas y Salidas: tipo y rango de fechas (por defecto, el mes actual)
  const vista = sp(params, 'ver', 'todos')
  const desde = sp(params, 'desde', `${hoyLima().slice(0, 7)}-01`), hasta = sp(params, 'hasta', hoyLima())
  // límites del periodo en hora de Lima (UTC−5), escritos en UTC para el filtro
  const ini = new Date(`${desde}T00:00:00-05:00`).toISOString(), fin = new Date(`${hasta}T23:59:59-05:00`).toISOString()

  let q = supabase.from('traslado')
    .select(`id, numero, fecha, estado, motivo, recibido_at, local_origen_id, local_destino_id,
             origen:almacen_origen_id(nombre, local:local_id(codigo)), destino:almacen_destino_id(nombre, local:local_id(codigo)),
             recibe, traslado_detalle(count)`, { count: 'exact' })
  if (local && vista === 'enviados') q = q.eq('local_origen_id', local.id)
  else if (local && vista === 'recibidos') q = q.eq('local_destino_id', local.id).neq('estado', 'pendiente')
  else if (local) q = q.or(`local_origen_id.eq.${local.id},local_destino_id.eq.${local.id}`)
  // en «Todos», lo pendiente por recibir aparece siempre (aunque sea de antes del periodo)
  if (local && vista === 'todos') q = q.or(`and(fecha.gte.${ini},fecha.lte.${fin}),and(estado.eq.pendiente,local_destino_id.eq.${local.id})`)
  else q = q.gte('fecha', ini).lte('fecha', fin)
  if (sel.id && sel.lista.length > 1) q = q.or(`almacen_origen_id.eq.${sel.id},almacen_destino_id.eq.${sel.id}`)   // solo los del almacén elegido
  // la lista y los pendientes por recibir (para el aviso del almacén), al mismo tiempo
  const [{ data, count }, { count: pendientes }] = await Promise.all([
    q.order('fecha', { ascending: false }).range(from, to),
    local ? supabase.from('traslado').select('id', { count: 'exact', head: true }).eq('local_destino_id', local.id).eq('estado', 'pendiente') : Promise.resolve({ count: 0 }),
  ])
  const pend = pendientes ?? 0

  type Row = { id: string; numero: string; fecha: string; estado: string; motivo: string | null; recibido_at: string | null
    local_origen_id: string; local_destino_id: string
    origen: { nombre: string; local: { codigo: string } }; destino: { nombre: string; local: { codigo: string } }
    recibe: string | null; traslado_detalle: { count: number }[] }
  const tipos = [{ id: 'todos', nombre: 'Todos' }, { id: 'enviados', nombre: 'Enviados' }, { id: 'recibidos', nombre: 'Recibidos' }]

  return (
    <>
      <PageHeader title="Traspasos"
        actions={panel === 'almacen' && !soloConsulta(sel) ? <LinkButton href="/traslados/nuevo"><Plus className="size-4" /> Nuevo traspaso</LinkButton> : undefined} />

      {pend > 0 && <div className="mb-4"><Note tone="warn">Tiene <b>{pend}</b> {pend === 1 ? 'traspaso' : 'traspasos'} por recibir: aparecen resaltados en la lista con «Recibir →».</Note></div>}
      <FilterBar>
        {local && <FilterField label="Tipo"><Select name="ver" options={tipos} defaultValue={vista} required /></FilterField>}
        <FilterField label="Desde"><input type="date" name="desde" defaultValue={desde} className="field" /></FilterField>
        <FilterField label="Hasta"><input type="date" name="hasta" defaultValue={hasta} className="field" /></FilterField>
      </FilterBar>

      <Section icon={ArrowLeftRight} title="Historial de traspasos" bodyClassName="p-0" stats={[{ label: 'Registros', value: count ?? 0 }]}>
        {data?.length ? (
          <>
            <Table>
              <thead><tr><Th>N°</Th><Th>Fecha</Th><Th>Origen → destino</Th><Th>Motivo</Th><Th right>Ítems</Th><Th>Estado</Th></tr></thead>
              <tbody>{(data as unknown as Row[]).map((t) => {
                const porRecibir = local && t.estado === 'pendiente' && t.local_destino_id === local.id
                return (
                  <tr key={t.id} className={cn('hover:bg-canvas/60', porRecibir && 'bg-amber-50/50')}>
                    <Td><Link href={`/traslados/${t.id}`} className="font-semibold text-brand-600">{t.numero}</Link></Td>
                    <Td className="whitespace-nowrap tabular">{fmtDate(t.fecha, true)}</Td>
                    <Td>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span>{t.origen.nombre}<span className="block"><LocalBadge codigo={t.origen.local.codigo} /></span></span>
                        <ArrowRight className="size-3.5 text-muted" />
                        <span>{t.destino.nombre}<span className="block"><LocalBadge codigo={t.destino.local.codigo} /></span></span>
                      </span>
                    </Td>
                    <Td className="text-sm">{t.motivo ?? '—'}{t.recibe && <span className="block text-xs text-muted">Entregado a: {t.recibe}</span>}</Td>
                    <Td right>{t.traslado_detalle[0]?.count ?? 0}</Td>
                    <Td>{porRecibir ? <Link href={`/traslados/${t.id}`} className="text-xs font-bold text-brand-600">Recibir →</Link> : <EstadoBadge estado={t.estado} />}</Td>
                  </tr>
                )
              })}</tbody>
            </Table>
            <Pagination total={count ?? 0} />
          </>
        ) : <EmptyState title={'Sin traspasos en el periodo'}
              action={panel === 'almacen' && !soloConsulta(sel) ? <LinkButton href="/traslados/nuevo">Enviar un traspaso</LinkButton> : undefined} />}
      </Section>
    </>
  )
}
