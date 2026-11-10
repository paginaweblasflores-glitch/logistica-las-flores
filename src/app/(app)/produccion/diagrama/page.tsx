import { CalendarCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getPanel } from '@/lib/session'
import { MESES, hoyLima } from '@/lib/format'
import { sp, cn } from '@/lib/utils'
import { PageHeader, Section, FilterBar, FilterField } from '@/components/ui'
import { PrintButton } from '@/components/print-button'
import { GrillaDiagrama } from './grilla'
import { ESTILO } from './estilo'

export const metadata = { title: 'Diagrama de producción' }

export default async function DiagramaPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const mes = sp(params, 'mes', hoyLima().slice(0, 7))
  const [y, m] = mes.split('-').map(Number)
  const hasta = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const supabase = await createClient()
  const [panel, { data: funciones }, { data: marcas }] = await Promise.all([
    getPanel(),
    supabase.from('prod_funcion').select('id, nombre, frecuencia').eq('activo', true).order('orden'),
    supabase.from('prod_funcion_marca').select('funcion_id, fecha, estado').gte('fecha', `${mes}-01`).lte('fecha', hasta),
  ])
  const mapa = Object.fromEntries((marcas ?? []).map((x) => [`${x.funcion_id}|${x.fecha}`, x.estado]))

  return (
    <>
      <PageHeader title="Diagrama de producción" description={`Responsable: Roly Nuñez Conde · ${MESES[m - 1]} ${y}`} actions={<PrintButton />} />
      <FilterBar>
        <FilterField label="Mes"><input type="month" name="mes" defaultValue={mes} className="field" /></FilterField>
      </FilterBar>
      <Section icon={CalendarCheck} title={`${MESES[m - 1]} ${y}`} bodyClassName="p-0"
        actions={<div className="flex flex-wrap items-center gap-3 text-xs">
          {(['ok', 'proceso', 'no'] as const).map((e) => (
            <span key={e} className="flex items-center gap-1.5"><span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', ESTILO[e].clase)}>{ESTILO[e].texto}</span>
              {e === 'ok' ? 'Completado' : e === 'proceso' ? 'En proceso' : 'No se realizó'}</span>
          ))}
        </div>}>
        <GrillaDiagrama key={mes} mes={mes} funciones={funciones ?? []} marcas={mapa} editable={panel === 'produccion'} hoy={hoyLima()} />
      </Section>
    </>
  )
}
