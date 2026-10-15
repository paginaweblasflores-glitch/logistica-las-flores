'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { ActionForm } from '@/components/action-form'
import { ProductoFoto } from '@/components/producto-foto'
import { SubmitButton } from '@/components/submit-button'
import { btnClass } from '@/components/ui'
import { cn } from '@/lib/utils'
import { guardarFotoProducto } from '../actions'

const TIPOS = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/**
 * Foto referencial del producto: ayuda a reconocerlo en el conteo físico.
 * Se sube con el botón, arrastrando la imagen sobre el recuadro o pegándola (Ctrl+V) en la página.
 */
export function FotoProducto({ productoId, url, nombre }: { productoId: string; url: string | null; nombre: string }) {
  const [vista, setVista] = useState<string | null>(null)
  const [encima, setEncima] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  // pone la imagen en el campo del formulario (como si se hubiera elegido con el botón)
  function usar(f: File | undefined | null) {
    if (!f) return
    if (!TIPOS.includes(f.type)) { setError('Solo imágenes PNG, JPG, WEBP o GIF.'); return }
    setError('')
    const dt = new DataTransfer()
    dt.items.add(f)
    if (input.current) input.current.files = dt.files
    setVista(URL.createObjectURL(f))
  }

  // pegar (Ctrl+V) una imagen copiada; si se está escribiendo texto en un campo, no se toca
  useEffect(() => {
    const pegar = (e: ClipboardEvent) => {
      const img = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'))
      if (!img) return
      e.preventDefault()
      usar(img)
    }
    window.addEventListener('paste', pegar)
    return () => window.removeEventListener('paste', pegar)
  }, [])

  return (
    <div className="flex flex-col items-center gap-3">
      <div onDragOver={(e) => { e.preventDefault(); setEncima(true) }} onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); usar(e.dataTransfer.files?.[0]) }}
        className={cn('rounded-xl border-2 border-dashed p-1 transition-colors', encima ? 'border-brand-600 bg-brand-50' : 'border-transparent')}>
        <ProductoFoto src={vista ?? url} alt={nombre} size="lg" />
      </div>
      <ActionForm action={guardarFotoProducto} onSuccess={() => setVista(null)} className="flex flex-wrap justify-center gap-2">
        <input type="hidden" name="producto_id" value={productoId} />
        <input ref={input} type="file" name="foto" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only"
               onChange={(e) => { const f = e.target.files?.[0]; setVista(f ? URL.createObjectURL(f) : null) }} />
        {vista ? (
          <>
            <SubmitButton size="sm">Guardar foto</SubmitButton>
            <button type="button" className={btnClass('outline', 'sm')} onClick={() => { setVista(null); if (input.current) input.current.value = '' }}>Cancelar</button>
          </>
        ) : (
          <>
            <button type="button" className={btnClass('outline', 'sm')} onClick={() => input.current?.click()}>
              <ImagePlus className="size-3.5" /> {url ? 'Cambiar foto' : 'Agregar foto'}
            </button>
            {url && <SubmitButton size="sm" variant="ghost" name="quitar" value="1" confirm="¿Quitar la foto de este producto?"><Trash2 className="size-3.5" /> Quitar</SubmitButton>}
          </>
        )}
      </ActionForm>
      {error && <p className="text-center text-xs text-brand-700">{error}</p>}
      <p className="text-center text-xs text-muted">Elija, arrastre o pegue (Ctrl+V) una imagen · PNG, JPG o WEBP · máx. 2 MB</p>
    </div>
  )
}
