'use client'

import { useState } from 'react'
import { ArrowDownToLine, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { LineItems } from '@/components/line-items'

/** Productos del almacén que se piden: su código, su stock a la vista y la cantidad. */
export function LineasRequerimientoAlmacen({ almacenId }: { almacenId: string }) {
  const [cargando, setCargando] = useState(false)
  return (
    <LineItems
      name="lineas"
      almacenId={almacenId}
      mostrarStock
      fields={[
        { key: 'cantidad', label: 'Cantidad', required: true, width: '140px' },
        // se pide en cualquier unidad: las que se convierten solas (sacos ↔ kilos) o cualquier otra indicando cuánto trae (1 caja = 12 UND)
        { key: 'unidad_elegida', label: 'Unidad', type: 'unidad', width: '160px', todasUnidades: true, init: (p) => p.unidad_id ?? '' },
        { key: 'observacion', label: 'Observación', type: 'text' },
      ]}
      // de un clic: los que bajaron de su mínimo, con la cantidad del mínimo (se ajusta antes de enviar)
      herramientas={(agregar) => (
        <button type="button" disabled={cargando} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold hover:border-brand-200 disabled:opacity-60"
          onClick={async () => {
            setCargando(true)
            const { data, error } = await createClient().rpc('fn_bajo_minimo', { p_almacen: almacenId })
            setCargando(false)
            if (error) { toast.error(error.message); return }
            type B = { id: string; codigo: string; nombre: string; unidad: string; tipo: string; costo_referencia: number; controla_lote: boolean; stock: number; minimo: number }
            const filas = (data ?? []) as B[]
            if (!filas.length) { toast.success('Ningún producto está por debajo de su mínimo.'); return }
            agregar(filas.map((b) => ({
              p: { id: b.id, codigo: b.codigo, nombre: b.nombre, unidad: b.unidad, tipo: b.tipo, costo_referencia: Number(b.costo_referencia), controla_lote: b.controla_lote, stock: Number(b.stock) },
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
