import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KeepSize, UrlPagination } from '@/components/pager'

/* ───────────────────────── Encabezado de página ───────────────────────── */
export function PageHeader({ title, description, actions, back }: {
  title: string; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string }
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="no-print mb-1.5 inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-brand-600">
            <ChevronLeft className="size-3.5" /> {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ─────────────── Tarjeta de sección (ícono rojo + título + indicadores) ─────────────── */
export function Section({ icon: Icon, title, stats, actions, children, className, bodyClassName }: {
  icon?: LucideIcon; title: string; stats?: { label: string; value: React.ReactNode }[]
  actions?: React.ReactNode; children?: React.ReactNode; className?: string; bodyClassName?: string
}) {
  return (
    <section className={cn('card print-area', className)}>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-white">
              <Icon className="size-4" />
            </span>
          )}
          <h2 className="text-[15px] font-bold text-ink-900">{title}</h2>
        </div>
        {stats && stats.length > 0 && (
          <dl className="ml-auto flex flex-wrap items-baseline gap-x-5 gap-y-1">
            {stats.map((s) => (
              <div key={s.label} className="flex items-baseline gap-1.5">
                <dt className="text-xs text-muted">{s.label}:</dt>
                <dd className="text-[15px] font-bold text-ink-900 tabular">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {actions && <div className={cn('no-print flex items-center gap-2', !stats?.length && 'ml-auto')}>{actions}</div>}
      </header>
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

/* ─────────────────────────── Indicador (KPI) ─────────────────────────── */
export function Stat({ label, value, hint, tone = 'default', icon: Icon, meta }: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon
  tone?: 'default' | 'good' | 'bad' | 'warn'; meta?: { valor: number | null; meta: number; menorEsMejor?: boolean }
}) {
  let resolved = tone
  let ok: boolean | null = null
  if (meta && meta.valor !== null) {
    ok = meta.menorEsMejor ? meta.valor <= meta.meta : meta.valor >= meta.meta
    resolved = ok ? 'good' : 'bad'
  }
  return (
    <div className="card relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
        {Icon && <Icon className="size-4 text-subtle" />}
      </div>
      <p className={cn('mt-2 text-[26px] leading-none font-bold tracking-tight tabular',
        resolved === 'good' && 'text-leaf-600', resolved === 'bad' && 'text-brand-600', resolved === 'warn' && 'text-amber-600')}>
        {value}
      </p>
      {ok !== null && (
        <span className={cn('mt-2 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold', ok ? 'bg-leaf-50 text-leaf-600' : 'bg-brand-50 text-brand-700')}>
          {ok ? '✓ Cumple la meta' : '✕ No cumple la meta'}
        </span>
      )}
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  )
}

/* ──────────────────────────────── Badge ──────────────────────────────── */
const TONES = {
  gray: 'bg-canvas text-ink-700 ring-line',
  red: 'bg-brand-50 text-brand-700 ring-brand-200',
  green: 'bg-leaf-50 text-leaf-600 ring-leaf-500/25',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  dark: 'bg-ink-900 text-white ring-ink-900',
} as const
export type Tone = keyof typeof TONES

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset', TONES[tone], className)}>
      {children}
    </span>
  )
}

const ESTADOS: Record<string, { tone: Tone; label: string }> = {
  borrador: { tone: 'gray', label: 'Borrador' }, aprobada: { tone: 'blue', label: 'Aprobada' },
  recibida: { tone: 'green', label: 'Recibida' }, anulada: { tone: 'red', label: 'Anulada' }, anulado: { tone: 'red', label: 'Anulado' },
  abierto: { tone: 'amber', label: 'Abierto' }, verificacion: { tone: 'blue', label: 'En verificación' }, cerrado: { tone: 'green', label: 'Cerrado' },
  solicitado: { tone: 'amber', label: 'Solicitado' }, en_cotizacion: { tone: 'violet', label: 'En cotización' },
  aprobado: { tone: 'blue', label: 'Aprobado' }, comprado: { tone: 'blue', label: 'Comprado' }, atendido: { tone: 'green', label: 'Atendido' },
  rechazado: { tone: 'red', label: 'Rechazado' }, enviado: { tone: 'amber', label: 'En tránsito' }, recibido: { tone: 'green', label: 'Recibido' },
  pendiente: { tone: 'amber', label: 'Pendiente de recepción' }, cancelado: { tone: 'red', label: 'Cancelado' },
  propuesto: { tone: 'amber', label: 'Propuesto' }, aplicado: { tone: 'green', label: 'Aplicado' },
  abierta: { tone: 'amber', label: 'Abierta' }, adjudicada: { tone: 'green', label: 'Adjudicada' },
  critico: { tone: 'red', label: 'Crítico' }, agotado: { tone: 'dark', label: 'Agotado' }, exceso: { tone: 'violet', label: 'Exceso' },
  normal: { tone: 'gray', label: 'Normal' }, vencido: { tone: 'dark', label: 'Vencido' }, por_vencer: { tone: 'red', label: 'Por vencer' },
  vigente: { tone: 'green', label: 'Vigente' },
  baja: { tone: 'gray', label: 'Baja' }, alta: { tone: 'amber', label: 'Alta' }, urgente: { tone: 'red', label: 'Urgente' },
}
export function EstadoBadge({ estado }: { estado: string | null | undefined }) {
  if (!estado) return null
  const e = ESTADOS[estado] ?? { tone: 'gray' as Tone, label: estado }
  return <Badge tone={e.tone}>{e.label}</Badge>
}

export function LocalBadge({ codigo }: { codigo?: string | null }) {
  if (!codigo) return <Badge tone="gray">Ambos</Badge>
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-700">
      <span className={cn('size-2 rounded-full', codigo === 'LF' ? 'bg-brand-500' : 'bg-umaru-500')} />
      {codigo === 'LF' ? 'Las Flores' : codigo === 'UM' ? 'Umaru' : codigo}
    </span>
  )
}

/* ─────────────────────────────── Botones ─────────────────────────────── */
const BTN = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  dark: 'bg-ink-900 text-white hover:bg-ink-700 shadow-sm',
  outline: 'border border-line bg-white text-ink-900 hover:bg-canvas',
  ghost: 'text-ink-700 hover:bg-canvas',
  danger: 'border border-brand-200 bg-white text-brand-700 hover:bg-brand-50',
} as const
export type BtnVariant = keyof typeof BTN
export const btnClass = (variant: BtnVariant = 'primary', size: 'sm' | 'md' = 'md') =>
  cn('inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-55',
    size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm', BTN[variant])

export function LinkButton({ href, variant = 'primary', size = 'md', children, className, ...rest }: {
  href: string; variant?: BtnVariant; size?: 'sm' | 'md'; children: React.ReactNode; className?: string; target?: string
}) {
  return <Link href={href} className={cn(btnClass(variant, size), className)} {...rest}>{children}</Link>
}

/* ─────────────────────────────── Tablas ─────────────────────────────── */
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  )
}
export function Th({ children, className, right }: { children?: React.ReactNode; className?: string; right?: boolean }) {
  return <th className={cn('th', right && 'text-right', className)}>{children}</th>
}
export function Td({ children, className, right, colSpan }: { children?: React.ReactNode; className?: string; right?: boolean; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn('td', right && 'text-right tabular', className)}>{children}</td>
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3 grid size-11 place-items-center rounded-full bg-canvas text-subtle"><Inbox className="size-5" /></span>
      <p className="font-semibold text-ink-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ───────────────────────── Filtros (formulario GET) ───────────────────────── */
export function FilterBar({ children, action }: { children: React.ReactNode; action?: string }) {
  return (
    <form action={action} className="no-print mb-4 flex flex-wrap items-end gap-3">
      <KeepSize />
      {children}
      <button className={btnClass('dark')}>Filtrar</button>
    </form>
  )
}
export function FilterField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block min-w-36', className)}>
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

/* ─────────────────────────────── Paginación ───────────────────────────────
   Selector de filas (5–500, por defecto 5) y navegación; lee ?page=&size= de la URL. */
export function Pagination({ total, prefijo }: { total: number; prefijo?: string; page?: number; pageSize?: number; params?: Record<string, string | undefined> }) {
  return <UrlPagination total={total} prefijo={prefijo} />
}

/* Nota informativa (explica cálculos y diferencias con los Excel) */
export function Note({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div className={cn('rounded-xl border px-4 py-3 text-sm',
      tone === 'info' ? 'border-sky-200 bg-sky-50/70 text-sky-900' : 'border-amber-200 bg-amber-50 text-amber-900')}>
      {children}
    </div>
  )
}
