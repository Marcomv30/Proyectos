-- ─────────────────────────────────────────────────────────────────────────────
-- Bodegas de Inventario (Opción A: stock_actual global se mantiene,
-- inv_stock_bodega agrega desglose por bodega sin romper nada existente)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. TABLA inv_bodegas ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inv_bodegas (
  id           BIGSERIAL PRIMARY KEY,
  empresa_id   INTEGER NOT NULL,
  nombre       VARCHAR(100) NOT NULL,
  descripcion  TEXT,
  es_principal BOOLEAN NOT NULL DEFAULT FALSE,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_bodegas_empresa ON inv_bodegas(empresa_id);

ALTER TABLE inv_bodegas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_bodegas_all" ON inv_bodegas FOR ALL USING (true) WITH CHECK (true);

-- ─── 2. STOCK POR BODEGA (snapshot, actualizado por trigger) ─────────────────
CREATE TABLE IF NOT EXISTS inv_stock_bodega (
  id            BIGSERIAL PRIMARY KEY,
  empresa_id    INTEGER NOT NULL,
  producto_id   BIGINT NOT NULL REFERENCES inv_productos(id) ON DELETE CASCADE,
  bodega_id     BIGINT NOT NULL REFERENCES inv_bodegas(id)   ON DELETE CASCADE,
  stock_actual  NUMERIC(15,4) NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (empresa_id, producto_id, bodega_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_stock_bod_empresa  ON inv_stock_bodega(empresa_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_bod_producto ON inv_stock_bodega(producto_id);
CREATE INDEX IF NOT EXISTS idx_inv_stock_bod_bodega   ON inv_stock_bodega(bodega_id);

ALTER TABLE inv_stock_bodega ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_stock_bodega_all" ON inv_stock_bodega FOR ALL USING (true) WITH CHECK (true);

-- ─── 3. bodega_id en inv_movimientos (nullable — los históricos quedan sin bodega) ──
ALTER TABLE inv_movimientos
  ADD COLUMN IF NOT EXISTS bodega_id BIGINT REFERENCES inv_bodegas(id);

CREATE INDEX IF NOT EXISTS idx_inv_mov_bodega ON inv_movimientos(bodega_id);

-- ─── 4. bodega_id por defecto en inv_productos ───────────────────────────────
ALTER TABLE inv_productos
  ADD COLUMN IF NOT EXISTS bodega_id BIGINT REFERENCES inv_bodegas(id);

-- ─── 5. TRIGGER: actualiza inv_stock_bodega cuando el movimiento tiene bodega_id ──
CREATE OR REPLACE FUNCTION inv_fn_actualizar_stock_bodega()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo actúa si el movimiento especifica bodega
  IF NEW.bodega_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO inv_stock_bodega (empresa_id, producto_id, bodega_id, stock_actual, updated_at)
  VALUES (NEW.empresa_id, NEW.producto_id, NEW.bodega_id, NEW.cantidad, NOW())
  ON CONFLICT (empresa_id, producto_id, bodega_id) DO UPDATE
    SET stock_actual = inv_stock_bodega.stock_actual + NEW.cantidad,
        updated_at   = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- El trigger existente (trg_inv_actualizar_stock) ya actualiza inv_productos.stock_actual
-- Este segundo trigger agrega el desglose por bodega encima
CREATE OR REPLACE TRIGGER trg_inv_stock_bodega
  AFTER INSERT ON inv_movimientos
  FOR EACH ROW EXECUTE FUNCTION inv_fn_actualizar_stock_bodega();

-- ─── 6. Actualizar RPC registrar_ajuste_inventario_v2 para aceptar bodega ────
CREATE OR REPLACE FUNCTION registrar_ajuste_inventario_v2(
  p_empresa_id        INTEGER,
  p_producto_id       BIGINT,
  p_cantidad          NUMERIC,
  p_fecha             DATE    DEFAULT NULL,
  p_costo_unitario    NUMERIC DEFAULT 0,
  p_referencia        TEXT    DEFAULT NULL,
  p_notas             TEXT    DEFAULT NULL,
  p_cuenta_ajuste_id  BIGINT  DEFAULT NULL,
  p_categoria_id      BIGINT  DEFAULT NULL,
  p_generar_asiento   BOOLEAN DEFAULT TRUE,
  p_bodega_id         BIGINT  DEFAULT NULL   -- NUEVO parámetro opcional
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov_id           BIGINT;
  v_producto         RECORD;
  v_asiento_id       BIGINT;
  v_seq              INTEGER;
  v_numero_fmt       TEXT;
  v_fecha            DATE;
  v_monto            NUMERIC;
  v_cuenta_inv_id    BIGINT;
  v_cuenta_ajuste    BIGINT;
  v_base_inv_id      BIGINT;
  v_base_ajuste_id   BIGINT;
  v_asiento_error    TEXT;
BEGIN
  v_fecha := COALESCE(p_fecha, (NOW() AT TIME ZONE 'America/Costa_Rica')::DATE);

  SELECT * INTO v_producto
  FROM inv_productos
  WHERE id = p_producto_id AND empresa_id = p_empresa_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Producto no encontrado');
  END IF;

  -- Insertar movimiento (ahora con bodega_id opcional)
  INSERT INTO inv_movimientos (
    empresa_id, fecha, tipo, producto_id, cantidad,
    costo_unitario, referencia, notas, bodega_id
  )
  VALUES (
    p_empresa_id, v_fecha,
    CASE WHEN p_cantidad >= 0 THEN 'ajuste' ELSE 'ajuste' END,
    p_producto_id, p_cantidad,
    p_costo_unitario, p_referencia, p_notas,
    p_bodega_id
  )
  RETURNING id INTO v_mov_id;

  -- Generar asiento contable si se solicita
  IF p_generar_asiento THEN
    v_monto := ABS(p_cantidad * COALESCE(p_costo_unitario, v_producto.costo_promedio));
    v_cuenta_inv_id   := COALESCE(v_producto.cuenta_inventario_id, p_empresa_id);
    v_cuenta_ajuste   := p_cuenta_ajuste_id;

    BEGIN
      SELECT nextval(format('seq_asientos_%s', p_empresa_id)) INTO v_seq;
      v_numero_fmt := lpad(v_seq::text, 6, '0');

      INSERT INTO asientos_contables (empresa_id, fecha, descripcion, tipo, numero, estado, categoria_id)
      VALUES (p_empresa_id, v_fecha,
              COALESCE(p_referencia, 'Ajuste inventario'),
              'ajuste_inventario', v_numero_fmt, 'borrador', p_categoria_id)
      RETURNING id INTO v_asiento_id;

      IF p_cantidad >= 0 THEN
        -- Entrada: débito inventario / crédito cuenta ajuste
        INSERT INTO lineas_asiento (asiento_id, cuenta_base_id, descripcion, debito_crc, credito_crc, debito_usd, credito_usd)
        VALUES
          (v_asiento_id, v_cuenta_inv_id, 'Entrada inventario', v_monto, 0, 0, 0),
          (v_asiento_id, v_cuenta_ajuste,  'Ajuste inventario',  0, v_monto, 0, 0);
      ELSE
        -- Salida: crédito inventario / débito cuenta ajuste
        INSERT INTO lineas_asiento (asiento_id, cuenta_base_id, descripcion, debito_crc, credito_crc, debito_usd, credito_usd)
        VALUES
          (v_asiento_id, v_cuenta_ajuste,  'Ajuste inventario',  v_monto, 0, 0, 0),
          (v_asiento_id, v_cuenta_inv_id, 'Salida inventario',   0, v_monto, 0, 0);
      END IF;

      UPDATE inv_movimientos SET asiento_id = v_asiento_id WHERE id = v_mov_id;

    EXCEPTION WHEN OTHERS THEN
      v_asiento_error := SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok',         true,
    'mov_id',     v_mov_id,
    'asiento_id', v_asiento_id,
    'asiento_error', v_asiento_error
  );
END;
$$;
