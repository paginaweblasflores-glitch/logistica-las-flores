'use client'

import { createContext, Fragment, useActionState, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { ActionResult } from '@/lib/actions'

/**
 * «Cancelar» de un formulario de edición: vuelve a lo guardado. Se hace volviendo a montar los campos, así también
 * se restauran los selectores y listas con su propio estado (no solo los <input> que restaura un reset del navegador).
 */
export const CancelarFormulario = createContext<(() => void) | null>(null)

/**
 * Formulario conectado a una Server Action que devuelve {ok,message,error}.
 * Muestra notificaciones y opcionalmente limpia el formulario al guardar.
 */
export function ActionForm({ action, children, className, resetOnSuccess, id, onSuccess }: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>
  children: React.ReactNode
  className?: string
  resetOnSuccess?: boolean
  id?: string
  onSuccess?: () => void
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(action, undefined)
  const ref = useRef<HTMLFormElement>(null)
  // cada «Cancelar» monta los campos de nuevo con sus valores guardados
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!state) return
    // los botones «solo con cambios» leen el resultado: si falló, lo escrito sigue sin guardar
    if (ref.current) ref.current.dataset.resultado = state.error ? 'error' : 'ok'
    if (state.error) toast.error(state.error)
    else if (state.message) {
      toast.success(state.message)
      if (resetOnSuccess) ref.current?.reset()
      onSuccess?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])
  return (
    <CancelarFormulario.Provider value={() => setVersion((v) => v + 1)}>
      <form ref={ref} id={id} action={formAction} className={className}><Fragment key={version}>{children}</Fragment></form>
    </CancelarFormulario.Provider>
  )
}
