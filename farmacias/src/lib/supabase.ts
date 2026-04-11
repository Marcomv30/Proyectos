import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Product = {
  id: string
  name: string
  barcode: string
  unit_price: number
  category_id: string | null
  requires_prescription: boolean
  tax_rate: number
  category?: { name: string }
  inventory: { quantity: number; branch_id: string }[]
}

export type Sale = {
  id: string
  session_id: string | null
  terminal_id: string | null
  user_id: string | null
  branch_id: string | null
  total_amount: number
  subtotal: number
  tax_amount: number
  payment_method: string | null
  customer_phone: string | null
  created_at: string
}

export type SaleItem = {
  id: string
  product_id: string | null
  quantity: number
  unit_price: number
  line_total: number
  product?: { name: string }
}

export type Terminal = {
  id: string
  name: string
  branch_id: string | null
  status: string
  last_seen: string
  operator_user_id: string | null
  branch?: { name: string }
}

export type Notification = {
  id: string
  phone: string
  message: string
  notification_type: 'invoice' | 'treatment_reminder'
  status: 'pending' | 'sent' | 'failed'
  sale_id: string | null
  created_at: string
  sent_at: string | null
}

export type Branch = {
  id: string
  name: string
  address: string
}
