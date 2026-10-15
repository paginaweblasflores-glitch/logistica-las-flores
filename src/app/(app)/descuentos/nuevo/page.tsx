import { getAmbito } from '@/lib/session'
import { getLocalesOpc, getPersonal } from '@/lib/queries'
import { hoyLima } from '@/lib/format'
import { PageHeader, Section } from '@/components/ui'
import { Select } from '@/components/select'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { DescLineas } from './lineas'
import { crearDescuentoManual } from '../actions'

export const metadata = { title: 'Nuevo descuento' }

export default async function NuevoDescuentoPage() {
  const { local } = await getAmbito()
  const [locales, personal] = await Promise.all([getLocalesOpc(), getPersonal()])
  return (
    <>
      <PageHeader title="Descuento manual" back={{ href: '/descuentos', label: 'Descuentos' }}
        description="Para faltantes de caja o de bebidas detectados fuera de un conteo. Los descuentos de conteos y roturas se generan automáticamente." />
      <ActionForm action={crearDescuentoManual} className="space-y-5">
        <Section title="Datos y detalle del descuento">
          <div className="grid gap-4 md:grid-cols-4">
            <label><span className="label">Negocio *</span><Select name="local" options={locales} defaultValue={local?.id} required placeholder="—" /></label>
            <label><span className="label">Colaborador *</span><Select name="personal" options={personal} required placeholder="—" agregar="personal" /></label>
            <label><span className="label">Origen</span><Select name="origen" required defaultValue="caja" options={[{ id: 'caja', nombre: 'Caja' }, { id: 'bebidas', nombre: 'Bebidas' }, { id: 'manual', nombre: 'Otro' }]} /></label>
            <label><span className="label">Fecha</span><input type="date" name="fecha" defaultValue={hoyLima()} className="field" /></label>
            <label className="md:col-span-4"><span className="label">Motivo / observación</span><input name="observacion" className="field" /></label>
          </div>
          <div className="mt-6"><DescLineas /></div>
        </Section>
        <div className="flex justify-end"><SubmitButton>Registrar descuento</SubmitButton></div>
      </ActionForm>
    </>
  )
}
