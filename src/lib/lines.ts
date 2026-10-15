export type Line = { producto_id: string | null; descripcion: string; unidad: string; [k: string]: string | null }

/** Parsea el JSON de líneas enviado por <LineItems/> */
export function parseLines(raw: FormDataEntryValue | null): Line[] {
  try {
    const v = JSON.parse(String(raw ?? '[]'))
    return Array.isArray(v) ? (v as Line[]) : []
  } catch {
    return []
  }
}

export const num = (v: string | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v))

/** Convierte un valor de <input type="datetime-local"> (hora de Lima) a ISO UTC. Perú no usa horario de verano. */
export function limaIso(v: FormDataEntryValue | null | undefined): string | null {
  const s = String(v ?? '').trim()
  if (!s) return null
  const conZona = /([+-]\d{2}:?\d{2}|Z)$/.test(s) ? s : `${s.length === 10 ? s + 'T12:00' : s}-05:00`
  const d = new Date(conZona)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Fecha y hora de un registro (entrada, salida, traspaso, llegada). El campo viene con la hora de apertura
 * del formulario y sin segundos: si no se cambió (`<campo>_inicial`), se usa la hora exacta de ahora para que
 * el Kardex quede en el orden real en que se registró.
 */
export function fechaRegistro(fd: FormData, campo = 'fecha'): string {
  const v = String(fd.get(campo) ?? '')
  if (!v || v === String(fd.get(`${campo}_inicial`) ?? '')) return new Date().toISOString()
  return limaIso(v) ?? new Date().toISOString()
}

/**
 * Una línea escrita en otra unidad (4 Cajas a S/ 34, «1 caja = 6 BOT») pasada a la unidad del producto
 * (24 BOT a S/ 5.6667). `factor` = cuántas unidades del producto es 1 de la unidad elegida (lo calcula <LineItems/>).
 * `nota` deja anotado cómo se escribió («4 Caja (1 = 6 BOT)»); vacía si fue en la unidad del producto.
 */
export function enUnidadDelProducto(l: Line, cantKey = 'cantidad', precioKey?: string) {
  const f = Number(l.factor) > 0 ? Number(l.factor) : 1
  const cant = Number(String(l[cantKey] ?? '').replace(',', '.')) || 0
  const precio = precioKey ? Number(String(l[precioKey] ?? '').replace(',', '.')) || 0 : null
  return {
    cantidad: Math.round(cant * f * 10000) / 10000,
    precio: precio === null ? null : Math.round((precio / f) * 10000) / 10000,
    nota: f !== 1 ? `${cant} ${l.unidad_elegida_nombre || ''} (1 = ${f} ${l.unidad})`.replace(/\s+/g, ' ') : '',
    /** se eligió una unidad que el sistema no sabe convertir y no se escribió cuánto trae */
    sinEquivalencia: l.factor === '',
  }
}
