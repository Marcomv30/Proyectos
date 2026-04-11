-- ============================================================
-- EMPACADORA DE PIÑA — Correcciones post-revisión lógica
-- Fecha: 2026-03-24
-- 1. Fix trigger trazabilidad: usa recepcion.codigo, no despacho.numero
-- 2. Agrega fruta_rechazo + tipo_rechazo a emp_recepciones
-- ============================================================

-- ─── 1. RECHAZO EN RECEPCIONES ───────────────────────────────
ALTER TABLE emp_recepciones
  ADD COLUMN IF NOT EXISTS fruta_rechazo  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tipo_rechazo   VARCHAR(20) CHECK (tipo_rechazo IN ('devolucion', 'mercado_nacional')),
  ADD COLUMN IF NOT EXISTS precio_rechazo DECIMAL(12, 2),   -- precio unitario para factura mercado nacional
  ADD COLUMN IF NOT EXISTS notas_rechazo  TEXT;

-- Vista actualizada con rechazo calculado
-- rechazo_calculado = total_frutas - fruta_empacada - fruta_jugo (diferencia)
-- fruta_rechazo = lo que se registra explícitamente
CREATE OR REPLACE VIEW v_emp_recepciones_semana AS
SELECT
  r.empresa_id,
  s.codigo                AS semana,
  s.fecha_inicio,
  COUNT(r.id)             AS total_viajes,
  SUM(r.total_frutas)     AS total_frutas,
  SUM(r.fruta_empacada)   AS frutas_empacadas,
  SUM(r.fruta_jugo)       AS frutas_jugo,
  SUM(r.fruta_rechazo)    AS frutas_rechazo,
  SUM(r.total_frutas)
    - COALESCE(SUM(r.fruta_empacada), 0)
    - COALESCE(SUM(r.fruta_jugo), 0)
    - COALESCE(SUM(r.fruta_rechazo), 0)
                          AS frutas_pendientes
FROM emp_recepciones r
LEFT JOIN emp_semanas s ON s.id = r.semana_id
GROUP BY r.empresa_id, s.codigo, s.fecha_inicio;

-- ─── 2. CORREGIR TRIGGER TRAZABILIDAD ────────────────────────
-- La trazabilidad usa el código de RECEPCIÓN de fruta, no el despacho.
-- Formato: B + [recepcion.codigo 4 dígitos] + DDMMYY + [calibre_num 2 dígitos] + [num_paleta 2 dígitos]
-- Ejemplo: recepcion 8863, fecha 28/06/25, COR 5 → B88632806250501

CREATE OR REPLACE FUNCTION emp_fn_set_trazabilidad()
RETURNS TRIGGER AS $$
DECLARE
  v_rec_codigo  VARCHAR;
  v_fecha       VARCHAR(6);
  v_cal         VARCHAR(2);
  v_pal         VARCHAR(2);
BEGIN
  -- Solo generar si se asigna despacho y la paleta aún no tiene trazabilidad
  IF NEW.despacho_id IS NOT NULL AND (OLD.despacho_id IS NULL OR OLD.despacho_id <> NEW.despacho_id)
     AND (NEW.trazabilidad IS NULL OR NEW.trazabilidad = '') THEN

    -- Obtener código de recepción de fruta (ej: '8863')
    IF NEW.recepcion_id IS NOT NULL THEN
      SELECT COALESCE(codigo, id::TEXT)
        INTO v_rec_codigo
        FROM emp_recepciones
       WHERE id = NEW.recepcion_id;
    END IF;

    -- Últimos 4 dígitos del código de recepción
    v_rec_codigo := LPAD(RIGHT(REGEXP_REPLACE(COALESCE(v_rec_codigo, '0'), '[^0-9]', '', 'g'), 4), 4, '0');

    -- Fecha DDMMYY
    v_fecha := TO_CHAR(NEW.fecha, 'DDMMYY');

    -- Número del calibre (ej: 'COR 6' → '06', 'COR 5' → '05')
    v_cal := LPAD(REGEXP_REPLACE(COALESCE(NEW.calibre_nombre, '0'), '[^0-9]', '', 'g'), 2, '0');

    -- Número de paleta (2 dígitos)
    v_pal := LPAD(NEW.numero_paleta::TEXT, 2, '0');

    NEW.trazabilidad := 'B' || v_rec_codigo || v_fecha || v_cal || v_pal;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- El trigger ya existe (trg_emp_trazabilidad), solo se reemplaza la función
-- No es necesario recrear el trigger porque apunta a la función por nombre

-- ─── 3. TAMBIÉN: agregar programa_id a recepciones ───────────
-- La recepción entera se asigna a un ORP (la unidad de trazabilidad es la recepción)
ALTER TABLE emp_recepciones
  ADD COLUMN IF NOT EXISTS programa_id UUID REFERENCES emp_programas(id);

CREATE INDEX IF NOT EXISTS idx_emp_rec_programa ON emp_recepciones(programa_id);
