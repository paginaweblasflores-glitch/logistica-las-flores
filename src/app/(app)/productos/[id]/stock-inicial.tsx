'use client'

import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { registrarStockInicial } from '../actions'

/**
 * Stock inicial del producto en el almacén elegido: se pone UNA sola vez (entrada «Stock inicial», queda en el Kardex).
 * Después la cantidad cambia solo con Entradas, Salidas y Traspasos; este recuadro ya no aparece.
 */
export function StockInicial({ productoId, almacenId, almacen, unidad }: { productoId: string; almacenId: string; almacen: string; unidad: string }) {
  const u = (unidad || 'unidad').toLowerCase()
  return (
    <ActionForm action={registrarStockInicial} className="space-y-3">
      <input type="hidden" name="producto_id" value={productoId} />
      <input type="hidden" name="almacen" value={almacenId} />
      <div className="grid gap-4 sm:grid-cols-3">
        <label><span className="label">Cantidad que tiene hoy ({u}) <span className="req">*</span></span>
          <input type="number" step="any" min="0" name="cantidad" required placeholder="0" onFocus={(e) => e.target.select()} className="field tabular" /></label>
        <label><span className="label">Precio por {u} (S/)</span>
          <input type="number" step="0.0001" min="0" name="precio" placeholder="0.00" onFocus={(e) => e.target.select()} className="field tabular" /></label>
        <label><span className="label">Fecha de vencimiento</span>
          <input type="date" name="fecha_vencimiento" className="field tabular" /></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">Se registra una sola vez en {almacen}. Después cambia con entradas, salidas y traspasos.</p>
        <SubmitButton listo={(d) => Number(d.get('cantidad')) > 0}>Registrar stock inicial</SubmitButton>
      </div>
    </ActionForm>
  )
}
