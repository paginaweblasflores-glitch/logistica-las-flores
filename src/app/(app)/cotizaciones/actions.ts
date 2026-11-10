'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { run, check, must, type ActionResult } from '@/lib/actions'
import { parseLines, num } from '@/lib/lines'

export async function crearCotizacion(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const items = parseLines(fd.get('lineas')).filter((l) => Number(l.cantidad) > 0)
    if (!String(fd.get('titulo') ?? '').trim()) return { error: 'Escriba un título para la cotización.' }
    if (!items.length) return { error: 'Agregue al menos un ítem con cantidad.' }
    const supabase = await createClient()
    const cot = must(await supabase.from('cotizacion').insert({
      titulo: String(fd.get('titulo')).trim(), local_id: fd.get('local') || null, fecha: String(fd.get('fecha')), observacion: fd.get('observacion') || null,
    }).select('id').single())
    check(await supabase.from('cotizacion_item').insert(items.map((l) => ({
      cotizacion_id: cot.id, producto_id: l.producto_id, descripcion: l.descripcion, cantidad: num(l.cantidad), unidad: l.unidad,
    }))))
    revalidatePath('/cotizaciones')
    redirect(`/cotizaciones/${cot.id}`)
  })
}

export async function registrarOferta(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const cotizacion = String(fd.get('cotizacion_id'))
    const proveedor = String(fd.get('proveedor') ?? '')
    if (!proveedor) return { error: 'Seleccione el proveedor.' }
    // { item: { p: precio por unidad del producto, u: precio por unidad suelta (opcional) } } — solo los productos marcados
    const precios = JSON.parse(String(fd.get('precios') ?? '{}')) as Record<string, { p: number | null; u: number | null }>
    const validos = Object.entries(precios).filter(([, v]) => v.p !== null && Number(v.p) >= 0 && (v.u === null || Number(v.u) >= 0))
    if (!validos.length) return { error: 'Ingrese al menos un precio.' }
    const canal = fd.get('canal') === 'en_linea' ? 'en_linea' : 'tienda'
    // las rondas se cuentan por proveedor y forma de compra (Plaza Vea en tienda ≠ Plaza Vea por internet)
    const { data: prev } = await supabase.from('cotizacion_oferta').select('ronda').eq('cotizacion_id', cotizacion).eq('proveedor_id', proveedor)
      .or(canal === 'tienda' ? 'canal.eq.tienda,canal.is.null' : 'canal.eq.en_linea').order('ronda', { ascending: false }).limit(1)
    const ronda = (prev?.[0]?.ronda ?? 0) + 1
    const oferta = must(await supabase.from('cotizacion_oferta').insert({ cotizacion_id: cotizacion, proveedor_id: proveedor, ronda, canal, fecha: String(fd.get('fecha')) }).select('id').single())
    check(await supabase.from('cotizacion_precio').insert(validos.map(([item, v]) => ({ oferta_id: oferta.id, item_id: item, precio_unitario: Number(v.p), precio_unidad: v.u === null ? null : Number(v.u) }))))
    revalidatePath(`/cotizaciones/${cotizacion}`)
    return { message: `Oferta registrada (ronda ${ronda}).` }
  })
}

/**
 * Adjudica producto por producto: cada producto se queda con la oferta elegida (puede ser un proveedor
 * distinto por producto). Luego se genera una compra por cada oferta ganadora.
 */
export async function adjudicar(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const id = String(fd.get('cotizacion_id'))
    const ganadores = JSON.parse(String(fd.get('ganadores') ?? '{}')) as Record<string, string>
    const { data: cot } = await supabase.from('cotizacion').select('estado').eq('id', id).single()
    if (cot?.estado !== 'abierta') return { error: 'Esta cotización ya fue adjudicada o anulada.' }
    const { data: ofertas } = await supabase.from('cotizacion_oferta').select('id, proveedor_id, cotizacion_precio(item_id)').eq('cotizacion_id', id)
    const ofs = (ofertas ?? []) as { id: string; proveedor_id: string; cotizacion_precio: { item_id: string }[] }[]
    const elegidos = Object.entries(ganadores).filter(([, o]) => o)
    if (!elegidos.length) return { error: 'Elija al menos un producto con su proveedor.' }
    for (const [item, oferta] of elegidos) {
      const o = ofs.find((x) => x.id === oferta)
      if (!o || !o.cotizacion_precio.some((p) => p.item_id === item)) return { error: 'Hay un producto marcado con una oferta que no tiene su precio. Revise el cuadro.' }
    }
    for (const [item, oferta] of elegidos) {
      check(await supabase.from('cotizacion_item').update({ oferta_ganadora_id: oferta }).eq('id', item).eq('cotizacion_id', id))
    }
    // si todo lo ganó una sola oferta se registra como antes (proveedor y oferta aprobados)
    const unicas = [...new Set(elegidos.map(([, o]) => o))]
    const proveedores = [...new Set(unicas.map((o) => ofs.find((x) => x.id === o)!.proveedor_id))]
    check(await supabase.from('cotizacion').update({
      estado: 'adjudicada',
      proveedor_aprobado_id: proveedores.length === 1 ? proveedores[0] : null,
      oferta_aprobada_id: unicas.length === 1 ? unicas[0] : null,
    }).eq('id', id))
    revalidatePath('/cotizaciones', 'layout')
    return { message: unicas.length === 1 ? 'Cotización adjudicada. Ya puede generar la compra.' : `Cotización adjudicada a ${unicas.length} proveedores: genere una compra para cada uno.` }
  })
}

/** Requerimiento del almacén: con la cotización adjudicada, «Comprado» crea una compra por proveedor ganador, SIN precios. */
export async function comprarDesdeCotizacion(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const cotizacionId = String(fd.get('cotizacion_id'))
    const { data, error } = await supabase.rpc('fn_comprar_desde_cotizacion', { p_cotizacion: cotizacionId })
    if (error) throw error
    revalidatePath('/cotizaciones', 'layout')
    revalidatePath('/requerimientos', 'layout')
    revalidatePath('/compras', 'layout')
    // lleva a la orden de compra creada; si son varias (una por proveedor), a Órdenes de compra
    const { data: compras } = await supabase.from('compra').select('id').eq('cotizacion_id', cotizacionId).neq('estado', 'anulada')
    redirect(Number(data) === 1 && compras?.length === 1 ? `/compras/${compras[0].id}` : '/compras')
  })
}

/** «Usar estos precios»: carga como oferta la cotización anterior de ese proveedor (los productos que tenga). */
export async function usarCotizacionAnterior(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    // una sola vez por proveedor y forma de compra (si no, cada clic crea otra ronda igual)
    const { count } = await supabase.from('cotizacion_oferta').select('id', { count: 'exact', head: true })
      .eq('cotizacion_id', String(fd.get('cotizacion_id'))).eq('proveedor_id', String(fd.get('proveedor_id')))
      .eq('canal', String(fd.get('canal') ?? 'tienda')).eq('observacion', 'Precios de una cotización anterior')
    if (count) return { error: 'Los precios de este proveedor ya se cargaron en esta cotización.' }
    const { data, error } = await supabase.rpc('fn_oferta_desde_anterior', {
      p_cotizacion: String(fd.get('cotizacion_id')), p_proveedor: String(fd.get('proveedor_id')), p_canal: String(fd.get('canal') ?? 'tienda'),
      // solo los productos marcados para cotizar
      p_items: fd.get('items') ? JSON.parse(String(fd.get('items'))) : null,
    })
    if (error) throw error
    revalidatePath(`/cotizaciones/${String(fd.get('cotizacion_id'))}`)
    return { message: `Se cargaron ${data} precio(s) de la cotización anterior. Puede cotizar de nuevo a quien quiera.` }
  })
}

/** «Usar precios anteriores»: carga de una vez, por cada producto, el precio de su ganador anterior (una oferta por proveedor). */
export async function usarPreciosAnteriores(cotizacionId: string): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const [{ data: ant, error }, { data: ya }] = await Promise.all([
      supabase.rpc('fn_cotizaciones_anteriores', { p_cotizacion: cotizacionId }),
      supabase.from('cotizacion_oferta').select('proveedor_id, canal').eq('cotizacion_id', cotizacionId).eq('observacion', 'Precios de una cotización anterior'),
    ])
    if (error) throw error
    const cargados = new Set((ya ?? []).map((o) => `${o.proveedor_id}|${o.canal ?? 'tienda'}`))
    const grupos = new Map<string, { proveedor: string; canal: string; items: string[] }>()
    for (const a of (ant ?? []) as { item_id: string; proveedor_id: string; canal: string }[]) {
      const k = `${a.proveedor_id}|${a.canal}`
      if (cargados.has(k)) continue
      const g = grupos.get(k) ?? { proveedor: a.proveedor_id, canal: a.canal, items: [] }
      g.items.push(a.item_id)
      grupos.set(k, g)
    }
    if (!grupos.size) return { error: 'Los precios anteriores ya se cargaron.' }
    let n = 0
    for (const g of grupos.values()) {
      const { data, error: e } = await supabase.rpc('fn_oferta_desde_anterior', { p_cotizacion: cotizacionId, p_proveedor: g.proveedor, p_canal: g.canal, p_items: g.items })
      if (e) throw e
      n += Number(data) || 0
    }
    revalidatePath(`/cotizaciones/${cotizacionId}`)
    return { message: `Se cargaron ${n} precio(s) de los ganadores anteriores al cuadro comparativo.` }
  })
}
