'use client'

import { useState } from 'react'
import { FileSpreadsheet, LoaderCircle } from 'lucide-react'
import { btnClass } from '@/components/ui'

export type Hoja = { nombre: string; filas: Record<string, string | number | null>[] }

/** Descarga un libro Excel con varias hojas ya calculadas en el servidor */
export function ReportExport({ archivo, hojas }: { archivo: string; hojas: Hoja[] }) {
  const [busy, setBusy] = useState(false)
  return (
    <button className={btnClass('dark')} disabled={busy} onClick={async () => {
      setBusy(true)
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      for (const h of hojas) {
        const ws = XLSX.utils.json_to_sheet(h.filas)
        ws['!cols'] = Object.keys(h.filas[0] ?? {}).map((k) => ({ wch: Math.max(12, k.length + 3) }))
        XLSX.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31))
      }
      XLSX.writeFile(wb, `${archivo}.xlsx`)
      setBusy(false)
    }}>
      {busy ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />} Descargar reporte Excel
    </button>
  )
}
