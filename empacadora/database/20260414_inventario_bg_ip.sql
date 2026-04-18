-- =============================================================================
-- Inventario BG / IP — Bodega General y en Proceso
-- 2026-04-14
-- =============================================================================

-- ── 1. Tipo de bodega + link al ERP ──────────────────────────────────────────
ALTER TABLE emp_bodegas
  ADD COLUMN IF NOT EXISTS tipo          VARCHAR(5)  DEFAULT 'BG'
    CHECK (tipo IN ('BG', 'IP', 'OTRA')),
  ADD COLUMN IF NOT EXISTS erp_bodega_id BIGINT;     -- FK lógica a inv_bodegas del ERP

COMMENT ON COLUMN emp_bodegas.tipo IS
  'BG = Bodega General (sincroniza con ERP), IP = Inventario en Proceso (planta), OTRA = uso libre';
COMMENT ON COLUMN emp_bodegas.erp_bodega_id IS
  'ID de inv_bodegas en el ERP para sincronizar movimientos (BG únicamente)';

-- Marcar bodegas existentes según es_principal
UPDATE emp_bodegas SET tipo = 'BG' WHERE es_principal = true;
UPDATE emp_bodegas SET tipo = 'OTRA' WHERE es_principal = false AND tipo IS NULL;

-- ── 2. Bodega IP: asegurar que exista una por empresa ────────────────────────
-- (se inserta solo si no existe ninguna con tipo=IP)
INSERT INTO emp_bodegas (empresa_id, nombre, descripcion, tipo, es_principal, activo)
SELECT DISTINCT empresa_id,
  'Inventario en Proceso',
  'Materiales abiertos en planta (cajas abiertas, rollos en uso)',
  'IP',
  false,
  true
FROM emp_bodegas
WHERE NOT EXISTS (
  SELECT 1 FROM emp_bodegas b2
  WHERE b2.empresa_id = emp_bodegas.empresa_id AND b2.tipo = 'IP'
);

-- ── 3. Tabla de conversión de unidades ───────────────────────────────────────
-- Para materiales que ingresan en caja cerrada (colillas, etiquetas, etc.)
-- Permite llevar saldo en BG como "cajas" y en IP como "unidades"

CREATE TABLE IF NOT EXISTS emp_inv_conversion (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           INTEGER NOT NULL,
  material_id          UUID NOT NULL REFERENCES emp_materiales(id) ON DELETE CASCADE,
  unidad_compra        VARCHAR(50) NOT NULL DEFAULT 'caja',
  unidades_por_paquete NUMERIC(12, 4) NOT NULL,   -- ej: 1000 etiquetas por caja
  unidad_uso           VARCHAR(50) NOT NULL DEFAULT 'unidad',
  notas                TEXT,
  activo               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (empresa_id, material_id)
);

COMMENT ON TABLE emp_inv_conversion IS
  'Conversión de unidad de compra (caja cerrada) a unidad de uso (unidad suelta). '
  'Aplica a materiales que ingresan en BG por caja y se trasladan a IP por unidades.';

ALTER TABLE emp_inv_conversion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emp_inv_conversion_all" ON emp_inv_conversion
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_emp_inv_conv_mat ON emp_inv_conversion (empresa_id, material_id);

-- ── 4. Columnas adicionales en emp_inv_materiales ────────────────────────────
-- Llevar saldo en unidades Y en paquetes (cajas) para BG
ALTER TABLE emp_inv_materiales
  ADD COLUMN IF NOT EXISTS stock_paquetes NUMERIC(12, 4) DEFAULT 0;

COMMENT ON COLUMN emp_inv_materiales.stock_paquetes IS
  'Saldo en unidad de compra (cajas cerradas). Solo aplica a bodega BG con conversión definida.';

-- ── 5. Columnas adicionales en emp_mov_materiales ────────────────────────────
ALTER TABLE emp_mov_materiales
  ADD COLUMN IF NOT EXISTS cantidad_paquetes  NUMERIC(12, 4),  -- cajas abiertas en traslado BG→IP
  ADD COLUMN IF NOT EXISTS origen_tipo        VARCHAR(20),     -- 'xml_fe','apertura_caja','boleta','ajuste','manual'
  ADD COLUMN IF NOT EXISTS erp_sincronizado   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS erp_mov_id         BIGINT;          -- ID en inv_movimientos del ERP

COMMENT ON COLUMN emp_mov_materiales.origen_tipo IS
  'xml_fe = ingreso automático FE | apertura_caja = traslado BG→IP | boleta = descarga boleta | ajuste = manual';

-- ── 6. Trigger actualizado: descarga desde IP, no desde BG ──────────────────
CREATE OR REPLACE FUNCTION emp_fn_descarga_boleta()
RETURNS TRIGGER AS $$
DECLARE
  v_bodega_ip_id  UUID;
  v_paletas       INTEGER;
  v_ref           TEXT;
  v_frutas        INTEGER;
  r               RECORD;
BEGIN
  -- Solo actuar cuando aplica cambia de valor
  IF NEW.aplica = OLD.aplica THEN RETURN NEW; END IF;

  -- Bodega IP de la empresa (donde están los materiales disponibles para producción)
  SELECT id INTO v_bodega_ip_id
  FROM emp_bodegas
  WHERE empresa_id = NEW.empresa_id AND tipo = 'IP' AND activo = true
  LIMIT 1;

  -- Fallback: bodega principal si no hay IP definida
  IF v_bodega_ip_id IS NULL THEN
    SELECT id INTO v_bodega_ip_id
    FROM emp_bodegas
    WHERE empresa_id = NEW.empresa_id AND es_principal = true
    LIMIT 1;
  END IF;

  IF v_bodega_ip_id IS NULL THEN RETURN NEW; END IF;

  v_ref    := 'PAL-' || NEW.numero_paleta::text;
  v_frutas := (NEW.cajas_empacadas * NEW.frutas_por_caja)
              + NEW.puchos + NEW.puchos_2 + NEW.puchos_3;
  v_paletas := GREATEST(1, CEIL(
    NEW.cajas_empacadas::NUMERIC / NULLIF(NEW.cajas_por_paleta, 0)
  ));

  -- ── CIERRE (aplica = true): generar salidas desde IP ─────────────────────
  IF NEW.aplica = true THEN

    -- A. Materiales definidos en calibre_materiales (por caja)
    --    cantidad = cajas_empacadas × cantidad_config
    FOR r IN
      SELECT cm.material_id, cm.cantidad
      FROM emp_calibre_materiales cm
      WHERE cm.empresa_id  = NEW.empresa_id
        AND cm.calibre_id  = NEW.calibre_id
        AND (cm.marca_id   = NEW.marca_id OR cm.marca_id IS NULL)
      ORDER BY (cm.marca_id IS NULL) ASC  -- marca específica tiene prioridad sobre NULL
    LOOP
      INSERT INTO emp_mov_materiales
        (empresa_id, material_id, bodega_id, tipo, cantidad, referencia, notas, boleta_id, fecha, origen_tipo)
      VALUES
        (NEW.empresa_id, r.material_id, v_bodega_ip_id, 'salida',
         NEW.cajas_empacadas * r.cantidad,
         v_ref,
         'Descarga calibre_mat — ' || v_ref,
         NEW.id, NOW()::date, 'boleta');
    END LOOP;

    -- B. Materiales por paleta/tarima (fleje, tarima, esquineros, etc.)
    FOR r IN
      SELECT material_id, cantidad
      FROM emp_config_materiales_tarima
      WHERE empresa_id = NEW.empresa_id AND activo = true
    LOOP
      INSERT INTO emp_mov_materiales
        (empresa_id, material_id, bodega_id, tipo, cantidad, referencia, notas, boleta_id, fecha, origen_tipo)
      VALUES
        (NEW.empresa_id, r.material_id, v_bodega_ip_id, 'salida',
         v_paletas * r.cantidad,
         v_ref,
         'Descarga por tarima — ' || v_ref,
         NEW.id, NOW()::date, 'boleta');
    END LOOP;

    -- C. Fallback legacy: si calibre_materiales está vacío, usar caja/colilla directos
    IF NOT EXISTS (
      SELECT 1 FROM emp_calibre_materiales
      WHERE empresa_id = NEW.empresa_id AND calibre_id = NEW.calibre_id
    ) THEN
      IF NEW.material_caja_id IS NOT NULL THEN
        INSERT INTO emp_mov_materiales
          (empresa_id, material_id, bodega_id, tipo, cantidad, referencia, notas, boleta_id, fecha, origen_tipo)
        VALUES
          (NEW.empresa_id, NEW.material_caja_id, v_bodega_ip_id, 'salida',
           NEW.cajas_empacadas, v_ref, 'Descarga bandeja (legacy) — ' || v_ref,
           NEW.id, NOW()::date, 'boleta');
      END IF;
      IF NEW.material_colilla_id IS NOT NULL THEN
        INSERT INTO emp_mov_materiales
          (empresa_id, material_id, bodega_id, tipo, cantidad, referencia, notas, boleta_id, fecha, origen_tipo)
        VALUES
          (NEW.empresa_id, NEW.material_colilla_id, v_bodega_ip_id, 'salida',
           v_frutas, v_ref, 'Descarga colilla (legacy) — ' || v_ref,
           NEW.id, NOW()::date, 'boleta');
      END IF;
    END IF;

  -- ── REAPERTURA (aplica = false): revertir salidas ─────────────────────────
  ELSE
    DELETE FROM emp_mov_materiales
    WHERE boleta_id = OLD.id AND tipo = 'salida';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recrear trigger
DROP TRIGGER IF EXISTS trg_emp_descarga_boleta ON emp_boletas;
CREATE TRIGGER trg_emp_descarga_boleta
  AFTER UPDATE OF aplica ON emp_boletas
  FOR EACH ROW EXECUTE FUNCTION emp_fn_descarga_boleta();

-- ── 7. Vista de saldos consolidada (BG + IP) ─────────────────────────────────
CREATE OR REPLACE VIEW emp_v_saldos AS
SELECT
  m.empresa_id,
  m.id                                          AS material_id,
  m.codigo,
  m.nombre,
  m.tipo                                        AS material_tipo,
  m.unidad_medida,
  m.stock_minimo,
  -- Saldo en BG (Bodega General)
  COALESCE(bg.stock_actual,    0)               AS stock_bg,
  COALESCE(bg.stock_paquetes,  0)               AS stock_bg_paquetes,
  -- Saldo en IP (Inventario en Proceso)
  COALESCE(ip.stock_actual,    0)               AS stock_ip,
  -- Total disponible (BG + IP en unidades)
  COALESCE(bg.stock_actual, 0) + COALESCE(ip.stock_actual, 0) AS stock_total,
  -- Conversión definida
  c.unidad_compra,
  c.unidades_por_paquete,
  c.unidad_uso,
  -- Bodega IDs
  b_bg.id                                       AS bodega_bg_id,
  b_ip.id                                       AS bodega_ip_id,
  -- Alerta
  CASE
    WHEN (COALESCE(bg.stock_actual,0) + COALESCE(ip.stock_actual,0)) <= 0 THEN 'agotado'
    WHEN (COALESCE(bg.stock_actual,0) + COALESCE(ip.stock_actual,0)) <= m.stock_minimo THEN 'minimo'
    ELSE 'ok'
  END                                           AS estado_stock
FROM emp_materiales m
-- Bodega BG
LEFT JOIN emp_bodegas b_bg ON b_bg.empresa_id = m.empresa_id AND b_bg.tipo = 'BG'
LEFT JOIN emp_inv_materiales bg
  ON bg.material_id = m.id AND bg.bodega_id = b_bg.id
-- Bodega IP
LEFT JOIN emp_bodegas b_ip ON b_ip.empresa_id = m.empresa_id AND b_ip.tipo = 'IP'
LEFT JOIN emp_inv_materiales ip
  ON ip.material_id = m.id AND ip.bodega_id = b_ip.id
-- Conversión
LEFT JOIN emp_inv_conversion c
  ON c.material_id = m.id AND c.empresa_id = m.empresa_id
WHERE m.activo = true;

-- ── 8. Función: apertura de caja (BG → IP) ───────────────────────────────────
-- Uso: SELECT emp_abrir_caja(empresa_id, material_id, n_cajas, usuario_id)
CREATE OR REPLACE FUNCTION emp_abrir_caja(
  p_empresa_id  INTEGER,
  p_material_id UUID,
  p_cajas       NUMERIC,       -- cantidad de cajas a abrir
  p_usuario_id  UUID DEFAULT NULL,
  p_notas       TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_bg_id      UUID;
  v_ip_id      UUID;
  v_conv       RECORD;
  v_unidades   NUMERIC;
BEGIN
  -- Obtener bodegas
  SELECT id INTO v_bg_id FROM emp_bodegas
  WHERE empresa_id = p_empresa_id AND tipo = 'BG' AND activo = true LIMIT 1;

  SELECT id INTO v_ip_id FROM emp_bodegas
  WHERE empresa_id = p_empresa_id AND tipo = 'IP' AND activo = true LIMIT 1;

  IF v_bg_id IS NULL OR v_ip_id IS NULL THEN
    RAISE EXCEPTION 'No se encontraron bodegas BG e IP para la empresa %', p_empresa_id;
  END IF;

  -- Obtener conversión
  SELECT * INTO v_conv FROM emp_inv_conversion
  WHERE empresa_id = p_empresa_id AND material_id = p_material_id AND activo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El material no tiene tabla de conversión definida. Configurá las unidades por caja primero.';
  END IF;

  v_unidades := p_cajas * v_conv.unidades_por_paquete;

  -- Salida de BG (en unidades: cajas × unidades_por_paquete)
  INSERT INTO emp_mov_materiales
    (empresa_id, material_id, bodega_id, bodega_destino_id, tipo,
     cantidad, cantidad_paquetes, referencia, notas, usuario_id, fecha, origen_tipo)
  VALUES
    (p_empresa_id, p_material_id, v_bg_id, v_ip_id, 'traslado',
     v_unidades, p_cajas,
     'APERTURA-' || to_char(NOW(), 'YYYYMMDD-HH24MI'),
     COALESCE(p_notas, 'Apertura de ' || p_cajas || ' ' || v_conv.unidad_compra),
     p_usuario_id, NOW()::date, 'apertura_caja');

  -- También actualizar stock_paquetes en BG (restar cajas)
  UPDATE emp_inv_materiales
  SET stock_paquetes       = GREATEST(0, COALESCE(stock_paquetes, 0) - p_cajas),
      ultima_actualizacion = NOW()
  WHERE empresa_id = p_empresa_id
    AND material_id = p_material_id
    AND bodega_id   = v_bg_id;

  RETURN 'OK: ' || v_unidades || ' ' || v_conv.unidad_uso
         || ' trasladadas a IP (' || p_cajas || ' ' || v_conv.unidad_compra || ')';
END;
$$ LANGUAGE plpgsql;

-- ── 9. Función: registrar entrada XML (BG) ────────────────────────────────────
-- Uso: SELECT emp_entrada_xml(empresa_id, material_id, cantidad_cajas, referencia_xml)
CREATE OR REPLACE FUNCTION emp_entrada_xml(
  p_empresa_id  INTEGER,
  p_material_id UUID,
  p_cantidad    NUMERIC,         -- en unidad de compra (cajas, rollos, etc.)
  p_referencia  VARCHAR(100),    -- número de factura electrónica
  p_costo       NUMERIC DEFAULT 0,
  p_usuario_id  UUID DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_bg_id    UUID;
  v_conv     RECORD;
  v_unidades NUMERIC;
BEGIN
  SELECT id INTO v_bg_id FROM emp_bodegas
  WHERE empresa_id = p_empresa_id AND tipo = 'BG' AND activo = true LIMIT 1;

  IF v_bg_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró bodega BG para la empresa %', p_empresa_id;
  END IF;

  -- Conversión a unidades
  SELECT * INTO v_conv FROM emp_inv_conversion
  WHERE empresa_id = p_empresa_id AND material_id = p_material_id AND activo = true;

  IF FOUND THEN
    v_unidades := p_cantidad * v_conv.unidades_por_paquete;
  ELSE
    v_unidades := p_cantidad; -- sin conversión, entra directo en unidades
  END IF;

  -- Movimiento de entrada en BG
  INSERT INTO emp_mov_materiales
    (empresa_id, material_id, bodega_id, tipo, cantidad, cantidad_paquetes,
     referencia, notas, usuario_id, fecha, origen_tipo)
  VALUES
    (p_empresa_id, p_material_id, v_bg_id, 'entrada',
     v_unidades, CASE WHEN FOUND THEN p_cantidad ELSE NULL END,
     p_referencia,
     'Ingreso FE: ' || p_referencia,
     p_usuario_id, NOW()::date, 'xml_fe');

  -- Actualizar stock_paquetes en BG si hay conversión
  IF v_conv IS NOT NULL THEN
    UPDATE emp_inv_materiales
    SET stock_paquetes       = COALESCE(stock_paquetes, 0) + p_cantidad,
        ultima_actualizacion = NOW()
    WHERE empresa_id = p_empresa_id
      AND material_id = p_material_id
      AND bodega_id   = v_bg_id;
  END IF;

  RETURN 'OK: ' || v_unidades || ' unidades ingresadas a BG (ref: ' || p_referencia || ')';
END;
$$ LANGUAGE plpgsql;
