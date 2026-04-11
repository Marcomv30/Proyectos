// ============================================================
// MYA ERP — Dashboard Combustible
// React + TypeScript + Tailwind CSS
// Archivo: src/pages/combustible/DashboardCombustible.tsx
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../../supabase'
import TanqueCircular from './TanqueGauge'

// ─── Helper: llamadas autenticadas al servidor Node ───────────
async function apiFusion<T>(path: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const resp = await fetch(path, {
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `Error ${resp.status}`)
  }
  return resp.json() as Promise<T>
}

interface Venta {
  sale_id: number
  pump_id: number
  hose_id: number
  grade_id: number
  volume: number
  money: number
  ppu: number
  end_at: string | null
  payment_type: string
  payment_info: string | null
  attendant_id: string | null
}

interface NivelTanque {
  tank_id: number
  prod_vol: number
  prod_height: number
  tc_vol: number
  water_vol: number
  water_height: number
  prod_temp: number
  probe_status: string
  leido_at: string
}

interface Alarma {
  alarm_type: string
  location_type: string
  location_id: string
  severity: string
  alarm_at: string
  ack_user: string | null
}

interface ResumenDia {
  pump_id: number
  bomba: string
  combustible: string
  transacciones: number
  litros_total: number
  monto_total: number
}

interface ResumenPago {
  forma_pago: string
  transacciones: number
  litros_total: number
  monto_total: number
}

interface FusionStatus {
  ok: boolean
  empresa_id: number
  instancia_activa: boolean
  instancia_saludable: boolean
  sync_estado: 'pg' | 'http' | 'disconnected' | string
  active_tunnel_port: number | null
  ultima_sync: string | null
  ultima_ejecucion: string | null
  ultimo_error_sync: string | null
  sync_en_curso: boolean
}

type PumpStatus = 'IDLE' | 'CALLING' | 'AUTHORIZED' | 'STARTING' | 'FUELLING' | 'CLOSED' | 'ERROR' | 'UNKNOWN'

interface PumpState {
  pump_id: number
  status: PumpStatus
  hose_id: string | null
  grade: string | null
  volume: number | null
  money: number | null
  ppu: number | null
  ts: string | null
}

const STATUS_LABEL: Record<PumpStatus, string> = {
  IDLE:       'Disponible',
  CALLING:    'Llamando',
  AUTHORIZED: 'Autorizado',
  STARTING:   'Iniciando',
  FUELLING:   'Despachando',
  CLOSED:     'Cerrado',
  ERROR:      'Error',
  UNKNOWN:    '—',
}

const STATUS_COLOR: Record<PumpStatus, { bg: string; text: string; dot: string }> = {
  IDLE:       { bg: '#052e16', text: '#4ade80', dot: '#22c55e' },
  CALLING:    { bg: '#1e3a5f', text: '#7dd3fc', dot: '#38bdf8' },
  AUTHORIZED: { bg: '#2e1065', text: '#c4b5fd', dot: '#a78bfa' },
  STARTING:   { bg: '#422006', text: '#fcd34d', dot: '#f59e0b' },
  FUELLING:   { bg: '#14532d', text: '#86efac', dot: '#22c55e' },
  CLOSED:     { bg: '#1c1917', text: '#78716c', dot: '#57534e' },
  ERROR:      { bg: '#450a0a', text: '#fca5a5', dot: '#ef4444' },
  UNKNOWN:    { bg: '#111827', text: '#6b7280', dot: '#374151' },
}

const PAGO_COLOR: Record<string, { bg: string; text: string }> = {
  CASH:   { bg: '#052e16', text: '#4ade80' },
  CARD:   { bg: '#1e3a5f', text: '#7dd3fc' },
  FLEET:  { bg: '#422006', text: '#fcd34d' },
  CREDIT: { bg: '#2e1065', text: '#c4b5fd' },
}

const PAGE_SIZE = 20
const DEFAULT_CR_TIME_ZONE = 'America/Costa_Rica'

const API_BASE = process.env.REACT_APP_API_URL || ''

const fmt = (n: number, dec = 2) =>
  new Intl.NumberFormat('es-CR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n)

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', minimumFractionDigits: 0 }).format(n)

const resolveTimeZone = (tz?: string | null) => {
  const candidate = String(tz || '').trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_CR_TIME_ZONE
  try {
    Intl.DateTimeFormat('es-CR', { timeZone: candidate }).format(new Date())
    return candidate
  } catch {
    return DEFAULT_CR_TIME_ZONE
  }
}

const safeDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [year, month, day] = iso.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
  }
  try { const d = new Date(iso); return isNaN(d.getTime()) ? null : d } catch { return null }
}

const fmtTime = (iso: string | null | undefined, timeZone?: string | null) => {
  const d = safeDate(iso)
  return d ? d.toLocaleTimeString('es-CR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: resolveTimeZone(timeZone),
  }) : '—'
}

const fmtDate = (iso: string | null | undefined, timeZone?: string | null) => {
  const d = safeDate(iso)
  return d ? d.toLocaleDateString('es-CR', { timeZone: resolveTimeZone(timeZone) }) : '—'
}

const COMBUSTIBLE_COLORS: Record<string, string> = {
  'Regular': '#22c55e',
  'Super':   '#a855f7',
  'Diesel':  '#38bdf8',
  'Gas LP':  '#f59e0b',
}

function useFusionWS(
  empresaId: number,
  onMessage: (event: string, data: unknown, ts?: string) => void,
  onStatusChange?: (connected: boolean) => void,
) {
  const ws = useRef<WebSocket | null>(null)
  useEffect(() => {
    let disposed = false
    let retry = 0
    const resolveWsUrl = async () => {
      const apiBase = process.env.REACT_APP_API_URL
      if (apiBase) return apiBase.replace(/^http/, 'ws') + '/ws/combustible'
      try {
        const resp = await fetch('/api/runtime')
        const body = await resp.json() as { port?: number }
        if (body?.port) {
          return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:${body.port}/ws/combustible`
        }
      } catch {}
      return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/combustible`
    }
    const connect = async () => {
      const wsUrl = await resolveWsUrl()
      if (disposed) return
      ws.current = new WebSocket(wsUrl)
      ws.current.onmessage = (e) => {
        try {
          const { empresa_id, event, data, ts } = JSON.parse(e.data)
          // Filtrar: solo procesar mensajes de esta empresa (o broadcast global empresa_id=null)
          if (empresa_id !== null && empresa_id !== undefined && empresa_id !== empresaId) return
          onMessage(event, data, ts)
        } catch {}
      }
      ws.current.onopen = () => {
        retry = 0
        onStatusChange?.(true)
      }
      ws.current.onerror = () => {
        onStatusChange?.(false)
      }
      ws.current.onclose = () => {
        onStatusChange?.(false)
        if (disposed) return
        const wait = Math.min(3000 + retry * 1000, 10000)
        retry += 1
        setTimeout(() => { void connect() }, wait)
      }
    }
    void connect()
    return () => {
      disposed = true
      onStatusChange?.(false)
      ws.current?.close()
    }
  }, [empresaId, onStatusChange]) // eslint-disable-line react-hooks/exhaustive-deps
}

function KpiCard({ label, value, sub, color = '#22c55e' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-gray-400 text-xs uppercase tracking-wider">{label}</span>
      <span className="text-2xl font-bold" style={{ color }}>{value}</span>
      {sub && <span className="text-gray-500 text-xs">{sub}</span>}
    </div>
  )
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400'}`}
      style={{ boxShadow: ok ? '0 0 6px #4ade80' : '0 0 6px #f87171' }} />
  )
}

function PagoBadge({ tipo }: { tipo: string }) {
  const col = PAGO_COLOR[tipo] || { bg: '#1c1917', text: '#9ca3af' }
  return (
    <span className="px-2 py-0.5 rounded text-xs font-semibold"
      style={{ background: col.bg, color: col.text }}>
      {tipo}
    </span>
  )
}

function MobileScrollHint({ label = 'Desliza horizontalmente para ver mas columnas' }: { label?: string }) {
  return (
    <div className="px-4 pt-2 pb-1 text-[11px] text-gray-500 sm:hidden">
      {label}
    </div>
  )
}

interface DashboardCombustibleProps {
  empresaId: number
}

export default function DashboardCombustible({ empresaId }: DashboardCombustibleProps) {
  const [ventas, setVentas]         = useState<Venta[]>([])
  const [tanques, setTanques]       = useState<NivelTanque[]>([])
  const [alarmas, setAlarmas]       = useState<Alarma[]>([])
  const [resumen, setResumen]       = useState<ResumenDia[]>([])
  const [resumenPago, setResumenPago] = useState<ResumenPago[]>([])
  const [bombas, setBombas]         = useState<Record<number, PumpState>>(() => {
    const init: Record<number, PumpState> = {}
    for (let i = 1; i <= 10; i++) init[i] = { pump_id: i, status: 'UNKNOWN', hose_id: null, grade: null, volume: null, money: null, ppu: null, ts: null }
    return init
  })
  const [fechaFiltro, setFechaFiltro] = useState(() => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: resolveTimeZone(null),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return `${byType.year}-${byType.month}-${byType.day}`
  })
  const [wsConectado, setWsConectado]     = useState(false)
  const [fusionStatus, setFusionStatus]   = useState<FusionStatus | null>(null)
  const [ultimaSync, setUltimaSync]       = useState<string | null>(null)
  const [tiempoServidor, setTiempoServidor] = useState<string | null>(null)
  const [empresaTimeZone, setEmpresaTimeZone] = useState<string>(() => resolveTimeZone(null))
  const [loading, setLoading]         = useState(true)

  // Catálogos
  const [dispensadoresMap, setDispensadoresMap] = useState<Record<number, string>>({})
  const [gradosMap, setGradosMap]               = useState<Record<number, string>>({})
  const [pisterosMap, setPisterosMap]           = useState<Record<string, string>>({})

  // Paginación y búsqueda
  const [pagina, setPagina]       = useState(0)
  const [busqueda, setBusqueda]   = useState('')
  const [ventasExpandidas, setVentasExpandidas] = useState(false)
  const [resumenExpandido, setResumenExpandido] = useState(false)

  const fechaActualEnZona = useCallback((tz?: string | null) => {
    const zone = resolveTimeZone(tz)
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return `${byType.year}-${byType.month}-${byType.day}`
  }, [])

  // Cargar catálogos una sola vez
  useEffect(() => {
    supabase.from('dispensadores').select('pump_id, descripcion').eq('empresa_id', empresaId)
      .then(({ data }) => {
        if (data) setDispensadoresMap(Object.fromEntries(data.map(d => [d.pump_id, d.descripcion])))
      })
    supabase.from('grados_combustible').select('grade_id, nombre').eq('empresa_id', empresaId)
      .then(({ data }) => {
        if (data) setGradosMap(Object.fromEntries(data.map(g => [g.grade_id, g.nombre])))
      })
    supabase.from('comb_dispositivos_identidad').select('attendant_id, operador_nombre, alias').eq('empresa_id', empresaId).eq('estado', 'activo')
      .then(({ data }) => {
        if (data) setPisterosMap(Object.fromEntries(
          data.filter(d => d.attendant_id).map(d => [d.attendant_id!, d.operador_nombre || d.alias || d.attendant_id!])
        ))
      })
    supabase.rpc('get_empresa_parametros', { p_empresa_id: empresaId })
      .then(({ data }) => {
        const zona = String(data?.varios?.zona_horaria || '').trim()
        const resolved = resolveTimeZone(zona || null)
        setEmpresaTimeZone(resolved)
        setFechaFiltro(fechaActualEnZona(resolved))
      }, () => {
        setEmpresaTimeZone(resolveTimeZone(null))
      })
  }, [empresaId, fechaActualEnZona])

  const cargarVentas = useCallback(async () => {
    if (!fechaFiltro || fechaFiltro.length < 10) return
    try {
      const data = await apiFusion<Venta[]>(
        `${API_BASE}/api/fusion/ventas?empresa_id=${empresaId}&fecha=${fechaFiltro}`
      )
      setVentas(data.sort((a, b) => b.sale_id - a.sale_id))
      setUltimaSync(new Date().toISOString())
    } catch {}
  }, [fechaFiltro, empresaId])

  const cargarTanques = useCallback(async () => {
    const { data } = await supabase
      .from('v_niveles_tanque_actual')
      .select('*')
      .eq('empresa_id', empresaId)
    if (data) setTanques(data)
  }, [empresaId])

  const cargarEstadoFusion = useCallback(async () => {
    try {
      const data = await apiFusion<FusionStatus>(
        `${API_BASE}/api/combustible/status?empresa_id=${empresaId}`
      )
      setFusionStatus(data)
      if (data.ultima_sync) setUltimaSync(data.ultima_sync)
      if (data.ultima_ejecucion) setTiempoServidor(data.ultima_ejecucion)
    } catch {}
  }, [empresaId])

  const cargarAlarmas = useCallback(async () => {
    const { data } = await supabase
      .from('alarmas_fusion')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('alarm_at', { ascending: false })
      .limit(20)
    if (data) setAlarmas(data)
  }, [empresaId])

  useEffect(() => {
    setPagina(0)
    setBusqueda('')
    setLoading(true)
    Promise.all([cargarVentas(), cargarTanques(), cargarAlarmas(), cargarEstadoFusion()])
      .finally(() => setLoading(false))
  }, [cargarVentas, cargarTanques, cargarAlarmas, cargarEstadoFusion]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh ventas cada 15s (syncVentas no escribe a Supabase → sin WS nueva_venta)
  useEffect(() => {
    const id = setInterval(() => {
      void cargarVentas()
      void cargarEstadoFusion()
    }, 15000)
    return () => clearInterval(id)
  }, [cargarVentas, cargarEstadoFusion])

  // Resumen por bomba/combustible — derivado de ventas
  useEffect(() => {
    const map: Record<string, ResumenDia> = {}
    for (const v of ventas) {
      const key = `${v.pump_id}_${v.grade_id}`
      if (!map[key]) {
        map[key] = {
          pump_id: v.pump_id,
          bomba: dispensadoresMap[v.pump_id] || `Bomba ${v.pump_id}`,
          combustible: gradosMap[v.grade_id] || `Grade ${v.grade_id}`,
          transacciones: 0,
          litros_total: 0,
          monto_total: 0,
        }
      }
      map[key].transacciones++
      map[key].litros_total += v.volume
      map[key].monto_total  += v.money
    }
    setResumen(Object.values(map).sort((a, b) => b.monto_total - a.monto_total))
  }, [ventas, dispensadoresMap, gradosMap])

  // Resumen por forma de pago — derivado de ventas
  useEffect(() => {
    const map: Record<string, ResumenPago> = {}
    for (const v of ventas) {
      const tipo = (v.payment_type || 'CASH').trim()
      if (!map[tipo]) map[tipo] = { forma_pago: tipo, transacciones: 0, litros_total: 0, monto_total: 0 }
      map[tipo].transacciones++
      map[tipo].litros_total += v.volume
      map[tipo].monto_total  += v.money
    }
    setResumenPago(Object.values(map).sort((a, b) => b.monto_total - a.monto_total))
  }, [ventas])

  useFusionWS(empresaId, (event, data, ts) => {
    try { setUltimaSync(new Date().toISOString()); if (ts) setTiempoServidor(ts) } catch {}
    if (event === 'nueva_venta') {
      const d = data as { sale_id?: number }
      if (d?.sale_id) {
        apiFusion<Venta>(`${API_BASE}/api/fusion/venta/${d.sale_id}?empresa_id=${empresaId}`)
          .then(v => setVentas(prev => [v, ...prev.filter(x => x.sale_id !== v.sale_id)]))
          .catch(() => {})
      }
    }
    if (event === 'niveles_tanque') setTanques(data as NivelTanque[])
    if (event === 'alarmas') {
      setAlarmas(prev => ([...(data as Alarma[]), ...prev]).slice(0, 20))
    }
    if (event === 'pump_status') {
      const p = data as PumpState
      setBombas(prev => ({ ...prev, [p.pump_id]: p }))
    }
    if (event === 'pump_delivery') {
      const p = data as PumpState
      setBombas(prev => ({
        ...prev,
        [p.pump_id]: { ...prev[p.pump_id], ...p }
      }))
    }
  }, setWsConectado)

  const totalLitros    = resumen.reduce((s, r) => s + (r.litros_total  || 0), 0)
  const totalMonto     = resumen.reduce((s, r) => s + (r.monto_total   || 0), 0)
  const totalTxns      = resumen.reduce((s, r) => s + (r.transacciones || 0), 0)
  const alarmasActivas = alarmas.filter(a => !a.ack_user).length
  const fusionDisponible = !!fusionStatus?.instancia_saludable || wsConectado
  const syncLabel = fusionStatus?.sync_en_curso
    ? 'Sincronizando...'
    : fusionDisponible
      ? `Sync ${ultimaSync ? fmtTime(ultimaSync, empresaTimeZone) : '...'}`
      : 'Sin conexión'
  const fusionClockLabel = tiempoServidor
    ? fmtTime(tiempoServidor, empresaTimeZone)
    : fusionStatus?.ultima_ejecucion
      ? fmtTime(fusionStatus.ultima_ejecucion, empresaTimeZone)
      : null

  // Resumen por producto — calculado desde resumen (v_ventas_dia), igual que los KPIs
  const resumenProducto = Object.values(
    resumen.reduce((acc, r) => {
      const nombre = r.combustible || 'Sin nombre'
      if (!acc[nombre]) acc[nombre] = { nombre, transacciones: 0, litros: 0, monto: 0 }
      acc[nombre].transacciones += r.transacciones || 0
      acc[nombre].litros        += r.litros_total  || 0
      acc[nombre].monto         += r.monto_total   || 0
      return acc
    }, {} as Record<string, { nombre: string; transacciones: number; litros: number; monto: number }>)
  ).sort((a, b) => b.monto - a.monto)

  // Filtrar y paginar
  const ventasFiltradas = busqueda.trim()
    ? ventas.filter(v => String(v.sale_id).includes(busqueda.trim()))
    : ventas
  const totalPaginas = Math.ceil(ventasFiltradas.length / PAGE_SIZE)
  const ventasPagina = ventasFiltradas.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE)

  const handleBusqueda = (val: string) => {
    setBusqueda(val)
    setPagina(0)
  }

  return (
    <div className="bg-gray-950 text-white p-4 font-mono">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-green-400 tracking-tight">MYA · Control Combustible</h1>
          <p className="text-gray-500 text-xs mt-0.5">Fusion API · {fmtDate(fechaFiltro, empresaTimeZone)}</p>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="date" value={fechaFiltro}
            onChange={e => setFechaFiltro(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-green-500"
          />
          <div className="flex items-center gap-2 text-xs">
            <StatusDot ok={fusionDisponible} />
            <span className="text-gray-500">
              {syncLabel}
            </span>
            {fusionClockLabel && (
              <span className="text-gray-600 border-l border-gray-700 pl-2 ml-1">
                Fusion: <span className="text-gray-400">{fusionClockLabel}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Litros despachados" value={fmt(totalLitros, 0) + ' L'} sub="Total del día" color="#22c55e" />
        <KpiCard label="Monto total" value={fmtMoney(totalMonto)} sub="Todas las bombas" color="#f59e0b" />
        <KpiCard label="Transacciones" value={String(totalTxns)} sub={`${ventas.length} en pantalla`} color="#3b82f6" />
        <KpiCard
          label="Alarmas activas" value={String(alarmasActivas)}
          sub={alarmasActivas > 0 ? 'Requiere atención' : 'Sin alertas'}
          color={alarmasActivas > 0 ? '#ef4444' : '#22c55e'}
        />
      </div>

      {/* ── Resumen por producto ── */}
      {resumenProducto.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {resumenProducto.map(p => {
            const color = COMBUSTIBLE_COLORS[p.nombre] || '#9ca3af'
            return (
              <div key={p.nombre} className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                  <span className="text-sm font-semibold uppercase tracking-wider" style={{ color }}>{p.nombre}</span>
                </div>
                <span className="text-2xl font-bold text-white leading-none">{fmtMoney(p.monto)}</span>
                <div className="flex items-center justify-between">
                  <span className="text-base text-gray-300 font-medium">{fmt(p.litros, 0)} L</span>
                  <span className="text-sm text-gray-500">{p.transacciones} txn</span>
                </div>
              </div>
            )
          })}
        </div>
      )}


      {/* ── Layout principal ── */}
      <div className="flex flex-col gap-4">

        {/* Tabla ventas */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">

          {/* Header con buscador, contador y toggle */}
          <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between gap-3">
            <button
              onClick={() => setVentasExpandidas(v => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-200 hover:text-white transition-colors"
            >
              <span className={`text-gray-500 text-xs transition-transform ${ventasExpandidas ? 'rotate-90' : ''}`}>▶</span>
              Ventas recientes
            </button>
            <div className="flex items-center gap-3 flex-1 justify-end">
              {ventasExpandidas && (
                <input
                  type="text"
                  placeholder="Buscar Sale#..."
                  value={busqueda}
                  onChange={e => handleBusqueda(e.target.value)}
                  className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1 text-xs text-gray-200 w-40 focus:outline-none focus:border-green-500 placeholder-gray-600"
                />
              )}
              <span className="text-xs text-gray-500 shrink-0">
                {ventasFiltradas.length} registro{ventasFiltradas.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {ventasExpandidas && (
            <>
              <MobileScrollHint />
              <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
                {loading ? (
                  <div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>
                ) : (
                  <table className="w-full min-w-[980px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-700 text-gray-500 text-xs uppercase tracking-wider">
                        <th className="px-4 py-3 text-left">Sale#</th>
                        <th className="px-4 py-3 text-left">Bomba</th>
                        <th className="px-4 py-3 text-left">Combustible</th>
                        <th className="px-4 py-3 text-right">Litros</th>
                        <th className="px-4 py-3 text-right">Monto</th>
                        <th className="px-4 py-3 text-right">PPU</th>
                        <th className="px-4 py-3 text-center">Pago</th>
                        <th className="px-4 py-3 text-left">Pistero</th>
                        <th className="px-4 py-3 text-right">Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventasPagina.map((v, i) => {
                        const combustible = gradosMap[v.grade_id]      || `Grade ${v.grade_id}`
                        const bomba       = dispensadoresMap[v.pump_id] || `Bomba ${v.pump_id}`
                        const color       = COMBUSTIBLE_COLORS[combustible] || '#9ca3af'
                        return (
                          <tr key={v.sale_id}
                            className={`border-b border-gray-800 hover:bg-gray-800 transition-colors ${i === 0 && pagina === 0 ? 'bg-gray-800/50' : ''}`}>
                            <td className="px-4 py-2.5 text-gray-400 font-mono">{v.sale_id}</td>
                            <td className="px-4 py-2.5 text-gray-200">
                              {bomba}
                              <span className="text-gray-600 ml-1 text-xs">/{v.hose_id}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="px-2 py-0.5 rounded text-xs font-semibold"
                                style={{ background: color + '22', color }}>
                                {combustible}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right text-green-400 font-medium">{fmt(v.volume, 3)}</td>
                            <td className="px-4 py-2.5 text-right text-amber-400 font-medium">{fmtMoney(v.money)}</td>
                            <td className="px-4 py-2.5 text-right text-gray-400">{fmt(v.ppu, 2)}</td>
                            <td className="px-4 py-2.5 text-center">
                              <PagoBadge tipo={v.payment_type || 'CASH'} />
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-400">
                              {(() => {
                                const codigo = v.attendant_id || v.payment_info || null
                                if (!codigo) return <span className="text-gray-700">—</span>
                                return pisterosMap[codigo] || codigo
                              })()}
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-500">{fmtTime(v.end_at, empresaTimeZone)}</td>
                          </tr>
                        )
                      })}
                      {ventasPagina.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-3 py-8 text-center text-gray-600">
                            {busqueda ? `Sin resultados para "${busqueda}"` : 'Sin ventas para esta fecha'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Paginación */}
              {totalPaginas > 1 && (
                <div className="px-4 py-2 border-t border-gray-700 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    Página {pagina + 1} de {totalPaginas}
                    {' · '}registros {pagina * PAGE_SIZE + 1}–{Math.min((pagina + 1) * PAGE_SIZE, ventasFiltradas.length)}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => setPagina(0)} disabled={pagina === 0}
                      className="px-2 py-1 text-xs rounded bg-gray-800 text-gray-400 disabled:opacity-30 hover:bg-gray-700 transition-colors">«</button>
                    <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0}
                      className="px-2 py-1 text-xs rounded bg-gray-800 text-gray-400 disabled:opacity-30 hover:bg-gray-700 transition-colors">‹ Ant</button>
                    <button onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))} disabled={pagina >= totalPaginas - 1}
                      className="px-2 py-1 text-xs rounded bg-gray-800 text-gray-400 disabled:opacity-30 hover:bg-gray-700 transition-colors">Sig ›</button>
                    <button onClick={() => setPagina(totalPaginas - 1)} disabled={pagina >= totalPaginas - 1}
                      className="px-2 py-1 text-xs rounded bg-gray-800 text-gray-400 disabled:opacity-30 hover:bg-gray-700 transition-colors">»</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Resumen por bomba */}
        {resumen.length > 0 && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700">
              <button
                onClick={() => setResumenExpandido(v => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-200 hover:text-white transition-colors"
              >
                <span className={`text-gray-500 text-xs transition-transform ${resumenExpandido ? 'rotate-90' : ''}`}>▶</span>
                Resumen por bomba
              </button>
            </div>
            {resumenExpandido && <MobileScrollHint label="Desliza para revisar el resumen completo" />}
            {resumenExpandido && <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-500">
                    <th className="px-3 py-2 text-left">Bomba</th>
                    <th className="px-3 py-2 text-left">Combustible</th>
                    <th className="px-3 py-2 text-right">Txns</th>
                    <th className="px-3 py-2 text-right">Litros</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.map((r, i) => {
                    const bomba = dispensadoresMap[r.pump_id] || r.bomba || `Bomba ${r.pump_id}`
                    return (
                      <tr key={i} className="border-b border-gray-800">
                        <td className="px-3 py-2 text-gray-300">{bomba}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded text-xs"
                            style={{ background: (COMBUSTIBLE_COLORS[r.combustible] || '#9ca3af') + '22',
                                     color: COMBUSTIBLE_COLORS[r.combustible] || '#9ca3af' }}>
                            {r.combustible}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-blue-400">{r.transacciones}</td>
                        <td className="px-3 py-2 text-right text-green-400">{fmt(r.litros_total, 0)} L</td>
                        <td className="px-3 py-2 text-right text-amber-400">{fmtMoney(r.monto_total)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>}
          </div>
        )}

        {/* Estado de bombas en tiempo real */}
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-200">Estado de surtidores</span>
            <span className="text-xs text-gray-500">Tiempo real · TCP Fusion</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-px bg-gray-700">
            {Object.values(bombas).map(b => {
              const st    = b.status as PumpStatus
              const col   = STATUS_COLOR[st] ?? STATUS_COLOR.UNKNOWN
              const label = STATUS_LABEL[st] ?? '—'
              const nombre = dispensadoresMap[b.pump_id] || `Bomba ${b.pump_id}`
              const grado  = b.grade ? (gradosMap[parseInt(b.grade)] || b.grade) : null
              return (
                <div key={b.pump_id} className="flex flex-col gap-1 p-3"
                  style={{ background: col.bg }}>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                      style={{ background: col.dot, boxShadow: `0 0 6px ${col.dot}` }} />
                    <span className="text-xs font-semibold text-gray-300 truncate">{nombre}</span>
                  </div>
                  <span className="text-sm font-bold" style={{ color: col.text }}>{label}</span>
                  {b.volume != null && b.volume > 0 && (
                    <div className="mt-0.5 space-y-0.5">
                      {grado && <span className="text-xs text-gray-400">{grado}{b.hose_id ? ` · M${b.hose_id}` : ''}</span>}
                      <div className="text-xs text-green-400 font-medium">{fmt(b.volume, 3)} L</div>
                      <div className="text-xs text-amber-400 font-medium">{fmtMoney(b.money ?? 0)}</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Tanques + Alarmas */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          <div className="xl:col-span-2">
            <h2 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Niveles de tanques</h2>
            {tanques.length === 0 ? (
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 text-center text-gray-600 text-sm">
                Sin datos de tanques
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {tanques.map(t => (
                  <TanqueCircular key={t.tank_id} tanque={t} />
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-xs text-gray-500 uppercase tracking-wider mb-3">
              Alarmas Fusion
              {alarmasActivas > 0 && (
                <span className="ml-2 bg-red-900 text-red-300 text-xs px-1.5 py-0.5 rounded-full">
                  {alarmasActivas} activa{alarmasActivas > 1 ? 's' : ''}
                </span>
              )}
            </h2>
            <div className="bg-gray-900 border border-gray-700 rounded-xl divide-y divide-gray-800">
              {alarmas.slice(0, 10).map((a, i) => (
                <div key={i} className="px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <StatusDot ok={!!a.ack_user} />
                        <span className="text-xs text-gray-300 font-medium truncate">
                          {a.alarm_type.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {a.location_type} {a.location_id} · {a.severity}
                      </div>
                    </div>
                    <span className="text-xs text-gray-600 shrink-0">{fmtDate(a.alarm_at, empresaTimeZone)}</span>
                  </div>
                  {a.ack_user && (
                    <div className="text-xs text-green-700 mt-0.5">ACK: {a.ack_user}</div>
                  )}
                </div>
              ))}
              {alarmas.length === 0 && (
                <div className="p-4 text-center text-gray-600 text-sm">Sin alarmas registradas</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
