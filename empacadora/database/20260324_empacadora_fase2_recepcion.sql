-- ============================================================
-- EMPACADORA DE PIÑA — Fase 2: Recepción de Fruta
-- Fecha: 2026-03-24
-- Tablas: emp_semanas, emp_recepciones, emp_recepciones_detalle
-- ============================================================

-- ─── SEMANAS ─────────────────────────────────────────────────
-- Unidad de producción. Formato código: "26-25" (semana-año)
CREATE TABLE IF NOT EXISTS emp_semanas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    INTEGER NOT NULL,
  codigo        VARCHAR(10) NOT NULL,   -- '26-25'
  semana        INTEGER NOT NULL,       -- número de semana (1-53)
  año           INTEGER NOT NULL,
  fecha_inicio  DATE NOT NULL,
  fecha_fin     DATE,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_emp_semanas_empresa ON emp_semanas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_emp_semanas_año     ON emp_semanas(empresa_id, año);

-- ─── RECEPCIONES DE FRUTA (encabezado) ───────────────────────
-- Cada fila = un viaje/camión que llega a la planta
CREATE TABLE IF NOT EXISTS emp_recepciones (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        INTEGER NOT NULL,
  semana_id         UUID REFERENCES emp_semanas(id),
  codigo            VARCHAR(20),             -- número interno del envío (ej: 8836)
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,
  lote              VARCHAR(30),             -- lote de cosecha
  grupo_forza       VARCHAR(20),             -- código de grupo/bloque campo
  proveedor_id      UUID REFERENCES emp_proveedores_fruta(id),
  parcela_id        UUID REFERENCES emp_parcelas(id),  -- si es finca propia
  transportista_id  UUID REFERENCES emp_transportistas(id),
  placa             VARCHAR(20),             -- placa del vehículo
  hora_carga        TIME,                    -- hora en que cargó en campo
  hora_salida       TIME,                    -- hora de salida del campo
  hora_llegada      TIME,                    -- hora de llegada a planta
  total_frutas      INTEGER,                 -- total frutas contadas al llegar
  fruta_empacada    INTEGER DEFAULT 0,       -- cuántas se empacaron
  fruta_jugo        INTEGER DEFAULT 0,       -- descarte a jugo
  muestreo          TEXT,                    -- observaciones de muestreo calidad
  recibida          BOOLEAN NOT NULL DEFAULT FALSE,
  notas             TEXT,
  usuario_id        UUID,                    -- auth.users.id
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_rec_empresa     ON emp_recepciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_emp_rec_semana      ON emp_recepciones(semana_id);
CREATE INDEX IF NOT EXISTS idx_emp_rec_fecha       ON emp_recepciones(fecha);
CREATE INDEX IF NOT EXISTS idx_emp_rec_proveedor   ON emp_recepciones(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_emp_rec_lote        ON emp_recepciones(empresa_id, lote);

-- ─── RECEPCIONES DETALLE (por VIN/bloque) ────────────────────
-- Cada fila = una tarina/ventana del camión con su cantidad
CREATE TABLE IF NOT EXISTS emp_recepciones_detalle (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      INTEGER NOT NULL,
  recepcion_id    UUID NOT NULL REFERENCES emp_recepciones(id) ON DELETE CASCADE,
  vin             VARCHAR(20),    -- número de tarina/ventana dentro del camión
  lote            VARCHAR(30),    -- puede diferir del lote del encabezado
  bloque          VARCHAR(30),    -- bloque o parcela específica
  grupo_forza     VARCHAR(20),
  cantidad        INTEGER NOT NULL DEFAULT 0,
  observacion     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_rec_det_empresa    ON emp_recepciones_detalle(empresa_id);
CREATE INDEX IF NOT EXISTS idx_emp_rec_det_recepcion  ON emp_recepciones_detalle(recepcion_id);

-- ─── VISTA: resumen recepciones por semana ────────────────────
CREATE OR REPLACE VIEW v_emp_recepciones_semana AS
SELECT
  r.empresa_id,
  s.codigo              AS semana,
  s.fecha_inicio,
  COUNT(r.id)           AS total_viajes,
  SUM(r.total_frutas)   AS total_frutas,
  SUM(r.fruta_empacada) AS frutas_empacadas,
  SUM(r.fruta_jugo)     AS frutas_jugo,
  SUM(r.total_frutas) - COALESCE(SUM(r.fruta_empacada), 0) - COALESCE(SUM(r.fruta_jugo), 0)
                        AS frutas_pendientes
FROM emp_recepciones r
LEFT JOIN emp_semanas s ON s.id = r.semana_id
GROUP BY r.empresa_id, s.codigo, s.fecha_inicio;

-- ─── RLS ──────────────────────────────────────────────────────
ALTER TABLE emp_semanas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE emp_recepciones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE emp_recepciones_detalle  ENABLE ROW LEVEL SECURITY;

CREATE POLICY emp_semanas_all             ON emp_semanas             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY emp_recepciones_all         ON emp_recepciones         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY emp_recepciones_detalle_all ON emp_recepciones_detalle FOR ALL TO authenticated USING (true) WITH CHECK (true);
