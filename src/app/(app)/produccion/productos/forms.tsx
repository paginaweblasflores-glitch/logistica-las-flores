'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { Select } from '@/components/select'
import { guardarProducto, guardarProveedor } from '../actions'

type Prod = { id?: string; nombre?: string; tipo?: string; unidad?: string; porcion?: string | null; gramos_porcion?: number | null
  usa_sacos?: boolean; hueso_grasa?: boolean; merma?: boolean; activo?: boolean }

const TIPOS = [{ id: 'kardex', nombre: 'Carne con kardex (lleva saldo)' }, { id: 'compra', nombre: 'Compra (papa, carne pulpa…)' }]
const UNIDADES = [{ id: 'KG', nombre: 'Kilos' }, { id: 'UND', nombre: 'Unidad' }]

/** Producto propio de Producción: no aparece en el almacén. */
export function ProductoForm({ p = {} }: { p?: Prod }) {
  const router = useRouter()
  const [tipo, setTipo] = useState(p.tipo ?? 'compra')
  const editar = !!p.id
  return (
    <ActionForm action={guardarProducto} resetOnSuccess={!editar} onSuccess={() => editar && router.push('/produccion/productos')} className="grid gap-4 md:grid-cols-4">
      {p.id && <input type="hidden" name="id" value={p.id} />}
      <label className="md:col-span-2"><span className="label">Nombre <span className="req">*</span></span><input name="nombre" required defaultValue={p.nombre} className="field uppercase" /></label>
      <label><span className="label">Tipo <span className="req">*</span></span><Select name="tipo" options={TIPOS} value={tipo} onChange={setTipo} required /></label>
      <label><span className="label">Se paga / pesa en</span><Select name="unidad" options={UNIDADES} defaultValue={p.unidad ?? 'KG'} /></label>
      {tipo === 'kardex' && <>
        <label><span className="label">Se cuenta en</span><input name="porcion" defaultValue={p.porcion ?? ''} placeholder="platos, presas, filetes…" className="field" /></label>
        <label><span className="label">Gramos por porción</span><input type="number" step="any" min="0" name="gramos" defaultValue={p.gramos_porcion ?? ''} placeholder="200" className="field tabular" /></label>
      </>}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2 pb-2 text-sm md:col-span-2">
        {tipo === 'compra' && <label className="flex items-center gap-2"><input type="checkbox" name="usa_sacos" defaultChecked={p.usa_sacos} className="size-4 accent-brand-600" />Llega en sacos</label>}
        {tipo === 'kardex' && <>
          <label className="flex items-center gap-2"><input type="checkbox" name="hueso_grasa" defaultChecked={p.hueso_grasa} className="size-4 accent-brand-600" />Hueso y grasa</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="merma" defaultChecked={p.merma} className="size-4 accent-brand-600" />Merma</label>
        </>}
        {editar && <label className="flex items-center gap-2"><input type="checkbox" name="activo" value="off" defaultChecked={p.activo === false} className="size-4 accent-brand-600" />Ya no se usa</label>}
      </div>
      <div className="flex items-end justify-end gap-2 md:col-span-4">
        {editar && <button type="button" onClick={() => router.push('/produccion/productos')} className="h-10 rounded-lg border border-line px-4 text-sm font-semibold hover:bg-canvas">Cancelar</button>}
        <SubmitButton>{editar ? 'Guardar cambios' : 'Agregar producto'}</SubmitButton>
      </div>
    </ActionForm>
  )
}

export function ProveedorForm({ p }: { p?: { id: string; nombre: string; telefono: string | null } }) {
  const router = useRouter()
  return (
    <ActionForm action={guardarProveedor} resetOnSuccess={!p} onSuccess={() => p && router.push('/produccion/productos')} className="grid gap-4 sm:grid-cols-[2fr_1fr_auto]">
      {p && <input type="hidden" name="id" value={p.id} />}
      <label><span className="label">Proveedor <span className="req">*</span></span><input name="nombre" required defaultValue={p?.nombre} className="field uppercase" /></label>
      <label><span className="label">Teléfono</span><input name="telefono" defaultValue={p?.telefono ?? ''} className="field tabular" /></label>
      <div className="flex items-end"><SubmitButton>{p ? 'Guardar' : 'Agregar'}</SubmitButton></div>
    </ActionForm>
  )
}
