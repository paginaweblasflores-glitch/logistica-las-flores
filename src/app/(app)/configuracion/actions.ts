'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getUsuario } from '@/lib/session'
import { run, check, type ActionResult } from '@/lib/actions'

export async function guardarParametros(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith('p_')) continue
      const clave = k.slice(2)
      const esPct = fd.get(`pct_${clave}`) === '1'
      const valor = Number(String(v).replace(',', '.'))
      if (!Number.isFinite(valor)) return { error: `Valor inválido en ${clave}` }
      check(await supabase.from('parametro').update({ valor: esPct ? valor / 100 : valor, updated_at: new Date().toISOString() }).eq('clave', clave))
    }
    revalidatePath('/', 'layout')
    return { message: 'Parámetros actualizados.' }
  })
}

export async function cerrarPeriodo(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const u = await getUsuario()
    const [anio, mes] = String(fd.get('periodo')).split('-').map(Number)
    const accion = String(fd.get('accion'))
    const local = String(fd.get('local'))
    if (accion === 'cerrar') {
      check(await supabase.from('periodo_cierre').upsert({ local_id: local, anio, mes, cerrado: true, cerrado_por: u.id, cerrado_at: new Date().toISOString() }, { onConflict: 'local_id,anio,mes' }))
    } else {
      check(await supabase.from('periodo_cierre').update({ cerrado: false }).eq('local_id', local).eq('anio', anio).eq('mes', mes))
    }
    revalidatePath('/configuracion')
    return { message: accion === 'cerrar' ? 'Periodo cerrado: ya no se pueden registrar ni modificar documentos de ese mes.' : 'Periodo reabierto.' }
  })
}

export async function actualizarUsuario(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    check(await supabase.from('usuario').update({
      rol: String(fd.get('rol')), todos_locales: fd.get('todos_locales') === 'on', activo: fd.get('activo') === 'on',
    }).eq('id', String(fd.get('id'))))
    revalidatePath('/configuracion')
    return { message: 'Usuario actualizado.' }
  })
}

export async function crearCatalogo(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const tipo = String(fd.get('catalogo'))
    const nombre = String(fd.get('nombre') ?? '').trim()
    if (!nombre) return { error: 'Escriba un nombre.' }
    if (tipo === 'area') check(await supabase.from('area').insert({ nombre, local_id: fd.get('local') || null }))
    if (tipo === 'ciudad') check(await supabase.from('ciudad').insert({ nombre }))
    if (tipo === 'motivo') check(await supabase.from('motivo').insert({ nombre, codigo: nombre.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\W+/g, '_'), aplica_a: String(fd.get('aplica_a') ?? 'salida') }))
    if (tipo === 'almacen') check(await supabase.from('almacen').insert({
      nombre, codigo: String(fd.get('codigo') ?? '').trim().toUpperCase(), local_id: String(fd.get('local')), tipo: String(fd.get('tipo_almacen') ?? 'area'),
    }))
    revalidatePath('/configuracion')
    revalidatePath('/', 'layout')
    return { message: 'Registro creado.' }
  })
}

/** Aprobadores de requerimientos: nombre, cargo y tope de monto (vacío = sin tope). */
export async function guardarAprobadores(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const ids = fd.getAll('ap_id').map(String)
    for (const id of ids) {
      const nombre = String(fd.get(`ap_nombre_${id}`) ?? '').trim().toUpperCase()
      const cargo = String(fd.get(`ap_cargo_${id}`) ?? '').trim()
      const topeTxt = String(fd.get(`ap_tope_${id}`) ?? '').replace(',', '.').trim()
      const tope = topeTxt === '' ? null : Number(topeTxt)
      if (!nombre || !cargo) return { error: 'Cada aprobador necesita nombre y cargo.' }
      if (tope !== null && (!Number.isFinite(tope) || tope < 0)) return { error: `Tope inválido para ${nombre}.` }
      check(await supabase.from('requerimiento_aprobador').update({ nombre, cargo, monto_hasta: tope }).eq('id', id))
    }
    revalidatePath('/configuracion')
    revalidatePath('/requerimientos', 'layout')
    return { message: 'Aprobadores actualizados.' }
  })
}
