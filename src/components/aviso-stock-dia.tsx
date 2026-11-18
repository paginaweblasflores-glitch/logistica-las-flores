import { cache } from 'react'
import { Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAlmacenActivo } from '@/lib/session'
import { hoyLima } from '@/lib/format'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { AvisoEnviado } from '@/components/aviso-enviado'
import { enviarStockDia } from '@/app/(app)/almacenes/actions'

/**
 * ¿Ya se envió hoy el stock de los almacenes elegidos? Una sola consulta por request (cache de React).
 * Las pantallas la llaman al inicio («precarga», sin esperar) para que vaya junto con sus demás consultas
 * y no recién cuando se dibuja el aviso.
 */
export const estadoStockDia = cache(async () => {
  const [sel, supabase] = await Promise.all([getAlmacenActivo(), createClient()])
  const almacenes = sel.id ? sel.lista.filter((a) => a.id === sel.id) : sel.lista
  if (!almacenes.length) return { almacenes, data: null, error: null }
  const { data, error } = await supabase.from('reporte_stock').select('almacen_id, enviado_at').eq('fecha', hoyLima()).in('almacen_id', almacenes.map((a) => a.id))
  return { almacenes, data, error }
})

/**
 * Cada mañana, ANTES de cualquier movimiento, el almacén envía a Logística su stock del día (antes un Excel de
 * Tumisoft). Este aviso recuerda enviarlo y, ya enviado, muestra la hora. Con «Todos» envía los dos almacenes.
 */
export async function AvisoStockDia({ compacto = false }: { compacto?: boolean }) {
  const { almacenes, data, error } = await estadoStockDia()
  if (!almacenes.length) return null
  // si no se pudo leer, no se finge que falta enviarlo (volvería a ofrecer el envío)
  if (error) {
    if (compacto) return null
    return <p className="mb-5 rounded-xl border border-line bg-sand px-4 py-2.5 text-sm text-ink-700">No se pudo comprobar si el stock de hoy ya se envió. Recargue la página en un momento.</p>
  }
  const enviados = new Map((data ?? []).map((r) => [r.almacen_id, r.enviado_at as string]))
  const faltan = almacenes.filter((a) => !enviados.has(a.id))
  const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })

  if (!faltan.length) {
    if (compacto) return null
    // solo justo después de enviarlo, por 5 segundos
    const ultimo = almacenes.map((a) => enviados.get(a.id)!).sort().at(-1)!
    return <AvisoEnviado key={ultimo} enviadoAt={ultimo} texto={`Stock del día enviado a Logística: ${almacenes.map((a) => `${a.corto} a las ${hora(enviados.get(a.id)!)}`).join(' · ')}`} />
  }
  return (
    <ActionForm action={enviarStockDia} className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
      {faltan.map((a) => <input key={a.id} type="hidden" name="almacen" value={a.id} />)}
      <span className="min-w-0 flex-1 text-amber-800">
        <b>Envíe el stock de hoy</b> ({faltan.map((a) => a.corto).join(' y ')}) a Logística antes de registrar entradas o salidas.
      </span>
      <SubmitButton size="sm"><Send className="size-3.5" /> Enviar stock del día</SubmitButton>
    </ActionForm>
  )
}
