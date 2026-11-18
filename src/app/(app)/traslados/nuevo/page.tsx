import { AvisoStockDia, estadoStockDia } from '@/components/aviso-stock-dia'
import { getAlmacenes } from '@/lib/queries'
import { ElegirAlmacen } from '@/components/elegir-almacen'
import { getAmbito, getAlmacenActivo, soloConsulta } from '@/lib/session'
import { PageHeader, Section } from '@/components/ui'
import { Select } from '@/components/select'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { TrasladoLineas } from './lineas'
import { enviarTraspaso } from '../actions'
import { ahoraLima } from '@/lib/format'

export const metadata = { title: 'Nuevo traspaso' }

export default async function NuevoTrasladoPage() {
  void estadoStockDia()   // precarga: el aviso del stock del día se consulta junto con lo demás
  const { local } = await getAmbito()
  // traspasos entre almacenes: el otro almacén del mismo negocio (interno) o el almacén del otro negocio
  // una sola consulta: todos los almacenes; los de origen son los del negocio elegido
  const todos = await getAlmacenes(null, ['almacen'])
  const origenes = local?.id ? todos.filter((a) => a.local_id === local.id) : todos
  const ahora = ahoraLima()
  const sel = await getAlmacenActivo()   // sale del almacén elegido arriba; puede ir al otro almacén (traspaso interno) o al otro negocio
  if (soloConsulta(sel)) return <ElegirAlmacen titulo="Nuevo traspaso" volver={{ href: '/traslados', label: 'Traspasos' }} />
  return (
    <>
      <PageHeader title="Nuevo traspaso" back={{ href: '/traslados', label: 'Traspasos' }}
        description="Al enviar, la mercadería sale de su almacén. Queda pendiente hasta que el destino la reciba." />
      <AvisoStockDia compacto />
      <ActionForm action={enviarTraspaso} className="space-y-5">
        <Section title="Productos y datos del envío">
          {/* orden estándar: productos → datos → observación */}
          <div className="mb-6"><TrasladoLineas almacenId={sel.id} /></div>
          <div className="grid gap-4 md:grid-cols-3">
            {sel.actual
              ? <div><span className="label">Sale de</span><input type="hidden" name="origen" value={sel.actual.id} /><p className="field flex items-center bg-canvas font-semibold">{sel.actual.corto}</p></div>
              : <label><span className="label">Sale de <span className="req">*</span></span><Select name="origen" options={origenes} required defaultValue={origenes.length === 1 ? origenes[0].id : undefined} placeholder="Seleccione…" /></label>}
            <label><span className="label">Va a <span className="req">*</span></span><Select name="destino" options={todos.filter((a) => a.id !== sel.id)} required placeholder="Seleccione el almacén de destino…" /></label>
            <label><span className="label">Fecha y hora</span><input type="datetime-local" name="fecha" defaultValue={ahora} className="field" /><input type="hidden" name="fecha_inicial" value={ahora} /></label>
            {/* una sola firma: la de quien recibe (su nombre sale en el ticket y en el PDF) */}
            <label><span className="label">Entregado a <span className="req">*</span></span><input name="recibe" required className="field" placeholder="Nombre de quien recibe" /></label>
          </div>
          <label className="mt-4 block"><span className="label">Motivo <span className="font-normal normal-case text-subtle">(opcional)</span></span><input name="motivo" className="field" placeholder="Reposición, préstamo, evento…" /></label>
        </Section>
        <div className="flex justify-end"><SubmitButton confirm="¿Enviar el traspaso? La mercadería saldrá de su almacén.">Enviar traspaso</SubmitButton></div>
      </ActionForm>
    </>
  )
}
