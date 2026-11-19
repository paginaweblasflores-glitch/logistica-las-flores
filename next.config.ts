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
    // Sin esqueleto al navegar (decisión del usuario, 2026-11-19): cada pantalla espera a estar completa.
    // Next.js solo revisa la «navegación instantánea» en las pantallas que la pidan con `instant` (ninguna).
    instantInsights: { validationLevel: 'manual-warning' },
  },
}

export default nextConfig
