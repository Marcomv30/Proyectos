-- ─────────────────────────────────────────────────────────────────────────────
-- Bodegas de Materiales + Link ERP
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. TABLA DE BODEGAS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emp_bodegas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   INTEGER NOT NULL,
  nombre       VARCHAR(100) NOT NULL,
  descripcion  TEXT,
  es_principal BOOLEAN NOT NULL DEFAULT FALSE,  -- solo una por empresa
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_bodegas_empresa ON emp_bodegas(empresa_id);

ALTER TABLE emp_bodegas ENABLE ROW LEVEL SECURITY;
CREATE POLICY emp_bodegas_all ON emp_bodegas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Bodegas iniciales (ajustar empresa_id según corresponda)
INSERT INTO emp_bodegas (empresa_id, nombre, descripcion, es_principal) VALUES
  (3, 'Empacadora',  'Bodega de materiales en planta de empaque',  TRUE),
  (3, 'Insumos',     'Bodega de insumos / materiales secundarios', FALSE)
ON CONFLICT DO NOTHING;

-- ─── 2. LINK AL CATÁLOGO ERP ─────────────────────────────────────────────────
ALTER TABLE emp_materiales
  ADD COLUMN IF NOT EXISTS inv_producto_id INTEGER;  -- FK a inv_productos del ERP

-- ─── 3. AGREGAR bodega_id A emp_inv_materiales ───────────────────────────────
-- Primero eliminamos el UNIQUE antiguo (empresa_id, material_id)
ALTER TABLE emp_inv_materiales
  DROP CONSTRAINT IF EXISTS emp_inv_materiales_empresa_id_material_id_key;

-- Columna bodega_id
ALTER TABLE emp_inv_materiales
  ADD COLUMN IF NOT EXISTS bodega_id UUID REFERENCES emp_bodegas(id);

-- Asignar la bodega principal a los registros existentes
UPDATE emp_inv_materiales im
SET bodega_id = (
  SELECT b.id FROM emp_bodegas b
  WHERE b.empresa_id = im.empresa_id AND b.es_principal = TRUE
  LIMIT 1
)
WHERE bodega_id IS NULL;

-- Hacer bodega_id NOT NULL ahora que todos tienen valor
ALTER TABLE emp_inv_materiales
  ALTER COLUMN bodega_id SET NOT NULL;

-- Nuevo UNIQUE: empresa + material + bodega
ALTER TABLE emp_inv_materiales
  ADD CONSTRAINT emp_inv_mat_empresa_material_bodega
  UNIQUE (empresa_id, material_id, bodega_id);

CREATE INDEX IF NOT EXISTS idx_emp_inv_mat_bodega ON emp_inv_materiales(bodega_id);

-- ─── 4. AGREGAR bodega_id A emp_mov_materiales ───────────────────────────────
-- bodega_id        = bodega donde ocurre la entrada o salida
-- bodega_destino_id = solo para tipo='traslado' (destino del traslado)
ALTER TABLE emp_mov_materiales
  ADD COLUMN IF NOT EXISTS bodega_id         UUID REFERENCES emp_bodegas(id),
  ADD COLUMN IF NOT EXISTS bodega_destino_id UUID REFERENCES emp_bodegas(id);

-- Ampliar el CHECK de tipo para incluir traslado
ALTER TABLE emp_mov_materiales
  DROP CONSTRAINT IF EXISTS emp_mov_materiales_tipo_check;

ALTER TABLE emp_mov_materiales
  ADD CONSTRAINT emp_mov_materiales_tipo_check
  CHECK (tipo IN ('entrada', 'salida', 'traslado'));

-- Asignar bodega principal a movimientos existentes
UPDATE emp_mov_materiales mv
SET bodega_id = (
  SELECT b.id FROM emp_bodegas b
  WHERE b.empresa_id = mv.empresa_id AND b.es_principal = TRUE
  LIMIT 1
)
WHERE bodega_id IS NULL;

ALTER TABLE emp_mov_materiales
  ALTER COLUMN bodega_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_emp_mov_mat_bodega ON emp_mov_materiales(bodega_id);

-- ─── 5. TRIGGER ACTUALIZAR STOCK (bodega-aware) ──────────────────────────────
CREATE OR REPLACE FUNCTION emp_fn_actualizar_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo = 'traslado' THEN
    -- Salida de bodega origen
    INSERT INTO emp_inv_materiales (empresa_id, material_id, bodega_id, stock_actual, ultima_actualizacion)
    VALUES (NEW.empresa_id, NEW.material_id, NEW.bodega_id, -NEW.cantidad, NOW())
    ON CONFLICT (empresa_id, material_id, bodega_id) DO UPDATE
      SET stock_actual          = emp_inv_materiales.stock_actual - NEW.cantidad,
          ultima_actualizacion  = NOW();

    -- Entrada a bodega destino
    INSERT INTO emp_inv_materiales (empresa_id, material_id, bodega_id, stock_actual, ultima_actualizacion)
    VALUES (NEW.empresa_id, NEW.material_id, NEW.bodega_destino_id, NEW.cantidad, NOW())
    ON CONFLICT (empresa_id, material_id, bodega_id) DO UPDATE
      SET stock_actual          = emp_inv_materiales.stock_actual + NEW.cantidad,
          ultima_actualizacion  = NOW();

  ELSE
    -- entrada (+) o salida (-)
    INSERT INTO emp_inv_materiales (empresa_id, material_id, bodega_id, stock_actual, ultima_actualizacion)
    VALUES (NEW.empresa_id, NEW.material_id, NEW.bodega_id,
            CASE NEW.tipo WHEN 'entrada' THEN NEW.cantidad ELSE -NEW.cantidad END,
            NOW())
    ON CONFLICT (empresa_id, material_id, bodega_id) DO UPDATE
      SET stock_actual          = emp_inv_materiales.stock_actual +
                                  CASE NEW.tipo WHEN 'entrada' THEN NEW.cantidad ELSE -NEW.cantidad END,
          ultima_actualizacion  = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- El trigger ya existe, solo se reemplazó la función — no hay que recrearlo.
