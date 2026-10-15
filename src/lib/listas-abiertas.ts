import type { SupabaseClient } from '@supabase/supabase-js'

/** Escapa comodines de LIKE para buscar el nombre tal cual (sin distinguir mayúsculas). */
const exacto = (s: string) => s.replace(/[%_\\]/g, '\\$&')
const limpiar = (v: FormDataEntryValue | null) => String(v ?? '').trim().replace(/\s+/g, ' ')

/**
 * Convierte el origen escrito (o elegido) en el id de `ciudad`. Si no existe se crea al final de la lista,
 * así lo que se escribe una vez queda disponible para las siguientes compras.
 */
export async function resolverOrigen(supabase: SupabaseClient, valor: FormDataEntryValue | null): Promise<string | null> {
  const texto = limpiar(valor)
  if (!texto) return null
  const { data: existe } = await supabase.from('ciudad').select('id').ilike('nombre', exacto(texto)).limit(1)
  if (existe?.length) return existe[0].id
  // "cusco" → "Cusco", "san juan de lurigancho" → "San Juan de Lurigancho"
  const nombre = texto.toLowerCase().split(' ')
    .map((w, i) => (i > 0 && ['de', 'del', 'la', 'las', 'los', 'y', 'en'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
  const { data: ult } = await supabase.from('ciudad').select('orden').order('orden', { ascending: false }).limit(1)
  const { data, error } = await supabase.from('ciudad').insert({ nombre, orden: Number(ult?.[0]?.orden ?? 0) + 1 }).select('id').single()
  if (error) throw new Error(`No se pudo registrar el origen "${nombre}": ${error.message}`)
  return data.id
}

/**
 * Convierte el transportista escrito en el id del proveedor (marcado como transportista). Si no existe
 * (p. ej. "Taxi particular") se registra al momento y queda en la lista para los siguientes fletes.
 */
export async function resolverTransportista(supabase: SupabaseClient, valor: FormDataEntryValue | null): Promise<string | null> {
  const texto = limpiar(valor).toUpperCase()
  if (!texto) return null
  const { data: existe } = await supabase.from('proveedor').select('id, es_transportista').ilike('razon_social', exacto(texto)).limit(1)
  if (existe?.length) {
    // un proveedor que también hace fletes pasa a figurar en la lista de transportistas
    if (!existe[0].es_transportista) await supabase.from('proveedor').update({ es_transportista: true }).eq('id', existe[0].id)
    return existe[0].id
  }
  const { data, error } = await supabase.from('proveedor').insert({
    razon_social: texto, nombre_comercial: texto, tipo: 'negocio_local', subcategoria: 'TRANSPORTE', es_transportista: true,
  }).select('id').single()
  if (error) throw new Error(`No se pudo registrar el transportista "${texto}": ${error.message}`)
  return data.id
}
