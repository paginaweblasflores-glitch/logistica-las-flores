'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { run, check, type ActionResult } from '@/lib/actions'
import { parseLines, num, fechaRegistro, enUnidadDelProducto } from '@/lib/lines'

/** Entrada o salida registrada por el almacén (con su número E-/S- propio). La salida a un área imprime su ticket. */
export async function registrarEntradaSalida(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const sentido = fd.get('sentido') === 'entrada' ? 'entrada' : 'salida'
    const crudas = parseLines(fd.get('lineas')).filter((l) => l.producto_id && Number(l.cantidad) > 0)
    if (crudas.some((l) => enUnidadDelProducto(l).sinEquivalencia)) return { error: 'Indique cuánto trae cada unidad (por ejemplo «1 caja = 6 BOT»).' }
    // cantidad (y costo) en la unidad del producto; si se escribió en cajas, paquetes…, queda anotado cómo
    const lineas = crudas.map((l) => {
      const u = enUnidadDelProducto(l, 'cantidad', 'costo_unitario')
      return {
        producto_id: l.producto_id, cantidad: u.cantidad, costo_unitario: sentido === 'entrada' && num(l.costo_unitario) !== null ? u.precio : null,
        fecha_vencimiento: sentido === 'entrada' ? l.fecha_vencimiento || null : null,
        observacion: [u.nota, l.observacion].filter(Boolean).join(' · ') || null,
      }
    })
    if (!fd.get('tipo')) return { error: 'Elija el tipo.' }
    if (!fd.get('almacen')) return { error: 'Elija arriba el almacén.' }
    if (!lineas.length) return { error: 'Agregue al menos un producto con cantidad mayor a cero.' }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('fn_registrar_entrada_salida', {
      p_tipo: String(fd.get('tipo')),
      p_almacen: String(fd.get('almacen')),
      p_lineas: lineas,
      p_fecha: fechaRegistro(fd),
      p_area: String(fd.get('area') ?? ''),
      p_recibe: String(fd.get('recibe') ?? ''),
      p_observacion: String(fd.get('observacion') ?? ''),
      p_documento: String(fd.get('documento') ?? ''),
      p_motivo: String(fd.get('motivo') ?? '') || null,
    })
    if (error) throw error
    const r = data as { id: string; nro: string }
    revalidatePath('/inventario', 'layout')
    revalidatePath(`/${sentido}s`, 'layout')
    // la salida a un área sale con su ticket para firmar
    redirect(sentido === 'salida' && fd.get('tipo') === 'salida_consumo' ? `/salidas/${r.id}?imprimir=1` : `/${sentido}s/${r.id}`)
  })
}

export async function anularMovimiento(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    // los registros no se editan ni se borran: se anulan con motivo (solo el almacén que lo registró)
    check(await supabase.rpc('fn_anular_movimiento', { p_movimiento: String(fd.get('id')), p_motivo: String(fd.get('motivo') ?? '') }))
    revalidatePath('/inventario', 'layout')
    revalidatePath('/entradas', 'layout')
    revalidatePath('/salidas', 'layout')
    return { message: 'Movimiento anulado: el stock fue revertido y queda el motivo.' }
  })
}

/** Motivos del ajuste de inventario (lo que explica por qué no cuadraba). */
const MOTIVOS_AJUSTE = ['Faltante', 'Sobrante', 'Error de registro', 'Merma', 'Vencido', 'Otro']

/**
 * «Ajustar» desde Inventario: se escribe la cantidad que hay realmente y el sistema registra solo un ajuste por la
 * diferencia (positivo si sobra, negativo si falta), con su motivo. El stock queda igual a lo contado y el Kardex
 * guarda el ajuste: nunca se edita el número a mano.
 */
export async function ajustarStock(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const producto = String(fd.get('producto_id') ?? ''), almacen = String(fd.get('almacen') ?? '')
    const texto = String(fd.get('contado') ?? '').replace(',', '.').trim()
    const contado = Number(texto)
    const motivo = String(fd.get('motivo') ?? '')
    if (!producto || !almacen) return { error: 'Elija arriba el almacén.' }
    if (texto === '' || !(contado >= 0)) return { error: 'Escriba la cantidad que hay realmente (0 si no hay).' }
    if (!MOTIVOS_AJUSTE.includes(motivo)) return { error: 'Elija el motivo del ajuste.' }
    const supabase = await createClient()
    // la diferencia se calcula con el stock de ESTE momento (no con el que se veía en pantalla)
    const { data: s, error: e } = await supabase.from('stock').select('cantidad').eq('producto_id', producto).eq('almacen_id', almacen).maybeSingle()
    if (e) throw e
    const actual = Number(s?.cantidad ?? 0)
    const diferencia = Math.round((contado - actual) * 10000) / 10000
    if (diferencia === 0) return { error: `El stock ya es ${actual}: no hay nada que ajustar.` }
    const obs = String(fd.get('observacion') ?? '').trim()
    check(await supabase.rpc('fn_registrar_entrada_salida', {
      p_tipo: diferencia > 0 ? 'ajuste_positivo' : 'ajuste_negativo',
      p_almacen: almacen,
      p_lineas: [{ producto_id: producto, cantidad: Math.abs(diferencia), costo_unitario: null, fecha_vencimiento: null, observacion: null }],
      p_fecha: new Date().toISOString(), p_area: '', p_recibe: '', p_documento: 'AJUSTE DE INVENTARIO', p_motivo: null,
      p_observacion: `${motivo}: el sistema tenía ${actual} y se contó ${contado}${obs ? ` · ${obs}` : ''}`,
    }))
    revalidatePath('/inventario', 'layout')
    revalidatePath('/entradas', 'layout')
    revalidatePath('/salidas', 'layout')
    return { message: `Ajustado: ${diferencia > 0 ? 'sobraban' : 'faltaban'} ${Math.abs(diferencia)}. El stock quedó en ${contado}.` }
  })
}
