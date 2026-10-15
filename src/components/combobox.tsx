'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, Loader2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export type ComboOpcion = { id: string; nombre: string }
/** listas a las que se puede agregar una opción escribiéndola (queda para la próxima vez) */
export type CatalogoAbierto = 'categoria' | 'area' | 'personal' | 'ciudad'

/** sin tildes ni mayúsculas, para buscar */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Lista desplegable estándar de todo el sistema: se elige o se escribe para buscar (sin recorrer la lista),
 * con teclado (↑ ↓ Enter Esc) y una lista corta que se desliza por dentro.
 * - `agregar`: si lo escrito no existe, ofrece «Agregar…»; se guarda en su catálogo y queda elegido
 *   (la base reconoce nombres parecidos y usa el que ya hay).
 * - `libre`: el valor es el TEXTO (elegido o escrito); el servidor lo registra si es nuevo.
 * - `value` + `onChange`: uso controlado (filtros que cambian la pantalla al momento).
 */
export function Combobox({ name, options: inicial, defaultValue, value, onChange, placeholder, required, disabled, className, id, agregar, local, libre, autoFocus, ariaLabel }: {
  name?: string
  options: ComboOpcion[]
  defaultValue?: string | null
  value?: string
  onChange?: (v: string) => void
  /** texto cuando no hay nada elegido; si el campo no es obligatorio, también es la opción para quitar lo elegido («Todos», «—») */
  placeholder?: string
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
  agregar?: CatalogoAbierto
  /** negocio donde queda lo agregado (áreas, personal) */
  local?: string | null
  libre?: boolean
  autoFocus?: boolean
  ariaLabel?: string
}) {
  // lo agregado aquí se suma a las opciones que llegan (aunque la pantalla vuelva a dibujarse)
  const [extras, setExtras] = useState<ComboOpcion[]>([])
  const opciones = extras.length ? [...inicial, ...extras.filter((x) => !inicial.some((o) => o.id === x.id))] : inicial
  const [interno, setInterno] = useState(defaultValue ?? '')
  const actual = value ?? interno
  const elegida = libre ? (actual ? { id: actual, nombre: actual } : null) : opciones.find((o) => o.id === actual) ?? null
  const [texto, setTexto] = useState(elegida?.nombre ?? '')
  const [buscando, setBuscando] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)
  // la lista se dibuja «encima» de todo (posición fija), para que una tabla con desplazamiento no la corte;
  // si abajo no hay espacio, se abre hacia arriba
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null)
  useLayoutEffect(() => {
    if (!open || !boxRef.current) return
    const r = boxRef.current.getBoundingClientRect()
    const abajo = window.innerHeight - r.bottom
    setPos(abajo < 250 && r.top > abajo ? { left: r.left, bottom: window.innerHeight - r.top + 4, width: r.width } : { left: r.left, top: r.bottom + 4, width: r.width })
  }, [open])
  // al desplazar la página (no la lista) se cierra, para que no quede flotando lejos del campo
  useEffect(() => {
    if (!open) return
    const mover = (e: Event) => { if (!listRef.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('scroll', mover, true)
    window.addEventListener('resize', mover)
    return () => { window.removeEventListener('scroll', mover, true); window.removeEventListener('resize', mover) }
  }, [open])
  const listRef = useRef<HTMLUListElement>(null)

  // si cambia lo elegido desde afuera (controlado), se muestra su nombre
  useEffect(() => { if (!buscando) setTexto(elegida?.nombre ?? '') }, [elegida?.nombre]) // eslint-disable-line react-hooks/exhaustive-deps

  const t = norm(texto)
  const vaciable = !required && placeholder !== undefined && !libre
  const filtradas = buscando && t
    ? opciones.filter((o) => norm(o.nombre).includes(t)).sort((a, b) => Number(!norm(b.nombre).startsWith(t)) - Number(!norm(a.nombre).startsWith(t)))
    : opciones
  const lista: (ComboOpcion & { vacio?: boolean })[] = [...(vaciable && !(buscando && t) ? [{ id: '', nombre: placeholder!, vacio: true }] : []), ...filtradas]
  const exacta = opciones.find((o) => norm(o.nombre) === t)
  // «Agregar» solo cuando lo escrito no se parece a nada de la lista (si hay coincidencias, se elige una de ellas)
  const nueva = (agregar || libre) && buscando && t.length >= 3 && !exacta && !filtradas.length ? texto.trim() : null
  const total = lista.length + (nueva ? 1 : 0)

  function fijar(v: string) { if (value === undefined) setInterno(v); onChange?.(v) }
  function elegir(o: ComboOpcion) { fijar(o.id); setTexto(o.id ? o.nombre : ''); setBuscando(false); setOpen(false); setError('') }
  async function crear(nombre: string) {
    if (libre) { elegir({ id: nombre, nombre }); return }
    setGuardando(true); setError('')
    const { data, error: e } = await createClient().rpc('fn_catalogo_agregar', { p_tipo: agregar, p_nombre: nombre, p_local: local ?? null })
    setGuardando(false)
    if (e || !data) { setError(e?.message ?? 'No se pudo agregar'); return }
    const o = data as ComboOpcion
    setExtras((xs) => (xs.some((x) => x.id === o.id) ? xs : [...xs, o]))
    elegir(o)
  }
  // al salir: lo escrito que coincide con una opción queda elegido; si no, vuelve lo que estaba (en `libre`, queda el texto)
  function cerrar() {
    setOpen(false)
    if (!buscando) return
    setBuscando(false)
    if (!t) { if (vaciable || libre) fijar(''); setTexto(''); return }
    if (exacta) elegir(exacta)
    else if (libre) elegir({ id: texto.trim(), nombre: texto.trim() })
    else setTexto(elegida?.nombre ?? '')
  }

  useEffect(() => {
    if (!open) return
    const fuera = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) cerrar() }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  })
  useEffect(() => { if (open) listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active, open])

  // los anchos (w-44, min-w-56…) van al contenedor; el resto (alto, etc.) al campo
  const clases = (className ?? '').split(/\s+/).filter(Boolean)
  const anchos = clases.filter((c) => /^(w-|min-w-|max-w-|md:w-|sm:w-|lg:w-)/.test(c)).join(' ')
  const resto = clases.filter((c) => !/^(w-|min-w-|max-w-|md:w-|sm:w-|lg:w-|field$)/.test(c)).join(' ')

  return (
    <div ref={boxRef} className={cn('relative', anchos)}>
      {/* autoComplete off: que el navegador no «recuerde» un valor viejo al recargar */}
      {name && <input type="hidden" name={name} value={actual} autoComplete="off" />}
      <input id={id ?? name} value={texto} disabled={disabled || guardando} required={required && !actual} autoFocus={autoFocus}
        role="combobox" aria-expanded={open} aria-autocomplete="list" aria-label={ariaLabel} autoComplete="off"
        placeholder={placeholder && placeholder !== '—' ? placeholder : 'Elija o escriba…'}
        className={cn('field w-full pr-8', resto)}
        onFocus={(e) => { e.target.select(); setOpen(true); setActive(0) }}
        onClick={() => setOpen(true)}
        onChange={(e) => { setTexto(e.target.value); setBuscando(true); setOpen(true); setActive(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, total - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter') {
            // Enter en una lista nunca envía el formulario: elige (o, con la lista cerrada, deja lo escrito)
            e.preventDefault()
            if (!open) cerrar()
            else if (active < lista.length && lista[active]) elegir(lista[active])
            else if (nueva) void crear(nueva)
          } else if (e.key === 'Escape' || e.key === 'Tab') cerrar()
        }} />
      {guardando
        ? <Loader2 className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-subtle" />
        : <ChevronDown className={cn('pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-subtle transition-transform', open && 'rotate-180')} />}
      {error && <p className="mt-1 text-xs text-brand-700">{error}</p>}

      {open && !disabled && (
        // el clic en una opción no debe «activar» el <label> que envuelve al campo (volvería a abrir la lista)
        <ul ref={listRef} role="listbox" onClick={(e) => e.preventDefault()}
          style={pos ? { position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width } : undefined}
          className={cn('absolute z-[60] mt-1 max-h-60 w-max max-w-[20rem] overflow-auto rounded-lg border border-line bg-white py-1 text-left shadow-xl', !pos && 'min-w-full')}>
          {lista.map((o, k) => (
            <li key={o.id || '__vacio'} data-i={k} role="option" aria-selected={o.id === actual}
              onMouseDown={(e) => { e.preventDefault(); elegir(o) }} onMouseEnter={() => setActive(k)}
              className={cn('cursor-pointer px-3 py-1.5 text-sm font-normal normal-case tracking-normal text-ink-900', k === active && 'bg-brand-50',
                o.id === actual && !o.vacio && 'font-semibold text-brand-700', o.vacio && 'text-muted')}>
              {o.nombre}
            </li>
          ))}
          {nueva && (
            <li data-i={lista.length} role="option" aria-selected={false}
              onMouseDown={(e) => { e.preventDefault(); void crear(nueva) }} onMouseEnter={() => setActive(lista.length)}
              className={cn('flex cursor-pointer items-center gap-1.5 border-t border-line px-3 py-2 text-sm font-normal normal-case tracking-normal text-leaf-600', active === lista.length && 'bg-leaf-50')}>
              <Plus className="size-3.5 shrink-0" /> {libre ? `Usar «${nueva}»` : `Agregar «${nueva}»`}
            </li>
          )}
          {!lista.length && !nueva && (
            <li className="px-3 py-2 text-sm font-normal normal-case tracking-normal text-muted">
              {agregar || libre ? 'Escriba al menos 3 letras para agregar' : 'Sin coincidencias'}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
