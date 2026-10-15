'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { run, check, must, type ActionResult } from '@/lib/actions'
import { parseLines, num, limaIso as iso, fechaRegistro, enUnidadDelProducto } from '@/lib/lines'
import { resolverOrigen, resolverTransportista } from '@/lib/listas-abiertas'

export async function crearCompra(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    // Productos del catálogo o bienes escritos a mano (estos últimos no entran al inventario)
    const lineas = parseLines(fd.get('lineas')).filter((l) => (l.producto_id || String(l.descripcion ?? '').trim()) && Number(l.cantidad) > 0)
    if (!fd.get('almacen')) return { error: 'Seleccione el almacén de destino.' }
    if (!lineas.length) return { error: 'Agregue al menos un producto con cantidad.' }
    if (lineas.some((l) => l.precio === '' || l.precio === null)) return { error: 'Todos los productos deben tener precio unitario.' }
    const accion = String(fd.get('accion') ?? 'borrador')
    const supabase = await createClient()
    // No repetir pasos: sin cotización, un requerimiento genera una sola compra vigente;
    // con cotización repartida, una compra vigente por cada oferta ganadora
    const reqId = String(fd.get('requerimiento_id') ?? '')
    const ofertaId = String(fd.get('oferta_id') ?? '')
    if (ofertaId) {
      const { data: ya } = await supabase.from('compra').select('numero').eq('oferta_id', ofertaId).neq('estado', 'anulada').limit(1)
      if (ya?.length) return { error: `Esta parte de la cotización ya tiene la compra ${ya[0].numero}.` }
      if (reqId) {
        const { data: r } = await supabase.from('requerimiento').select('estado').eq('id', reqId).single()
        if (!['aprobado', 'en_cotizacion', 'comprado'].includes(String(r?.estado))) return { error: `El requerimiento está "${r?.estado}": ya no se le pueden agregar compras.` }
      }
    } else if (reqId) {
      const { data: r } = await supabase.from('requerimiento').select('estado, compra(estado)').eq('id', reqId).single()
      if ((r?.compra as { estado: string }[] | undefined)?.some((c) => c.estado !== 'anulada')) return { error: 'Este requerimiento ya tiene una compra.' }
      if (!['aprobado', 'en_cotizacion'].includes(String(r?.estado))) return { error: 'Solo un requerimiento aprobado pasa a compra.' }
    }
    const { data: alm } = await supabase.from('almacen').select('local_id').eq('id', String(fd.get('almacen'))).single()
    const ciudad = await resolverOrigen(supabase, fd.get('ciudad'))
    const ahora = new Date().toISOString()

    const compra = must(await supabase.from('compra').insert({
      local_id: alm!.local_id,
      almacen_id: String(fd.get('almacen')),
      proveedor_id: fd.get('proveedor') || null,
      ciudad_id: ciudad,
      fecha: String(fd.get('fecha')),
      fecha_aprobacion: accion === 'borrador' ? null : iso(fd.get('fecha_aprobacion')) ?? ahora,
      fecha_compromiso: iso(fd.get('fecha_compromiso')),
      tipo_documento: fd.get('tipo_documento') || null,
      numero_documento: fd.get('numero_documento') || null,
      forma_pago: fd.get('forma_pago') || null,
      requerimiento_id: fd.get('requerimiento_id') || null,
      cotizacion_id: fd.get('cotizacion_id') || null,
      oferta_id: ofertaId || null,
      observacion: fd.get('observacion') || null,
      estado: accion === 'borrador' ? 'borrador' : 'aprobada',
    }).select('id').single())

    check(await supabase.from('compra_detalle').insert(lineas.map((l) => ({
      compra_id: compra.id, producto_id: l.producto_id || null, cantidad_solicitada: num(l.cantidad),
      descripcion: l.producto_id ? null : String(l.descripcion).trim(), unidad_texto: l.producto_id ? null : (l.unidad || 'UND'),
      requerimiento_detalle_id: l.requerimiento_detalle_id || null,
      precio_unitario: num(l.precio), fecha_vencimiento: l.fecha_vencimiento || null,
    }))))

    // el flete no va aquí: se agrega en la ficha de la compra cuando ocurre (agregarTransporte), por tramos

    // primero "comprado"; si se recibe ahora mismo, la recepción lo pasa a "atendido" cuando llegó todo
    if (reqId) {
      await supabase.from('requerimiento').update({ estado: 'comprado' }).eq('id', reqId).in('estado', ['aprobado', 'en_cotizacion'])
    }
    if (accion === 'recibir') {
      check(await supabase.rpc('fn_recibir_compra', { p_compra: compra.id, p_fecha_entrega: iso(fd.get('fecha_entrega')) ?? ahora }))
    }
    revalidatePath('/compras', 'layout')
    redirect(`/compras/${compra.id}`)
  })
}

export async function aprobarCompra(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const id = String(fd.get('id'))
    check(await supabase.from('compra').update({ estado: 'aprobada', fecha_aprobacion: new Date().toISOString() }).eq('id', id))
    revalidatePath(`/compras/${id}`)
    return { message: 'Compra aprobada. El plazo OTIF empieza a contar desde ahora.' }
  })
}

/** Llegada con la boleta: cantidad que llegó y precio unitario real por producto (el almacén, o Logística si es fuera de catálogo). */
export async function recibirCompra(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const id = String(fd.get('id'))
    const lineas = JSON.parse(String(fd.get('lineas') ?? '[]')) as { id: string; cantidad: number; precio: number }[]
    if (lineas.some((l) => !(l.cantidad >= 0) || !(l.precio >= 0))) return { error: 'Revise las cantidades y precios: no pueden ser negativos.' }
    if (lineas.some((l) => l.cantidad > 0 && l.precio === 0)) return { error: 'Falta el precio unitario de algún producto que llegó (cópielo de la boleta).' }
    const total = String(fd.get('total_documento') ?? '').replace(',', '.').trim()
    check(await supabase.rpc('fn_recibir_compra_boleta', {
      p_compra: id, p_fecha: fechaRegistro(fd, 'fecha_entrega'),
      p_tipo_doc: String(fd.get('tipo_documento') ?? ''), p_num_doc: String(fd.get('numero_documento') ?? ''),
      p_total_doc: total ? Number(total) : null, p_lineas: lineas,
    }))
    revalidatePath('/compras', 'layout')
    revalidatePath('/ingresos', 'layout')
    revalidatePath('/entradas', 'layout')
    revalidatePath('/inventario', 'layout')
    return { message: 'Llegada registrada: stock, precios e ingresos actualizados.' }
  })
}

/** Ingreso directo del almacén: compras que el almacén maneja sin requerimiento ni orden de compra. */
export async function registrarIngreso(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const lineas = parseLines(fd.get('lineas')).filter((l) => l.producto_id && Number(l.cantidad) > 0)
    if (!fd.get('almacen')) return { error: 'Seleccione el almacén.' }
    if (!lineas.length) return { error: 'Agregue al menos un producto con cantidad.' }
    if (lineas.some((l) => !(Number(l.precio) > 0))) return { error: 'Todos los productos deben tener su precio unitario (cópielo de la boleta).' }
    if (lineas.some((l) => enUnidadDelProducto(l).sinEquivalencia)) return { error: 'Indique cuánto trae cada unidad (por ejemplo «1 caja = 6 BOT»).' }
    const supabase = await createClient()
    const total = String(fd.get('total_documento') ?? '').replace(',', '.').trim()
    const { data, error } = await supabase.rpc('fn_ingreso_directo', {
      p_almacen: String(fd.get('almacen')), p_proveedor: fd.get('proveedor') || null,
      p_fecha: fechaRegistro(fd),
      p_tipo_doc: String(fd.get('tipo_documento') ?? ''), p_num_doc: String(fd.get('numero_documento') ?? ''),
      p_total_doc: total ? Number(total) : null,
      // cantidad y precio en la unidad del producto (si se escribió en cajas, paquetes…, se convierte)
      p_lineas: lineas.map((l) => { const u = enUnidadDelProducto(l, 'cantidad', 'precio')
        return { producto_id: l.producto_id, cantidad: u.cantidad, precio: u.precio, fecha_vencimiento: l.fecha_vencimiento || null, observacion: u.nota || null } }),
      p_observacion: String(fd.get('observacion') ?? ''),
    })
    if (error) throw error
    revalidatePath('/compras', 'layout')
    revalidatePath('/ingresos', 'layout')
    revalidatePath('/entradas', 'layout')
    revalidatePath('/inventario', 'layout')
    redirect(`/compras/${data}`)
  })
}

export async function anularCompra(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const id = String(fd.get('id'))
    const { data: cp } = await supabase.from('compra').select('estado').eq('id', id).single()
    if (cp?.estado === 'recibida') return { error: 'La compra ya llegó y está cerrada: no se puede anular.' }
    check(await supabase.rpc('fn_anular_compra', { p_compra: id }))
    revalidatePath('/compras', 'layout')
    return { message: 'Compra anulada (se revirtió el ingreso a almacén).' }
  })
}

export async function agregarTransporte(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const costo = num(String(fd.get('costo') ?? ''))
    const compraId = String(fd.get('compra_id') ?? '')
    if (compraId) {
      const { data: cp } = await supabase.from('compra').select('estado').eq('id', compraId).single()
      if (cp?.estado !== 'aprobada') return { error: cp?.estado === 'recibida' ? 'La compra ya llegó y está cerrada: no se agregan más tramos.' : 'El flete se registra cuando la compra está aprobada.' }
    }
    if (!String(fd.get('transportista') ?? '').trim()) return { error: 'Escriba o elija el transportista (Shalom, taxi particular…).' }
    if (!costo || costo <= 0) return { error: 'Ingrese el costo del transporte.' }
    check(await supabase.from('transporte').insert({
      fecha: String(fd.get('fecha')), local_id: fd.get('local_id') || null, compra_id: fd.get('compra_id') || null,
      transportista_id: await resolverTransportista(supabase, fd.get('transportista')),
      ciudad_origen_id: await resolverOrigen(supabase, fd.get('ciudad')), destino: fd.get('destino') || null, costo,
      peso_kg: num(String(fd.get('peso_kg') ?? '')), bultos: num(String(fd.get('bultos') ?? '')),
      documento: fd.get('documento') || null, observacion: fd.get('observacion') || null,
    }))
    revalidatePath('/transporte')
    if (fd.get('compra_id')) revalidatePath(`/compras/${fd.get('compra_id')}`)
    return { message: 'Transporte registrado.' }
  })
}

/** Ingreso directo registrado por error: lo anula (con motivo) el almacén que lo registró; revierte el stock. */
export async function anularIngreso(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const id = String(fd.get('id'))
    check(await supabase.rpc('fn_anular_ingreso', { p_compra: id, p_motivo: String(fd.get('motivo') ?? '') }))
    revalidatePath('/compras', 'layout')
    revalidatePath('/ingresos', 'layout')
    revalidatePath('/entradas', 'layout')
    revalidatePath('/inventario', 'layout')
    return { message: 'Ingreso anulado: el stock fue revertido y queda el motivo.' }
  })
}

/**
 * Llegada de una compra registrada por el almacén como ENTRADA (un solo paso): lo que llegó, precio de la boleta,
 * comprobante y vencimientos. Cierra el requerimiento (completo o parcial) y deja la entrada E-.
 */
export async function registrarEntradaCompra(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const lineas = JSON.parse(String(fd.get('lineas') ?? '[]')) as { detalle_id: string | null; producto_id: string; cantidad: number; precio: number; fecha_vencimiento: string | null }[]
    if (lineas.some((l) => !(l.cantidad >= 0) || !(l.precio >= 0))) return { error: 'Revise las cantidades y precios: no pueden ser negativos.' }
    if (lineas.some((l) => l.cantidad > 0 && !(l.precio > 0))) return { error: 'Falta el precio unitario de algún producto que llegó (cópielo de la boleta).' }
    if (!lineas.some((l) => l.cantidad > 0)) return { error: 'Indique la cantidad que llegó de al menos un producto.' }
    const total = String(fd.get('total_documento') ?? '').replace(',', '.').trim()
    const supabase = await createClient()
    // no llega más de lo pedido (lo agregado que no estaba en el pedido no tiene tope)
    const { data: ped } = await supabase.from('compra_detalle').select('id, cantidad_solicitada').eq('compra_id', String(fd.get('compra')))
    const tope = new Map((ped ?? []).map((d) => [d.id, Number(d.cantidad_solicitada)]))
    if (lineas.some((l) => l.detalle_id && l.cantidad > (tope.get(l.detalle_id) ?? Infinity) + 0.0001)) return { error: 'No puede registrar más de lo que se pidió.' }
    // el proveedor de la boleta (Logística marca «Comprado» sin proveedor)
    const proveedor = String(fd.get('proveedor') ?? '')
    if (!proveedor) return { error: 'Elija el proveedor de la boleta.' }
    check(await supabase.rpc('fn_compra_poner_proveedor', { p_compra: String(fd.get('compra')), p_proveedor: proveedor }))
    const { data, error } = await supabase.rpc('fn_entrada_de_compra', {
      p_compra: String(fd.get('compra')), p_fecha: fechaRegistro(fd),
      p_tipo_doc: String(fd.get('tipo_documento') ?? ''), p_num_doc: String(fd.get('numero_documento') ?? ''),
      p_total_doc: total ? Number(total) : null, p_lineas: lineas,
    })
    if (error) throw error
    const r = data as { movimiento_id: string | null }
    revalidatePath('/entradas', 'layout')
    revalidatePath('/inventario', 'layout')
    revalidatePath('/requerimientos', 'layout')
    revalidatePath('/compras', 'layout')
    redirect(r.movimiento_id ? `/entradas/${r.movimiento_id}` : `/compras/${String(fd.get('compra'))}`)
  })
}
