import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { etiquetaNegocio } from '@/lib/empresa'

export type Opcion = { id: string; nombre: string; local_id?: string | null; codigo?: string; tipo?: string }

/** Almacenes visibles (opcionalmente del negocio seleccionado) */
export const getAlmacenes = cache(async (localId?: string | null, tipos?: string[]) => {
  const supabase = await createClient()
  let q = supabase.from('almacen').select('id, codigo, nombre, tipo, local_id').eq('activo', true).order('codigo')
  if (localId) q = q.eq('local_id', localId)
  if (tipos?.length) q = q.in('tipo', tipos)
  const { data } = await q
  return (data ?? []) as Opcion[]
})

export const getAreas = cache(async (localId?: string | null) => {
  const supabase = await createClient()
  let q = supabase.from('area').select('id, nombre, local_id').eq('activo', true).order('nombre')
  if (localId) q = q.eq('local_id', localId)
  const { data } = await q
  return (data ?? []) as Opcion[]
})

export const getPersonal = cache(async (localId?: string | null) => {
  const supabase = await createClient()
  let q = supabase.from('personal').select('id, nombre:nombres, local_id').eq('activo', true).order('nombres')
  if (localId) q = q.eq('local_id', localId)
  const { data } = await q
  return (data ?? []) as Opcion[]
})

export const getProveedores = cache(async (soloTransportistas = false) => {
  const supabase = await createClient()
  let q = supabase.from('proveedor').select('id, nombre:razon_social, tipo').eq('activo', true).order('razon_social')
  if (soloTransportistas) q = q.eq('es_transportista', true)
  const { data } = await q
  return (data ?? []) as Opcion[]
})

export const getCiudades = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.from('ciudad').select('id, nombre').order('orden')
  return (data ?? []) as Opcion[]
})

export const getCategorias = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.from('categoria').select('id, nombre, padre:padre_id(nombre)').order('nombre')
  return ((data ?? []) as unknown as { id: string; nombre: string; padre: { nombre: string } | null }[])
    .map((c) => ({ id: c.id, nombre: c.padre ? `${c.padre.nombre} › ${c.nombre}` : c.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
})

export const getUnidades = cache(async () => {
  const supabase = await createClient()
  // las que se ofrecen para elegir, con cuántos productos las usan (para poner primero las más usadas); «Por definir» no se elige
  const { data } = await supabase.from('v_unidad_uso').select('id, codigo, nombre, productos, tipo').eq('activo', true).order('nombre')
  return (data ?? []) as (Opcion & { codigo: string; productos: number; tipo: string })[]
})

export const getMotivos = cache(async (aplica?: string[]) => {
  const supabase = await createClient()
  let q = supabase.from('motivo').select('id, codigo, nombre').eq('activo', true).order('nombre')
  if (aplica?.length) q = q.in('aplica_a', aplica)
  const { data } = await q
  return (data ?? []) as Opcion[]
})

/** Negocios para elegir en pedidos y documentos: "20494980801 - CORPORACIÓN LAS FLORES S.A.C. (Restaurante Las Flores)". */
export const getLocalesOpc = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.from('local').select('id, codigo, nombre, empresa:empresa_id(ruc, razon_social)').eq('activo', true).order('orden')
  return ((data ?? []) as unknown as { id: string; codigo: string; nombre: string; empresa: { ruc: string; razon_social: string } | null }[])
    .map((l) => ({ id: l.id, codigo: l.codigo, nombre: etiquetaNegocio({ nombre: l.nombre, ruc: l.empresa?.ruc, razon_social: l.empresa?.razon_social }) })) as Opcion[]
})
