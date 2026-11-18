'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { guardarParametrosAlmacen } from '../actions'

type Fila = { almacen_id: string; nombre: string; stock: number | null
  stock_minimo: string; stock_maximo: string; stock_objetivo: string; ubicacion: string
  fecha_vencimiento: string; dias_aviso_vencimiento: string }

/**
 * Parámetros por almacén: stock mínimo y con cuántos días de anticipación avisa el vencimiento. Los fija el responsable.
 * Las cantidades y las fechas de vencimiento son de Inventario (llegan con cada entrada): aquí no se muestran.
 * Máximo, ubicación y stock par ya no se piden: lo que tengan guardado se conserva.
 */
export function ParametrosAlmacen({ productoId, filas: inicial, soloLectura = false, vencimiento = false, unidad = '' }: {
  productoId: string; filas: Fila[]; soloLectura?: boolean
  /** unidad del producto: el stock y el mínimo están en ella (sacos, unidades…) */
  unidad?: string
  /** mostrar las columnas de vencimiento (panel de almacén) */
  vencimiento?: boolean
}) {
  const [filas, setFilas] = useState(inicial)
  const u = unidad.toLowerCase()
  const set = (i: number, k: keyof Fila, v: string) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, [k]: v } : x)))
  const datos = filas.map(({ almacen_id, stock_minimo, stock_maximo, stock_objetivo, ubicacion, fecha_vencimiento, dias_aviso_vencimiento }) => ({
    almacen_id, stock_minimo, stock_maximo, stock_objetivo, ubicacion,
    ...(vencimiento ? { fecha_vencimiento, dias_aviso_vencimiento } : {}),
  }))
  return (
    <ActionForm action={guardarParametrosAlmacen} className="space-y-3">
      <input type="hidden" name="producto_id" value={productoId} />
      <input type="hidden" name="filas" value={JSON.stringify(datos)} />
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead><tr><th className="th">Almacén</th><th className="th w-44">Stock mínimo</th>
            {vencimiento && <th className="th w-48">Avisar vencimiento (días antes)</th>}</tr></thead>
          <tbody>{filas.map((f, i) => (
            <tr key={f.almacen_id}>
              <td className="td">{f.nombre}</td>
              <td className="td py-1"><div className="flex items-center gap-1.5">
                <input type="number" step="any" min="0" value={f.stock_minimo} disabled={soloLectura} onChange={(e) => set(i, 'stock_minimo', e.target.value)} aria-label={`Mínimo en ${f.nombre}`} className="field h-8 w-24 tabular" />
                <span className="text-xs text-muted">{u}</span></div></td>
              {vencimiento && <>
                <td className="td py-1"><input type="number" min="1" max="365" step="1" value={f.dias_aviso_vencimiento} disabled={soloLectura} onFocus={(e) => e.target.select()}
                  onChange={(e) => set(i, 'dias_aviso_vencimiento', e.target.value)} aria-label={`Días de aviso en ${f.nombre}`} className="field h-8 tabular" /></td>
              </>}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {!soloLectura && <div className="flex justify-end"><SubmitButton variant="dark" soloConCambios>Guardar parámetros</SubmitButton></div>}
    </ActionForm>
  )
}
