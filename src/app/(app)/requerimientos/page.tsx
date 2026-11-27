import Link from 'next/link'
import { ClipboardList, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getPanel, getAlmacenActivo } from '@/lib/session'
import { fmtDate, fmtPct, fmtSoles, haceDias } from '@/lib/format'
import { sp } from '@/lib/utils'
import { paginar } from '@/lib/paginacion'
import { PageHeader, Section, Table, Th, Td, FilterBar, FilterField, Pagination, EmptyState, LinkButton, EstadoBadge, Badge, LocalBadge } from '@/components/ui'
import { Select } from '@/components/select'
import { ListaJuntados, PestanasOrigen, rlPorEnviar, EnviadoBadge } from './juntados'

export const metadata = { title: 'Requerimientos' }

// un solo filtro (antes «Vista» y «Estado» por separado): «Pendientes» junta los que aún esperan algo
const PENDIENTES = ['solicitado', 'en_cotizacion', 'aprobado']
const ESTADOS = [
  { id: 'pendientes', nombre: 'Pendientes' }, { id: 'solicitado', nombre: 'Solicitado' }, { id: 'en_cotizacion', nombre: 'En cotización' },
  { id: 'aprobado', nombre: 'Aprobado' }, { id: 'comprado', nombre: 'Comprado' }, { id: 'atendido', nombre: 'Atendido' },
  { id: 'cerrado', nombre: 'Cerrado' }, { id: 'rechazado', nombre: 'Rechazado' },
]

export default async function RequerimientosPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const [{ local }, panel, sel, supabase] = await Promise.all([getAmbito(), getPanel(), getAlmacenActivo(), createClient()])
  const { from, to } = paginar(params)
  const estado = sp(params, 'estado')
  // Dos requerimientos que no se mezclan: el de los jefes de área y el del almacén (su lista para reponer stock).
  // El almacén ve solo los suyos; el jefe de área, los de áreas; Logística, cada uno en su pestaña
  // (primero y por defecto «Del almacén»: es el que más requerimientos hace).
  const origen = panel === 'almacen' ? 'almacen' : panel === 'area' ? 'area' : sp(params, 'origen', 'almacen') === 'area' ? 'area' : 'almacen'
  const delAlmacen = origen === 'almacen'
  const esLogistica = panel === 'logistica'
  // Logística ve los del almacén JUNTADOS: un RL por negocio y día (con todos sus requerimientos)
  if (esLogistica && delAlmacen) return <ListaJuntados params={params} />

  let q = supabase.from('v_requerimiento_resumen')
    .select('id, numero, created_at, estado, parcial, prioridad, local_codigo, area_nombre, almacen_nombre, solicitante, items, monto_estimado, horas_aprobacion, dentro_objetivo, fecha_requerida', { count: 'exact' })
    .eq('origen', origen)
  if (local) q = q.eq('local_id', local.id)
  if (panel === 'almacen' && sel.id) q = q.eq('almacen_id', sel.id)   // el almacén elegido arriba
  if (estado === 'pendientes') q = q.in('estado', PENDIENTES)
  else if (estado) q = q.eq('estado', estado)
  // meta del puesto de Logística (MOF): aprobados en menos de 24 h; los demás paneles no la ven ni la consultan
  let k = supabase.from('v_requerimiento_resumen').select('dentro_objetivo').not('aprobado_at', 'is', null).gte('created_at', haceDias(90))
  if (local) k = k.eq('local_id', local.id)
  k = k.eq('origen', origen)
  // las áreas por aprobar (Logística); en la pestaña del almacén, los RL con productos por enviar
  let porAprobar = supabase.from('requerimiento').select('id', { count: 'exact', head: true }).eq('origen', 'area').eq('estado', 'solicitado')
  if (local) porAprobar = porAprobar.eq('local_id', local.id)
  // la lista, el indicador < 24 h y lo pendiente de cada pestaña: al mismo tiempo
  const [{ data, count }, { data: kpi }, { count: nArea }, nAlmacen] = await Promise.all([
    q.order('created_at', { ascending: false }).range(from, to), esLogistica ? k : Promise.resolve({ data: null }),
    esLogistica ? porAprobar : Promise.resolve({ count: 0 }),
    esLogistica ? rlPorEnviar(local?.id) : Promise.resolve(0),
  ])
  // con «Todos», el almacén también crea: productos de varios almacenes (un requerimiento por almacén)
  const puedeCrear = panel !== 'logistica'
  const pct = kpi?.length ? kpi.filter((x) => x.dentro_objetivo).length / kpi.length : null
  // con un almacén elegido, la columna «Almacén» repetiría lo mismo en cada fila
  const colLugar = !(panel === 'almacen' && sel.id)

  type Row = { id: string; numero: string; created_at: string; estado: string; parcial: boolean; prioridad: string; local_codigo: string; area_nombre: string | null; almacen_nombre: string | null; solicitante: string
    items: number; monto_estimado: number | null; horas_aprobacion: number | null; dentro_objetivo: boolean | null; fecha_requerida: string | null }

  return (
    <>
      <PageHeader title="Requerimientos"
        actions={puedeCrear ? <LinkButton href="/requerimientos/nuevo"><Plus className="size-4" /> Nuevo requerimiento</LinkButton> : undefined} />
      {esLogistica && <PestanasOrigen origen={origen} nAlmacen={nAlmacen} nArea={nArea ?? 0} />}
      <FilterBar>
        {esLogistica && <input type="hidden" name="origen" value={origen} />}
        <FilterField label="Estado"><Select name="estado" options={ESTADOS} defaultValue={estado} placeholder="Todos" /></FilterField>
      </FilterBar>
      <Section icon={ClipboardList} title="Solicitudes" bodyClassName="p-0"
        stats={[{ label: 'Registros', value: count ?? 0 }, ...(esLogistica ? [{ label: 'Aprobados < 24 h (90 días)', value: fmtPct(pct) }] : [])]}>
        {data?.length ? (
          <>
            <Table>
              <thead><tr><Th>N°</Th><Th>Solicitado</Th>{colLugar && <Th>{delAlmacen ? 'Almacén' : 'Negocio / área'}</Th>}
                {!delAlmacen && <><Th>Solicitante</Th><Th>Prioridad</Th></>}<Th right>Ítems</Th>{!delAlmacen && <><Th right>Estimado</Th><Th>Aprobación</Th></>}<Th>Estado</Th></tr></thead>
              <tbody>{(data as Row[]).map((r) => (
                <tr key={r.id} className="hover:bg-canvas/60">
                  <Td><Link href={`/requerimientos/${r.id}`} className="enlace">{r.numero}</Link></Td>
                  <Td className="whitespace-nowrap tabular">{fmtDate(r.created_at, true)}{r.fecha_requerida && <span className="block text-xs text-muted">Para {fmtDate(r.fecha_requerida)}</span>}</Td>
                  {colLugar && <Td><LocalBadge codigo={r.local_codigo} /><span className="block text-xs text-muted">{(delAlmacen ? r.almacen_nombre : r.area_nombre) ?? '—'}</span></Td>}
                  {!delAlmacen && <><Td>{r.solicitante}</Td><Td><EstadoBadge estado={r.prioridad} /></Td></>}
                  <Td right>{r.items}</Td>
                  {!delAlmacen && <>
                    <Td right>{fmtSoles(r.monto_estimado)}</Td>
                    <Td>{r.horas_aprobacion === null ? <span className="text-xs text-muted">pendiente</span> : <Badge tone={r.dentro_objetivo ? 'green' : 'red'}>{r.horas_aprobacion} h</Badge>}</Td>
                  </>}
                  <Td>{r.parcial ? <Badge tone="amber">Atendido parcial</Badge>
                    : delAlmacen && r.estado === 'aprobado' ? <EnviadoBadge /> : <EstadoBadge estado={r.estado} />}</Td>
                </tr>
              ))}</tbody>
            </Table>
            <Pagination total={count ?? 0} />
          </>
        ) : <EmptyState title="Sin requerimientos" />}
      </Section>
    </>
  )
}
