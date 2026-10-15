'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Select } from '@/components/select'

/**
 * Unidad de una línea de productos (estándar de todo el sistema: entradas, salidas, traspasos,
 * requerimiento del almacén y llegada de compras).
 * Se elige en qué unidad se escribe la cantidad (y el precio): la del producto, las que el sistema convierte solo
 * (Kilo ↔ Gramo, Litro ↔ Mililitro, Saco de 50 kilos ↔ Kilo) o cualquier otra indicando cuánto trae («1 Caja = 6 UND»).
 * `factorUnidad` dice cuántas unidades del producto son 1 de la unidad elegida: con eso se pasa todo a la unidad del producto.
 */
export type Uni = { id: string; codigo: string; nombre: string; tipo: string; base_id: string | null; base_factor: number | null; orden: number }
/** lo que hace falta del producto para convertir */
export type ProdUnidad = { unidad_id?: string | null; unidad: string; contenido?: string | number | null; contenido_unidad_id?: string | null }

let cache: Promise<Record<string, Uni>> | null = null
/** todas las unidades (una sola consulta para toda la pantalla) */
export function useUnidades() {
  const [u, setU] = useState<Record<string, Uni>>({})
  useEffect(() => {
    cache ??= Promise.resolve(createClient().from('unidad_medida').select('id, codigo, nombre, tipo, base_id, base_factor, orden').eq('activo', true))
      .then(({ data }) => Object.fromEntries(((data ?? []) as Uni[]).map((x) => [x.id, x])))
    cache.then(setU)
  }, [])
  return u
}

/** id de la unidad del producto (si la línea solo trae su código, p. ej. «bajo el mínimo») */
export const idUnidad = (u: Record<string, Uni>, p: ProdUnidad) => p.unidad_id || Object.values(u).find((x) => x.codigo === p.unidad)?.id || ''

/** una unidad en su unidad base: medida → su base; empaque → ella misma */
const enBase = (x: Uni | undefined) => (x ? (x.tipo === 'medida' ? { b: x.base_id ?? x.id, q: Number(x.base_factor ?? 1) } : { b: x.id, q: 1 }) : null)
/** una unidad del producto en la unidad base (un saco con «trae 50 kilos» = 50 kilos) */
function baseProducto(u: Record<string, Uni>, p: ProdUnidad) {
  const pu = u[idUnidad(u, p)]
  if (pu?.tipo === 'medida') return enBase(pu)
  const cu = u[p.contenido_unidad_id ?? '']
  if (cu && Number(p.contenido) > 0) { const c = enBase(cu)!; return { b: c.b, q: c.q * Number(p.contenido) } }
  return enBase(pu)
}

/** cuántas unidades del producto son 1 de la unidad elegida; null = no se sabe (falta «cuánto trae») */
export function factorUnidad(u: Record<string, Uni>, p: ProdUnidad, elegida: string | null | undefined, equivale?: string | number | null) {
  const pid = idUnidad(u, p)
  if (!elegida || elegida === pid) return 1
  const a = enBase(u[elegida]), b = baseProducto(u, p)
  if (a && b && a.b === b.b && b.q) return a.q / b.q
  // «Unidad» (o docena, par) en un producto que se cuenta por empaque: 1 botella, 1 lata, 1 paquete = 1 unidad
  if (a && u[a.b]?.codigo === 'UND' && u[pid]?.tipo === 'empaque') return a.q
  return Number(equivale) > 0 ? Number(equivale) : null
}

/** unidades que se convierten solas y, con `todas`, también el resto (en orden alfabético) */
export function opcionesUnidad(u: Record<string, Uni>, p: ProdUnidad, todas = true) {
  const pid = idUnidad(u, p)
  const conv = Object.values(u).filter((x) => x.id === pid || (x.id !== pid && factorUnidad(u, p, x.id) !== null))
    .sort((a, b) => Number(b.id === pid) - Number(a.id === pid) || a.orden - b.orden)
  const ops = conv.map((x) => ({ id: x.id, nombre: x.nombre }))
  if (!pid) ops.unshift({ id: '', nombre: p.unidad })
  if (!todas) return ops.filter((o) => o.id)
  return [...ops, ...Object.values(u).filter((x) => !conv.some((c) => c.id === x.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((x) => ({ id: x.id, nombre: x.nombre }))]
    .filter((o) => o.id)
}

/** celda «Unidad»: el selector y, si hace falta, «1 caja = [ ] BOT»; debajo, la cantidad en la unidad del producto */
export function UnidadCelda({ u, p, value, equivale, cantidad, onUnidad, onEquivale, todas = true, etiqueta, fijo }: {
  u: Record<string, Uni>; p: ProdUnidad; value: string | null | undefined; equivale?: string | null; cantidad?: string | number | null
  onUnidad: (v: string) => void; onEquivale: (v: string) => void; todas?: boolean; etiqueta: string
  /** lo que trae cada una ya se sabe (se pidió así: 1 saco = 50): no se pregunta ni se muestra */
  fijo?: number
}) {
  const pid = idUnidad(u, p)
  const elegida = value || pid
  if (!pid) return <span className="block px-1 text-sm">{p.unidad}</span>
  const directo = factorUnidad(u, p, elegida) !== null
  const f = factorUnidad(u, p, elegida, equivale)
  const cant = Number(String(cantidad ?? '').replace(',', '.'))
  return (
    <div>
      <Select value={elegida} onChange={onUnidad} required className="h-8" ariaLabel={etiqueta} options={opcionesUnidad(u, p, todas)} />
      {!directo && !fijo && (
        <label className="mt-1 flex items-center gap-1 text-[11px] whitespace-nowrap text-muted">
          1 {(u[elegida]?.nombre ?? '').toLowerCase()} =
          <input type="number" step="any" min="0" required value={equivale ?? ''}
            onChange={(e) => onEquivale(e.target.value)} onFocus={(e) => e.target.select()}
            aria-label={`Cuánto trae cada unidad (${etiqueta})`} placeholder="6" className="field h-7 w-16 px-1.5 text-right text-xs tabular" />
          {p.unidad}
        </label>
      )}
      {/* lo pedido en sacos ya se entiende: no se muestra la conversión */}
      {f !== null && f !== 1 && cant > 0 && !fijo && (
        <span className="mt-0.5 block text-[11px] text-muted">= {(cant * f).toLocaleString('es-PE', { maximumFractionDigits: 3 })} {p.unidad}</span>
      )}
    </div>
  )
}
