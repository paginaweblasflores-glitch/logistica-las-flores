'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ProductoFoto } from '@/components/producto-foto'
import { cn } from '@/lib/utils'

export type ProductoLite = { id: string; codigo: string; nombre: string; unidad: string; costo_referencia: number; tipo: string
  /** lleva fecha de vencimiento (FIFO por lotes) */
  controla_lote?: boolean
  /** stock en el almacén elegido (solo con almacenId) */
  stock?: number | null
  /** unidad del producto y, si es un empaque, cuánto trae (saco = 50 kilos) */
  unidad_id?: string; contenido?: number | null; contenido_unidad_id?: string | null; contenido_unidad?: string | null
  imagen_url?: string | null }

/**
 * Buscador de productos por nombre o código (búsqueda trigram en la BD).
 * - Con `name`: funciona dentro de formularios (input oculto con el id).
 * - Con `onSelect`: se usa en editores de líneas.
 */
export function ProductPicker({ name, onSelect, defaultValue, placeholder = 'Buscar producto…', tipos, className, autoFocus, almacenId }: {
  /** panel de almacén: busca solo los productos de ESE almacén y muestra su código propio */
  almacenId?: string | null
  name?: string
  onSelect?: (p: ProductoLite) => void
  defaultValue?: ProductoLite | null
  placeholder?: string
  tipos?: string[]
  className?: string
  autoFocus?: boolean
}) {
  const [selected, setSelected] = useState<ProductoLite | null>(defaultValue ?? null)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<ProductoLite[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  // Búsqueda en la base (fn_buscar_productos): sin mayúsculas ni tildes, todas las palabras, primero el código
  // exacto y lo que EMPIEZA con lo escrito. Desde la 1.ª letra; solo vale la respuesta de lo último escrito.
  const ultima = useRef(0)
  // al hacer clic sin escribir: la lista del almacén por código (con foto y stock), como un catálogo
  // cada clic sin texto vuelve a pedir la lista (si la primera vez llegó vacía, no se queda así)
  const [buscarTodo, setBuscarTodo] = useState(0)
  useEffect(() => {
    if (!term.trim() && !buscarTodo) { setResults([]); setOpen(false); return }
    const n = ++ultima.current
    const t = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase.rpc('fn_buscar_productos', {
        p_texto: term.trim(), p_almacen: almacenId ?? null, p_tipos: tipos?.length ? tipos : null, p_limite: term.trim() ? 30 : 300,
      })
      if (n !== ultima.current) return   // ya se escribió otra cosa: esta respuesta llegó tarde
      setResults(((data ?? []) as { id: string; codigo: string; nombre: string; tipo: string; costo_referencia: number; controla_lote: boolean; unidad: string; stock: number | null
          unidad_id: string; contenido: number | null; contenido_unidad_id: string | null; contenido_unidad: string | null }[])
        .map((p) => ({ ...p, costo_referencia: Number(p.costo_referencia), stock: p.stock === null ? null : Number(p.stock) })))
      setActive(0)
      setOpen(true)
    }, term.trim() ? 150 : 0)
    return () => clearTimeout(t)
  }, [term, tipos, almacenId, buscarTodo])

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function choose(p: ProductoLite) {
    if (onSelect) { onSelect(p); setTerm(''); setResults([]); setOpen(false); setBuscarTodo(0); return }
    setSelected(p); setOpen(false); setTerm('')
  }

  if (selected && !onSelect) {
    return (
      <div className={cn('flex h-9 items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 text-sm', className)}>
        <input type="hidden" name={name} value={selected.id} />
        <span className="truncate"><b>{selected.nombre}</b> <span className="text-muted">· {selected.codigo}</span></span>
        <button type="button" onClick={() => setSelected(null)} className="text-muted hover:text-brand-600" aria-label="Quitar">
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      {name && <input type="hidden" name={name} value="" />}
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
      <input
        value={term}
        autoFocus={autoFocus}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => { if (!term.trim()) setBuscarTodo((n) => n + 1); else if (results.length) setOpen(true) }}
        onClick={() => { if (!term.trim()) setBuscarTodo((n) => n + 1); else if (results.length) setOpen(true) }}
        onKeyDown={(e) => {
          if (!open || !results.length) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          if (e.key === 'Enter') { e.preventDefault(); choose(results[active]) }
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={placeholder}
        className="field pl-9"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && results.length > 0 && (
        <ul role="listbox" className="absolute z-40 mt-1 max-h-72 w-full min-w-72 overflow-auto rounded-lg border border-line bg-white py-1 shadow-xl">
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); choose(p) }}
                onMouseEnter={() => setActive(i)}
                className={cn('flex cursor-pointer items-center gap-3 px-3 py-2 text-sm', i === active && 'bg-brand-50')}>
              <ProductoFoto src={p.imagen_url} alt="" />
              <span className="min-w-0">
                <span className="block font-medium"><span className="mr-1.5 font-mono text-xs font-semibold text-brand-700">{almacenId ? `Cód. ${p.codigo}` : p.codigo}</span><Resaltado texto={p.nombre} busqueda={term} /></span>
                <span className="text-xs text-muted">{p.unidad}{almacenId ? <> · Stock: <b className={!p.stock || p.stock <= 0 ? 'text-brand-700' : 'text-ink-900'}>{p.stock === null || p.stock === undefined ? 'sin cantidad' : p.stock.toLocaleString('es-PE', { maximumFractionDigits: 3 })}</b></> : <> · {p.tipo}</>}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && term.trim().length > 0 && results.length === 0 && (
        <div className="absolute z-40 mt-1 w-full rounded-lg border border-line bg-white px-3 py-3 text-sm text-muted shadow-xl">Sin coincidencias</div>
      )}
    </div>
  )
}

/** Quita tildes y pasa a minúsculas, carácter por carácter (para ubicar lo escrito dentro del nombre). */
const norm = (c: string) => c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Nombre con lo escrito en negrita (cada palabra, sin importar mayúsculas ni tildes). */
function Resaltado({ texto, busqueda }: { texto: string; busqueda: string }) {
  const base = [...texto].map(norm).join('')
  const marca = new Array<boolean>(texto.length).fill(false)
  for (const w of norm(busqueda).split(/\s+/).filter(Boolean)) {
    let i = base.indexOf(w)
    while (i >= 0) { for (let k = i; k < i + w.length; k++) marca[k] = true; i = base.indexOf(w, i + w.length) }
  }
  const partes: { t: string; b: boolean }[] = []
  ;[...texto].forEach((c, i) => {
    const ult = partes[partes.length - 1]
    if (ult && ult.b === marca[i]) ult.t += c
    else partes.push({ t: c, b: marca[i] })
  })
  return <>{partes.map((x, i) => (x.b ? <b key={i} className="font-bold text-ink-900">{x.t}</b> : <span key={i} className="font-normal">{x.t}</span>))}</>
}
