'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { run, check, must, type ActionResult } from '@/lib/actions'
import { parseLines, num, fechaRegistro } from '@/lib/lines'

/** Enviar: el stock del origen baja al enviar; el traspaso queda pendiente hasta que el destino lo reciba. */
export async function enviarTraspaso(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const lineas = parseLines(fd.get('lineas')).filter((l) => l.producto_id && Number(l.cantidad) > 0)
    const origen = String(fd.get('origen') ?? ''), destino = String(fd.get('destino') ?? '')
    if (!origen || !destino) return { error: 'Seleccione el almacén de origen y el de destino.' }
    if (origen === destino) return { error: 'El origen y el destino deben ser distintos.' }
    if (!lineas.length) return { error: 'Agregue al menos un producto con cantidad.' }
    const supabase = await createClient()
    const r = must(await supabase.rpc('fn_traspaso_enviar', {
      p_origen: origen, p_destino: destino,
      p_lineas: lineas.map((l) => ({ producto_id: l.producto_id, cantidad: num(l.cantidad), unidad_id: l.unidad_elegida || l.unidad_id || null, equivale: l.equivale ? num(l.equivale) : null, observacion: l.observacion || null })),
      p_motivo: String(fd.get('motivo') ?? '').trim() || null,
      p_recibe: String(fd.get('recibe') ?? '').trim() || null,
      p_fecha: fechaRegistro(fd),
    })) as { id: string; numero: string }
    revalidatePath('/traslados', 'layout')
    revalidatePath('/inventario', 'layout')
    redirect(`/traslados/${r.id}?enviado=1`)
  })
}

/** Recibir línea por línea: lo aceptado entra al destino y lo no aceptado vuelve solo al origen. */
export async function recibirTraspaso(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const id = String(fd.get('id'))
    const lineas = JSON.parse(String(fd.get('lineas') ?? '[]')) as { detalle_id: string; cantidad: number }[]
    const supabase = await createClient()
    check(await supabase.rpc('fn_traspaso_recibir', { p_traslado: id, p_lineas: lineas, p_personal: null }))
    revalidatePath('/traslados', 'layout')
    revalidatePath('/inventario', 'layout')
    return { message: 'Traspaso recibido. Lo aceptado ya está en su stock; lo no aceptado volvió al almacén de origen.' }
  })
}

/** Cancelar (el origen, antes de que lo reciban) o rechazar todo (el destino). El stock vuelve al origen. */
export async function cancelarTraspaso(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const id = String(fd.get('id'))
    const motivo = String(fd.get('motivo') ?? '').trim()
    if (!motivo) return { error: 'Indique el motivo.' }
    const supabase = await createClient()
    check(await supabase.rpc('fn_traspaso_cancelar', { p_traslado: id, p_motivo: motivo }))
    revalidatePath('/traslados', 'layout')
    revalidatePath('/inventario', 'layout')
    return { message: 'Traspaso cancelado: el stock volvió al almacén de origen.' }
  })
}
