import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from './store'
import type { Product, Terminal, Branch } from './supabase'

// Mock product data
const mockProduct: Product = {
  id: 'prod-1',
  name: 'Paracetamol 500mg',
  barcode: '123456789',
  unit_price: 5.50,
  category_id: 'cat-1',
  requires_prescription: false,
  tax_rate: 0.16,
  inventory: [{ quantity: 100, branch_id: 'branch-1' }],
}

const mockProduct2: Product = {
  id: 'prod-2',
  name: 'Ibuprofeno 400mg',
  barcode: '987654321',
  unit_price: 8.00,
  category_id: 'cat-1',
  requires_prescription: false,
  tax_rate: 0.16,
  inventory: [{ quantity: 50, branch_id: 'branch-1' }],
}

const mockTerminal: Terminal = {
  id: 'term-1',
  name: 'Terminal 1',
  branch_id: 'branch-1',
  status: 'online',
  last_seen: new Date().toISOString(),
  operator_user_id: 'user-1',
}

const mockBranch: Branch = {
  id: 'branch-1',
  name: 'Sucursal Principal',
  address: 'Calle 123',
}

describe('Store - Cart Management', () => {
  beforeEach(() => {
    // Reset store state before each test
    const state = useStore.getState()
    state.clearCart()
    state.setProducts([mockProduct, mockProduct2])
    state.setTerminals([mockTerminal])
    state.setBranches([mockBranch])
  })

  describe('addToCart', () => {
    it('should add a new product to cart', () => {
      const { addToCart, cart } = useStore.getState()
      
      addToCart(mockProduct)
      
      expect(cart).toHaveLength(1)
      expect(cart[0].product.id).toBe('prod-1')
      expect(cart[0].quantity).toBe(1)
    })

    it('should increment quantity if product already in cart', () => {
      const { addToCart, cart } = useStore.getState()
      
      addToCart(mockProduct)
      addToCart(mockProduct)
      
      expect(cart).toHaveLength(1)
      expect(cart[0].quantity).toBe(2)
    })

    it('should handle multiple different products', () => {
      const { addToCart, cart } = useStore.getState()
      
      addToCart(mockProduct)
      addToCart(mockProduct2)
      
      expect(cart).toHaveLength(2)
      expect(cart[0].product.id).toBe('prod-1')
      expect(cart[1].product.id).toBe('prod-2')
    })
  })

  describe('removeFromCart', () => {
    it('should decrement quantity when quantity > 1', () => {
      const { addToCart, removeFromCart, cart } = useStore.getState()
      
      addToCart(mockProduct)
      addToCart(mockProduct)
      removeFromCart(mockProduct.id)
      
      expect(cart).toHaveLength(1)
      expect(cart[0].quantity).toBe(1)
    })

    it('should remove product when quantity = 1', () => {
      const { addToCart, removeFromCart, cart } = useStore.getState()
      
      addToCart(mockProduct)
      removeFromCart(mockProduct.id)
      
      expect(cart).toHaveLength(0)
    })

    it('should only remove the specified product', () => {
      const { addToCart, removeFromCart, cart } = useStore.getState()
      
      addToCart(mockProduct)
      addToCart(mockProduct2)
      removeFromCart(mockProduct.id)
      
      expect(cart).toHaveLength(1)
      expect(cart[0].product.id).toBe('prod-2')
    })
  })

  describe('clearCart', () => {
    it('should empty the cart', () => {
      const { addToCart, clearCart, cart } = useStore.getState()
      
      addToCart(mockProduct)
      addToCart(mockProduct2)
      clearCart()
      
      expect(cart).toHaveLength(0)
    })
  })

  describe('Cart Calculations', () => {
    it('should calculate correct subtotal', () => {
      const { addToCart, cart } = useStore.getState()
      
      addToCart(mockProduct) // 5.50
      addToCart(mockProduct2) // 8.00
      
      const subtotal = cart.reduce(
        (sum, item) => sum + item.product.unit_price * item.quantity,
        0
      )
      
      expect(subtotal).toBe(13.50)
    })

    it('should calculate correct total with tax', () => {
      const { addToCart, cart } = useStore.getState()
      
      addToCart(mockProduct) // 5.50
      
      const subtotal = cart.reduce(
        (sum, item) => sum + item.product.unit_price * item.quantity,
        0
      )
      const tax = subtotal * 0.16
      const total = subtotal + tax
      
      expect(subtotal).toBe(5.50)
      expect(tax).toBeCloseTo(0.88, 2)
      expect(total).toBeCloseTo(6.38, 2)
    })

    it('should handle multiple quantities correctly', () => {
      const { addToCart, cart } = useStore.getState()
      
      addToCart(mockProduct)
      addToCart(mockProduct)
      addToCart(mockProduct) // 3 x 5.50 = 16.50
      
      const subtotal = cart.reduce(
        (sum, item) => sum + item.product.unit_price * item.quantity,
        0
      )
      
      expect(subtotal).toBe(16.50)
    })
  })
})

describe('Store - Search Functionality', () => {
  beforeEach(() => {
    const state = useStore.getState()
    state.setSearchTerm('')
    state.setProducts([mockProduct, mockProduct2])
  })

  it('should filter products by name', () => {
    const { setSearchTerm, searchTerm, products } = useStore.getState()
    
    setSearchTerm('Paracetamol')
    
    const filtered = products.filter((p) => {
      const term = searchTerm.toLowerCase()
      return p.name.toLowerCase().includes(term) || p.barcode.includes(searchTerm)
    })
    
    expect(filtered).toHaveLength(1)
    expect(filtered[0].name).toBe('Paracetamol 500mg')
  })

  it('should filter products by barcode', () => {
    const { setSearchTerm, searchTerm, products } = useStore.getState()
    
    setSearchTerm('123456789')
    
    const filtered = products.filter((p) => {
      const term = searchTerm.toLowerCase()
      return p.name.toLowerCase().includes(term) || p.barcode.includes(searchTerm)
    })
    
    expect(filtered).toHaveLength(1)
    expect(filtered[0].barcode).toBe('123456789')
  })

  it('should be case insensitive', () => {
    const { setSearchTerm, searchTerm, products } = useStore.getState()
    
    setSearchTerm('PARACETAMOL')
    
    const filtered = products.filter((p) => {
      const term = searchTerm.toLowerCase()
      return p.name.toLowerCase().includes(term) || p.barcode.includes(searchTerm)
    })
    
    expect(filtered).toHaveLength(1)
  })

  it('should return empty array when no matches', () => {
    const { setSearchTerm, searchTerm, products } = useStore.getState()
    
    setSearchTerm('NonExistentProduct')
    
    const filtered = products.filter((p) => {
      const term = searchTerm.toLowerCase()
      return p.name.toLowerCase().includes(term) || p.barcode.includes(searchTerm)
    })
    
    expect(filtered).toHaveLength(0)
  })
})

describe('Store - User State', () => {
  it('should set user correctly', () => {
    const { setUser, user } = useStore.getState()
    
    const mockUser = {
      id: 'user-1',
      name: 'John Doe',
      email: 'john@example.com',
      role: 'vendedor' as const,
      avatar: 'https://avatar.url',
    }
    
    setUser(mockUser)
    
    expect(user).toEqual(mockUser)
  })

  it('should clear user on logout', () => {
    const { setUser, user } = useStore.getState()
    
    setUser({
      id: 'user-1',
      name: 'John Doe',
      email: 'john@example.com',
      role: 'vendedor',
      avatar: '',
    })
    
    setUser(null)
    
    expect(user).toBeNull()
  })
})

describe('Store - View Navigation', () => {
  it('should change current view', () => {
    const { setCurrentView, currentView } = useStore.getState()
    
    setCurrentView('pos')
    expect(currentView).toBe('pos')
    
    setCurrentView('inventory')
    expect(currentView).toBe('inventory')
  })

  it('should toggle sidebar', () => {
    const { setSidebarOpen, sidebarOpen } = useStore.getState()
    
    setSidebarOpen(true)
    expect(sidebarOpen).toBe(true)
    
    setSidebarOpen(false)
    expect(sidebarOpen).toBe(false)
  })
})

describe('Store - Branch Selection', () => {
  it('should set selected branch', () => {
    const { setSelectedBranch, selectedBranch } = useStore.getState()
    
    setSelectedBranch('branch-1')
    expect(selectedBranch).toBe('branch-1')
  })

  it('should default to "all"', () => {
    const { selectedBranch } = useStore.getState()
    expect(selectedBranch).toBe('all')
  })
})
