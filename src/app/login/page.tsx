import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { LoginForm } from './login-form'

export const metadata = { title: 'Iniciar sesión' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams
  const supabase = await createClient()
  const { data } = await supabase.rpc('fn_usuarios_login')
  const usuarios = ((data ?? []) as { username: string }[]).map((u) => u.username)

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-ink-900 px-4 py-10">
      {/* Fondo: negro con resplandor rojo del tulipán */}
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(200_16_46/0.28),transparent_65%)]" />
      <div aria-hidden className="absolute -right-40 -bottom-40 size-[34rem] rounded-full bg-brand-600/20 blur-3xl" />
      <div aria-hidden className="absolute -top-48 -left-40 size-[28rem] rounded-full bg-brand-700/15 blur-3xl" />

      <section className="relative w-full max-w-sm rounded-[28px] bg-white px-8 pt-9 pb-7 shadow-2xl shadow-black/40">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 grid size-20 place-items-center rounded-full bg-white ring-1 ring-line">
            <Image src="/logo.png" alt="Restaurante Turístico Las Flores" width={72} height={72} priority />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Logística Las Flores</h1>
          <p className="mt-1 text-sm text-muted">Restaurante Las Flores · Hotel Umaru</p>
        </div>

        {error === 'perfil' && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Su cuenta no tiene un perfil asignado en el sistema. Solicite el acceso al administrador.
          </p>
        )}

        <LoginForm next={next ?? '/'} usuarios={usuarios} />

        <p className="mt-7 text-center text-xs text-subtle">Corporación Las Flores · Huamanga, Ayacucho © {new Date().getFullYear()}</p>
      </section>
    </main>
  )
}
