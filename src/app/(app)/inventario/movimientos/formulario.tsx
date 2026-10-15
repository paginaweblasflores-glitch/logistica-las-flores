import { AvisoStockDia } from '@/components/aviso-stock-dia'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getAlmacenActivo, soloConsulta } from '@/lib/session'
import { ElegirAlmacen } from '@/components/elegir-almacen'
import { TIPOS_MANUALES, type Sentido } from '@/lib/movimientos'
import { PageHeader, Section } from '@/components/ui'
import { ComboInput } from '@/components/combo-input'
import type { TipoOpc } from '@/components/tipo-movimiento'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { LineasEntradaSalida } from './lineas-es'
import { registrarEntradaSalida } from './actions'

/** Tipos que se eligen en «Tipo de entrada / salida»: los fijos y los que el almacén escribió antes («Donación»…) */
export async function opcionesTipo(sentido: Sentido, fijos: TipoOpc[]) {
  const supabase = await createClient()
  const { data } = await supabase.from('motivo').select('nombre').like('codigo', sentido === 'entrada' ? 'TIPO-E-%' : 'TIPO-S-%').eq('activo', true).order('nombre')
  return [...fijos, ...(data ?? []).map((m) => ({ valor: `otro:${m.nombre}`, nombre: m.nombre }))]
}

/** Formulario de una entrada (sobrante u otra) o salida (a un área, merma, devolución a proveedor, faltante). */
export async function FormularioEntradaSalida({ sentido, tipo, tabs, motivo }: { sentido: Sentido; tipo: string; tabs: React.ReactNode
  /** tipo escrito por el almacén («Donación»…): suma como un sobrante o resta como un faltante, con su nombre */
  motivo?: string }) {
  const entrada = sentido === 'entrada'
  const ruta = entrada ? '/entradas' : '/salidas'
  const titulo = entrada ? 'Nueva entrada' : 'Nueva salida'
  const sel = await getAlmacenActivo()
  if (soloConsulta(sel) || !sel.actual) return <ElegirAlmacen titulo={titulo} volver={{ href: ruta, label: entrada ? 'Entradas' : 'Salidas' }} />
  const { local } = await getAmbito()
  const supabase = await createClient()
  const conArea = tipo === 'salida_consumo'
  const { data: areas } = conArea
    ? await supabase.from('area').select('id, nombre').eq('activo', true).or(`local_id.is.null${local ? `,local_id.eq.${local.id}` : ''}`).order('nombre')
    : { data: [] }
  const ayuda = motivo ? '' : TIPOS_MANUALES[sentido].find((t) => t.codigo === tipo)?.ayuda
  const ahora = new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 16) // hora de Lima

  return (
    <>
      <PageHeader title={`${titulo} · ${sel.actual.corto}`} back={{ href: ruta, label: entrada ? 'Entradas' : 'Salidas' }} description={ayuda || undefined} />
      <AvisoStockDia compacto />
      <ActionForm action={registrarEntradaSalida} className="space-y-5">
        <input type="hidden" name="sentido" value={sentido} />
        <input type="hidden" name="tipo" value={tipo} />
        {motivo && <input type="hidden" name="motivo" value={motivo} />}
        <input type="hidden" name="almacen" value={sel.actual.id} />
        <Section title="Productos y datos">
          {/* orden estándar: tipo → productos → datos → observación (el tipo va primero: al cambiarlo se recarga el formulario) */}
          <div className="grid gap-4 md:grid-cols-3">{tabs}</div>
          <div className="mt-5"><LineasEntradaSalida almacenId={sel.actual.id} entrada={entrada} /></div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <label><span className="label">Fecha y hora</span><input type="datetime-local" name="fecha" defaultValue={ahora} className="field" /><input type="hidden" name="fecha_inicial" value={ahora} /></label>
            {conArea && (
              <div><span className="label">Área destino *</span>
                <ComboInput name="area" opciones={areas ?? []} placeholder="Elija o escriba el área" /></div>
            )}
            {tipo === 'salida_consumo' && (
              <label><span className="label">Entregado a *</span><input name="recibe" required className="field" placeholder="Nombre de quien recibe" /></label>
            )}
            {tipo === 'devolucion_proveedor' && (
              <label><span className="label">Documento</span><input name="documento" className="field" placeholder="Guía, nota de crédito…" /></label>
            )}
          </div>
          <label className="mt-4 block"><span className="label">Observación <span className="font-normal normal-case text-subtle">(opcional)</span></span>
            <input name="observacion" className="field" placeholder={tipo === 'merma' ? 'Vencido, malogrado, roto…' : ''} /></label>
        </Section>
        <div className="flex justify-end">
          <SubmitButton confirm={tipo === 'salida_consumo' ? '¿Registrar la salida? Se descontará del stock y se imprimirá el ticket para firmar.' : `¿Registrar la ${sentido}?`}>
            {tipo === 'salida_consumo' ? 'Registrar e imprimir ticket' : `Registrar ${sentido}`}
          </SubmitButton>
        </div>
      </ActionForm>
    </>
  )
}
