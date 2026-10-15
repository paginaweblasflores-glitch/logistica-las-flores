'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { AMBITO_COOKIE, ALMACEN_COOKIE } from '@/lib/session'

export async function setAmbito(codigo: string) {
  const store = await cookies()
  store.set(AMBITO_COOKIE, codigo, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  revalidatePath('/', 'layout')
}

/** Almacén elegido en el panel de almacén ('TODOS' = todos los almacenes del responsable). */
export async function setAlmacenActivo(id: string) {
  const store = await cookies()
  store.set(ALMACEN_COOKIE, id, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
  revalidatePath('/', 'layout')
}
