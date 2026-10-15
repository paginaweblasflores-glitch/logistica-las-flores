/**
 * Entradas y Salidas del almacén: cada una con su historial y su numeración propia por almacén
 * (E-00001… / S-00001…). Los tipos son los de `tipo_movimiento`; aquí, el nombre que ve el almacenero.
 */
export type Sentido = 'entrada' | 'salida'

/** Tipos que el almacén registra a mano en cada pantalla (las compras y traspasos tienen su propio formulario). */
export const TIPOS_MANUALES: Record<Sentido, { codigo: string; nombre: string; ayuda: string }[]> = {
  entrada: [
    { codigo: 'ajuste_positivo', nombre: 'Sobrante', ayuda: 'Hay más de lo que dice el sistema.' },
  ],
  salida: [
    { codigo: 'salida_consumo', nombre: 'Salida a un área', ayuda: '' },
    { codigo: 'merma', nombre: 'Merma / pérdida', ayuda: 'Producto vencido, malogrado o roto.' },
    { codigo: 'devolucion_proveedor', nombre: 'Devolución a proveedor', ayuda: 'Se devuelve al proveedor.' },
    { codigo: 'ajuste_negativo', nombre: 'Faltante', ayuda: 'Hay menos de lo que dice el sistema.' },
  ],
}

/** Nombre corto de cada tipo en los historiales */
export const NOMBRE_TIPO: Record<string, string> = {
  stock_inicial: 'Producto nuevo',
  entrada_compra: 'Compra',
  entrada_devolucion: 'Devolución de un área',
  ajuste_positivo: 'Sobrante',
  traslado_entrada: 'Traspaso recibido',
  salida_consumo: 'Salida a un área',
  salida_venta: 'Venta',
  merma: 'Merma / pérdida',
  devolucion_proveedor: 'Devolución a proveedor',
  ajuste_negativo: 'Faltante',
  traslado_salida: 'Traspaso enviado',
}

/** Tipos que se ofrecen en el filtro «Tipo» de cada historial (la devolución de un área ya no se usa en el almacén) */
export const TIPOS_FILTRO: Record<Sentido, string[]> = {
  entrada: ['entrada_compra', 'ajuste_positivo', 'traslado_entrada', 'stock_inicial'],
  salida: ['salida_consumo', 'merma', 'devolucion_proveedor', 'ajuste_negativo', 'traslado_salida', 'salida_venta'],
}

/** Tipos de cada historial (incluye los que vienen de compras, traspasos y conteos) */
export const TIPOS_DE: Record<Sentido, string[]> = {
  entrada: ['entrada_compra', 'entrada_devolucion', 'ajuste_positivo', 'traslado_entrada', 'stock_inicial'],
  salida: ['salida_consumo', 'merma', 'devolucion_proveedor', 'ajuste_negativo', 'traslado_salida', 'salida_venta'],
}
