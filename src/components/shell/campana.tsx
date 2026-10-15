'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronRight, ClipboardCheck, PackageCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProductoFoto } from '@/components/producto-foto'

/** Almacenes: producto que llegó a su stock mínimo */
export type AlertaStock = {
  producto_id: string; nombre: string; imagen_url: string | null; local_codigo: string; almacen_nombre: string
  cantidad: number; stock_minimo: number; unidad: string; estado: 'critico' | 'agotado'
}
/** Logística: requerimiento por aprobar (una vez aprobado sale de la campanita) */
export type AvisoRequerimiento = {
  id: string; numero: string; local_codigo: string; area_nombre: string | null; solicitante: string
  prioridad: string; estado: 'solicitado' | 'aprobado' | 'en_cotizacion'; items: number; horas: number; atrasado: boolean
}
/** Almacenes: producto que vence dentro de sus días de aviso (por defecto 30) o ya venció con saldo */
export type AvisoVence = { id: string; producto_id: string; producto: string; almacen: string; fecha_vencimiento: string; dias_para_vencer: number; dias_aviso: number
  cantidad: number; unidad: string; fifo: boolean; estado: string }
export type Avisos =
  | { tipo: 'stock'; total: number; items: AlertaStock[]; vencen: AvisoVence[] }
  | { tipo: 'requerimientos'; total: number; items: AvisoRequerimiento[] }

const n = (v: number) => Number(v).toLocaleString('es-PE', { maximumFractionDigits: 2 })
const hace = (h: number) => (h < 1 ? 'hace menos de 1 h' : h < 48 ? `hace ${Math.floor(h)} h` : `hace ${Math.floor(h / 24)} días`)
/** Clave de un aviso: si cambia (otro requerimiento, otro estado, se agotó), vuelve a contarse como nuevo */
const claveDe = (avisos: Avisos, i: number) => avisos.tipo === 'requerimientos'
  ? `${avisos.items[i].id}:${avisos.items[i].estado}`
  : `${avisos.items[i].producto_id}:${avisos.items[i].almacen_nombre}:${avisos.items[i].estado}`
const GUARDADO = (tipo: string) => `campana-vistos:${tipo}`

const Punto = ({ codigo }: { codigo: string }) => <span className={cn('size-1.5 shrink-0 rounded-full', codigo === 'LF' ? 'bg-brand-500' : 'bg-umaru-500')} />

/**
 * Campanita. En los almacenes: productos que llegaron a su stock mínimo.
 * En Logística: requerimientos que esperan su acción. Clic en uno → su ficha.
 */
export function Campana({ avisos }: { avisos: Avisos }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { total } = avisos
  const esReq = avisos.tipo === 'requerimientos'
  // El número rojo cuenta solo lo NUEVO: al abrir la campanita queda visto (en este navegador)
  // y vuelve a aparecer cuando llega otro aviso o uno cambia de estado.
  const claves = [...avisos.items.map((_, i) => claveDe(avisos, i)), ...(avisos.tipo === 'stock' ? avisos.vencen.map((v) => `v:${v.id}:${v.estado}`) : [])]
  const [vistos, setVistos] = useState<Set<string> | null>(null)
  useEffect(() => {
    try { setVistos(new Set(JSON.parse(localStorage.getItem(GUARDADO(avisos.tipo)) ?? '[]') as string[])) } catch { setVistos(new Set()) }
  }, [avisos.tipo])
  const nuevos = vistos ? claves.filter((c) => !vistos.has(c)).length : 0
  function abrir() {
    setOpen((o) => !o)
    // se guardan solo los avisos vigentes: lo ya atendido no ocupa espacio
    setVistos(new Set(claves))
    try { localStorage.setItem(GUARDADO(avisos.tipo), JSON.stringify(claves)) } catch { /* sin almacenamiento: solo esta vez */ }
  }

  useEffect(() => {
    if (!open) return
    const cerrar = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', cerrar); document.removeEventListener('keydown', esc) }
  }, [open])


  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={abrir} aria-haspopup="dialog" aria-expanded={open}
        aria-label={total ? (esReq ? `${total} ${total === 1 ? 'requerimiento' : 'requerimientos'} por aprobar` : `${total} productos por acabarse`) : 'Sin avisos'}
        className={cn('relative grid size-10 place-items-center rounded-full text-ink-700 transition-colors hover:bg-canvas', open && 'bg-canvas')}>
        <Bell className="size-5" />
        {nuevos > 0 && (
          <span className="absolute top-1 right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-600 px-1 text-[10px] leading-none font-bold text-white ring-2 ring-white tabular">
            {nuevos > 99 ? '99+' : nuevos}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label={esReq ? 'Avisos de requerimientos' : 'Avisos de stock'}
          className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-xl border border-line bg-white shadow-xl sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[400px]">
          <div className="border-b border-line px-4 py-3">
            <p className="text-sm font-semibold">{esReq ? 'Requerimientos por aprobar' : 'Avisos del almacén'}</p>
            <p className="text-xs text-muted">
              {avisos.tipo === 'requerimientos'
                ? total ? `${total} por aprobar.` : 'No hay requerimientos por aprobar.'
                : total ? [[total - avisos.vencen.length, 'por acabarse (llegaron a su mínimo)'], [avisos.vencen.length, 'vencen pronto']].filter(([c]) => Number(c) > 0).map(([c, t]) => `${c} ${t}`).join(' · ') + '.'
                : 'Ningún producto está por debajo de su mínimo ni por vencer.'}
            </p>
          </div>

          {avisos.tipo === 'stock' && avisos.vencen.length > 0 && (
            <div className="border-b border-line">
              <p className="bg-canvas px-4 py-1.5 text-xs font-bold tracking-wide text-muted uppercase">Por vencer</p>
              <ul className="max-h-48 divide-y divide-line overflow-y-auto">
                {avisos.vencen.map((v) => (
                  <li key={v.id}>
                    {/* FIFO: sus lotes; sin FIFO: la ficha, donde se pone la nueva fecha cuando llega mercadería */}
                    <Link href={v.fifo ? '/inventario/lotes' : `/productos/${v.producto_id}`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-canvas">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{v.producto}</span>
                        <span className="text-xs text-muted">{v.almacen} · quedan {n(v.cantidad)} {v.unidad} · aviso a {v.dias_aviso} días</span>
                      </span>
                      <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold', v.dias_para_vencer < 0 ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700')}>
                        {v.dias_para_vencer < 0 ? 'Vencido' : v.dias_para_vencer === 0 ? 'Vence hoy' : `Vence en ${v.dias_para_vencer} d`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {avisos.items.length ? (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {avisos.tipo === 'requerimientos' ? avisos.items.map((r) => (
                <li key={r.id}>
                  <Link href={`/requerimientos/${r.id}`} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-canvas">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-canvas text-ink-700"><ClipboardCheck className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.numero} · {r.area_nombre ?? r.solicitante}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        <Punto codigo={r.local_codigo} />
                        <span className="truncate">{r.items} {r.items === 1 ? 'bien' : 'bienes'} · {hace(r.horas)}{r.prioridad === 'urgente' || r.prioridad === 'alta' ? ` · prioridad ${r.prioridad}` : ''}</span>
                      </span>
                    </span>
                    <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold',
                      r.estado === 'solicitado' ? (r.atrasado ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700') : 'bg-canvas text-ink-700')}>
                      {r.estado === 'solicitado' ? (r.atrasado ? 'Aprobar (+24 h)' : 'Por aprobar') : r.estado === 'aprobado' ? 'Cotizar o comprar' : 'En cotización'}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-subtle" />
                  </Link>
                </li>
              )) : avisos.items.map((a) => (
                <li key={a.producto_id + a.almacen_nombre}>
                  <Link href={`/productos/${a.producto_id}`} onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-canvas">
                    <ProductoFoto src={a.imagen_url} alt={a.nombre} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{a.nombre}</span>
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        <Punto codigo={a.local_codigo} />
                        {a.local_codigo === 'LF' ? 'Las Flores' : 'Umaru'} · quedan <b className="text-ink-900 tabular">{n(a.cantidad)} {a.unidad}</b> · mín. {n(a.stock_minimo)}
                      </span>
                    </span>
                    <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold',
                      a.estado === 'agotado' ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700')}>
                      {a.estado === 'agotado' ? 'Agotado' : 'Por acabarse'}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : avisos.tipo === 'stock' && avisos.vencen.length ? null : (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted">
              <PackageCheck className="size-8 text-leaf-600" /> Todo en orden
            </div>
          )}

          {(esReq ? total > 0 : avisos.items.length > 0) && (
            <Link href={esReq ? '/requerimientos?estado=solicitado' : '/inventario?alerta=1'} onClick={() => setOpen(false)}
              className="block border-t border-line px-4 py-2.5 text-center text-sm font-semibold text-brand-600 hover:bg-brand-50">
              {esReq ? 'Ver los requerimientos por aprobar' : 'Ver los productos por acabarse en Stock'}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
