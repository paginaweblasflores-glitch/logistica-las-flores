'use client'

import { useState } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { btnClass } from '@/components/ui'
import { inicioDiaLima, finDiaLima } from '@/lib/format'

/**
 * Exporta una vista/tabla a Excel (.xlsx) respetando filtros de igualdad y rango de fechas.
 * Descarga en páginas de 1 000 filas para soportar grandes volúmenes.
 */
export function ExportButton({ filename, table, rpc, columns, filters = {}, dateColumn, desde, hasta, order, desc = false, pie, label = 'Excel' }: {
  /** en lugar de una vista: una función de la base que ya devuelve las filas armadas (reportes con cálculos) */
  rpc?: { fn: string; args: Record<string, unknown> }
  /** lo más reciente primero (como en pantalla) */
  desc?: boolean
  /** filas de resumen al final, separadas por una fila vacía (p. ej. [['Stock total', '5 sacos']]) */
  pie?: [string, string | number][]
  label?: string
  filename: string
  table?: string
  columns: Record<string, string>
  /** un valor: igual a; una lista: cualquiera de esos valores */
  filters?: Record<string, string | string[] | null | undefined>
  dateColumn?: string
  desde?: string
  hasta?: string
  order?: string
}) {
  const [busy, setBusy] = useState(false)

  async function exportar() {
    setBusy(true)
    try {
      const supabase = createClient()
      const rows: Record<string, unknown>[] = []
      if (rpc) {
        const { data, error } = await supabase.rpc(rpc.fn, rpc.args)
        if (error) throw error
        rows.push(...((data ?? []) as Record<string, unknown>[]))
      }
      for (let from = 0; !rpc && table; from += 1000) {
        let q = supabase.from(table).select(Object.keys(columns).join(','))
        for (const [k, v] of Object.entries(filters)) {
          if (Array.isArray(v)) q = q.in(k, v)
          else if (v) q = q.eq(k, v)
        }
        if (dateColumn && desde) q = q.gte(dateColumn, inicioDiaLima(desde))
        if (dateColumn && hasta) q = q.lte(dateColumn, finDiaLima(hasta))
        if (order) q = q.order(order, { ascending: !desc })
        const { data, error } = await q.range(from, from + 999)
        if (error) throw error
        rows.push(...((data ?? []) as unknown as Record<string, unknown>[]))
        if (!data || data.length < 1000 || rows.length > 200_000) break
      }
      const XLSX = await import('xlsx')
      // solo las cantidades pasan a número: los códigos y documentos quedan como texto («00123» no se vuelve 123)
      const esCodigo = (k: string, label: string) => /codigo|cod|cód|nro|numero|n°|documento|guia|guía|ruc|serie|placa|telefono/i.test(`${k} ${label}`)
      const sheet = XLSX.utils.json_to_sheet(rows.map((r) => Object.fromEntries(Object.entries(columns).map(([k, label]) => {
        const v = r[k]
        const numero = typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && !esCodigo(k, label)
          && !/^-?0\d/.test(v) && v.replace(/[-.]/g, '').length <= 15
        return [label, numero ? Number(v) : v]
      }))))
      if (pie?.length) XLSX.utils.sheet_add_aoa(sheet, [[], ...pie], { origin: -1 })
      sheet['!cols'] = Object.values(columns).map((c) => ({ wch: Math.max(12, c.length + 4) }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, sheet, filename.slice(0, 31))
      XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`)
      toast.success(`${rows.length.toLocaleString('es-PE')} filas exportadas`)
    } catch (e) {
      toast.error(`No se pudo exportar: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button onClick={exportar} disabled={busy} className={btnClass('outline')}>
      {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} {label}
    </button>
  )
}
