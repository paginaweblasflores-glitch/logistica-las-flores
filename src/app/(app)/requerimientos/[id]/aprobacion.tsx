'use client'

import { useMemo, useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { aprobarRequerimiento } from '../actions'
import { sugerirAprobador, type Aprobador } from '@/lib/aprobadores'

type Linea = { id: string; descripcion: string; imagen?: string | null; solicitada: number; precio: number | null }

const soles = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Aprobación por producto: se marcan los que se aprueban (y cuánto). Los no marcados quedan en 0
 * y no pasan a cotización ni compra. El aprobador se sugiere por el monto aprobado.
 */
export function Aprobacion({ id, lineas, aprobadores, sinAprobador = false }: {
  id: string; lineas: Linea[]; aprobadores: Aprobador[]
  /** requerimiento del almacén: solo se aprueba (sin «quién lo aprobó» ni precios) */
  sinAprobador?: boolean
}) {
  const [sel, setSel] = useState<Record<string, { ok: boolean; cant: string }>>(
    Object.fromEntries(lineas.map((l) => [l.id, { ok: true, cant: String(l.solicitada) }])))
  const monto = useMemo(() => lineas.reduce((s, l) => s + (sel[l.id].ok ? (Number(sel[l.id].cant) || 0) * Number(l.precio ?? 0) : 0), 0), [sel, lineas])
  const sugerido = sugerirAprobador(aprobadores, monto)
  const [aprobador, setAprobador] = useState<string>('')
  // se elige quién aprobó (firmó la hoja impresa); el sugerido por monto es solo una referencia
  const elegido = aprobador
  const payload = Object.fromEntries(lineas.map((l) => [l.id, sel[l.id].ok ? Number(sel[l.id].cant) || 0 : 0]))
  const marcados = lineas.filter((l) => sel[l.id].ok && Number(sel[l.id].cant) > 0).length

  return (
    <ActionForm action={aprobarRequerimiento} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="aprobadas" value={JSON.stringify(payload)} />
      <input type="hidden" name="aprobador" value={elegido} />
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead><tr><th className="th w-16">Aprobar</th><th className="th">Bien solicitado</th><th className="th text-right">Solicitado</th><th className="th w-36 text-right">Aprobado</th>{!sinAprobador && <th className="th text-right">Precio est.</th>}</tr></thead>
          <tbody>{lineas.map((l) => {
            const s = sel[l.id]
            return (
              <tr key={l.id} className={s.ok ? '' : 'bg-canvas text-muted'}>
                <td className="td text-center"><input type="checkbox" checked={s.ok} aria-label={`Aprobar ${l.descripcion}`} className="size-4 accent-brand-600"
                  onChange={(e) => setSel((x) => ({ ...x, [l.id]: { ...x[l.id], ok: e.target.checked } }))} /></td>
                <td className="td font-medium"><span className="flex items-center gap-2">{l.imagen && <img src={l.imagen} alt="" className="size-10 shrink-0 rounded border border-line object-contain" />}{l.descripcion}</span></td>
                <td className="td text-right tabular">{l.solicitada}</td>
                <td className="td py-1"><input type="number" min={0} step="any" value={s.cant} disabled={!s.ok} onFocus={(e) => e.target.select()}
                  aria-label={`Cantidad aprobada de ${l.descripcion}`} onChange={(e) => setSel((x) => ({ ...x, [l.id]: { ...x[l.id], cant: e.target.value } }))}
                  className="field h-8 text-right tabular" /></td>
                {!sinAprobador && <td className="td text-right tabular">{l.precio ? soles(Number(l.precio)) : '—'}</td>}
              </tr>
            )
          })}</tbody>
        </table>
      </div>

      {!sinAprobador && <fieldset className="space-y-2">
        <legend className="label">¿Quién lo aprobó? (firmó la hoja impresa) · monto aprobado {soles(monto)}</legend>
        <div className="grid gap-2 md:grid-cols-3">
          {aprobadores.map((a) => (
            <label key={a.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
              <input type="radio" name="_aprobador" checked={elegido === a.id} onChange={() => setAprobador(a.id)} className="mt-0.5 size-4 accent-brand-600" />
              <span><b className="block">{a.nombre}</b><span className="text-xs text-muted">{a.cargo} · {a.monto_hasta === null ? 'montos mayores' : `hasta ${soles(Number(a.monto_hasta))}`}</span>
                {sugerido?.id === a.id && <span className="mt-1 block text-xs font-semibold text-leaf-600">Sugerido por el monto</span>}</span>
            </label>
          ))}
        </div>
      </fieldset>}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="text-xs text-muted">{marcados} de {lineas.length} productos aprobados. Lo no aprobado no pasa a cotización ni compra.
          {marcados > 0 && !elegido && !sinAprobador && <b className="block text-brand-700">Elija arriba quién lo aprobó.</b>}</span>
        <SubmitButton confirm={marcados ? '¿Aprobar el requerimiento con los productos marcados?' : 'No marcó ningún producto: el requerimiento quedará rechazado. ¿Continuar?'}>
          {marcados ? 'Aprobar' : 'Rechazar requerimiento'}
        </SubmitButton>
      </div>
    </ActionForm>
  )
}
