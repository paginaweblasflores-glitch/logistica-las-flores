import { getAlmacenActivo } from '@/lib/session'
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { Local } from '@/lib/session'
import { fmtQty, fmtSoles, hoyLima } from '@/lib/format'
import { TIPOS_DE } from '@/lib/movimientos'
import { sp } from '@/lib/utils'
import { PageHeader, Section, FilterBar, FiltroFechas } from '@/components/ui'
import { ExportButton } from '@/components/export-button'

type Linea = { tipo: string; entrada: number | null; salida: number | null; importe: number }

/** «Movimientos (Kardex)»: cada movimiento con el stock que quedó después (saldo del producto en su almacén) */
const COLS = { nro: 'N° mov.', fecha: 'Fecha', tipo_nombre: 'Tipo', almacen_nombre: 'Almacén', producto_nombre: 'Producto', unidad: 'Unidad',
  entrada: 'Entrada', salida: 'Salida', saldo: 'Stock después', costo_unitario: 'Costo', importe: 'Importe', documento: 'Documento', motivo_nombre: 'Motivo', observacion: 'Observación' }

/** Una descarga del recuadro «Descargar en Excel»: qué responde y su botón */
function Descarga({ titulo, texto, children }: { titulo: string; texto: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-lg border border-line p-3">
      <div><p className="text-sm font-semibold">{titulo}</p><p className="text-xs text-muted">{texto}</p></div>
      {children}
    </div>
  )
}

/**
 * Reportes del panel de almacén: el resumen del periodo en tarjetas (solo para mirar) y las descargas en Excel.
 * El detalle de cada entrada, salida o traspaso está en su propio módulo (y el de un producto, en su Kardex).
 */
export async function ReportesAlmacen({ local, params }: { local: Local; params: Record<string, string> }) {
  const supabase = await createClient()
  const hoy = hoyLima()
  const desde = sp(params, 'desde', `${hoy.slice(0, 7)}-01`), hasta = sp(params, 'hasta', hoy)

  const sel = await getAlmacenActivo()   // reportes del almacén elegido arriba (o de todos)
  const { data: lineas } = await supabase.from('v_movimiento_linea').select('tipo, entrada, salida, importe')
    .eq('local_id', local.id).match(sel.id ? { almacen_id: sel.id } : {}).gte('fecha', `${desde}T00:00:00-05:00`).lte('fecha', `${hasta}T23:59:59-05:00`)
    .limit(20000)
  const ls = (lineas ?? []) as Linea[]
  // entradas y salidas sin los traspasos, que van aparte
  const TIPOS = {
    entradas: TIPOS_DE.entrada.filter((t) => t !== 'traslado_entrada'),
    salidas: TIPOS_DE.salida.filter((t) => t !== 'traslado_salida'),
  }
  const suma = (arr: Linea[]) => ({ lineas: arr.length, unidades: arr.reduce((s, l) => s + Number(l.entrada ?? l.salida ?? 0), 0), valor: arr.reduce((s, l) => s + Number(l.importe), 0) })
  const tarjetas = [
    { titulo: 'Entradas', icon: ArrowDownToLine, ...suma(ls.filter((l) => TIPOS.entradas.includes(l.tipo))) },
    { titulo: 'Salidas', icon: ArrowUpFromLine, ...suma(ls.filter((l) => TIPOS.salidas.includes(l.tipo))) },
    { titulo: 'Traspasos enviados', icon: ArrowLeftRight, ...suma(ls.filter((l) => l.tipo === 'traslado_salida')) },
    { titulo: 'Traspasos recibidos', icon: ArrowLeftRight, ...suma(ls.filter((l) => l.tipo === 'traslado_entrada')) },
  ]

  return (
    <>
      <PageHeader title={`Reportes${sel.actual ? ` · ${sel.actual.corto}` : ''}`} />
      <FilterBar>
        <FiltroFechas desde={desde} hasta={hasta} />
      </FilterBar>

      {/* resumen del periodo: solo para mirar (el detalle está en Entradas, Salidas, Traspasos y el Kardex) */}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tarjetas.map((t) => {
          const Icon = t.icon
          return (
            <div key={t.titulo} className="card flex flex-col gap-1 p-4">
              <span className="flex items-center justify-between text-xs font-semibold tracking-wide text-muted uppercase">{t.titulo}<Icon className="size-4 text-subtle" /></span>
              <span className="text-2xl font-bold tabular">{t.lineas}</span>
              <span className="text-xs text-muted">{fmtQty(t.unidades)} unidades · {fmtSoles(t.valor)}</span>
            </div>
          )
        })}
      </div>

      {/* cada descarga responde una pregunta distinta (almacén elegido arriba y fechas del filtro) */}
      <Section title="Descargar en Excel" className="mb-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Descarga titulo="Stock actual" texto="La cantidad exacta de cada producto hoy, como en Inventario (una fila por producto).">
            <ExportButton label="Stock actual" filename={`stock_${local.codigo}_${hoy}`} rpc={{ fn: 'fn_reporte_stock', args: { p_local: local.id, p_almacen: sel.id } }}
              opcionales={['en_presentacion', 'costo_promedio', 'valor', 'minimo']}
              columns={{ almacen: 'Almacén', codigo: 'Cód.', producto: 'Producto', zona: 'Zona', categoria: 'Categoría', unidad: 'Unidad', stock: 'Stock',
                en_presentacion: 'En presentación grande', costo_promedio: 'Costo promedio', valor: 'Valor', minimo: 'Mínimo', estado: 'Estado' }} />
          </Descarga>
          <Descarga titulo="Resumen del periodo" texto="Por producto: stock al inicio + entradas − salidas = stock al final.">
            <ExportButton label="Resumen del periodo" filename={`resumen_${local.codigo}_${desde}_${hasta}`}
              rpc={{ fn: 'fn_reporte_resumen', args: { p_local: local.id, p_almacen: sel.id, p_desde: desde, p_hasta: hasta } }}
              opcionales={['costo_promedio', 'valor_final']}
              columns={{ almacen: 'Almacén', codigo: 'Cód.', producto: 'Producto', categoria: 'Categoría', unidad: 'Unidad', stock_inicio: 'Stock al inicio',
                entradas: 'Entradas', salidas: 'Salidas', stock_final: 'Stock al final', costo_promedio: 'Costo promedio', valor_final: 'Valor final' }} />
          </Descarga>
          <Descarga titulo="Movimientos (Kardex)" texto="Cada entrada y salida, una por una, con el stock que quedó después de cada una.">
            <ExportButton label="Movimientos" filename={`movimientos_${local.codigo}_${desde}_${hasta}`} table="v_kardex" columns={COLS}
              opcionales={['costo_unitario', 'importe', 'documento', 'motivo_nombre', 'observacion']}
              dateColumn="fecha" desde={desde} hasta={hasta} order="fecha"
              filters={{ local_id: local.id, almacen_id: sel.id ?? undefined }} />
          </Descarga>
          <Descarga titulo="Compras del periodo" texto="Qué se compró, a quién, con qué comprobante y a qué precio.">
            {/* el cuadro que pide el Sr. Vladimir: cada compra con su fecha, comprobante, marca, cantidad, precio y total */}
            <ExportButton label="Compras" filename={`compras_${desde}_${hasta}`} opcionales={['marca', 'numero_documento']} table="v_ingreso_almacen" dateColumn="fecha_ingreso" desde={desde} hasta={hasta} order="fecha_ingreso"
              filters={{ almacen_id: sel.id ?? undefined, local_id: !sel.id ? local.id : undefined, fuera_de_catalogo: 'false' }}
              columns={{ fecha_ingreso: 'Fecha de entrada', almacen: 'Almacén', proveedor: 'Proveedor', tipo_documento: 'Comprobante', numero_documento: 'N° comprobante',
                codigo_almacen: 'Cód.', producto: 'Producto', marca: 'Marca', unidad: 'Unidad', cantidad: 'Cantidad', precio_unitario: 'Precio unitario', total: 'Total' }} />
          </Descarga>
        </div>
      </Section>
    </>
  )
}
