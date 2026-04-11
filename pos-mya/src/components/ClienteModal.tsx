import type { RefObject } from 'react'
import { createPortal } from 'react-dom'

type Cliente = {
  id: number
  nombre: string
  identificacion: string
  email?: string
  telefono?: string
}

type ClienteCredito = {
  id: number
  codigo: string | null
  razon_social: string
  identificacion: string | null
  email: string | null
  telefono: string | null
}

type Props = {
  open: boolean
  cliTab: 'credito' | 'bitacora' | 'contado'
  cliSearchShake: boolean
  cliCreditoQ: string
  cliWarn: string
  cliCreditoLoading: boolean
  cliCreditoRows: ClienteCredito[]
  cliSeleccionado: Cliente | null
  cliEditEmail: string
  cliEditTelefono: string
  cliContadoCedula: string
  cliContadoConsultando: boolean
  cliContadoMhOk: boolean
  cliContadoMhMsg: string
  cliContadoNombre: string
  cliContadoEmail: string
  cliContadoTelefono: string
  cliSearchRef: RefObject<HTMLInputElement | null>
  cliContadoRef: RefObject<HTMLInputElement | null>
  onClose: () => void
  onSelectTab: (tab: 'credito' | 'contado') => void
  onCreditoChange: (value: string) => void
  onCreditoEnter: () => void | Promise<void>
  onClearCredito: () => void
  onSeleccionarClienteCredito: (cliente: ClienteCredito) => void
  onContadoCedulaChange: (value: string) => void
  onConsultarCedulaContado: () => void | Promise<void>
  onClearContadoCedula: () => void
  onContadoNombreChange: (value: string) => void
  onContadoEmailChange: (value: string) => void
  onContadoTelefonoChange: (value: string) => void
  onConfirmarClienteContado: () => void
  onCliEditEmailChange: (value: string) => void
  onCliEditTelefonoChange: (value: string) => void
  onCambiarSeleccion: () => void
  onAplicarClienteSeleccionado: () => void
}

export default function ClienteModal(props: Props) {
  if (!props.open) return null

  return createPortal(
    <div className="pos-cli-overlay" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="pos-cli-modal">
        <div className="pos-cli-header">
          <div className="pos-cli-title">Seleccionar cliente</div>
          <button className="pos-cli-close" onClick={props.onClose}>&times;</button>
        </div>
        <div className="pos-cli-tabs">
          <button className={`pos-cli-tab${props.cliTab === 'credito' ? ' active' : ''}`} onClick={() => props.onSelectTab('credito')}>Crédito</button>
          <button className={`pos-cli-tab${props.cliTab === 'contado' ? ' active' : ''}`} onClick={() => props.onSelectTab('contado')}>Cédula / Contado</button>
        </div>
        <div className="pos-cli-body">
          {props.cliTab === 'credito' && <>
            <div className="pos-cli-search-wrap">
              <input
                ref={props.cliSearchRef}
                className={`pos-cli-search${props.cliSearchShake ? ' warn' : ''}`}
                placeholder="Código, nombre o cédula (Enter para buscar)..."
                value={props.cliCreditoQ}
                onChange={(e) => props.onCreditoChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void props.onCreditoEnter() }}
                autoFocus
              />
              {props.cliCreditoQ && <button className="pos-cli-clear" onClick={props.onClearCredito}>&times;</button>}
            </div>
            {props.cliWarn && <div className="pos-cli-warn">{props.cliWarn}</div>}
            <div className="pos-cli-list">
              {props.cliCreditoLoading
                ? <div className="pos-cli-loading">Cargando...</div>
                : props.cliCreditoRows.length === 0
                  ? <div className="pos-cli-empty">No hay clientes a crédito{props.cliCreditoQ ? ' con ese criterio' : ''}</div>
                  : props.cliCreditoRows.map((c) => (
                    <div
                      key={c.id}
                      className="pos-cli-row"
                      style={props.cliSeleccionado?.id === c.id ? { background: 'rgba(59,130,246,0.15)', outline: '1px solid rgba(59,130,246,0.4)', outlineOffset: -1 } : undefined}
                      onClick={() => props.onSeleccionarClienteCredito(c)}
                    >
                      <div className="pos-cli-info">
                        <div className="pos-cli-name">{c.razon_social}</div>
                        <div className="pos-cli-sub">
                          {c.codigo && <><span style={{ color: '#7dd3fc', fontWeight: 700 }}>COD {c.codigo}</span><span style={{ margin: '0 6px', color: '#3a4e6e' }}>&middot;</span></>}
                          {c.identificacion && <span style={{ fontFamily: 'monospace' }}>{c.identificacion}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
            </div>
          </>}

          {props.cliTab === 'contado' && (
            <div className="pos-cli-manual">
              <div>
                <div className="pos-cli-field-label">Cédula / Identificación</div>
                {props.cliWarn && <div className="pos-cli-warn" style={{ margin: '0 0 8px' }}>{props.cliWarn}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <div className="pos-cli-search-wrap" style={{ padding: 0, flex: 1 }}>
                    <input
                      ref={props.cliContadoRef}
                      className={`pos-cli-field-input${props.cliSearchShake ? ' warn' : ''}`}
                      style={{ paddingRight: props.cliContadoCedula ? 36 : 13 }}
                        placeholder="Digite la cédula y presione Enter..."
                      value={props.cliContadoCedula}
                      onChange={(e) => props.onContadoCedulaChange(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void props.onConsultarCedulaContado()}
                      autoFocus
                    />
                    {props.cliContadoCedula && <button className="pos-cli-clear" onClick={props.onClearContadoCedula}>&times;</button>}
                  </div>
                  <button
                    className="pos-cli-confirm-btn"
                    style={{ flex: 'none', padding: '10px 16px', fontSize: 12 }}
                    onClick={() => void props.onConsultarCedulaContado()}
                    disabled={!props.cliContadoCedula.trim() || props.cliContadoConsultando}
                  >
                    {props.cliContadoConsultando ? '...' : 'Buscar'}
                  </button>
                </div>
                {props.cliContadoMhMsg && (
                  <div style={{ marginTop: 6, fontSize: 11, color: props.cliContadoMhOk ? '#6ee7b7' : '#f87171', fontWeight: 600 }}>
                    {props.cliContadoMhMsg}
                  </div>
                )}
              </div>
              <div>
                <div className="pos-cli-field-label">Nombre</div>
                <input
                  className="pos-cli-field-input"
                  placeholder="Nombre del cliente"
                  value={props.cliContadoNombre}
                  onChange={(e) => props.onContadoNombreChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && props.onConfirmarClienteContado()}
                />
              </div>
              <div>
                <div className="pos-cli-field-label">Correo (opcional)</div>
                <input
                  className="pos-cli-field-input"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={props.cliContadoEmail}
                  onChange={(e) => props.onContadoEmailChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && props.onConfirmarClienteContado()}
                />
              </div>
              <div>
                <div className="pos-cli-field-label">Tel\u00E9fono (opcional)</div>
                <input
                  className="pos-cli-field-input"
                  type="tel"
                  placeholder="8888-8888"
                  value={props.cliContadoTelefono}
                  onChange={(e) => props.onContadoTelefonoChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && props.onConfirmarClienteContado()}
                />
              </div>
              <button
                className="pos-cli-confirm-btn"
                onClick={props.onConfirmarClienteContado}
                disabled={!props.cliContadoNombre.trim() && !props.cliContadoCedula.trim()}
              >
                Aplicar a la factura
              </button>
            </div>
          )}
        </div>

        {props.cliTab === 'credito' && props.cliSeleccionado && (
          <div className="pos-cli-footer">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div className="pos-cli-footer-info">
                <div className="pos-cli-footer-nombre">{props.cliSeleccionado.nombre}</div>
                {props.cliSeleccionado.identificacion && (
                  <div className="pos-cli-footer-cedula">{props.cliSeleccionado.identificacion}</div>
                )}
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#60a5fa', background: 'rgba(59,130,246,0.12)', borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>CR\u00C9DITO</div>
            </div>
            <div className="pos-cli-footer-fields">
              <div className="pos-cli-footer-field">
                <div className="pos-cli-footer-label">Email</div>
                <input
                  className="pos-cli-footer-input"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={props.cliEditEmail}
                  onChange={(e) => props.onCliEditEmailChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') props.onAplicarClienteSeleccionado() }}
                />
              </div>
              <div className="pos-cli-footer-field">
                <div className="pos-cli-footer-label">Tel\u00E9fono</div>
                <input
                  className="pos-cli-footer-input"
                  type="tel"
                  placeholder="8888-8888"
                  value={props.cliEditTelefono}
                  onChange={(e) => props.onCliEditTelefonoChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') props.onAplicarClienteSeleccionado() }}
                />
              </div>
            </div>
            <div className="pos-cli-footer-actions">
              <button className="pos-cli-footer-cancel" onClick={props.onCambiarSeleccion}>Cambiar</button>
              <button className="pos-cli-footer-apply" onClick={props.onAplicarClienteSeleccionado}>Aplicar a la factura</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
