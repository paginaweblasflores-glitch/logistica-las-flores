'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { run, check, must, type ActionResult } from '@/lib/actions'

export async function crearConteo(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const almacenId = String(fd.get('almacen') ?? '')
    if (!almacenId) return { error: 'Seleccione el almacén a contar.' }
    const { data: alm } = await supabase.from('almacen').select('local_id').eq('id', almacenId).single()
    const conteo = must(await supabase.from('conteo').insert({
      local_id: alm!.local_id,
      almacen_id: almacenId,
      tipo: String(fd.get('tipo') ?? 'almacen'),
      fuente_stock: String(fd.get('fuente_stock') ?? 'sistema'),
      fecha: String(fd.get('fecha')),
      hora: fd.get('hora') || null,
      responsable_conteo_id: fd.get('responsable_conteo') || null,
      responsable_almacen_id: fd.get('responsable_almacen') || null,
      observacion: fd.get('observacion') || null,
    }).select('id').single())
    check(await supabase.rpc('fn_iniciar_conteo', { p_conteo: conteo.id, p_solo_con_stock: fd.get('solo_con_stock') === 'on' }))
    revalidatePath('/conteos')
    redirect(`/conteos/${conteo.id}`)
  })
}

export async function guardarConteo(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const items = JSON.parse(String(fd.get('items') ?? '[]'))
    if (!Array.isArray(items) || !items.length) return { message: 'No hay cambios por guardar.' }
    const supabase = await createClient()
    const id = String(fd.get('conteo_id'))
    const n = check(await supabase.rpc('fn_guardar_conteo', { p_conteo: id, p_items: items }))
    revalidatePath(`/conteos/${id}`)
    return { message: `${n} producto(s) guardados.` }
  })
}

export async function agregarProductoConteo(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const producto = String(fd.get('producto') ?? '')
    if (!producto) return { error: 'Seleccione un producto.' }
    const supabase = await createClient()
    const id = String(fd.get('conteo_id'))
    check(await supabase.rpc('fn_agregar_producto_conteo', { p_conteo: id, p_producto: producto }))
    revalidatePath(`/conteos/${id}`)
    return { message: 'Producto agregado al conteo.' }
  })
}

export async function pasarAVerificacion(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const id = String(fd.get('conteo_id'))
    check(await supabase.from('conteo').update({ estado: 'verificacion' }).eq('id', id))
    revalidatePath(`/conteos/${id}`)
    redirect(`/conteos/${id}?etapa=verificacion`)
  })
}

export async function reabrirConteo(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const id = String(fd.get('conteo_id'))
    check(await supabase.from('conteo').update({ estado: 'abierto' }).eq('id', id))
    revalidatePath(`/conteos/${id}`)
    return { message: 'El conteo volvió a la etapa de conteo.' }
  })
}

export async function cerrarConteo(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const id = String(fd.get('conteo_id'))
    check(await supabase.rpc('fn_cerrar_conteo', {
      p_conteo: id,
      p_generar_ajuste: fd.get('generar_ajuste') === 'on',
      p_generar_descuento: fd.get('generar_descuento') === 'on',
    }))
    revalidatePath('/conteos', 'layout')
    revalidatePath('/inventario', 'layout')
    redirect(`/conteos/${id}?etapa=final`)
  })
}

export async function anularConteo(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    check(await supabase.from('conteo').update({ estado: 'anulado' }).eq('id', String(fd.get('conteo_id'))))
    revalidatePath('/conteos')
    redirect('/conteos')
  })
}
