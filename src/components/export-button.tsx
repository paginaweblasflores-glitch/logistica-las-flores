'use client'

import { useState } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { btnClass } from '@/components/ui'

/**
 * Exporta una vista/tabla a Excel (.xlsx) respetando filtros de igualdad y rango de fechas.
 * Descarga en páginas de 1 000 filas para soportar grandes volúmenes.
 */
export function ExportButton({ filename, table, columns, filters = {}, dateColumn, desde, hasta, order, label = 'Excel' }: {
  label?: string
  filename: string
  table: string
  columns: Record<string, string>
  filters?: Record<string, string | null | undefined>
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
      for (let from = 0; ; from += 1000) {
        let q = supabase.from(table).select(Object.keys(columns).join(','))
        for (const [k, v] of Object.entries(filters)) if (v) q = q.eq(k, v)
        if (dateColumn && desde) q = q.gte(dateColumn, desde)
        if (dateColumn && hasta) q = q.lte(dateColumn, `${hasta}T23:59:59`)
        if (order) q = q.order(order)
        const { data, error } = await q.range(from, from + 999)
        if (error) throw error
        rows.push(...((data ?? []) as unknown as Record<string, unknown>[]))
        if (!data || data.length < 1000 || rows.length > 200_000) break
      }
      const XLSX = await import('xlsx')
      const sheet = XLSX.utils.json_to_sheet(rows.map((r) => Object.fromEntries(Object.entries(columns).map(([k, label]) => {
        const v = r[k]
        return [label, typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v]
      }))))
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
