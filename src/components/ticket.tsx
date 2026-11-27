'use client'

import { useEffect, useRef } from 'react'
import { useMontado } from '@/lib/use-montado'
import { createPortal } from 'react-dom'
import { Printer } from 'lucide-react'
import { btnClass } from '@/components/ui'

/**
 * Ticket para la tiquetera térmica (80 mm, 64 mm de contenido): salidas y traspasos.
 * Igual al sistema anterior del almacén: todo negro y en negrita (la térmica no imprime grises),
 * firma al pie y papel extra al final para cortar.
 */
export type TicketData = {
  logo?: string
  negocio: string
  titulo: string            // «Comprobante de salida de almacén»
  numero: string            // «S-00012»
  datos: [string, string][] // Fecha, Área destino, Origen → Destino…
  items: { descripcion: string; cantidad: string; unidad: string }[]
  observacion?: string | null
  firmas: { nombre?: string | null; etiqueta: string }[]
}

const linea = { display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11px', lineHeight: '1.5' } as const
const bloque = { borderBottom: '1px dashed #000', paddingBottom: '6px', marginBottom: '6px' } as const

/** Botón «Imprimir ticket»; con `auto` se imprime solo al abrir (recién registrado). */
export function TicketButton({ data, auto = false, label = 'Imprimir ticket' }: { data: TicketData; auto?: boolean; label?: string }) {
  const listo = useMontado()   // el ticket se arma en <body>: solo en el navegador
  const hecho = useRef(false)
  // tareas pendientes de la impresión: se cancelan si se sale de la pantalla antes de imprimir
  const pendientes = useRef<(() => void)[]>([])
  useEffect(() => {
    return () => {
      pendientes.current.forEach((cancelar) => cancelar()); pendientes.current = []
      document.documentElement.classList.remove('imprimiendo-ticket')
      document.getElementById('hoja-ticket')?.remove()   // las demás impresiones (OC, resumen) vuelven a A4
    }
  }, [])

  function imprimir() {
    const html = document.documentElement
    // la hoja del ticket (80 mm, sin márgenes) se impone para TODA la impresión mientras dura: algunos navegadores
    // no aplican la «página con nombre» (@page ticket) y usaban la hoja A4 del sistema, achicando el ticket y
    // agregando fecha y título de la pestaña. Sin márgenes, el navegador tampoco imprime esos encabezados.
    // «80mm auto» NO es válido en CSS: varios Chrome lo descartan y arman la hoja en A4 (la de las demás impresiones)
    // y luego la achican al rollo: el ticket salía diminuto y al centro. Se mide el alto real del ticket y se da
    // una medida exacta (80 mm × alto), que todos los navegadores respetan.
    const alto = altoTicketMm()
    document.getElementById('hoja-ticket')?.remove()
    const hoja = document.createElement('style')
    hoja.id = 'hoja-ticket'
    hoja.textContent = `@page { size: 80mm ${alto}mm; margin: 0; } @page ticket { size: 80mm ${alto}mm; margin: 0; } @media print { html, body { width: 80mm !important; } }`
    document.head.appendChild(hoja)   // al final del <head>: gana sobre la hoja A4 de globals.css
    const fin = () => {
      html.classList.remove('imprimiendo-ticket'); document.getElementById('hoja-ticket')?.remove(); window.removeEventListener('afterprint', fin)
    }
    html.classList.add('imprimiendo-ticket')
    window.addEventListener('afterprint', fin)
    // espera el logo (si no, sale roto en la tiquetera)
    const logo = document.querySelector<HTMLImageElement>('.ticket-portal img')
    if (logo && !logo.complete) {
      let ok = false
      const go = () => { if (!ok) { ok = true; window.print() } }
      logo.addEventListener('load', go, { once: true }); logo.addEventListener('error', go, { once: true })
      const espera = setTimeout(go, 1500)
      pendientes.current.push(() => {
        ok = true; clearTimeout(espera)
        logo.removeEventListener('load', go); logo.removeEventListener('error', go); window.removeEventListener('afterprint', fin)
      })
    } else window.print()
  }

  useEffect(() => {
    if (!auto || !listo || hecho.current) return
    hecho.current = true
    // quita ?imprimir=1 para que al recargar no vuelva a imprimir
    window.history.replaceState(null, '', window.location.pathname)
    const espera = setTimeout(imprimir, 300)
    pendientes.current.push(() => clearTimeout(espera))
  }, [auto, listo])

  return (
    <>
      <button type="button" onClick={imprimir} className={btnClass('outline')}><Printer className="size-4" /> {label}</button>
      {listo && createPortal(<Ticket data={data} />, document.body)}
    </>
  )
}

/** Alto del ticket en mm (se dibuja un momento fuera de la pantalla, con el ancho y la letra de la impresión). */
function altoTicketMm() {
  const t = document.querySelector<HTMLElement>('.ticket-portal')
  if (!t) return 200
  const antes = t.getAttribute('style')
  t.setAttribute('style', 'display:block;position:absolute;left:-10000px;top:0;width:64mm;padding:0 0 0 6mm;font-family:system-ui,Arial,sans-serif;font-size:11px;font-weight:700')
  const px = t.getBoundingClientRect().height
  if (antes === null) t.removeAttribute('style'); else t.setAttribute('style', antes)
  // px → mm (96 px = 25,4 mm) y 4 mm de margen por redondeos
  return Math.max(60, Math.ceil((px * 25.4) / 96) + 4)
}

function Ticket({ data }: { data: TicketData }) {
  return (
    <div className="ticket-portal">
      <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '6px', marginBottom: '6px' }}>
        {data.logo && <img src={data.logo} alt="" style={{ width: '44px', height: '44px', objectFit: 'contain', display: 'block', margin: '0 auto 4px' }} />}
        <div style={{ fontSize: '13px' }}>{data.negocio}</div>
        <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '2px' }}>{data.titulo}</div>
        <div style={{ fontSize: '12px', marginTop: '3px' }}>N° {data.numero}</div>
      </div>
      <div style={bloque}>
        {data.datos.map(([k, v]) => (
          <div key={k} style={linea}><span style={{ flexShrink: 0 }}>{k}</span><span style={{ textAlign: 'right', maxWidth: '62%', overflowWrap: 'break-word' }}>{v}</span></div>
        ))}
      </div>
      <div style={bloque}>
        <div style={{ ...linea, fontSize: '10px', textTransform: 'uppercase', borderBottom: '1px solid #000', paddingBottom: '3px', marginBottom: '4px' }}>
          <span>Producto</span><span style={{ flexShrink: 0 }}>Cant.</span>
        </div>
        {data.items.map((it, i) => (
          <div key={i} style={{ ...linea, marginBottom: '2px' }}>
            <span style={{ maxWidth: '64%', overflowWrap: 'break-word' }}>{it.descripcion}</span>
            <span style={{ flexShrink: 0 }}>{it.cantidad} {it.unidad}</span>
          </div>
        ))}
        <div style={{ ...linea, borderTop: '1px solid #000', marginTop: '4px', paddingTop: '3px' }}><span>Ítems</span><span>{data.items.length}</span></div>
      </div>
      {data.observacion && (
        <div style={bloque}>
          <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Observación</div>
          <div style={{ fontSize: '11px', lineHeight: '1.5', overflowWrap: 'break-word' }}>{data.observacion}</div>
        </div>
      )}
      {data.firmas.map((f, i) => (
        <div key={i} style={{ textAlign: 'center', paddingTop: '55px' }}>
          <div style={{ borderTop: '1px solid #000', width: '70%', margin: '0 auto 4px' }} />
          {f.nombre && <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}>{f.nombre}</div>}
          <div style={{ fontSize: '9px' }}>{f.etiqueta}</div>
        </div>
      ))}
      <br /><br /><br /><br /><br />
    </div>
  )
}
