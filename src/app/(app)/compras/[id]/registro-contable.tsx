'use client'

import { useState } from 'react'
import { BookCheck } from 'lucide-react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { Select } from '@/components/select'
import { Badge, Section } from '@/components/ui'
import { cn } from '@/lib/utils'
import { registrarComprobante } from '../actions'

export type RegistroContable = {
  estado: 'registrado' | 'observado'; tipo_sunat: string | null; serie: string | null; numero: string | null; fecha_emision: string | null
  doc_tipo: 'RUC' | 'DNI' | null; doc_numero: string | null; vendedor: string | null
  base: number | null; igv: number | null; total: number | null; periodo: string | null; observacion: string | null
}

/** Tabla 10 de SUNAT: los comprobantes con los que se compra. */
const TIPOS_SUNAT = [
  { id: '01', nombre: '01 · Factura' }, { id: '03', nombre: '03 · Boleta de venta' },
  { id: '04', nombre: '04 · Liquidación de compra' }, { id: '12', nombre: '12 · Ticket' },
]
const DOCS = [{ id: 'RUC', nombre: 'RUC' }, { id: 'DNI', nombre: 'DNI' }]
const r2 = (n: number) => Math.round(n * 100) / 100
const num = (s: string) => Number(s.replace(',', '.'))

/**
 * La contadora registra el comprobante de la compra (registro de compras) o lo observa con su motivo.
 * Llega prellenado con lo que registró el almacén al recibir y los datos del proveedor; ella confirma o corrige.
 */
export function RegistroContableForm({ compraId, inicial, sugerido }: {
  compraId: string; inicial: RegistroContable | null; sugerido: Omit<RegistroContable, 'estado' | 'observacion'>
}) {
  const v = inicial?.estado === 'registrado' ? inicial : { ...sugerido, ...(inicial ? { periodo: inicial.periodo ?? sugerido.periodo } : {}) }
  const [observar, setObservar] = useState(inicial?.estado === 'observado')
  const [total, setTotal] = useState(v.total != null ? String(v.total) : '')
  const [base, setBase] = useState(v.base != null ? String(v.base) : '')
  const [igv, setIgv] = useState(v.igv != null ? String(v.igv) : '')
  const [conIgv, setConIgv] = useState(v.igv == null ? v.tipo_sunat === '01' : Number(v.igv) > 0)

  // al cambiar el total (o si lleva IGV), base e IGV se recalculan; se pueden corregir a mano
  function repartir(t: string, lleva: boolean) {
    const n = num(t)
    if (!(n > 0)) return
    const b = lleva ? r2(n / 1.18) : n
    setBase(String(b))
    setIgv(String(r2(n - b)))
  }
  const cuadra = !total || Math.abs((num(base) || 0) + (num(igv) || 0) - num(total)) <= 0.05

  return (
    <Section icon={BookCheck} title="Registro contable" className="no-print mb-5"
      actions={inicial ? <Badge tone={inicial.estado === 'registrado' ? 'green' : 'red'}>{inicial.estado === 'registrado' ? '✓ Registrado' : 'Observado'}</Badge> : <Badge tone="amber">Pendiente</Badge>}>
      <ActionForm action={registrarComprobante} className="space-y-4">
        <input type="hidden" name="compra_id" value={compraId} />
        <input type="hidden" name="estado" value={observar ? 'observado' : 'registrado'} />
        <div className="inline-flex rounded-lg border border-line p-0.5 text-sm" role="radiogroup" aria-label="Qué hacer con el comprobante">
          {[[false, 'Registrar comprobante'], [true, 'Observar']].map(([o, l]) => (
            <button key={String(o)} type="button" role="radio" aria-checked={observar === o} onClick={() => setObservar(o as boolean)}
              className={cn('rounded-md px-3 py-1.5 font-semibold', observar === o ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-canvas')}>{l as string}</button>
          ))}
        </div>

        {observar ? (
          <label className="block"><span className="label">Observación <span className="req">*</span></span>
            <input name="observacion" defaultValue={inicial?.observacion ?? ''} required className="field" placeholder="El RUC no corresponde, falta la factura original…" /></label>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <label className="md:col-span-2"><span className="label">Tipo de comprobante <span className="req">*</span></span>
                <Select name="tipo_sunat" options={TIPOS_SUNAT} defaultValue={v.tipo_sunat} required /></label>
              <label><span className="label">Serie <span className="req">*</span></span><input name="serie" defaultValue={v.serie ?? ''} required className="field uppercase" placeholder="F001" /></label>
              <label><span className="label">Número <span className="req">*</span></span><input name="numero" defaultValue={v.numero ?? ''} required className="field" placeholder="000123" /></label>
              <label><span className="label">Fecha de emisión <span className="req">*</span></span><input type="date" name="fecha_emision" defaultValue={v.fecha_emision ?? ''} required className="field" /></label>
              <label><span className="label">Documento del vendedor <span className="req">*</span></span><Select name="doc_tipo" options={DOCS} defaultValue={v.doc_tipo ?? 'RUC'} required /></label>
              <label><span className="label">N° de RUC / DNI <span className="req">*</span></span><input name="doc_numero" defaultValue={v.doc_numero ?? ''} required inputMode="numeric" className="field" /></label>
              <label><span className="label">Mes contable <span className="req">*</span></span><input type="month" name="periodo" defaultValue={v.periodo ?? ''} required className="field" /></label>
              <label className="md:col-span-4"><span className="label">Vendedor (razón social o nombre)</span><input name="vendedor" defaultValue={v.vendedor ?? ''} className="field uppercase" /></label>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <label><span className="label">Total del comprobante (S/) <span className="req">*</span></span>
                <input name="total" value={total} required inputMode="decimal" className="field text-right"
                  onChange={(e) => { setTotal(e.target.value); repartir(e.target.value, conIgv) }} /></label>
              <label className="flex items-end gap-2 pb-2.5 text-sm">
                <input type="checkbox" checked={conIgv} onChange={(e) => { setConIgv(e.target.checked); repartir(total, e.target.checked) }} className="size-4" />
                Incluye IGV 18 %
              </label>
              <label><span className="label">Base imponible</span><input name="base" value={base} onChange={(e) => setBase(e.target.value)} inputMode="decimal" className="field text-right" /></label>
              <label><span className="label">IGV</span><input name="igv" value={igv} onChange={(e) => setIgv(e.target.value)} inputMode="decimal" className="field text-right" /></label>
            </div>
            {!cuadra && <p className="text-sm font-semibold text-brand-700">La base más el IGV no suman el total.</p>}
          </>
        )}
        <div className="flex justify-end">
          <SubmitButton>{observar ? 'Guardar observación' : inicial?.estado === 'registrado' ? 'Guardar cambios' : 'Marcar como registrado'}</SubmitButton>
        </div>
      </ActionForm>
    </Section>
  )
}
