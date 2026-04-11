-- ============================================================
-- EMPACADORA DE PIÑA — Fase 4: Programa Semanal
-- Fecha: 2026-03-24
-- Tablas: emp_destinos, emp_programas, emp_programas_detalle
-- ============================================================

-- ─── DESTINOS (puertos de exportación) ───────────────────────
CREATE TABLE IF NOT EXISTS emp_destinos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    INTEGER NOT NULL,
  nombre        VARCHAR(100) NOT NULL,   -- 'VADO', 'TARRAGONA', 'SETUBAL'
  ubicacion     TEXT,                    -- descripción o coordenadas
  cliente_id    INTEGER,                 -- cliente principal asociado
  cliente_nombre VARCHAR(200),
  contacto      VARCHAR(150),
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_emp_destinos_empresa ON emp_destinos(empresa_id);

-- Datos iniciales (del AppSheet)
INSERT INTO emp_destinos (empresa_id, nombre, ubicacion, contacto) VALUES
  (1, 'VADO',      '17047 Vado Ligure, Savona, Italia', 'Favio'),
  (1, 'TARRAGONA', 'Tarragona, España',                  'Capitán'),
  (1, 'SETUBAL',   'Setúbal, Portugal',                  'Luis Barrantes'),
  (1, 'ALGECIRAS', 'Algeciras, España',                  NULL)
ON CONFLICT (empresa_id, nombre) DO NOTHING;

-- ─── PROGRAMAS SEMANALES (ORP) ────────────────────────────────
-- Cabezal: un programa = un barco en una semana hacia un destino
CREATE TABLE IF NOT EXISTS emp_programas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          INTEGER NOT NULL,
  semana_id           UUID REFERENCES emp_semanas(id),
  codigo              VARCHAR(20),              -- 'ORP-000001' (autogenerado o manual)
  cliente_id          INTEGER,                  -- FK a terceros del ERP
  cliente_nombre      VARCHAR(200),             -- desnormalizado
  destino_id          UUID REFERENCES emp_destinos(id),
  naviera             VARCHAR(150),             -- 'COSIARMA', etc.
  barco               VARCHAR(150),             -- nombre del buque / viaje
  fecha               DATE NOT NULL,
  hora_inicio         TIME,
  hora_fin            TIME,
  paletas_programadas INTEGER NOT NULL DEFAULT 0,
  paletas_empacadas   INTEGER NOT NULL DEFAULT 0,  -- se actualiza desde boletas
  terminado           BOOLEAN NOT NULL DEFAULT FALSE,
  notas               TEXT,
  usuario_id          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_prog_empresa  ON emp_programas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_emp_prog_semana   ON emp_programas(semana_id);
CREATE INDEX IF NOT EXISTS idx_emp_prog_fecha    ON emp_programas(fecha);
CREATE INDEX IF NOT EXISTS idx_emp_prog_cliente  ON emp_programas(cliente_id);

-- Secuencia para código ORP
CREATE SEQUENCE IF NOT EXISTS emp_programas_seq START 1;

-- Función para generar código ORP automático
CREATE OR REPLACE FUNCTION emp_fn_codigo_programa()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    NEW.codigo := 'ORP-' || LPAD(nextval('emp_programas_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_emp_codigo_programa
  BEFORE INSERT ON emp_programas
  FOR EACH ROW EXECUTE FUNCTION emp_fn_codigo_programa();

-- ─── DETALLE DEL PROGRAMA (OPC) ───────────────────────────────
-- Cada fila = combinación marca + calibre con sus paletas asignadas
CREATE TABLE IF NOT EXISTS emp_programas_detalle (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          INTEGER NOT NULL,
  programa_id         UUID NOT NULL REFERENCES emp_programas(id) ON DELETE CASCADE,
  marca_id            UUID REFERENCES emp_marcas(id),
  marca_nombre        VARCHAR(150),        -- desnormalizado
  calibre_id          UUID REFERENCES emp_calibres(id),
  calibre_nombre      VARCHAR(20),         -- desnormalizado (ej: 'COR 6')
  cajas_por_paleta    INTEGER NOT NULL DEFAULT 70,
  paletas_programadas INTEGER NOT NULL DEFAULT 0,
  paletas_producidas  INTEGER NOT NULL DEFAULT 0,  -- actualizado desde boletas
  orden               INTEGER NOT NULL DEFAULT 0,   -- orden de producción
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_prog_det_empresa  ON emp_programas_detalle(empresa_id);
CREATE INDEX IF NOT EXISTS idx_emp_prog_det_programa ON emp_programas_detalle(programa_id);
CREATE INDEX IF NOT EXISTS idx_emp_prog_det_marca    ON emp_programas_detalle(marca_id);
CREATE INDEX IF NOT EXISTS idx_emp_prog_det_calibre  ON emp_programas_detalle(calibre_id);

-- ─── VISTA: resumen programa semanal ─────────────────────────
CREATE OR REPLACE VIEW v_emp_programa_semana AS
SELECT
  p.empresa_id,
  p.semana_id,
  s.codigo                              AS semana,
  p.id                                  AS programa_id,
  p.codigo                              AS orp,
  p.cliente_nombre,
  d.nombre                              AS destino,
  p.naviera,
  p.barco,
  p.fecha,
  p.paletas_programadas,
  p.paletas_empacadas,
  p.paletas_programadas - p.paletas_empacadas  AS paletas_saldo,
  p.terminado,
  ROUND(
    CASE WHEN p.paletas_programadas > 0
      THEN (p.paletas_empacadas::NUMERIC / p.paletas_programadas) * 100
      ELSE 0
    END, 1
  )                                     AS avance_pct
FROM emp_programas p
LEFT JOIN emp_semanas s   ON s.id = p.semana_id
LEFT JOIN emp_destinos d  ON d.id = p.destino_id;

-- ─── RLS ─────────────────────────────────────────────────────
ALTER TABLE emp_destinos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE emp_programas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE emp_programas_detalle  ENABLE ROW LEVEL SECURITY;

CREATE POLICY emp_destinos_all           ON emp_destinos           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY emp_programas_all          ON emp_programas          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY emp_programas_detalle_all  ON emp_programas_detalle  FOR ALL TO authenticated USING (true) WITH CHECK (true);
