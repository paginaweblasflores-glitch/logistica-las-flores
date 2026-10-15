import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="text-center">
        <p className="text-6xl font-bold text-brand-600">404</p>
        <h1 className="mt-2 text-xl font-bold">No encontramos lo que busca</h1>
        <p className="mt-1 text-sm text-muted">El registro no existe o no tiene permisos para verlo.</p>
        <Link href="/" className="mt-5 inline-flex h-9 items-center rounded-lg bg-ink-900 px-4 text-sm font-semibold text-white">Ir al panel</Link>
      </div>
    </main>
  )
}
