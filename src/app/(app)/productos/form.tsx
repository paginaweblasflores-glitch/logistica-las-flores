'use client'

import { useState } from 'react'
import type { Opcion } from '@/lib/queries'
import { Select } from '@/components/select'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { UnidadCombobox, type UnidadOpc } from '@/components/unidad-combobox'
import { Section } from '@/components/ui'
import { guardarProducto } from './actions'

export type Producto = {
  id?: string; codigo?: string; nombre?: string; descripcion?: string | null
  tipo?: string; categoria_id?: string | null; unidad_id?: string; marca?: string | null; presentacion?: string | null
  es_perecible?: boolean; controla_lote?: boolean; costo_referencia?: number; activo?: boolean
  /** empaque: cuánto trae cada unidad (saco = 50 kilos) */
  contenido?: number | null; contenido_unidad_id?: string | null
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
  // unidad elegida: si es un empaque (saco, caja…), se pregunta cuánto trae
  const [uni, setUni] = useState<{ nombre: string; tipo: string } | null>(() => {
    const u = unidades.find((x) => x.id === unidadId)
    return u ? { nombre: u.nombre, tipo: u.tipo ?? 'medida' } : null
  })
  const medidas = unidades.filter((u) => u.tipo === 'medida')
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
            <div className="relative md:col-span-2"><label><span className="label">Nombre <span className="req">*</span></span>
              <input name="nombre" required defaultValue={p.nombre} autoFocus={crear && !soloLectura} onChange={alEscribirNombre ? (e) => alEscribirNombre(e.target.value) : undefined}
                placeholder="Ej.: GASEOSA INCA KOLA X 1 LT" className="field" /></label>{avisoNombre}</div>
            <label><span className="label">Categoría</span><Select name="categoria" options={categorias} defaultValue={p.categoria_id} placeholder="—" agregar="categoria" /></label>
            <label><span className="label">Marca</span><input name="marca" defaultValue={p.marca ?? ''} className="field" /></label>
            {/* la unidad se elige o se escribe; si no existe, queda como unidad nueva */}
            <div><span className="label">Unidad <span className="req">*</span></span>
              <UnidadCombobox unidades={unidades} defaultValue={unidadId} disabled={soloLectura} onCambio={setUni} /></div>
            {uni?.tipo === 'empaque' && (
              <div className="md:col-span-2"><span className="label">¿Cuánto trae cada {uni.nombre.toLowerCase()}? <span className="font-normal normal-case text-subtle">(para pasar a otras unidades)</span></span>
                <div className="flex gap-2">
                  <input type="number" step="any" min="0" name="contenido" defaultValue={p.contenido ?? ''} placeholder="50"
                    aria-label="Cuánto trae" className="field w-28 tabular" />
                  <Select name="contenido_unidad" options={medidas} defaultValue={p.contenido_unidad_id} placeholder="—" className="flex-1" ariaLabel="Unidad del contenido" />
                </div></div>
            )}
            <label className={uni?.tipo === 'empaque' ? 'md:col-span-1' : 'md:col-span-3'}><span className="label">Descripción <span className="font-normal normal-case text-subtle">(opcional)</span></span>
              <input name="descripcion" defaultValue={p.descripcion ?? ''} className="field" /></label>
          </div>
          {!crear && !soloLectura && <div className="mt-4 flex justify-end"><SubmitButton soloConCambios>Guardar cambios</SubmitButton></div>}
        </Envoltura>

        {crear && (
          <>
            {/* 2) la cantidad que tiene hoy (una sola vez); después cambia con entradas, salidas y traspasos */}
            <Section title="Stock inicial">
              <div className="grid gap-4 md:grid-cols-3">
                <label><span className="label">Cantidad que tiene hoy</span>
                  <input type="number" step="any" min="0" name="cantidad" defaultValue="0" className="field tabular" /></label>
                {/* el precio es por la unidad del producto (por saco, por caja…), no por kilo */}
                <label><span className="label">Precio por {(uni?.nombre ?? 'unidad').toLowerCase()} (S/)</span>
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
