'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import type { Opcion } from '@/lib/queries'
import { Select } from '@/components/select'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { UnidadCombobox, type UnidadOpc } from '@/components/unidad-combobox'
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
 * Ficha del producto: nombre → unidad → categoría → marca y presentación → (al crearlo) cantidad que tiene hoy →
 * precio unitario. El producto va al almacén elegido arriba y recibe el siguiente código de ese almacén.
 * La editan los responsables de almacén; Logística la ve en solo lectura.
 */
const SPAN = { 1: 'md:col-span-1', 2: 'md:col-span-2', 3: 'md:col-span-3', 4: 'md:col-span-4' } as const

export function ProductoForm({ p = {}, categorias, unidades, negocios, seleccionados, almacenId, cantidadActual, soloLectura = false, alEscribirNombre, avisoNombre }: {
  p?: Producto; categorias: Opcion[]; unidades: UnidadOpc[]; negocios: NegocioOpc[]; seleccionados: string[]
  /** almacén donde se trabaja (el elegido arriba): ahí se crea el producto o se pone su cantidad inicial */
  almacenId?: string | null
  /** edición: null = aún no tiene cantidad en este almacén (se pone UNA vez); número = ya registrada (bloqueada) */
  cantidadActual?: number | null
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
  const ponCantidad = crear || cantidadActual === null   // la cantidad inicial aún se puede poner (una vez)
  // la descripción ocupa lo que quede de su fila (sin huecos): nombre 2 + categoría + marca + unidad + cuánto trae 2 + cantidad + precio + stock mínimo + vencimiento + aviso
  const usadas = 4 + 1 + (uni?.tipo === 'empaque' ? 2 : 0) + (ponCantidad || typeof cantidadActual === 'number' ? 1 : 0)
    + (ponCantidad ? 2 : 0) + (crear ? 2 : 0)
  const spanDescripcion = (4 - (usadas % 4)) as 1 | 2 | 3 | 4
  return (
    <ActionForm action={guardarProducto} className="space-y-4">
      {p.id && <input type="hidden" name="id" value={p.id} />}
      {/* el negocio y el almacén donde se crea (el elegido en la barra superior) */}
      {seleccionados.filter((id) => negocios.some((n) => n.id === id)).map((id) => <input key={id} type="hidden" name="negocio" value={id} />)}
      {almacenId && <input type="hidden" name="almacen" value={almacenId} />}
      <fieldset disabled={soloLectura} className="space-y-4">
        {/* orden: qué es → cómo se cuenta → cuánto hay y a qué precio → vencimiento → descripción */}
        <div className="grid gap-4 md:grid-cols-4">
          {/* 1) qué es */}
          <div className="relative md:col-span-2"><label><span className="label">Nombre <span className="req">*</span></span>
            <input name="nombre" required defaultValue={p.nombre} autoFocus={crear && !soloLectura} onChange={alEscribirNombre ? (e) => alEscribirNombre(e.target.value) : undefined}
              placeholder="Ej.: GASEOSA INCA KOLA X 1 LT" className="field" /></label>{avisoNombre}</div>
          <label><span className="label">Categoría</span><Select name="categoria" options={categorias} defaultValue={p.categoria_id} placeholder="—" agregar="categoria" /></label>
          <label><span className="label">Marca</span><input name="marca" defaultValue={p.marca ?? ''} className="field" /></label>

          {/* 2) cuánto hay y en qué unidad: la cantidad junto a su unidad (y cuánto trae cada una); se pone UNA vez, después cambia con entradas y salidas */}
          {ponCantidad && (
            <label><span className="label">Cantidad que tiene hoy</span>
              <input type="number" step="any" min="0" name="cantidad" defaultValue="0" onFocus={(e) => e.target.select()} className="field tabular" /></label>
          )}
          {!crear && typeof cantidadActual === 'number' && (
            <div><span className="label">Cantidad en el almacén</span>
              <p className="field flex items-center gap-2 bg-canvas tabular" title="Ya registrada: cambia con ingresos, salidas, traspasos o conteos">
                <Lock className="size-3.5 text-subtle" />{cantidadActual.toLocaleString('es-PE', { maximumFractionDigits: 3 })}</p></div>
          )}
          {/* la unidad se elige o se escribe; si no existe, queda como unidad nueva */}
          <div><span className="label">Unidad <span className="req">*</span></span>
            <UnidadCombobox unidades={unidades} defaultValue={unidadId} disabled={soloLectura} onCambio={setUni} /></div>
          {uni?.tipo === 'empaque' && (
            <div className="md:col-span-2"><span className="label">¿Cuánto trae cada {uni.nombre.toLowerCase()}? <span className="font-normal normal-case text-subtle">(para pasar a otras unidades)</span></span>
              <div className="flex gap-2">
                <input type="number" step="any" min="0" name="contenido" defaultValue={p.contenido ?? ''} placeholder="50" onFocus={(e) => e.target.select()}
                  aria-label="Cuánto trae" className="field w-28 tabular" />
                <Select name="contenido_unidad" options={medidas} defaultValue={p.contenido_unidad_id} placeholder="—" className="flex-1" ariaLabel="Unidad del contenido" />
              </div></div>
          )}

          {/* 3) precio, stock mínimo y vencimiento */}
          {/* el precio es por la unidad del producto (por saco, por caja…): la etiqueta lo dice para no confundirlo con el precio por kilo */}
          {ponCantidad && <label><span className="label">Precio por {(uni?.nombre ?? 'unidad').toLowerCase()} (S/)</span>
            <input type="number" step="0.0001" min="0" name="costo_referencia" defaultValue={Number(p.costo_referencia) > 0 ? p.costo_referencia : ''}
              onFocus={(e) => e.target.select()} placeholder="0.00" className="field tabular" /></label>}
          {/* al crear: desde qué cantidad avisa la campanita del almacén (vacío = sin aviso; después se cambia en la ficha) */}
          {crear && (
            <label><span className="label">Stock mínimo</span>
              <input type="number" step="any" min="0" name="stock_minimo" placeholder="0" onFocus={(e) => e.target.select()} className="field tabular" /></label>
          )}

          {/* 4) vencimiento (opcional; crea el lote de la cantidad inicial) */}
          {ponCantidad && (
            <label><span className="label">Fecha de vencimiento</span>
              <input type="date" name="fecha_vencimiento" className="field tabular" /></label>
          )}
          {crear && (
            <label><span className="label">Avisar faltando (días)</span>
              <input type="number" min="1" max="365" step="1" name="dias_aviso_vencimiento" defaultValue="30" onFocus={(e) => e.target.select()} className="field tabular" /></label>
          )}

          {/* 5) descripción */}
          <label className={SPAN[spanDescripcion]}><span className="label">Descripción (opcional)</span><input name="descripcion" defaultValue={p.descripcion ?? ''} className="field" /></label>
        </div>
        {ponCantidad && <p className="-mt-2 text-xs text-muted">La cantidad entra al stock como una entrada «Producto nuevo» (E-…) y queda en el Kardex. Después cambia con entradas, salidas, traspasos o conteos.</p>}

        <div className="flex flex-wrap items-center gap-5 text-sm">
          {!soloLectura && <SubmitButton className="ml-auto">{crear ? 'Crear producto' : 'Guardar cambios'}</SubmitButton>}
        </div>
      </fieldset>
    </ActionForm>
  )
}
