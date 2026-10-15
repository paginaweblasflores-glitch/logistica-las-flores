'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { run, check, must, type ActionResult } from '@/lib/actions'

export async function guardarProducto(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const s = (k: string) => String(fd.get(k) ?? '').trim() || null
    const nombre = s('nombre')?.toUpperCase()
    if (!nombre) return { error: 'El nombre es obligatorio.' }
    if (!s('unidad')) return { error: 'Seleccione la unidad de medida.' }
    // «Otra…»: la unidad escrita queda guardada para la próxima vez (o se usa la que ya existe con ese nombre)
    const unidad = s('unidad') === 'otra'
      ? String(must(await supabase.rpc('fn_unidad_nueva', { p_nombre: s('unidad_nueva') ?? '' })))
      : s('unidad')!
    const precio = s('costo_referencia')
    // el tipo lo pone la base según la categoría; el código lo pone el sistema (correlativo)
    const datos = {
      nombre, descripcion: s('descripcion'), categoria_id: s('categoria'), unidad_id: unidad, marca: s('marca'), presentacion: s('presentacion'),
      controla_lote: true,   // todos con FIFO: cada llegada es un lote y sale primero lo más antiguo
      // empaque (saco, caja…): cuánto trae cada uno; las unidades de medida no lo llevan
      contenido: fd.has('contenido') && Number(s('contenido')) > 0 ? Number(s('contenido')) : null,
      contenido_unidad_id: fd.has('contenido') && Number(s('contenido')) > 0 ? s('contenido_unidad') : null,
      ...(precio !== null ? { costo_referencia: Number(precio) } : {}),
    }
    // la cantidad inicial lleva su fecha de vencimiento (opcional: lo que no vence la deja vacía)
    const vence = s('fecha_vencimiento')
    const id = s('id')
    if (id) {
      const { data: hecho, error } = await supabase.from('producto').update(datos).eq('id', id).select('id')
      if (error) throw error
      // sin filas = no tiene permiso (Logística solo consulta)
      if (!hecho?.length) return { error: 'No puede editar este producto: lo administra el responsable del almacén de su negocio.' }
      // primera vez: la cantidad que tiene hoy en el almacén elegido (entrada «Producto nuevo», una sola vez)
      const cantidad = Number(s('cantidad') ?? 0)
      const almacen = s('almacen')
      let extra = ''
      if (almacen && cantidad > 0) {
        const r = must(await supabase.rpc('fn_inventario_inicial', { p_almacen: almacen, p_lineas: [{ producto_id: id, cantidad, precio: precio ? Number(precio) : null, fecha_vencimiento: vence }] })) as { registrados: number; omitidos: number }
        extra = r.registrados ? ' Cantidad registrada: ya no se cambia aquí (cambia con ingresos, salidas, traspasos o conteos).' : ' La cantidad ya estaba registrada: no se cambió.'
        revalidatePath('/inventario', 'layout')
      }
      revalidatePath(`/productos/${id}`)
      revalidatePath('/productos')
      return { message: `Producto actualizado.${extra}` }
    }
    // Alta: en el almacén elegido arriba, con el siguiente código de ese almacén
    const negocios = fd.getAll('negocio').map(String).filter(Boolean)
    const almacen = s('almacen')
    if (!negocios.length || !almacen) return { error: 'Elija arriba el almacén donde va el producto.' }
    const cantidad = Number(s('cantidad') ?? 0)
    if (!(cantidad >= 0)) return { error: 'La cantidad no puede ser negativa.' }
    const n = must(await supabase.rpc('fn_siguiente_numero', { p_serie: 'PROD' }))
    const nuevo = must(await supabase.from('producto').insert({ ...datos, codigo: `P-${String(n).padStart(5, '0')}` }).select('id').single())
    check(await supabase.from('producto_local').upsert(negocios.map((local_id) => ({ producto_id: nuevo.id, local_id })), { onConflict: 'producto_id,local_id', ignoreDuplicates: true }))
    // stock mínimo (opcional): desde ahí avisa la campanita del almacén
    const minimo = Math.max(0, Number(s('stock_minimo') ?? 0) || 0)
    // vencimiento: sin FIFO queda en el producto; con FIFO va al lote de la cantidad inicial. Días de aviso: por defecto 30
    check(await supabase.from('producto_almacen').upsert({ producto_id: nuevo.id, almacen_id: almacen, stock_minimo: minimo,
      fecha_vencimiento: vence, dias_aviso_vencimiento: diasAviso(s('dias_aviso_vencimiento')) },
      { onConflict: 'producto_id,almacen_id', ignoreDuplicates: true }))
    // la cantidad que tiene hoy: entrada «Producto nuevo» (una sola vez)
    if (cantidad > 0) {
      check(await supabase.rpc('fn_inventario_inicial', { p_almacen: almacen, p_lineas: [{ producto_id: nuevo.id, cantidad, precio: precio ? Number(precio) : null, fecha_vencimiento: vence }] }))
    }
    revalidatePath('/productos')
    redirect(`/productos/${nuevo.id}`)
  })
}

/** Agrega al almacén elegido un producto que ya existe en el catálogo principal (recibe el código de ese almacén). */
async function agregarAlAlmacen(supabase: Awaited<ReturnType<typeof createClient>>, productoId: string, almacenId: string) {
  check(await supabase.from('producto_almacen').upsert({ producto_id: productoId, almacen_id: almacenId, stock_minimo: 0 }, { onConflict: 'producto_id,almacen_id', ignoreDuplicates: true }))
}

/** Días de anticipación del aviso de vencimiento: de 1 a 365, por defecto 30 */
function diasAviso(v: string | null | undefined) {
  const n = Math.round(Number(v))
  return n >= 1 && n <= 365 ? n : 30
}

export async function guardarParametrosAlmacen(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const producto = String(fd.get('producto_id'))
    const filas = JSON.parse(String(fd.get('filas') ?? '[]')) as { almacen_id: string; stock_minimo: string; stock_maximo: string; stock_objetivo: string; ubicacion: string
      fecha_vencimiento?: string; dias_aviso_vencimiento?: string }[]
    for (const f of filas) {
      const d = f.dias_aviso_vencimiento
      if (d !== undefined && d !== '' && !(Number(d) >= 1 && Number(d) <= 365)) return { error: 'Los días de aviso del vencimiento van de 1 a 365.' }
    }
    const upserts = filas.filter((f) => f.stock_minimo !== '' || f.stock_maximo !== '' || f.stock_objetivo !== '' || f.ubicacion !== '' || f.fecha_vencimiento || f.dias_aviso_vencimiento !== undefined).map((f) => ({
      producto_id: producto, almacen_id: f.almacen_id, stock_minimo: Number(f.stock_minimo || 0),
      stock_maximo: f.stock_maximo === '' ? null : Number(f.stock_maximo), stock_objetivo: f.stock_objetivo === '' ? null : Number(f.stock_objetivo),
      ubicacion: f.ubicacion || null,
      // solo el almacén los envía (Logística no ve vencimientos): si no vienen, no se tocan
      ...(f.dias_aviso_vencimiento !== undefined ? { fecha_vencimiento: f.fecha_vencimiento || null, dias_aviso_vencimiento: diasAviso(f.dias_aviso_vencimiento) } : {}),
    }))
    if (upserts.length) check(await supabase.from('producto_almacen').upsert(upserts, { onConflict: 'producto_id,almacen_id' }))
    revalidatePath(`/productos/${producto}`)
    revalidatePath('/inventario')
    return { message: 'Parámetros de stock guardados.' }
  })
}

const TIPOS_FOTO: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }

/** Sube o reemplaza la foto referencial del producto (bucket público "productos", máx. 2 MB). */
export async function guardarFotoProducto(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const id = String(fd.get('producto_id'))
    const archivo = fd.get('foto')
    if (fd.get('quitar') === '1') {
      check(await supabase.from('producto').update({ imagen_url: null }).eq('id', id))
      revalidatePath(`/productos/${id}`)
      return { message: 'Foto quitada.' }
    }
    if (!(archivo instanceof File) || archivo.size === 0) return { error: 'Seleccione una imagen.' }
    const ext = TIPOS_FOTO[archivo.type]
    if (!ext) return { error: 'Formato no permitido: use PNG, JPG, WEBP o GIF.' }
    if (archivo.size > 2 * 1024 * 1024) return { error: 'La imagen supera 2 MB.' }
    const p = must(await supabase.from('producto').select('codigo').eq('id', id).single())
    // nombre nuevo en cada cambio: evita que el navegador muestre la foto anterior guardada en caché
    const ruta = `${p.codigo.replace(/[^A-Za-z0-9_-]+/g, '-')}-${Date.now()}.${ext}`
    check(await supabase.storage.from('productos').upload(ruta, archivo, { contentType: archivo.type, upsert: true }))
    const url = supabase.storage.from('productos').getPublicUrl(ruta).data.publicUrl
    check(await supabase.from('producto').update({ imagen_url: url }).eq('id', id))
    revalidatePath(`/productos/${id}`)
    revalidatePath('/productos')
    return { message: 'Foto actualizada.' }
  })
}

/** Almacén: agrega a SU catálogo un producto que ya existe en el catálogo maestro (recibe su código local). */
export async function agregarAMiCatalogo(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const local = String(fd.get('local_id'))
    // cada negocio tiene su propio producto: se crea su copia (unida por el código maestro) o se usa la que ya tiene
    const producto = String(must(await supabase.rpc('fn_producto_en_local', { p_producto: String(fd.get('producto_id')), p_local: local })))
    const almacen = String(fd.get('almacen') ?? '')
    if (almacen) await agregarAlAlmacen(supabase, producto, almacen)
    revalidatePath('/productos')
    redirect(`/productos/${producto}`)
  })
}

/** Elimina un producto que nunca tuvo movimientos (si ya tiene historial, se da de baja). */
export async function eliminarProducto(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    check(await supabase.rpc('fn_eliminar_producto', { p_producto: String(fd.get('producto_id')) }))
    revalidatePath('/productos')
    redirect('/productos')
  })
}

/** Da de baja (deja de aparecer, se conserva su kardex) o reactiva un producto. Para darlo de baja su stock debe ser 0. */
export async function bajaProducto(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const supabase = await createClient()
    const id = String(fd.get('producto_id'))
    const activo = fd.get('activo') === '1'
    check(await supabase.rpc('fn_baja_producto', { p_producto: id, p_activo: activo }))
    revalidatePath(`/productos/${id}`)
    revalidatePath('/productos')
    // si lo usaba también el otro negocio, solo se quitó del catálogo de este: vuelve a la lista
    const { data: sigue } = await supabase.rpc('fn_producto_compartido', { p_producto: id })
    const { data: mio } = await supabase.from('producto').select('activo').eq('id', id).maybeSingle()
    if (!activo && sigue && mio?.activo) redirect('/productos')
    return { message: activo ? 'Producto reactivado.' : 'Producto dado de baja: ya no aparece en las listas, su historial se conserva.' }
  })
}

/** Separar productos entre los almacenes del negocio (Almacén 01 «arriba» / Almacén 02 «abajo»): los marcados pasan al otro. */
export async function moverProductos(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const productos = JSON.parse(String(fd.get('productos') ?? '[]')) as string[]
    if (!productos.length) return { error: 'Marque al menos un producto.' }
    const supabase = await createClient()
    const r = must(await supabase.rpc('fn_mover_productos_almacen', {
      p_productos: productos, p_origen: String(fd.get('origen')), p_destino: String(fd.get('destino')),
    })) as { movidos: number; omitidos: number }
    revalidatePath('/productos', 'layout')
    return { message: `${r.movidos} producto(s) pasaron al otro almacén.${r.omitidos ? ` ${r.omitidos} no se movieron porque ya tienen cantidad.` : ''}` }
  })
}
