import Link from 'next/link'
import { ClipboardList, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getPanel, getAlmacenActivo, soloConsulta } from '@/lib/session'
import { fmtDate, fmtPct, fmtSoles } from '@/lib/format'
import { sp, cn } from '@/lib/utils'
import { paginar } from '@/lib/paginacion'
import { PageHeader, Section, Table, Th, Td, FilterBar, FilterField, Pagination, EmptyState, LinkButton, EstadoBadge, Badge, LocalBadge } from '@/components/ui'
import { Select } from '@/components/select'

export const metadata = { title: 'Requerimientos' }

const ESTADOS = ['solicitado', 'en_cotizacion', 'aprobado', 'comprado', 'atendido', 'cerrado', 'rechazado'].map((e) => ({ id: e, nombre: e.replace('_', ' ') }))

export default async function RequerimientosPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const [{ local }, panel, sel, supabase] = await Promise.all([getAmbito(), getPanel(), getAlmacenActivo(), createClient()])
  const { page, size, from, to } = paginar(params)
  const estado = sp(params, 'estado'), vista = sp(params, 'vista', 'pendientes')
  // Dos requerimientos que no se mezclan: el de los jefes de área y el del almacén (su lista para reponer stock).
  // El almacén ve solo los suyos; el jefe de área, los de áreas; Logística, cada uno en su pestaña.
  const origen = panel === 'almacen' ? 'almacen' : panel === 'area' ? 'area' : sp(params, 'origen', 'area') === 'almacen' ? 'almacen' : 'area'
  const delAlmacen = origen === 'almacen'

  let q = supabase.from('v_requerimiento_resumen')
    .select('id, numero, created_at, estado, parcial, prioridad, local_codigo, area_nombre, almacen_nombre, solicitante, items, monto_estimado, horas_aprobacion, dentro_objetivo, fecha_requerida', { count: 'exact' })
    .eq('origen', origen)
  if (local) q = q.eq('local_id', local.id)
  if (panel === 'almacen' && sel.id) q = q.eq('almacen_id', sel.id)   // el almacén elegido arriba
  if (estado) q = q.eq('estado', estado)
  else if (vista === 'pendientes') q = q.in('estado', ['solicitado', 'en_cotizacion', 'aprobado'])
  let k = supabase.from('v_requerimiento_resumen').select('dentro_objetivo').not('aprobado_at', 'is', null).gte('created_at', new Date(Date.now() - 90 * 864e5).toISOString())
  if (local) k = k.eq('local_id', local.id)
  k = k.eq('origen', origen)
  // por aprobar en cada pestaña (Logística)
  const porAprobar = (o: string) => {
    let x = supabase.from('requerimiento').select('id', { count: 'exact', head: true }).eq('origen', o).eq('estado', 'solicitado')
    if (local) x = x.eq('local_id', local.id)
    return x
  }
  const esLogistica = panel === 'logistica'
  // la lista, el indicador < 24 h y lo que falta aprobar en cada pestaña: al mismo tiempo
  const [{ data, count }, { data: kpi }, { count: nArea }, { count: nAlmacen }] = await Promise.all([
    q.order('created_at', { ascending: false }).range(from, to), k,
    esLogistica ? porAprobar('area') : Promise.resolve({ count: 0 }),
    esLogistica ? porAprobar('almacen') : Promise.resolve({ count: 0 }),
  ])
  const puedeCrear = panel !== 'logistica' && !(panel === 'almacen' && soloConsulta(sel))
  const tabs = [{ id: 'area', nombre: 'De áreas', n: nArea ?? 0 }, { id: 'almacen', nombre: 'Del almacén', n: nAlmacen ?? 0 }]
  const pct = kpi?.length ? kpi.filter((x) => x.dentro_objetivo).length / kpi.length : null

  type Row = { id: string; numero: string; created_at: string; estado: string; parcial: boolean; prioridad: string; local_codigo: string; area_nombre: string | null; almacen_nombre: string | null; solicitante: string
    items: number; monto_estimado: number | null; horas_aprobacion: number | null; dentro_objetivo: boolean | null; fecha_requerida: string | null }

  return (
    <>
      <PageHeader title="Requerimientos"
        description={delAlmacen
          ? (panel === 'almacen' ? 'Su lista de productos para reponer stock. Logística la aprueba y compra; cuando llega, usted la registra en Entradas con la boleta.' : 'Listas del almacén para reponer stock. Usted aprueba y marca «Comprado» (sin precios): la llegada y la boleta las registra el almacén.')
          : 'Solicitudes de bienes y materiales de las áreas. El tiempo entre la solicitud y la aprobación alimenta el indicador “requisiciones < 24 h” del MOF.'}
        actions={puedeCrear ? <LinkButton href="/requerimientos/nuevo"><Plus className="size-4" /> Nuevo requerimiento</LinkButton> : undefined} />
      {esLogistica && (
        <nav className="mb-5 flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1">
          {tabs.map((t) => (
            <Link key={t.id} href={`/requerimientos?origen=${t.id}`}
              className={cn('flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold', t.id === origen ? 'bg-ink-900 text-white' : 'text-muted hover:bg-canvas hover:text-ink-900')}>
              {t.nombre}{t.n > 0 && <span className={cn('rounded-full px-1.5 text-[11px] tabular', t.id === origen ? 'bg-white/20' : 'bg-brand-50 text-brand-700')}>{t.n}</span>}
            </Link>
          ))}
        </nav>
      )}
      <FilterBar>
        {esLogistica && <input type="hidden" name="origen" value={origen} />}
        <FilterField label="Vista"><Select name="vista" defaultValue={vista} options={[{ id: 'pendientes', nombre: 'Pendientes' }, { id: 'todos', nombre: 'Todos' }]} /></FilterField>
        <FilterField label="Estado"><Select name="estado" options={ESTADOS} defaultValue={estado} placeholder="—" /></FilterField>
      </FilterBar>
      <Section icon={ClipboardList} title="Solicitudes" bodyClassName="p-0"
        stats={[{ label: 'Registros', value: count ?? 0 }, { label: 'Aprobados < 24 h (90 días)', value: fmtPct(pct) }]}>
        {data?.length ? (
          <>
            <Table>
              <thead><tr><Th>N°</Th><Th>Solicitado</Th><Th>{delAlmacen ? 'Almacén' : 'Negocio / área'}</Th>
                {!delAlmacen && <><Th>Solicitante</Th><Th>Prioridad</Th></>}<Th right>Ítems</Th>{!delAlmacen && <Th right>Estimado</Th>}<Th>Aprobación</Th><Th>Estado</Th></tr></thead>
              <tbody>{(data as Row[]).map((r) => (
                <tr key={r.id} className="hover:bg-canvas/60">
                  <Td><Link href={`/requerimientos/${r.id}`} className="font-semibold text-brand-600">{r.numero}</Link></Td>
                  <Td className="whitespace-nowrap tabular">{fmtDate(r.created_at, true)}{r.fecha_requerida && <span className="block text-xs text-muted">Para {fmtDate(r.fecha_requerida)}</span>}</Td>
                  <Td><LocalBadge codigo={r.local_codigo} /><span className="block text-xs text-muted">{(delAlmacen ? r.almacen_nombre : r.area_nombre) ?? '—'}</span></Td>
                  {!delAlmacen && <><Td>{r.solicitante}</Td><Td><EstadoBadge estado={r.prioridad} /></Td></>}
                  <Td right>{r.items}</Td>
                  {!delAlmacen && <Td right>{fmtSoles(r.monto_estimado)}</Td>}
                  <Td>{r.horas_aprobacion === null ? <span className="text-xs text-muted">pendiente</span> : <Badge tone={r.dentro_objetivo ? 'green' : 'red'}>{r.horas_aprobacion} h</Badge>}</Td>
                  <Td>{r.parcial ? <Badge tone="amber">Atendido parcial</Badge> : <EstadoBadge estado={r.estado} />}</Td>
                </tr>
              ))}</tbody>
            </Table>
            <Pagination total={count ?? 0} />
          </>
        ) : <EmptyState title="Sin requerimientos" action={puedeCrear ? <LinkButton href="/requerimientos/nuevo">Crear requerimiento</LinkButton> : undefined} />}
      </Section>
    </>
  )
}
