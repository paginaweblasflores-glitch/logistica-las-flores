'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { run, must, type ActionResult } from '@/lib/actions'

/** «Enviar stock del día»: la foto del stock completo de cada almacén elegido llega a Fernanda con fecha y hora. */
export async function enviarStockDia(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const almacenes = fd.getAll('almacen').map(String).filter(Boolean)
    if (!almacenes.length) return { error: 'No hay almacén para enviar.' }
    const supabase = await createClient()
    // un almacén o los dos (con «Todos»): cada envío es independiente, al mismo tiempo
    const r = await Promise.all(almacenes.map((a) => supabase.rpc('fn_enviar_stock_dia', { p_almacen: a })))
    const datos = r.map((x) => must(x) as { productos: number })
    revalidatePath('/', 'layout')
    return { message: `Stock del día enviado a Logística (${datos.reduce((s, d) => s + d.productos, 0)} productos). Ya puede registrar sus movimientos.` }
  })
}
