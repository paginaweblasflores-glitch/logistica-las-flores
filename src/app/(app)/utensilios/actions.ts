'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { run, check, must, type ActionResult } from '@/lib/actions'

export async function registrarRotura(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const responsables = fd.getAll('responsables').map(String).filter(Boolean)
    const cantidad = Number(fd.get('cantidad')), precio = Number(fd.get('precio'))
    const localId = String(fd.get('local') ?? '')
    const descripcion = String(fd.get('descripcion') ?? '').trim()
    if (!localId) return { error: 'Seleccione el negocio.' }
    if (!descripcion && !fd.get('producto')) return { error: 'Indique el bien roto o seleccione el producto.' }
    if (!(cantidad > 0)) return { error: 'La cantidad debe ser mayor a cero.' }
    if (!responsables.length) return { error: 'Seleccione al menos un responsable (o a todo el personal del área si fue grupal).' }
    const supabase = await createClient()
    let desc = descripcion
    if (!desc && fd.get('producto')) {
      const { data } = await supabase.from('producto').select('nombre').eq('id', String(fd.get('producto'))).single()
      desc = data?.nombre ?? 'Bien'
    }
    const grupal = responsables.length > 1 && fd.get('grupal') === 'on'
    const rot = must(await supabase.from('rotura').insert({
      fecha: String(fd.get('fecha')), local_id: localId, area_id: fd.get('area') || null, producto_id: fd.get('producto') || null,
      descripcion: desc.toUpperCase(), cantidad, precio_unitario: precio, es_grupal: grupal,
      pct_colaborador: Number(fd.get('pct')) / 100, tipo: String(fd.get('tipo') ?? 'rotura'), observacion: fd.get('observacion') || null,
    }).select('id').single())
    check(await supabase.from('rotura_responsable').insert(responsables.map((p) => ({ rotura_id: rot.id, personal_id: p }))))

    const almacen = String(fd.get('almacen') ?? '')
    if (almacen && fd.get('producto')) {
      check(await supabase.rpc('fn_registrar_movimiento', {
        p_tipo: 'merma', p_almacen: almacen, p_lineas: [{ producto_id: String(fd.get('producto')), cantidad }],
        p_fecha: new Date(`${fd.get('fecha')}T12:00:00-05:00`).toISOString(),
        p_documento: 'ROTURA', p_observacion: `Rotura: ${desc}`,
      }))
    }
    revalidatePath('/utensilios')
    return { message: 'Rotura registrada.' }
  })
}

export async function generarDescuentosRoturas(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const n = check(await supabase.rpc('fn_generar_descuentos_roturas', { p_local: String(fd.get('local')), p_periodo: `${fd.get('periodo')}-01` }))
    revalidatePath('/utensilios')
    revalidatePath('/descuentos')
    return { message: n ? `Se generaron ${n} descuento(s).` : 'No hay roturas pendientes de descontar en ese mes.' }
  })
}
