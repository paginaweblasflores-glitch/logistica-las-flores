'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { marcarFuncion } from '../actions'
import { ESTILO, type Estado } from './estilo'

type Funcion = { id: string; nombre: string; frecuencia: 'diaria' | 'semanal' | 'mensual' }
const SIGUIENTE: Record<string, Estado | null> = { '': 'ok', ok: 'proceso', proceso: 'no', no: null }
const GRUPOS = [{ id: 'diaria', nombre: 'Diarias' }, { id: 'semanal', nombre: 'Semanales' }, { id: 'mensual', nombre: 'Del mes' }] as const
const DIAS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

/** Cuadrícula del mes: cada clic en un día cambia vacío → OK → en proceso → no se realizó → vacío. */
export function GrillaDiagrama({ mes, funciones, marcas, editable, hoy }: {
  mes: string; funciones: Funcion[]; marcas: Record<string, Estado>; editable: boolean; hoy: string
}) {
  const [m, setM] = useState(marcas)
  const [, start] = useTransition()
  const [y, mm] = mes.split('-').map(Number)
  const dias = Array.from({ length: new Date(y, mm, 0).getDate() }, (_, i) => i + 1)
  const fecha = (d: number) => `${mes}-${String(d).padStart(2, '0')}`

  const marcar = (f: string, d: number) => {
    if (!editable || fecha(d) > hoy) return
    const k = `${f}|${fecha(d)}`, nuevo = SIGUIENTE[m[k] ?? '']
    setM((s) => { const c = { ...s }; if (nuevo) c[k] = nuevo; else delete c[k]; return c })
    start(async () => {
      const r = await marcarFuncion(f, fecha(d), nuevo)
      if (r?.error) { toast.error(r.error); setM((s) => ({ ...s, [k]: m[k] })) }
    })
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="th sticky left-0 z-10 min-w-72 bg-canvas">Funciones</th>
            {dias.map((d) => {
              const dow = new Date(y, mm - 1, d).getDay()
              return <th key={d} className={cn('th w-8 px-0 text-center', dow === 0 && 'text-brand-600', fecha(d) === hoy && 'bg-brand-50')}>
                <span className="block text-[10px] font-normal">{DIAS[dow]}</span>{d}</th>
            })}
            <th className="th text-right">Cumplido</th>
          </tr>
        </thead>
        <tbody>
          {GRUPOS.map((g) => {
            const fs = funciones.filter((f) => f.frecuencia === g.id)
            if (!fs.length) return null
            return [
              <tr key={g.id}><td colSpan={dias.length + 2} className="bg-ink-900 px-3 py-1.5 text-[11px] font-bold tracking-wide text-white uppercase">{g.nombre}</td></tr>,
              ...fs.map((f) => {
                const hechos = dias.filter((d) => m[`${f.id}|${fecha(d)}`] === 'ok').length
                const marcados = dias.filter((d) => m[`${f.id}|${fecha(d)}`]).length
                return (
                  <tr key={f.id} className="border-b border-line">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-[12px] leading-snug">{f.nombre}</td>
                    {dias.map((d) => {
                      const e = m[`${f.id}|${fecha(d)}`]
                      return (
                        <td key={d} className="border-l border-line p-0.5 text-center">
                          <button type="button" onClick={() => marcar(f.id, d)} disabled={!editable || fecha(d) > hoy}
                            aria-label={`${f.nombre}, día ${d}: ${e ? ESTILO[e].texto : 'sin marcar'}`}
                            className={cn('h-7 w-full rounded text-[10px] font-bold', e ? ESTILO[e].clase : 'hover:bg-canvas', (!editable || fecha(d) > hoy) && 'cursor-default')}>
                            {e ? ESTILO[e].texto : ''}
                          </button>
                        </td>
                      )
                    })}
                    <td className="px-3 text-right font-semibold tabular whitespace-nowrap">{marcados ? `${hechos} de ${marcados}` : '—'}</td>
                  </tr>
                )
              }),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}
