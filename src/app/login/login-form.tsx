'use client'

import { useActionState, useState } from 'react'
import { Eye, EyeOff, LoaderCircle, LogIn } from 'lucide-react'
import { login, type LoginState } from './actions'
import { Select } from '@/components/select'

export function LoginForm({ next, usuarios }: { next: string; usuarios: string[] }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined)
  const [show, setShow] = useState(false)

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="usuario" className="label">Usuario <span className="text-brand-600">*</span></label>
        {usuarios.length ? (
          <div className="relative">
            <Select id="usuario" name="usuario" required options={usuarios.map((u) => ({ id: u, nombre: u }))} placeholder="Selecciona tu usuario…" className="h-11" />
          </div>
        ) : (
          // Si la lista no está disponible, se permite escribir el usuario
          <input id="usuario" name="usuario" autoComplete="username" required autoFocus placeholder="Logística Las Flores" className="field h-11" />
        )}
      </div>
      <div>
        <label htmlFor="password" className="label">Contraseña <span className="text-brand-600">*</span></label>
        <div className="relative">
          <input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password"
                 required placeholder="Ingresa tu contraseña" className="field h-11 pr-11" />
          <button type="button" onClick={() => setShow((s) => !s)}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-ink-900"
                  aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {state?.error && (
        <p role="alert" className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-700">{state.error}</p>
      )}
      <button type="submit" disabled={pending}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60">
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <LogIn className="size-4" />}
        Ingresar
      </button>
    </form>
  )
}
