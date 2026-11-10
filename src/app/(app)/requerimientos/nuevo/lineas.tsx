'use client'

import { useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { FotoCelda } from '@/components/line-items'
import { useUnidades } from '@/components/unidad-linea'
import { Select } from '@/components/select'
import { fmtQty, fmtSoles } from '@/lib/format'
import { reducirImagen } from '@/lib/imagen'

type Bien = { descripcion: string; imagen: string; marca: string; cantidad: string; unidad_id: string; precio_estimado: string; motivo: string; area_destino: string }
const vacio = (): Bien => ({ descripcion: '', imagen: '', marca: '', cantidad: '', unidad_id: '', precio_estimado: '', motivo: '', area_destino: '' })

/**
 * Bienes del requerimiento de un área (se escriben; el catálogo del almacén es solo de los almacenes).
 * Patrón «agregar a la lista»: se llena el formulario, «Agregar» lo pasa a la lista y los campos quedan
 * vacíos para el siguiente. En la lista se puede corregir (lápiz) o quitar cada bien.
 */
export function ReqLineas() {
  const u = useUnidades()
  const und = Object.values(u).find((x) => x.codigo === 'UND')?.id ?? ''
  const unidades = useMemo(() => Object.values(u).sort((a, b) => a.orden - b.orden).map((x) => ({ id: x.id, nombre: x.nombre })), [u])
  const nombreUnidad = (id: string) => u[id || und]?.nombre ?? 'Unidad'

  const [bienes, setBienes] = useState<Bien[]>([])
  const [form, setForm] = useState<Bien>(vacio())
  const [editando, setEditando] = useState<number | null>(null)
  const [vuelta, setVuelta] = useState(0) // limpia la foto al agregar
  const nombreRef = useRef<HTMLInputElement>(null)
  const set = (k: keyof Bien, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const listo = form.descripcion.trim() !== '' && Number(form.cantidad) > 0

  function agregar() {
    if (!listo) return
    const b = { ...form, descripcion: form.descripcion.trim().toUpperCase(), unidad_id: form.unidad_id || und }
    setBienes((bs) => (editando === null ? [...bs, b] : bs.map((x, i) => (i === editando ? b : x))))
    setForm(vacio()); setEditando(null); setVuelta((v) => v + 1)
    nombreRef.current?.focus()
  }
  function quitar(i: number) {
    setBienes((bs) => bs.filter((_, j) => j !== i))
    if (editando === i) { setForm(vacio()); setEditando(null); setVuelta((v) => v + 1) }
    else if (editando !== null && i < editando) setEditando(editando - 1)
  }
  function editar(i: number) { setForm(bienes[i]); setEditando(i); setVuelta((v) => v + 1); nombreRef.current?.focus() }
  // Enter en cualquier campo agrega (y no envía la solicitud)
  const alEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }

  const lineas = bienes.map((b) => ({ producto_id: null, descripcion: b.descripcion, unidad: nombreUnidad(b.unidad_id), unidad_id: b.unidad_id || und || null,
    cantidad: b.cantidad, imagen: b.imagen, marca: b.marca, precio_estimado: b.precio_estimado, motivo: b.motivo, area_destino: b.area_destino }))
  const importe = (b: Bien) => (Number(b.cantidad) || 0) * (Number(b.precio_estimado) || 0)
  const total = bienes.reduce((s, b) => s + importe(b), 0)

  return (
    <div className="space-y-4">
      <input type="hidden" name="lineas" value={JSON.stringify(lineas)} />

      {/* 1) Agregar bien */}
      {/* pegar una imagen (Ctrl+V) con el cursor en cualquier campo de este formulario la toma como foto */}
      <div className="rounded-xl border border-line bg-canvas/40 p-4" onPaste={(e) => {
        const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/'))
        if (f) { e.preventDefault(); reducirImagen(f, 480, 0.8).then((v) => set('imagen', v)).catch(() => {}) }
      }}>
        <p className="mb-3 text-sm font-semibold">{editando === null ? 'Agregar bien' : `Corregir el bien ${editando + 1}`}</p>
        <div className="grid gap-3 md:grid-cols-6">
          <label className="md:col-span-4"><span className="label">Producto / bien <span className="req">*</span></span>
            <input ref={nombreRef} value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} onKeyDown={alEnter} className="field" placeholder="Ej.: Pelota de vóley" /></label>
          <label><span className="label">Cantidad <span className="req">*</span></span>
            <input type="number" step="any" min="0" value={form.cantidad} onChange={(e) => set('cantidad', e.target.value)} onKeyDown={alEnter} className="field text-right tabular" /></label>
          <div><span className="label">Unidad</span>
            <Select value={form.unidad_id || und} onChange={(v) => set('unidad_id', v)} options={unidades} ariaLabel="Unidad" /></div>
          <label className="md:col-span-2"><span className="label">Marca</span>
            <input value={form.marca} onChange={(e) => set('marca', e.target.value)} onKeyDown={alEnter} className="field" /></label>
          <label className="md:col-span-2"><span className="label">Precio estimado (S/)</span>
            <input type="number" step="any" min="0" value={form.precio_estimado} onChange={(e) => set('precio_estimado', e.target.value)} onKeyDown={alEnter} className="field text-right tabular" /></label>
          <label className="md:col-span-2"><span className="label">Área que lo usará</span>
            <input value={form.area_destino} onChange={(e) => set('area_destino', e.target.value)} onKeyDown={alEnter} className="field" /></label>
          <label className="md:col-span-6"><span className="label">Motivo</span>
            <input value={form.motivo} onChange={(e) => set('motivo', e.target.value)} onKeyDown={alEnter} className="field" /></label>
          <div className="md:col-span-4"><span className="label">Foto ref.</span>
            <FotoCelda key={vuelta} grande value={form.imagen} onChange={(v) => set('imagen', v)} etiqueta="Foto referencial" /></div>
          <div className="flex items-end justify-end gap-2 md:col-span-2">
            {editando !== null && <button type="button" onClick={() => { setForm(vacio()); setEditando(null); setVuelta((v) => v + 1) }}
              className="h-10 rounded-lg border border-field px-3 text-sm font-semibold hover:bg-white">Cancelar</button>}
            <button type="button" onClick={agregar} disabled={!listo}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">
              <Plus className="size-4" /> {editando === null ? 'Agregar' : 'Guardar'}</button>
          </div>
        </div>
      </div>

      {/* 2) Lo agregado */}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead><tr><th className="th w-12">Ítem</th><th className="th">Bien</th><th className="th text-right">Cantidad</th><th className="th text-right">Precio est.</th>
            <th className="th text-right">Importe</th><th className="th">Área</th><th className="th w-20" /></tr></thead>
          <tbody>
            {bienes.length === 0 && <tr><td colSpan={7} className="td py-6 text-center text-muted">Aún no hay bienes. Llene el formulario de arriba y pulse «Agregar».</td></tr>}
            {bienes.map((b, i) => (
              <tr key={i} className={editando === i ? 'bg-brand-50' : ''}>
                <td className="td text-muted tabular">{i + 1}</td>
                <td className="td">
                  <span className="flex items-center gap-2.5">
                    {b.imagen && <img src={b.imagen} alt="" className="size-10 shrink-0 rounded border border-line object-contain" />}
                    <span><span className="font-medium">{b.descripcion}</span>{b.marca && <span className="text-xs text-muted"> · {b.marca}</span>}
                      {b.motivo && <span className="block text-xs text-muted">{b.motivo}</span>}</span>
                  </span>
                </td>
                <td className="td text-right tabular">{fmtQty(Number(b.cantidad))} {nombreUnidad(b.unidad_id)}</td>
                <td className="td text-right tabular">{b.precio_estimado ? fmtSoles(Number(b.precio_estimado)) : '—'}</td>
                <td className="td text-right font-semibold tabular">{fmtSoles(importe(b))}</td>
                <td className="td text-sm">{b.area_destino || '—'}</td>
                <td className="td py-1">
                  <div className="flex justify-end gap-1">
                    <button type="button" onClick={() => editar(i)} aria-label={`Corregir ${b.descripcion}`} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink-900"><Pencil className="size-4" /></button>
                    <button type="button" onClick={() => quitar(i)}
                      aria-label={`Quitar ${b.descripcion}`} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-brand-50 hover:text-brand-600"><Trash2 className="size-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {bienes.length > 0 && (
              <tr className="bg-canvas/60"><td className="td text-right font-semibold" colSpan={4}>Total</td>
                <td className="td text-right text-base font-bold tabular">{fmtSoles(total)}</td><td colSpan={2} /></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
