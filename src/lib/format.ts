const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', minimumFractionDigits: 2 })
const solesCompact = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', notation: 'compact', maximumFractionDigits: 1 })
const qtyFmt = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 3 })
const intFmt = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 0 })
const pctFmt = new Intl.NumberFormat('es-PE', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 2 })

type Num = number | string | null | undefined
const n = (v: Num) => (v === null || v === undefined || v === '' ? null : Number(v))

export const fmtSoles = (v: Num) => (n(v) === null ? '—' : soles.format(n(v)!))
export const fmtSolesCompact = (v: Num) => (n(v) === null ? '—' : Math.abs(n(v)!) < 10000 ? soles.format(n(v)!) : solesCompact.format(n(v)!))
export const fmtQty = (v: Num) => (n(v) === null ? '—' : qtyFmt.format(n(v)!))
export const fmtInt = (v: Num) => (n(v) === null ? '—' : intFmt.format(n(v)!))
export const fmtPct = (v: Num) => (n(v) === null ? '—' : pctFmt.format(n(v)!))

export function fmtDate(v: string | Date | null | undefined, withTime = false) {
  if (!v) return '—'
  const d = typeof v === 'string' ? new Date(v.length === 10 ? `${v}T12:00:00` : v) : v
  return d.toLocaleString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'America/Lima',
  })
}

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

/** Fecha de hoy en Lima como YYYY-MM-DD */
export function hoyLima() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date())
}
export function inicioMes(fecha = hoyLima()) {
  return `${fecha.slice(0, 7)}-01`
}
