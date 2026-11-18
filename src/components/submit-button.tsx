'use client'

import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertTriangle, HelpCircle, LoaderCircle } from 'lucide-react'
import { btnClass, type BtnVariant } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Botón de envío de formularios. Con `confirm`, antes de enviar muestra un modal propio del sistema
 * (centrado, con fondo oscuro, Esc para cancelar) en lugar del aviso del navegador.
 * Con `soloConCambios` (formularios de edición) queda apagado hasta que algo cambie en el formulario;
 * con `listo`, hasta que el formulario cumpla esa condición (p. ej. una cantidad mayor a 0).
 */
export function SubmitButton({ children, variant = 'primary', size = 'md', className, confirm, name, value, soloConCambios, listo }: {
  children: React.ReactNode; variant?: BtnVariant; size?: 'sm' | 'md'; className?: string
  confirm?: string; name?: string; value?: string
  soloConCambios?: boolean
  listo?: (datos: FormData) => boolean
}) {
  const { pending } = useFormStatus()
  const boton = useRef<HTMLButtonElement>(null)
  const apagado = useHabilitado(boton, pending, !!soloConCambios, listo) === false
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
        disabled={pending || apagado}
        title={apagado ? (soloConCambios ? 'Sin cambios por guardar' : 'Complete los datos') : undefined}
        onClick={(e) => {
          if (!confirm) return
          // el primer clic abre el modal; el envío real lo hace "aceptar" con requestSubmit (sin pasar por aquí)
          e.preventDefault()
          dialogo.current?.showModal()
        }}
        className={cn(btnClass(variant, size), apagado && '!border-transparent !bg-[#e7e2db] !text-[#8a8178] !shadow-none !opacity-100', className)}
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

/** Lo que tiene escrito el formulario (sin archivos), para saber si cambió algo. */
const foto = (f: HTMLFormElement) => JSON.stringify([...new FormData(f)].filter(([, v]) => typeof v === 'string'))

/**
 * ¿El botón se puede usar? null = sin condición. Escucha lo que se escribe o elige (incluidos los campos ocultos
 * de los selectores) y compara con lo guardado; al terminar de guardar bien, lo actual pasa a ser lo guardado.
 */
function useHabilitado(boton: React.RefObject<HTMLButtonElement | null>, pending: boolean, soloConCambios: boolean,
  listo?: (datos: FormData) => boolean): boolean | null {
  const usar = soloConCambios || !!listo
  const guardado = useRef<string | null>(null)
  const [ok, setOk] = useState(false)
  // la condición se evalúa siempre con la versión actual de `listo`, sin volver a suscribirse
  const cumple = useEffectEvent((datos: FormData) => !listo || listo(datos))

  useEffect(() => {
    const form = boton.current?.form
    if (!usar || !form) return
    guardado.current = foto(form)
    let t: ReturnType<typeof setTimeout>
    const revisar = () => {
      clearTimeout(t)
      // tras el render: los campos ocultos controlados por React ya tienen su valor nuevo
      t = setTimeout(() => {
        const actual = foto(form)
        setOk((!soloConCambios || actual !== guardado.current) && cumple(new FormData(form)))
      }, 0)
    }
    const obs = new MutationObserver(revisar)
    obs.observe(form, { subtree: true, childList: true, attributes: true, attributeFilter: ['value'] })
    form.addEventListener('input', revisar)
    form.addEventListener('change', revisar)
    revisar()
    return () => { clearTimeout(t); obs.disconnect(); form.removeEventListener('input', revisar); form.removeEventListener('change', revisar) }
  }, [boton, usar, soloConCambios])

  // terminó de guardar: si salió bien (ActionForm marca el resultado), lo actual es lo guardado y el botón se apaga
  const antes = useRef(pending)
  useEffect(() => {
    const form = boton.current?.form
    if (antes.current && !pending && form && usar) {
      setTimeout(() => {
        if (form.dataset.resultado === 'error') return
        guardado.current = foto(form)
        setOk(!soloConCambios && cumple(new FormData(form)))
      }, 30)
    }
    antes.current = pending
  }, [pending, boton, usar, soloConCambios])

  return usar ? ok : null
}
