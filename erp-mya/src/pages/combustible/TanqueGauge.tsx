// ============================================================
// MYA ERP — TanqueGauge circular
// Reemplaza el componente TanqueGauge en DashboardCombustible.tsx
// ============================================================


interface TanqueInfo {
  nombre: string
  capacidad: number
  color: string        // color del líquido
  colorBorde: string   // borde exterior
  colorFondo: string   // fondo oscuro
  colorTexto: string   // texto central
  colorOla: string     // ola superior
}

// Al inicio de TanqueGauge.tsx, agregar:
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
const TANQUE_CONFIG: Record<number, TanqueInfo> = {
  1: { nombre: 'Super',   capacidad: 30283, color: '#a855f7', colorBorde: '#7c3aed', colorFondo: '#1a1a2e', colorTexto: '#e9d5ff', colorOla: '#c084fc' },
  2: { nombre: 'Regular', capacidad: 30283, color: '#22c55e', colorBorde: '#16a34a', colorFondo: '#0a1a0a', colorTexto: '#dcfce7', colorOla: '#4ade80' },
  3: { nombre: 'Diesel',  capacidad: 37854, color: '#38bdf8', colorBorde: '#0284c7', colorFondo: '#0a1422', colorTexto: '#e0f2fe', colorOla: '#7dd3fc' },
  4: { nombre: 'Gas LP',  capacidad: 14000, color: '#f59e0b', colorBorde: '#d97706', colorFondo: '#1a1200', colorTexto: '#fef3c7', colorOla: '#fbbf24' },
}

function TanqueCircular({ tanque }: { tanque: NivelTanque }) {
  const cfg = TANQUE_CONFIG[tanque.tank_id] || {
    nombre: `Tanque ${tanque.tank_id}`, capacidad: 30000,
    color: '#6b7280', colorBorde: '#4b5563', colorFondo: '#111',
    colorTexto: '#f3f4f6', colorOla: '#9ca3af'
  }

  const online   = tanque.probe_status === '3'
  const prodVol  = tanque.prod_vol  || 0
  const waterVol = tanque.water_vol > 0 ? tanque.water_vol : 0
  const temp     = tanque.prod_temp > -100 ? tanque.prod_temp : null
  const pct      = Math.min(100, Math.max(0, (prodVol / cfg.capacidad) * 100))

  // Arc SVG: circunferencia del círculo r=40 → 2π×40 ≈ 251
  // Usamos 220 de los 251 (dejamos 31 abajo para el gap visual)
  const ARC_TOTAL = 220
  const arcFill   = (pct / 100) * ARC_TOTAL
  const arcEmpty  = ARC_TOTAL - arcFill
  const OFFSET    = -15.5   // rotar para empezar en bottom-left

  // Posición Y del líquido (top del rect) — r=46, center=60
  const liquidH  = (pct / 100) * 92   // 92 = diámetro interior aprox
  const liquidY  = 60 + 46 - liquidH  // desde abajo hacia arriba

  const fmtVol = (n: number) =>
    new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 }).format(n)

  const colorWarning = pct < 20 ? '#ef4444' : pct < 35 ? '#f59e0b' : cfg.color
  const colorBordeWarning = pct < 20 ? '#b91c1c' : pct < 35 ? '#b45309' : cfg.colorBorde

  return (
    <div style={{
      background: 'var(--color-background-secondary)',
      border: '1px solid var(--color-border-tertiary)',
      borderRadius: '16px',
      padding: '16px 12px 12px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
    }}>
      {/* SVG circular */}
      <svg width="120" height="120" viewBox="0 0 120 120">
        <defs>
          <clipPath id={`clip-tank-${tanque.tank_id}`}>
            <circle cx="60" cy="60" r="46"/>
          </clipPath>
        </defs>

        {/* Fondo del tanque */}
        <circle cx="60" cy="60" r="46" fill={cfg.colorFondo} stroke="#2a2a3a" strokeWidth="1.5"/>

        {online && prodVol > 0 ? (
          <>
            {/* Líquido */}
            <rect
              x="14" y={liquidY} width="92" height={liquidH + 10}
              fill={colorWarning} opacity={0.82}
              clipPath={`url(#clip-tank-${tanque.tank_id})`}
            />
            {/* Ola superior */}
            <path
              d={`M14 ${liquidY} Q30 ${liquidY-5} 46 ${liquidY} Q62 ${liquidY+5} 78 ${liquidY} Q94 ${liquidY-5} 106 ${liquidY} L106 ${liquidY-3} Q94 ${liquidY-8} 78 ${liquidY-3} Q62 ${liquidY+2} 46 ${liquidY-3} Q30 ${liquidY-8} 14 ${liquidY-3}Z`}
              fill={cfg.colorOla} opacity={0.55}
              clipPath={`url(#clip-tank-${tanque.tank_id})`}
            />
          </>
        ) : !online ? (
          <>
            <line x1="42" y1="42" x2="78" y2="78" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" opacity={0.7}/>
            <line x1="78" y1="42" x2="42" y2="78" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" opacity={0.7}/>
          </>
        ) : null}

        {/* Borde exterior */}
        <circle cx="60" cy="60" r="46" fill="none" stroke={colorBordeWarning} strokeWidth="2.5" opacity={0.8}/>
        <circle cx="60" cy="60" r="52" fill="none" stroke={colorBordeWarning} strokeWidth="0.8" opacity={0.3}/>

        {/* Arc track */}
        <circle cx="60" cy="60" r="40" fill="none"
          stroke={online ? '#1a1a2a' : '#1a0a0a'}
          strokeWidth="5"
          strokeDasharray={`${ARC_TOTAL} 31`}
          strokeDashoffset={OFFSET}
          strokeLinecap="round"
        />

        {/* Arc fill animado */}
        {online && (
          <circle cx="60" cy="60" r="40" fill="none"
            stroke={colorWarning}
            strokeWidth="5"
            strokeDasharray={`${arcFill} ${arcEmpty + 31}`}
            strokeDashoffset={OFFSET}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1s ease-out' }}
          />
        )}

        {/* Texto central */}
        {online ? (
          <>
            <text x="60" y="54" textAnchor="middle" fontSize="21" fontWeight="700"
              fill={cfg.colorTexto} fontFamily="monospace">
              {Math.round(pct)}%
            </text>
            <text x="60" y="70" textAnchor="middle" fontSize="9"
              fill={cfg.colorOla} fontFamily="sans-serif">
              {cfg.nombre}
            </text>
          </>
        ) : (
          <text x="60" y="92" textAnchor="middle" fontSize="9"
            fill="#f87171" fontFamily="sans-serif">
            Sin sonda
          </text>
        )}

        {/* Indicador online/offline */}
        <circle cx="60" cy="102" r="3"
          fill={online ? '#22c55e' : '#ef4444'}
          style={online ? {} : { animation: 'pulse 1s infinite' }}
        />
      </svg>

      {/* Info */}
      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
        Tanque {tanque.tank_id} — {cfg.nombre}
      </div>

      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
        {online ? `${fmtVol(prodVol)} / ${fmtVol(cfg.capacidad)} L` : 'Sin lectura'}
      </div>

      {/* Stats */}
      <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
        {[
          { label: 'Temp', val: temp != null ? `${temp.toFixed(1)}°C` : '—' },
          { label: 'Agua', val: waterVol > 0 ? `${fmtVol(waterVol)} L` : '—' },
          { label: 'TC Vol', val: tanque.tc_vol > 0 ? `${fmtVol(tanque.tc_vol)} L` : '—' },
          { label: 'Ullage', val: tanque.prod_vol > 0 ? `${fmtVol(cfg.capacidad - prodVol)} L` : '—' },
        ].map(({ label, val }) => (
          <div key={label} style={{
            background: 'var(--color-background-tertiary)',
            borderRadius: '6px', padding: '4px 6px'
          }}>
            <div style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              {label}
            </div>
            <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
              {val}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default TanqueCircular