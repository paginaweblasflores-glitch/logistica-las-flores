import Link from 'next/link'
import { Building2, Plus, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCiudades } from '@/lib/queries'
import { fmtDate, hoyLima, MESES_CORTO } from '@/lib/format'
import { sp } from '@/lib/utils'
import { paginar } from '@/lib/paginacion'
import { PageHeader, Section, Table, Th, Td, FilterBar, FilterField, Pagination, EmptyState, LinkButton, Badge } from '@/components/ui'
import { Select } from '@/components/select'
import { Bars } from '@/components/charts'
import { ExportButton } from '@/components/export-button'
import { TIPOS_PROVEEDOR, etiquetaTipo } from '@/lib/proveedor-tipo'

export const metadata = { title: 'Proveedores' }

export default async function ProveedoresPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  const supabase = await createClient()
  const ciudades = await getCiudades()
  const { page, size, from, to } = paginar(params)
  const q = sp(params, 'q'), ciudad = sp(params, 'ciudad'), estado = sp(params, 'estado', 'activos'), tipo = sp(params, 'tipo')
  const anio = Number(hoyLima().slice(0, 4))

  let query = supabase.from('proveedor')
    .select('id, ruc, razon_social, subcategoria, contacto, telefono, forma_pedido, dias_pedido, es_transportista, activo, fecha_registro, tipo, ciudad:ciudad_id(nombre)', { count: 'exact' })
  if (q) { const s = q.replace(/[,()]/g, ' '); query = query.or(`razon_social.ilike.%${s}%,nombre_comercial.ilike.%${s}%,subcategoria.ilike.%${s}%,ruc.ilike.%${s}%`) }
  if (ciudad) query = query.eq('ciudad_id', ciudad)
  if (tipo) query = query.eq('tipo', tipo)
  if (estado === 'activos') query = query.eq('activo', true)
  if (estado === 'inactivos') query = query.eq('activo', false)
  if (estado === 'transportistas') query = query.eq('es_transportista', true)
  const [{ data, count }, { data: mensual }] = await Promise.all([
    query.order('razon_social').range(from, to),
    supabase.rpc('fn_proveedores_mensual', { p_anio: anio }),
  ])
  const serie = ((mensual ?? []) as { mes: number; nuevos: number; acumulado: number }[])
    .filter((m) => m.mes <= Number(hoyLima().slice(5, 7))).map((m) => ({ mes: MESES_CORTO[m.mes - 1], nuevos: Number(m.nuevos), acumulado: Number(m.acumulado) }))
  const totalAnio = serie.at(-1)?.acumulado ?? 0

  type Row = { id: string; ruc: string | null; razon_social: string; subcategoria: string | null; contacto: string | null; telefono: string | null
    forma_pedido: string | null; dias_pedido: string | null; es_transportista: boolean; activo: boolean; fecha_registro: string; tipo: string; ciudad: { nombre: string } | null }

  return (
    <>
      <PageHeader title="Proveedores" description="Base de datos única de proveedores con historial de compras y precios. Reemplaza la hoja “BASE DE DATOS PROVEEDORES”."
        actions={<>
          <ExportButton filename="proveedores" table="proveedor" order="razon_social"
            columns={{ ruc: 'RUC', razon_social: 'Razón social', subcategoria: 'Rubro', contacto: 'Contacto', telefono: 'Teléfono', email: 'Correo', forma_pedido: 'Forma de pedido', dias_pedido: 'Días de pedido', condiciones_pago: 'Condiciones de pago', fecha_registro: 'Fecha de registro', activo: 'Activo' }} />
          <LinkButton href="/proveedores/nuevo"><Plus className="size-4" /> Nuevo proveedor</LinkButton>
        </>} />

      <Section icon={UserPlus} title={`Nuevos proveedores ${anio}`} className="mb-5" stats={[{ label: 'Nuevos en el año', value: totalAnio }]}>
        <p className="mb-3 text-xs text-muted">Proveedores con los que se compró por primera vez en cada mes. Estar registrado en la lista no cuenta como proveedor nuevo.</p>
        <Bars data={serie} x="mes" format="num" height={200} series={[{ key: 'nuevos', name: 'Primera compra en el mes' }, { key: 'acumulado', name: 'Acumulado' }]} />
      </Section>

      <FilterBar>
        <FilterField label="Buscar" className="min-w-64"><input name="q" defaultValue={q} placeholder="Nombre, rubro o RUC" className="field" /></FilterField>
        <FilterField label="Tipo"><Select name="tipo" options={TIPOS_PROVEEDOR.map((t) => ({ id: t.id, nombre: t.nombre }))} defaultValue={tipo} placeholder="Todos" /></FilterField>
        <FilterField label="Ciudad"><Select name="ciudad" options={ciudades} defaultValue={ciudad} placeholder="Todas" /></FilterField>
        <FilterField label="Mostrar"><Select name="estado" defaultValue={estado} options={[{ id: 'activos', nombre: 'Activos' }, { id: 'inactivos', nombre: 'Inactivos' }, { id: 'transportistas', nombre: 'Transportistas' }, { id: 'todos', nombre: 'Todos' }]} /></FilterField>
      </FilterBar>
      <Section icon={Building2} title="Directorio" bodyClassName="p-0" stats={[{ label: 'Registros', value: count ?? 0 }]}>
        {data?.length ? (
          <>
            <Table>
              <thead><tr><Th>Proveedor</Th><Th>Tipo</Th><Th>Rubro</Th><Th>Ciudad</Th><Th>Contacto</Th><Th>Pedido</Th><Th>Registro</Th><Th>Estado</Th></tr></thead>
              <tbody>
                {(data as unknown as Row[]).map((p) => (
                  <tr key={p.id} className="hover:bg-canvas/60">
                    <Td><Link href={`/proveedores/${p.id}`} className="font-semibold hover:text-brand-600">{p.razon_social}</Link>
                      {p.ruc && <span className="block text-xs text-muted">RUC {p.ruc}</span>}</Td>
                    <Td className="text-xs whitespace-nowrap">{etiquetaTipo(p.tipo)}</Td>
                    <Td className="text-xs">{p.subcategoria ?? '—'}{p.es_transportista && <Badge tone="blue" className="ml-1">Transporte</Badge>}</Td>
                    <Td>{p.ciudad?.nombre ?? '—'}</Td>
                    <Td className="text-xs">{p.contacto ?? '—'}<span className="block text-muted">{p.telefono}</span></Td>
                    <Td className="text-xs">{p.forma_pedido ?? '—'}<span className="block text-muted">{p.dias_pedido}</span></Td>
                    <Td className="text-xs tabular">{fmtDate(p.fecha_registro)}</Td>
                    <Td><Badge tone={p.activo ? 'green' : 'gray'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination total={count ?? 0} />
          </>
        ) : <EmptyState title="Sin proveedores" action={<LinkButton href="/proveedores/nuevo">Registrar proveedor</LinkButton>} />}
      </Section>
    </>
  )
}
