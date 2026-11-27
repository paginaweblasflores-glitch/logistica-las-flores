'use client'

import { useState, useSyncExternalStore } from 'react'
import { ImageDown, MessageCircle } from 'lucide-react'
import { btnClass } from '@/components/ui'
import { useSeleccion, type FilaDoc } from './seleccion'

type Datos = {
  /** número interno (RA-UM-2026-0001): solo en el nombre del archivo, no en la imagen */
  referencia: string
  empresa: string
  ruc: string
  /** dirección fiscal de la empresa */
  direccion: string
  logo: string
  filas: FilaDoc[]
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

/**
 * La imagen del pedido para el proveedor (PNG): quién pide (logo, razón social, RUC y dirección), la fecha y lo
 * que debe traer (N°, producto, cantidad). Sin datos internos: ni códigos, ni almacén, ni observaciones.
 */
async function dibujar(d: Datos): Promise<Blob> {
  const medir = document.createElement('canvas').getContext('2d')!
  // columnas: N° · Producto · Cantidad
  const cN = P, cProd = P + 90, cCantFin = W - P, anchoProd = W - P - 230 - cProd
  medir.font = `26px ${FUENTE}`
  const filas = d.filas.map((f) => ({ ...f, lineas: partir(medir, f.producto, anchoProd) }))
  const altoFila = (n: number) => n * 34 + 26
  const fecha = new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' })

  // encabezado: logo + empresa (razón social, RUC, dirección) a la izquierda, «PEDIDO» a la derecha
  const logo = await cargarLogo(d.logo)
  const anchoLogo = logo ? Math.min(220, (logo.width / logo.height) * 96) : 0
  const x = logo ? P + anchoLogo + 24 : P
  medir.font = `20px ${FUENTE}`
  const dir = d.direccion ? partir(medir, d.direccion, W - P - 230 - x) : []
  // la raya baja si la dirección ocupa más de una línea
  const raya = Math.max(160, 116 + dir.length * 26 + 30)
  const dy = raya - 160
  const alto = 230 + dy + 64 + filas.reduce((s, f) => s + altoFila(f.lineas.length), 0) + 110

  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = alto
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, alto)
  ctx.fillStyle = MARCA; ctx.fillRect(0, 0, W, 10)
  ctx.textBaseline = 'alphabetic'

  if (logo) ctx.drawImage(logo, P, 44, anchoLogo, 96)
  ctx.fillStyle = TINTA; ctx.font = `bold 26px ${FUENTE}`; ctx.fillText(d.empresa, x, 78)
  ctx.fillStyle = GRIS; ctx.font = `22px ${FUENTE}`; ctx.fillText(`RUC ${d.ruc}`, x, 110)
  ctx.font = `20px ${FUENTE}`
  dir.forEach((l, j) => ctx.fillText(l, x, 140 + j * 26))
  ctx.textAlign = 'right'
  ctx.fillStyle = TINTA; ctx.font = `bold 40px ${FUENTE}`; ctx.fillText('PEDIDO', W - P, 108)
  ctx.textAlign = 'left'
  ctx.fillStyle = TINTA; ctx.fillRect(P, raya, W - 2 * P, 3)
  ctx.fillStyle = GRIS; ctx.font = `24px ${FUENTE}`; ctx.fillText(`Fecha: ${fecha}`, P, 204 + dy)

  // tabla
  let y = 230 + dy
  ctx.fillStyle = FONDO; ctx.fillRect(P, y, W - 2 * P, 56)
  ctx.fillStyle = TINTA; ctx.font = `bold 22px ${FUENTE}`
  ctx.fillText('N°', cN + 12, y + 36); ctx.fillText('Producto', cProd, y + 36)
  ctx.textAlign = 'right'; ctx.fillText('Cantidad', cCantFin - 12, y + 36); ctx.textAlign = 'left'
  y += 56
  filas.forEach((f, i) => {
    const h = altoFila(f.lineas.length)
    ctx.fillStyle = GRIS; ctx.font = `24px ${FUENTE}`; ctx.fillText(String(i + 1), cN + 12, y + 44)
    ctx.fillStyle = TINTA; ctx.font = `26px ${FUENTE}`
    f.lineas.forEach((l, j) => ctx.fillText(l, cProd, y + 44 + j * 34))
    ctx.textAlign = 'right'; ctx.font = `bold 26px ${FUENTE}`; ctx.fillText(f.cantidad, cCantFin - 12, y + 44); ctx.textAlign = 'left'
    y += h
    ctx.fillStyle = LINEA; ctx.fillRect(P, y - 1, W - 2 * P, 2)
  })

  ctx.fillStyle = GRIS; ctx.font = `20px ${FUENTE}`
  ctx.fillText(`${d.filas.length} producto${d.filas.length === 1 ? '' : 's'}`, P, alto - 44)

  return new Promise((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo crear la imagen'))), 'image/png'))
}

// celular (pantalla táctil) o computadora; en el servidor se asume computadora
const TACTIL = '(pointer: coarse)'
const suscribir = (cb: () => void) => { const m = window.matchMedia(TACTIL); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) }

/**
 * Imagen del requerimiento del almacén aprobado. En el celular: «Enviar por WhatsApp» abre el menú de compartir
 * con la imagen lista (se elige WhatsApp y el contacto). En la computadora: «Descargar imagen», nada más.
 */
export function EnviarWhatsApp(d: Datos) {
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const celular = useSyncExternalStore(suscribir, () => window.matchMedia(TACTIL).matches, () => false)
  const texto = `Pedido · ${d.empresa}`
  // solo lo marcado en la tabla (lo que va a este proveedor); cada clic arma una imagen nueva
  const sel = useSeleccion()
  const filas = sel ? d.filas.filter((f) => sel.marcados.has(f.id)) : d.filas

  const descargar = (blob: Blob, nombre: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = nombre; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  async function enviar() {
    setOcupado(true); setAviso(null)
    try {
      const blob = await dibujar({ ...d, filas })
      const archivo = new File([blob], `Pedido_${d.referencia}.png`, { type: 'image/png' })
      if (!celular) return descargar(blob, archivo.name)
      // celular: el menú de compartir; si el navegador no lo permite, se descarga
      if (navigator.canShare?.({ files: [archivo] })) {
        try { await navigator.share({ files: [archivo], text: texto }) } catch { /* cerró el menú de compartir */ }
      } else {
        descargar(blob, archivo.name)
        setAviso('Este navegador no permite compartir: la imagen se descargó.')
      }
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo crear la imagen.')
    } finally { setOcupado(false) }
  }

  return (
    <span className="relative inline-flex">
      <button type="button" onClick={enviar} disabled={ocupado || !filas.length} className={btnClass('outline')}
        title={!filas.length ? 'Marque en la tabla los productos que va a pedir' : celular ? 'Compartir la imagen del requerimiento por WhatsApp' : 'Descargar la imagen del requerimiento'}>
        {celular ? <MessageCircle className="size-4" /> : <ImageDown className="size-4" />}
        {ocupado ? 'Preparando…' : celular ? 'Enviar por WhatsApp' : 'Descargar imagen'}
      </button>
      {aviso && <span role="status" className="absolute top-full right-0 z-10 mt-2 w-72 rounded-lg border border-line bg-white px-3 py-2 text-xs text-ink-700 shadow-lg">{aviso}</span>}
    </span>
  )
}
