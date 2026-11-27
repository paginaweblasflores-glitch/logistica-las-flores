'use client'

import { useState } from 'react'
import { ArrowDownToLine, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { LineItems } from '@/components/line-items'

/** Productos del almacén que se piden: su código, su stock a la vista y la cantidad. */
export function LineasRequerimientoAlmacen({ almacenId, almacenes }: { almacenId: string | null
  /** «Todos» arriba: se busca en todos sus almacenes y cada producto va para el almacén que se elija */
  almacenes?: { id: string; corto: string }[] }) {
  const [cargando, setCargando] = useState(false)
  return (
    <LineItems
      name="lineas"
      almacenId={almacenId}
      almacenes={almacenes?.map((a) => a.id)}
      mostrarStock
      fields={[
        { key: 'cantidad', label: 'Cantidad', required: true, width: '140px' },
        // se pide en cualquier unidad: las que se convierten solas (sacos ↔ kilos) o cualquier otra indicando cuánto trae (1 caja = 12 UND)
        { key: 'unidad_elegida', label: 'Unidad', type: 'unidad', width: '160px', todasUnidades: true, init: (p) => p.unidad_id ?? '' },
        { key: 'observacion', label: 'Observación', type: 'text' },
      ]}
      // de un clic: los que bajaron de su mínimo, con la cantidad del mínimo (se ajusta antes de enviar)
      herramientas={(agregar) => (
        <button type="button" disabled={cargando} className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold hover:border-brand-200 disabled:opacity-60"
          onClick={async () => {
            setCargando(true)
            // de su almacén o, con «Todos», de cada uno de sus almacenes (al mismo tiempo)
            const lista = almacenes ?? (almacenId ? [{ id: almacenId, corto: '' }] : [])
            const res = await Promise.all(lista.map((a) => createClient().rpc('fn_bajo_minimo', { p_almacen: a.id })))
            setCargando(false)
            const error = res.find((r) => r.error)?.error
            if (error) { toast.error(error.message); return }
            type B = { id: string; codigo: string; nombre: string; unidad: string; tipo: string; costo_referencia: number; controla_lote: boolean; stock: number; minimo: number
              unidad_id: string; presentacion_id: string | null; presentacion_cantidad: number | null; presentacion: string | null; almacen_id?: string; almacen?: string }
            const filas = res.flatMap((r, i) => ((r.data ?? []) as B[]).map((b) => (almacenes ? { ...b, almacen_id: lista[i].id, almacen: lista[i].corto } : b)))
            if (!filas.length) { toast.success('Ningún producto está por debajo de su mínimo.'); return }
            agregar(filas.map((b) => ({
              p: { id: b.id, codigo: b.codigo, nombre: b.nombre, unidad: b.unidad, tipo: b.tipo, costo_referencia: Number(b.costo_referencia), controla_lote: b.controla_lote, stock: Number(b.stock),
                unidad_id: b.unidad_id, presentacion_id: b.presentacion_id, presentacion: b.presentacion,
                presentacion_cantidad: b.presentacion_cantidad === null ? null : Number(b.presentacion_cantidad), almacen_id: b.almacen_id ?? null, almacen: b.almacen ?? null },
              valores: { cantidad: String(Number(b.minimo)) },
            })))
            toast.success(`${filas.length} producto(s) bajo el mínimo agregados. Ajuste las cantidades si hace falta.`)
          }}>
          {cargando ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowDownToLine className="size-4" />} Agregar los que están bajo el mínimo
        </button>
      )}
    />
  )
}
