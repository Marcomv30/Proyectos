import { create } from 'zustand'
import type { Product, Sale, Terminal, Notification, SaleItem, Branch } from './supabase'
import { supabase } from './supabase'

export type UserRole = 'vendedor' | 'farmaceutico' | 'administrador'

export type User = {
  id: string
  name: string
  email: string
  role: UserRole
  avatar: string
}

type AppState = {
  user: User | null
  setUser: (u: User | null) => void
  currentView: string
  setCurrentView: (v: string) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  products: Product[]
  setProducts: (p: Product[]) => void
  sales: Sale[]
  setSales: (s: Sale[]) => void
  terminals: Terminal[]
  setTerminals: (t: Terminal[]) => void
  branches: Branch[]
  setBranches: (b: Branch[]) => void
  cart: { product: Product; quantity: number }[]
  addToCart: (p: Product) => void
  removeFromCart: (productId: string) => void
  clearCart: () => void
  whatsappStatus: 'connected' | 'connecting' | 'disconnected'
  setWhatsappStatus: (s: 'connected' | 'connecting' | 'disconnected') => void
  searchTerm: string
  setSearchTerm: (s: string) => void
  selectedBranch: string
  setSelectedBranch: (b: string) => void
  notifications: Notification[]
  setNotifications: (n: Notification[]) => void
  loadProducts: () => Promise<void>
  loadSales: () => Promise<void>
  loadTerminals: () => Promise<void>
  loadBranches: () => Promise<void>
  loadNotifications: () => Promise<void>
  processSale: (cart: { product: Product; quantity: number }[], paymentMethod: string, customerPhone: string, customerName: string) => Promise<{ success: boolean; error?: string }>
}

export const useStore = create<AppState>((set, get) => ({
  user: null,
  setUser: (user) => set({ user }),
  currentView: 'dashboard',
  setCurrentView: (currentView) => set({ currentView }),
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  products: [],
  setProducts: (products) => set({ products }),
  sales: [],
  setSales: (sales) => set({ sales }),
  terminals: [],
  setTerminals: (terminals) => set({ terminals }),
  branches: [],
  setBranches: (branches) => set({ branches }),
  cart: [],
  addToCart: (product) =>
    set((state) => {
      const existing = state.cart.find((item) => item.product.id === product.id)
      if (existing) {
        return {
          cart: state.cart.map((item) =>
            item.product.id === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          ),
        }
      }
      return { cart: [...state.cart, { product, quantity: 1 }] }
    }),
  removeFromCart: (productId) =>
    set((state) => {
      const existing = state.cart.find((item) => item.product.id === productId)
      if (existing && existing.quantity > 1) {
        return {
          cart: state.cart.map((item) =>
            item.product.id === productId
              ? { ...item, quantity: item.quantity - 1 }
              : item
          ),
        }
      }
      return {
        cart: state.cart.filter((item) => item.product.id !== productId),
      }
    }),
  clearCart: () => set({ cart: [] }),
  whatsappStatus: 'disconnected',
  setWhatsappStatus: (whatsappStatus) => set({ whatsappStatus }),
  searchTerm: '',
  setSearchTerm: (searchTerm) => set({ searchTerm }),
  selectedBranch: 'all',
  setSelectedBranch: (selectedBranch) => set({ selectedBranch }),
  notifications: [],
  setNotifications: (notifications) => set({ notifications }),

  loadProducts: async () => {
    const { data } = await supabase
      .from('products')
      .select('*, category:product_categories(name), inventory:inventory(*)')
      .order('name')
    if (data) set({ products: data })
  },

  loadSales: async () => {
    const { data } = await supabase
      .from('sales')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) set({ sales: data })
  },

  loadTerminals: async () => {
    const { data } = await supabase
      .from('terminals')
      .select('*')
      .order('name')
    if (data) set({ terminals: data })
  },

  loadBranches: async () => {
    const { data } = await supabase
      .from('branches')
      .select('*')
      .order('name')
    if (data) set({ branches: data })
  },

  loadNotifications: async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) set({ notifications: data })
  },

  processSale: async (cartItems, paymentMethod, customerPhone, customerName) => {
    const state = get()
    if (!state.user) return { success: false, error: 'No hay sesión activa' }
    if (cartItems.length === 0) return { success: false, error: 'Carrito vacío' }

    // Check branch from first selected terminal
    const firstTerminal = state.terminals.filter(t => t.status === 'online')[0]
    const branchId = firstTerminal?.branch_id || state.branches[0]?.id
    if (!branchId) return { success: false, error: 'No hay sucursal activa' }

    const subtotal = cartItems.reduce((sum, i) => sum + i.product.unit_price * i.quantity, 0)
    const tax = subtotal * 0.16
    const total = subtotal + tax

    // 1. Create sale
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert({
        terminal_id: firstTerminal?.id,
        user_id: state.user.id,
        branch_id: branchId,
        total_amount: total,
        subtotal,
        tax_amount: tax,
        payment_method: paymentMethod,
        customer_phone: customerPhone || null,
        customer_name: customerName || null,
      })
      .select()
      .single()

    if (saleError || !sale) return { success: false, error: saleError?.message || 'Error al crear venta' }

    // 2. Insert sale items + decrement inventory (trigger handles this)
    for (const item of cartItems) {
      const { error } = await supabase.from('sale_items').insert({
        sale_id: sale.id,
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.unit_price,
        line_total: item.product.unit_price * item.quantity,
      })
      if (error) {
        // Rollback
        await supabase.from('sales').delete().eq('id', sale.id)
        return { success: false, error: 'Error al registrar items: ' + error.message }
      }
    }

    // 3. If customer phone, create notification for invoice
    if (customerPhone) {
      await supabase.from('notifications').insert({
        phone: customerPhone,
        message: `Su factura de FarmaPOS por $${total.toFixed(2)} - Compra #${sale.id.slice(0, 8)}`,
        notification_type: 'invoice',
        sale_id: sale.id,
        status: 'pending',
      })
    }

    // 4. Reload products to get updated inventory
    await get().loadProducts()
    await get().loadSales()
    set({ cart: [] })

    return { success: true, saleId: sale.id }
  },
}))
