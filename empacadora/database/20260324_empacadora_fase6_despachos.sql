-- ============================================================
-- EMPACADORA DE PIÑA — Fase 6: Boleta de Despacho
-- Fecha: 2026-03-24
-- Tabla: emp_despachos + FK despacho_id en emp_boletas
-- Una boleta de despacho = un contenedor cargado
-- ============================================================

-- ─── BOLETAS DE DESPACHO ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS emp_despachos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        INTEGER NOT NULL,

  -- Numeración
  codigo            VARCHAR(20),          -- 'BD-0001' (autogenerado)
  numero            INTEGER,              -- número secuencial de boleta (2082, 2083…)

  -- Referencias
  semana_id         UUID REFERENCES emp_semanas(id),
  programa_id       UUID REFERENCES emp_programas(id),   -- ORP de origen

  -- Destino y barco (desnorm para evitar JOIN al programa)
  cliente_id        INTEGER,
  cliente_nombre    VARCHAR(200),
  destino_id        UUID REFERENCES emp_destinos(id),
  destino_nombre    VARCHAR(100),
  naviera           VARCHAR(150),
  barco             VARCHAR(150),

  -- Fechas y horas de operación
  fecha_apertura    DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_apertura     TIME,
  fecha_cierre      DATE,
  hora_cierre       TIME,

  -- Contenedor
  contenedor        VARCHAR(30),          -- SEKU9348367
  tipo_contenedor   VARCHAR(30) DEFAULT 'Estándar',
  clase_contenedor  VARCHAR(30) DEFAULT 'HIGH CUBE',

  -- Control de temperatura y seguridad
  marchamo_llegada  VARCHAR(30),
  marchamo_salida   VARCHAR(30),
  termografo        VARCHAR(30),

  -- Totales (actualizados por trigger)
  total_cajas       INTEGER NOT NULL DEFAULT 0,
  total_paletas     INTEGER NOT NULL DEFAULT 0,
  total_frutas      INTEGER NOT NULL DEFAULT 0,
  peso_bruto        DECIMAL(10, 3),
  peso_neto         DECIMAL(10, 3),

  -- Estado
  cerrada           BOOLEAN NOT NULL DEFAULT FALSE,
  notas             TEXT,

  -- Auditoría
  usuario_id        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_emp_des_empresa  ON emp_despachos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_emp_des_semana   ON emp_despachos(semana_id);
CREATE INDEX IF NOT EXISTS idx_emp_des_programa ON emp_despachos(programa_id);
CREATE INDEX IF NOT EXISTS idx_emp_des_fecha    ON emp_despachos(fecha_apertura);

-- Secuencia y código BD
CREATE SEQUENCE IF NOT EXISTS emp_despachos_seq START 2082;  -- arranca donde quedó el AppSheet

CREATE OR REPLACE FUNCTION emp_fn_codigo_despacho()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := nextval('emp_despachos_seq');
  END IF;
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    NEW.codigo := 'BD-' || LPAD(NEW.numero::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_emp_codigo_despacho
  BEFORE INSERT ON emp_despachos
  FOR EACH ROW EXECUTE FUNCTION emp_fn_codigo_despacho();

-- ─── RELACIÓN BOLETAS ↔ DESPACHO ─────────────────────────────
-- Agregar FK despacho_id a emp_boletas
ALTER TABLE emp_boletas
  ADD COLUMN IF NOT EXISTS despacho_id UUID REFERENCES emp_despachos(id);

CREATE INDEX IF NOT EXISTS idx_emp_bol_despacho ON emp_boletas(despacho_id);

-- ─── TRIGGER: recalcular totales del despacho ────────────────
CREATE OR REPLACE FUNCTION emp_fn_totales_despacho()
RETURNS TRIGGER AS $$
DECLARE
  v_des_id UUID;
BEGIN
  v_des_id := COALESCE(NEW.despacho_id, OLD.despacho_id);
  IF v_des_id IS NULL THEN RETURN NEW; END IF;

  UPDATE emp_despachos
  SET
    total_paletas = (SELECT COUNT(*)           FROM emp_boletas WHERE despacho_id = v_des_id),
    total_cajas   = (SELECT COALESCE(SUM(cajas_empacadas), 0) FROM emp_boletas WHERE despacho_id = v_des_id),
    total_frutas  = (SELECT COALESCE(SUM(total_frutas), 0)    FROM emp_boletas WHERE despacho_id = v_des_id)
  WHERE id = v_des_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_emp_totales_despacho
  AFTER INSERT OR UPDATE OR DELETE ON emp_boletas
  FOR EACH ROW EXECUTE FUNCTION emp_fn_totales_despacho();

-- ─── ACTUALIZAR trazabilidad en boletas al asignar despacho ──
-- El código de trazabilidad usa el número del despacho
-- Formato: B + [numero_despacho 4dig] + DDMMYY + [num_calibre 2dig] + [num_paleta 2dig]
CREATE OR REPLACE FUNCTION emp_fn_set_trazabilidad()
RETURNS TRIGGER AS $$
DECLARE
  v_num   INTEGER;
  v_fecha VARCHAR(6);
  v_cal   VARCHAR(2);
  v_pal   VARCHAR(2);
BEGIN
  -- Solo generar si se asigna despacho y no tiene trazabilidad
  IF NEW.despacho_id IS NOT NULL AND (NEW.trazabilidad IS NULL OR NEW.trazabilidad = '') THEN
    SELECT numero INTO v_num FROM emp_despachos WHERE id = NEW.despacho_id;
    v_fecha := TO_CHAR(NEW.fecha, 'DDMMYY');
    v_cal   := LPAD(REGEXP_REPLACE(COALESCE(NEW.calibre_nombre, '0'), '[^0-9]', '', 'g'), 2, '0');
    v_pal   := LPAD(NEW.numero_paleta::TEXT, 2, '0');
    NEW.trazabilidad := 'B' || LPAD(v_num::TEXT, 4, '0') || v_fecha || v_cal || v_pal;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_emp_trazabilidad
  BEFORE INSERT OR UPDATE OF despacho_id ON emp_boletas
  FOR EACH ROW EXECUTE FUNCTION emp_fn_set_trazabilidad();

-- ─── VISTA: boleta de despacho completa ──────────────────────
CREATE OR REPLACE VIEW v_emp_despacho_completo AS
SELECT
  d.empresa_id,
  d.id             AS despacho_id,
  d.codigo,
  d.numero,
  s.codigo         AS semana,
  p.codigo         AS orp,
  d.cliente_nombre,
  d.destino_nombre,
  d.naviera,
  d.barco,
  d.fecha_apertura,
  d.hora_apertura,
  d.fecha_cierre,
  d.hora_cierre,
  d.contenedor,
  d.tipo_contenedor,
  d.clase_contenedor,
  d.marchamo_llegada,
  d.marchamo_salida,
  d.termografo,
  d.total_paletas,
  d.total_cajas,
  d.total_frutas,
  d.peso_bruto,
  d.peso_neto,
  d.cerrada
FROM emp_despachos d
LEFT JOIN emp_semanas  s ON s.id = d.semana_id
LEFT JOIN emp_programas p ON p.id = d.programa_id;

-- ─── RLS ──────────────────────────────────────────────────────
ALTER TABLE emp_despachos ENABLE ROW LEVEL SECURITY;
CREATE POLICY emp_despachos_all ON emp_despachos FOR ALL TO authenticated USING (true) WITH CHECK (true);
