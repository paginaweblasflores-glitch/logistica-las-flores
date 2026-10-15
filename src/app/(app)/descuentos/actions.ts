'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { run, check, must, type ActionResult } from '@/lib/actions'
import { parseLines, num } from '@/lib/lines'

export async function cambiarEstadoDescuento(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const id = String(fd.get('id'))
    check(await supabase.from('descuento').update({ estado: String(fd.get('estado')) }).eq('id', id))
    revalidatePath('/descuentos', 'layout')
    return { message: 'Estado del descuento actualizado.' }
  })
}

export async function crearDescuentoManual(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const lineas = parseLines(fd.get('lineas')).filter((l) => Number(l.cantidad) > 0 && Number(l.precio) >= 0)
    if (!fd.get('local') || !fd.get('personal')) return { error: 'Seleccione negocio y colaborador.' }
    if (!lineas.length) return { error: 'Agregue al menos un ítem.' }
    const supabase = await createClient()
    const d = must(await supabase.from('descuento').insert({
      local_id: String(fd.get('local')), personal_id: String(fd.get('personal')), origen: String(fd.get('origen') ?? 'manual'),
      fecha: String(fd.get('fecha')), observacion: fd.get('observacion') || null,
    }).select('id').single())
    check(await supabase.from('descuento_detalle').insert(lineas.map((l) => ({
      descuento_id: d.id, producto_id: l.producto_id, descripcion: l.descripcion, cantidad: num(l.cantidad), precio_unitario: num(l.precio),
    }))))
    revalidatePath('/descuentos')
    redirect(`/descuentos/${d.id}`)
  })
}
