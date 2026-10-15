'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, Check, ChevronDown, Globe, Plus, Store, Truck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { btnClass } from '@/components/ui'
import { TIPOS_PROVEEDOR, etiquetaTipo } from '@/lib/proveedor-tipo'
import { crearProveedorRapido, type ProveedorRapido } from '@/app/(app)/proveedores/actions'

export type ProveedorOpc = { id: string; nombre: string; tipo?: string | null }

const ICONOS = { cadena: Building2, tienda_en_linea: Globe, negocio_local: Store, proveedor: Truck }
const TIPOS = TIPOS_PROVEEDOR.map((t) => ({ ...t, icon: ICONOS[t.id] }))
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Selector de proveedor con búsqueda. Si no existe, se registra al momento (tienda en línea,
 * negocio local o proveedor formal) sin salir del formulario. Envía el id en un input oculto `name`.
 */
export function ProveedorPicker({ name, proveedores, defaultValue, required, onChange, placeholder = 'Escriba para buscar: plaza vea, temu, ferretería…' }: {
  name: string; proveedores: ProveedorOpc[]; defaultValue?: string | null; required?: boolean; placeholder?: string
  /** avisa el proveedor elegido (p. ej. para proponer la forma de compra según su tipo) */
  onChange?: (p: ProveedorOpc | undefined) => void
}) {
  const [lista, setLista] = useState<ProveedorOpc[]>(proveedores)
  const [sel, setSelId] = useState<string>(defaultValue ?? '')
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [nuevo, setNuevo] = useState<null | { nombre: string; tipo: string }>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const caja = useRef<HTMLDivElement>(null)
  const elegido = lista.find((p) => p.id === sel)
  function setSel(id: string, l: ProveedorOpc[] = lista) { setSelId(id); onChange?.(l.find((p) => p.id === id)) }

  useEffect(() => {
    if (!abierto) return
    const cerrar = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])

  const filtrados = useMemo(() => {
    const t = norm(texto.trim())
    const base = t ? lista.filter((p) => t.split(/\s+/).every((w) => norm(p.nombre).includes(w))) : lista
    return base.slice(0, 60)
  }, [texto, lista])

  async function guardarNuevo() {
    if (!nuevo) return
    setGuardando(true); setError('')
    const r = await crearProveedorRapido({ nombre: nuevo.nombre, tipo: nuevo.tipo })
    setGuardando(false)
    if (!r.ok) { setError(r.error); return }
    const p: ProveedorRapido = r.proveedor
    const nueva = lista.some((x) => x.id === p.id) ? lista : [...lista, p].sort((a, b) => a.nombre.localeCompare(b.nombre))
    setLista(nueva)
    setSel(p.id, nueva); setNuevo(null); setTexto(''); setAbierto(false)
  }

  return (
    <div ref={caja} className="relative">
      {/* input oculto con el id; el "required" se valida con un input de texto espejo */}
      <input type="hidden" name={name} value={sel} />
      {required && <input tabIndex={-1} aria-hidden required value={sel} onChange={() => {}} className="pointer-events-none absolute inset-0 opacity-0" />}

      <button type="button" onClick={() => setAbierto((a) => !a)} aria-haspopup="listbox" aria-expanded={abierto}
        className="field flex items-center justify-between gap-2 text-left">
        <span className={cn('truncate', !elegido && 'text-subtle')}>
          {elegido ? <>{elegido.nombre} <span className="text-xs text-muted">· {etiquetaTipo(elegido.tipo)}</span></> : 'Seleccione o registre un proveedor…'}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted" />
      </button>

      {abierto && (
        <div className="absolute z-40 mt-1 w-full min-w-72 overflow-hidden rounded-xl border border-line bg-white shadow-xl">
          {nuevo ? (
            <div className="space-y-3 p-3">
              <p className="text-sm font-semibold">Registrar proveedor nuevo</p>
              <label className="block"><span className="label">Nombre *</span>
                <input autoFocus value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} className="field" /></label>
              <div className="grid gap-1.5">
                <span className="label">Tipo *</span>
                {TIPOS.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                    <input type="radio" checked={nuevo.tipo === t.id} onChange={() => setNuevo({ ...nuevo, tipo: t.id })} className="size-4 accent-brand-600" />
                    <t.icon className="size-4 text-muted" /> <b>{t.nombre}</b> <span className="text-xs text-muted">{t.ej}</span>
                  </label>
                ))}
              </div>
              {error && <p className="text-xs font-semibold text-brand-700">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" className={btnClass('outline', 'sm')} onClick={() => { setNuevo(null); setError('') }}>Volver</button>
                <button type="button" disabled={guardando} className={btnClass('primary', 'sm')} onClick={guardarNuevo}>{guardando ? 'Guardando…' : 'Guardar y usar'}</button>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b border-line p-2">
                <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={placeholder} className="field h-8"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (filtrados[0]) { setSel(filtrados[0].id); setAbierto(false) } } }} />
              </div>
              <ul role="listbox" className="max-h-64 overflow-y-auto py-1 text-sm">
                {filtrados.map((p) => (
                  <li key={p.id}>
                    <button type="button" role="option" aria-selected={p.id === sel} onClick={() => { setSel(p.id); setAbierto(false); setTexto('') }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-canvas">
                      <span className="truncate">{p.nombre}</span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">{p.tipo && p.tipo !== 'proveedor' && etiquetaTipo(p.tipo)}{p.id === sel && <Check className="size-3.5 text-brand-600" />}</span>
                    </button>
                  </li>
                ))}
                {!filtrados.length && <li className="px-3 py-2 text-xs text-muted">No se encontró “{texto}”.</li>}
              </ul>
              <div className="border-t border-line p-2">
                <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-semibold text-brand-600 hover:bg-brand-50"
                  onClick={() => setNuevo({ nombre: texto.trim().toUpperCase(), tipo: /temu|ali|amazon|shein|mercado ?libre|online|web|\.com/i.test(texto) ? 'tienda_en_linea' : 'negocio_local' })}>
                  <Plus className="size-4" /> {texto.trim() ? `Agregar “${texto.trim().toUpperCase()}” como proveedor nuevo` : 'Agregar proveedor nuevo'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
