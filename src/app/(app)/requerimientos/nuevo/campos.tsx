'use client'

import { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import type { Opcion } from '@/lib/queries'
import { reducirImagen } from '@/lib/imagen'
import { btnClass } from '@/components/ui'
import { Select } from '@/components/select'

/** Negocio y área: las áreas se filtran por el negocio elegido (más las compartidas). */
export function NegocioArea({ locales, areas, localDefault }: { locales: Opcion[]; areas: Opcion[]; localDefault?: string }) {
  const [local, setLocal] = useState(localDefault ?? '')
  const opciones = areas.filter((a) => !a.local_id || a.local_id === local)
  return (
    <>
      <label className="md:col-span-2"><span className="label">Negocio (empresa) *</span>
        <Select name="local" required value={local} onChange={setLocal} options={locales} placeholder="Seleccione…" />
      </label>
      <label><span className="label">Área solicitante *</span>
        <Select key={local} name="area" required disabled={!local} options={opciones} placeholder={local ? 'Seleccione…' : 'Elija el negocio primero'} agregar="area" local={local || null} />
      </label>
    </>
  )
}

/**
 * Firma del solicitante: se sube una foto de la firma y se reduce en el navegador
 * (máx. 600 px de ancho) para guardarla junto al requerimiento e imprimirla en el documento.
 */
export function FirmaInput() {
  const [firma, setFirma] = useState('')
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  async function cargar(f: File | undefined) {
    setError('')
    if (!f) return
    try { setFirma(await reducirImagen(f, 600, 0.85)) } catch (e) { setError((e as Error).message) }
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <input type="hidden" name="firma" value={firma} />
      <div className="grid h-24 w-64 place-items-center overflow-hidden rounded-lg border border-dashed border-line bg-white">
        {firma
          ? <img src={firma} alt="Firma del solicitante" className="max-h-full max-w-full object-contain" />
          : <span className="px-3 text-center text-xs text-muted">Aquí aparecerá su firma</span>}
      </div>
      <div className="flex flex-col gap-2">
        <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => cargar(e.target.files?.[0])} />
        <button type="button" className={btnClass('outline', 'sm')} onClick={() => input.current?.click()}>
          <ImagePlus className="size-3.5" /> {firma ? 'Cambiar firma' : 'Subir foto de la firma'}
        </button>
        {firma && <button type="button" className={btnClass('ghost', 'sm')} onClick={() => setFirma('')}><Trash2 className="size-3.5" /> Quitar</button>}
        <span className="text-xs text-muted">Firme en un papel blanco y tómele una foto.</span>
        {error && <span className="text-xs font-semibold text-brand-700">{error}</span>}
      </div>
    </div>
  )
}
