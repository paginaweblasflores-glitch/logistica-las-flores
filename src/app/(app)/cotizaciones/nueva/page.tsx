import { getAmbito, getLocales } from '@/lib/session'
import { hoyLima } from '@/lib/format'
import { PageHeader, Section } from '@/components/ui'
import { Select } from '@/components/select'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { CotLineas } from './lineas'
import { crearCotizacion } from '../actions'

export const metadata = { title: 'Nueva cotización' }

export default async function NuevaCotizacionPage() {
  // el negocio por su nombre (con el RUC no cabía en el campo)
  const [{ local }, locales] = await Promise.all([getAmbito(), getLocales()])
  return (
    <>
      <PageHeader title="Nueva solicitud de cotización" back={{ href: '/cotizaciones', label: 'Cotizaciones' }} />
      <ActionForm action={crearCotizacion} className="space-y-5">
        {/* mismo orden que los demás formularios: primero los datos, luego lo que se cotiza */}
        <Section title="Datos de la cotización">
          <div className="grid gap-4 md:grid-cols-4">
            <label className="md:col-span-2"><span className="label">Título <span className="req">*</span></span><input name="titulo" required className="field" placeholder="Ej. Uniformes para mozos" /></label>
            <label><span className="label">Negocio</span><Select name="local" options={locales.map((l) => ({ id: l.id, nombre: l.nombre }))} defaultValue={local?.id} placeholder="Ambos negocios" /></label>
            <label><span className="label">Fecha</span><input type="date" name="fecha" defaultValue={hoyLima()} className="field" /></label>
          </div>
          <label className="mt-4 block"><span className="label">Condiciones / observación <span className="font-normal normal-case text-subtle">(opcional)</span></span><input name="observacion" className="field" placeholder="Plazo de entrega, forma de pago, lugar de entrega…" /></label>
        </Section>
        <Section title="Ítems a cotizar">
          <CotLineas />
        </Section>
        <div className="flex justify-end"><SubmitButton>Crear cotización</SubmitButton></div>
      </ActionForm>
    </>
  )
}
