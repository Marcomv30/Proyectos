import { useState } from 'react'
import { supabase } from '../supabase'

type Empresa = { id: number; nombre: string; codigo?: string | null }

type PendingLogin = {
  token: string
  refreshToken: string
  empresas: Empresa[]
  userName: string
  esSuperusuario: boolean
}

type LoginState = {
  empresaId: number
  empresaNombre: string
  empresaCodigo: string
  usuarioNombre: string
  esSuperusuario: boolean
}

type Props = {
  onReady: (payload: LoginState) => void
}

const API = process.env.REACT_APP_API_URL || ''
const MODULO_CODIGO = 'combustible'

export default function LoginPage({ onReady }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<PendingLogin | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const resp = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: username.trim(), 
          password, 
          modulo_codigo: MODULO_CODIGO 
        }),
      })
      const data = await resp.json()
      if (!resp.ok || !data.ok) {
        setError(data.error || data.message || 'Usuario o contraseña incorrectos')
        setLoading(false)
        return
      }

      const nombreUsuario: string = data.usuario?.nombre || data.usuario?.username || ''
      const esSuperusuario: boolean = !!data.usuario?.es_superusuario
      const token: string = data.token || data.session?.access_token || ''
      const refreshToken: string = data.refresh_token || data.session?.refresh_token || ''
      const autorizadas: Empresa[] = (data.empresas_autorizadas || []).map((e: any) => ({ 
        id: e.id, 
        nombre: e.nombre,
        codigo: e.codigo 
      }))

      if (autorizadas.length === 0) {
        setError('Este usuario no tiene acceso al módulo Combustible.')
        setLoading(false)
        return
      }

      if (autorizadas.length === 1) {
        await supabase.auth.setSession({ access_token: token, refresh_token: refreshToken })
        await fetch(`${API}/api/auth/select-empresa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: token, empresa_id: autorizadas[0].id }),
        })
        onReady({
          empresaId: autorizadas[0].id,
          empresaNombre: autorizadas[0].nombre,
          empresaCodigo: autorizadas[0].codigo || String(autorizadas[0].id).padStart(3, '0'),
          usuarioNombre: nombreUsuario,
          esSuperusuario,
        })
      } else {
        setLoading(false)
        setPending({ token, refreshToken, empresas: autorizadas, userName: nombreUsuario, esSuperusuario })
      }
    } catch (err: any) {
      setError(err?.message || 'No se pudo conectar con el servidor.')
      setLoading(false)
    }
  }

  async function handleSelectEmpresa(empresa: Empresa) {
    if (!pending) return
    await supabase.auth.setSession({ 
      access_token: pending.token, 
      refresh_token: pending.refreshToken 
    })
    await fetch(`${API}/api/auth/select-empresa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: pending.token, empresa_id: empresa.id }),
    })
    onReady({
      empresaId: empresa.id,
      empresaNombre: empresa.nombre,
      empresaCodigo: empresa.codigo || String(empresa.id).padStart(3, '0'),
      usuarioNombre: pending.userName,
      esSuperusuario: pending.esSuperusuario,
    })
  }

  if (pending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-5">
        <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-sky-700 to-sky-500 mx-auto mb-4 flex items-center justify-center text-2xl">
              ⛽
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Seleccionar Empresa</h2>
            <p className="text-sm text-slate-500 mt-2">Elige la estación de servicio a la que deseas acceder</p>
          </div>

          <div className="flex flex-col gap-2">
            {pending.empresas.map(emp => (
              <button
                key={emp.id}
                onClick={() => handleSelectEmpresa(emp)}
                className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl bg-slate-50 hover:border-sky-500 hover:bg-sky-50 transition-all text-left"
              >
                <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-700 to-sky-500 flex items-center justify-center text-base shrink-0">
                  🏢
                </span>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-900">{emp.nombre}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    COD {emp.codigo || String(emp.id).padStart(3, '0')}
                  </div>
                </div>
                <span className="text-sky-500 text-lg">→</span>
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <button
            onClick={() => { setPending(null); setError('') }}
            className="w-full mt-4 p-3 border border-slate-200 rounded-lg text-slate-500 text-sm hover:bg-slate-50 transition-colors"
          >
            ← Volver al inicio de sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-5">
      <div className="w-full max-w-sm bg-white rounded-2xl p-9 shadow-2xl">
        <div className="text-center mb-7">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-700 to-sky-500 mx-auto mb-4 flex items-center justify-center text-3xl shadow-lg shadow-sky-500/30">
            ⛽
          </div>
          <h1 className="text-xl font-bold text-slate-900">Consola MYA</h1>
          <p className="text-sm text-slate-500 mt-2">Sistema de Control de Combustible</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Ingrese su usuario"
              autoFocus
              autoComplete="username"
              className="w-full px-3.5 py-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-3 focus:ring-sky-500/15 transition-all"
            />
          </div>

          <div className="mb-5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full px-3.5 py-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-3 focus:ring-sky-500/15 transition-all"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 rounded-lg font-semibold text-white transition-all ${
              loading 
                ? 'bg-slate-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-sky-700 to-sky-500 hover:opacity-92 active:scale-[0.98]'
            }`}
          >
            {loading ? 'Verificando...' : 'Iniciar Sesión →'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-400">Usa las mismas credenciales del ERP</p>
        </div>

        <div className="mt-5 text-center">
          <p className="text-[11px] text-slate-300 font-mono tracking-wide">
            CONSOLA v1.0 · {new Date().getFullYear()} · MYA
          </p>
        </div>
      </div>
    </div>
  )
}
