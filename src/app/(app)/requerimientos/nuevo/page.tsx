import { getAmbito, getPanel } from '@/lib/session'
import { getAreas, getLocalesOpc } from '@/lib/queries'
import { PageHeader, Section, Note } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { ReqLineas } from './lineas'
import { NegocioArea, FirmaInput } from './campos'
import { crearRequerimiento } from '../actions'
import { NuevoRequerimientoAlmacen } from './almacen'
import { Select } from '@/components/select'

export const metadata = { title: 'Nuevo requerimiento' }

export default async function NuevoRequerimientoPage() {
  // el almacén hace SU requerimiento (lista para reponer stock), distinto al de los jefes de área
  const panel = await getPanel()
  if (panel === 'almacen') return <NuevoRequerimientoAlmacen />
  const [{ local }, locales, areas] = await Promise.all([getAmbito(), getLocalesOpc(), getAreas()])
  return (
    <>
      <PageHeader title="Solicitud de requerimiento de bienes y materiales" back={{ href: '/requerimientos', label: 'Requerimientos' }}
        description={panel === 'area' ? 'Llene la solicitud, suba su firma y envíela a Logística. Podrá ver aquí si fue aprobada.' : undefined} />
      <ActionForm action={crearRequerimiento} className="space-y-5">
        <Section title="Solicitud de requerimiento">
          {/* orden estándar: productos → datos → observación */}
          <ReqLineas />
          <p className="mt-3 mb-6 text-xs text-muted">Puede escribir el bien tal cual (por ejemplo “Dron para marketing”) aunque no exista en el almacén. Los bienes escritos a mano no se agregan al inventario.</p>
          <div className="grid gap-4 md:grid-cols-3">
            <NegocioArea locales={locales} areas={areas} localDefault={panel === 'area' ? undefined : local?.id} />
            <label><span className="label">Responsable que solicita *</span><input name="solicitante" required className="field" placeholder="Nombres y apellidos" /></label>
            <label><span className="label">Cargo</span><input name="cargo" className="field" placeholder="Jefe de cocina, administrador…" /></label>
            <label><span className="label">Prioridad</span>
              <Select name="prioridad" defaultValue="normal" required options={[{ id: 'baja', nombre: 'Baja' }, { id: 'normal', nombre: 'Normal' }, { id: 'alta', nombre: 'Alta' }, { id: 'urgente', nombre: 'Urgente' }]} />
            </label>
            <label><span className="label">Fecha en que lo necesita</span><input type="date" name="fecha_requerida" className="field" /></label>
          </div>
          <label className="mt-4 block"><span className="label">Observación general <span className="font-normal normal-case text-subtle">(opcional)</span></span><input name="observacion" className="field" /></label>
          <div className="mt-6"><span className="label">Firma de quien solicita</span><FirmaInput /></div>
        </Section>
        <Note>La fecha y hora de la solicitud se registran solas al enviar. Logística decide qué productos se aprueban y quién firma la aprobación según el monto.</Note>
        <div className="flex justify-end"><SubmitButton confirm="¿Enviar el requerimiento a Logística?">Enviar a Logística</SubmitButton></div>
      </ActionForm>
    </>
  )
}
