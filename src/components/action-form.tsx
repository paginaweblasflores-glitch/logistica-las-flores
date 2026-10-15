'use client'

import { useActionState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { ActionResult } from '@/lib/actions'

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
  useEffect(() => {
    if (!state) return
    if (state.error) toast.error(state.error)
    else if (state.message) {
      toast.success(state.message)
      if (resetOnSuccess) ref.current?.reset()
      onSuccess?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])
  return <form ref={ref} id={id} action={formAction} className={className}>{children}</form>
}
