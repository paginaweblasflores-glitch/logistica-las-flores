'use client'

import { useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { btnClass } from '@/components/ui'
import { recibirTraspaso, cancelarTraspaso } from '../actions'

/** cantidad y unidad del almacén que recibe; `factor` = cuántas de sus unidades trae cada unidad enviada; `enviado` = como se envió */
type Linea = { id: string; producto: string; unidad: string; cantidad: number; factor?: number; enviado?: string }

/** Recepción línea por línea: lo desmarcado (o lo que falte) vuelve solo al almacén de origen. */
export function RecepcionTraspaso({ id, lineas }: { id: string; lineas: Linea[] }) {
  const [sel, setSel] = useState<Record<string, { ok: boolean; cant: string }>>(
    Object.fromEntries(lineas.map((l) => [l.id, { ok: true, cant: String(l.cantidad) }])))
  const [rechazar, setRechazar] = useState(false)
  // se envía en la unidad de origen (lo recibido ÷ factor): el sistema lo vuelve a convertir al registrar la entrada
  const payload = lineas.map((l) => ({ detalle_id: l.id, cantidad: sel[l.id].ok ? Math.round(Math.min(Math.max(Number(sel[l.id].cant) || 0, 0), l.cantidad) / (l.factor || 1) * 1000) / 1000 : 0 }))
  const devueltos = lineas.filter((l) => !sel[l.id].ok || (Number(sel[l.id].cant) || 0) < l.cantidad).length

  if (rechazar) {
    return (
      <ActionForm action={cancelarTraspaso} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <label className="block"><span className="label">Motivo del rechazo *</span>
          <input name="motivo" required className="field" placeholder="Llegó dañado, no corresponde, no se pidió…" /></label>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={btnClass('outline')} onClick={() => setRechazar(false)}>Volver</button>
          <SubmitButton variant="danger" confirm="¿Rechazar todo el traspaso? La mercadería volverá al almacén de origen.">Rechazar todo</SubmitButton>
        </div>
      </ActionForm>
    )
  }

  return (
    <ActionForm action={recibirTraspaso} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="lineas" value={JSON.stringify(payload)} />
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead><tr><th className="th w-12">Aceptar</th><th className="th">Producto</th><th className="th text-right">Enviado</th><th className="th w-40 text-right">Recibo</th></tr></thead>
          <tbody>{lineas.map((l) => {
            const s = sel[l.id]
            return (
              <tr key={l.id} className={s.ok ? '' : 'bg-brand-50/40 text-muted'}>
                <td className="td text-center">
                  <input type="checkbox" checked={s.ok} aria-label={`Aceptar ${l.producto}`} className="size-4 accent-brand-600"
                    onChange={(e) => setSel((x) => ({ ...x, [l.id]: { ...x[l.id], ok: e.target.checked } }))} />
                </td>
                <td className="td font-medium">{l.producto}</td>
                <td className="td text-right tabular">{l.enviado ?? `${l.cantidad} ${l.unidad}`}{(l.factor ?? 1) !== 1 && <span className="block text-xs text-muted">= {l.cantidad} {l.unidad}</span>}</td>
                <td className="td py-1">
                  <input type="number" min={0} max={l.cantidad} step="any" value={s.cant} disabled={!s.ok} aria-label={`Cantidad recibida de ${l.producto}`}
                    onFocus={(e) => e.target.select()}
                    // nunca más de lo enviado: si escribe más, queda en lo enviado (menos sí: la diferencia vuelve al origen)
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      const cant = v > l.cantidad ? String(l.cantidad) : v < 0 ? '0' : e.target.value
                      setSel((x) => ({ ...x, [l.id]: { ...x[l.id], cant } }))
                    }}
                    className="field h-8 text-right tabular" />
                  <span className="mt-0.5 block text-right text-[11px] text-muted">en {l.unidad}</span>
                </td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      <div>
        <p className="text-xs text-muted">{devueltos ? `${devueltos} línea(s) no se reciben completas: lo que falte vuelve al almacén de origen.` : 'Se recibe todo lo enviado.'} No se puede recibir más de lo enviado.</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={btnClass('outline')} onClick={() => setRechazar(true)}>Rechazar todo…</button>
        <SubmitButton confirm="¿Confirmar la recepción? Lo aceptado se sumará a su stock.">Confirmar recepción</SubmitButton>
      </div>
    </ActionForm>
  )
}

/** El origen puede cancelar mientras el traspaso siga pendiente; la mercadería vuelve a su stock. */
export function CancelarTraspaso({ id }: { id: string }) {
  const [abierto, setAbierto] = useState(false)
  if (!abierto) return <button type="button" className={btnClass('outline', 'sm')} onClick={() => setAbierto(true)}>Cancelar envío…</button>
  return (
    <ActionForm action={cancelarTraspaso} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="min-w-64"><span className="label">Motivo de la cancelación *</span><input name="motivo" required className="field h-8" /></label>
      <SubmitButton size="sm" variant="danger" confirm="¿Cancelar el envío? La mercadería vuelve a su stock.">Cancelar envío</SubmitButton>
      <button type="button" className={btnClass('ghost', 'sm')} onClick={() => setAbierto(false)}>Volver</button>
    </ActionForm>
  )
}
