import { getAlmacenActivo, soloConsulta } from '@/lib/session'
import { ElegirAlmacen } from '@/components/elegir-almacen'
import { PageHeader, Section } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { LineasRequerimientoAlmacen } from './lineas-almacen'
import { crearRequerimientoAlmacen } from '../actions'

/** Requerimiento del almacén: su lista de productos para reponer stock (sin área, firma ni precio). */
export async function NuevoRequerimientoAlmacen() {
  const sel = await getAlmacenActivo()
  if (soloConsulta(sel) || !sel.actual) return <ElegirAlmacen titulo="Nuevo requerimiento" volver={{ href: '/requerimientos', label: 'Requerimientos' }} />
  return (
    <>
      <PageHeader title={`Nuevo requerimiento · ${sel.actual.corto}`} back={{ href: '/requerimientos', label: 'Requerimientos' }}
        description="La lista de productos que necesita su almacén." />
      <ActionForm action={crearRequerimientoAlmacen} className="space-y-5">
        <input type="hidden" name="almacen" value={sel.actual.id} />
        {/* todo el requerimiento en una sola tarjeta: los productos y, debajo, para cuándo y la observación */}
        <Section title="Productos que necesita">
          <LineasRequerimientoAlmacen almacenId={sel.actual.id} />
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label><span className="label">¿Para cuándo lo necesita? <span className="font-normal normal-case text-subtle">(opcional)</span></span><input type="date" name="fecha_requerida" className="field" /></label>
            <label className="md:col-span-2"><span className="label">Observación</span><input name="observacion" className="field" /></label>
          </div>
        </Section>
        <div className="flex justify-end"><SubmitButton confirm="¿Enviar el requerimiento a Logística?">Enviar a Logística</SubmitButton></div>
      </ActionForm>
    </>
  )
}
