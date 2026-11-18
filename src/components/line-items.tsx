'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { reducirImagen } from '@/lib/imagen'
import { ProductPicker, type ProductoLite } from '@/components/product-picker'
import { fmtDate, fmtSoles } from '@/lib/format'
import { createClient } from '@/lib/supabase/client'
import { useUnidades, factorUnidad, idUnidad, UnidadCelda } from '@/components/unidad-linea'

export type LineField = {
  key: string
  label: string
  /** unidad: la del producto o, si es un empaque, la de su contenido (p. ej. Saco o Kilo) */
  type?: 'number' | 'date' | 'text' | 'image' | 'unidad'
  step?: string
  required?: boolean
  /** valor inicial al agregar el producto */
  init?: (p: ProductoLite) => string
  width?: string
  /** unidad: además de las que se convierten solas, ofrece TODAS (si elige otra, se escribe su equivalencia: «1 Caja = 12 UND») */
  todasUnidades?: boolean
  /** solo para productos con «Controlar vencimiento (FIFO)»: en los demás queda deshabilitado; en estos es obligatorio */
  soloConVencimiento?: boolean
}
import type { Line } from '@/lib/lines'
export type { Line }

/** línea nueva con los datos del producto (incluida su unidad y, si es empaque, la de su contenido) */
function lineaDe(p: ProductoLite): Line {
  return { producto_id: p.id, descripcion: p.nombre, unidad: p.unidad, codigo: p.codigo, controla_lote: p.controla_lote ? '1' : '',
    stock: p.stock === null || p.stock === undefined ? '' : String(p.stock),
    unidad_id: p.unidad_id ?? '', contenido_unidad_id: p.contenido_unidad_id ?? '', contenido_unidad: p.contenido_unidad ?? '', contenido: p.contenido ? String(p.contenido) : '' }
}

/**
 * Editor de líneas de documento. Serializa las líneas como JSON en un input oculto
 * (`name`) para enviarlas en una Server Action.
 */
export function LineItems({ name, fields, tipos, totalKey, priceKey, allowFreeText, initial = [], almacenId, mostrarStock = false, herramientas, onTotal, topeStock = false, mostrarVence = false }: {
  /** salidas y traspasos: debajo de cada producto, cuál entregar primero (el que vence antes), como lo descuenta el sistema */
  mostrarVence?: boolean
  /** salidas y traspasos: la cantidad no puede pasar del stock del almacén (convertido a la unidad elegida) */
  topeStock?: boolean
  /** avisa la suma de importes cada vez que cambia (p. ej. para el total del comprobante) */
  onTotal?: (n: number) => void
  /** botones extra junto al buscador; reciben `agregar` para cargar varios productos de una vez (p. ej. los que están bajo el mínimo) */
  herramientas?: (agregar: (productos: { p: ProductoLite; valores?: Record<string, string> }[]) => void) => React.ReactNode
  /** muestra el stock actual debajo de cada producto (salidas) */
  mostrarStock?: boolean
  /** panel de almacén: el buscador ofrece solo los productos de ese almacén (con su código) */
  almacenId?: string | null
  name: string
  fields: LineField[]
  tipos?: string[]
  totalKey?: string       // campo cantidad para calcular importe
  priceKey?: string       // campo precio para calcular importe
  allowFreeText?: boolean // permite ítems sin producto del catálogo (requerimientos/cotizaciones)
  initial?: Line[]
}) {
  const [lines, setLines] = useState<Line[]>(initial)
  const [libre, setLibre] = useState('')
  // unidades (estándar del sistema, ver unidad-linea.tsx): una sola consulta, solo si hay columna «Unidad»
  const unidades = useUnidades()
  const campoUnidad = fields.find((f) => f.type === 'unidad')
  // cada línea viaja con su «factor»: cuántas unidades del producto es 1 de la unidad elegida (el servidor pasa
  // cantidad y precio a la unidad del producto) y con el nombre de la unidad elegida (para dejarlo anotado)
  const serializadas = campoUnidad
    ? lines.map((l) => {
        const f = factorUnidad(unidades, l, l[campoUnidad.key], l.equivale)
        const elegida = l[campoUnidad.key] || idUnidad(unidades, l)
        return { ...l, factor: f === null ? '' : String(f), unidad_elegida_nombre: unidades[elegida]?.nombre ?? '' }
      })
    : lines

  function agregarVarios(productos: { p: ProductoLite; valores?: Record<string, string> }[]) {
    setLines((ls) => {
      const nuevos = productos.filter(({ p }) => !ls.some((l) => l.producto_id === p.id)).map(({ p, valores }) => {
        const base = lineaDe(p)
        for (const f of fields) base[f.key] = valores?.[f.key] ?? (f.init ? f.init(p) : '')
        return base
      })
      return [...ls, ...nuevos]
    })
  }
  function add(p: ProductoLite) {
    if (lines.some((l) => l.producto_id === p.id)) return
    const base = lineaDe(p)
    for (const f of fields) base[f.key] = f.init ? f.init(p) : ''
    setLines((ls) => [...ls, base])
  }
  function addLibre() {
    if (!libre.trim()) return
    const base: Line = { producto_id: null, descripcion: libre.trim().toUpperCase(), unidad: 'UND' }
    for (const f of fields) base[f.key] = ''
    setLines((ls) => [...ls, base]); setLibre('')
  }
  // con tope: la cantidad (en la unidad elegida) no pasa del stock; al cambiar la unidad también se recorta
  const tope = (l: Line) => {
    // sin fila de stock en el almacén = 0 (no hay nada que sacar)
    if (!topeStock || !campoUnidad || !almacenId || l.stock === undefined) return l
    const f = factorUnidad(unidades, l, l[campoUnidad.key], l.equivale)
    if (!f) return l
    const max = Math.floor((Number(l.stock) || 0) / f * 1000) / 1000
    return Number(l.cantidad) > max ? { ...l, cantidad: String(max) } : l
  }
  // lotes con stock de los productos de la lista, en el orden en que salen (vence antes → sin fecha al final)
  const [lotes, setLotes] = useState<Record<string, { fv: string | null; disp: number }[]>>({})
  const ids = lines.map((l) => l.producto_id).filter(Boolean).sort().join(',')
  useEffect(() => {
    if (!mostrarVence || !almacenId || !ids) return
    // si cambian los productos o el almacén antes de que llegue la respuesta, esa respuesta ya no vale
    let vigente = true
    const cargar = async () => {
      const { data, error } = await createClient().from('v_lote_fifo').select('producto_id, fecha_vencimiento, cantidad_disponible')
        .eq('almacen_id', almacenId).in('producto_id', ids.split(',')).order('orden_salida')
      if (!vigente) return
      const m: Record<string, { fv: string | null; disp: number }[]> = {}
      if (!error) for (const x of data ?? []) (m[x.producto_id] ??= []).push({ fv: x.fecha_vencimiento, disp: Number(x.cantidad_disponible) })
      setLotes(m)
    }
    void cargar()
    return () => { vigente = false }
  }, [mostrarVence, almacenId, ids])
  // de qué fechas sale la cantidad escrita (en la unidad del producto); sin cantidad, la primera
  const entregar = (l: Line) => {
    const ls = mostrarVence && almacenId && ids ? lotes[l.producto_id ?? ''] : undefined
    if (!ls?.length || ls.every((x) => !x.fv)) return null
    const f = campoUnidad ? factorUnidad(unidades, l, l[campoUnidad.key], l.equivale) ?? 1 : 1
    let resto = (Number(l.cantidad) || 0) * f
    if (resto <= 0) return [{ fv: ls[0].fv, toma: 0 }]
    const out: { fv: string | null; toma: number }[] = []
    for (const x of ls) {
      if (resto <= 0) break
      const toma = Math.min(resto, x.disp)
      out.push({ fv: x.fv, toma }); resto -= toma
    }
    return out
  }
  const update = (i: number, key: string, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? tope({ ...l, [key]: v }) : l)))
  const remove = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i))

  const total = useMemo(() => {
    if (!totalKey || !priceKey) return null
    return lines.reduce((s, l) => s + (Number(l[totalKey]) || 0) * (Number(l[priceKey]) || 0), 0)
  }, [lines, totalKey, priceKey])
  useEffect(() => { if (total !== null) onTotal?.(total) }, [total, onTotal])

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(serializadas)} />
      <div className="flex flex-wrap gap-2">
        <ProductPicker onSelect={add} tipos={tipos} almacenId={almacenId} className="min-w-72 flex-1" placeholder="Agregar producto: escriba nombre o código…" />
        {herramientas?.(agregarVarios)}
        {allowFreeText && (
          <div className="flex min-w-72 flex-1 gap-2">
            <input value={libre} onChange={(e) => setLibre(e.target.value)} placeholder="…o describa un bien no catalogado"
                   onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLibre() } }} className="field" />
            <button type="button" onClick={addLibre} className="h-10 shrink-0 rounded-lg border border-field px-3 text-sm font-semibold hover:bg-canvas">
              <Plus className="size-4" />
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="th w-12">Ítem</th>
              {almacenId && <th className="th w-16 text-right">Cód.</th>}
              <th className="th">Producto</th>
              {fields.map((f) => <th key={f.key} className="th" style={{ width: f.width }}>{f.label}</th>)}
              {total !== null && <th className="th text-right">Importe</th>}
              <th className="th w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={(l.producto_id ?? l.descripcion) + i}>
                <td className="td text-muted tabular">{i + 1}</td>
                {almacenId && <td className="td text-right font-mono text-xs font-semibold tabular">{l.codigo ?? '—'}</td>}
                <td className="td">
                  <span className="font-medium">{l.descripcion}</span>
                  <span className="ml-1.5 text-xs text-muted">{l.unidad}</span>
                  {mostrarStock && <span className="block text-xs text-muted">Stock: {l.stock ? Number(l.stock).toLocaleString('es-PE', { maximumFractionDigits: 3 }) : '0'}</span>}
                  {mostrarVence && (() => {
                    const e = entregar(l)
                    return e && <span className="block text-xs font-semibold text-amber-700">Entregar primero: {e.map((x, k) => (
                      <span key={k}>{k > 0 && ' · luego '}{x.fv ? `vence ${fmtDate(x.fv)}` : 'sin fecha'}{x.toma > 0 && ` (${x.toma.toLocaleString('es-PE', { maximumFractionDigits: 3 })} ${l.unidad ?? ''})`}</span>))}</span>
                  })()}
                </td>
                {fields.map((f) => (
                  <td key={f.key} className="td py-1.5">
                    {f.type === 'image' ? (
                      <FotoCelda value={l[f.key] ?? ''} onChange={(v) => update(i, f.key, v)} etiqueta={`${f.label} de ${l.descripcion}`} />
                    ) : f.type === 'unidad' ? (
                      <UnidadCelda u={unidades} p={l} value={l[f.key]} equivale={l.equivale} cantidad={totalKey ? l[totalKey] : l.cantidad} todas={f.todasUnidades}
                        onUnidad={(v) => update(i, f.key, v)} onEquivale={(v) => update(i, 'equivale', v)} etiqueta={`${f.label} de ${l.descripcion}`} />
                    ) : f.soloConVencimiento && l.controla_lote !== '1' ? (
                      <span className="block px-1 text-xs text-subtle" title="El producto no tiene marcado «Controlar vencimiento (FIFO)»">—</span>
                    ) : <input
                      type={f.type ?? 'number'}
                      step={f.step ?? (f.type === 'number' || !f.type ? 'any' : undefined)}
                      min={f.type === 'number' || !f.type ? '0' : undefined}
                      required={f.required}
                      value={l[f.key] ?? ''}
                      onChange={(e) => update(i, f.key, e.target.value)}
                      className="field h-8 tabular"
                      aria-label={`${f.label} de ${l.descripcion}`}
                    />}
                  </td>
                ))}
                {total !== null && (
                  <td className="td text-right font-semibold tabular">
                    {fmtSoles((Number(l[totalKey!]) || 0) * (Number(l[priceKey!]) || 0))}
                  </td>
                )}
                <td className="td py-1.5">
                  <button type="button" onClick={() => remove(i)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-brand-50 hover:text-brand-600" aria-label="Quitar línea">
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
            {!lines.length && (
              <tr><td colSpan={fields.length + (almacenId ? 5 : 4)} className="td py-8 text-center text-muted">Aún no hay productos. Use el buscador para agregarlos.</td></tr>
            )}
          </tbody>
          {total !== null && lines.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={fields.length + (almacenId ? 3 : 2)} className="px-3 py-2.5 text-right text-sm font-semibold">Total</td>
                <td className="px-3 py-2.5 text-right text-base font-bold tabular">{fmtSoles(total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}


/** Foto referencial de una línea: se toma o elige una imagen y se guarda reducida (máx. 480 px). */
export function FotoCelda({ value, onChange, etiqueta, grande = false }: { value: string; onChange: (v: string) => void; etiqueta: string
  /** zona amplia para arrastrar, pegar (Ctrl+V) o hacer clic (formularios); la chica es para celdas de tabla */
  grande?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [encima, setEncima] = useState(false)
  async function cargar(f: File | undefined) {
    if (!f) return
    setError('')
    try { onChange(await reducirImagen(f, 480, 0.8)) } catch (e) { setError((e as Error).message) }
    if (input.current) input.current.value = ''
  }
  const pegar = (e: React.ClipboardEvent) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); e.stopPropagation(); cargar(f) } }
  if (grande) {
    return (
      <div tabIndex={0} role="button" aria-label={etiqueta} onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === ' ') { e.preventDefault(); input.current?.click() } }}
        onDragOver={(e) => { e.preventDefault(); setEncima(true) }} onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); cargar(e.dataTransfer.files?.[0]) }} onPaste={pegar}
        className={`relative flex h-20 cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed bg-white px-3 text-xs outline-none focus:border-brand-600
          ${encima ? 'border-brand-600 bg-brand-50' : 'border-line hover:border-brand-200'}`}>
        <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => cargar(e.target.files?.[0])} tabIndex={-1} />
        {value
          ? <img src={value} alt="" className="size-16 shrink-0 rounded border border-line object-contain" />
          : <ImagePlus className="size-6 shrink-0 text-subtle" />}
        <span className="text-muted">{value ? 'Clic, arrastre o pegue otra para cambiarla' : <>Arrastre una imagen, péguela (<b>Ctrl+V</b>) o haga clic</>}
          {error && <span className="block text-brand-700">{error}</span>}</span>
        {value && <button type="button" onClick={(e) => { e.stopPropagation(); onChange('') }} aria-label="Quitar foto"
          className="absolute top-1 right-1 grid size-6 place-items-center rounded text-muted hover:text-brand-600"><X className="size-3.5" /></button>}
      </div>
    )
  }
  return (
    // también se puede soltar una imagen sobre la celda o pegarla (Ctrl+V) con la celda seleccionada
    <div className="flex items-center gap-1.5 rounded-md" tabIndex={-1}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); cargar(e.dataTransfer.files?.[0]) }}
      onPaste={(e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) { e.preventDefault(); cargar(f) } }}>
      <input ref={input} type="file" accept="image/*" className="sr-only" onChange={(e) => cargar(e.target.files?.[0])} aria-label={etiqueta} />
      {value ? (
        <>
          <button type="button" onClick={() => input.current?.click()} title="Cambiar foto" className="size-10 overflow-hidden rounded-md border border-line bg-white">
            <img src={value} alt="" className="size-full object-contain" />
          </button>
          <button type="button" onClick={() => onChange('')} aria-label="Quitar foto" className="grid size-6 place-items-center rounded text-muted hover:text-brand-600"><X className="size-3.5" /></button>
        </>
      ) : (
        <button type="button" onClick={() => input.current?.click()} className="flex h-8 items-center gap-1 rounded-lg border border-dashed border-line px-2 text-xs font-semibold text-muted hover:border-brand-200 hover:text-ink-900">
          <ImagePlus className="size-3.5" /> Foto
        </button>
      )}
      {error && <span className="text-[10px] text-brand-700">{error}</span>}
    </div>
  )
}
