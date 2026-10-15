import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // La carpeta doc/ contiene los Excel originales de Fernanda: no forma parte del build
  outputFileTracingExcludes: { '*': ['./doc/**'] },
  experimental: {
    serverActions: { bodySizeLimit: '8mb' }, // subida de fotos y documentos
  },
}

export default nextConfig
