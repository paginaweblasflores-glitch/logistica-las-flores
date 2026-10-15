import Link from 'next/link'
import { PERIODOS, type PeriodoKey } from '@/lib/periodo'
import { cn } from '@/lib/utils'

export function PeriodoSelector({ actual, desde, hasta, base = '' }: { actual: PeriodoKey; desde: string; hasta: string; base?: string }) {
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-line bg-white p-0.5">
        {PERIODOS.map((p) => (
          <Link key={p.key} href={`${base}?periodo=${p.key}`}
                className={cn('rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                  actual === p.key ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink-900')}>
            {p.label}
          </Link>
        ))}
      </div>
      <form className="flex items-center gap-1.5">
        <input type="date" name="desde" defaultValue={desde} className="field h-8 w-36 text-xs" aria-label="Desde" />
        <span className="text-xs text-muted">a</span>
        <input type="date" name="hasta" defaultValue={hasta} className="field h-8 w-36 text-xs" aria-label="Hasta" />
        <button className="h-8 rounded-lg bg-ink-900 px-3 text-xs font-semibold text-white">Ver</button>
      </form>
    </div>
  )
}
