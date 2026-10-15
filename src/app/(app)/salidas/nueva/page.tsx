import { TIPOS_MANUALES } from '@/lib/movimientos'
import { FormularioEntradaSalida, opcionesTipo } from '../../inventario/movimientos/formulario'
import { TipoMovimiento } from '@/components/tipo-movimiento'

export const metadata = { title: 'Nueva salida' }

/** Nueva salida: a un área (con ticket para firmar), merma, devolución a proveedor, faltante u otra que escriba el almacén. */
export default async function NuevaSalidaPage({ searchParams }: { searchParams: Promise<{ tipo?: string; motivo?: string }> }) {
  const { tipo: t, motivo } = await searchParams
  const opciones = await opcionesTipo('salida', TIPOS_MANUALES.salida.map((o) => ({ valor: o.codigo, nombre: o.nombre })))
  const otro = t === 'otro' && motivo?.trim() ? motivo.trim() : undefined
  const tipo = otro ? 'ajuste_negativo' : TIPOS_MANUALES.salida.some((o) => o.codigo === t) ? t! : 'salida_consumo'
  const campo = <TipoMovimiento ruta="/salidas/nueva" etiqueta="Tipo de salida" opciones={opciones} actual={otro ?? tipo} />
  return <FormularioEntradaSalida sentido="salida" tipo={tipo} motivo={otro} tabs={campo} />
}
