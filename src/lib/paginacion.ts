/** Cantidades de filas que el usuario puede elegir en cualquier tabla */
export const TAMANOS_PAGINA = [5, 10, 25, 50, 100, 200, 500] as const
export const TAMANO_DEFECTO = 5

/**
 * Lee ?page=&size= (o con prefijo, para páginas con varias tablas: ?c_page=&c_size=)
 * y devuelve el rango para `.range(from, to)` de Supabase.
 */
export function paginar(params: Record<string, string | string[] | undefined>, prefijo = '') {
  const v = (k: string) => { const x = params[prefijo + k]; return Array.isArray(x) ? x[0] : x }
  const sizeNum = Number(v('size'))
  const size = (TAMANOS_PAGINA as readonly number[]).includes(sizeNum) ? sizeNum : TAMANO_DEFECTO
  const page = Math.max(1, Math.floor(Number(v('page')) || 1))
  return { page, size, from: (page - 1) * size, to: page * size - 1 }
}
