import Link from 'next/link'
import { ArrowDownToLine, ArrowUpFromLine, Plus, Ban } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getAmbito, getPanel, getAlmacenActivo, soloConsulta } from '@/lib/session'
import { fmtDate, fmtSoles, hoyLima } from '@/lib/format'
import { sp } from '@/lib/utils'
import { paginar } from '@/lib/paginacion'
import { NOMBRE_TIPO, TIPOS_DE, TIPOS_FILTRO, type Sentido } from '@/lib/movimientos'
import { PageHeader, Section, Table, Th, Td, FilterBar, FilterField, Pagination, EmptyState, LinkButton, Badge } from '@/components/ui'
import { Select } from '@/components/select'
import { AnularConMotivo } from '@/components/anular-con-motivo'
import { ExportButton } from '@/components/export-button'
import { anularMovimiento } from './actions'

/** Historial de Entradas o de Salidas del almacén elegido arriba, cada uno con su numeración propia. */
export async function Historial({ sentido, params }: { sentido: Sentido; params: Record<string, string> }) {
  const [{ local }, panel, sel] = await Promise.all([getAmbito(), getPanel(), getAlmacenActivo()])
  const puedeRegistrar = panel === 'almacen' && !soloConsulta(sel)   // con «Todos» solo se consulta
  const supabase = await createClient()
  const { from, to } = paginar(params)
  const tipo = sp(params, 'tipo')
  const desde = sp(params, 'desde', `${hoyLima().slice(0, 7)}-01`), hasta = sp(params, 'hasta', hoyLima())
  const entrada = sentido === 'entrada'
  const ruta = entrada ? '/entradas' : '/salidas'
  const titulo = entrada ? 'Entradas' : 'Salidas'

  let q = supabase.from('movimiento')
    .select(`id, nro, fecha, tipo, anulado, motivo_anulacion, documento, observacion, recibe, referencia_tipo, referencia_id,
             almacen:almacen_id(nombre), area:area_id(nombre), motivo:motivo_id(nombre, codigo), movimiento_detalle(cantidad, costo_unitario)`, { count: 'exact' })
    .in('tipo', tipo ? [tipo] : TIPOS_DE[sentido])
    .gte('fecha', `${desde}T00:00:00-05:00`).lte('fecha', `${hasta}T23:59:59-05:00`)
  if (sel.id) q = q.eq('almacen_id', sel.id)
  else if (sel.lista.length) q = q.in('almacen_id', sel.lista.map((a) => a.id))
  else if (local) q = q.eq('local_id', local.id)
  const { data, count } = await q.order('fecha', { ascending: false }).order('numero', { ascending: false }).range(from, to)
  type Row = { id: string; nro: string | null; fecha: string; tipo: string; anulado: boolean; motivo_anulacion: string | null; documento: string | null
    observacion: string | null; recibe: string | null; referencia_tipo: string | null; referencia_id: string | null
    almacen: { nombre: string }; area: { nombre: string } | null; motivo: { nombre: string; codigo: string } | null; movimiento_detalle: { cantidad: number; costo_unitario: number | null }[] }
  const filas = (data ?? []) as unknown as Row[]
  const varios = !sel.id && sel.lista.length !== 1
  const nueva = puedeRegistrar ? <LinkButton href={`${ruta}/nueva`}><Plus className="size-4" /> {entrada ? 'Nueva entrada' : 'Nueva salida'}</LinkButton> : undefined

  return (
    <>
      <PageHeader title={titulo} actions={<>
          {/* el cuadro que pide el Sr. Vladimir: cada compra con su fecha, factura, marca, cantidad, precio y total */}
          {entrada && <ExportButton label="Excel de compras" filename={`compras_${desde}_${hasta}`} table="v_ingreso_almacen" dateColumn="fecha_ingreso" desde={desde} hasta={hasta} order="fecha_ingreso"
            filters={{ almacen_id: sel.id ?? undefined, local_id: !sel.id ? local?.id : undefined, fuera_de_catalogo: 'false' }}
            columns={{ fecha_ingreso: 'Fecha de entrada', almacen: 'Almacén', proveedor: 'Proveedor', tipo_documento: 'Comprobante', numero_documento: 'N° comprobante',
              codigo_almacen: 'Cód.', producto: 'Producto', marca: 'Marca', unidad: 'Unidad', cantidad: 'Cantidad', precio_unitario: 'Precio unitario', total: 'Total' }} />}
          {nueva}
        </>} />
      <FilterBar>
        <FilterField label="Tipo"><Select name="tipo" options={TIPOS_FILTRO[sentido].map((c) => ({ id: c, nombre: NOMBRE_TIPO[c] }))} defaultValue={tipo} placeholder="Todos" /></FilterField>
        <FilterField label="Desde"><input type="date" name="desde" defaultValue={desde} className="field" /></FilterField>
        <FilterField label="Hasta"><input type="date" name="hasta" defaultValue={hasta} className="field" /></FilterField>
      </FilterBar>
      <Section icon={entrada ? ArrowDownToLine : ArrowUpFromLine} title={`Historial de ${titulo.toLowerCase()}`} bodyClassName="p-0" stats={[{ label: 'Registros', value: count ?? 0 }]}>
        {filas.length ? (
          <>
            <Table>
              <thead><tr>
                <Th>N°</Th><Th>Fecha</Th><Th>Tipo</Th>{varios && <Th>Almacén</Th>}
                {entrada ? <Th>Detalle</Th> : <><Th>Área</Th><Th>Entregado a</Th></>}
                <Th right>Ítems</Th><Th right>Valor</Th><Th />
              </tr></thead>
              <tbody>
                {filas.map((m) => {
                  const valor = m.movimiento_detalle.reduce((s, d) => s + Number(d.cantidad) * Number(d.costo_unitario ?? 0), 0)
                  const origen = m.referencia_tipo === 'compra' ? `/compras/${m.referencia_id}` : m.referencia_tipo === 'traslado' ? `/traslados/${m.referencia_id}` : m.referencia_tipo === 'conteo' ? `/conteos/${m.referencia_id}` : null
                  return (
                    <tr key={m.id} className={m.anulado ? 'opacity-50' : 'hover:bg-canvas/60'}>
                      <Td className="font-mono text-xs font-semibold whitespace-nowrap"><Link href={`${ruta}/${m.id}`} className="text-brand-600 hover:underline">{m.nro ?? '—'}</Link></Td>
                      <Td className="whitespace-nowrap tabular">{fmtDate(m.fecha, true)}</Td>
                      <Td><Badge tone={entrada ? 'green' : 'red'}>{m.motivo?.codigo.startsWith('TIPO-') ? m.motivo.nombre : NOMBRE_TIPO[m.tipo] ?? m.tipo}</Badge>{m.anulado && <Badge tone="dark" className="ml-1">Anulado</Badge>}
                        {m.anulado && m.motivo_anulacion && <span className="block text-xs text-brand-700">Anulado: {m.motivo_anulacion}</span>}</Td>
                      {varios && <Td className="text-sm">{m.almacen.nombre}</Td>}
                      {entrada
                        ? <Td className="text-sm">{origen ? <Link href={origen} className="font-semibold text-brand-600">{m.documento ?? 'Ver origen'}</Link> : m.area?.nombre ?? m.documento ?? m.observacion ?? '—'}</Td>
                        : <><Td className="text-sm">{m.area?.nombre ?? (origen ? <Link href={origen} className="font-semibold text-brand-600">{m.documento ?? 'Ver origen'}</Link> : '—')}</Td><Td className="text-sm">{m.recibe ?? '—'}</Td></>}
                      <Td right>{m.movimiento_detalle.length}</Td>
                      <Td right className="font-semibold">{fmtSoles(valor)}</Td>
                      <Td>
                        {puedeRegistrar && !m.anulado && (m.referencia_tipo === 'manual' || !m.referencia_tipo) && m.tipo !== 'stock_inicial' && (
                          <AnularConMotivo action={anularMovimiento} campos={{ id: m.id }} titulo={`Anular la ${sentido} ${m.nro ?? ''}`}
                            detalle="Los registros no se editan ni se borran: se anulan (se revierte el stock) y se registran de nuevo bien.">
                            <Ban className="size-3.5" /><span className="sr-only">Anular</span>
                          </AnularConMotivo>
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            <Pagination total={count ?? 0} />
          </>
        ) : <EmptyState title={`Sin ${titulo.toLowerCase()} en el periodo`} action={nueva} />}
      </Section>
    </>
  )
}
