import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { panelDe, type Panel } from '@/lib/panel'

export type Local = { id: string; codigo: string; nombre: string; color: string; ruc: string | null; razon_social: string | null }
export type Usuario = { id: string; username: string; nombre: string; rol: string; todos_locales: boolean }

export const AMBITO_COOKIE = 'ambito'

type Contexto = { usuario: Usuario; locales: Local[]; misLocales: string[]; almacenes: { id: string; nombre: string; local_id: string }[] }

/**
 * Todo lo de la sesión en UNA sola llamada a la base (usuario, negocios, negocios del usuario y sus almacenes).
 * Antes eran 4 consultas seguidas (~0,15 s cada una hasta la base en Brasil). Cacheado por request.
 */
const getContexto = cache(async (): Promise<Contexto> => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('fn_contexto_sesion')
  // si la base no respondió (corte de internet, lentitud) NO se cierra la sesión: se muestra el error para reintentar
  if (error) throw new Error('No se pudo conectar con la base de datos. Revise su internet y vuelva a intentar.')
  // sin sesión o sin perfil activo: se cierra la sesión (si no, /login devolvería a «/» y daría vueltas)
  if (!data) redirect('/auth/salir?error=perfil')
  const c = data as { usuario: Usuario; locales: Local[]; mis_locales: string[]; almacenes: Contexto['almacenes'] }
  return { usuario: c.usuario, locales: c.locales, misLocales: c.mis_locales, almacenes: c.almacenes }
})

/** Usuario autenticado + perfil de aplicación. */
export const getUsuario = cache(async (): Promise<Usuario> => (await getContexto()).usuario)

/** Todos los negocios activos (para elegir destinos de traspasos y listas generales). */
export const getLocales = cache(async (): Promise<Local[]> => (await getContexto()).locales)

/** Panel del usuario: logística (ve ambos negocios) o almacén (solo el suyo). */
export const getPanel = cache(async (): Promise<Panel> => panelDe((await getUsuario()).rol))

/** Negocios que el usuario puede ver: todos, o solo los asignados (usuarios de almacén). */
export const getMisLocales = cache(async (): Promise<Local[]> => {
  const { locales, misLocales } = await getContexto()
  const ids = new Set(misLocales)
  return locales.filter((l) => ids.has(l.id))
})

/**
 * Ámbito de trabajo seleccionado en la barra superior:
 * GLOBAL (ambos negocios) o un negocio específico. Se guarda en cookie.
 */
export const getAmbito = cache(async (): Promise<{ local: Local | null; codigo: string; locales: Local[]; fijo: boolean }> => {
  const [store, locales] = await Promise.all([cookies(), getMisLocales()])
  // Usuario de un solo negocio (almacén): siempre trabaja en el suyo, sin selector
  if (locales.length === 1) return { local: locales[0], codigo: locales[0].codigo, locales, fijo: true }
  // Jefes de área: no tienen selector; ven siempre sus requerimientos de ambos negocios
  // (sin esto heredaban el negocio que dejó elegido otro usuario en el mismo navegador)
  if ((await getPanel()) === 'area') return { local: null, codigo: 'GLOBAL', locales, fijo: true }
  const codigo = store.get(AMBITO_COOKIE)?.value ?? 'GLOBAL'
  const local = locales.find((l) => l.codigo === codigo) ?? null
  return { local, codigo: local ? local.codigo : 'GLOBAL', locales, fijo: false }
})

export const ALMACEN_COOKIE = 'almacen_activo'

export type AlmacenPanel = { id: string; nombre: string; corto: string }

/** "Almacén 01 — Las Flores" → "Almacén 01"; "Almacén 02 — Cocina Las Flores" → "Almacén 02 — Cocina" */
const nombreCorto = (n: string) => n.replace(/\s*—\s*Las Flores$/i, '').replace(/\s+Las Flores$/i, '')

/**
 * Almacén elegido en la barra superior del panel de almacén (Todos · Almacén 01 · Almacén 02 — Cocina).
 * Un mismo responsable maneja varios almacenes de su negocio: al elegir uno, todo el panel muestra solo ese.
 * `id` null = Todos. En Logística o con un solo almacén no hay selector.
 */
export const getAlmacenActivo = cache(async (): Promise<{ id: string | null; actual: AlmacenPanel | null; lista: AlmacenPanel[] }> => {
  if ((await getPanel()) !== 'almacen') return { id: null, actual: null, lista: [] }
  const { local } = await getAmbito()
  if (!local) return { id: null, actual: null, lista: [] }
  // los almacenes ya vienen con la sesión (sin otra consulta)
  const lista = (await getContexto()).almacenes.filter((a) => a.local_id === local.id)
    .map((a) => ({ id: a.id, nombre: a.nombre, corto: nombreCorto(a.nombre) }))
  if (lista.length <= 1) return { id: lista[0]?.id ?? null, actual: lista[0] ?? null, lista }
  const elegido = (await cookies()).get(ALMACEN_COOKIE)?.value
  const actual = lista.find((a) => a.id === elegido) ?? null
  return { id: actual?.id ?? null, actual, lista }
})

/** Con «Todos» elegido (responsable con varios almacenes) el panel es solo para consultar: no se registra nada. */
export const soloConsulta = (sel: { id: string | null; lista: AlmacenPanel[] }) => sel.lista.length > 1 && !sel.id
