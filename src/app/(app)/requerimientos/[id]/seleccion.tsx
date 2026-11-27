'use client'

import { createContext, useContext, useState } from 'react'
import { Printer } from 'lucide-react'
import { btnClass } from '@/components/ui'

/**
 * Requerimiento del almacén aprobado: Logística marca qué productos le pide a cada proveedor (varios traen lo
 * mismo) y la imagen y la hoja impresa salen solo con lo marcado. No se guarda: es para armar cada envío.
 */
type Sel = { marcados: Set<string>; alternar: (id: string) => void; poner: (ids: string[], v: boolean) => void } & Avisos
/** RL: antes de descargar / imprimir (¿ya se envió?) y después (se marca como enviado) */
type Avisos = { confirmar?: (ids: string[]) => boolean; alListo?: (ids: string[]) => void }
const Ctx = createContext<Sel | null>(null)

/** null fuera de la selección (otros estados del requerimiento): entonces va todo */
export const useSeleccion = () => useContext(Ctx)

export function Seleccion({ children, confirmar, alListo }: { children: React.ReactNode } & Avisos) {
  // empieza vacío: se marca lo que va a este proveedor
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set())
  const alternar = (id: string) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const poner = (ids: string[], v: boolean) => setMarcados(v ? new Set(ids) : new Set())
  // después de descargar / imprimir, las casillas quedan vacías para el siguiente proveedor
  const listo = alListo ? (ids: string[]) => { alListo(ids); setMarcados(new Set()) } : undefined
  return <Ctx.Provider value={{ marcados, alternar, poner, confirmar, alListo: listo }}>{children}</Ctx.Provider>
}

export function MarcaFila({ id, nombre }: { id: string; nombre: string }) {
  const s = useSeleccion()
  if (!s) return null
  return <input type="checkbox" checked={s.marcados.has(id)} onChange={() => s.alternar(id)} aria-label={`Marcar ${nombre}`} className="size-4 accent-brand-600" />
}

export function MarcaTodas({ ids }: { ids: string[] }) {
  const s = useSeleccion()
  if (!s) return null
  const todos = ids.length > 0 && ids.every((id) => s.marcados.has(id))
  return <input type="checkbox" checked={todos} onChange={() => s.poner(ids, !todos)} aria-label="Marcar todos" title="Marcar todos" className="size-4 accent-brand-600" />
}

/** «Imprimir / PDF» con lo marcado (desactivado si no hay nada marcado) */
export function ImprimirMarcados() {
  const s = useSeleccion()
  const vacio = !!s && s.marcados.size === 0
  return (
    <button type="button" disabled={vacio} className={btnClass('outline')}
      onClick={() => {
        const ids = s ? [...s.marcados] : []
        if (s?.confirmar && !s.confirmar(ids)) return
        window.print()   // espera a que se cierre el diálogo de impresión
        s?.alListo?.(ids)
      }}
      title={vacio ? 'Marque en la tabla los productos que va a pedir' : undefined}>
      <Printer className="size-4" /> Imprimir / PDF
    </button>
  )
}

export type FilaDoc = { id: string; producto: string; cantidad: string }

/** filas de la hoja impresa: solo lo marcado */
export function FilasImpresion({ filas }: { filas: FilaDoc[] }) {
  const s = useSeleccion()
  return <tbody>{filas.filter((f) => !s || s.marcados.has(f.id)).map((f, i) => (
    <tr key={f.id}><td className="td">{i + 1}</td><td className="td">{f.producto}</td><td className="td text-right">{f.cantidad}</td></tr>
  ))}</tbody>
}
