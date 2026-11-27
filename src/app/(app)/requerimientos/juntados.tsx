import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito } from '@/lib/session'
import { fmtDate } from '@/lib/format'
import { sp, cn } from '@/lib/utils'
import { paginar } from '@/lib/paginacion'
import { PageHeader, Section, Table, Th, Td, FilterBar, FilterField, Pagination, EmptyState, Badge, LocalBadge } from '@/components/ui'
import { Select } from '@/components/select'

/**
 * Requerimientos del ALMACÉN para Logística: JUNTADOS por negocio y día (RL-UM-2026-0004). Cada negocio aparte;
 * dentro del negocio, todos los requerimientos del día de cualquiera de sus almacenes. Por dentro siguen separados.
 */

const ENVIO = [{ id: 'pendientes', nombre: 'Con productos por enviar' }, { id: 'enviados', nombre: 'Todo enviado' }]

/** Pestañas de Logística: «Del almacén» (RL por enviar) y «De áreas» (por aprobar) */
export function PestanasOrigen({ origen, nAlmacen, nArea }: { origen: string; nAlmacen: number; nArea: number }) {
  const tabs = [{ id: 'almacen', nombre: 'Del almacén', n: nAlmacen, ayuda: 'Con productos por enviar' }, { id: 'area', nombre: 'De áreas', n: nArea, ayuda: 'Por aprobar' }]
  return (
    <nav aria-label="Origen del requerimiento" className="mb-5 flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => (
        <Link key={t.id} href={`/requerimientos?origen=${t.id}`} aria-current={t.id === origen ? 'page' : undefined}
          className={cn('-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm transition-colors', t.id === origen ? 'border-brand-600 font-bold text-ink-900' : 'border-transparent font-semibold text-muted hover:border-line-strong hover:text-ink-900')}>
          {t.nombre}{t.n > 0 && <span className="rounded-full bg-brand-50 px-1.5 text-xs font-semibold text-brand-800 tabular" title={t.ayuda}>{t.n}</span>}
        </Link>
      ))}
    </nav>
  )
}

/** Cuántos RL tienen productos por enviar (el número de la pestaña) */
export async function rlPorEnviar(localId?: string) {
  const supabase = await createClient()
  let q = supabase.from('v_requerimiento_consolidado').select('id', { count: 'exact', head: true }).eq('pendiente', true)
  if (localId) q = q.eq('local_id', localId)
  const { count } = await q
  return count ?? 0
}

/** De cada requerimiento del almacén: si sus productos ya se enviaron al proveedor (todos, algunos o ninguno) */
export async function estadoEnvio(ids: string[]) {
  const supabase = await createClient()
  const { data } = await supabase.from('requerimiento_detalle').select('requerimiento_id, enviado_at, cantidad_aprobada').in('requerimiento_id', ids)
  const m = new Map<string, 'si' | 'parcial' | 'no'>()
  for (const id of ids) {
    const ls = (data ?? []).filter((d) => d.requerimiento_id === id && Number(d.cantidad_aprobada ?? 1) > 0)
    const env = ls.filter((d) => d.enviado_at).length
    m.set(id, ls.length && env === ls.length ? 'si' : env ? 'parcial' : 'no')
  }
  return m
}

export function EnvioBadge({ envio }: { envio: 'si' | 'parcial' | 'no' }) {
  return envio === 'si' ? <Badge tone="green">Enviado al proveedor</Badge> : envio === 'parcial' ? <Badge tone="amber">Enviado en parte</Badge> : <Badge tone="gray">Por enviar</Badge>
}

export async function ListaJuntados({ params }: { params: Record<string, string> }) {
  const [{ local }, supabase] = await Promise.all([getAmbito(), createClient()])
  const { from, to } = paginar(params)
  const envio = sp(params, 'envio')
  let q = supabase.from('v_requerimiento_consolidado')
    .select('id, numero, local_codigo, local_nombre, fecha, requerimientos, numeros, productos, por_enviar', { count: 'exact' })
  if (local) q = q.eq('local_id', local.id)
  if (envio === 'pendientes') q = q.eq('pendiente', true)
  else if (envio === 'enviados') q = q.eq('pendiente', false)
  let area = supabase.from('requerimiento').select('id', { count: 'exact', head: true }).eq('origen', 'area').eq('estado', 'solicitado')
  if (local) area = area.eq('local_id', local.id)
  // los que tienen algo por enviar, arriba; luego del más reciente al más antiguo
  const [{ data, count }, { count: nArea }, nAlmacen] = await Promise.all([
    q.order('pendiente', { ascending: false }).order('fecha', { ascending: false }).order('local_codigo').range(from, to),
    area, rlPorEnviar(local?.id),
  ])
  type Row = { id: string; numero: string; local_codigo: string; local_nombre: string; fecha: string; requerimientos: number; numeros: string[]; productos: number; por_enviar: number }

  return (
    <>
      <PageHeader title="Requerimientos" />
      <PestanasOrigen origen="almacen" nAlmacen={nAlmacen} nArea={nArea ?? 0} />
      <FilterBar>
        <input type="hidden" name="origen" value="almacen" />
        <FilterField label="Envío" className="min-w-60"><Select name="envio" options={ENVIO} defaultValue={envio} placeholder="Todos" /></FilterField>
      </FilterBar>
      <Section icon={ClipboardList} title="Requerimientos del almacén · por día" bodyClassName="p-0" stats={[{ label: 'Registros', value: count ?? 0 }]}>
        {data?.length ? (
          <>
            <Table>
              <thead><tr><Th>N°</Th><Th>Día</Th><Th>Negocio</Th><Th>Requerimientos del almacén</Th><Th right>Productos</Th><Th>Envío</Th></tr></thead>
              <tbody>{(data as Row[]).map((r) => (
                <tr key={r.id} className={cn('hover:bg-canvas/60', r.por_enviar > 0 && 'bg-amber-50/40')}>
                  <Td><Link href={`/requerimientos/rl/${r.id}`} className="enlace whitespace-nowrap">{r.numero}</Link></Td>
                  <Td className="whitespace-nowrap tabular">{fmtDate(r.fecha)}</Td>
                  <Td><LocalBadge codigo={r.local_codigo} /><span className="block text-xs text-muted">{r.local_nombre}</span></Td>
                  <Td className="text-xs text-muted">{r.requerimientos} · {[...r.numeros].sort().join(', ')}</Td>
                  <Td right>{r.productos}</Td>
                  <Td>{r.por_enviar > 0
                    ? <Badge tone="amber">{r.por_enviar} por enviar{r.productos - r.por_enviar > 0 ? ` · ${r.productos - r.por_enviar} enviados` : ''}</Badge>
                    : <Badge tone="green">Todo enviado ✓</Badge>}</Td>
                </tr>
              ))}</tbody>
            </Table>
            <Pagination total={count ?? 0} />
          </>
        ) : <EmptyState title="Sin requerimientos del almacén" description={envio ? 'Ajuste el filtro.' : undefined} />}
      </Section>
    </>
  )
}
