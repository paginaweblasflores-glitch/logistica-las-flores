import { Sidebar } from '@/components/shell/sidebar'
import { Topbar } from '@/components/shell/topbar'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAmbito, getUsuario, getAlmacenActivo } from '@/lib/session'
import { panelDe, rutaPermitida, inicioDe } from '@/lib/panel'
import { etiquetaNegocio } from '@/lib/empresa'
import { createClient } from '@/lib/supabase/server'
import type { AlertaStock, AvisoRequerimiento, AvisoVence, Avisos } from '@/components/shell/campana'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const [usuario, ambito] = await Promise.all([getUsuario(), getAmbito()])
  const panel = panelDe(usuario.rol)
  const almacenSel = await getAlmacenActivo()
  const avisos = panel === 'area' ? null : await getAvisos(panel === 'logistica' ? 'requerimientos' : 'stock', almacenSel.id)
  // Cada panel abre solo sus pantallas (p. ej. el almacén no entra a Descuentos; Logística no registra salidas)
  if (!rutaPermitida(panel, (await headers()).get('x-pathname'))) redirect(inicioDe(panel))
  const fecha = new Date().toLocaleDateString('es-PE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima',
  })
  return (
    <div className="min-h-dvh">
      <Sidebar panel={panel} subtitulo={panel === 'almacen' ? `Almacén ${ambito.local?.codigo === 'UM' ? 'Umaru' : 'Las Flores'}` : panel === 'area' ? 'Jefes de área' : 'Logística'} />
      <div className="lg:pl-56 print:pl-0">
        <Topbar
          ambito={ambito.codigo}
          ambitoFijo={ambito.fijo || panel === 'area'}
          locales={ambito.locales.map((l) => ({ codigo: l.codigo, nombre: l.nombre, titulo: etiquetaNegocio(l) }))}
          usuario={{ nombre: usuario.nombre, rol: usuario.rol }}
          avisos={avisos}
          almacenes={almacenSel.lista} almacenActivo={almacenSel.lista.length > 1 ? almacenSel.id : null}
          fecha={fecha.charAt(0).toUpperCase() + fecha.slice(1)}
        />
        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
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
