import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'
import { SeleccionarNumeros } from '@/components/seleccionar-numeros'

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-jb', display: 'swap' })

export const metadata: Metadata = {
  // dirección pública: la vista previa del enlace (WhatsApp…) necesita la imagen con su dirección completa
  metadataBase: new URL('https://logistica-las-flores.vercel.app'),
  title: { default: 'Las Flores · Logística y Almacén', template: '%s · Las Flores' },
  description: 'Sistema de logística — Restaurante Las Flores y Hotel Umaru',
  icons: { icon: '/logo.png' },
  // lo que se ve al compartir el enlace; la imagen es app/opengraph-image.jpg (1200 × 630)
  openGraph: {
    type: 'website', locale: 'es_PE', siteName: 'Logística Las Flores',
    title: 'Logística Las Flores',
    description: 'Compras y almacenes de Restaurante Las Flores y Hotel Umaru.',
  },
  twitter: { card: 'summary_large_image' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PE" className={`${jakarta.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans">
        {children}
        <Toaster position="top-right" richColors closeButton />
        {/* al entrar a un campo de número se selecciona lo escrito (en todo el sistema) */}
        <SeleccionarNumeros />
      </body>
    </html>
  )
}
