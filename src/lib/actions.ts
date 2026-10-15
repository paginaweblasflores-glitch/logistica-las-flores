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

/** Igual que check, pero exige que haya datos (inserciones con .single()). */
export function must<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error
  if (res.data === null || res.data === undefined) throw new Error('No se obtuvo respuesta de la base de datos.')
  return res.data as NonNullable<T>
}
