'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

/** tipo: «medida» (unidad, kilo, litro…) o «empaque» (saco, caja…: se indica cuánto trae) */
export type UnidadOpc = { id: string; nombre: string; productos: number; tipo?: string }

/** sin tildes ni mayúsculas, para buscar */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const MAS_USADAS = 4
/** abreviaturas y formas comunes → el nombre de la unidad (lo mismo reconoce la base al guardar) */
const ALIAS: Record<string, string> = {
  kg: 'kilo', kgs: 'kilo', kilos: 'kilo', kilogramo: 'kilo', kilogramos: 'kilo', gr: 'gramo', grs: 'gramo',
  lt: 'litro', lts: 'litro', u: 'unidad', und: 'unidad', unid: 'unidad', unidades: 'unidad', mts: 'metro', galones: 'galon', pqt: 'paquete',
}
/** la unidad que corresponde a lo escrito: nombre exacto, alias o plural («cajas», «litros») */
function reconocer(unidades: UnidadOpc[], t: string) {
  const c = [t, ALIAS[t], t.replace(/es$/, ''), t.replace(/s$/, '')].filter(Boolean)
  return unidades.find((u) => c.includes(norm(u.nombre)))
}

/**
 * Unidad de medida: se elige de la lista o se escribe para buscar (sin recorrer toda la lista).
 * Arriba las más usadas (según los productos reales), luego todas en orden alfabético.
 * Si lo escrito no existe, se guarda como unidad nueva con el producto y la próxima vez ya sale en la lista
 * (la base reconoce «kilos», «LITROS»… y usa la que ya hay).
 * Envía `unidad` (id, o «otra») y `unidad_nueva` (el nombre escrito).
 */
export function UnidadCombobox({ unidades, defaultValue, disabled, onCambio }: { unidades: UnidadOpc[]; defaultValue?: string | null; disabled?: boolean
  /** avisa la unidad elegida (las nuevas son empaques) para preguntar cuánto trae */
  onCambio?: (u: { nombre: string; tipo: string } | null) => void }) {
  const inicial = unidades.find((u) => u.id === defaultValue) ?? null
  const [sel, setSel] = useState<UnidadOpc | null>(inicial)
  const [texto, setTexto] = useState(inicial?.nombre ?? '')
  const [buscando, setBuscando] = useState(false)   // escribió algo: se filtra
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const alfabetico = useMemo(() => [...unidades].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [unidades])
  const usadas = useMemo(() => [...unidades].filter((u) => u.productos > 0).sort((a, b) => b.productos - a.productos).slice(0, MAS_USADAS), [unidades])

  const t = norm(texto)
  // con texto: lo que empieza con lo escrito primero, luego lo que lo contiene
  const exacta = t ? reconocer(unidades, t) : undefined
  const filtradas = buscando && t
    ? [...(exacta && !norm(exacta.nombre).includes(t) ? [exacta] : []),   // «kilos» → Kilo
       ...alfabetico.filter((u) => norm(u.nombre).includes(t)).sort((a, b) => Number(!norm(b.nombre).startsWith(t)) - Number(!norm(a.nombre).startsWith(t)))]
    : null
  // ofrecer una unidad nueva solo con 3 letras o más y si no corresponde a una que ya existe
  const nueva = buscando && t.length >= 3 && !exacta && !filtradas?.length ? texto.trim() : null
  const grupos: { titulo?: string; items: UnidadOpc[] }[] = filtradas
    ? [{ items: filtradas }]
    : [{ titulo: 'Más usadas', items: usadas }, { titulo: 'Todas', items: alfabetico.filter((u) => !usadas.includes(u)) }]
  const opciones = grupos.flatMap((g) => g.items)
  const total = opciones.length + (nueva ? 1 : 0)

  // al salir: si lo escrito coincide con una unidad, queda esa; si no, es una unidad nueva; vacío = sin unidad
  const esNueva = !sel && texto.trim().length >= 3
  useEffect(() => {
    onCambio?.(sel ? { nombre: sel.nombre, tipo: sel.tipo ?? 'medida' } : esNueva && !buscando ? { nombre: texto.trim(), tipo: 'empaque' } : null)
  }, [sel, esNueva, buscando]) // eslint-disable-line react-hooks/exhaustive-deps
  function elegir(u: UnidadOpc) { setSel(u); setTexto(u.nombre); setBuscando(false); setOpen(false) }
  function cerrar() {
    setOpen(false)
    if (!buscando) return
    if (exacta) elegir(exacta)
    else { setSel(null); setBuscando(false) }
  }

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) cerrar() }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  })
  useEffect(() => { listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active])

  let i = -1
  return (
    <div ref={boxRef} className="relative">
      <input type="hidden" name="unidad" value={sel ? sel.id : esNueva ? 'otra' : ''} />
      {!sel && esNueva && <input type="hidden" name="unidad_nueva" value={texto.trim()} />}
      <input value={texto} disabled={disabled} required aria-label="Unidad" role="combobox" aria-expanded={open} aria-autocomplete="list"
        placeholder="Elija o escriba…" autoComplete="off" className="field pr-8"
        onFocus={(e) => { e.target.select(); setOpen(true); setActive(0) }}
        onClick={() => setOpen(true)}
        onChange={(e) => { setTexto(e.target.value); setBuscando(true); setSel(null); setOpen(true); setActive(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, total - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter' && open) {
            e.preventDefault()
            if (active < opciones.length && opciones[active]) elegir(opciones[active])
            else if (nueva) { setBuscando(false); setOpen(false) }
          } else if (e.key === 'Escape' || e.key === 'Tab') cerrar()
        }} />
      <ChevronDown className={cn('pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-subtle transition-transform', open && 'rotate-180')} />
      {esNueva && !open && <p className="mt-1 text-xs text-leaf-600">Unidad nueva: se guardará para la próxima vez.</p>}

      {open && !disabled && (
        <ul ref={listRef} role="listbox" className="absolute z-50 mt-1 max-h-60 w-max max-w-[20rem] min-w-full overflow-auto rounded-lg border border-line bg-white py-1 shadow-xl">
          {grupos.map((g) => g.items.length > 0 && (
            <li key={g.titulo ?? 'r'} role="presentation">
              {g.titulo && <p className="px-3 pt-1.5 pb-0.5 text-[10.5px] font-bold tracking-wide text-subtle uppercase">{g.titulo}</p>}
              <ul role="group">
                {g.items.map((u) => {
                  i++
                  const k = i
                  return (
                    <li key={u.id} data-i={k} role="option" aria-selected={sel?.id === u.id}
                      onMouseDown={(e) => { e.preventDefault(); elegir(u) }} onMouseEnter={() => setActive(k)}
                      className={cn('cursor-pointer px-3 py-1.5 text-sm', k === active && 'bg-brand-50', sel?.id === u.id && 'font-semibold text-brand-700')}>
                      {u.nombre}
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
          {nueva && (
            <li data-i={opciones.length} role="option" aria-selected={false}
              onMouseDown={(e) => { e.preventDefault(); setBuscando(false); setOpen(false) }} onMouseEnter={() => setActive(opciones.length)}
              className={cn('flex cursor-pointer items-center gap-1.5 border-t border-line px-3 py-2 text-sm text-leaf-600', active === opciones.length && 'bg-leaf-50')}>
              <Plus className="size-3.5" /> Agregar «{nueva}» como unidad nueva
            </li>
          )}
          {!opciones.length && !nueva && <li className="px-3 py-2 text-sm text-muted">Escriba al menos 3 letras para agregar una unidad nueva</li>}
        </ul>
      )}
    </div>
  )
}
