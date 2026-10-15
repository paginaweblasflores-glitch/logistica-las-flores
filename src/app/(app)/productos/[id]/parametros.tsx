'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { fmtQty } from '@/lib/format'
import { guardarParametrosAlmacen } from '../actions'

type Fila = { almacen_id: string; nombre: string; stock: number | null; stock_minimo: string; stock_maximo: string; stock_objetivo: string; ubicacion: string
  fecha_vencimiento: string; dias_aviso_vencimiento: string }

/**
 * Mínimo, máximo, stock par, ubicación y vencimiento por almacén. Los fija el responsable de cada almacén; Logística solo ve el stock.
 * Vencimiento (solo el almacén): la fecha y con cuántos días de anticipación avisa la campanita (por defecto 30).
 * Cada llegada trae su fecha (lote FIFO); la fecha de aquí se aplica al stock que aún no tiene fecha.
 */
export function ParametrosAlmacen({ productoId, filas: inicial, soloLectura = false, vencimiento = false }: {
  productoId: string; filas: Fila[]; soloLectura?: boolean
  /** mostrar las columnas de vencimiento (panel de almacén) */
  vencimiento?: boolean
}) {
  const [filas, setFilas] = useState(inicial)
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
          <thead><tr><th className="th">Almacén</th><th className="th text-right">Stock</th><th className="th w-28">Mínimo</th><th className="th w-28">Máximo</th><th className="th w-28">Stock par</th><th className="th">Ubicación</th>
            {vencimiento && <><th className="th w-40">Fecha de vencimiento</th><th className="th w-32">Avisar faltando (días)</th></>}</tr></thead>
          <tbody>{filas.map((f, i) => (
            <tr key={f.almacen_id}>
              <td className="td">{f.nombre}</td><td className="td text-right tabular">{f.stock === null ? '—' : fmtQty(f.stock)}</td>
              {(['stock_minimo', 'stock_maximo', 'stock_objetivo'] as const).map((k) => (
                <td key={k} className="td py-1"><input type="number" step="any" min="0" value={f[k]} disabled={soloLectura} onChange={(e) => set(i, k, e.target.value)} className="field h-8 tabular" /></td>
              ))}
              <td className="td py-1"><input value={f.ubicacion} disabled={soloLectura} onChange={(e) => set(i, 'ubicacion', e.target.value)} className="field h-8" /></td>
              {vencimiento && <>
                <td className="td py-1"><input type="date" value={f.fecha_vencimiento} disabled={soloLectura} onChange={(e) => set(i, 'fecha_vencimiento', e.target.value)} aria-label={`Fecha de vencimiento en ${f.nombre}`} className="field h-8 tabular" /></td>
                <td className="td py-1"><input type="number" min="1" max="365" step="1" value={f.dias_aviso_vencimiento} disabled={soloLectura} onFocus={(e) => e.target.select()}
                  onChange={(e) => set(i, 'dias_aviso_vencimiento', e.target.value)} aria-label={`Días de aviso en ${f.nombre}`} className="field h-8 tabular" /></td>
              </>}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {!soloLectura && <div className="flex justify-end"><SubmitButton variant="dark">Guardar parámetros</SubmitButton></div>}
    </ActionForm>
  )
}
