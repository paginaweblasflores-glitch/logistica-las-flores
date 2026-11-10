'use client'

import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { Select } from '@/components/select'
import { registrarSalida, registrarConteo } from '../actions'

type Opc = { id: string; nombre: string }

/** Salida por concepto (pérdida, marketing, Santa Elena, cumpleaños…): la venta sale sola de «Venta del día». */
export function SalidaForm({ productoId, porcion, conceptos, ahora }: { productoId: string; porcion: string; conceptos: Opc[]; ahora: string }) {
  return (
    <ActionForm action={registrarSalida} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="producto" value={productoId} />
      <label><span className="label">Concepto <span className="req">*</span></span><Select name="concepto" options={conceptos} required placeholder="Elija…" /></label>
      <label><span className="label">Cantidad ({porcion}) <span className="req">*</span></span>
        <input type="number" step="any" min="0" name="cantidad" required className="field tabular" /></label>
      <label><span className="label">Fecha y hora</span><input type="datetime-local" name="fecha" defaultValue={ahora} className="field tabular" /></label>
      <label><span className="label">Observación</span><input name="observacion" placeholder="Ej.: Miss Mundo, autorizado por Mijail" className="field" /></label>
      <div className="flex justify-end sm:col-span-2"><SubmitButton>Registrar salida</SubmitButton></div>
    </ActionForm>
  )
}

/** Conteo físico: se compara con el saldo del kardex. */
export function ConteoForm({ productoId, porcion }: { productoId: string; porcion: string }) {
  return (
    <ActionForm action={registrarConteo} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="producto" value={productoId} />
      <label><span className="label">Contado ({porcion}) <span className="req">*</span></span>
        <input type="number" step="any" min="0" name="contado" required className="field tabular" /></label>
      <label><span className="label">Observación</span><input name="observacion" className="field" /></label>
      <div className="flex justify-end sm:col-span-2"><SubmitButton variant="outline">Registrar conteo</SubmitButton></div>
    </ActionForm>
  )
}
