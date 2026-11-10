'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { run, check, must, type ActionResult } from '@/lib/actions'
import { toNumber } from '@/lib/utils'

type SB = Awaited<ReturnType<typeof createClient>>
const txt = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()
// fecha y hora escrita en Perú (datetime-local) → con su zona
const conZona = (v: string) => (v ? `${v.length === 16 ? `${v}:00` : v}-05:00` : new Date().toISOString())

/** El proveedor se elige o se escribe: si es nuevo, queda registrado en la lista de Producción. */
async function proveedorId(supabase: SB, nombre: string): Promise<string | null> {
  const n = nombre.trim().toUpperCase()
  if (!n) return null
  const { data } = await supabase.from('prod_proveedor').select('id').ilike('nombre', n).maybeSingle()
  if (data) return data.id
  return must(await supabase.from('prod_proveedor').insert({ nombre: n }).select('id').single()).id
}

/** Una línea del ingreso (como en su cuaderno: «3 sacos papa huayro 288 kg × 1.00»). */
export type LineaIngreso = { producto_id: string; sacos?: string; kilos?: string; cantidad?: string; precio?: string; hueso?: string; grasa?: string; merma?: string }

/**
 * Ingreso de un proveedor: una fecha y hora, un proveedor y su guía, y uno o varios productos.
 * Carnes del kardex (con sus porciones, hueso, grasa o merma) o compras (papa en sacos y kilos, carne pulpa…).
 */
export async function registrarIngreso(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const lineas = (JSON.parse(String(fd.get('lineas') ?? '[]')) as LineaIngreso[]).filter((l) => l.producto_id)
    if (!lineas.length) return { error: 'Agregue al menos un producto.' }
    const { data: prods } = await supabase.from('prod_producto').select('id, nombre, tipo, unidad, porcion').in('id', lineas.map((l) => l.producto_id))
    const num = (v?: string) => (v === undefined || v === '' ? null : toNumber(v))
    const filas = []
    for (const l of lineas) {
      const p = prods?.find((x) => x.id === l.producto_id)
      if (!p) return { error: 'Uno de los productos ya no existe.' }
      const sacos = num(l.sacos), kilos = num(l.kilos), cantidad = num(l.cantidad), precio = num(l.precio)
      if (p.tipo === 'kardex' && !(cantidad && cantidad > 0)) return { error: `${p.nombre}: escriba cuántos ${p.porcion ?? 'unidades'} entraron.` }
      if (p.tipo === 'compra' && p.unidad === 'KG' && !(kilos && kilos > 0)) return { error: `${p.nombre}: escriba los kilos que llegaron.` }
      if (p.tipo === 'compra' && p.unidad === 'UND' && !(cantidad && cantidad > 0)) return { error: `${p.nombre}: escriba la cantidad que llegó.` }
      // el total: kilos × precio por kilo (o unidades × precio por unidad)
      const base = p.unidad === 'KG' ? kilos : cantidad
      const total = precio !== null && base !== null ? Math.round(precio * base * 100) / 100 : null
      filas.push({ producto_id: p.id, sacos, kilos, cantidad, precio, total, hueso: num(l.hueso), grasa: num(l.grasa), merma: num(l.merma) })
    }
    const comun = {
      tipo: 'ingreso', fecha: conZona(txt(fd, 'fecha')), proveedor_id: await proveedorId(supabase, txt(fd, 'proveedor')),
      guia: txt(fd, 'guia').toUpperCase() || null, observacion: txt(fd, 'observacion') || null,
    }
    check(await supabase.from('prod_movimiento').insert(filas.map((f) => ({ ...comun, ...f }))))
    revalidatePath('/produccion', 'layout')
    return { message: filas.length === 1 ? 'Ingreso registrado.' : `Ingreso registrado: ${filas.length} productos.` }
  })
}

/** Salida del kardex por concepto (pérdida, marketing, Santa Elena, cumpleaños…). La venta sale de la venta del día. */
export async function registrarSalida(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const productoId = txt(fd, 'producto'), concepto = txt(fd, 'concepto'), cantidad = toNumber(fd.get('cantidad'))
    if (!productoId) return { error: 'Elija la carne.' }
    if (!concepto) return { error: 'Elija el concepto de la salida.' }
    if (!(cantidad && cantidad > 0)) return { error: 'Escriba la cantidad que salió.' }
    check(await supabase.from('prod_movimiento').insert({
      tipo: 'salida', producto_id: productoId, concepto, cantidad, fecha: conZona(txt(fd, 'fecha')), observacion: txt(fd, 'observacion') || null,
    }))
    revalidatePath('/produccion', 'layout')
    return { message: 'Salida registrada en el kardex.' }
  })
}

/** Número que entrega la base (number o texto numérico); null si viene vacío, no es número o no es finito. */
function numeroValido(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string' || !v.trim()) return null
  const n = Number(v.trim())
  return Number.isFinite(n) ? n : null
}

/** Conteo físico: queda con el saldo del sistema de ese momento para ver la diferencia. */
export async function registrarConteo(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const productoId = txt(fd, 'producto'), contado = toNumber(fd.get('contado'))
    if (!productoId) return { error: 'Elija la carne.' }
    if (contado === null || contado < 0) return { error: 'Escriba lo que contó.' }
    // el saldo del kardex tiene que leerse bien: si falla, no se guarda un conteo con una diferencia falsa
    const { data: s, error: errorSaldo } = await supabase.from('v_prod_saldo').select('saldo').eq('producto_id', productoId).maybeSingle()
    const saldo = errorSaldo || !s ? null : numeroValido(s.saldo)
    if (saldo === null) return { error: 'No se pudo leer el saldo del kardex de esta carne. El conteo no se guardó; vuelva a intentarlo.' }
    check(await supabase.from('prod_conteo').insert({ producto_id: productoId, contado, saldo, observacion: txt(fd, 'observacion') || null }))
    revalidatePath('/produccion', 'layout')
    const dif = Math.round((contado - saldo) * 1000) / 1000
    return { message: dif === 0 ? 'Conteo registrado: cuadra con el kardex.' : `Conteo registrado: diferencia de ${dif > 0 ? '+' : ''}${dif} con el kardex.` }
  })
}

/** Anula un ingreso o salida escrito a mano (los de la venta del día se corrigen en la venta). */
export async function anularMovimiento(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const motivo = txt(fd, 'motivo')
    if (!motivo) return { error: 'Escriba el motivo.' }
    const { data: m } = await supabase.from('prod_movimiento').select('venta_id, observacion').eq('id', txt(fd, 'id')).single()
    if (!m) return { error: 'No existe ese registro.' }
    if (m.venta_id) return { error: 'Esta salida viene de la venta del día: corríjala en «Venta del día».' }
    check(await supabase.from('prod_movimiento').update({ anulado: true, observacion: [m.observacion, `ANULADO: ${motivo}`].filter(Boolean).join(' · ') }).eq('id', txt(fd, 'id')))
    revalidatePath('/produccion', 'layout')
    return { message: 'Registro anulado.' }
  })
}

/** Venta del día: los platos de la hojita (dos hojas que se suman); descuenta solo del kardex. */
export async function guardarVenta(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const fecha = txt(fd, 'fecha')
    if (!fecha) return { error: 'Elija la fecha.' }
    const lineas = JSON.parse(String(fd.get('lineas') ?? '[]')) as { plato_id: string; hoja1: number; hoja2: number }[]
    must(await supabase.rpc('fn_prod_guardar_venta', { p_fecha: fecha, p_lineas: lineas, p_observacion: txt(fd, 'observacion') || null }))
    revalidatePath('/produccion', 'layout')
    return { message: 'Venta del día guardada y descontada del kardex.' }
  })
}

/** Diagrama: marca una función en un día (OK / en proceso / no se realizó) o la deja vacía. */
export async function marcarFuncion(funcionId: string, fecha: string, estado: 'ok' | 'proceso' | 'no' | null): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    if (estado) check(await supabase.from('prod_funcion_marca').upsert({ funcion_id: funcionId, fecha, estado }))
    else check(await supabase.from('prod_funcion_marca').delete().eq('funcion_id', funcionId).eq('fecha', fecha))
    revalidatePath('/produccion/diagrama')
    return { ok: true }
  })
}

/** Producto propio de Producción (alta o edición). */
export async function guardarProducto(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const nombre = txt(fd, 'nombre').toUpperCase()
    if (!nombre) return { error: 'Escriba el nombre.' }
    const tipo = txt(fd, 'tipo') === 'kardex' ? 'kardex' : 'compra'
    const fila = {
      nombre, tipo, unidad: txt(fd, 'unidad') === 'UND' ? 'UND' : 'KG',
      porcion: tipo === 'kardex' ? (txt(fd, 'porcion').toLowerCase() || 'unidades') : null,
      gramos_porcion: tipo === 'kardex' ? toNumber(fd.get('gramos')) : null,
      usa_sacos: fd.get('usa_sacos') === 'on', hueso_grasa: fd.get('hueso_grasa') === 'on', merma: fd.get('merma') === 'on',
      activo: fd.get('activo') !== 'off',
    }
    const id = txt(fd, 'id')
    if (id) check(await supabase.from('prod_producto').update(fila).eq('id', id))
    else check(await supabase.from('prod_producto').insert(fila))
    revalidatePath('/produccion', 'layout')
    return { message: id ? 'Producto actualizado.' : `Producto ${nombre} creado.` }
  })
}

/** Proveedor de Producción (alta o edición). */
export async function guardarProveedor(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const nombre = txt(fd, 'nombre').toUpperCase()
    if (!nombre) return { error: 'Escriba el nombre del proveedor.' }
    const fila = { nombre, telefono: txt(fd, 'telefono') || null }
    const id = txt(fd, 'id')
    if (id) check(await supabase.from('prod_proveedor').update(fila).eq('id', id))
    else check(await supabase.from('prod_proveedor').insert(fila))
    revalidatePath('/produccion', 'layout')
    return { message: id ? 'Proveedor actualizado.' : `Proveedor ${nombre} registrado.` }
  })
}

/** «Enviar reporte a Logística»: deja el reporte del periodo a la vista de Fernanda con fecha y hora. */
export async function enviarReporte(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const desde = txt(fd, 'desde'), hasta = txt(fd, 'hasta')
    if (!desde || !hasta) return { error: 'Elija el periodo.' }
    check(await supabase.from('prod_reporte').insert({ desde, hasta, observacion: txt(fd, 'observacion') || null }))
    revalidatePath('/produccion', 'layout')
    return { message: 'Reporte enviado a Logística.' }
  })
}
