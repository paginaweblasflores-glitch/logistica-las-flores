import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/** Producto propio de Producción: carne del kardex (con saldo) o compra (papa, carne pulpa…). */
export type ProdProducto = {
  id: string; nombre: string; tipo: 'kardex' | 'compra'; unidad: 'KG' | 'UND'; porcion: string | null; gramos_porcion: number | null
  usa_sacos: boolean; hueso_grasa: boolean; merma: boolean; orden: number; activo: boolean
}
export type Opc = { id: string; nombre: string }

/** Catálogo, proveedores y conceptos de Producción: una sola vuelta a la base (en paralelo). */
export const getCatalogoProduccion = cache(async () => {
  const supabase = await createClient()
  const [{ data: productos }, { data: proveedores }, { data: conceptos }] = await Promise.all([
    supabase.from('prod_producto').select('id, nombre, tipo, unidad, porcion, gramos_porcion, usa_sacos, hueso_grasa, merma, orden, activo').order('orden').order('nombre'),
    supabase.from('prod_proveedor').select('id, nombre, telefono, activo').order('nombre'),
    supabase.from('prod_concepto').select('codigo, nombre, orden').order('orden'),
  ])
  return {
    productos: (productos ?? []) as ProdProducto[],
    proveedores: (proveedores ?? []) as (Opc & { telefono: string | null; activo: boolean })[],
    conceptos: (conceptos ?? []).map((c) => ({ id: c.codigo as string, nombre: c.nombre as string })),
  }
})

/** «2 sacos · 212 kg» o «96 platos»: la cantidad de un ingreso como la escribe en su cuaderno. */
export function cantidadIngreso(m: { sacos: number | null; kilos: number | null; cantidad: number | null; unidad: string; porcion: string | null }) {
  const f = (v: number) => v.toLocaleString('es-PE', { maximumFractionDigits: 3 })
  const partes: string[] = []
  if (m.sacos) partes.push(`${f(Number(m.sacos))} ${Number(m.sacos) === 1 ? 'saco' : 'sacos'}`)
  if (m.kilos) partes.push(`${f(Number(m.kilos))} kg`)
  if (m.cantidad) partes.push(`${f(Number(m.cantidad))} ${m.porcion ?? (m.unidad === 'UND' ? 'und' : '')}`.trim())
  return partes.join(' · ') || '—'
}

/** Fecha y hora actual de Perú para un datetime-local («2026-10-17T16:05»). */
export const ahoraLima = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 16)
