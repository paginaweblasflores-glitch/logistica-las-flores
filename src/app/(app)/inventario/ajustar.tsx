'use client'

import { useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { Select } from '@/components/select'
import { btnClass } from '@/components/ui'
import { ajustarStock } from './movimientos/actions'

const MOTIVOS = ['Faltante', 'Sobrante', 'Error de registro', 'Merma', 'Vencido', 'Otro'].map((m) => ({ id: m, nombre: m }))
const n = (v: number) => v.toLocaleString('es-PE', { maximumFractionDigits: 3 })

/**
 * «Ajustar» en la fila de Inventario: si en el almacén hay otra cantidad que la del sistema, se escribe la que hay
 * realmente; el sistema registra el ajuste por la diferencia con su motivo (queda en el Kardex).
 */
export function AjustarStock({ productoId, almacenId, nombre, unidad, actual }: {
  productoId: string; almacenId: string; nombre: string; unidad: string; actual: number
}) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const [contado, setContado] = useState('')
  const [motivo, setMotivo] = useState('')
  const valor = Number(contado.replace(',', '.'))
  const dif = contado.trim() === '' || !(valor >= 0) ? null : Math.round((valor - actual) * 1000) / 1000
  // el motivo se sugiere según la diferencia (faltante / sobrante); se puede elegir otro
  const sugerido = dif === null || dif === 0 ? '' : dif < 0 ? 'Faltante' : 'Sobrante'
  return (
    <>
      <button type="button" onClick={() => { setContado(''); setMotivo(''); dialogo.current?.showModal() }} title="Corregir la cantidad según lo que hay en el almacén"
        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs font-semibold whitespace-nowrap text-ink-700 hover:border-brand-600 hover:text-brand-600">
        <SlidersHorizontal className="size-3.5" /> Ajustar
      </button>
      <dialog ref={dialogo} onClick={(e) => { if (e.target === dialogo.current) dialogo.current?.close() }}
        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-2xl border border-line bg-white p-0 text-left text-ink-900 shadow-2xl backdrop:bg-ink-950/50">
        <ActionForm action={ajustarStock} onSuccess={() => dialogo.current?.close()} className="space-y-4 p-6">
          <input type="hidden" name="producto_id" value={productoId} />
          <input type="hidden" name="almacen" value={almacenId} />
          <div><h2 className="text-base font-bold">Ajustar stock</h2><p className="text-sm text-muted">{nombre}</p></div>
          <p className="rounded-lg bg-canvas px-3 py-2 text-sm">Stock en el sistema: <b>{n(actual)} {unidad}</b></p>
          <label className="block"><span className="label">Cantidad que hay realmente <span className="req">*</span></span>
            <input type="number" step="any" min="0" name="contado" value={contado} onChange={(e) => setContado(e.target.value)} required
              className="field tabular" placeholder="0" />
            {dif !== null && (
              <span className={`mt-1 block text-sm font-semibold ${dif === 0 ? 'text-muted' : dif < 0 ? 'text-brand-700' : 'text-leaf-600'}`}>
                {dif === 0 ? 'Cuadra: no hay nada que ajustar' : dif < 0 ? `Faltan ${n(-dif)} ${unidad}` : `Sobran ${n(dif)} ${unidad}`}
              </span>
            )}</label>
          <label className="block"><span className="label">Motivo <span className="req">*</span></span>
            <Select name="motivo" options={MOTIVOS} value={motivo || sugerido} onChange={setMotivo} required ariaLabel="Motivo del ajuste" /></label>
          <label className="block"><span className="label">Observación <span className="font-normal normal-case text-subtle">(opcional)</span></span>
            <input name="observacion" className="field" placeholder="Conteo del día, se encontró roto…" /></label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dialogo.current?.close()} className={btnClass('ghost')}>Cancelar</button>
            <SubmitButton listo={(d) => String(d.get('contado') ?? '') !== '' && Number(d.get('contado')) !== actual}>Guardar ajuste</SubmitButton>
          </div>
        </ActionForm>
      </dialog>
    </>
  )
}
