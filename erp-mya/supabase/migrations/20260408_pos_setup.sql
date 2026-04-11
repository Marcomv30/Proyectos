-- ============================================================
-- POS Setup: sucursales, consecutivos MH, config, fix trigger bodega
-- ============================================================

-- ── 1. Sucursales físicas del POS ────────────────────────────
CREATE TABLE IF NOT EXISTS pos_sucursales (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  INTEGER      NOT NULL,
  nombre      VARCHAR(100) NOT NULL,
  bodega_id   BIGINT       REFERENCES inv_bodegas(id),
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_pos_sucursales_empresa ON pos_sucursales(empresa_id);
ALTER TABLE pos_sucursales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_pos_sucursales" ON pos_sucursales USING (auth.role() = 'service_role');

-- ── 2. Extender pos_cajas: sucursal física + terminal FE ─────
ALTER TABLE pos_cajas
  ADD COLUMN IF NOT EXISTS sucursal_id BIGINT REFERENCES pos_sucursales(id),
  ADD COLUMN IF NOT EXISTS terminal_id BIGINT REFERENCES fe_terminales(id);

-- ── 3. Consecutivos atómicos por caja + tipo de documento ────
-- tipo_doc: '001'=Factura Electrónica  '004'=Tiquete Electrónico
CREATE TABLE IF NOT EXISTS pos_consecutivos (
  caja_id    BIGINT  NOT NULL REFERENCES pos_cajas(id) ON DELETE CASCADE,
  tipo_doc   CHAR(3) NOT NULL,
  ultimo_num BIGINT  NOT NULL DEFAULT 0,
  PRIMARY KEY (caja_id, tipo_doc)
);

ALTER TABLE pos_consecutivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_pos_consecutivos" ON pos_consecutivos USING (auth.role() = 'service_role');

-- ── 4. Configuración global del POS por empresa (editable por SU) ──
CREATE TABLE IF NOT EXISTS pos_config (
  empresa_id          INTEGER PRIMARY KEY,
  bloquear_sin_stock  BOOLEAN      NOT NULL DEFAULT FALSE,
  permitir_descuentos BOOLEAN      NOT NULL DEFAULT TRUE,
  max_descuento_pct   NUMERIC(5,2) NOT NULL DEFAULT 100,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE pos_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_pos_config" ON pos_config USING (auth.role() = 'service_role');

-- ── 5. Agregar sucursal_id a pos_ventas ──────────────────────
ALTER TABLE pos_ventas
  ADD COLUMN IF NOT EXISTS sucursal_id BIGINT REFERENCES pos_sucursales(id);

-- referencia_pago ya fue agregada en 20260407_pos_referencia.sql
-- total_sinpe en pos_sesiones también

-- ── 6. Corregir trigger inv_fn_actualizar_stock_bodega ───────
-- El trigger original no consideraba el tipo (entrada/salida/ajuste),
-- sumaba siempre en lugar de restar en salidas. Se corrige aquí.
CREATE OR REPLACE FUNCTION inv_fn_actualizar_stock_bodega()
RETURNS TRIGGER AS $$
DECLARE
  delta NUMERIC;
BEGIN
  IF NEW.bodega_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo = 'entrada' THEN
    delta := NEW.cantidad;
  ELSIF NEW.tipo = 'salida' THEN
    delta := -NEW.cantidad;
  ELSE
    -- ajuste: cantidad viene con signo (positivo = entrada, negativo = salida)
    delta := NEW.cantidad;
  END IF;

  INSERT INTO inv_stock_bodega (empresa_id, producto_id, bodega_id, stock_actual, updated_at)
  VALUES (NEW.empresa_id, NEW.producto_id, NEW.bodega_id, delta, NOW())
  ON CONFLICT (empresa_id, producto_id, bodega_id) DO UPDATE
    SET stock_actual = inv_stock_bodega.stock_actual + delta,
        updated_at   = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
