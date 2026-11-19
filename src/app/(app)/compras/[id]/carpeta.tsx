'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FolderOpen, Paperclip, Upload, LoaderCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { Select } from '@/components/select'
import { Badge, Section, btnClass, type Tone } from '@/components/ui'
import { MEDIOS_PAGO, type EstadoItem, type ItemCarpeta, type TipoDocCarpeta } from '@/lib/carpeta'
import { cn } from '@/lib/utils'
import { guardarDocumentoCompra } from '../actions'

export type ItemConArchivo = ItemCarpeta & { url?: string | null }

const ESTADO: Record<EstadoItem, { tone: Tone; label: string }> = {
  listo: { tone: 'green', label: '✓ Listo' }, pendiente: { tone: 'amber', label: 'Pendiente' },
  no_aplica: { tone: 'gray', label: 'No aplica' }, invalido: { tone: 'red', label: 'Sin comprobante válido' },
  observado: { tone: 'red', label: 'Observado' },
}

/**
 * Carpeta de la compra: los 6 documentos que sustentan la orden, con quién los registra y su archivo.
 * Cada usuario edita solo lo suyo (`editables`): Logística proforma, comprobante, guía y pago; el almacén guía y comprobante.
 */
export function Carpeta({ compraId, items, editables, montoSugerido, hoy }: {
  compraId: string; items: ItemConArchivo[]; editables: TipoDocCarpeta[]; montoSugerido: number; hoy: string
}) {
  const [abierto, setAbierto] = useState<TipoDocCarpeta | null>(null)
  const listos = items.filter((i) => i.estado === 'listo' || i.estado === 'no_aplica').length
  return (
    <Section icon={FolderOpen} title="Carpeta de la compra" className="no-print mb-5" bodyClassName="p-0"
      stats={[{ label: 'Documentos', value: `${listos} de ${items.length}` }]}>
      <ol className="divide-y divide-line">
        {items.map((it) => {
          const puede = !!it.tipo && editables.includes(it.tipo)
          const editando = abierto === it.tipo && !!it.tipo
          return (
            <li key={it.n} className="px-5 py-3">
              <div className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[2.25rem_minmax(12rem,1.1fr)_9.5rem_minmax(0,1.4fr)_auto]">
                <span className="grid size-8 place-items-center rounded-lg bg-canvas text-xs font-bold text-ink-700">{it.n}</span>
                <div><p className="font-semibold">{it.titulo}</p><p className="text-xs text-muted">{it.responsable}</p></div>
                <span><Badge tone={ESTADO[it.estado].tone}>{ESTADO[it.estado].label}</Badge></span>
                <p className="text-sm text-ink-700">{it.detalle ?? <span className="text-muted">—</span>}</p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {it.enlace && <Link href={it.enlace.href} className="enlace text-sm">{it.enlace.label}</Link>}
                  {it.url && (
                    <a href={it.url} target="_blank" rel="noopener noreferrer" className="enlace inline-flex items-center gap-1 text-sm">
                      <Paperclip className="size-3.5" /> {it.doc?.archivo_nombre ?? 'Archivo'}
                    </a>
                  )}
                  {puede && !editando && (
                    <button type="button" className={btnClass('outline', 'sm')} onClick={() => setAbierto(it.tipo!)}>
                      {it.doc || (it.tipo === 'comprobante' && it.estado !== 'pendiente') ? 'Editar' : 'Registrar'}
                    </button>
                  )}
                </div>
              </div>
              {editando && (
                <EditorDocumento key={it.tipo} compraId={compraId} item={it} montoSugerido={montoSugerido} hoy={hoy} cerrar={() => setAbierto(null)} />
              )}
            </li>
          )
        })}
      </ol>
    </Section>
  )
}

function EditorDocumento({ compraId, item, montoSugerido, hoy, cerrar }: {
  compraId: string; item: ItemConArchivo; montoSugerido: number; hoy: string; cerrar: () => void
}) {
  const tipo = item.tipo!
  const d = item.doc
  const [noAplica, setNoAplica] = useState(d?.estado === 'no_aplica')
  const puedeNoAplicar = tipo === 'proforma' || tipo === 'guia'
  return (
    <ActionForm action={guardarDocumentoCompra} onSuccess={cerrar} className="mt-3 space-y-3 rounded-xl border border-line bg-canvas/50 p-4">
      <input type="hidden" name="compra_id" value={compraId} />
      <input type="hidden" name="tipo" value={tipo} />
      {puedeNoAplicar && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="no_aplica" value="1" checked={noAplica} onChange={(e) => setNoAplica(e.target.checked)} className="size-4" />
          No aplica {tipo === 'guia' ? '(compra local, sin traslado de mercadería)' : '(compra sin proforma)'}
        </label>
      )}
      {noAplica ? (
        <label className="block"><span className="label">¿Por qué no aplica? <span className="req">*</span></span>
          <input name="nota" defaultValue={d?.nota ?? ''} required className="field" placeholder={tipo === 'guia' ? 'Compra en mercado local, se trajo en mano' : 'Compra menor sin cotización'} /></label>
      ) : (
        <div className="grid gap-3 md:grid-cols-4">
          {tipo === 'proforma' && <>
            <label><span className="label">N° de proforma</span><input name="numero" defaultValue={d?.numero ?? ''} className="field" placeholder="Opcional" /></label>
            <label><span className="label">Fecha</span><input type="date" name="fecha" defaultValue={d?.fecha ?? ''} className="field" /></label>
          </>}
          {tipo === 'guia' && <>
            <label><span className="label">N° de guía</span><input name="numero" defaultValue={d?.numero ?? ''} className="field" placeholder="T001-000123" /></label>
            <label><span className="label">Fecha de emisión</span><input type="date" name="fecha" defaultValue={d?.fecha ?? ''} className="field" /></label>
          </>}
          {tipo === 'pago' && <>
            <label><span className="label">Fecha de pago <span className="req">*</span></span><input type="date" name="fecha" defaultValue={d?.fecha ?? hoy} required className="field" /></label>
            <label><span className="label">Monto (S/) <span className="req">*</span></span>
              <input name="monto" inputMode="decimal" defaultValue={d?.monto ?? (montoSugerido > 0 ? montoSugerido.toFixed(2) : '')} required className="field text-right" /></label>
            <label><span className="label">Medio de pago</span><Select name="medio" options={MEDIOS_PAGO} defaultValue={d?.medio ?? 'Transferencia'} /></label>
            <label><span className="label">N° de operación</span><input name="numero" defaultValue={d?.numero ?? ''} className="field" placeholder="Opcional" /></label>
          </>}
          {tipo === 'comprobante' && (
            <p className="text-sm text-muted md:col-span-2">El tipo y número del comprobante se registran con la llegada. Aquí se adjunta la foto o el PDF.</p>
          )}
          <div className="md:col-span-2"><span className="label">Archivo (foto o PDF)</span><SubirArchivo compraId={compraId} tipo={tipo} actual={d?.archivo_nombre ?? null} /></div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={btnClass('ghost', 'sm')} onClick={cerrar}>Cancelar</button>
        <SubmitButton size="sm">Guardar</SubmitButton>
      </div>
    </ActionForm>
  )
}

const MAX_MB = 10

/** Sube el archivo directo al almacenamiento (privado) y deja su ruta en el formulario. */
function SubirArchivo({ compraId, tipo, actual }: { compraId: string; tipo: TipoDocCarpeta; actual: string | null }) {
  const [subido, setSubido] = useState<{ path: string; nombre: string; mime: string } | null>(null)
  const [estado, setEstado] = useState<'' | 'subiendo' | 'error'>('')
  const [error, setError] = useState('')

  async function subir(f: File | undefined) {
    if (!f) return
    if (!(f.type.startsWith('image/') || f.type === 'application/pdf')) { setEstado('error'); setError('Solo fotos o PDF.'); return }
    if (f.size > MAX_MB * 1024 * 1024) { setEstado('error'); setError(`El archivo pasa de ${MAX_MB} MB.`); return }
    setEstado('subiendo')
    const ext = (f.name.split('.').pop() ?? 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
    const path = `compras/${compraId}/${tipo}-${Date.now()}.${ext}`
    const { error: e } = await createClient().storage.from('documentos').upload(path, f, { contentType: f.type })
    if (e) { setEstado('error'); setError('No se pudo subir el archivo. Intente de nuevo.'); return }
    setSubido({ path, nombre: f.name, mime: f.type })
    setEstado('')
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="archivo_path" value={subido?.path ?? ''} />
      <input type="hidden" name="archivo_nombre" value={subido?.nombre ?? ''} />
      <input type="hidden" name="archivo_mime" value={subido?.mime ?? ''} />
      <label className={cn(btnClass('outline', 'sm'), 'cursor-pointer', estado === 'subiendo' && 'pointer-events-none opacity-60')}>
        {estado === 'subiendo' ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        {estado === 'subiendo' ? 'Subiendo…' : subido || actual ? 'Cambiar archivo' : 'Elegir archivo'}
        <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => subir(e.target.files?.[0])} />
      </label>
      <span className="text-xs text-muted">{subido ? `✓ ${subido.nombre}` : actual ? `Actual: ${actual}` : `Foto o PDF · máx. ${MAX_MB} MB`}</span>
      {estado === 'error' && <span className="text-xs text-brand-700">{error}</span>}
    </div>
  )
}
