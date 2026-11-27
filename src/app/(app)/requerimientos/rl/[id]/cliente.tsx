'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { PackageCheck, Undo2, FileSpreadsheet } from 'lucide-react'
import { fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageHeader, Section, Table, Th, Td, Badge, LinkButton, btnClass } from '@/components/ui'
import { Seleccion, MarcaFila, MarcaTodas, ImprimirMarcados, FilasImpresion, useSeleccion } from '../../[id]/seleccion'
import { EnviarWhatsApp } from '../../[id]/enviar-whatsapp'
import { marcarEnviados, cotizarJuntado } from '../../actions'

/** un producto del RL (si se pidió en varios requerimientos del día, va sumado) */
export type GrupoRL = {
  id: string; producto: string; cantidad: string
  /** «Alm. 01: 2 Paquete · Alm. 02: 3 Paquete» cuando se pidió más de una vez */
  detalle: string | null
  almacenes: string
  /** las líneas de los requerimientos (lo que se marca como enviado) */
  lineas: string[]
  envio: 'si' | 'parcial' | 'no'; enviadoAt: string | null
}

type Props = {
  id: string; numero: string; descripcion: string; grupos: GrupoRL[]
  requerimientos: { id: string; numero: string; almacen: string; hora: string }[]
  cotizaciones: { id: string; numero: string; estado: string }[]
  empresa: { razon: string; ruc: string; direccion: string; logo: string }
}

/**
 * La pantalla del RL: Fernanda marca los productos de un proveedor y descarga la imagen (o el PDF); al hacerlo,
 * esos productos quedan en verde como «Enviado» (se guarda). También puede cotizarlos o quitarles la marca.
 */
export function RLCliente(p: Props) {
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const lineasDe = (ids: string[]) => p.grupos.filter((g) => ids.includes(g.id)).flatMap((g) => g.lineas)

  // ya enviado: se pregunta antes de volver a mandarlo
  const confirmar = (ids: string[]) => {
    const ya = p.grupos.filter((g) => ids.includes(g.id) && g.envio !== 'no')
    return !ya.length || window.confirm(`${ya.length === 1 ? `«${ya[0].producto}» ya se envió` : `${ya.length} de los productos marcados ya se enviaron`}. ¿Enviarlos de nuevo?`)
  }
  // descargado / impreso: quedan como enviados
  const alListo = (ids: string[]) => startTransition(async () => {
    const r = await marcarEnviados(lineasDe(ids))
    setError(r?.error ?? null)
  })

  return (
    <Seleccion confirmar={confirmar} alListo={alListo}>
      <Contenido {...p} lineasDe={lineasDe} setError={setError} />
      {error && <p role="alert" className="fixed right-4 bottom-4 z-50 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm text-brand-800 shadow-lg">{error}</p>}
    </Seleccion>
  )
}

function Contenido({ id, numero, descripcion, grupos, requerimientos, cotizaciones, empresa, lineasDe, setError }: Props & {
  lineasDe: (ids: string[]) => string[]; setError: (e: string | null) => void
}) {
  const s = useSeleccion()!
  const [ocupado, startTransition] = useTransition()
  const marcados = [...s.marcados]
  const marcadosEnviados = grupos.filter((g) => s.marcados.has(g.id) && g.envio !== 'no')
  const porEnviar = grupos.filter((g) => g.envio !== 'si').length

  const quitarEnviado = () => startTransition(async () => {
    const r = await marcarEnviados(marcadosEnviados.flatMap((g) => g.lineas), false)
    setError(r?.error ?? null)
    if (!r?.error) s.poner([], false)
  })
  const cotizar = () => {
    if (!window.confirm(`¿Solicitar cotización de ${marcados.length} producto${marcados.length === 1 ? '' : 's'}? Se crea el cuadro comparativo.`)) return
    startTransition(async () => {
      const r = await cotizarJuntado(id, lineasDe(marcados))
      setError(r?.error ?? null)
    })
  }

  return (
    <>
      <PageHeader title={`Requerimiento ${numero}`} back={{ href: '/requerimientos?origen=almacen', label: 'Requerimientos' }} description={descripcion}
        actions={<>
          <EnviarWhatsApp referencia={numero} empresa={empresa.razon} ruc={empresa.ruc} direccion={empresa.direccion} logo={empresa.logo}
            filas={grupos.map((g) => ({ id: g.id, producto: g.producto, cantidad: g.cantidad }))} />
          <ImprimirMarcados />
          <button type="button" onClick={cotizar} disabled={!marcados.length || ocupado} className={btnClass('outline')}
            title={marcados.length ? undefined : 'Marque los productos que va a cotizar'}>
            <FileSpreadsheet className="size-4" /> Solicitar cotización
          </button>
          {marcadosEnviados.length > 0 && (
            <button type="button" onClick={quitarEnviado} disabled={ocupado} className={btnClass('ghost')} title="Vuelven a quedar por enviar">
              <Undo2 className="size-4" /> Quitar «enviado»
            </button>
          )}
          {cotizaciones.map((c) => <LinkButton key={c.id} href={`/cotizaciones/${c.id}`} variant="outline">Ver cotización {c.numero}</LinkButton>)}
        </>} />

      {/* los requerimientos del día que se juntaron (cada almacén ve el suyo) */}
      <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
        <span>Junta:</span>
        {requerimientos.map((r) => (
          <Link key={r.id} href={`/requerimientos/${r.id}`} className="enlace text-xs" title={`Pedido el ${r.hora}`}>{r.numero} · {r.almacen}</Link>
        ))}
      </p>

      <Section icon={PackageCheck} title="Productos" bodyClassName="p-0"
        stats={[{ label: 'Por enviar', value: porEnviar }, { label: 'Enviados', value: grupos.length - porEnviar }]}>
        <Table>
          <thead><tr>
            <Th className="w-12 text-center"><MarcaTodas ids={grupos.map((g) => g.id)} /></Th>
            <Th>Producto</Th><Th right>Cantidad</Th><Th>Almacén</Th><Th>Envío</Th>
          </tr></thead>
          <tbody>{grupos.map((g) => (
            <tr key={g.id} className={cn(g.envio === 'si' && 'bg-leaf-50/70', g.envio === 'parcial' && 'bg-amber-50/60', s.marcados.has(g.id) && 'outline-2 -outline-offset-2 outline-brand-600/40')}>
              <Td className="text-center"><MarcaFila id={g.id} nombre={g.producto} /></Td>
              <Td className="font-medium">{g.producto}{g.detalle && <span className="block text-xs font-normal text-muted">{g.detalle}</span>}</Td>
              <Td right className="font-semibold whitespace-nowrap">{g.cantidad}</Td>
              <Td className="text-xs text-muted">{g.almacenes}</Td>
              <Td>{g.envio === 'si' ? <Badge tone="green">Enviado · {fmtDate(g.enviadoAt, true)}</Badge>
                : g.envio === 'parcial' ? <Badge tone="amber">Enviado en parte</Badge>
                : <span className="text-xs text-muted">Por enviar</span>}</Td>
            </tr>
          ))}</tbody>
        </Table>
      </Section>

      {/* hoja para imprimir (PDF): el pedido para el proveedor, igual que la imagen */}
      <section className="documento print-area hidden print:block">
        <header className="mb-4 flex items-center justify-between gap-4 border-b-2 border-ink-900 pb-3">
          <div className="flex items-center gap-3"><Image src={empresa.logo} alt="" width={120} height={52} className="h-12 w-auto object-contain" />
            <div><p className="font-bold">{empresa.razon}</p><p className="text-xs">RUC {empresa.ruc}</p>
              {empresa.direccion && <p className="max-w-md text-xs">{empresa.direccion}</p>}</div></div>
          <p className="text-xl font-bold">PEDIDO</p>
        </header>
        <p className="mb-3 text-sm">Fecha: {fmtDate(new Date())}</p>
        <table className="w-full text-sm">
          <thead><tr><th className="th w-12 text-left">N°</th><th className="th text-left">Producto</th><th className="th text-right">Cantidad</th></tr></thead>
          <FilasImpresion filas={grupos.map((g) => ({ id: g.id, producto: g.producto, cantidad: g.cantidad }))} />
        </table>
      </section>
    </>
  )
}
