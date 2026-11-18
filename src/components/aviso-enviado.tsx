'use client'

import { useEffect, useState } from 'react'
import { CircleCheck } from 'lucide-react'

/**
 * «Stock del día enviado…»: se muestra una sola vez, justo después de enviarlo, por 5 segundos.
 * Queda ligado a ESE envío (su hora): volver al panel no lo hace reaparecer.
 */
export function AvisoEnviado({ texto, enviadoAt }: { texto: string; enviadoAt: string }) {
  const [ver, setVer] = useState(false)
  useEffect(() => {
    const t = new Date(enviadoAt).getTime()
    const hace = Date.now() - t
    // recién enviado (hace menos de un minuto; ni fecha inválida ni futura) y aún no mostrado en esta sesión
    if (!Number.isFinite(t) || hace < -5_000 || hace > 60_000) return
    // se guarda CUÁNDO empezó a mostrarse: si se vuelve a montar, solo completa lo que faltaba de los 5 segundos
    const marca = `aviso-enviado:${enviadoAt}`
    let desde = Date.now()
    try {
      const previo = Number(sessionStorage.getItem(marca))
      if (previo) desde = previo
      else sessionStorage.setItem(marca, String(desde))
    } catch { /* sin almacenamiento: se muestra igual */ }
    const resta = 5000 - (Date.now() - desde)
    if (resta <= 0) return
    // sincroniza con el navegador (sessionStorage y el reloj): es el uso correcto de un efecto, no un estado derivado
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVer(true)
    const fin = setTimeout(() => setVer(false), resta)
    return () => clearTimeout(fin)
  }, [enviadoAt])
  if (!ver) return null
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-leaf-500/30 bg-leaf-50 px-4 py-2.5 text-sm text-leaf-600">
      <CircleCheck className="size-4" /> {texto}
    </div>
  )
}
