import { Suspense } from 'react'
import { Info } from 'lucide-react'
import { Sidebar } from '@/components/shell/sidebar'
import { SidebarEsqueleto } from '@/components/shell/sidebar-esqueleto'
import { Cargando } from '@/components/cargando'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAmbito, getUsuario, getAlmacenActivo, soloConsulta } from '@/lib/session'
import { panelDe, rutaPermitida, inicioDe, esDeOtroSistema, subtituloDe } from '@/lib/panel'
import { etiquetaNegocio } from '@/lib/empresa'
import { createClient } from '@/lib/supabase/server'
import type { AlertaStock, AvisoRequerimiento, AvisoVence, Avisos } from '@/components/shell/campana'

/**
 * Al cambiar de pantalla NO se muestra un esqueleto: la pantalla anterior se queda hasta que la nueva llega
 * completa (decisión del usuario, 2026-11-19; la barra de progreso de arriba avisa que está cargando).
 * `instant = false` le dice a Next.js que estas pantallas esperan a propósito (sin el aviso «uncached data»).
 */
export const instant = false

/**
 * Marco de todas las pantallas. No espera la sesión: el marco aparece al instante y, en paralelo,
 * llegan la barra lateral (usuario, negocio, avisos) y el contenido de la pantalla (navegación instantánea).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      {/* negocio/almacén, avisos y usuario van en la barra lateral: el contenido usa todo el alto */}
      <Suspense fallback={<SidebarEsqueleto />}>
        <BarraLateral />
      </Suspense>
      <div className="lg:pl-56 print:pl-0">
        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 print:max-w-none print:p-0">
          <Suspense fallback={<Cargando />}>
            <Guardia>{children}</Guardia>
          </Suspense>
        </main>
      </div>
    </div>
  )
}

/** Barra lateral con la sesión: usuario, negocio o almacén elegido y la campanita. */
async function BarraLateral() {
  const [usuario, ambito, almacenSel] = await Promise.all([getUsuario(), getAmbito(), getAlmacenActivo()])
  const panel = panelDe(usuario.rol)
  const avisos = panel === 'area' || panel === 'contabilidad' ? null : await getAvisos(panel === 'logistica' ? 'requerimientos' : 'stock', almacenSel.id)
  return (
    <Sidebar
      panel={panel}
      subtitulo={subtituloDe(panel, ambito.local?.codigo)}
      barra={{
        ambito: ambito.codigo,
        ambitoFijo: ambito.fijo || panel === 'area',
        locales: ambito.locales.map((l) => ({ codigo: l.codigo, nombre: l.nombre, titulo: etiquetaNegocio(l) })),
        almacenes: almacenSel.lista,
        almacenActivo: almacenSel.lista.length > 1 ? almacenSel.id : null,
        usuario: { nombre: usuario.nombre, rol: usuario.rol },
        avisos,
      }}
    />
  )
}

/**
 * Antes de mostrar la pantalla: el usuario es de este sistema y su panel puede abrirla
 * (p. ej. el almacén no entra a Cotizaciones; Logística no registra salidas).
 * La sesión se lee una sola vez por solicitud (cache de React): la pantalla la reutiliza sin otra consulta.
 */
async function Guardia({ children }: { children: React.ReactNode }) {
  const [usuario, almacenSel, cabeceras] = await Promise.all([getUsuario(), getAlmacenActivo(), headers()])
  // usuarios de otro sistema (Producción → conteos) no entran a Logística
  if (esDeOtroSistema(usuario.rol)) redirect('/auth/salir?error=otro-sistema')
  const panel = panelDe(usuario.rol)
  if (!rutaPermitida(panel, cabeceras.get('x-pathname'))) redirect(inicioDe(panel))
  return (
    <>
      {/* con «Todos» el almacén solo consulta: se explica por qué no aparecen los botones para registrar */}
      {panel === 'almacen' && soloConsulta(almacenSel) && (
        <p className="no-print mb-5 flex items-center gap-2 rounded-xl border border-line bg-sand px-4 py-2.5 text-sm text-ink-700">
          <Info className="size-4 shrink-0 text-muted" aria-hidden />
          Está viendo <b>Todos</b> los almacenes. Aquí puede hacer una <b>salida a un área</b> o un <b>requerimiento</b> con productos de varios almacenes; para entradas, otras salidas o traspasos, elija un almacén en el menú.
        </p>
      )}
      {children}
    </>
  )
}

/**
 * Campanita de cada panel:
 *  · Logística → requerimientos por aprobar (aprobado, sale de la campanita)
 *  · Almacenes → productos de su almacén que llegaron al stock mínimo (primero los agotados)
 */
async function getAvisos(tipo: Avisos['tipo'], almacenId: string | null = null): Promise<Avisos> {
  const supabase = await createClient()
  if (tipo === 'stock') {
    let q = supabase.from('v_stock')
      .select('producto_id, nombre, imagen_url, local_codigo, almacen_nombre, cantidad, stock_minimo, unidad, estado', { count: 'exact' })
      .in('estado', ['critico', 'agotado']).gt('stock_minimo', 0)
    if (almacenId) q = q.eq('almacen_id', almacenId)   // solo el almacén elegido arriba
    // también lo que vence dentro de los días de aviso de cada producto (por defecto 30) o ya venció con saldo
    let v = supabase.from('v_vencimiento').select('id, producto_id, producto, almacen, fecha_vencimiento, dias_para_vencer, dias_aviso, cantidad, unidad, fifo, estado')
      .in('estado', ['vencido', 'por_vencer'])
    if (almacenId) v = v.eq('almacen_id', almacenId)
    const [{ data, count }, { data: lotes }] = await Promise.all([q.order('estado').order('cantidad').limit(40), v.order('fecha_vencimiento').limit(40)])
    const vencen = (lotes ?? []) as AvisoVence[]
    return { tipo, total: (count ?? 0) + vencen.length, items: (data ?? []) as AlertaStock[], vencen }
  }
  const { data, count } = await supabase.from('v_requerimiento_resumen')
    .select('id, numero, local_codigo, area_nombre, solicitante, prioridad, estado, items, created_at, aprobado_at', { count: 'exact' })
    .eq('estado', 'solicitado').limit(60)
  const ahora = Date.now()
  const PRIORIDAD: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baja: 3 }
  type R = { id: string; numero: string; local_codigo: string; area_nombre: string | null; solicitante: string; prioridad: string
    estado: AvisoRequerimiento['estado']; items: number; created_at: string; aprobado_at: string | null }
  const items: AvisoRequerimiento[] = ((data ?? []) as R[]).map((r) => {
    const desde = new Date(r.estado !== 'solicitado' && r.aprobado_at ? r.aprobado_at : r.created_at).getTime()
    const horas = (ahora - desde) / 3_600_000
    return { id: r.id, numero: r.numero, local_codigo: r.local_codigo, area_nombre: r.area_nombre, solicitante: r.solicitante,
      prioridad: r.prioridad, estado: r.estado, items: Number(r.items), horas, atrasado: r.estado === 'solicitado' && horas > 24 }
  })
  // primero los que faltan aprobar (los atrasados y urgentes arriba), luego los aprobados; dentro, el más antiguo primero
  items.sort((a, b) => Number(a.estado !== 'solicitado') - Number(b.estado !== 'solicitado')
    || Number(b.atrasado) - Number(a.atrasado) || (PRIORIDAD[a.prioridad] ?? 2) - (PRIORIDAD[b.prioridad] ?? 2) || b.horas - a.horas)
  return { tipo, total: count ?? 0, items: items.slice(0, 40) }
}
