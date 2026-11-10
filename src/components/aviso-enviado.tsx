'use client'

import { useEffect, useState } from 'react'
import { CircleCheck } from 'lucide-react'

/** «Stock del día enviado…»: solo justo después de enviarlo, por 5 segundos; después ya no se muestra. */
export function AvisoEnviado({ texto, enviadoAt }: { texto: string; enviadoAt: string }) {
  // recién enviado = hace menos de un minuto (al volver al panel más tarde, ya no aparece)
  const [ver, setVer] = useState(() => Date.now() - new Date(enviadoAt).getTime() < 60_000)
  useEffect(() => {
    if (!ver) return
    const t = setTimeout(() => setVer(false), 5000)
    return () => clearTimeout(t)
  }, [ver])
  if (!ver) return null
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-leaf-500/30 bg-leaf-50 px-4 py-2.5 text-sm text-leaf-600">
      <CircleCheck className="size-4" /> {texto}
    </div>
  )
}
