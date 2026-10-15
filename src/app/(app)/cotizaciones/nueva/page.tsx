import { getAmbito } from '@/lib/session'
import { getLocalesOpc } from '@/lib/queries'
import { hoyLima } from '@/lib/format'
import { PageHeader, Section } from '@/components/ui'
import { Select } from '@/components/select'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { CotLineas } from './lineas'
import { crearCotizacion } from '../actions'

export const metadata = { title: 'Nueva cotización' }

export default async function NuevaCotizacionPage() {
  const { local } = await getAmbito()
  const locales = await getLocalesOpc()
  return (
    <>
      <PageHeader title="Nueva solicitud de cotización" back={{ href: '/cotizaciones', label: 'Cotizaciones' }} />
      <ActionForm action={crearCotizacion} className="space-y-5">
        <Section title="Ítems a cotizar y datos">
          {/* orden estándar: productos → datos → observación */}
          <div className="mb-6"><CotLineas /></div>
          <div className="grid gap-4 md:grid-cols-4">
            <label className="md:col-span-2"><span className="label">Título *</span><input name="titulo" required className="field" placeholder="Ej. Uniformes para mozos" /></label>
            <label><span className="label">Negocio</span><Select name="local" options={locales} defaultValue={local?.id} placeholder="Ambos negocios" /></label>
            <label><span className="label">Fecha</span><input type="date" name="fecha" defaultValue={hoyLima()} className="field" /></label>
          </div>
          <label className="mt-4 block"><span className="label">Condiciones / observación <span className="font-normal normal-case text-subtle">(opcional)</span></span><input name="observacion" className="field" placeholder="Plazo de entrega, forma de pago, lugar de entrega…" /></label>
        </Section>
        <div className="flex justify-end"><SubmitButton>Crear cotización</SubmitButton></div>
      </ActionForm>
    </>
  )
}
