'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { fmtQty } from '@/lib/format'
import { aprobarRequerimiento } from '../actions'

/** una línea tal cual la pidió el almacén: `pedido` en `unidad` (4 Paquete); `factor` = unidades del producto por cada una (6) */
export type LineaAprob = { id: string; codigo: string | number; descripcion: string; unidadProducto: string
  pedido: number; unidad: string; factor: number; motivo: string | null }

/**
 * Aprobación del requerimiento del almacén en la misma tabla de productos y en las unidades en que se pidió.
 * Se puede aprobar menos (4 → 3 paquetes), no más de lo pedido; lo desmarcado no se aprueba.
 */
export function AprobacionAlmacen({ id, lineas }: { id: string; lineas: LineaAprob[] }) {
  const [sel, setSel] = useState<Record<string, { ok: boolean; cant: string }>>(
    Object.fromEntries(lineas.map((l) => [l.id, { ok: true, cant: String(l.pedido) }])))
  const cant = (l: LineaAprob) => (sel[l.id].ok ? Math.min(Math.max(Number(sel[l.id].cant) || 0, 0), l.pedido) : 0)
  // se guarda en la unidad del producto (lo que usan la compra y la llegada)
  const payload = Object.fromEntries(lineas.map((l) => [l.id, Math.round(cant(l) * l.factor * 10000) / 10000]))
  const marcados = lineas.filter((l) => cant(l) > 0).length
  const conObs = lineas.some((l) => l.motivo)

  return (
    <ActionForm action={aprobarRequerimiento}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="aprobadas" value={JSON.stringify(payload)} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr><th className="th w-16 text-center">Aprobar</th><th className="th text-right">Cód.</th><th className="th">Producto</th>
            <th className="th text-right">Pedido</th><th className="th w-44 text-right">Aprobado</th>{conObs && <th className="th">Observación</th>}</tr></thead>
          <tbody>{lineas.map((l) => {
            const s = sel[l.id]
            return (
              <tr key={l.id} className={s.ok ? '' : 'bg-canvas text-muted'}>
                <td className="td text-center"><input type="checkbox" checked={s.ok} aria-label={`Aprobar ${l.descripcion}`} className="size-4 accent-brand-600"
                  onChange={(e) => setSel((x) => ({ ...x, [l.id]: { ...x[l.id], ok: e.target.checked } }))} /></td>
                <td className="td text-right font-mono text-xs font-semibold">{l.codigo}</td>
                <td className="td font-medium">{l.descripcion} <span className="text-xs text-muted">{l.unidadProducto}</span></td>
                <td className="td text-right tabular">{fmtQty(l.pedido)} {l.unidad}</td>
                <td className="td py-1">
                  <div className="flex items-center justify-end gap-1.5">
                    <input type="number" min={0} max={l.pedido} step="any" value={s.cant} disabled={!s.ok} onFocus={(e) => e.target.select()}
                      aria-label={`Cantidad aprobada de ${l.descripcion}`}
                      // no más de lo pedido
                      onChange={(e) => { const v = Number(e.target.value); setSel((x) => ({ ...x, [l.id]: { ...x[l.id], cant: v > l.pedido ? String(l.pedido) : v < 0 ? '0' : e.target.value } })) }}
                      className="field h-8 w-20 text-right tabular" />
                    <span className="w-16 text-xs text-muted">{l.unidad}</span>
                  </div>
                </td>
                {conObs && <td className="td text-xs text-muted">{l.motivo ?? ''}</td>}
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-4">
        <span className="text-xs text-muted">{marcados} de {lineas.length} productos aprobados. Lo no aprobado no pasa a cotización ni compra.</span>
        <SubmitButton confirm={marcados ? '¿Aprobar el requerimiento con los productos marcados?' : 'No marcó ningún producto: el requerimiento quedará rechazado. ¿Continuar?'}>
          {marcados ? 'Aprobar' : 'Rechazar requerimiento'}
        </SubmitButton>
      </div>
    </ActionForm>
  )
}
