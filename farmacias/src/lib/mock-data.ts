import type { Product, Terminal, Sale } from './supabase'

export const mockTerminals: Terminal[] = [
  { id: 'T001', name: 'Caja Principal 1', branch_id: 'farmacia_centro', status: 'online', last_seen: new Date().toISOString(), operator_user_id: 'U01' },
  { id: 'T002', name: 'Caja Rápida 2', branch_id: 'farmacia_centro', status: 'online', last_seen: new Date(Date.now() - 30000).toISOString(), operator_user_id: 'U02' },
  { id: 'T003', name: 'Sucursal Norte', branch_id: 'farmacia_norte', status: 'online', last_seen: new Date(Date.now() - 5000).toISOString(), operator_user_id: 'U03' },
  { id: 'T004', name: 'Sucursal Sur', branch_id: 'farmacia_sur', status: 'offline', last_seen: new Date(Date.now() - 120000).toISOString(), operator_user_id: 'U04' },
  { id: 'T005', name: 'App Móvil Admin', branch_id: 'mobile', status: 'online', last_seen: new Date(Date.now() - 10000).toISOString(), operator_user_id: 'U05' },
]

export const mockProducts: Product[] = [
  { id: 'P001', name: 'Paracetamol 500mg', barcode: '7501001234567', price: 2.50, stock: 450, category: 'Analgésicos', branch_id: 'farmacia_centro', requires_prescription: false, created_at: '2026-01-01' },
  { id: 'P002', name: 'Ibuprofeno 400mg', barcode: '7501001234568', price: 3.75, stock: 320, category: 'Antiinflamatorios', branch_id: 'farmacia_centro', requires_prescription: false, created_at: '2026-01-01' },
  { id: 'P003', name: 'Amoxicilina 500mg', barcode: '7501001234569', price: 8.90, stock: 85, category: 'Antibióticos', branch_id: 'farmacia_centro', requires_prescription: true, created_at: '2026-01-15' },
  { id: 'P004', name: 'Loratadina 10mg', barcode: '7501001234570', price: 4.20, stock: 200, category: 'Antihistamínicos', branch_id: 'farmacia_centro', requires_prescription: false, created_at: '2026-02-01' },
  { id: 'P005', name: 'Omeprazol 20mg', barcode: '7501001234571', price: 6.50, stock: 180, category: 'Gastrointestinal', branch_id: 'farmacia_centro', requires_prescription: false, created_at: '2026-02-15' },
  { id: 'P006', name: 'Losartán 50mg', barcode: '7501001234572', price: 12.30, stock: 95, category: 'Cardiovascular', branch_id: 'farmacia_centro', requires_prescription: true, created_at: '2026-03-01' },
  { id: 'P007', name: 'Metformina 850mg', barcode: '7501001234573', price: 5.60, stock: 310, category: 'Antidiabéticos', branch_id: 'farmacia_centro', requires_prescription: true, created_at: '2026-03-15' },
  { id: 'P008', name: 'Vitamina C 1g', barcode: '7501001234574', price: 3.90, stock: 500, category: 'Vitaminas', branch_id: 'farmacia_centro', requires_prescription: false, created_at: '2026-04-01' },
  { id: 'P009', name: 'Diclofenaco Gel', barcode: '7501001234575', price: 7.80, stock: 45, category: 'Tópicos', branch_id: 'farmacia_centro', requires_prescription: false, created_at: '2026-04-01' },
  { id: 'P010', name: 'Atorvastatina 20mg', barcode: '7501001234576', price: 15.40, stock: 12, category: 'Cardiovascular', branch_id: 'farmacia_centro', requires_prescription: true, created_at: '2026-04-01' },
]

export const mockSales: Sale[] = Array.from({ length: 15 }, (_, i) => ({
  id: `S${String(i + 1).padStart(4, '0')}`,
  terminal_id: `T00${(i % 2) + 1}`,
  user_id: `U0${(i % 3) + 1}`,
  total: Math.round((Math.random() * 100 + 5) * 100) / 100,
  items: [],
  created_at: new Date(Date.now() - i * 3600000).toISOString(),
  branch_id: 'farmacia_centro',
}))
