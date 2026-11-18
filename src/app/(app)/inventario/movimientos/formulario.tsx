import { AvisoStockDia, estadoStockDia } from '@/components/aviso-stock-dia'
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
import { ahoraLima } from '@/lib/format'

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
  void estadoStockDia()   // precarga: el aviso del stock del día se consulta junto con lo demás
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
  const ahora = ahoraLima()

  return (
    <>
      <PageHeader title={`${titulo} · ${sel.actual.corto}`} back={{ href: ruta, label: entrada ? 'Entradas' : 'Salidas' }} description={ayuda || undefined} />
      <AvisoStockDia compacto />
      <ActionForm action={registrarEntradaSalida} className="space-y-5">
        <input type="hidden" name="sentido" value={sentido} />
        <input type="hidden" name="tipo" value={tipo} />
        {motivo && <input type="hidden" name="motivo" value={motivo} />}
        <input type="hidden" name="almacen" value={sel.actual.id} />
        {/* como se trabaja: primero quién y para qué (área, quien recibe), luego se despachan los productos */}
        <Section title={entrada ? 'Datos de la entrada' : 'Datos de la salida'}>
          {/* el tipo va primero: al cambiarlo se recarga el formulario */}
          <div className="mb-5 max-w-xs">{tabs}</div>
          <div className="grid gap-4 md:grid-cols-3">
            {conArea && (
              <div><span className="label">Área destino <span className="req">*</span></span>
                <ComboInput name="area" opciones={areas ?? []} placeholder="Elija o escriba el área" /></div>
            )}
            {tipo === 'salida_consumo' && (
              <label><span className="label">Entregado a <span className="req">*</span></span><input name="recibe" required className="field" placeholder="Nombre de quien recibe" /></label>
            )}
            {tipo === 'devolucion_proveedor' && (
              <label><span className="label">Documento</span><input name="documento" className="field" placeholder="Guía, nota de crédito…" /></label>
            )}
            <label><span className="label">Fecha y hora</span><input type="datetime-local" name="fecha" defaultValue={ahora} className="field" /><input type="hidden" name="fecha_inicial" value={ahora} /></label>
          </div>
        </Section>
        <Section title="Productos">
          <LineasEntradaSalida almacenId={sel.actual.id} entrada={entrada} />
          <label className="mt-6 block"><span className="label">Observación <span className="font-normal normal-case text-subtle">(opcional)</span></span>
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
