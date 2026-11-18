import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // La carpeta doc/ contiene los Excel originales de Fernanda: no forma parte del build
  outputFileTracingExcludes: { '*': ['./doc/**'] },
  // en desarrollo, el indicador de Next.js a la derecha (a la izquierda tapaba el usuario de la barra lateral)
  devIndicators: { position: 'bottom-right' },
  experimental: {
    serverActions: { bodySizeLimit: '8mb' }, // subida de fotos y documentos
  },
}

export default nextConfig
