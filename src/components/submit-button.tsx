'use client'

import { useId, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertTriangle, HelpCircle, LoaderCircle } from 'lucide-react'
import { btnClass, type BtnVariant } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Botón de envío de formularios. Con `confirm`, antes de enviar muestra un modal propio del sistema
 * (centrado, con fondo oscuro, Esc para cancelar) en lugar del aviso del navegador.
 */
export function SubmitButton({ children, variant = 'primary', size = 'md', className, confirm, name, value }: {
  children: React.ReactNode; variant?: BtnVariant; size?: 'sm' | 'md'; className?: string
  confirm?: string; name?: string; value?: string
}) {
  const { pending } = useFormStatus()
  const boton = useRef<HTMLButtonElement>(null)
  const dialogo = useRef<HTMLDialogElement>(null)
  const peligro = variant === 'danger'
  const titulo = useId()

  function aceptar() {
    dialogo.current?.close()
    const b = boton.current
    // vuelve a enviar con este mismo botón (conserva su name/value)
    b?.form?.requestSubmit(b)
  }

  return (
    <>
      <button
        ref={boton}
        type="submit"
        name={name}
        value={value}
        disabled={pending}
        onClick={(e) => {
          if (!confirm) return
          // el primer clic abre el modal; el envío real lo hace "aceptar" con requestSubmit (sin pasar por aquí)
          e.preventDefault()
          dialogo.current?.showModal()
        }}
        className={cn(btnClass(variant, size), className)}
      >
        {pending && <LoaderCircle className="size-4 animate-spin" />}
        {children}
      </button>

      {confirm && (
        <dialog
          ref={dialogo}
          aria-labelledby={titulo}
          onClick={(e) => { if (e.target === dialogo.current) dialogo.current?.close() }}
          className="m-auto w-[min(440px,calc(100vw-32px))] rounded-2xl border border-line bg-white p-0 text-ink-900 shadow-2xl backdrop:bg-ink-950/50 backdrop:backdrop-blur-[2px]"
        >
          <div className="flex gap-4 p-6">
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', peligro ? 'bg-brand-50 text-brand-600' : 'bg-canvas text-ink-700')}>
              {peligro ? <AlertTriangle className="size-5" /> : <HelpCircle className="size-5" />}
            </span>
            <div className="min-w-0">
              <h2 id={titulo} className="text-base font-bold">{peligro ? 'Confirmar acción' : 'Confirmar'}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{confirm}</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-line bg-canvas/60 px-6 py-3.5">
            <button type="button" autoFocus onClick={() => dialogo.current?.close()} className={btnClass('outline')}>Cancelar</button>
            <button type="button" onClick={aceptar} className={btnClass(peligro ? 'danger' : 'primary')}>Sí, continuar</button>
          </div>
        </dialog>
      )}
    </>
  )
}
