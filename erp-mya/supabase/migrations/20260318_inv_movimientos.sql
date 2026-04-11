-- ============================================================
-- MYA ERP — Inventarios: Movimientos de Stock
-- ============================================================

CREATE TABLE IF NOT EXISTS inv_movimientos (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      INTEGER NOT NULL,
  fecha           DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'America/Costa_Rica')::DATE,
  tipo            VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada','salida','ajuste')),
  producto_id     BIGINT NOT NULL REFERENCES inv_productos(id),
  cantidad        NUMERIC(15,4) NOT NULL,  -- positivo siempre; ajuste puede ser negativo
  costo_unitario  NUMERIC(15,4) NOT NULL DEFAULT 0,
  referencia      VARCHAR(100),            -- # factura, OC, nota, etc.
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE inv_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_movimientos_all" ON inv_movimientos FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_inv_mov_empresa ON inv_movimientos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_producto ON inv_movimientos(producto_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_fecha ON inv_movimientos(fecha DESC);

-- ── Trigger: actualiza stock_actual en inv_productos ─────────

CREATE OR REPLACE FUNCTION fn_inv_actualizar_stock()
RETURNS TRIGGER AS $$
DECLARE
  delta NUMERIC;
BEGIN
  -- entrada → suma | salida → resta | ajuste → cantidad puede ser negativa
  IF NEW.tipo = 'entrada' THEN
    delta := NEW.cantidad;
  ELSIF NEW.tipo = 'salida' THEN
    delta := -NEW.cantidad;
  ELSE
    delta := NEW.cantidad;  -- ajuste: el usuario pasa el delta directamente
  END IF;

  UPDATE inv_productos
     SET stock_actual = stock_actual + delta,
         updated_at   = NOW()
   WHERE id = NEW.producto_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inv_actualizar_stock
AFTER INSERT ON inv_movimientos
FOR EACH ROW EXECUTE FUNCTION fn_inv_actualizar_stock();
