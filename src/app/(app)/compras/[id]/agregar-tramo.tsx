'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { ComboInput } from '@/components/combo-input'
import { agregarTransporte } from '../actions'

type Opc = { id: string; nombre: string }

/** «+ Agregar tramo»: el formulario del flete se abre solo cuando se va a usar y se cierra al guardar. */
export function AgregarTramo({ compraId, localId, transportistas, ciudades, ciudadInicial, hoy, hayTramos }: {
  compraId: string; localId: string; transportistas: Opc[]; ciudades: Opc[]; ciudadInicial?: string; hoy: string; hayTramos: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  if (!abierto) {
    return (
      <div className="border-t border-line px-5 py-3">
        <button type="button" onClick={() => setAbierto(true)} className="enlace inline-flex items-center gap-1.5 text-sm">
          <Plus className="size-4" /> Agregar tramo
        </button>
      </div>
    )
  }
  return (
    <ActionForm action={agregarTransporte} onSuccess={() => setAbierto(false)} className="grid gap-3 border-t border-line p-5 md:grid-cols-6">
      <input type="hidden" name="compra_id" value={compraId} /><input type="hidden" name="local_id" value={localId} />
      <label className="md:col-span-2"><span className="label">Transportista <span className="req">*</span></span><ComboInput name="transportista" opciones={transportistas} placeholder="Elija o escriba: Shalom, taxi particular…" /></label>
      <label><span className="label">Fecha</span><input type="date" name="fecha" defaultValue={hoy} className="field" /></label>
      <label><span className="label">Desde (ciudad)</span><ComboInput name="ciudad" opciones={ciudades} placeholder="Lima, Ayacucho…" defaultValue={hayTramos ? '' : ciudadInicial} /></label>
      <label><span className="label">Hasta</span><input name="destino" className="field" placeholder="Agencia Shalom Huamanga, el local…" /></label>
      <label><span className="label">Costo S/ <span className="req">*</span></span><input type="number" step="0.01" min="0" name="costo" required className="field" /></label>
      <label className="md:col-span-2"><span className="label">Guía / boleta</span><input name="documento" className="field" /></label>
      <div className="flex items-end justify-end gap-2 md:col-span-4">
        <button type="button" onClick={() => setAbierto(false)} className="h-8 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-canvas">Cancelar</button>
        <SubmitButton size="sm">Guardar tramo</SubmitButton>
      </div>
    </ActionForm>
  )
}
