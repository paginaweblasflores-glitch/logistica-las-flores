import { getAmbito } from '@/lib/session'
import { getAlmacenes, getPersonal } from '@/lib/queries'
import { hoyLima } from '@/lib/format'
import { PageHeader, Section, Note } from '@/components/ui'
import { Select } from '@/components/select'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { crearConteo } from '../actions'

export const metadata = { title: 'Nuevo conteo' }

export default async function NuevoConteoPage() {
  const { local } = await getAmbito()
  const [almacenes, personal] = await Promise.all([getAlmacenes(local?.id), getPersonal()])
  return (
    <>
      <PageHeader title="Nuevo conteo físico" back={{ href: '/conteos', label: 'Conteos' }}
        description="Paso 1 — Reporte inicial: el sistema toma una foto del stock del almacén en este momento. Luego se registra lo encontrado físicamente." />
      <ActionForm action={crearConteo} className="max-w-3xl space-y-5">
        <Section title="Datos del conteo">
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="label">Almacén / área *</span><Select name="almacen" options={almacenes} placeholder="Seleccione…" required /></label>
            <label><span className="label">Tipo de conteo</span>
              <Select name="tipo" required defaultValue="almacen" options={[{ id: 'almacen', nombre: 'Almacén (quincenal)' }, { id: 'carnes', nombre: 'Carnes (semanal, sábados)' }, { id: 'bebidas', nombre: 'Bebidas de oficina (mensual)' }, { id: 'utensilios', nombre: 'Utensilios / patrimonial' }]} />
            </label>
            <label><span className="label">Fecha *</span><input type="date" name="fecha" defaultValue={hoyLima()} required className="field" /></label>
            <label><span className="label">Hora</span><input type="time" name="hora" className="field" /></label>
            <label><span className="label">Responsable del conteo</span><Select name="responsable_conteo" options={personal} placeholder="—" agregar="personal" /></label>
            <label><span className="label">Responsable del almacén (a quien se descuenta)</span><Select name="responsable_almacen" options={personal} placeholder="—" agregar="personal" /></label>
            <label className="sm:col-span-2"><span className="label">Stock de referencia</span>
              <Select name="fuente_stock" required defaultValue="sistema" options={[{ id: 'sistema', nombre: 'Stock de este sistema (recomendado) — al cerrar genera el ajuste' }, { id: 'objetivo', nombre: 'Stock fijo / par (bebidas de oficinas)' }]} />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="solo_con_stock" defaultChecked className="size-4 accent-brand-600" /> Incluir solo productos con stock distinto de cero
            </label>
            <label className="sm:col-span-2"><span className="label">Observación</span><input name="observacion" className="field" /></label>
          </div>
        </Section>
        <Note>Recomendación: realice el conteo <b>“a ciegas”</b> (sin mirar el stock del sistema) y use los reconteos 2 y 3 solo para los productos con diferencia, como hacía en las columnas “CANTIDAD FÍSICA 2/3/4” del Excel.</Note>
        <div className="flex justify-end"><SubmitButton>Generar reporte inicial</SubmitButton></div>
      </ActionForm>
    </>
  )
}
