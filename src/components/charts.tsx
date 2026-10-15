'use client'

/**
 * Gráficos del sistema. Regla: el tipo de gráfico lo decide la pregunta que responde el dato.
 *  - Comparar montos entre meses o categorías → Bars (columnas / barras horizontales)
 *  - Ver la tendencia de un porcentaje contra su meta → Lines con `meta`
 *  - ¿Qué meses cumplieron la meta? → Bars con `estado` (verde = cumple, rojo = fuera de meta)
 * Siempre un solo eje Y (nunca dos escalas en el mismo gráfico).
 */
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine,
} from 'recharts'

import { PALETTE, SERIES } from '@/lib/palette'

const soles = (v: number) =>
  Math.abs(v) >= 1000 ? `S/ ${(v / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 })}k` : `S/ ${v.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
const solesFull = (v: number) => `S/ ${v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (v: number) => `${(v * 100).toLocaleString('es-PE', { maximumFractionDigits: 1 })}%`

type Fmt = 'soles' | 'pct' | 'num'
// Eje de porcentajes con 2 decimales para valores chicos (0.15%, 0.2%…) y no repetir etiquetas
const pctAxis = (v: number) => `${(v * 100).toLocaleString('es-PE', { maximumFractionDigits: Math.abs(v) < 0.1 ? 2 : 0 })}%`
const fmtAxis = (f: Fmt) => (f === 'soles' ? soles : f === 'pct' ? pctAxis : (v: number) => v.toLocaleString('es-PE', { maximumFractionDigits: 1 }))
const fmtTip = (f: Fmt) => (f === 'soles' ? solesFull : fmtAxis(f))

/** Marcas "redondas" de 0 hasta cubrir el mayor valor y la meta (así la línea de meta siempre se ve). */
function ticksHasta(max: number) {
  if (!(max > 0)) return undefined
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * 10 ** Math.floor(Math.log10(max / 4))).find((p) => max / p <= 4.5) ?? max / 4
  const n = Math.ceil(max / paso - 1e-9)
  return Array.from({ length: n + 1 }, (_, i) => +(i * paso).toPrecision(6))
}

const axis = { tick: { fontSize: 11, fill: '#6B7280' }, axisLine: false, tickLine: false } as const

type TipItem = { name: string; value: number; color: string; payload?: Record<string, unknown> }
function TooltipBox({ active, payload, label, format, total, estado }: {
  active?: boolean; payload?: TipItem[]; label?: string; format: Fmt; total?: boolean; estado?: Estado
}) {
  if (!active || !payload?.length) return null
  const f = fmtTip(format)
  const items = payload.filter((p) => p.value !== null && p.value !== undefined)
  const suma = items.reduce((s, p) => s + Number(p.value), 0)
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink-900">{label}</p>
      {items.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-muted">
          <span className="size-2 rounded-full" style={{ background: estado ? colorEstado(Number(p.value), estado) : p.color }} />
          {p.name}: <span className="font-semibold text-ink-900 tabular">{f(Number(p.value))}</span>
        </p>
      ))}
      {total && items.length > 1 && (
        <p className="mt-1 border-t border-line pt-1 text-muted">Total: <span className="font-semibold text-ink-900 tabular">{f(suma)}</span></p>
      )}
      {estado && items[0] && (
        <p className="mt-1 font-semibold" style={{ color: colorEstado(Number(items[0].value), estado) }}>
          {cumple(Number(items[0].value), estado) ? '✓ Cumple la meta' : '✕ Fuera de la meta'} ({estado.menorEsMejor ? '≤' : '≥'} {pct(estado.meta)})
        </p>
      )}
    </div>
  )
}

export type SeriesDef = { key: string; name: string; color?: string; stack?: string }
/** Colorea cada barra según cumpla o no la meta. */
export type Estado = { meta: number; menorEsMejor?: boolean }
const cumple = (v: number, e: Estado) => (e.menorEsMejor ? v <= e.meta : v >= e.meta)
const colorEstado = (v: number, e: Estado) => (cumple(v, e) ? PALETTE.leaf : PALETTE.red)

function MetaLine({ meta }: { meta: number }) {
  return <ReferenceLine y={meta} stroke={PALETTE.ink} strokeDasharray="4 4" strokeOpacity={0.55}
    label={{ value: `Meta ${pct(meta)}`, fontSize: 10, fill: PALETTE.ink, position: 'insideTopRight' }} />
}

function LeyendaEstado({ meta, menorEsMejor }: Estado) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs text-muted">
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: PALETTE.leaf }} />Cumple ({menorEsMejor ? '≤' : '≥'} {pct(meta)})</span>
      <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: PALETTE.red }} />Fuera de meta</span>
    </div>
  )
}

export function Bars({ data, x, series, format = 'soles', height = 260, horizontal = false, meta, estado, total }: {
  data: Record<string, unknown>[]; x: string; series: SeriesDef[]; format?: Fmt; height?: number; horizontal?: boolean
  /** Línea de referencia de la meta */
  meta?: number
  /** Pinta cada barra en verde/rojo según cumpla la meta (solo 1 serie) */
  estado?: Estado
  /** Muestra el total de la pila en el tooltip */
  total?: boolean
}) {
  const f = fmtAxis(format)
  const refMeta = estado?.meta ?? meta
  const ticks = !horizontal && refMeta !== undefined && !series.some((x) => x.stack)
    ? ticksHasta(Math.max(refMeta, ...data.flatMap((d) => series.map((x) => Number(d[x.key] ?? 0)))))
    : undefined
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: 4, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke={PALETTE.grid} vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" {...axis} tickFormatter={f} />
              <YAxis type="category" dataKey={x} {...axis} width={150} />
            </>
          ) : (
            <>
              <XAxis dataKey={x} {...axis} />
              <YAxis {...axis} tickFormatter={f} width={62} ticks={ticks} domain={ticks ? [0, ticks[ticks.length - 1]] : undefined} />
            </>
          )}
          <Tooltip cursor={{ fill: 'rgba(15,16,19,0.04)' }} content={<TooltipBox format={format} total={total} estado={estado} />} />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
          {refMeta !== undefined && <MetaLine meta={refMeta} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} stackId={s.stack} fill={s.color ?? SERIES[i % SERIES.length]}
                 stroke={s.stack ? '#fff' : undefined} strokeWidth={s.stack ? 1 : 0}
                 radius={s.stack ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={horizontal ? 18 : 28}>
              {estado && data.map((d, j) => <Cell key={j} fill={colorEstado(Number(d[s.key] ?? 0), estado)} />)}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      {estado && <LeyendaEstado {...estado} />}
    </div>
  )
}

export function Lines({ data, x, series, format = 'soles', height = 260, meta, area = false, domain }: {
  data: Record<string, unknown>[]; x: string; series: SeriesDef[]; format?: Fmt; height?: number; meta?: number; area?: boolean
  domain?: [number, number]
}) {
  const f = fmtAxis(format)
  const Chart = area ? AreaChart : LineChart
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={PALETTE.grid} vertical={false} />
        <XAxis dataKey={x} {...axis} />
        <YAxis {...axis} tickFormatter={f} width={62} domain={domain} />
        <Tooltip content={<TooltipBox format={format} />} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {meta !== undefined && <MetaLine meta={meta} />}
        {series.map((s, i) =>
          area ? (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color ?? SERIES[i]} fill={s.color ?? SERIES[i]} fillOpacity={0.12} strokeWidth={2} />
          ) : (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color ?? SERIES[i]} strokeWidth={2}
                  dot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 5 }} connectNulls />
          ),
        )}
      </Chart>
    </ResponsiveContainer>
  )
}

/** Lista de barras horizontales en HTML: para rankings y participación (quién/dónde más). */
export function BarList({ items, format = 'soles', color = PALETTE.red }: {
  items: { label: React.ReactNode; value: number; share?: number; href?: string; key: string }[]
  format?: Fmt; color?: string
}) {
  const max = Math.max(...items.map((i) => i.value), 0) || 1
  const f = fmtTip(format)
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{i.label}</span>
            <span className="shrink-0 font-semibold tabular">{f(i.value)}{i.share !== undefined && <span className="ml-1 font-normal text-muted">· {pct(i.share)}</span>}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-canvas">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (i.value / max) * 100)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
