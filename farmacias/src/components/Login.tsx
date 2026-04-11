import { useState } from 'react'
import { useStore, type UserRole } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Pill, Eye, EyeOff, Shield, User, Lock } from 'lucide-react'

export default function Login() {
  const { setUser, setCurrentView } = useStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: `${username.toLowerCase()}@farma.com`,
      password,
    })

    setLoading(false)
    if (authError || !authData.user) {
      setError('Credenciales inválidas. Verifica tu usuario y contraseña.')
      return
    }

    const role = (authData.user.user_metadata?.role as UserRole) || 'vendedor'
    const name = authData.user.user_metadata?.name || username

    const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2)
    setUser({
      id: authData.user.id,
      name,
      email: authData.user.email || '',
      role,
      avatar: initials.toUpperCase(),
    })
    setCurrentView('dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 text-white mb-4 shadow-lg shadow-emerald-200">
            <Pill className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">FarmaPOS</h1>
          <p className="text-slate-500 mt-1">Sistema de Punto de Venta Farmaceútica</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8">
          <h2 className="text-lg font-semibold text-slate-700 mb-6">Iniciar Sesión</h2>
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Usuario</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition text-sm"
                  placeholder="admin, farma, o venta"
                  autoComplete="username"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition text-sm"
                  placeholder="Contraseña"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl p-3">
                <Shield className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {loading ? 'Verificando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <div className="mt-6 bg-emerald-50/80 rounded-xl p-4 border border-emerald-100">
          <p className="text-xs font-medium text-emerald-700 mb-2">Cuentas de demostración:</p>
          <div className="grid grid-cols-3 gap-2 text-xs text-emerald-600">
            <button type="button" onClick={() => { setUsername('admin'); setPassword('admin123') }} className="bg-white/80 px-2 py-1.5 rounded-lg hover:bg-white transition text-left">
              <span className="font-medium">admin</span> / admin123
            </button>
            <button type="button" onClick={() => { setUsername('farma'); setPassword('farma123') }} className="bg-white/80 px-2 py-1.5 rounded-lg hover:bg-white transition text-left">
              <span className="font-medium">farma</span> / farma123
            </button>
            <button type="button" onClick={() => { setUsername('venta'); setPassword('venta123') }} className="bg-white/80 px-2 py-1.5 rounded-lg hover:bg-white transition text-left">
              <span className="font-medium">venta</span> / venta123
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
