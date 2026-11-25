'use client'

import { useState } from 'react'
import type { Opcion } from '@/lib/queries'
import { Select } from '@/components/select'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { UnidadCombobox, type UnidadOpc } from '@/components/unidad-combobox'
import { Section } from '@/components/ui'
import { zonaDe, SIN_ZONA } from '@/lib/zonas'
import { guardarProducto } from './actions'

export type Producto = {
  id?: string; codigo?: string; nombre?: string; descripcion?: string | null
  tipo?: string; categoria_id?: string | null; unidad_id?: string; marca?: string | null; presentacion?: string | null
  es_perecible?: boolean; controla_lote?: boolean; costo_referencia?: number; activo?: boolean
  /** presentación grande (saco, caja…) y cuántas unidades del producto trae: la llena el almacén */
  presentacion_id?: string | null; presentacion_cantidad?: number | null
}

/** Negocios donde se usa el producto: cada uno lleva su propio stock; el catálogo es uno solo. */
export type NegocioOpc = { id: string; codigo: string; nombre: string }

/**
 * Datos del producto (qué es: nombre, categoría, marca, unidad). Al crearlo, además, su stock inicial y los parámetros
 * del almacén, cada uno en su recuadro, como en la ficha. El producto va al almacén elegido en el menú y recibe el
 * siguiente código de ese almacén. Lo editan los responsables de almacén; Logística lo ve en solo lectura.
 */
export function ProductoForm({ p = {}, categorias, unidades, negocios, seleccionados, almacenId, soloLectura = false, alEscribirNombre, avisoNombre }: {
  p?: Producto; categorias: Opcion[]; unidades: UnidadOpc[]; negocios: NegocioOpc[]; seleccionados: string[]
  /** almacén donde se trabaja (el elegido arriba): ahí se crea el producto o se pone su cantidad inicial */
  almacenId?: string | null
  soloLectura?: boolean
  /** alta: avisa lo que se escribe en el nombre (para mostrar parecidos y no duplicar) */
  alEscribirNombre?: (v: string) => void
  /** se muestra debajo del nombre (p. ej. productos parecidos que ya existen) */
  avisoNombre?: React.ReactNode
}) {
  const crear = !p.id
  // un producto nuevo viene en «Unidad» (la estándar); se cambia si se pesa o se mide
  const unidadId = p.unidad_id ?? (crear ? unidades.find((x) => x.nombre === 'Unidad')?.id : undefined)
  // unidad chica (en la que se guarda el stock) y presentación grande (saco, caja…: cuánto trae)
  const [uni, setUni] = useState<{ nombre: string; tipo: string } | null>(() => {
    const u = unidades.find((x) => x.id === unidadId)
    return u ? { nombre: u.nombre, tipo: u.tipo ?? 'medida' } : null
  })
  // unidad en que se cuenta: las de medida y también «Paquete» (se compra y se despacha por paquetes)
  const medidas = unidades.filter((u) => (u.tipo ?? 'medida') === 'medida' || u.nombre === 'Paquete')
  const empaques = unidades.filter((u) => u.tipo === 'empaque')
  const [pres, setPres] = useState<string | null>(() => empaques.find((x) => x.id === p.presentacion_id)?.nombre ?? null)
  // alta: la cantidad inicial se escribe en la unidad chica o en la presentación
  const [en, setEn] = useState<'chica' | 'grande'>('chica')
  const chica = (uni?.nombre ?? 'unidad').toLowerCase()
  const [categoria, setCategoria] = useState(p.categoria_id ?? '')
  const cat = categorias.find((c) => c.id === categoria)
  // categoría nueva (recién escrita) o sin zona: se avisa que falta asignarla en Configuración
  const zona = cat ? zonaDe(cat.zona) ?? SIN_ZONA : null
  return (
    <ActionForm action={guardarProducto} className="space-y-4">
      {p.id && <input type="hidden" name="id" value={p.id} />}
      {/* el negocio y el almacén donde se crea (el elegido en la barra superior) */}
      {seleccionados.filter((id) => negocios.some((n) => n.id === id)).map((id) => <input key={id} type="hidden" name="negocio" value={id} />)}
      {almacenId && <input type="hidden" name="almacen" value={almacenId} />}
      <fieldset disabled={soloLectura} className="space-y-5">
        {/* 1) qué es el producto (lo único que se edita después en su ficha) */}
        <Envoltura crear={crear} titulo="Datos del producto">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="relative flex flex-col justify-end md:col-span-2"><label><span className="label">Nombre <span className="req">*</span></span>
              <input name="nombre" required defaultValue={p.nombre} autoFocus={crear && !soloLectura} onChange={alEscribirNombre ? (e) => alEscribirNombre(e.target.value) : undefined}
                placeholder="Ej.: GASEOSA INCA KOLA X 1 LT" className="field" /></label>{avisoNombre}</div>
            {/* la zona va en el título (dónde se guarda en el almacén físico): así el campo queda alineado con los demás */}
            <label><span className="label">Categoría{zona && <span className="font-semibold normal-case" style={{ color: zona.color }} title={zona.recordatorio}> · {zona.nombre}</span>}</span>
              <Select name="categoria" options={categorias} defaultValue={p.categoria_id} placeholder="—" agregar="categoria" onChange={setCategoria} /></label>
            <label><span className="label">Marca</span><input name="marca" defaultValue={p.marca ?? ''} className="field" /></label>
            {/* la unidad se elige o se escribe; si no existe, queda como unidad nueva */}
            {/* la unidad chica: en ella se guarda el stock y se hacen todas las cuentas (kilo, litro, unidad) */}
            <div><span className="label">Unidad <span className="req">*</span></span>
              <UnidadCombobox unidades={medidas} defaultValue={unidadId} disabled={soloLectura} onCambio={setUni} /></div>
            {/* la presentación grande (opcional): se puede escribir en ella en entradas, salidas y traspasos */}
            <div className="md:col-span-3"><span className="label">Presentación grande <span className="font-normal normal-case text-subtle">(opcional: saco, caja…)</span></span>
              <div className="grid grid-cols-[minmax(9rem,1fr)_auto] items-center gap-2">
                <UnidadCombobox unidades={empaques} defaultValue={p.presentacion_id} disabled={soloLectura} nombre="presentacion" requerido={false}
                  etiqueta="Presentación grande" placeholder="Sin presentación" onCambio={(x) => setPres(x?.nombre ?? null)} />
                <label className="flex items-center gap-2 text-sm whitespace-nowrap">trae
                  <input type="number" step="any" min="0" name="presentacion_cantidad" defaultValue={p.presentacion_cantidad ?? ''} required={!!pres}
                    aria-label="Cuánto trae la presentación" className="field w-24 tabular" />
                  {chica}</label>
              </div></div>
            <label className="md:col-span-4"><span className="label">Descripción <span className="font-normal normal-case text-subtle">(opcional)</span></span>
              <input name="descripcion" defaultValue={p.descripcion ?? ''} className="field" /></label>
          </div>
          {!crear && !soloLectura && <div className="mt-4 flex justify-end"><SubmitButton soloConCambios>Guardar cambios</SubmitButton></div>}
        </Envoltura>

        {crear && (
          <>
            {/* 2) la cantidad que tiene hoy (una sola vez); después cambia con entradas, salidas y traspasos */}
            <Section title="Stock inicial">
              <div className="grid gap-4 md:grid-cols-4">
                <label><span className="label">Cantidad que tiene hoy</span>
                  <input type="number" step="any" min="0" name="cantidad" defaultValue="0" className="field tabular" /></label>
                {/* en sacos o en kilos: el sistema lo guarda en la unidad chica */}
                <label><span className="label">En</span>
                  <Select name="en" value={en} onChange={(v) => setEn(v === 'grande' ? 'grande' : 'chica')} ariaLabel="Unidad de la cantidad"
                    options={[{ id: 'chica', nombre: uni?.nombre ?? 'Unidad' }, ...(pres ? [{ id: 'grande', nombre: pres }] : [])]} /></label>
                <label><span className="label">Precio por {en === 'grande' && pres ? pres.toLowerCase() : chica} (S/)</span>
                  <input type="number" step="0.0001" min="0" name="costo_referencia" placeholder="0.00" className="field tabular" /></label>
                <label><span className="label">Fecha de vencimiento</span><input type="date" name="fecha_vencimiento" className="field tabular" /></label>
              </div>
              <p className="mt-3 text-xs text-muted">Se registra una sola vez. Después cambia con entradas, salidas y traspasos.</p>
            </Section>
            {/* 3) desde qué cantidad avisa la campanita y con cuántos días de anticipación avisa el vencimiento */}
            <Section title="Parámetros del almacén">
              <div className="grid gap-4 md:grid-cols-3">
                <label><span className="label">Stock mínimo</span>
                  <input type="number" step="any" min="0" name="stock_minimo" placeholder="0" className="field tabular" /></label>
                <label><span className="label">Avisar vencimiento (días antes)</span>
                  <input type="number" min="1" max="365" step="1" name="dias_aviso_vencimiento" defaultValue="30" className="field tabular" /></label>
              </div>
            </Section>
            <div className="flex justify-end"><SubmitButton>Crear producto</SubmitButton></div>
          </>
        )}
      </fieldset>
    </ActionForm>
  )
}

/** Al crear, cada parte va en su recuadro; en la ficha, los datos ya están dentro del recuadro de la página. */
function Envoltura({ crear, titulo, children }: { crear: boolean; titulo: string; children: React.ReactNode }) {
  return crear ? <Section title={titulo}>{children}</Section> : <>{children}</>
}
