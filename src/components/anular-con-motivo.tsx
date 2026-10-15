'use client'

import { useId, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { ActionResult } from '@/lib/actions'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { btnClass } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Anular un registro (no se edita ni se borra): pide el MOTIVO en un modal centrado y lo envía.
 * Queda constancia de quién, cuándo y por qué se anuló.
 */
export function AnularConMotivo({ action, campos, titulo, detalle, children, className }: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>
  campos: Record<string, string>
  titulo: string
  detalle: string
  children: React.ReactNode
  className?: string
}) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const [motivo, setMotivo] = useState('')
  const id = useId()
  return (
    <>
      <button type="button" onClick={() => dialogo.current?.showModal()} className={className ?? btnClass('ghost', 'sm')}>{children}</button>
      <dialog ref={dialogo} aria-labelledby={id} onClick={(e) => { if (e.target === dialogo.current) dialogo.current?.close() }}
        className="m-auto w-[min(460px,calc(100vw-32px))] rounded-2xl border border-line bg-white p-0 text-ink-900 shadow-2xl backdrop:bg-ink-950/50 backdrop:backdrop-blur-[2px]">
        <ActionForm action={action} onSuccess={() => { dialogo.current?.close(); setMotivo('') }}>
          {Object.entries(campos).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <div className="flex gap-4 p-6">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600"><AlertTriangle className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <h2 id={id} className="text-base font-bold">{titulo}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{detalle}</p>
              <label className="mt-3 block"><span className="label">Motivo *</span>
                <textarea name="motivo" required rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej.: se registró con cantidad equivocada" className="field min-h-16 py-2" /></label>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-line bg-canvas/60 px-6 py-3.5">
            <button type="button" onClick={() => dialogo.current?.close()} className={btnClass('outline')}>Cancelar</button>
            <SubmitButton variant="danger" className={cn(!motivo.trim() && 'pointer-events-none opacity-55')}>Anular</SubmitButton>
          </div>
        </ActionForm>
      </dialog>
    </>
  )
}
