'use client'

import { useState } from 'react'
import { Section } from '@/components/ui'
import type { ProveedorOpc } from '@/components/proveedor-picker'
import type { Anterior } from './anteriores'
import { OfertaForm, type ItemOferta } from './oferta-form'

/**
 * Registrar ofertas. Los productos que ya tienen ganador de una cotización anterior van aparte y desmarcados
 * (con «Usar precios anteriores» se cargan de una vez); los nuevos vienen marcados para cotizar.
 */
export function RegistroOferta({ cotizacionId, proveedores, items, anteriores, cargados }: {
  cotizacionId: string; proveedores: ProveedorOpc[]; items: ItemOferta[]; anteriores: Anterior[]; cargados: string[]
}) {
  const ganadores = Object.fromEntries(anteriores.map((a) => [a.item_id, { proveedor: a.proveedor, precio: Number(a.precio) }]))
  const [marcados, setMarcados] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((i) => [i.id, !ganadores[i.id]])))
  // cargados = todos los ganadores anteriores ya tienen su oferta en esta cotización
  const todosCargados = anteriores.length > 0 && anteriores.every((a) => cargados.includes(`${a.proveedor_id}|${a.canal}`))
  return (
    <Section title="Registrar oferta / nueva ronda" className="no-print mb-5">
      <OfertaForm cotizacionId={cotizacionId} proveedores={proveedores} items={items} marcados={marcados} onMarcados={setMarcados}
        ganadores={ganadores} anterioresCargados={todosCargados} />
    </Section>
  )
}
