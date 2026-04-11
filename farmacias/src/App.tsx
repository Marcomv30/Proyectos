import { useEffect } from 'react'
import { useStore } from './lib/store'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import Layout from './components/Layout'
import DashboardView from './views/DashboardView'
import POSView from './views/POSView'
import InventoryView from './views/InventoryView'
import WhatsAppView from './views/WhatsAppView'
import TerminalsView from './views/TerminalsView'
import PlaceholderView from './views/PlaceholderView'

function App() {
  const { user, setUser, currentView, loadProducts, loadSales, loadTerminals, loadBranches, loadNotifications, setCurrentView } = useStore()

  useEffect(() => {
    if (user && user.id) {
      loadProducts()
      loadSales()
      loadTerminals()
      loadBranches()
      loadNotifications()
      // Set WhatsApp status based on env
      const isConfigured = import.meta.env.ENABLE_WHATSAPP === 'true'
      setWhatsappStatus(isConfigured ? 'connected' : 'disconnected')

      // Subscribe to realtime: sales
      const salesChannel = supabase
        .channel('sales-changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales' }, () => {
          loadSales()
          loadProducts()
        })
        .subscribe()

      // Subscribe to realtime: inventory
      const invChannel = supabase
        .channel('inv-changes')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'inventory' }, () => {
          loadProducts()
        })
        .subscribe()

      // Subscribe to realtime: terminals
      const termChannel = supabase
        .channel('term-changes')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'terminals' }, () => {
          loadTerminals()
        })
        .subscribe()

      return () => {
        supabase.removeChannel(salesChannel)
        supabase.removeChannel(invChannel)
        supabase.removeChannel(termChannel)
      }
    }
  }, [user])

  // Check for existing session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const role = session.user.user_metadata?.role || 'vendedor'
        const name = session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Usuario'
        const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2)
        setUser({
          id: session.user.id,
          name,
          email: session.user.email || '',
          role,
          avatar: initials.toUpperCase(),
        })
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null)
        setCurrentView('login')
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setCurrentView('login')
  }

  const { whatsappStatus, setWhatsappStatus } = useStore()

  if (!user || currentView === 'login') {
    return <Login />
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <DashboardView />
      case 'pos': return <POSView />
      case 'inventory': return <InventoryView />
      case 'whatsapp': return <WhatsAppView />
      case 'terminals': return <TerminalsView />
      default: return <PlaceholderView view={currentView} />
    }
  }

  return (
    <Layout onLogout={handleLogout}>
      {renderView()}
    </Layout>
  )
}

export default App
