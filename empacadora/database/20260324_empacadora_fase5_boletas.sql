-- ============================================================
-- EMPACADORA DE PIÑA — Fase 5: Boletas de Empaque
-- Fecha: 2026-03-24
-- Tabla: emp_boletas
-- Una boleta = una paleta empacada
-- ============================================================

-- ─── BOLETAS DE EMPAQUE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS emp_boletas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        INTEGER NOT NULL,

  -- Referencias al programa
  programa_id       UUID REFERENCES emp_programas(id),           -- ORP
  programa_det_id   UUID REFERENCES emp_programas_detalle(id),   -- OPC

  -- Referencia a recepción de fruta
  recepcion_id      UUID REFERENCES emp_recepciones(id),

  -- Semana
  semana_id         UUID REFERENCES emp_semanas(id),

  -- Datos de la paleta
  numero_paleta     INTEGER NOT NULL,
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Producto
  calibre_id        UUID REFERENCES emp_calibres(id),
  calibre_nombre    VARCHAR(20),           -- desnorm: 'COR 6'
  tipo              VARCHAR(10) DEFAULT 'COR' CHECK (tipo IN ('COR', 'CRW')),
  marca_id          UUID REFERENCES emp_marcas(id),
  marca_nombre      VARCHAR(150),          -- desnorm

  -- Lote de cosecha
  lote              VARCHAR(30),

  -- Cantidades
  frutas_por_caja   INTEGER NOT NULL,      -- según calibre
  cajas_por_paleta  INTEGER NOT NULL,      -- programadas
  cajas_empacadas   INTEGER NOT NULL DEFAULT 0,  -- real
  puchos            INTEGER NOT NULL DEFAULT 0,  -- frutas residuales
  puchos_2          INTEGER NOT NULL DEFAULT 0,
  puchos_3          INTEGER NOT NULL DEFAULT 0,
  total_frutas      INTEGER GENERATED ALWAYS AS
                      (cajas_empacadas * frutas_por_caja + puchos + puchos_2 + puchos_3)
                    STORED,

  -- Tipo de estiba
  tarina            VARCHAR(20) DEFAULT 'EUROPEA' CHECK (tarina IN ('EUROPEA', 'AMERICANA')),

  -- Trazabilidad
  trazabilidad      VARCHAR(50),
  trazabilidad_2    VARCHAR(50),
  trazabilidad_3    VARCHAR(50),

  -- Estado
  aplica            BOOLEAN NOT NULL DEFAULT FALSE,  -- paleta aplicada/cerrada

  -- Auditoría
  usuario_id        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_emp_bol_empresa     ON emp_boletas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_emp_bol_programa    ON emp_boletas(programa_id);
CREATE INDEX IF NOT EXISTS idx_emp_bol_opc         ON emp_boletas(programa_det_id);
CREATE INDEX IF NOT EXISTS idx_emp_bol_semana      ON emp_boletas(semana_id);
CREATE INDEX IF NOT EXISTS idx_emp_bol_fecha       ON emp_boletas(fecha);
CREATE INDEX IF NOT EXISTS idx_emp_bol_recepcion   ON emp_boletas(recepcion_id);
CREATE INDEX IF NOT EXISTS idx_emp_bol_marca       ON emp_boletas(marca_id);
CREATE INDEX IF NOT EXISTS idx_emp_bol_calibre     ON emp_boletas(calibre_id);

-- ─── TRIGGER: actualizar paletas_producidas en el OPC ────────
CREATE OR REPLACE FUNCTION emp_fn_actualizar_paletas()
RETURNS TRIGGER AS $$
DECLARE
  v_det_id  UUID;
  v_prog_id UUID;
BEGIN
  -- Determinar el OPC afectado
  v_det_id  := COALESCE(NEW.programa_det_id, OLD.programa_det_id);
  v_prog_id := COALESCE(NEW.programa_id,     OLD.programa_id);

  IF v_det_id IS NOT NULL THEN
    -- Recalcular paletas producidas del OPC
    UPDATE emp_programas_detalle
    SET paletas_producidas = (
      SELECT COUNT(*) FROM emp_boletas
      WHERE programa_det_id = v_det_id
        AND aplica = TRUE
    )
    WHERE id = v_det_id;
  END IF;

  IF v_prog_id IS NOT NULL THEN
    -- Recalcular paletas empacadas del ORP (suma de todos sus OPC)
    UPDATE emp_programas
    SET paletas_empacadas = (
      SELECT COALESCE(SUM(paletas_producidas), 0)
      FROM emp_programas_detalle
      WHERE programa_id = v_prog_id
    )
    WHERE id = v_prog_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_emp_actualizar_paletas
  AFTER INSERT OR UPDATE OR DELETE ON emp_boletas
  FOR EACH ROW EXECUTE FUNCTION emp_fn_actualizar_paletas();

-- ─── FUNCIÓN: generar código de trazabilidad ─────────────────
-- Formato: B + [codigo_recepcion 4dig] + DDMMYY + [num_calibre 2dig] + [num_paleta 2dig]
-- Ej: B88632806250601 = recepcion 8863, 28/06/25, COR 6, paleta 01
CREATE OR REPLACE FUNCTION emp_fn_trazabilidad(
  p_codigo_recepcion VARCHAR,
  p_fecha DATE,
  p_calibre_nombre VARCHAR,
  p_numero_paleta INTEGER
) RETURNS VARCHAR AS $$
DECLARE
  v_rec    VARCHAR(4);
  v_fecha  VARCHAR(6);
  v_cal    VARCHAR(2);
  v_pal    VARCHAR(2);
BEGIN
  -- Últimos 4 caracteres del código de recepción
  v_rec   := LPAD(RIGHT(COALESCE(p_codigo_recepcion, '0'), 4), 4, '0');
  -- Fecha DDMMYY
  v_fecha := TO_CHAR(p_fecha, 'DDMMYY');
  -- Número del calibre (últimos 2 dígitos del nombre, ej 'COR 6' → '06')
  v_cal   := LPAD(REGEXP_REPLACE(COALESCE(p_calibre_nombre, '0'), '[^0-9]', '', 'g'), 2, '0');
  -- Número de paleta
  v_pal   := LPAD(p_numero_paleta::TEXT, 2, '0');

  RETURN 'B' || v_rec || v_fecha || v_cal || v_pal;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─── VISTA: control de empaque (equivalente al AppSheet) ──────
CREATE OR REPLACE VIEW v_emp_control_empaque AS
SELECT
  b.empresa_id,
  pd.empresa_id                                     AS opc_empresa,
  pd.id                                             AS opc_id,
  p.codigo                                          AS orp,
  p.cliente_nombre,
  p.naviera,
  d.nombre                                          AS destino,
  s.codigo                                          AS semana,
  b.id                                              AS boleta_id,
  b.numero_paleta,
  b.fecha,
  b.calibre_nombre,
  b.marca_nombre,
  b.tipo,
  b.lote,
  b.frutas_por_caja,
  b.cajas_por_paleta,
  b.cajas_empacadas,
  b.puchos,
  b.total_frutas,
  b.tarina,
  b.trazabilidad,
  b.aplica,
  b.created_at
FROM emp_boletas b
LEFT JOIN emp_programas_detalle pd ON pd.id = b.programa_det_id
LEFT JOIN emp_programas         p  ON p.id  = b.programa_id
LEFT JOIN emp_destinos          d  ON d.id  = p.destino_id
LEFT JOIN emp_semanas           s  ON s.id  = b.semana_id;

-- ─── RLS ──────────────────────────────────────────────────────
ALTER TABLE emp_boletas ENABLE ROW LEVEL SECURITY;
CREATE POLICY emp_boletas_all ON emp_boletas FOR ALL TO authenticated USING (true) WITH CHECK (true);
