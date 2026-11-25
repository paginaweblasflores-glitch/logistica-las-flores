'use client'

import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { btnClass } from '@/components/ui'

export type FilaImagen = { codigo: string; producto: string; cantidad: string }

type Datos = {
  /** solo dígitos, con el código del país (51…) */
  numero: string
  titulo: string
  /** «Almacén 01 — Hotel Umaru · aprobado el …» */
  detalle: string
  empresa: string
  ruc: string
  logo: string
  filas: FilaImagen[]
  observacion?: string | null
}

const W = 1080, P = 56
const FUENTE = 'system-ui, -apple-system, "Segoe UI", Arial, sans-serif'
const TINTA = '#1a1a1a', GRIS = '#6b6b6b', LINEA = '#d9d4cc', FONDO = '#f4f1ec', MARCA = '#c8102e'

/** parte un texto en líneas que entren en `ancho` */
function partir(ctx: CanvasRenderingContext2D, texto: string, ancho: number) {
  const lineas: string[] = []
  let actual = ''
  for (const palabra of texto.split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (ctx.measureText(prueba).width > ancho && actual) { lineas.push(actual); actual = palabra } else actual = prueba
  }
  if (actual) lineas.push(actual)
  return lineas.length ? lineas : ['']
}

async function cargarLogo(src: string) {
  try {
    const img = new Image()
    img.src = src
    await img.decode()
    return img
  } catch { return null }
}

/** La imagen del requerimiento (PNG): encabezado del negocio y la tabla de lo aprobado. */
async function dibujar(d: Datos): Promise<Blob> {
  const medir = document.createElement('canvas').getContext('2d')!
  // columnas: N° · Cód. · Producto · Cantidad
  const cN = P, cCod = P + 70, cProd = P + 190, cCantFin = W - P, anchoProd = W - P - 230 - cProd
  medir.font = `26px ${FUENTE}`
  const filas = d.filas.map((f) => ({ ...f, lineas: partir(medir, f.producto, anchoProd) }))
  const altoFila = (n: number) => n * 34 + 26
  const obs = d.observacion ? partir(medir, `Observación: ${d.observacion}`, W - 2 * P) : []
  const alto = 230 + 64 + filas.reduce((s, f) => s + altoFila(f.lineas.length), 0) + (obs.length ? obs.length * 34 + 30 : 0) + 110

  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = alto
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, alto)
  ctx.fillStyle = MARCA; ctx.fillRect(0, 0, W, 10)
  ctx.textBaseline = 'alphabetic'

  // encabezado: logo + empresa a la izquierda, número a la derecha
  const logo = await cargarLogo(d.logo)
  let x = P
  if (logo) { const h = 96, w = Math.min(220, (logo.width / logo.height) * h); ctx.drawImage(logo, P, 44, w, h); x = P + w + 24 }
  ctx.fillStyle = TINTA; ctx.font = `bold 26px ${FUENTE}`; ctx.fillText(d.empresa, x, 84)
  ctx.fillStyle = GRIS; ctx.font = `22px ${FUENTE}`; ctx.fillText(`RUC ${d.ruc}`, x, 118)
  ctx.textAlign = 'right'
  ctx.fillStyle = GRIS; ctx.font = `bold 20px ${FUENTE}`; ctx.fillText('REQUERIMIENTO APROBADO', W - P, 78)
  ctx.fillStyle = TINTA; ctx.font = `bold 34px ${FUENTE}`; ctx.fillText(d.titulo, W - P, 120)
  ctx.textAlign = 'left'
  ctx.fillStyle = TINTA; ctx.fillRect(P, 160, W - 2 * P, 3)
  ctx.fillStyle = GRIS; ctx.font = `24px ${FUENTE}`; ctx.fillText(d.detalle, P, 204)

  // tabla
  let y = 230
  ctx.fillStyle = FONDO; ctx.fillRect(P, y, W - 2 * P, 56)
  ctx.fillStyle = TINTA; ctx.font = `bold 22px ${FUENTE}`
  ctx.fillText('N°', cN + 12, y + 36); ctx.fillText('Cód.', cCod, y + 36); ctx.fillText('Producto', cProd, y + 36)
  ctx.textAlign = 'right'; ctx.fillText('Cantidad', cCantFin - 12, y + 36); ctx.textAlign = 'left'
  y += 56
  filas.forEach((f, i) => {
    const h = altoFila(f.lineas.length)
    ctx.fillStyle = GRIS; ctx.font = `24px ${FUENTE}`; ctx.fillText(String(i + 1), cN + 12, y + 44)
    ctx.font = `bold 22px ui-monospace, Consolas, monospace`; ctx.fillText(f.codigo, cCod, y + 44)
    ctx.fillStyle = TINTA; ctx.font = `26px ${FUENTE}`
    f.lineas.forEach((l, j) => ctx.fillText(l, cProd, y + 44 + j * 34))
    ctx.textAlign = 'right'; ctx.font = `bold 26px ${FUENTE}`; ctx.fillText(f.cantidad, cCantFin - 12, y + 44); ctx.textAlign = 'left'
    y += h
    ctx.fillStyle = LINEA; ctx.fillRect(P, y - 1, W - 2 * P, 2)
  })

  if (obs.length) {
    y += 46
    ctx.fillStyle = TINTA; ctx.font = `26px ${FUENTE}`
    obs.forEach((l, j) => ctx.fillText(l, P, y + j * 34))
    y += (obs.length - 1) * 34
  }
  ctx.fillStyle = GRIS; ctx.font = `20px ${FUENTE}`
  ctx.fillText(`${d.filas.length} producto${d.filas.length === 1 ? '' : 's'} · Sistema de Logística · Corporación Las Flores`, P, alto - 44)

  return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo crear la imagen'))), 'image/png'))
}

/**
 * «Enviar por WhatsApp» (requerimiento del almacén aprobado). En el celular abre el menú de compartir con la
 * imagen lista (se elige WhatsApp y el contacto). En la computadora copia la imagen, la descarga y abre el chat
 * del número de Configuración: ahí se pega con Ctrl+V. WhatsApp no deja adjuntar una imagen desde un enlace.
 */
export function EnviarWhatsApp(d: Datos) {
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const texto = `${d.titulo} aprobado · ${d.detalle}`

  async function enviar() {
    setOcupado(true); setAviso(null)
    try {
      const blob = await dibujar(d)
      const archivo = new File([blob], `${d.titulo.replace(/\s+/g, '_')}.png`, { type: 'image/png' })
      const celular = window.matchMedia('(pointer: coarse)').matches
      if (celular && navigator.canShare?.({ files: [archivo] })) {
        try { await navigator.share({ files: [archivo], text: texto }) } catch { /* cerró el menú de compartir */ }
        return
      }
      // computadora: copiar + descargar la imagen y abrir el chat
      let copiada = false
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); copiada = true } catch { /* sin permiso para copiar */ }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = archivo.name; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      if (d.numero) window.open(`https://wa.me/${d.numero}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
      setAviso(copiada ? 'Imagen copiada y descargada: en el chat de WhatsApp pulse Ctrl+V y Enviar.' : 'Imagen descargada: arrástrela al chat de WhatsApp.')
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo crear la imagen.')
    } finally { setOcupado(false) }
  }

  return (
    <span className="relative inline-flex">
      <button type="button" onClick={enviar} disabled={ocupado} className={btnClass('outline')}
        title={d.numero ? `Enviar la imagen del requerimiento al WhatsApp +${d.numero}` : 'Compartir la imagen del requerimiento'}>
        <MessageCircle className="size-4" /> {ocupado ? 'Preparando…' : 'Enviar por WhatsApp'}
      </button>
      {aviso && <span role="status" className="absolute top-full right-0 z-10 mt-2 w-72 rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink-700 shadow-lg">{aviso}</span>}
    </span>
  )
}
