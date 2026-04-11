-- ============================================================
-- FarmaPOS TPV - Supabase Database Schema
-- Sistema de Punto de Venta Farmacéutico Multi-Terminal
-- ============================================================

-- ──────────────────────────────────────────────
-- 1. ENUMS & TYPES
-- ──────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('vendedor', 'farmaceutico', 'administrador');
CREATE TYPE terminal_status AS ENUM ('online', 'offline');
CREATE TYPE notification_type AS ENUM ('invoice', 'treatment_reminder');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');

-- ──────────────────────────────────────────────
-- 2. BRANCHES (Sucursales)
-- ──────────────────────────────────────────────
CREATE TABLE branches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────
-- 3. PRODUCT CATEGORIES
-- ──────────────────────────────────────────────
CREATE TABLE product_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  requires_prescription BOOLEAN DEFAULT false
);

-- ──────────────────────────────────────────────
-- 4. PRODUCTS / INVENTORY
-- ──────────────────────────────────────────────
CREATE TABLE products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  barcode TEXT UNIQUE NOT NULL,
  category_id UUID REFERENCES product_categories(id),
  unit_price DECIMAL(10,2) NOT NULL,
  cost_price DECIMAL(10,2),
  requires_prescription BOOLEAN DEFAULT false,
  tax_rate DECIMAL(4,2) DEFAULT 0.16,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  min_stock_alert INTEGER DEFAULT 20,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, branch_id)
);

-- ──────────────────────────────────────────────
-- 5. TERMINALS
-- ──────────────────────────────────────────────
CREATE TABLE terminals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  status terminal_status DEFAULT 'offline',
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  operator_user_id UUID REFERENCES auth.users(id),
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime for terminals
ALTER TABLE terminals REPLICA IDENTITY FULL;

-- ──────────────────────────────────────────────
-- 6. SESSIONS
-- ──────────────────────────────────────────────
CREATE TABLE terminal_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  terminal_id TEXT REFERENCES terminals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  opening_balance DECIMAL(10,2) DEFAULT 0,
  closing_balance DECIMAL(10,2),
  total_sales DECIMAL(10,2) DEFAULT 0,
  total_cash DECIMAL(10,2) DEFAULT 0,
  total_card DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_sessions_active ON terminal_sessions(is_active) WHERE is_active = true;

-- Enable Realtime for sessions
ALTER TABLE terminal_sessions REPLICA IDENTITY FULL;

-- ──────────────────────────────────────────────
-- 7. SALES
-- ──────────────────────────────────────────────
CREATE TABLE sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES terminal_sessions(id),
  terminal_id TEXT REFERENCES terminals(id),
  user_id UUID REFERENCES auth.users(id),
  branch_id UUID REFERENCES branches(id),
  total_amount DECIMAL(10,2) NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'both')),
  customer_phone TEXT,
  customer_name TEXT,
  invoice_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sale_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  line_total DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Realtime pub/sub - stock changes trigger inventory updates
ALTER TABLE sales REPLICA IDENTITY FULL;
ALTER TABLE sale_items REPLICA IDENTITY FULL;

-- ──────────────────────────────────────────────
-- 8. NOTIFICATIONS (WhatsApp)
-- ──────────────────────────────────────────────
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type notification_type NOT NULL,
  status notification_status DEFAULT 'pending',
  sale_id UUID REFERENCES sales(id),
  whatsapp_message_id TEXT,
  error_message TEXT,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_pending ON notifications(status) WHERE status = 'pending';

-- ──────────────────────────────────────────────
-- 9. TREATMENT REMINDERS
-- ──────────────────────────────────────────────
CREATE TABLE treatment_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  product_id UUID REFERENCES products(id),
  sale_id UUID REFERENCES sales(id),
  days_supplied INTEGER,
  next_reminder_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reminders_due ON treatment_reminders(next_reminder_date, is_active);

-- ──────────────────────────────────────────────
-- 10. REALTIME SECURITY (RLS Policies)
-- ──────────────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminal_sessions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read products/inventory
CREATE POLICY "Authenticated users read products"
  ON products FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users read inventory"
  ON inventory FOR SELECT TO authenticated USING (true);

-- Only admins can modify inventory
CREATE POLICY "Admins modify inventory"
  ON inventory FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'administrador'
    )
  );

-- All authenticated can read sales
CREATE POLICY "Authenticated users read sales"
  ON sales FOR SELECT TO authenticated USING (true);

-- Notifications: only admins can create
CREATE POLICY "Admins manage notifications"
  ON notifications FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.raw_user_meta_data->>'role' = 'administrador'
    )
  );

-- ──────────────────────────────────────────────
-- 11. FUNCTIONS & TRIGGERS
-- ──────────────────────────────────────────────

-- Auto-decrement inventory on sale
CREATE OR REPLACE FUNCTION decrement_inventory()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inventory
  SET quantity = quantity - NEW.quantity,
      updated_at = NOW()
  WHERE product_id = NEW.product_id
    AND branch_id = (SELECT branch_id FROM sales WHERE id = NEW.sale_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No inventory found for product %', NEW.product_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_decrement_inventory
  AFTER INSERT ON sale_items
  FOR EACH ROW
  EXECUTE FUNCTION decrement_inventory();

-- Auto-create treatment reminder when prescription medication is sold
CREATE OR REPLACE FUNCTION create_treatment_reminder()
RETURNS TRIGGER AS $$
DECLARE
  v_requires_rx BOOLEAN;
  v_customer_phone TEXT;
BEGIN
  SELECT requires_prescription INTO v_requires_rx
  FROM products WHERE id = NEW.product_id;

  IF v_requires_rx THEN
    SELECT customer_phone, customer_name INTO v_customer_phone
    FROM sales WHERE id = NEW.sale_id;

    IF v_customer_phone IS NOT NULL THEN
      INSERT INTO treatment_reminders (
        customer_phone, customer_name, product_id, sale_id,
        days_supplied, next_reminder_date
      ) VALUES (
        v_customer_phone, NEW.*,
        30,
        CURRENT_DATE + INTERVAL '30 days'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_treatment_reminder
  AFTER INSERT ON sale_items
  FOR EACH ROW
  EXECUTE FUNCTION create_treatment_reminder();
