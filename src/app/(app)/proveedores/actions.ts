'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { run, check, must, type ActionResult } from '@/lib/actions'
import { esTipoProveedor } from '@/lib/proveedor-tipo'
import { resolverOrigen } from '@/lib/listas-abiertas'

function campos(fd: FormData) {
  const s = (k: string) => (String(fd.get(k) ?? '').trim() || null)
  return {
    ruc: s('ruc'), razon_social: String(fd.get('razon_social') ?? '').trim().toUpperCase(), nombre_comercial: s('nombre_comercial'),
    subcategoria: s('subcategoria')?.toUpperCase() ?? null, direccion: s('direccion'), telefono: s('telefono'),
    email: s('email'), contacto: s('contacto'), condiciones_pago: s('condiciones_pago'), forma_pedido: s('forma_pedido'),
    dias_pedido: s('dias_pedido'), banco: s('banco'), titular_cuenta: s('titular_cuenta'), numero_cuenta: s('numero_cuenta'),
    es_transportista: fd.get('es_transportista') === 'on', activo: fd.get('activo') !== 'off', observacion: s('observacion'),
    fecha_registro: s('fecha_registro') ?? undefined,
    tipo: esTipoProveedor(fd.get('tipo')) ? String(fd.get('tipo')) : 'proveedor',
  }
}

export async function guardarProveedor(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const datos = campos(fd)
    if (!datos.razon_social) return { error: 'La razón social es obligatoria.' }
    if (datos.ruc && !/^\d{11}$/.test(datos.ruc)) return { error: 'El RUC debe tener 11 dígitos.' }
    const supabase = await createClient()
    const datosCompletos = { ...datos, ciudad_id: await resolverOrigen(supabase, fd.get('ciudad')) }
    const id = String(fd.get('id') ?? '')
    if (id) {
      check(await supabase.from('proveedor').update(datosCompletos).eq('id', id))
      revalidatePath(`/proveedores/${id}`)
      revalidatePath('/proveedores')
      return { message: 'Proveedor actualizado.' }
    }
    const nuevo = must(await supabase.from('proveedor').insert(datosCompletos).select('id').single())
    revalidatePath('/proveedores')
    redirect(`/proveedores/${nuevo.id}`)
  })
}

export async function agregarContacto(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const proveedor = String(fd.get('proveedor_id'))
    check(await supabase.from('proveedor_contacto').insert({
      proveedor_id: proveedor, local_id: fd.get('local_id') || null, nombre: fd.get('nombre') || null,
      telefono: fd.get('telefono') || null, email: fd.get('email') || null,
    }))
    revalidatePath(`/proveedores/${proveedor}`)
    return { message: 'Contacto agregado.' }
  })
}

export type ProveedorRapido = { id: string; nombre: string; tipo: string }

/**
 * Alta rápida desde la cotización o la compra (sin salir del formulario): tienda en línea,
 * negocio local o proveedor formal. Solo nombre y tipo: el RUC y demás datos se registran en la compra
 * o en la ficha del proveedor si hiciera falta.
 */
export async function crearProveedorRapido(input: { nombre: string; tipo: string }):
  Promise<{ ok: true; proveedor: ProveedorRapido } | { ok: false; error: string }> {
  try {
    const nombre = input.nombre.trim().toUpperCase()
    const tipo = esTipoProveedor(input.tipo) ? input.tipo : 'proveedor'
    if (nombre.length < 2) return { ok: false, error: 'Escriba el nombre del proveedor o tienda.' }
    const supabase = await createClient()
    const { data: existe } = await supabase.from('proveedor').select('id, razon_social, tipo').ilike('razon_social', nombre).maybeSingle()
    if (existe) return { ok: true, proveedor: { id: existe.id, nombre: existe.razon_social, tipo: existe.tipo } }
    let ciudad: string | null = null
    if (tipo === 'tienda_en_linea') {
      const { data: c } = await supabase.from('ciudad').select('id').eq('nombre', 'En línea').maybeSingle()
      ciudad = c?.id ?? null
    }
    const { data, error } = await supabase.from('proveedor').insert({
      razon_social: nombre, nombre_comercial: nombre, tipo, ciudad_id: ciudad,
      forma_pedido: tipo === 'tienda_en_linea' ? 'Compra en línea' : tipo === 'cadena' ? 'En tienda o por internet' : null,
    }).select('id, razon_social, tipo').single()
    if (error) return { ok: false, error: error.message }
    revalidatePath('/proveedores')
    return { ok: true, proveedor: { id: data.id, nombre: data.razon_social, tipo: data.tipo } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
