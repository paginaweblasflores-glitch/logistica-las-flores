'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { run, check, must, type ActionResult } from '@/lib/actions'

export async function guardarVenta(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const localId = String(fd.get('local_id') ?? ''), fecha = String(fd.get('fecha') ?? '')
    if (!localId || !fecha) return { error: 'Indique negocio y fecha.' }
    const items = JSON.parse(String(fd.get('items') ?? '{}')) as Record<string, { salon: string; llevar: string }>
    const venta = must(await supabase.from('venta_vianda').upsert(
      { local_id: localId, fecha, registrado_por: fd.get('registrado_por') || null, observacion: fd.get('observacion') || null },
      { onConflict: 'local_id,fecha' },
    ).select('id').single())
    const filas = Object.entries(items).map(([item_id, v]) => ({
      venta_id: venta.id, item_id, cantidad_salon: Number(v.salon) || 0, cantidad_llevar: Number(v.llevar) || 0,
    }))
    check(await supabase.from('venta_vianda_detalle').upsert(filas, { onConflict: 'venta_id,item_id' }))
    let msg = 'Venta del día guardada.'
    if (fd.get('generar') === 'on') {
      const almacen = String(fd.get('almacen') ?? '')
      if (!almacen) return { error: 'Seleccione la cocina (almacén de carnes) para generar la salida.' }
      check(await supabase.rpc('fn_generar_salida_viandas', { p_venta: venta.id, p_almacen: almacen }))
      msg = 'Venta guardada y salida registrada en el Kardex de carnes.'
    }
    revalidatePath('/carnes')
    return { message: msg }
  })
}
