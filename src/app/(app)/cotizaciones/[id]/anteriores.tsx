'use client'

import { Check, History } from 'lucide-react'
import { fmtDate, fmtSoles } from '@/lib/format'
import { Section } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { SubmitButton } from '@/components/submit-button'
import { usarCotizacionAnterior } from '../actions'

export type Anterior = { item_id: string; proveedor_id: string; proveedor: string; canal: string; precio: number; fecha: string; cotizacion_numero: string }

/**
 * Lo que ya cotizó cada proveedor por estos productos (de cotizaciones anteriores). Con «Usar estos precios»
 * se cargan como oferta sin volver a escribirlos; así se compara con lo que se cotice hoy.
 */
export function CotizacionesAnteriores({ cotizacionId, anteriores, items, marcados, cargados = [] }: {
  cotizacionId: string; anteriores: Anterior[]; items: { id: string; descripcion: string }[]
  /** «proveedor|canal» cuyos precios ya se cargaron en esta cotización: no se vuelven a cargar */
  cargados?: string[]
  /** productos marcados para cotizar: los desmarcados no muestran su ganador anterior */
  marcados?: Record<string, boolean>
}) {
  const grupos = new Map<string, Anterior[]>()
  for (const a of anteriores.filter((x) => !marcados || marcados[x.item_id])) {
    const k = `${a.proveedor_id}|${a.canal}`
    grupos.set(k, [...(grupos.get(k) ?? []), a])
  }
  const nombre = (id: string) => items.find((i) => i.id === id)?.descripcion ?? ''
  if (!grupos.size) return null
  return (
    <Section icon={History} title="Ganador anterior de estos productos" className="no-print mb-5" bodyClassName="p-0"
      stats={[{ label: 'Proveedores', value: grupos.size }]}>
      <ul className="divide-y divide-line">
        {[...grupos.values()].map((g) => (
          <li key={`${g[0].proveedor_id}|${g[0].canal}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 text-sm">
              <b>{g[0].proveedor}</b> <span className="text-xs text-muted">· {g[0].canal === 'en_linea' ? 'por internet' : 'en tienda'}</span>
              <span className="mt-0.5 block text-xs text-muted">
                {g.map((a) => <span key={a.item_id} className="mr-3 inline-block">{nombre(a.item_id)}: <b className="text-ink-900">{fmtSoles(a.precio)}</b> ({fmtDate(a.fecha)} · {a.cotizacion_numero})</span>)}
              </span>
            </div>
            {cargados.includes(`${g[0].proveedor_id}|${g[0].canal}`)
              ? <span className="flex items-center gap-1.5 text-xs font-semibold text-leaf-600"><Check className="size-4" /> Cargado</span>
              : (
            <ActionForm action={usarCotizacionAnterior}>
                <input type="hidden" name="cotizacion_id" value={cotizacionId} />
                <input type="hidden" name="proveedor_id" value={g[0].proveedor_id} />
                <input type="hidden" name="canal" value={g[0].canal} />
                <input type="hidden" name="items" value={JSON.stringify(g.map((a) => a.item_id))} />
                <SubmitButton size="sm" variant="outline">Usar estos precios</SubmitButton>
              </ActionForm>
              )}
          </li>
        ))}
      </ul>
    </Section>
  )
}
