import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from './store'
import type { Product, Terminal, Branch } from './supabase'
import { supabase } from './supabase'

// Mock product data
const mockProduct: Product = {
  id: 'prod-1',
  name: 'Paracetamol 500mg',
  barcode: '123456789',
  unit_price: 10.00,
  category_id: 'cat-1',
  requires_prescription: false,
  tax_rate: 0.16,
  inventory: [{ quantity: 100, branch_id: 'branch-1' }],
}

const mockProduct2: Product = {
  id: 'prod-2',
  name: 'Ibuprofeno 400mg',
  barcode: '987654321',
  unit_price: 20.00,
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

const mockUser = {
  id: 'user-1',
  name: 'John Doe',
  email: 'john@example.com',
  role: 'vendedor' as const,
  avatar: '',
}

describe('Store - processSale', () => {
  beforeEach(() => {
    // Reset store state
    const state = useStore.getState()
    state.clearCart()
    state.setProducts([mockProduct, mockProduct2])
    state.setTerminals([mockTerminal])
    state.setBranches([mockBranch])
    state.setUser(mockUser)
    
    // Reset all mocks
    vi.clearAllMocks()
  })

  describe('Validation', () => {
    it('should fail if no user is logged in', async () => {
      const { processSale, setUser, addToCart } = useStore.getState()
      
      setUser(null)
      addToCart(mockProduct)
      
      const result = await processSale(
        [{ product: mockProduct, quantity: 1 }],
        'cash',
        '',
        ''
      )
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('No hay sesión activa')
    })

    it('should fail if cart is empty', async () => {
      const { processSale } = useStore.getState()
      
      const result = await processSale([], 'cash', '', '')
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Carrito vacío')
    })

    it('should fail if no branch is available', async () => {
      const { processSale, setTerminals, setBranches, addToCart } = useStore.getState()
      
      setTerminals([])
      setBranches([])
      addToCart(mockProduct)
      
      const result = await processSale(
        [{ product: mockProduct, quantity: 1 }],
        'cash',
        '',
        ''
      )
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('No hay sucursal activa')
    })
  })

  describe('Calculations', () => {
    it('should calculate subtotal correctly', async () => {
      const cartItems = [
        { product: mockProduct, quantity: 2 }, // 2 x 10.00 = 20.00
        { product: mockProduct2, quantity: 1 }, // 1 x 20.00 = 20.00
      ]
      
      const subtotal = cartItems.reduce(
        (sum, i) => sum + i.product.unit_price * i.quantity,
        0
      )
      
      expect(subtotal).toBe(40.00)
    })

    it('should calculate tax correctly', async () => {
      const cartItems = [{ product: mockProduct, quantity: 1 }] // 10.00
      
      const subtotal = cartItems.reduce(
        (sum, i) => sum + i.product.unit_price * i.quantity,
        0
      )
      const tax = subtotal * 0.16
      
      expect(tax).toBe(1.60)
    })

    it('should calculate total correctly', async () => {
      const cartItems = [{ product: mockProduct, quantity: 1 }] // 10.00
      
      const subtotal = cartItems.reduce(
        (sum, i) => sum + i.product.unit_price * i.quantity,
        0
      )
      const tax = subtotal * 0.16
      const total = subtotal + tax
      
      expect(total).toBe(11.60)
    })
  })

  describe('Successful Sale', () => {
    it('should create sale with correct data structure', async () => {
      const mockSaleData = {
        id: 'sale-123',
        terminal_id: 'term-1',
        user_id: 'user-1',
        branch_id: 'branch-1',
        total_amount: 11.60,
        subtotal: 10.00,
        tax_amount: 1.60,
        payment_method: 'cash',
        customer_phone: null,
        customer_name: null,
        created_at: new Date().toISOString(),
        session_id: null,
      }

      // Mock Supabase insert to return success
      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockSaleData,
              error: null,
            }),
          }),
        }),
        delete: vi.fn(),
        select: vi.fn(),
      } as any)

      const { processSale, addToCart, cart } = useStore.getState()
      
      addToCart(mockProduct)
      
      const result = await processSale(cart, 'cash', '', '')
      
      expect(result.success).toBe(true)
    })

    it('should include customer data when provided', async () => {
      const mockSaleData = {
        id: 'sale-123',
        terminal_id: 'term-1',
        user_id: 'user-1',
        branch_id: 'branch-1',
        total_amount: 11.60,
        subtotal: 10.00,
        tax_amount: 1.60,
        payment_method: 'cash',
        customer_phone: '12345678',
        customer_name: 'Jane Doe',
        created_at: new Date().toISOString(),
        session_id: null,
      }

      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockSaleData,
              error: null,
            }),
          }),
        }),
        delete: vi.fn(),
        select: vi.fn(),
      } as any)

      const { processSale, addToCart, cart } = useStore.getState()
      
      addToCart(mockProduct)
      
      const result = await processSale(cart, 'cash', '12345678', 'Jane Doe')
      
      expect(result.success).toBe(true)
    })

    it('should clear cart after successful sale', async () => {
      const mockSaleData = {
        id: 'sale-123',
        terminal_id: 'term-1',
        user_id: 'user-1',
        branch_id: 'branch-1',
        total_amount: 11.60,
        subtotal: 10.00,
        tax_amount: 1.60,
        payment_method: 'cash',
        customer_phone: null,
        customer_name: null,
        created_at: new Date().toISOString(),
        session_id: null,
      }

      // Mock successful responses for all operations
      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockSaleData,
                  error: null,
                }),
              }),
            }),
            delete: vi.fn(),
          }
        }
        if (table === 'sale_items') {
          return {
            insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }
        }
        if (table === 'notifications') {
          return {
            insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
          }
        }
        if (table === 'products') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [mockProduct],
                error: null,
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }
      })

      vi.mocked(supabase.from).mockImplementation(mockFrom as any)

      const { processSale, addToCart, cart } = useStore.getState()
      
      addToCart(mockProduct)
      expect(cart).toHaveLength(1)
      
      await processSale(cart, 'cash', '', '')
      
      const newCart = useStore.getState().cart
      expect(newCart).toHaveLength(0)
    })
  })

  describe('Payment Methods', () => {
    it('should accept cash payment', async () => {
      const mockSaleData = {
        id: 'sale-123',
        terminal_id: 'term-1',
        user_id: 'user-1',
        branch_id: 'branch-1',
        total_amount: 11.60,
        subtotal: 10.00,
        tax_amount: 1.60,
        payment_method: 'cash',
        customer_phone: null,
        customer_name: null,
        created_at: new Date().toISOString(),
        session_id: null,
      }

      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockSaleData,
              error: null,
            }),
          }),
        }),
        delete: vi.fn(),
      } as any)

      const { processSale, addToCart, cart } = useStore.getState()
      addToCart(mockProduct)
      
      const result = await processSale(cart, 'cash', '', '')
      
      expect(result.success).toBe(true)
    })

    it('should accept card payment', async () => {
      const mockSaleData = {
        id: 'sale-123',
        terminal_id: 'term-1',
        user_id: 'user-1',
        branch_id: 'branch-1',
        total_amount: 11.60,
        subtotal: 10.00,
        tax_amount: 1.60,
        payment_method: 'card',
        customer_phone: null,
        customer_name: null,
        created_at: new Date().toISOString(),
        session_id: null,
      }

      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockSaleData,
              error: null,
            }),
          }),
        }),
        delete: vi.fn(),
      } as any)

      const { processSale, addToCart, cart } = useStore.getState()
      addToCart(mockProduct)
      
      const result = await processSale(cart, 'card', '', '')
      
      expect(result.success).toBe(true)
    })

    it('should accept both (mixed) payment', async () => {
      const mockSaleData = {
        id: 'sale-123',
        terminal_id: 'term-1',
        user_id: 'user-1',
        branch_id: 'branch-1',
        total_amount: 11.60,
        subtotal: 10.00,
        tax_amount: 1.60,
        payment_method: 'both',
        customer_phone: null,
        customer_name: null,
        created_at: new Date().toISOString(),
        session_id: null,
      }

      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockSaleData,
              error: null,
            }),
          }),
        }),
        delete: vi.fn(),
      } as any)

      const { processSale, addToCart, cart } = useStore.getState()
      addToCart(mockProduct)
      
      const result = await processSale(cart, 'both', '', '')
      
      expect(result.success).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database connection failed' },
            }),
          }),
        }),
      } as any)

      const { processSale, addToCart, cart } = useStore.getState()
      addToCart(mockProduct)
      
      const result = await processSale(cart, 'cash', '', '')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Database connection failed')
    })

    it('should rollback sale if sale_items insert fails', async () => {
      const mockSaleData = {
        id: 'sale-123',
        terminal_id: 'term-1',
        user_id: 'user-1',
        branch_id: 'branch-1',
        total_amount: 11.60,
        subtotal: 10.00,
        tax_amount: 1.60,
        payment_method: 'cash',
        customer_phone: null,
        customer_name: null,
        created_at: new Date().toISOString(),
        session_id: null,
      }

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockSaleData,
                  error: null,
                }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }
        }
        if (table === 'sale_items') {
          return {
            insert: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Failed to insert sale items' },
            }),
          }
        }
        return { insert: vi.fn(), delete: vi.fn() }
      })

      vi.mocked(supabase.from).mockImplementation(mockFrom as any)

      const { processSale, addToCart, cart } = useStore.getState()
      addToCart(mockProduct)
      
      const result = await processSale(cart, 'cash', '', '')
      
      expect(result.success).toBe(false)
      expect(result.error).toContain('Error al registrar items')
    })
  })
})
