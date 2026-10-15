# Sistema de Logística — Corporación Las Flores

Sistema web de logística e inventario para **Restaurante Las Flores** (Corporación Las Flores S.A.C.) y
**Hotel Umaru** (Club Las Flores S.A.C.). Reemplaza la carpeta de Excel `LOGISTICA 2026` por una sola base de
datos con un panel por rol: se registra una vez y el stock, el Kardex, los vencimientos, los precios y los
indicadores se calculan solos — por negocio o en vista **Global**.

**Stack:** Next.js 16 (App Router, Server Components, Server Actions) · React 19 · Tailwind CSS 4 ·
Supabase (Postgres, Auth, Storage, RLS) · Recharts · SheetJS · despliegue en Vercel (región `gru1`, São Paulo).

## Paneles (un solo sistema, una sola base de datos)

| Panel | Qué hace |
|---|---|
| **Logística** | Ve ambos negocios. Aprueba requerimientos, cotiza (cuadro comparativo y adjudicación por producto), marca compras, proveedores, trazabilidad de precios, conteos, descuentos, reportes e indicadores. El inventario lo **consulta**. |
| **Almacén Las Flores** | Almacén 01 y Almacén 02 — Cocina. Entradas (compra con boleta, llegada de requerimientos, sobrantes…), salidas con ticket para firmar, traspasos, vencimientos, requerimientos y su catálogo. |
| **Almacén Umaru** | Lo mismo para el Hotel Umaru. |
| **Jefes de área** | Crean requerimientos (con su firma) y ven su estado. |

El selector de almacén de la barra superior filtra lo que se ve y dónde se registra.

## Flujo principal

1. **Requerimiento del almacén** — en la unidad en que se compra (sacos, paquetes, cajas…).
2. **Logística aprueba** en la misma tabla (puede aprobar menos, nunca más de lo pedido).
3. **Compra directa** («Comprado» + imprimir la lista) **o cotización**: ofertas por proveedor en la unidad del
   pedido, cuadro comparativo, adjudicación por producto y una compra por proveedor ganador.
4. **Llegada al almacén** — en *Nueva entrada* aparece lo comprado con proveedor, cantidades y precio sugerido;
   el almacén completa la boleta y el stock sube (FEFO: sale primero lo que vence antes).

## Puesta en marcha

1. **Supabase** — crear el proyecto y, en *SQL Editor*, ejecutar **en orden** los archivos numerados de
   `database/` (`01_schema.sql`, `02_seed.sql`, … hasta el último). Cada archivo es una migración: estructura,
   funciones, triggers, vistas y políticas RLS.
2. **Variables de entorno** — copiar `.env.example` a `.env.local` y completar *Project URL* y
   *Publishable key* (Supabase → Project Settings → API).
3. **Ejecutar**
   ```bash
   npm install
   npm run dev
   ```
   Abrir http://localhost:3000.
4. **Usuarios** — se ingresa con nombre de usuario; las contraseñas viven solo en Supabase Auth (bcrypt).
   Antes de usarlo en producción, **cambie todas las contraseñas** en Supabase → Authentication → Users.

Otros comandos: `npm run build` · `npm run typecheck`.

### Empezar con datos reales

`database/62_inventario_en_cero_para_hernan.sql` deja el inventario en cero (stock, lotes, movimientos,
traspasos, requerimientos, compras, cotizaciones y la numeración) y **conserva** el catálogo: productos,
códigos por almacén, proveedores, usuarios, áreas y configuración. **No se puede deshacer.**

## Estructura

```
src/
  app/(app)/…        páginas por módulo (Server Components + Server Actions por carpeta)
  app/login/         inicio de sesión por nombre de usuario
  components/        UI estándar: tarjetas, tablas, lista con buscador (combobox), editor de líneas,
                     unidad por línea, buscador de productos, ticket térmico
  lib/               clientes Supabase, sesión/ámbito, formatos (S/, fechas de Lima), utilidades
  proxy.ts           refresco de sesión y protección de rutas
database/            migraciones SQL numeradas (ejecutar en orden)
public/              logos (también los de los documentos impresos)
scripts/perf.mjs     medición de tiempos de consulta (desarrollo)
```

## Decisiones clave

- **Libro de movimientos inmutable + stock materializado.** Todo cambio de stock nace de un `movimiento`; un
  trigger actualiza `stock` (cantidad y costo promedio) y consume lotes por vencimiento (FEFO). Los errores se
  corrigen **anulando** (el trigger revierte el stock), nunca editando. No se permite stock negativo.
- **Catálogo por negocio con código maestro.** Cada negocio tiene su propia ficha del producto, enlazada por
  `maestro_id`; los traspasos entre negocios convierten la unidad automáticamente.
- **Unidades.** «Unidad» es la estándar; las líneas pueden escribirse en sacos, cajas o paquetes indicando cuánto
  trae cada uno, y el sistema lo convierte a la unidad del producto.
- **Cálculo en la base.** Vistas (`v_*`) y funciones (`fn_*`) calculan en Postgres; la aplicación solo presenta.
  Consultas en paralelo y una sola llamada para la sesión.
- **Seguridad.** RLS en todas las tablas con permisos por rol y módulo (`rol_permiso`) y por negocio
  (`usuario_local`); funciones `SECURITY DEFINER` con sus propias validaciones; auditoría automática;
  contraseñas solo en Supabase Auth. Los archivos de trabajo con datos reales (`/doc`) no se suben al repositorio.
