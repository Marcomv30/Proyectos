import { useState, useEffect } from 'react'
import { supabase, API } from '../lib/supabase'

type Empresa = { id: number; nombre: string }

type PendingLogin = {
  token: string
  refreshToken: string
  empresas: Empresa[]
  userName: string
  esSuperusuario: boolean
}

type Props = {
  onLogin: (session: { token: string; empresaId: number; empresaNombre: string; userName: string; esSuperusuario: boolean }) => void
}

const SLIDES = [
  {
    title: 'Venta rápida,\ncobro preciso.',
    subtitle: 'Escaneá código de barras, agregá artículos al carrito y cobrá en segundos. Todo integrado al inventario en tiempo real.',
    image: '/login-1.png',
  },
  {
    title: 'Facturación electrónica\ndesde el mostrador.',
    subtitle: 'Emití tiquetes y facturas electrónicas con un solo clic. Conectado a Hacienda sin pasos extra.',
    image: '/login-2.png',
  },
  {
    title: 'Multiempresa.\nUn acceso para todos sus puntos.',
    subtitle: 'Accedé a cualquiera de sus puntos de venta con las mismas credenciales y permisos precisos por rol.',
    image: '/login-3.png',
  },
]

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [slideIdx, setSlideIdx] = useState(0)
  const [pending, setPending]   = useState<PendingLogin | null>(null)

  useEffect(() => {
    const t = setInterval(() => setSlideIdx(i => (i + 1) % SLIDES.length), 5000)
    return () => clearInterval(t)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const resp = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, modulo_codigo: 'pos' }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.ok) {
        setError(data.error || data.message || 'Usuario o contraseña incorrectos')
        setLoading(false); return
      }

      const nombreUsuario: string = data.usuario?.nombre || data.usuario?.username || ''
      const esSuperusuario: boolean = !!data.usuario?.es_superusuario
      const token: string = data.token || data.session?.access_token || ''
      const refreshToken: string = data.refresh_token || data.session?.refresh_token || ''
      const conPos: Empresa[] = (data.empresas_autorizadas || []).map((e: any) => ({ id: e.id, nombre: e.nombre }))

      if (conPos.length === 0) {
        setError('Este usuario no tiene acceso al módulo Punto de Venta.')
        setLoading(false); return
      }

      if (conPos.length === 1) {
        // Una sola empresa → entrar directo
        await supabase.auth.setSession({ access_token: token, refresh_token: refreshToken })
        onLogin({ token, empresaId: conPos[0].id, empresaNombre: conPos[0].nombre, userName: nombreUsuario, esSuperusuario })
      } else {
        // Varias empresas → mostrar selector
        setLoading(false)
        setPending({ token, refreshToken, empresas: conPos, userName: nombreUsuario, esSuperusuario })
      }

    } catch (err: any) {
      setError(err?.message || 'No se pudo conectar con el servidor.')
      setLoading(false)
    }
  }

  async function handleSelectEmpresa(empresa: Empresa) {
    if (!pending) return
    await supabase.auth.setSession({ access_token: pending.token, refresh_token: pending.refreshToken })
    onLogin({ token: pending.token, empresaId: empresa.id, empresaNombre: empresa.nombre, userName: pending.userName, esSuperusuario: pending.esSuperusuario })
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; font-family: 'DM Sans', system-ui, sans-serif; }

        .login-wrap {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1.25fr 460px;
          background: #0f172a;
        }
        .login-showcase {
          position: relative; overflow: hidden;
          display: flex; align-items: flex-end; padding: 48px;
        }
        .login-slide-layer {
          position: absolute; inset: 0;
          background-size: cover; background-position: center;
          filter: saturate(1.2) contrast(1.08) brightness(1.08);
          opacity: 0; transform: scale(1.02);
          transition: opacity 0.9s ease, transform 1.6s ease;
        }
        .login-slide-layer.active { opacity: 1; transform: scale(1.0); }
        .login-deco {
          position: absolute; inset: 0; pointer-events: none;
          background:
            linear-gradient(140deg, rgba(15,23,42,0.10) 0%, rgba(2,132,199,0.22) 48%, rgba(15,23,42,0.36) 100%),
            radial-gradient(circle at 72% 24%, rgba(56,189,248,0.22), transparent 52%),
            radial-gradient(circle at 20% 78%, rgba(34,197,94,0.20), transparent 52%);
          box-shadow: inset 0 -120px 190px rgba(2,6,23,0.40);
        }
        .login-brand { position: relative; z-index: 1; max-width: 640px; color: #f8fafc; }
        .login-badge {
          display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px;
          border-radius: 999px; border: 1px solid rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.08); font-size: 11px;
          letter-spacing: 0.06em; text-transform: uppercase;
        }
        .login-hero-title { margin-top: 16px; font-size: 42px; line-height: 1.05; letter-spacing: -0.04em; font-weight: 600; white-space: pre-line; }
        .login-hero-sub { margin-top: 12px; font-size: 15px; color: #cbd5e1; max-width: 560px; }
        .login-dots { margin-top: 20px; display: flex; gap: 8px; }
        .login-dot { width: 10px; height: 10px; border-radius: 999px; border: none; background: rgba(255,255,255,0.35); cursor: pointer; transition: width 0.3s, background 0.3s; }
        .login-dot.active { background: #38bdf8; width: 24px; }

        .login-panel-wrap {
          display: flex; align-items: center; justify-content: center;
          padding: 28px; background: #e2e8f0;
        }
        .login-panel {
          width: 100%; max-width: 420px; background: #ffffff;
          border: 1px solid #e2e8f0; border-radius: 18px;
          padding: 34px 28px; box-shadow: 0 18px 45px rgba(15,23,42,0.16);
        }
        .login-logo {
          width: 52px; height: 52px; border-radius: 14px;
          background: linear-gradient(135deg, #16a34a, #22c55e);
          display: flex; align-items: center; justify-content: center;
          font-family: 'DM Mono', monospace; font-size: 16px; font-weight: 600;
          color: white; margin-bottom: 14px;
          box-shadow: 0 8px 20px rgba(15,23,42,0.2);
        }
        .login-title { font-size: 25px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em; }
        .login-sub { font-size: 13px; color: #64748b; margin-top: 4px; margin-bottom: 24px; }
        .field-label {
          display: block; font-size: 11px; font-weight: 600; color: #64748b;
          letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px;
        }
        .field-input {
          width: 100%; padding: 11px 13px; background: #f8fafc;
          border: 1px solid #dbe1ea; border-radius: 10px; color: #0f172a;
          font-size: 14px; outline: none; margin-bottom: 14px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .field-input:focus { border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56,189,248,0.18); }
        .btn-login {
          width: 100%; padding: 12px;
          background: linear-gradient(135deg, #16a34a, #22c55e);
          border: none; border-radius: 10px; color: white;
          font-size: 14px; font-weight: 600; cursor: pointer;
          transition: opacity 0.2s, transform 0.1s; margin-top: 6px;
        }
        .btn-login:hover { opacity: 0.92; }
        .btn-login:active { transform: scale(0.98); }
        .btn-login:disabled { opacity: 0.6; cursor: not-allowed; }
        .login-error { font-size: 12px; color: #dc2626; text-align: center; margin: 4px 0 10px; }
        .login-footer { font-size: 11px; color: #94a3b8; text-align: center; margin-top: 24px; font-family: 'DM Mono', monospace; }

        .empresa-list { display: flex; flex-direction: column; gap: 8px; margin: 20px 0; }
        .empresa-btn {
          width: 100%; padding: 13px 16px; text-align: left;
          background: #f8fafc; border: 1px solid #dbe1ea; border-radius: 10px;
          color: #0f172a; font-size: 14px; font-weight: 500; cursor: pointer;
          transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
          display: flex; align-items: center; gap: 10px;
        }
        .empresa-btn:hover {
          border-color: #22c55e; background: #f0fdf4;
          box-shadow: 0 0 0 3px rgba(34,197,94,0.12);
        }
        .empresa-btn-icon {
          width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
          background: linear-gradient(135deg, #16a34a, #22c55e);
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; color: white;
        }
        .btn-back {
          background: none; border: none; color: #64748b; font-size: 13px;
          cursor: pointer; padding: 0; margin-top: 16px; text-align: center;
          width: 100%; text-decoration: underline;
        }
        .btn-back:hover { color: #0f172a; }

        @media (max-width: 860px) {
          .login-wrap { grid-template-columns: 1fr !important; }
          .login-showcase { display: none !important; }
          .login-panel-wrap { min-height: 100vh; }
        }
      `}</style>

      <div className="login-wrap">
        {/* ── Showcase izquierdo ── */}
        <section className="login-showcase">
          {SLIDES.map((s, i) => (
            <div key={i} className={`login-slide-layer ${i === slideIdx ? 'active' : ''}`}
              style={{ backgroundImage: `url(${s.image})` }} />
          ))}
          <div className="login-deco" />
          <div className="login-brand">
            <span className="login-badge">POS | SISTEMAS MYA</span>
            <h1 className="login-hero-title">{SLIDES[slideIdx].title}</h1>
            <p className="login-hero-sub">{SLIDES[slideIdx].subtitle}</p>
            <div className="login-dots">
              {SLIDES.map((_, i) => (
                <button key={i} className={`login-dot ${i === slideIdx ? 'active' : ''}`}
                  onClick={() => setSlideIdx(i)} />
              ))}
            </div>
          </div>
        </section>

        {/* ── Panel derecho ── */}
        <section className="login-panel-wrap">
          <div className="login-panel">
            <div className="login-logo">POS</div>

            {pending ? (
              <>
                <div className="login-title">Seleccionar empresa</div>
                <div className="login-sub">Elegí el punto de venta al que querés acceder</div>
                <div className="empresa-list">
                  {pending.empresas.map(emp => (
                    <button key={emp.id} className="empresa-btn" onClick={() => handleSelectEmpresa(emp)}>
                      <span className="empresa-btn-icon">🏪</span>
                      {emp.nombre}
                    </button>
                  ))}
                </div>
                <button className="btn-back" onClick={() => { setPending(null); setError('') }}>
                  ← Volver
                </button>
              </>
            ) : (
              <>
                <div className="login-title">Iniciar Sesión</div>
                <div className="login-sub">Morales y Alfaro — Punto de Venta</div>
                <form onSubmit={handleSubmit}>
                  <label className="field-label">Usuario</label>
                  <input className="field-input" type="text" placeholder="Ingrese su usuario"
                    value={username} onChange={e => setUsername(e.target.value)}
                    autoFocus autoComplete="username"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('pos-password')?.focus() } }} />
                  <label className="field-label">Contraseña</label>
                  <input id="pos-password" className="field-input" type="password" placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password" />
                  {error && <div className="login-error">{error}</div>}
                  <button className="btn-login" type="submit" disabled={loading}>
                    {loading ? 'Verificando...' : 'Continuar →'}
                  </button>
                </form>
              </>
            )}

            <div className="login-footer">Sistema MYA v1.0 · {new Date().getFullYear()}</div>
          </div>
        </section>
      </div>
    </>
  )
}
