// Mide el tiempo de cada consulta contra Supabase (diagnóstico de rendimiento en desarrollo).
// Uso: PERF_PASSWORD=… node --env-file=.env scripts/perf.mjs   (la contraseña nunca va en el código)
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
const { data: email } = await sb.rpc('fn_email_por_usuario', { p_username: 'Logística Las Flores' })
const { error } = await sb.auth.signInWithPassword({ email, password: process.env.PERF_PASSWORD ?? '' })
if (error) throw error

async function t(nombre, fn) {
  const t0 = performance.now()
  const r = await fn()
  const ms = Math.round(performance.now() - t0)
  console.log(`${String(ms).padStart(6)} ms  ${nombre}${r.error ? '  ERROR ' + r.error.message : ''}${Array.isArray(r.data) ? `  (${r.data.length} filas)` : ''}`)
}

await t('ping: local (3 filas)', () => sb.from('local').select('id'))
await t('ping: local (3 filas) 2da vez', () => sb.from('local').select('id'))
await t('usuario', () => sb.from('usuario').select('id, rol').limit(1))
await t('v_movimiento_linea 200', () => sb.from('v_movimiento_linea').select('detalle_id, fecha, producto_nombre').gte('fecha', '2026-01-01').order('fecha', { ascending: false }).limit(200))
await t('v_kardex (1 producto)', () => sb.from('v_kardex').select('detalle_id, saldo').eq('producto_id', '96f81e8b-815a-4ddd-a3d1-32c68b2a8f9e'))
await t('v_stock página 50', () => sb.from('v_stock').select('producto_id, nombre, cantidad', { count: 'exact' }).neq('cantidad', 0).order('nombre').range(0, 49))
await t('fn_stock_totales', () => sb.rpc('fn_stock_totales', {}))
await t('v_lote_fifo', () => sb.from('v_lote_fifo').select('*').limit(1000))
await t('fn_fifo_resumen', () => sb.rpc('fn_fifo_resumen', {}))
await t('fn_dashboard mes', () => sb.rpc('fn_dashboard', { p_local: null, p_desde: '2026-09-01', p_hasta: '2026-09-28' }))
await t('fn_compras_mensual', () => sb.rpc('fn_compras_mensual', { p_local: null, p_anio: 2026 }))
await t('fn_kpi_inventario_mensual', () => sb.rpc('fn_kpi_inventario_mensual', { p_local: null, p_anio: 2026 }))
await t('fn_conciliacion_viandas', () => sb.rpc('fn_conciliacion_viandas', { p_local: null, p_desde: '2026-09-01', p_hasta: '2026-09-28' }))
await t('v_compra_resumen 50', () => sb.from('v_compra_resumen').select('id, total', { count: 'exact' }).order('fecha', { ascending: false }).range(0, 49))
await t('fn_compras_resumen', () => sb.rpc('fn_compras_resumen', { p_desde: '2026-01-01', p_hasta: '2026-09-28' }))
await t('v_conteo_resumen 50', () => sb.from('v_conteo_resumen').select('id, pct_diferencia').limit(50))
