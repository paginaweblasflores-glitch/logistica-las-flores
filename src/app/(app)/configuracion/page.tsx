import { Settings, Lock, Users, Warehouse, Layers, PenLine } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getLocalesOpc } from '@/lib/queries'
import { fmtDate, hoyLima, MESES } from '@/lib/format'
import { PageHeader, Section, Th, Td, Badge, Note } from '@/components/ui'
import { Select } from '@/components/select'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { actualizarUsuario, cerrarPeriodo, crearCatalogo, guardarAprobadores, guardarFirmasOC, guardarParametros, guardarZonas } from './actions'
import { ZONAS } from '@/lib/zonas'
import { PagedTable } from '@/components/pager'

export const metadata = { title: 'Configuración' }

const PCT = new Set(['meta_otif', 'meta_diferencia_inventario', 'meta_fifo', 'meta_ahorro', 'umbral_alerta_precio', 'igv'])

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const [{ data: params }, { data: cierres }, { data: usuarios }, { data: roles }, { data: almacenes }, { data: areas }, locales, { data: aprobadores }, { data: cats }, { data: firmas }] = await Promise.all([
    // solo los numéricos (metas y umbrales)
    supabase.from('parametro').select('clave, valor, descripcion').not('valor', 'is', null).order('clave'),
    supabase.from('periodo_cierre').select('local_id, anio, mes, cerrado, cerrado_at, local:local_id(nombre)').order('anio', { ascending: false }).order('mes', { ascending: false }),
    supabase.from('usuario').select('id, username, nombre, rol, todos_locales, activo'),
    supabase.from('rol').select('codigo, nombre, descripcion'),
    supabase.from('almacen').select('id, codigo, nombre, tipo, local:local_id(codigo)').order('codigo'),
    supabase.from('area').select('id, nombre, local:local_id(codigo)').order('nombre'),
    getLocalesOpc(),
    supabase.from('requerimiento_aprobador').select('id, nombre, cargo, monto_hasta').order('orden'),
    supabase.from('categoria').select('id, nombre, zona').is('padre_id', null).order('nombre'),
    // quién firma la orden de compra en cada negocio
    supabase.from('local').select('id, nombre, oc_elaborado_por, oc_aprobado_por').eq('activo', true).order('orden'),
  ])
  type C = { local_id: string; anio: number; mes: number; cerrado: boolean; cerrado_at: string; local: { nombre: string } }

  return (
    <>
      <PageHeader title="Configuración" description="Metas de los indicadores, cierre de periodos, usuarios y catálogos base." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Section icon={Settings} title="Metas y parámetros">
          <ActionForm action={guardarParametros} className="space-y-3">
            {(params ?? []).map((p) => {
              const pct = PCT.has(p.clave)
              return (
                <label key={p.clave} className="grid grid-cols-[1fr_140px] items-center gap-3 border-b border-line/70 pb-3 text-sm">
                  <span><span className="block font-medium">{p.descripcion}</span><span className="text-xs text-muted">{p.clave}</span></span>
                  <span className="flex items-center gap-1.5">
                    <input name={`p_${p.clave}`} defaultValue={pct ? +(Number(p.valor) * 100).toFixed(4) : Number(p.valor)} className="field tabular" inputMode="decimal" />
                    {pct && <><span className="text-muted">%</span><input type="hidden" name={`pct_${p.clave}`} value="1" /></>}
                  </span>
                </label>
              )
            })}
            <div className="flex justify-end"><SubmitButton soloConCambios>Guardar parámetros</SubmitButton></div>
          </ActionForm>
        </Section>

        <div className="space-y-5">
          {/* cada OC toma estos nombres (nadie los escribe al registrar la compra) */}
          <Section icon={PenLine} title="Firmas de la orden de compra">
            <ActionForm action={guardarFirmasOC} className="space-y-3">
              <p className="text-xs text-muted">Cada orden de compra del negocio sale con estos nombres. Si cambia el personal, se cambian aquí.</p>
              {(firmas ?? []).map((n) => (
                <div key={n.id} className="grid gap-2 border-b border-line/70 pb-3 sm:grid-cols-2">
                  <input type="hidden" name="firma_local" value={n.id} />
                  <p className="text-sm font-semibold sm:col-span-2">{n.nombre}</p>
                  <label><span className="label">Elaborado por (Almacén)</span><input name={`elaborado_${n.id}`} defaultValue={n.oc_elaborado_por ?? ''} className="field uppercase" /></label>
                  <label><span className="label">Aprobado por (Logística)</span><input name={`aprobado_${n.id}`} defaultValue={n.oc_aprobado_por ?? ''} className="field uppercase" /></label>
                </div>
              ))}
              <div className="flex justify-end"><SubmitButton soloConCambios>Guardar firmas</SubmitButton></div>
            </ActionForm>
          </Section>

          <Section icon={Users} title="Aprobadores de requerimientos">
            <ActionForm action={guardarAprobadores} className="space-y-3">
              <p className="text-xs text-muted">Se sugiere al primero cuyo tope cubre el monto estimado del requerimiento. Deje el tope vacío en el último (montos mayores). En cada requerimiento se puede elegir otro.</p>
              {(aprobadores ?? []).map((a) => (
                <div key={a.id} className="grid gap-2 border-b border-line/70 pb-3 sm:grid-cols-[1fr_120px]">
                  <input type="hidden" name="ap_id" value={a.id} />
                  <label className="sm:col-span-2"><span className="label">Nombre</span><input name={`ap_nombre_${a.id}`} defaultValue={a.nombre} className="field" /></label>
                  <label><span className="label">Cargo</span><input name={`ap_cargo_${a.id}`} defaultValue={a.cargo} className="field" /></label>
                  <label><span className="label">Hasta S/</span><input name={`ap_tope_${a.id}`} defaultValue={a.monto_hasta ?? ''} placeholder="Sin tope" inputMode="decimal" className="field tabular" /></label>
                </div>
              ))}
              <div className="flex justify-end"><SubmitButton soloConCambios>Guardar aprobadores</SubmitButton></div>
            </ActionForm>
          </Section>

          <Section icon={Lock} title="Cierre de periodos">
            <ActionForm action={cerrarPeriodo} className="mb-4 flex flex-wrap items-end gap-3">
              <label><span className="label">Negocio</span><Select name="local" options={locales} className="w-48" /></label>
              <label><span className="label">Mes</span><input type="month" name="periodo" defaultValue={hoyLima().slice(0, 7)} className="field" /></label>
              <SubmitButton name="accion" value="cerrar" variant="dark" confirm="¿Cerrar el periodo? No se podrán registrar ni modificar compras, movimientos, conteos ni descuentos de ese mes.">Cerrar</SubmitButton>
              <SubmitButton name="accion" value="reabrir" variant="outline">Reabrir</SubmitButton>
            </ActionForm>
            <div className="flex flex-wrap gap-1.5">
              {((cierres ?? []) as unknown as C[]).map((c) => (
                <Badge key={`${c.local_id}${c.anio}${c.mes}`} tone={c.cerrado ? 'dark' : 'gray'}>{c.cerrado ? '🔒' : '🔓'} {MESES[c.mes - 1].slice(0, 3)} {c.anio} · {c.local.nombre.split(' ').at(-1)}</Badge>
              ))}
            </div>
          </Section>

          <Section icon={Users} title="Usuarios y roles" bodyClassName="p-0">
            <PagedTable head={<tr><Th>Usuario</Th><Th>Rol</Th><Th>Acceso</Th><Th /></tr>}>{(usuarios ?? []).map((u) => (
                <tr key={u.id}>
                  <Td colSpan={4}>
                    <ActionForm action={actualizarUsuario} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="id" value={u.id} />
                      <span className="min-w-48 flex-1"><b>{u.username}</b><span className="block text-xs text-muted">{u.nombre}</span></span>
                      <Select name="rol" options={(roles ?? []).map((r) => ({ id: r.codigo, nombre: r.nombre }))} defaultValue={u.rol} required className="h-8 w-44" />
                      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="todos_locales" defaultChecked={u.todos_locales} className="accent-brand-600" /> Ambos negocios</label>
                      <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" name="activo" defaultChecked={u.activo} className="accent-brand-600" /> Activo</label>
                      <SubmitButton size="sm" variant="outline" soloConCambios>Guardar</SubmitButton>
                    </ActionForm>
                  </Td>
                </tr>
              ))}</PagedTable>
            <div className="p-4"><Note>Los usuarios nuevos (compras, almacén, cocina, mozos) se crearán cuando se definan los perfiles. Cada rol solo puede modificar los módulos que le corresponden (permisos aplicados en la base de datos con RLS).</Note></div>
          </Section>
        </div>

        {/* dónde se guarda cada categoría en el almacén físico (lo revisa el fiscalizador municipal) */}
        <Section icon={Layers} title="Zonas del almacén" className="xl:col-span-2">
          <ActionForm action={guardarZonas} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(cats ?? []).map((c) => (
                <label key={c.id}>
                  <span className="label">{c.nombre}</span>
                  <Select name={`zona_${c.id}`} options={ZONAS} defaultValue={c.zona} placeholder="Sin zona" ariaLabel={`Zona de ${c.nombre}`} />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted">{ZONAS.map((z) => z.nombre).join(' · ')}. Los productos de limpieza y químicos van separados de los alimentos.</p>
              <SubmitButton soloConCambios>Guardar zonas</SubmitButton>
            </div>
          </ActionForm>
        </Section>

        <Section icon={Warehouse} title="Almacenes, oficinas y áreas" className="xl:col-span-2" bodyClassName="grid gap-6 p-5 lg:grid-cols-2">
          <div>
            <PagedTable head={<tr><Th>Código</Th><Th>Almacén</Th><Th>Tipo</Th></tr>}>{((almacenes ?? []) as unknown as { id: string; codigo: string; nombre: string; tipo: string; local: { codigo: string } }[]).map((a) => (
                <tr key={a.id}><Td className="text-xs font-semibold">{a.codigo}</Td><Td>{a.nombre} <span className="text-xs text-muted">({a.local.codigo})</span></Td><Td className="text-xs capitalize">{a.tipo}</Td></tr>
              ))}</PagedTable>
            <ActionForm action={crearCatalogo} resetOnSuccess className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
              <input type="hidden" name="catalogo" value="almacen" />
              <input name="codigo" placeholder="Código" required className="field" />
              <input name="nombre" placeholder="Nombre" required className="field md:col-span-2" />
              <Select name="local" options={locales} />
              <Select name="tipo_almacen" required defaultValue="area" options={[{ id: 'area', nombre: 'Área' }, { id: 'almacen', nombre: 'Almacén' }, { id: 'cocina', nombre: 'Cocina' }, { id: 'bar', nombre: 'Bar' }, { id: 'activos', nombre: 'Activos' }]} />
              <div className="col-span-2 md:col-span-5"><SubmitButton size="sm" variant="outline">Agregar almacén</SubmitButton></div>
            </ActionForm>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Áreas</p>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {((areas ?? []) as unknown as { id: string; nombre: string; local: { codigo: string } | null }[]).map((a) => <Badge key={a.id} tone="gray">{a.nombre} · {a.local?.codigo ?? 'ambos'}</Badge>)}
            </div>
            <ActionForm action={crearCatalogo} resetOnSuccess className="mb-6 flex gap-2">
              <input type="hidden" name="catalogo" value="area" />
              <input name="nombre" placeholder="Nueva área" required className="field" />
              <Select name="local" options={locales} placeholder="Ambos" className="w-44" />
              <SubmitButton size="sm" variant="outline">Agregar</SubmitButton>
            </ActionForm>
            <p className="mb-2 text-sm font-semibold">Ciudades / orígenes de compra y conceptos</p>
            <ActionForm action={crearCatalogo} resetOnSuccess className="mb-2 flex gap-2">
              <input type="hidden" name="catalogo" value="ciudad" />
              <input name="nombre" placeholder="Nueva ciudad de origen" required className="field" />
              <SubmitButton size="sm" variant="outline">Agregar ciudad</SubmitButton>
            </ActionForm>
            <ActionForm action={crearCatalogo} resetOnSuccess className="flex gap-2">
              <input type="hidden" name="catalogo" value="motivo" />
              <input name="nombre" placeholder="Nuevo concepto de salida" required className="field" />
              <Select name="aplica_a" required defaultValue="salida" className="w-36" options={[{ id: 'salida', nombre: 'Salida' }, { id: 'carnes', nombre: 'Carnes' }, { id: 'ajuste', nombre: 'Ajuste' }]} />
              <SubmitButton size="sm" variant="outline">Agregar</SubmitButton>
            </ActionForm>
            <p className="mt-4 text-xs text-muted">Última revisión: {fmtDate(hoyLima())}</p>
          </div>
        </Section>
      </div>
    </>
  )
}
