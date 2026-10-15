import { hoyLima } from '@/lib/format'

export type PeriodoKey = 'mes' | 'mes_anterior' | 'trimestre' | 'anio' | 'custom'

export const PERIODOS: { key: PeriodoKey; label: string }[] = [
  { key: 'mes', label: 'Este mes' },
  { key: 'mes_anterior', label: 'Mes anterior' },
  { key: 'trimestre', label: 'Últimos 3 meses' },
  { key: 'anio', label: 'Este año' },
]

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Resuelve el rango de fechas a partir de ?periodo=…&desde=…&hasta=… */
export function resolverPeriodo(params: { periodo?: string; desde?: string; hasta?: string }) {
  const hoy = hoyLima()
  const [y, m] = hoy.split('-').map(Number)
  const key = (params.desde && params.hasta ? 'custom' : params.periodo ?? 'mes') as PeriodoKey
  switch (key) {
    case 'custom':
      return { key, desde: params.desde!, hasta: params.hasta! }
    case 'mes_anterior':
      return { key, desde: iso(new Date(Date.UTC(y, m - 2, 1))), hasta: iso(new Date(Date.UTC(y, m - 1, 0))) }
    case 'trimestre':
      return { key, desde: iso(new Date(Date.UTC(y, m - 3, 1))), hasta: hoy }
    case 'anio':
      return { key, desde: `${y}-01-01`, hasta: hoy }
    default:
      return { key: 'mes' as PeriodoKey, desde: `${hoy.slice(0, 7)}-01`, hasta: hoy }
  }
}
