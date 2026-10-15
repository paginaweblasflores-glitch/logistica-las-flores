'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { run, check, must, type ActionResult } from '@/lib/actions'
import { parseLines, num, limaIso } from '@/lib/lines'

export async function crearRequerimiento(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const lineas = parseLines(fd.get('lineas')).filter((l) => Number(l.cantidad) > 0)
    const localId = String(fd.get('local') ?? '')
    if (!localId) return { error: 'Seleccione el negocio.' }
    if (!fd.get('area')) return { error: 'Seleccione el área que solicita.' }
    if (!String(fd.get('solicitante') ?? '').trim()) return { error: 'Indique quién solicita.' }
    if (!lineas.length) return { error: 'Agregue al menos un bien con cantidad.' }
    const fotoValida = (v: unknown) => typeof v === 'string' && v.startsWith('data:image/') && v.length <= 400_000
    if (lineas.some((l) => l.imagen && !fotoValida(l.imagen))) return { error: 'Alguna foto referencial no es válida o pesa más de 300 KB.' }
    const firma = String(fd.get('firma') ?? '')
    if (firma && (!firma.startsWith('data:image/') || firma.length > 400_000)) return { error: 'La firma debe ser una imagen de menos de 300 KB.' }
    const supabase = await createClient()

    // Stock actual en el almacén principal del negocio (se guarda como referencia)
    const ids = lineas.map((l) => l.producto_id).filter(Boolean) as string[]
    const { data: alm } = await supabase.from('almacen').select('id').eq('local_id', localId).eq('es_principal', true).maybeSingle()
    const stock = new Map<string, number>()
    if (ids.length && alm) {
      const { data } = await supabase.from('stock').select('producto_id, cantidad').eq('almacen_id', alm.id).in('producto_id', ids)
      for (const s of data ?? []) stock.set(s.producto_id, Number(s.cantidad))
    }

    const req = must(await supabase.from('requerimiento').insert({
      local_id: localId, area_id: fd.get('area') || null, solicitante: String(fd.get('solicitante')).trim().toUpperCase(),
      cargo_solicitante: String(fd.get('cargo') ?? '').trim() || null, firma_solicitante: firma || null,
      prioridad: String(fd.get('prioridad') ?? 'normal'), fecha_requerida: fd.get('fecha_requerida') || null,
      observacion: fd.get('observacion') || null,
    }).select('id').single())
    check(await supabase.from('requerimiento_detalle').insert(lineas.map((l) => ({
      requerimiento_id: req.id, producto_id: l.producto_id, descripcion: l.descripcion,
      stock_actual: l.producto_id ? stock.get(l.producto_id) ?? 0 : null, cantidad_solicitada: num(l.cantidad),
      precio_estimado: num(l.precio_estimado), motivo: l.motivo || null,
      marca: l.marca || null, area_destino: l.area_destino ? String(l.area_destino).toUpperCase() : null,
      imagen: fotoValida(l.imagen) ? l.imagen : null,
    }))))
    revalidatePath('/requerimientos')
    redirect(`/requerimientos/${req.id}`)
  })
}

/** Requerimiento del ALMACÉN: su lista de productos (de su almacén) para reponer stock. Sin área, firma ni precio. */
export async function crearRequerimientoAlmacen(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const lineas = parseLines(fd.get('lineas'))
      .filter((l) => l.producto_id && Number(l.cantidad) > 0)
      .map((l) => ({ producto_id: l.producto_id, cantidad: num(l.cantidad), unidad_id: l.unidad_elegida || l.unidad_id || null, equivale: l.equivale ? num(l.equivale) : null, observacion: l.observacion || null }))
    if (!fd.get('almacen')) return { error: 'Elija arriba el almacén.' }
    if (!lineas.length) return { error: 'Agregue al menos un producto con cantidad.' }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('fn_crear_requerimiento_almacen', {
      p_almacen: String(fd.get('almacen')), p_lineas: lineas,
      p_fecha_requerida: fd.get('fecha_requerida') || null, p_observacion: String(fd.get('observacion') ?? ''),
    })
    if (error) throw error
    revalidatePath('/requerimientos')
    redirect(`/requerimientos/${data}`)
  })
}

/** Fernanda lo marca «Comprado» (requerimiento del almacén): elige el proveedor; NO pone precios. */
export async function comprarRequerimientoAlmacen(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    // sin proveedor: lo pone el almacén con la boleta al registrar la llegada
    const supabase = await createClient()
    check(await supabase.rpc('fn_comprar_requerimiento_almacen', {
      p_requerimiento: String(fd.get('id')), p_proveedor: null, p_fecha_compromiso: limaIso(fd.get('fecha_compromiso')),
    }))
    revalidatePath('/requerimientos', 'layout')
    revalidatePath('/compras', 'layout')
    return { message: 'Marcado como comprado: el almacén registrará la llegada con la boleta.' }
  })
}

export async function aprobarRequerimiento(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const id = String(fd.get('id'))
    const { data: actual } = await supabase.from('requerimiento').select('estado, origen').eq('id', id).single()
    if (actual?.estado !== 'solicitado') return { error: 'Este requerimiento ya fue revisado: solo puede consultarse.' }
    // { detalle_id: cantidad aprobada } — los productos no marcados llegan con 0 (no aprobados)
    const aprobadas = JSON.parse(String(fd.get('aprobadas') ?? '{}')) as Record<string, number>
    // no se aprueba más de lo pedido
    const { data: sol } = await supabase.from('requerimiento_detalle').select('id, cantidad_solicitada').eq('requerimiento_id', id)
    const tope = Object.fromEntries((sol ?? []).map((d) => [d.id, Number(d.cantidad_solicitada)]))
    if (Object.entries(aprobadas).some(([det, cant]) => Number(cant) > (tope[det] ?? 0) + 0.0001)) return { error: 'No se puede aprobar más de lo que se pidió.' }
    for (const [det, cant] of Object.entries(aprobadas)) {
      check(await supabase.from('requerimiento_detalle').update({ cantidad_aprobada: Math.max(0, Number(cant) || 0) }).eq('id', det))
    }
    const alguno = Object.values(aprobadas).some((c) => Number(c) > 0)
    const aprobador = String(fd.get('aprobador') ?? '')
    // quién lo aprobó: el que firmó la hoja impresa (Fernanda, Betsy o Mijaíl)
    // el de las áreas lleva quién lo aprobó (firmó la hoja); el del almacén solo se aprueba
    if (alguno && !aprobador && actual?.origen !== 'almacen') return { error: 'Elija quién aprobó el requerimiento (quien firmó la hoja).' }
    const { data: ap } = aprobador ? await supabase.from('requerimiento_aprobador').select('nombre').eq('id', aprobador).maybeSingle() : { data: null }
    check(await supabase.from('requerimiento').update({
      estado: alguno ? 'aprobado' : 'rechazado', aprobador_id: aprobador || null,
      aprobado_por: ap?.nombre ?? 'Logística', aprobado_at: new Date().toISOString(),
    }).eq('id', id))
    revalidatePath('/requerimientos', 'layout')
    return { message: alguno ? 'Requerimiento aprobado: ya puede pasar a cotización o compra.' : 'No se aprobó ningún producto: el requerimiento quedó rechazado.' }
  })
}

export async function cambiarEstadoRequerimiento(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const id = String(fd.get('id'))
    const estado = String(fd.get('estado'))
    const { data: actual } = await supabase.from('requerimiento').select('estado').eq('id', id).single()
    if (estado === 'atendido' && actual?.estado !== 'aprobado') return { error: 'Solo un requerimiento aprobado puede marcarse como atendido sin compra.' }
    const extra: Record<string, unknown> = { estado }
    if (estado === 'atendido') extra.atendido_at = new Date().toISOString()
    check(await supabase.from('requerimiento').update(extra).eq('id', id))
    revalidatePath('/requerimientos', 'layout')
    return { message: 'Estado actualizado.' }
  })
}

export async function cotizarRequerimiento(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const id = String(fd.get('id'))
    const { data: est } = await supabase.from('requerimiento').select('estado').eq('id', id).single()
    if (est?.estado !== 'aprobado') return { error: 'Solo se cotiza un requerimiento aprobado que aún no pasó a cotización ni compra.' }
    const { data: r } = await supabase.from('requerimiento')
      .select('local_id, numero, requerimiento_detalle(id, producto_id, descripcion, cantidad_solicitada, cantidad_aprobada, cantidad_pedida, pedida:unidad_pedido_id(nombre), producto:producto_id(unidad:unidad_id(codigo)))')
      .eq('id', id).single()
    const cot = must(await supabase.from('cotizacion').insert({ requerimiento_id: id, local_id: r!.local_id, titulo: `Requerimiento ${r!.numero}` }).select('id').single())
    type D = { id: string; producto_id: string | null; descripcion: string; cantidad_solicitada: number; cantidad_aprobada: number | null
      cantidad_pedida: number | null; pedida: { nombre: string } | null; producto: { unidad: { codigo: string } } | null }
    // se cotiza en la unidad en que se pidió (3 Saco): factor = unidades del producto por cada una
    const factor = (d: D) => (Number(d.cantidad_pedida) > 0 && d.pedida && Number(d.cantidad_pedida) !== Number(d.cantidad_solicitada) ? Number(d.cantidad_solicitada) / Number(d.cantidad_pedida) : 1)
    // Solo lo aprobado pasa a cotización (si aún no se aprobó, se cotiza lo solicitado)
    check(await supabase.from('cotizacion_item').insert(((r!.requerimiento_detalle ?? []) as unknown as D[]).filter((d) => d.cantidad_aprobada === null || Number(d.cantidad_aprobada) > 0).map((d) => ({
      cotizacion_id: cot.id, requerimiento_detalle_id: d.id, producto_id: d.producto_id, descripcion: d.descripcion,
      cantidad: d.cantidad_aprobada ?? d.cantidad_solicitada, unidad: d.producto?.unidad.codigo ?? 'UND',
      ...(factor(d) !== 1 ? { factor: factor(d), unidad_pedido: d.pedida!.nombre, cantidad_pedida: Math.round(Number(d.cantidad_aprobada ?? d.cantidad_solicitada) / factor(d) * 10000) / 10000 } : {}),
    }))))
    check(await supabase.from('requerimiento').update({ estado: 'en_cotizacion' }).eq('id', id))
    revalidatePath('/requerimientos', 'layout')
    redirect(`/cotizaciones/${cot.id}`)
  })
}
