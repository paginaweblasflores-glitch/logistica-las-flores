import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

// Revisor de calidad: reglas de Next.js, React, React Hooks (incluidas las del compilador de React) y TypeScript.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Las fotos son miniaturas ya reducidas al subirlas (Storage de Supabase) o imágenes en base64 de los
      // requerimientos (las listas usan loading="lazy"). next/image no aporta aquí y consumiría el cupo de
      // optimización de imágenes de Vercel.
      '@next/next/no-img-element': 'off',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'doc/**', 'database/**']),
])
