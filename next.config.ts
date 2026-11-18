import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Navegación instantánea (Next 16.3): al hacer clic se muestra al instante el marco de la pantalla y los datos
  // llegan en cuanto están; los enlaces precargan ese marco (App Shell) antes del clic.
  cacheComponents: true,
  partialPrefetching: true,
  // La carpeta doc/ contiene los Excel originales de Fernanda: no forma parte del build
  outputFileTracingExcludes: { '*': ['./doc/**'] },
  // en desarrollo, el indicador de Next.js a la derecha (a la izquierda tapaba el usuario de la barra lateral)
  devIndicators: { position: 'bottom-right' },
  experimental: {
    serverActions: { bodySizeLimit: '8mb' }, // subida de fotos y documentos
  },
}

export default nextConfig
