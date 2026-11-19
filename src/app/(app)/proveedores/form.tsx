import type { Opcion } from '@/lib/queries'
import { ComboInput } from '@/components/combo-input'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { guardarProveedor } from './actions'
import { TIPOS_PROVEEDOR } from '@/lib/proveedor-tipo'
import { Select } from '@/components/select'
import { Section } from '@/components/ui'

export type Proveedor = {
  id?: string; ruc?: string | null; dni?: string | null; razon_social?: string; nombre_comercial?: string | null; subcategoria?: string | null; ciudad_id?: string | null
  direccion?: string | null; telefono?: string | null; email?: string | null; contacto?: string | null; condiciones_pago?: string | null
  forma_pedido?: string | null; dias_pedido?: string | null; banco?: string | null; titular_cuenta?: string | null; numero_cuenta?: string | null
  es_transportista?: boolean; activo?: boolean; observacion?: string | null; fecha_registro?: string; tipo?: string
}

export function ProveedorForm({ p = {}, ciudades }: { p?: Proveedor; ciudades: Opcion[] }) {
  const crear = !p.id
  const f = (label: string, name: keyof Proveedor, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, span = '') => (
    <label className={span}><span className="label">{label}</span>
      <input name={name} defaultValue={(p[name] as string | null | undefined) ?? ''} className="field" {...extra} /></label>
  )
  return (
    <ActionForm action={guardarProveedor} className="space-y-5">
      {p.id && <input type="hidden" name="id" value={p.id} />}
      <Grupo crear={crear} titulo="Datos del proveedor">
        {f('Razón social *', 'razon_social', { required: true }, 'md:col-span-2')}
        {f('RUC', 'ruc', { inputMode: 'numeric', maxLength: 11, pattern: '\\d{11}' })}
        {/* productores sin RUC (cuy…): se les compra con liquidación de compra, que lleva su DNI */}
        {f('DNI (si no tiene RUC)', 'dni', { inputMode: 'numeric', maxLength: 8, pattern: '\\d{8}' })}
        <label><span className="label">Tipo</span>
          <Select name="tipo" options={TIPOS_PROVEEDOR} defaultValue={p.tipo ?? 'proveedor'} required /></label>
        {f('Nombre comercial', 'nombre_comercial')}
        {f('Rubro', 'subcategoria', { placeholder: 'Pollo, limpieza…' })}
        <label><span className="label">Ciudad / origen</span><ComboInput name="ciudad" opciones={ciudades} defaultValue={ciudades.find((c) => c.id === p.ciudad_id)?.nombre} placeholder="Elija o escriba" /></label>
        {f('Fecha de registro', 'fecha_registro', { type: 'date' })}
      </Grupo>
      <Grupo crear={crear} titulo="Contacto">
        {f('Contacto principal', 'contacto')}
        {f('Teléfono', 'telefono', { inputMode: 'tel' })}
        {f('Correo', 'email', { type: 'email' }, 'md:col-span-2')}
        {f('Dirección', 'direccion', {}, 'md:col-span-4')}
      </Grupo>
      <Grupo crear={crear} titulo="Pedidos y pagos">
        {f('Forma de pedido', 'forma_pedido', { placeholder: 'WhatsApp, llamada…' })}
        {f('Días de pedido', 'dias_pedido', { placeholder: 'Lunes y jueves…' })}
        {f('Condiciones de pago', 'condiciones_pago', { placeholder: 'Contado, crédito 15 días…' }, 'md:col-span-2')}
        {f('Banco', 'banco')}
        {f('Titular de la cuenta', 'titular_cuenta')}
        {f('N° de cuenta / CCI', 'numero_cuenta', {}, 'md:col-span-2')}
      </Grupo>
      {f('Observación', 'observacion', {}, 'block')}
      <div className="flex flex-wrap items-center gap-5 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="es_transportista" defaultChecked={p.es_transportista} className="size-4 accent-brand-600" /> Es transportista</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="activo" value="on" defaultChecked={p.activo ?? true} className="size-4 accent-brand-600" /> Activo</label>
        <input type="hidden" name="activo" value="off" />
        <SubmitButton className="ml-auto" soloConCambios={!!p.id}>{p.id ? 'Guardar cambios' : 'Registrar proveedor'}</SubmitButton>
      </div>
    </ActionForm>
  )
}

/** Los campos de un grupo: al crear, en su propio recuadro; en la ficha (que ya está en un recuadro), con un subtítulo. */
function Grupo({ crear, titulo, children }: { crear: boolean; titulo: string; children: React.ReactNode }) {
  const campos = <div className="grid gap-4 md:grid-cols-4">{children}</div>
  return crear ? <Section title={titulo}>{campos}</Section> : (
    <div><p className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">{titulo}</p>{campos}</div>
  )
}
