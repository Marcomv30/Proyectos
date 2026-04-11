import { useStore, type UserRole } from '../lib/store'
import {
  LayoutDashboard, ShoppingCart, Package, MessageSquare, Users, Settings,
  LogOut, Pill, Menu, X, Monitor, Bell
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useEffect, useState } from 'react'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['administrador', 'farmaceutico'] as UserRole[] },
  { id: 'pos', label: 'Punto de Venta', icon: ShoppingCart, roles: ['administrador', 'farmaceutico', 'vendedor'] as UserRole[] },
  { id: 'inventory', label: 'Inventario', icon: Package, roles: ['administrador', 'farmaceutico'] as UserRole[] },
  { id: 'whatsapp', label: 'WhatsApp API', icon: MessageSquare, roles: ['administrador'] as UserRole[] },
  { id: 'terminals', label: 'Terminales', icon: Monitor, roles: ['administrador'] as UserRole[] },
  { id: 'users', label: 'Usuarios', icon: Users, roles: ['administrador'] as UserRole[] },
  { id: 'settings', label: 'Configuración', icon: Settings, roles: ['administrador'] as UserRole[] },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, currentView, setCurrentView, sidebarOpen, setSidebarOpen, loadSales, loadTerminals } = useStore()
  const [pendingNotifs, setPendingNotifs] = useState(0)

  useEffect(() => {
    const checkNotifs = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
      setPendingNotifs(count || 0)
    }
    checkNotifs()
    const interval = setInterval(checkNotifs, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  const roleLabel: Record<UserRole, string> = {
    administrador: 'Administrador',
    farmaceutico: 'Farmaceútico',
    vendedor: 'Vendedor',
  }

  const visibleItems = NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role)
  )

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-white border-r border-slate-100 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-slate-800 text-base">FarmaPOS</span>
              <span className="block text-[10px] text-slate-400 -mt-0.5">TPV System</span>
            </div>
          </div>
          <button className="lg:hidden text-slate-400" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {user && (
          <div className="px-4 pt-4 pb-2">
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
              <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                {user.avatar}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{user.name}</p>
                <p className="text-[11px] text-slate-400">{roleLabel[user.role]}</p>
              </div>
            </div>
          </div>
        )}

        <nav className="flex-1 p-3 space-y-0.5">
          {visibleItems.map((item) => {
            const active = currentView === item.id
            return (
              <button
                key={item.id}
                onClick={() => { setCurrentView(item.id); setSidebarOpen(false) }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${
                  active
                    ? 'bg-emerald-50 text-emerald-700 font-medium'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="p-3 border-t border-slate-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 transition"
          >
            <LogOut className="w-[18px] h-[18px]" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-slate-100 px-4 lg:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button className="lg:hidden text-slate-500" onClick={() => setSidebarOpen(true)}>
                <Menu className="w-5 h-5" />
              </button>
              <h1 className="text-lg font-semibold text-slate-800 capitalize">
                {visibleItems.find((i) => i.id === currentView)?.label || 'Dashboard'}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative mr-2">
                <button className="p-2 hover:bg-slate-100 rounded-lg transition">
                  <Bell className="w-4 h-4 text-slate-500" />
                </button>
                {pendingNotifs > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                    {pendingNotifs}
                  </span>
                )}
              </div>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 px-2.5 py-1.5 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Tiempo real activo
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
