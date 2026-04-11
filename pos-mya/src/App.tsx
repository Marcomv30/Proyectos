import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import SetupPage, { getStoredTerminal, type TerminalConfig } from './pages/SetupPage'
import POSPage from './pages/POSPage'

type Session = {
  token: string
  empresaId: number
  empresaNombre: string
  userName: string
  esSuperusuario: boolean
}

type AppState = 'checking' | 'login' | 'setup' | 'no-terminal' | 'pos'

export default function App() {
  const [appState, setAppState] = useState<AppState>('checking')
  const [session, setSession] = useState<Session | null>(null)
  const [terminal, setTerminal] = useState<TerminalConfig | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('pos_session')
    if (stored) {
      try {
        const s = JSON.parse(stored) as Session
        supabase.auth.getSession().then(({ data }) => {
          if (data.session?.access_token) {
            setSession(s)
            const cfg = getStoredTerminal(s.empresaId)
            if (cfg) {
              setTerminal(cfg)
              setAppState('pos')
            } else if (s.esSuperusuario) {
              setAppState('setup')
            } else {
              setAppState('no-terminal')
            }
          } else {
            localStorage.removeItem('pos_session')
            setAppState('login')
          }
        })
      } catch {
        localStorage.removeItem('pos_session')
        setAppState('login')
      }
    } else {
      setAppState('login')
    }
  }, [])

  const handleLogin = (s: Session) => {
    localStorage.setItem('pos_session', JSON.stringify(s))
    setSession(s)
    const cfg = getStoredTerminal(s.empresaId)
    if (cfg) {
      setTerminal(cfg)
      setAppState('pos')
    } else if (s.esSuperusuario) {
      setAppState('setup')
    } else {
      setAppState('no-terminal')
    }
  }

  const handleSetupComplete = (cfg: TerminalConfig) => {
    setTerminal(cfg)
    setAppState('pos')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('pos_session')
    setSession(null)
    setTerminal(null)
    setAppState('login')
  }

  const handleResetTerminal = () => {
    if (!session) return
    // No borrar el terminal aún — SetupPage llamará onComplete si elige uno nuevo
    // onCancel permite volver sin cambios
    if (session.esSuperusuario) {
      setAppState('setup')
    } else {
      setAppState('no-terminal')
    }
  }

  const handleCancelSetup = () => {
    if (terminal) setAppState('pos')
  }

  if (appState === 'checking') {
    return (
      <div style={{ minHeight: '100vh', background: '#0b1120', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#5c7099', fontSize: '14px' }}>Cargando...</div>
      </div>
    )
  }

  if (appState === 'login') {
    return <LoginPage onLogin={handleLogin} />
  }

  if (appState === 'no-terminal') {
    return (
      <div style={{ minHeight: '100vh', background: '#0b1120', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#111a2e', border: '1px solid rgba(137,160,201,0.18)', borderRadius: 20, padding: '36px 32px', width: 'min(420px, 96vw)', textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🖥</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#f3f7ff', marginBottom: 8 }}>Terminal no configurada</div>
          <div style={{ fontSize: 13, color: '#5c7099', lineHeight: 1.6, marginBottom: 24 }}>
            Este dispositivo no tiene una caja asignada.<br />
            Contacte al administrador del sistema para configurar esta terminal.
          </div>
          <button
            onClick={handleLogout}
            style={{ padding: '11px 24px', border: '1px solid rgba(137,160,201,0.2)', borderRadius: 10, background: 'transparent', color: '#7f92b5', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            ← Volver al inicio
          </button>
        </div>
      </div>
    )
  }

  if (appState === 'setup' && session) {
    return (
      <SetupPage
        empresaId={session.empresaId}
        empresaNombre={session.empresaNombre}
        token={session.token}
        onComplete={handleSetupComplete}
        onCancel={terminal ? handleCancelSetup : undefined}
      />
    )
  }

  if (appState === 'pos' && session && terminal) {
    return (
      <POSPage
        empresaId={session.empresaId}
        empresaNombre={session.empresaNombre}
        userName={session.userName}
        token={session.token}
        terminal={terminal}
        onLogout={handleLogout}
        onResetTerminal={handleResetTerminal}
      />
    )
  }

  return null
}
