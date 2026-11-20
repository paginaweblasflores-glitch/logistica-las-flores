'use client'

/**
 * Precio de una línea de compra con sus tres caras ENLAZADAS (como en la factura y como lo guarda el sistema):
 *  · Precio por la unidad en que se escribió (S/ 170 por saco)
 *  · Importe de la línea (S/ 850 por 5 sacos): si se escribe el de la factura, el precio se saca de ahí
 *  · Precio por la unidad del producto (S/ 3.40 por kg): lo calcula el sistema y se puede corregir
 * Cambie cualquiera y las otras se recalculan: siempre cantidad × precio = importe, y el costo por unidad
 * chica (el que va al stock) es el real, con rebajas incluidas.
 */

const num = (v: string | number | null | undefined) => Number(String(v ?? '').replace(',', '.'))
/** 6 decimales: el precio por saco que sale de un importe o de un precio por kilo no pierde exactitud */
const fino = (n: number) => String(Math.round(n * 1e6) / 1e6)
const soles2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '')

export const importeDe = (cantidad: string | number | null | undefined, precio: string | number | null | undefined) =>
  (num(cantidad) || 0) * (num(precio) || 0)

/** precio por la unidad escrita a partir del importe de la factura (vacío si aún no hay cantidad) */
export const precioDesdeImporte = (importe: string, cantidad: string | number | null | undefined) =>
  num(cantidad) > 0 && importe.trim() !== '' ? fino(num(importe) / num(cantidad)) : null
/** precio por la unidad escrita a partir del precio por unidad del producto (1 saco = 50 kg → × 50) */
export const precioDesdeChica = (chica: string, factor: number) => (chica.trim() !== '' ? fino(num(chica) * factor) : '')

/**
 * Reparte el total del comprobante entre las líneas según su importe (un descuento o recargo sobre el total
 * de la factura): devuelve el factor por el que se multiplica el precio de cada línea.
 */
export const factorReparto = (totalDoc: string, suma: number) => (suma > 0 && num(totalDoc) > 0 ? num(totalDoc) / suma : 1)
export const repartirPrecio = (precio: string, factor: number) => (precio.trim() === '' ? precio : fino(num(precio) * factor))

/** Celda «Precio»: el de la unidad escrita y, debajo, el de la unidad del producto (editable) */
export function PrecioCelda({ precio, factor, unidad, chicaEscrita, onPrecio, onChica, etiqueta, requerido }: {
  precio: string; factor: number; unidad: string
  /** lo que se está escribiendo en «por kg» (para no reescribirlo mientras se teclea) */
  chicaEscrita?: string | null
  onPrecio: (v: string) => void; onChica: (precioNuevo: string, escrito: string) => void
  etiqueta: string; requerido?: boolean
}) {
  const chica = chicaEscrita ?? (precio.trim() !== '' && factor > 0 ? String(Math.round((num(precio) / factor) * 10000) / 10000) : '')
  return (
    <div>
      <input inputMode="decimal" value={precio} required={requerido} onFocus={(e) => e.target.select()} onChange={(e) => onPrecio(e.target.value)}
        aria-label={etiqueta} placeholder="0.00" className="field h-8 text-right tabular" />
      {factor !== 1 && (
        <label className="mt-1 flex items-center justify-end gap-1 text-[11px] whitespace-nowrap text-muted" title="Lo calcula el sistema; corríjalo si el precio real por unidad es otro">
          S/
          <input inputMode="decimal" value={chica} onFocus={(e) => e.target.select()} onChange={(e) => onChica(precioDesdeChica(e.target.value, factor), e.target.value)}
            aria-label={`${etiqueta} por ${unidad}`} className="field h-6 w-20 px-1.5 text-right text-[11px] tabular" />
          por {unidad.toLowerCase()}
        </label>
      )}
    </div>
  )
}

/** Celda «Importe»: se calcula solo; si se escribe el de la factura, el precio se ajusta */
export function ImporteCelda({ cantidad, precio, escrito, onImporte, etiqueta }: {
  cantidad: string | number | null | undefined; precio: string
  /** lo que se está escribiendo (para no reescribirlo mientras se teclea) */
  escrito?: string | null
  onImporte: (precioNuevo: string | null, escrito: string) => void; etiqueta: string
}) {
  const valor = escrito ?? (num(precio) > 0 && num(cantidad) > 0 ? soles2(importeDe(cantidad, precio)) : '')
  return (
    <input inputMode="decimal" value={valor} onFocus={(e) => e.target.select()} placeholder="0.00"
      onChange={(e) => onImporte(precioDesdeImporte(e.target.value, cantidad), e.target.value)}
      disabled={!(num(cantidad) > 0)} title={num(cantidad) > 0 ? 'Escriba el importe de la factura y el precio se ajusta' : 'Primero la cantidad'}
      aria-label={etiqueta} className="field h-8 text-right font-semibold tabular" />
  )
}
