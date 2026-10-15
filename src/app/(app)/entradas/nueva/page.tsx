import { FormularioEntradaSalida, opcionesTipo } from '../../inventario/movimientos/formulario'
import { FormularioCompraBoleta } from '../../ingresos/nuevo/formulario'
import { TipoMovimiento } from '@/components/tipo-movimiento'

export const metadata = { title: 'Nueva entrada' }

/** Nueva entrada: compra con boleta (la más común), sobrante u otra que escriba el almacén («Donación»…). */
export default async function NuevaEntradaPage({ searchParams }: { searchParams: Promise<{ tipo?: string; compra?: string; motivo?: string }> }) {
  const { tipo: t, compra, motivo } = await searchParams
  const opciones = await opcionesTipo('entrada', [{ valor: 'compra', nombre: 'Compra con boleta' }, { valor: 'ajuste_positivo', nombre: 'Sobrante' }])
  const otro = t === 'otro' && motivo?.trim() ? motivo.trim() : undefined
  const tipo = otro ? `otro:${otro}` : t === 'ajuste_positivo' ? t : 'compra'
  const campo = <TipoMovimiento ruta="/entradas/nueva" etiqueta="Tipo de entrada" opciones={opciones} actual={otro ?? tipo} />
  if (tipo === 'compra') return <FormularioCompraBoleta tabs={campo} compraId={compra} />
  return <FormularioEntradaSalida sentido="entrada" tipo="ajuste_positivo" motivo={otro} tabs={campo} />
}
