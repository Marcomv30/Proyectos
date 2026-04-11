-- ─────────────────────────────────────────────────────────────────────────────
-- Descarga automática de inventario al aplicar boleta
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Materiales configurables por tarima ────────────────────────────────────
CREATE TABLE IF NOT EXISTS emp_config_materiales_tarima (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   INTEGER NOT NULL,
  material_id  UUID NOT NULL REFERENCES emp_materiales(id) ON DELETE CASCADE,
  descripcion  VARCHAR(100),
  cantidad     DECIMAL(10,2) NOT NULL DEFAULT 1,
  activo       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (empresa_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_emp_cfg_tar_empresa ON emp_config_materiales_tarima(empresa_id);

ALTER TABLE emp_config_materiales_tarima ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emp_cfg_tarima_all" ON emp_config_materiales_tarima FOR ALL USING (true) WITH CHECK (true);

-- ── 2. boleta_id en emp_mov_materiales ────────────────────────────────────────
ALTER TABLE emp_mov_materiales
  ADD COLUMN IF NOT EXISTS boleta_id UUID REFERENCES emp_boletas(id);

CREATE INDEX IF NOT EXISTS idx_emp_mov_mat_boleta ON emp_mov_materiales(boleta_id);

-- ── 3. Actualizar trigger de stock para manejar DELETE ────────────────────────
CREATE OR REPLACE FUNCTION emp_fn_actualizar_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Revertir el efecto del movimiento eliminado
    UPDATE emp_inv_materiales
    SET stock_actual         = stock_actual + (CASE OLD.tipo WHEN 'entrada' THEN -OLD.cantidad ELSE OLD.cantidad END),
        ultima_actualizacion = NOW()
    WHERE empresa_id = OLD.empresa_id
      AND material_id = OLD.material_id
      AND bodega_id   = OLD.bodega_id;
    RETURN OLD;
  END IF;

  -- INSERT: lógica original
  INSERT INTO emp_inv_materiales (empresa_id, material_id, bodega_id, stock_actual, ultima_actualizacion)
  VALUES (
    NEW.empresa_id, NEW.material_id, NEW.bodega_id,
    CASE NEW.tipo WHEN 'entrada' THEN NEW.cantidad ELSE -NEW.cantidad END,
    NOW()
  )
  ON CONFLICT (empresa_id, material_id, bodega_id) DO UPDATE
    SET stock_actual         = emp_inv_materiales.stock_actual +
                               CASE NEW.tipo WHEN 'entrada' THEN NEW.cantidad ELSE -NEW.cantidad END,
        ultima_actualizacion = NOW();

  -- Traslado: también suma en bodega destino
  IF NEW.tipo = 'traslado' AND NEW.bodega_destino_id IS NOT NULL THEN
    INSERT INTO emp_inv_materiales (empresa_id, material_id, bodega_id, stock_actual, ultima_actualizacion)
    VALUES (NEW.empresa_id, NEW.material_id, NEW.bodega_destino_id, NEW.cantidad, NOW())
    ON CONFLICT (empresa_id, material_id, bodega_id) DO UPDATE
      SET stock_actual         = emp_inv_materiales.stock_actual + NEW.cantidad,
          ultima_actualizacion = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Actualizar el trigger para incluir DELETE
DROP TRIGGER IF EXISTS trg_emp_actualizar_stock ON emp_mov_materiales;
CREATE TRIGGER trg_emp_actualizar_stock
  AFTER INSERT OR DELETE ON emp_mov_materiales
  FOR EACH ROW EXECUTE FUNCTION emp_fn_actualizar_stock();

-- ── 4. Trigger de descarga al aplicar/desaplicar boleta ───────────────────────
CREATE OR REPLACE FUNCTION emp_fn_descarga_boleta()
RETURNS TRIGGER AS $$
DECLARE
  v_bodega_id  UUID;
  v_paletas    INTEGER;
  v_ref        TEXT;
  v_frutas     INTEGER;
  r            RECORD;
BEGIN
  -- Solo actuar cuando aplica cambia de valor
  IF NEW.aplica = OLD.aplica THEN
    RETURN NEW;
  END IF;

  -- Bodega principal de la empresa
  SELECT id INTO v_bodega_id
  FROM emp_bodegas
  WHERE empresa_id = NEW.empresa_id AND es_principal = true
  LIMIT 1;

  IF v_bodega_id IS NULL THEN
    RETURN NEW; -- Sin bodega configurada, ignorar
  END IF;

  v_ref := 'PAL-' || NEW.numero_paleta::text;

  -- ── CIERRE (aplica = true) ────────────────────────────────────────────────
  IF NEW.aplica = true THEN

    IF NEW.material_caja_id IS NULL THEN
      RAISE EXCEPTION 'La boleta debe tener bandeja (caja) asignada antes de aplicar';
    END IF;
    IF NEW.material_colilla_id IS NULL THEN
      RAISE EXCEPTION 'La boleta debe tener colilla asignada antes de aplicar';
    END IF;

    -- Paletas de esta boleta: ceil(cajas / cajas_por_paleta)
    v_paletas := GREATEST(1, CEIL(NEW.cajas_empacadas::NUMERIC / NULLIF(NEW.cajas_por_paleta, 0)));

    -- Total frutas (calculado manualmente para no depender de columna generada en trigger)
    v_frutas := (NEW.cajas_empacadas * NEW.frutas_por_caja) + NEW.puchos + NEW.puchos_2 + NEW.puchos_3;

    -- Descarga bandeja: 1 por caja empacada
    INSERT INTO emp_mov_materiales
      (empresa_id, material_id, bodega_id, tipo, cantidad, referencia, notas, boleta_id, fecha)
    VALUES
      (NEW.empresa_id, NEW.material_caja_id, v_bodega_id, 'salida',
       NEW.cajas_empacadas, v_ref, 'Descarga bandeja — ' || v_ref, NEW.id, NOW()::date);

    -- Descarga colilla: 1 por fruta
    INSERT INTO emp_mov_materiales
      (empresa_id, material_id, bodega_id, tipo, cantidad, referencia, notas, boleta_id, fecha)
    VALUES
      (NEW.empresa_id, NEW.material_colilla_id, v_bodega_id, 'salida',
       v_frutas, v_ref, 'Descarga colilla — ' || v_ref, NEW.id, NOW()::date);

    -- Descarga materiales configurados por tarima (fleje, tarima, etc.)
    FOR r IN
      SELECT material_id, cantidad
      FROM emp_config_materiales_tarima
      WHERE empresa_id = NEW.empresa_id AND activo = true
    LOOP
      INSERT INTO emp_mov_materiales
        (empresa_id, material_id, bodega_id, tipo, cantidad, referencia, notas, boleta_id, fecha)
      VALUES
        (NEW.empresa_id, r.material_id, v_bodega_id, 'salida',
         v_paletas * r.cantidad, v_ref, 'Descarga por tarima — ' || v_ref, NEW.id, NOW()::date);
    END LOOP;

  -- ── REAPERTURA (aplica = false) ───────────────────────────────────────────
  ELSE
    -- Eliminar los movimientos de salida de esta boleta
    -- El trigger trg_emp_actualizar_stock (AFTER DELETE) revierte el stock automáticamente
    DELETE FROM emp_mov_materiales
    WHERE boleta_id = OLD.id AND tipo = 'salida';

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_emp_descarga_boleta
  AFTER UPDATE OF aplica ON emp_boletas
  FOR EACH ROW EXECUTE FUNCTION emp_fn_descarga_boleta();
