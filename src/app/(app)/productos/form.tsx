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
  return (
    <ActionForm action={guardarProducto} className="space-y-4">
      {p.id && <input type="hidden" name="id" value={p.id} />}
      {/* el negocio y el almacén donde se crea (el elegido en la barra superior) */}
      {seleccionados.filter((id) => negocios.some((n) => n.id === id)).map((id) => <input key={id} type="hidden" name="negocio" value={id} />)}
      {almacenId && <input type="hidden" name="almacen" value={almacenId} />}
      <fieldset disabled={soloLectura} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="relative md:col-span-2"><label><span className="label">Nombre *</span>
            <input name="nombre" required defaultValue={p.nombre} autoFocus={crear && !soloLectura} onChange={alEscribirNombre ? (e) => alEscribirNombre(e.target.value) : undefined}
              placeholder="Ej.: GASEOSA INCA KOLA X 1 LT" className="field" /></label>{avisoNombre}</div>
          {/* se elige o se escribe para buscar; si no existe, queda como unidad nueva para la próxima vez */}
          <div><span className="label">Unidad *</span>
            <UnidadCombobox unidades={unidades} defaultValue={unidadId} disabled={soloLectura} onCambio={setUni} /></div>
          <label><span className="label">Categoría</span><Select name="categoria" options={categorias} defaultValue={p.categoria_id} placeholder="—" agregar="categoria" /></label>
          {uni?.tipo === 'empaque' && (
            <div className="md:col-span-2"><span className="label">¿Cuánto trae cada {uni.nombre.toLowerCase()}? <span className="font-normal normal-case text-subtle">(para pasar a otras unidades)</span></span>
              <div className="flex gap-2">
                <input type="number" step="any" min="0" name="contenido" defaultValue={p.contenido ?? ''} placeholder="50" onFocus={(e) => e.target.select()}
                  aria-label="Cuánto trae" className="field w-28 tabular" />
                <Select name="contenido_unidad" options={medidas} defaultValue={p.contenido_unidad_id} placeholder="—" className="flex-1" ariaLabel="Unidad del contenido" />
              </div></div>
          )}
          <label><span className="label">Marca</span><input name="marca" defaultValue={p.marca ?? ''} className="field" /></label>
          <label><span className="label">Presentación</span><input name="presentacion" defaultValue={p.presentacion ?? ''} placeholder="Saco x 50 kg, caja x 12…" className="field" /></label>
          {ponCantidad && (
            <label><span className="label">Cantidad que tiene hoy</span>
              <input type="number" step="any" min="0" name="cantidad" defaultValue="0" onFocus={(e) => e.target.select()} className="field tabular" /></label>
          )}
          {!crear && typeof cantidadActual === 'number' && (
            <div><span className="label">Cantidad en el almacén</span>
              <p className="field flex items-center gap-2 bg-canvas tabular" title="Ya registrada: cambia con ingresos, salidas, traspasos o conteos">
                <Lock className="size-3.5 text-subtle" />{cantidadActual.toLocaleString('es-PE', { maximumFractionDigits: 3 })}</p></div>
          )}
          {/* al crear: desde qué cantidad avisa la campanita del almacén (vacío = sin aviso; después se cambia en la ficha) */}
          {crear && (
            <label><span className="label">Stock mínimo</span>
              <input type="number" step="any" min="0" name="stock_minimo" placeholder="0" onFocus={(e) => e.target.select()} className="field tabular" /></label>
          )}
          {/* El precio se pone UNA vez (al crear, con la cantidad inicial). Después lo actualiza cada boleta (se ve arriba, en «Último precio de compra») */}
          {ponCantidad && <label><span className="label">Precio unit. (S/)</span>
            <input type="number" step="0.0001" min="0" name="costo_referencia" defaultValue={Number(p.costo_referencia) > 0 ? p.costo_referencia : ''}
              onFocus={(e) => e.target.select()} placeholder="0.00" className="field tabular" /></label>}
          {/* al crear: primero la fecha de vencimiento y luego con cuántos días de anticipación avisa la campanita (después se cambia en la ficha) */}
          {crear && (<>
            <label><span className="label">Fecha de vencimiento</span>
              <input type="date" name="fecha_vencimiento" className="field tabular" /></label>
            <label><span className="label">Avisar faltando (días)</span>
              <input type="number" min="1" max="365" step="1" name="dias_aviso_vencimiento" defaultValue="30" onFocus={(e) => e.target.select()} className="field tabular" /></label>
          </>)}
          <label className={crear ? '' : cantidadActual !== undefined ? 'md:col-span-4' : 'md:col-span-3'}><span className="label">Descripción (opcional)</span><input name="descripcion" defaultValue={p.descripcion ?? ''} className="field" /></label>
        </div>
        {ponCantidad && <p className="-mt-2 text-xs text-muted">La cantidad entra al stock como una entrada «Producto nuevo» (E-…) y queda en el Kardex. Después cambia con entradas, salidas, traspasos o conteos.</p>}

        <div className="flex flex-wrap items-center gap-5 text-sm">
          {/* primera cantidad de un producto ya creado: lleva su fecha de vencimiento (opcional; crea su lote) */}
          {ponCantidad && !crear && (
            <label className="flex items-center gap-2"><span className="text-muted">Fecha de vencimiento</span>
              <input type="date" name="fecha_vencimiento" className="field h-8 w-40 tabular" /></label>
          )}
          {!soloLectura && <SubmitButton className="ml-auto">{crear ? 'Crear producto' : 'Guardar cambios'}</SubmitButton>}
        </div>
      </fieldset>
    </ActionForm>
  )
}
