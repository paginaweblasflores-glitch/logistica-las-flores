'use client'

import { useState } from 'react'
import { FileSpreadsheet, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { btnClass } from '@/components/ui'
import { inicioDiaLima, finDiaLima, MESES, fmtDate } from '@/lib/format'
import { nombreComprobante } from '@/lib/documentos'

/** una compra que llegó (v_ingreso_almacen) */
type Fila = { compra_id: string; fecha_ingreso: string; almacen: string; producto: string; marca: string | null; unidad: string
  cantidad: number; precio_unitario: number; total: number; proveedor: string | null; tipo_documento: string | null; numero_documento: string | null }

const COLOR = { titulo: 'FF1A1A1A', cabecera: 'FFC8102E', cebra: 'FFF6F2EC', total: 'FFEDE7DE', borde: 'FFD9D4CC' }
const SOLES = '#,##0.00'
const CANT = '#,##0.###'
const corto = (a: string) => a.replace(/\s*—.*$/, '')

/**
 * Anexo en Excel del Informe al Directorio: las compras del mes (su formato de siempre: una fila por compra) y el
 * resumen por producto. Con «año» trae una hoja por mes y la hoja ANUAL. Con formato: título con RUC y razón
 * social, encabezados en color, filas alternadas, bordes y soles con 2 decimales.
 */
export function ExcelDirectorio({ localId, ruc, razon, desde, hasta, etiqueta, estado, anio = false }: {
  localId: string; ruc: string; razon: string
  /** el mes (o el año) a descargar */
  desde: string; hasta: string
  /** «Noviembre 2026» o «Año 2026» */
  etiqueta: string
  /** «Avance al 20/11/2026» o «Mes cerrado» */
  estado: string
  anio?: boolean
}) {
  const [ocupado, setOcupado] = useState(false)

  async function descargar() {
    setOcupado(true)
    try {
      const supabase = createClient()
      const filas: Fila[] = []
      for (let desdeFila = 0; ; desdeFila += 1000) {
        const { data, error } = await supabase.from('v_ingreso_almacen')
          .select('compra_id, fecha_ingreso, almacen, producto, marca, unidad, cantidad, precio_unitario, total, proveedor, tipo_documento, numero_documento')
          .eq('local_id', localId).gte('fecha_ingreso', inicioDiaLima(desde)).lte('fecha_ingreso', finDiaLima(hasta))
          .order('fecha_ingreso').order('producto').range(desdeFila, desdeFila + 999)
        if (error) throw error
        filas.push(...((data ?? []) as Fila[]))
        if (!data || data.length < 1000) break
      }
      const ExcelJS = (await import('exceljs')).default
      const libro = new ExcelJS.Workbook()
      libro.creator = 'Sistema de Logística · Corporación Las Flores'
      const titulo = `${ruc} – ${razon}`
      const mesDe = (f: Fila) => Number(new Date(f.fecha_ingreso).toLocaleString('en-CA', { timeZone: 'America/Lima', month: 'numeric' }))

      if (anio) {
        // primero el resumen ANUAL y después una hoja por mes con compras
        hojaAnual(libro, titulo, `Resumen anual ${desde.slice(0, 4)} · ${estado}`, filas, mesDe)
        const meses = [...new Set(filas.map(mesDe))].sort((a, b) => a - b)
        for (const m of meses) hojaCompras(libro, MESES[m - 1].slice(0, 3).toUpperCase(), titulo, `Compras de ${MESES[m - 1].toLowerCase()} ${desde.slice(0, 4)}`, filas.filter((f) => mesDe(f) === m))
      } else {
        hojaCompras(libro, 'Compras del mes', titulo, `Compras de ${etiqueta.toLowerCase()} · ${estado}`, filas)
        hojaResumen(libro, titulo, `Resumen por producto · ${etiqueta.toLowerCase()} · ${estado}`, filas)
      }
      const buf = await libro.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a')
      a.href = url; a.download = `Informe_Directorio_${razon.replace(/[^A-Z0-9]+/gi, '_')}_${anio ? desde.slice(0, 4) : desde.slice(0, 7)}.xlsx`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      toast.success(`${filas.length.toLocaleString('es-PE')} compras exportadas`)
    } catch (e) {
      toast.error(`No se pudo exportar: ${(e as Error).message}`)
    } finally { setOcupado(false) }
  }

  return (
    <button type="button" onClick={descargar} disabled={ocupado} className={btnClass('outline')}>
      {ocupado ? <LoaderCircle className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />} {anio ? 'Excel del año' : 'Excel del mes (anexo)'}
    </button>
  )
}

type Libro = import('exceljs').Workbook
type Hoja = import('exceljs').Worksheet

/** título (RUC – razón social) y subtítulo, ocupando todo el ancho de la tabla */
function encabezado(h: Hoja, columnas: number, titulo: string, subtitulo: string) {
  h.mergeCells(1, 1, 1, columnas)
  h.mergeCells(2, 1, 2, columnas)
  const t = h.getCell(1, 1)
  t.value = titulo; t.font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLOR.titulo } }; t.alignment = { horizontal: 'center' }
  const s = h.getCell(2, 1)
  s.value = subtitulo; s.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF6B6B6B' } }; s.alignment = { horizontal: 'center' }
  h.getRow(1).height = 28
}

/** la fila de nombres de columna (fila 4) y la tabla con bordes, filas alternadas y fila de total */
function tabla(h: Hoja, cols: { titulo: string; ancho: number; formato?: string }[], datos: (string | number | null)[][], total?: (string | number | null)[]) {
  const cab = h.getRow(4)
  cols.forEach((c, i) => {
    h.getColumn(i + 1).width = c.ancho
    const celda = cab.getCell(i + 1)
    celda.value = c.titulo
    celda.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.cabecera } }
    celda.alignment = { vertical: 'middle', horizontal: c.formato ? 'right' : 'left', wrapText: true }
  })
  cab.height = 22
  const borde = { style: 'thin' as const, color: { argb: COLOR.borde } }
  const filas = total ? [...datos, total] : datos
  filas.forEach((d, r) => {
    const fila = h.getRow(5 + r)
    const esTotal = total && r === filas.length - 1
    d.forEach((v, i) => {
      const celda = fila.getCell(i + 1)
      celda.value = v
      if (cols[i].formato) { celda.numFmt = cols[i].formato!; celda.alignment = { horizontal: 'right' } }
      celda.border = { top: borde, bottom: borde, left: borde, right: borde }
      if (esTotal) { celda.font = { bold: true }; celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.total } } }
      else if (r % 2 === 1) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.cebra } }
    })
  })
  // el encabezado queda fijo al bajar
  h.views = [{ state: 'frozen', ySplit: 4 }]
}

const r2 = (n: number) => Math.round(n * 100) / 100
const suma = (fs: Fila[]) => r2(fs.reduce((s, f) => s + Number(f.total), 0))

/** su formato de siempre: una fila por compra, con almacén, proveedor y comprobante; total al final */
function hojaCompras(libro: Libro, nombre: string, titulo: string, subtitulo: string, fs: Fila[]) {
  const h = libro.addWorksheet(nombre, { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } })
  const cols = [
    { titulo: 'Fecha de entrada', ancho: 14 }, { titulo: 'Almacén', ancho: 13 }, { titulo: 'Nombre del producto', ancho: 42 }, { titulo: 'Marca', ancho: 16 },
    { titulo: 'Unidad', ancho: 9 }, { titulo: 'Cantidad', ancho: 11, formato: CANT }, { titulo: 'Precio unidad', ancho: 13, formato: SOLES },
    { titulo: 'Total', ancho: 13, formato: SOLES }, { titulo: 'Proveedor', ancho: 30 }, { titulo: 'Comprobante', ancho: 22 },
  ]
  encabezado(h, cols.length, titulo, subtitulo)
  tabla(h, cols, fs.map((f) => [fmtDate(f.fecha_ingreso), corto(f.almacen), f.producto, f.marca ?? '', f.unidad, Number(f.cantidad), r2(Number(f.precio_unitario)), r2(Number(f.total)),
    f.proveedor ?? '', [nombreComprobante(f.tipo_documento), f.numero_documento].filter(Boolean).join(' ')]),
    ['TOTAL', '', `${new Set(fs.map((f) => f.compra_id)).size} compras`, '', '', null, null, suma(fs), '', ''])
}

/** una fila por producto: cuántas veces se compró, cuánto, a qué precio y cuánto se gastó */
function hojaResumen(libro: Libro, titulo: string, subtitulo: string, fs: Fila[]) {
  const h = libro.addWorksheet('Resumen por producto', { pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } })
  const grupos = new Map<string, Fila[]>()
  for (const f of fs) grupos.set(`${f.producto}|${f.unidad}`, [...(grupos.get(`${f.producto}|${f.unidad}`) ?? []), f])
  const datos = [...grupos.values()].map((g) => {
    const cant = g.reduce((s, f) => s + Number(f.cantidad), 0)
    const total = suma(g)
    return [g[0].producto, g[0].marca ?? '', g[0].unidad, g.length, cant, cant ? r2(total / cant) : null, r2(Number(g.at(-1)!.precio_unitario)), total] as (string | number | null)[]
  }).sort((a, b) => Number(b[7]) - Number(a[7]))
  const cols = [
    { titulo: 'Nombre del producto', ancho: 42 }, { titulo: 'Marca', ancho: 16 }, { titulo: 'Unidad', ancho: 9 }, { titulo: 'Veces comprado', ancho: 11, formato: '0' },
    { titulo: 'Cantidad total', ancho: 12, formato: CANT }, { titulo: 'Precio promedio', ancho: 13, formato: SOLES }, { titulo: 'Último precio', ancho: 13, formato: SOLES },
    { titulo: 'Total', ancho: 14, formato: SOLES },
  ]
  encabezado(h, cols.length, titulo, subtitulo)
  tabla(h, cols, datos, ['TOTAL', '', '', fs.length, null, null, null, suma(fs)])
}

/** el total comprado de cada mes del año */
function hojaAnual(libro: Libro, titulo: string, subtitulo: string, fs: Fila[], mesDe: (f: Fila) => number) {
  const h = libro.addWorksheet('ANUAL', { pageSetup: { orientation: 'portrait', fitToPage: true, paperSize: 9 } })
  const cols = [{ titulo: 'Mes', ancho: 16 }, { titulo: 'Compras', ancho: 11, formato: '0' }, { titulo: 'Productos comprados', ancho: 14, formato: '0' }, { titulo: 'Total', ancho: 16, formato: SOLES }]
  encabezado(h, cols.length, titulo, subtitulo)
  const datos = MESES.map((nombre, i) => {
    const del = fs.filter((f) => mesDe(f) === i + 1)
    return [nombre, new Set(del.map((f) => f.compra_id)).size, del.length, suma(del)] as (string | number | null)[]
  })
  tabla(h, cols, datos, ['TOTAL', new Set(fs.map((f) => f.compra_id)).size, fs.length, suma(fs)])
}
