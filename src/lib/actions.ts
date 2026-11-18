import 'server-only'
import { unstable_rethrow } from 'next/navigation'

export type ActionResult = { ok?: boolean; message?: string; error?: string; id?: string } | undefined

/** Traduce errores de Postgres/Supabase a mensajes entendibles para el usuario. */
export function mensajeError(e: unknown): string {
  const err = e as { message?: string; code?: string; details?: string }
  const msg = err?.message ?? String(e)
  if (err?.code === '23505') return 'Ya existe un registro con esos datos (duplicado).'
  if (err?.code === '23503') return 'El registro está relacionado con otros datos y no se puede completar la operación.'
  if (err?.code === '42501' || /row-level security/i.test(msg)) return 'No tiene permisos para realizar esta acción.'
  if (err?.code === '23514') return 'Algún valor no es válido (revise cantidades y estados).'
  return msg.replace(/^.*?ERROR:\s*/, '')
}

/** Ejecuta una acción capturando errores (y dejando pasar redirect/notFound de Next). */
export async function run(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    return (await fn()) ?? { ok: true }
  } catch (e) {
    unstable_rethrow(e)
    return { error: mensajeError(e) }
  }
}

/** Lanza el error de Supabase si existe (para usar dentro de run). */
export function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error
  return res.data
}

/**
 * Para UPDATE con `.select('id')`: exige que haya cambiado al menos una fila. Un UPDATE que no encuentra la fila
 * (no existe, ya cambió de estado o no es visible) no da error en Supabase; sin esto se anunciaría un éxito falso.
 */
export function afecto<T>(res: { data: T[] | null; error: unknown }, mensaje: string): T[] {
  if (res.error) throw res.error
  if (!res.data?.length) throw new Error(mensaje)
  return res.data
}

/** Igual que check, pero exige que haya datos (inserciones con .single()). */
export function must<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error
  if (res.data === null || res.data === undefined) throw new Error('No se obtuvo respuesta de la base de datos.')
  return res.data as NonNullable<T>
}

/**
 * Un paso de una operación de varios pasos. «@id:nombre» en un valor se reemplaza por el id del paso «como: nombre».
 * - insertar: tabla + valores (uno o varios)        - actualizar: tabla + valores + donde (+ exigir: mensaje si no cambia nada)
 * - llamar: función de la base + args
 */
export type Paso =
  | { insertar: string; valores: Record<string, unknown> | Record<string, unknown>[]; como?: string }
  | { actualizar: string; valores: Record<string, unknown>; donde: Record<string, unknown>; exigir?: string }
  | { llamar: string; args: Record<string, unknown>; como?: string }

/**
 * Ejecuta los pasos en UNA sola transacción de la base (fn_en_una_operacion): si uno falla, no queda nada a medias
 * (ni cabeceras sin detalle, ni estados cambiados sin su documento). Devuelve los ids de los pasos con «como».
 */
export async function enUnaOperacion(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  pasos: Paso[],
): Promise<Record<string, string>> {
  const res = await supabase.rpc('fn_en_una_operacion', { p_pasos: pasos })
  if (res.error) throw res.error
  return (res.data ?? {}) as Record<string, string>
}
