'use client'

import { useState } from 'react'
import { Download, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { btnClass } from '@/components/ui'

export type Hoja = { nombre: string; filas: (string | number | null)[][] }

/** Excel del reporte: una hoja por cuadro (los mismos datos que se ven en pantalla). */
export function ExcelReporte({ archivo, hojas }: { archivo: string; hojas: Hoja[] }) {
  const [busy, setBusy] = useState(false)
  async function exportar() {
    setBusy(true)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      for (const h of hojas) {
        const ws = XLSX.utils.aoa_to_sheet(h.filas)
        ws['!cols'] = (h.filas[0] ?? []).map((_, i) => ({ wch: Math.max(12, ...h.filas.map((f) => String(f[i] ?? '').length + 2)) }))
        XLSX.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31))
      }
      XLSX.writeFile(wb, `${archivo}.xlsx`)
    } catch (e) {
      toast.error(`No se pudo exportar: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" onClick={exportar} disabled={busy} className={btnClass('outline')}>
      {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} Excel
    </button>
  )
}
