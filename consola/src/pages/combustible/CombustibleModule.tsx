import { useEffect, useState, type ReactNode } from 'react'
import DashboardCombustible from './DashboardCombustible'
import FacturacionCombustiblePage from './FacturacionCombustiblePage'
import FusionConfigPage from './FusionConfigPage'
import PistaQRPage from './PistaQRPage'

type SubModulo =
  | 'home'
  | 'dashboard'
  | 'facturacion'
  | 'ventas'
  | 'turnos'
  | 'pisteros'
  | 'reportes'
  | 'configuracion'
  | 'pista'

interface SubModuloCard {
  id: SubModulo
  icon: string
  nombre: string
  shortNombre: string
  descripcion: string
  color: string
  disponible: boolean
  soloSuperusuario?: boolean
}

const SUBMODULOS: SubModuloCard[] = [
  {
    id: 'dashboard',
    icon: 'DB',
    nombre: 'Dashboard en vivo',
    shortNombre: 'Dashboard',
    descripcion: 'Estado en tiempo real: bombas, tanques, alarmas y ventas del dia.',
    color: '#22c55e',
    disponible: true,
  },
  {
    id: 'facturacion',
    icon: 'FE',
    nombre: 'Facturacion',
    shortNombre: 'Facturacion',
    descripcion: 'Tarjetas por venta pendiente para modelar borradores FE antes de integrarlos con FE CRC.',
    color: '#f97316',
    disponible: true,
  },
  {
    id: 'ventas',
    icon: 'VT',
    nombre: 'Registro de ventas',
    shortNombre: 'Ventas',
    descripcion: 'Historial de transacciones con filtros por fecha, turno, pistero y forma de pago.',
    color: '#f59e0b',
    disponible: false,
  },
  {
    id: 'turnos',
    icon: 'TR',
    nombre: 'Turnos',
    shortNombre: 'Turnos',
    descripcion: 'Cierre y resumen de ventas por turno de trabajo.',
    color: '#3b82f6',
    disponible: false,
  },
  {
    id: 'pisteros',
    icon: 'PI',
    nombre: 'Pisteros',
    shortNombre: 'Pisteros',
    descripcion: 'Desempeno y totales por pistero: litros, monto y transacciones.',
    color: '#a855f7',
    disponible: false,
  },
  {
    id: 'reportes',
    icon: 'RP',
    nombre: 'Reportes',
    shortNombre: 'Reportes',
    descripcion: 'Analisis configurables, comparativos y exportaciones a Excel o PDF.',
    color: '#06b6d4',
    disponible: false,
  },
  {
    id: 'pista',
    icon: 'QR',
    nombre: 'Pista QR',
    shortNombre: 'Pista QR',
    descripcion: 'Genera codigos QR por bomba para que los pisteros se registren desde el celular.',
    color: '#f59e0b',
    disponible: true,
    soloSuperusuario: true,
  },
  {
    id: 'configuracion',
    icon: 'CF',
    nombre: 'Configuracion',
    shortNombre: 'Config',
    descripcion: 'Conexiones Fusion, dispensadores, grados, precios y parametros del sistema.',
    color: '#94a3b8',
    disponible: true,
    soloSuperusuario: true,
  },
]

const BREADCRUMB_LABEL: Partial<Record<SubModulo, string>> = {
  dashboard: 'Dashboard en vivo',
  facturacion: 'Facturacion',
  ventas: 'Registro de ventas',
  turnos: 'Turnos',
  pisteros: 'Pisteros',
  reportes: 'Reportes',
  pista: 'Pista QR',
  configuracion: 'Configuracion',
}

interface Props {
  empresaId: number
  onHome: () => void
  isSuperusuario?: boolean
  setNavbarExtra?: (node: ReactNode) => void
}

const NAVBAR_EXTRA_META: Partial<Record<SubModulo, string>> = {
  dashboard: 'Tiempo real Fusion',
  facturacion: 'Borradores FE y documentos del POS',
  ventas: 'Vista operativa',
  turnos: 'Vista operativa',
  pisteros: 'Vista operativa',
  reportes: 'Vista operativa',
  pista: 'QR por bomba para celular del pistero',
  configuracion: 'Solo superusuario',
}

export default function CombustibleModule({ empresaId, onHome, isSuperusuario = false, setNavbarExtra }: Props) {
  const [activo, setActivo] = useState<SubModulo>('home')
  const [facturacionVista, setFacturacionVista] = useState<'bandeja' | 'borrador'>('bandeja')
  const showFacturacionActions = activo === 'facturacion' && facturacionVista === 'bandeja'
  const contentTopOffset = 72

  useEffect(() => {
    if (!setNavbarExtra) return undefined
    if (activo === 'home') {
      setNavbarExtra(null)
      return () => setNavbarExtra(null)
    }

    setNavbarExtra(
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '6px 10px',
            borderRadius: 999,
            border: '1px solid rgba(34,197,94,.24)',
            background: 'rgba(34,197,94,.12)',
            color: '#bbf7d0',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
          }}
        >
          {BREADCRUMB_LABEL[activo] || 'Combustible'}
        </span>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>
          {NAVBAR_EXTRA_META[activo] || 'Operacion del modulo combustible'}
        </span>
      </div>
    )

    return () => setNavbarExtra(null)
  }, [activo, setNavbarExtra])

  useEffect(() => {
    const onFacturacionView = (evt: Event) => {
      const view = (evt as CustomEvent<{ view?: 'bandeja' | 'borrador' }>).detail?.view
      if (view === 'bandeja' || view === 'borrador') setFacturacionVista(view)
    }
    window.addEventListener('combustible:facturacion-view', onFacturacionView as EventListener)
    return () => window.removeEventListener('combustible:facturacion-view', onFacturacionView as EventListener)
  }, [])

  if (activo === 'home') {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-6 font-mono">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={onHome}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors mr-1"
            >
              Home /
            </button>
            <span className="text-3xl">FC</span>
            <h1 className="text-2xl font-bold text-white tracking-tight">Combustible</h1>
          </div>
          <p className="text-gray-500 text-sm ml-12">
            Control de despacho, inventario y facturacion de combustible
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
          {SUBMODULOS.filter((sm) => !sm.soloSuperusuario || isSuperusuario).map((sm) => (
            <button
              key={sm.id}
              onClick={() => sm.disponible && setActivo(sm.id)}
              disabled={!sm.disponible}
              className={`
                text-left rounded-2xl border p-5 flex flex-col gap-3 transition-all
                ${sm.disponible
                  ? 'bg-gray-900 border-gray-700 hover:border-opacity-80 hover:scale-[1.02] cursor-pointer'
                  : 'bg-gray-900/40 border-gray-800 cursor-not-allowed opacity-50'
                }
              `}
              style={sm.disponible ? { borderColor: `${sm.color}55` } : {}}
            >
              <div className="flex items-start justify-between">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold"
                  style={{ background: `${sm.color}22`, color: sm.color }}
                >
                  {sm.icon}
                </div>
                {!sm.disponible && (
                  <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full mt-1">
                    Proximamente
                  </span>
                )}
                {sm.disponible && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full mt-1 font-medium"
                    style={{ background: `${sm.color}22`, color: sm.color }}
                  >
                    Disponible
                  </span>
                )}
              </div>

              <div>
                <h2
                  className="text-base font-semibold mb-1"
                  style={{ color: sm.disponible ? sm.color : '#6b7280' }}
                >
                  {sm.nombre}
                </h2>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {sm.descripcion}
                </p>
              </div>

              {sm.disponible && (
                <div className="flex justify-end">
                  <span className="text-xs font-medium" style={{ color: sm.color }}>
                    Abrir {'->'}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-950 text-white font-mono"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        className="bg-gray-900 border-b border-gray-800 px-3 sm:px-4 py-2"
        style={{
          flexShrink: 0,
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 55,
        }}
      >
        <div className="overflow-x-auto touch-pan-x [-webkit-overflow-scrolling:touch]">
          <div className="flex items-center justify-between gap-4 min-w-max">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActivo('home')}
                className="inline-flex h-11 min-w-[140px] items-center justify-center text-sm sm:text-base font-semibold text-slate-200 hover:text-white transition-colors px-4 rounded whitespace-nowrap border border-slate-600 bg-slate-900/60 hover:bg-slate-800"
              >
                VOLVER
              </button>
              {showFacturacionActions ? (
                <>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('combustible:facturacion-refrescar'))}
                    className="inline-flex h-11 min-w-[140px] items-center justify-center text-sm sm:text-base font-semibold text-gray-200 hover:text-white transition-colors px-4 rounded whitespace-nowrap border border-gray-600 bg-gray-900/50 hover:bg-gray-800"
                  >
                    REFRESCAR
                  </button>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('combustible:facturacion-facturar'))}
                    className="inline-flex h-11 min-w-[140px] items-center justify-center text-sm sm:text-base font-semibold text-emerald-100 transition-colors px-4 rounded whitespace-nowrap border border-emerald-500/70 bg-emerald-800/55 hover:bg-emerald-700/65"
                  >
                    FACTURAR
                  </button>
                </>
              ) : null}
            </div>
            <div className="text-sm sm:text-base font-semibold tracking-wide text-slate-100 text-right shrink-0">
              {activo === 'facturacion' ? 'FE FACTURACION' : (BREADCRUMB_LABEL[activo] || 'COMBUSTIBLE').toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, marginTop: contentTopOffset, overflowY: 'auto' }}>
        {activo === 'dashboard' && <DashboardCombustible empresaId={empresaId} />}
        {activo === 'facturacion' && <FacturacionCombustiblePage empresaId={empresaId} />}
        {activo === 'ventas' && <PlaceholderPage nombre="Registro de ventas" icon="VT" />}
        {activo === 'turnos' && <PlaceholderPage nombre="Turnos" icon="TR" />}
        {activo === 'pisteros' && <PlaceholderPage nombre="Pisteros" icon="PI" />}
        {activo === 'reportes' && <PlaceholderPage nombre="Reportes" icon="RP" />}
        {activo === 'pista'          && isSuperusuario && <PistaQRPage empresaId={empresaId} />}
        {activo === 'pista'          && !isSuperusuario && <PlaceholderPage nombre="Pista QR" icon="QR" />}
        {activo === 'configuracion' && isSuperusuario && <FusionConfigPage empresaId={empresaId} />}
        {activo === 'configuracion' && !isSuperusuario && <PlaceholderPage nombre="Configuracion" icon="CF" />}
      </div>
    </div>
  )
}

function PlaceholderPage({ nombre, icon }: { nombre: string; icon: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-gray-600">
      <span className="text-5xl mb-4">{icon}</span>
      <h2 className="text-lg font-semibold text-gray-500 mb-2">{nombre}</h2>
      <p className="text-sm">En construccion</p>
    </div>
  )
}
