import Link from 'next/link'
import { ChevronRight, History } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtQty, hoyLima } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageHeader, Section, Th, Td, Table, Badge } from '@/components/ui'

export const metadata = { title: 'Panel de producción' }

type Mov = { id: string; fecha: string; tipo: string; producto: string; porcion: string | null; concepto_nombre: string | null; movimiento: number; proveedor: string | null }

/** Inicio de Producción: lo que falta hoy, el saldo de cada carne y lo último registrado. */
export default async function PanelProduccionPage() {
  const hoy = hoyLima()
  const h = new Date(`${hoy}T12:00:00Z`)
  const lunes = new Date(h); lunes.setUTCDate(h.getUTCDate() - ((h.getUTCDay() + 6) % 7))
  const supabase = await createClient()
  const [{ data: saldos }, { data: ventaHoy }, { data: movs }, { count: diarias }, { count: marcadas }, { count: enviadoSemana }] = await Promise.all([
    supabase.from('v_prod_saldo').select('producto_id, nombre, porcion, saldo').order('orden'),
    supabase.from('prod_venta').select('id').eq('fecha', hoy).maybeSingle(),
    supabase.from('v_prod_kardex').select('id, fecha, tipo, producto, porcion, concepto_nombre, movimiento, proveedor').order('fecha', { ascending: false }).limit(10),
    supabase.from('prod_funcion').select('id', { count: 'exact', head: true }).eq('frecuencia', 'diaria').eq('activo', true),
    supabase.from('prod_funcion_marca').select('funcion_id, prod_funcion!inner(frecuencia)', { count: 'exact', head: true }).eq('fecha', hoy).eq('prod_funcion.frecuencia', 'diaria'),
    supabase.from('prod_reporte').select('id', { count: 'exact', head: true }).gte('enviado_at', `${lunes.toISOString().slice(0, 10)}T00:00:00-05:00`),
  ])
  const sabado = h.getUTCDay() === 6

  // lo que falta hoy (cada aviso lleva a su pantalla)
  const pendientes = [
    !ventaHoy && { href: '/produccion/venta', texto: 'Registrar la venta del día' },
    (marcadas ?? 0) < (diarias ?? 0) && { href: '/produccion/diagrama', texto: `Marcar el diagrama de hoy (${marcadas ?? 0} de ${diarias ?? 0} funciones diarias)` },
    sabado && !enviadoSemana && { href: '/produccion/reportes', texto: 'Hoy es sábado: enviar el reporte semanal a Logística' },
  ].filter(Boolean) as { href: string; texto: string }[]

  return (
    <>
      <PageHeader title="Producción" description="Restaurante Las Flores · Área de Producción" />

      {pendientes.length > 0 && (
        <div className="mb-5 divide-y divide-amber-200 rounded-xl border border-amber-300 bg-amber-50">
          {pendientes.map((p) => (
            <Link key={p.href} href={p.href} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-100/60">
              {p.texto}<ChevronRight className="size-4" />
            </Link>
          ))}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {(saldos ?? []).map((s) => (
          <Link key={s.producto_id} href={`/produccion/kardex?carne=${s.producto_id}`} className="rounded-xl border border-line bg-white px-4 py-3 hover:border-field">
            <span className="block text-xs font-semibold text-muted">{s.nombre}</span>
            <span className={cn('block text-2xl font-bold tabular', Number(s.saldo) < 0 ? 'text-brand-600' : Number(s.saldo) === 0 ? 'text-subtle' : 'text-ink-900')}>{fmtQty(s.saldo)}</span>
            <span className="block text-[11px] text-muted">{s.porcion}</span>
          </Link>
        ))}
      </div>

      <Section icon={History} title="Últimos movimientos del kardex" bodyClassName="p-0">
        <Table>
          <thead><tr><Th>Fecha</Th><Th>Carne</Th><Th>Concepto</Th><Th right>Cantidad</Th></tr></thead>
          <tbody>
            {((movs ?? []) as Mov[]).map((m) => (
              <tr key={m.id}>
                <Td className="whitespace-nowrap tabular">{fmtDate(m.fecha, true)}</Td>
                <Td className="font-medium">{m.producto}</Td>
                <Td>{m.tipo === 'ingreso' ? <Badge tone="green">Ingresa{m.proveedor ? ` · ${m.proveedor}` : ''}</Badge> : <Badge tone="red">{m.concepto_nombre}</Badge>}</Td>
                <Td right className={cn('font-semibold', m.movimiento < 0 ? 'text-brand-600' : 'text-leaf-600')}>{m.movimiento > 0 ? '+' : '−'}{fmtQty(Math.abs(m.movimiento))} <span className="text-xs font-normal text-muted">{m.porcion}</span></Td>
              </tr>
            ))}
            {!(movs ?? []).length && <tr><Td colSpan={4} className="py-8 text-center text-muted">Aún no hay movimientos.</Td></tr>}
          </tbody>
        </Table>
      </Section>
    </>
  )
}
