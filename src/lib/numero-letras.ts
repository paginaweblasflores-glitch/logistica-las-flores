const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce',
  'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
  'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve']
const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa']
const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos']

function menorMil(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cien'
  const c = Math.floor(n / 100), r = n % 100
  let s = CENTENAS[c]
  if (r) {
    const dec = r < 30 ? UNIDADES[r] : DECENAS[Math.floor(r / 10)] + (r % 10 ? ' y ' + UNIDADES[r % 10] : '')
    s = (s ? s + ' ' : '') + dec
  }
  return s
}

function entero(n: number): string {
  if (n === 0) return 'cero'
  const millones = Math.floor(n / 1_000_000), miles = Math.floor((n % 1_000_000) / 1000), resto = n % 1000
  const partes: string[] = []
  if (millones) partes.push(millones === 1 ? 'un millón' : `${entero(millones)} millones`)
  if (miles) partes.push(miles === 1 ? 'mil' : `${menorMil(miles).replace(/uno$/, 'un')} mil`)
  if (resto) partes.push(menorMil(resto))
  return partes.join(' ')
}

/** 43.3 → "Cuarenta y tres con 30/100 soles" */
export function solesEnLetras(monto: number): string {
  const n = Math.round(Math.abs(monto) * 100)
  const e = Math.floor(n / 100), c = n % 100
  const txt = `${entero(e).replace(/uno$/, 'un')} con ${String(c).padStart(2, '0')}/100 soles`
  return txt.charAt(0).toUpperCase() + txt.slice(1)
}
