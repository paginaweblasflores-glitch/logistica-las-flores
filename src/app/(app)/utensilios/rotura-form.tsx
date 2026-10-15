'use client'

import { useMemo, useState } from 'react'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { ProductPicker, type ProductoLite } from '@/components/product-picker'
import { fmtSoles } from '@/lib/format'
import { registrarRotura } from './actions'
import { Select } from '@/components/select'

type Opt = { id: string; nombre: string; local_id?: string | null }

export function RoturaForm({ locales, areas, almacenes, personal, localDefault, hoy }: {
  locales: Opt[]; areas: Opt[]; almacenes: Opt[]; personal: (Opt & { area?: string | null })[]; localDefault?: string; hoy: string
}) {
  const [local, setLocal] = useState(localDefault ?? locales[0]?.id ?? '')
  const [prod, setProd] = useState<ProductoLite | null>(null)
  const [precio, setPrecio] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [sel, setSel] = useState<string[]>([])
  const [grupal, setGrupal] = useState(false)
  const [pct, setPct] = useState('50')
  const pers = personal.filter((p) => !p.local_id || p.local_id === local)
  const total = (Number(cantidad) || 0) * (Number(precio) || 0)
  const porPersona = useMemo(() => (sel.length ? (total * Number(pct)) / 100 / sel.length : 0), [total, pct, sel])

  return (
    <ActionForm action={registrarRotura} className="space-y-4" onSuccess={() => { setSel([]); setProd(null); setPrecio(''); setCantidad('1') }}>
      <div className="grid gap-3 md:grid-cols-4">
        <label><span className="label">Negocio</span>
          <Select name="local" required value={local} onChange={setLocal} options={locales} /></label>
        <label><span className="label">Fecha</span><input type="date" name="fecha" defaultValue={hoy} className="field" /></label>
        <label><span className="label">Área</span>
          <Select key={local} name="area" options={areas.filter((a) => !a.local_id || a.local_id === local)} placeholder="—" agregar="area" local={local || null} /></label>
        <label><span className="label">Tipo</span><Select name="tipo" required defaultValue="rotura" options={[{ id: 'rotura', nombre: 'Rotura' }, { id: 'perdida', nombre: 'Pérdida' }, { id: 'mal_estado', nombre: 'Mal estado' }]} /></label>
        <div className="md:col-span-2"><span className="label">Bien (catálogo)</span>
          <input type="hidden" name="producto" value={prod?.id ?? ''} />
          {prod ? (
            <div className="flex h-9 items-center justify-between rounded-lg border border-line px-3 text-sm"><b>{prod.nombre}</b>
              <button type="button" className="text-xs text-brand-600" onClick={() => setProd(null)}>Cambiar</button></div>
          ) : <ProductPicker tipos={['utensilio', 'activo']} onSelect={(p) => { setProd(p); setPrecio(String(p.costo_referencia || '')) }} placeholder="Buscar vaso, plato, copa…" />}
        </div>
        <label className="md:col-span-2"><span className="label">…o descripción libre</span><input name="descripcion" className="field" placeholder="Ej. Pirex transparente crema" /></label>
        <label><span className="label">Cantidad</span><input type="number" name="cantidad" min="0.5" step="0.5" value={cantidad} onChange={(e) => setCantidad(e.target.value)} className="field" /></label>
        <label><span className="label">Precio unitario (S/)</span><input type="number" name="precio" min="0" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} required className="field" /></label>
        <label><span className="label">% que asume el colaborador</span><input type="number" name="pct" min="0" max="100" value={pct} onChange={(e) => setPct(e.target.value)} className="field" /></label>
        <label><span className="label">Dar de baja de</span>
          <Select key={`a${local}`} name="almacen" options={almacenes.filter((a) => a.local_id === local)} placeholder="No descontar stock" /></label>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="label mb-0">Responsables</span>
          <div className="flex gap-3 text-xs font-semibold">
            <button type="button" className="text-brand-600" onClick={() => { setSel(pers.map((p) => p.id)); setGrupal(true); setPct('100') }}>Todos (grupal)</button>
            <button type="button" className="text-muted" onClick={() => { setSel([]); setGrupal(false); setPct('50') }}>Limpiar</button>
          </div>
        </div>
        <input type="hidden" name="grupal" value={grupal ? 'on' : ''} />
        <div className="grid gap-1.5 rounded-lg border border-line p-2 sm:grid-cols-3 lg:grid-cols-4">
          {pers.map((p) => (
            <label key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-canvas">
              <input type="checkbox" name="responsables" value={p.id} checked={sel.includes(p.id)} className="size-4 accent-brand-600"
                     onChange={(e) => setSel((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} />
              <span className="truncate">{p.nombre}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-canvas px-4 py-3 text-sm">
        <span>Total {fmtSoles(total)} · Colaboradores {pct}% · <b>{sel.length ? `${fmtSoles(porPersona)} c/u (${sel.length})` : 'sin responsables'}</b> · Empresa {fmtSoles(total * (1 - Number(pct) / 100))}</span>
        <input name="observacion" placeholder="Observación" className="field w-64" />
        <SubmitButton>Registrar rotura</SubmitButton>
      </div>
    </ActionForm>
  )
}
