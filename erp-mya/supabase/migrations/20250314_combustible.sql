-- ============================================================
-- MYA ERP — Módulo Combustible
-- Schema PostgreSQL / Supabase
-- Basado en Fusion API (ssf_pump_sales, ssf_tank_actual_info, etc.)
-- ============================================================

-- ------------------------------------------------------------
-- 1. CATÁLOGOS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS grados_combustible (
  id            SERIAL PRIMARY KEY,
  empresa_id    INTEGER NOT NULL REFERENCES empresas(id),
  grade_id      INTEGER NOT NULL,           -- grade_id de Fusion
  nombre        VARCHAR(60) NOT NULL,       -- ej. "Regular", "Super", "Diesel"
  codigo_cuenta VARCHAR(20),               -- cuenta contable nivel 5
  activo        BOOLEAN DEFAULT TRUE,
  UNIQUE (empresa_id, grade_id)
);

CREATE TABLE IF NOT EXISTS dispensadores (
  id            SERIAL PRIMARY KEY,
  empresa_id    INTEGER NOT NULL REFERENCES empresas(id),
  pump_id       INTEGER NOT NULL,           -- pump_id de Fusion
  descripcion   VARCHAR(60),
  ubicacion     VARCHAR(80),
  activo        BOOLEAN DEFAULT TRUE,
  UNIQUE (empresa_id, pump_id)
);

CREATE TABLE IF NOT EXISTS tanques_combustible (
  id            SERIAL PRIMARY KEY,
  empresa_id    INTEGER NOT NULL REFERENCES empresas(id),
  tank_id       INTEGER NOT NULL,           -- tank_id de Fusion
  grade_id      INTEGER REFERENCES grados_combustible(id),
  capacidad_litros NUMERIC(12,2),
  descripcion   VARCHAR(60),
  activo        BOOLEAN DEFAULT TRUE,
  UNIQUE (empresa_id, tank_id)
);

-- ------------------------------------------------------------
-- 2. VENTAS DE COMBUSTIBLE (ssf_pump_sales → PSL)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ventas_combustible (
  id                BIGSERIAL PRIMARY KEY,
  empresa_id        INTEGER NOT NULL REFERENCES empresas(id),

  -- Campos directos de Fusion PSL
  site_id           INTEGER,
  sale_id           BIGINT NOT NULL,        -- consecutivo Fusion, nunca se resetea
  pump_id           INTEGER NOT NULL,
  hose_id           INTEGER NOT NULL,
  grade_id          INTEGER,
  volume            NUMERIC(12,3),          -- litros
  money             NUMERIC(12,2),          -- monto
  ppu               NUMERIC(10,4),          -- precio por unidad
  price_level       INTEGER,
  sale_type         SMALLINT DEFAULT 1,     -- 1=regular, 2=no controlada
  initial_volume    NUMERIC(14,3),
  final_volume      NUMERIC(14,3),
  preset_amount     NUMERIC(12,2),

  -- Fechas reconstruidas
  start_at          TIMESTAMPTZ,
  end_at            TIMESTAMPTZ,

  -- Control interno MYA
  turno_id          INTEGER,
  asiento_id        INTEGER,               -- FK a asientos contables
  sincronizado_at   TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (empresa_id, sale_id)
);

CREATE INDEX IF NOT EXISTS idx_ventas_comb_empresa_fecha
  ON ventas_combustible (empresa_id, end_at DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_comb_pump
  ON ventas_combustible (empresa_id, pump_id, end_at DESC);

-- ------------------------------------------------------------
-- 3. NIVELES DE TANQUES (ssf_tank_actual_info → TIN)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS niveles_tanque (
  id                BIGSERIAL PRIMARY KEY,
  empresa_id        INTEGER NOT NULL REFERENCES empresas(id),
  tank_id           INTEGER NOT NULL,
  prod_vol          NUMERIC(12,3),
  prod_height       NUMERIC(10,4),
  water_vol         NUMERIC(10,3),
  water_height      NUMERIC(10,4),
  prod_temp         NUMERIC(8,3),
  tc_vol            NUMERIC(12,3),         -- volumen compensado por temperatura
  probe_status      VARCHAR(5),            -- "3"=online, "4"=error
  leido_at          TIMESTAMPTZ,
  registrado_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_niveles_tanque_empresa_tank
  ON niveles_tanque (empresa_id, tank_id, leido_at DESC);

-- Vista: último nivel por tanque
CREATE OR REPLACE VIEW v_niveles_tanque_actual AS
SELECT DISTINCT ON (empresa_id, tank_id)
  empresa_id, tank_id, prod_vol, prod_height,
  water_vol, tc_vol, prod_temp, probe_status, leido_at
FROM niveles_tanque
ORDER BY empresa_id, tank_id, leido_at DESC;

-- ------------------------------------------------------------
-- 4. TURNOS (ssf_addin_shifts_data → SHD)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS turnos_combustible (
  id                BIGSERIAL PRIMARY KEY,
  empresa_id        INTEGER NOT NULL REFERENCES empresas(id),
  site_id           INTEGER,
  period_type       CHAR(1),               -- S=shift, D=day, M=month, Y=year
  period_status     VARCHAR(10),           -- Closed / Open
  period_id         INTEGER NOT NULL,
  start_at          TIMESTAMPTZ,
  end_at            TIMESTAMPTZ,
  start_trans_id    BIGINT,
  end_trans_id      BIGINT,
  UNIQUE (empresa_id, period_type, period_id)
);

-- ------------------------------------------------------------
-- 5. PRECIOS COMBUSTIBLE (ssf_addin_prices_change → PCH/PCD)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS precios_combustible (
  id                SERIAL PRIMARY KEY,
  empresa_id        INTEGER NOT NULL REFERENCES empresas(id),
  grade_id          INTEGER NOT NULL,
  price_level       INTEGER NOT NULL DEFAULT 1,
  ppu               NUMERIC(10,4) NOT NULL,
  vigente_desde     TIMESTAMPTZ NOT NULL,
  price_change_id   INTEGER,
  registrado_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Vista: precio actual por grado
CREATE OR REPLACE VIEW v_precios_actuales AS
SELECT DISTINCT ON (empresa_id, grade_id, price_level)
  empresa_id, grade_id, price_level, ppu, vigente_desde
FROM precios_combustible
ORDER BY empresa_id, grade_id, price_level, vigente_desde DESC;

-- ------------------------------------------------------------
-- 6. ALARMAS FUSION (ssf_alarm_status → TAS)
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS alarmas_fusion (
  id                BIGSERIAL PRIMARY KEY,
  empresa_id        INTEGER NOT NULL REFERENCES empresas(id),
  alarm_type        VARCHAR(60) NOT NULL,
  location_type     VARCHAR(20),
  location_id       VARCHAR(20),
  alarm_status      VARCHAR(5),
  alarm_at          TIMESTAMPTZ,
  severity          VARCHAR(20),
  ack_user          VARCHAR(60),
  ack_at            TIMESTAMPTZ,
  last_modified_at  TIMESTAMPTZ,
  UNIQUE (empresa_id, alarm_type, location_type, location_id)
);

-- ------------------------------------------------------------
-- 7. CONTROL DE SINCRONIZACIÓN
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS fusion_sync_control (
  id                SERIAL PRIMARY KEY,
  empresa_id        INTEGER NOT NULL REFERENCES empresas(id),
  tabla_fusion      VARCHAR(40) NOT NULL,  -- ssf_pump_sales, ssf_tank_actual_info, etc.
  ultimo_id         BIGINT DEFAULT 0,      -- último sale_id / record procesado
  ultima_sync       TIMESTAMPTZ,
  registros_hoy     INTEGER DEFAULT 0,
  errores_consec    INTEGER DEFAULT 0,
  UNIQUE (empresa_id, tabla_fusion)
);

-- ------------------------------------------------------------
-- 8. FUNCIÓN PRINCIPAL: registrar venta + asiento contable
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION registrar_venta_combustible(
  -- Requeridos (sin DEFAULT) primero
  p_empresa_id     INTEGER,
  p_sale_id        BIGINT,
  p_pump_id        INTEGER,
  p_hose_id        INTEGER,
  p_grade_id       INTEGER,
  p_volume         NUMERIC,
  p_money          NUMERIC,
  p_ppu            NUMERIC,
  p_sale_type      SMALLINT,
  p_start_at       TIMESTAMPTZ,
  p_end_at         TIMESTAMPTZ,
  -- Opcionales (con DEFAULT) al final
  p_price_level    INTEGER   DEFAULT 1,
  p_initial_volume NUMERIC   DEFAULT NULL,
  p_final_volume   NUMERIC   DEFAULT NULL,
  p_site_id        INTEGER   DEFAULT NULL,
  p_preset_amount  NUMERIC   DEFAULT NULL
)
RETURNS TABLE (venta_id BIGINT, asiento_id INTEGER, es_nueva BOOLEAN)
LANGUAGE plpgsql AS $$
DECLARE
  v_venta_id      BIGINT;
  v_asiento_id    INTEGER;
  v_es_nueva      BOOLEAN := FALSE;
  v_grade         RECORD;
  v_periodo_id    INTEGER;
  v_fecha         DATE;
  v_numero_fmt    VARCHAR(30);
  v_seq           INTEGER;
BEGIN
  -- Verificar si ya existe (deduplicación por sale_id)
  SELECT id INTO v_venta_id
  FROM ventas_combustible
  WHERE empresa_id = p_empresa_id AND sale_id = p_sale_id;

  IF v_venta_id IS NOT NULL THEN
    RETURN QUERY SELECT v_venta_id, NULL::INTEGER, FALSE;
    RETURN;
  END IF;

  -- Obtener grado combustible y cuenta contable
  SELECT gc.codigo_cuenta, gc.nombre INTO v_grade
  FROM grados_combustible gc
  WHERE gc.empresa_id = p_empresa_id AND gc.grade_id = p_grade_id;

  -- Fecha del asiento
  v_fecha := p_end_at::DATE;

  -- Buscar período fiscal activo
  SELECT id INTO v_periodo_id
  FROM periodos_fiscales
  WHERE empresa_id = p_empresa_id
    AND fecha_inicio <= v_fecha
    AND fecha_fin >= v_fecha
  LIMIT 1;

  -- Número de formato para el asiento (prefijo CB = combustible)
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(numero_formato, '^CB-(\d+)-\d{4}$', '\1'), '')::INTEGER
  ), 0) + 1
  INTO v_seq
  FROM asientos
  WHERE empresa_id = p_empresa_id
    AND numero_formato LIKE 'CB-%-' || EXTRACT(YEAR FROM v_fecha)::TEXT;

  v_numero_fmt := 'CB-' || LPAD(v_seq::TEXT, 3, '0') || '-' || EXTRACT(YEAR FROM v_fecha)::TEXT;

  -- Insertar venta
  INSERT INTO ventas_combustible (
    empresa_id, site_id, sale_id, pump_id, hose_id, grade_id,
    volume, money, ppu, price_level, sale_type,
    initial_volume, final_volume, preset_amount, start_at, end_at
  ) VALUES (
    p_empresa_id, p_site_id, p_sale_id, p_pump_id, p_hose_id, p_grade_id,
    p_volume, p_money, p_ppu, p_price_level, p_sale_type,
    p_initial_volume, p_final_volume, p_preset_amount, p_start_at, p_end_at
  )
  RETURNING id INTO v_venta_id;

  v_es_nueva := TRUE;

  -- Crear asiento contable automático (si hay cuenta configurada)
  IF v_grade.codigo_cuenta IS NOT NULL AND v_periodo_id IS NOT NULL THEN
    INSERT INTO asientos (
      empresa_id, periodo_id, fecha, descripcion,
      numero_formato, categoria, estado
    ) VALUES (
      p_empresa_id, v_periodo_id, v_fecha,
      'Venta combustible ' || COALESCE(v_grade.nombre, 'grade ' || p_grade_id::TEXT)
        || ' — bomba ' || p_pump_id || ' manguera ' || p_hose_id
        || ' — ' || p_volume || ' lt',
      v_numero_fmt, 'CB', 'CONFIRMADO'
    )
    RETURNING id INTO v_asiento_id;

    -- Líneas del asiento: DB Caja/Clientes, CR Ventas Combustible
    -- (Las cuentas específicas se configuran en grados_combustible.codigo_cuenta
    --  y en la parametrización de la empresa)
    INSERT INTO asiento_lineas (asiento_id, cuenta_id, tipo, monto, descripcion)
    SELECT
      v_asiento_id,
      pc.id,
      'DB',
      p_money,
      'Cobro venta combustible sale#' || p_sale_id
    FROM plan_cuentas_empresa pce
    JOIN plan_cuentas pc ON pc.id = pce.cuenta_id
    WHERE pce.empresa_id = p_empresa_id
      AND pc.codigo = (
        SELECT valor FROM parametros_empresa
        WHERE empresa_id = p_empresa_id AND clave = 'cuenta_caja_combustible'
      )
    LIMIT 1;

    INSERT INTO asiento_lineas (asiento_id, cuenta_id, tipo, monto, descripcion)
    SELECT
      v_asiento_id,
      pc.id,
      'CR',
      p_money,
      'Venta combustible sale#' || p_sale_id
    FROM plan_cuentas_empresa pce
    JOIN plan_cuentas pc ON pc.id = pce.cuenta_id
    WHERE pce.empresa_id = p_empresa_id
      AND pc.codigo = v_grade.codigo_cuenta
    LIMIT 1;

    -- Actualizar saldos (función existente en MYA)
    PERFORM actualizar_saldos_asiento(v_asiento_id);

    -- Vincular asiento con la venta
    UPDATE ventas_combustible
    SET asiento_id = v_asiento_id
    WHERE id = v_venta_id;
  END IF;

  -- Actualizar control de sync
  UPDATE fusion_sync_control
  SET ultimo_id = GREATEST(ultimo_id, p_sale_id),
      ultima_sync = NOW(),
      registros_hoy = registros_hoy + 1,
      errores_consec = 0
  WHERE empresa_id = p_empresa_id AND tabla_fusion = 'ssf_pump_sales';

  RETURN QUERY SELECT v_venta_id, v_asiento_id, v_es_nueva;
END;
$$;

-- ------------------------------------------------------------
-- 9. VISTAS DE REPORTES
-- ------------------------------------------------------------

-- Ventas por bomba del día
CREATE OR REPLACE VIEW v_ventas_dia AS
SELECT
  vc.empresa_id,
  vc.end_at::DATE AS fecha,
  vc.pump_id,
  d.descripcion AS bomba,
  gc.nombre AS combustible,
  COUNT(*) AS transacciones,
  SUM(vc.volume) AS litros_total,
  SUM(vc.money) AS monto_total,
  AVG(vc.ppu) AS ppu_promedio
FROM ventas_combustible vc
LEFT JOIN dispensadores d ON d.empresa_id = vc.empresa_id AND d.pump_id = vc.pump_id
LEFT JOIN grados_combustible gc ON gc.empresa_id = vc.empresa_id AND gc.grade_id = vc.grade_id
GROUP BY vc.empresa_id, fecha, vc.pump_id, d.descripcion, gc.nombre;

-- Ventas por turno
CREATE OR REPLACE VIEW v_ventas_turno AS
SELECT
  vc.empresa_id,
  vc.turno_id,
  tc.start_at AS turno_inicio,
  tc.end_at AS turno_fin,
  gc.nombre AS combustible,
  COUNT(*) AS transacciones,
  SUM(vc.volume) AS litros_total,
  SUM(vc.money) AS monto_total
FROM ventas_combustible vc
LEFT JOIN turnos_combustible tc ON tc.id = vc.turno_id
LEFT JOIN grados_combustible gc ON gc.empresa_id = vc.empresa_id AND gc.grade_id = vc.grade_id
GROUP BY vc.empresa_id, vc.turno_id, turno_inicio, turno_fin, gc.nombre;

-- ------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (igual que el resto de MYA)
-- ------------------------------------------------------------

ALTER TABLE ventas_combustible ENABLE ROW LEVEL SECURITY;
ALTER TABLE niveles_tanque ENABLE ROW LEVEL SECURITY;
ALTER TABLE turnos_combustible ENABLE ROW LEVEL SECURITY;
ALTER TABLE alarmas_fusion ENABLE ROW LEVEL SECURITY;

-- (Las políticas RLS se aplican con el mismo patrón que el resto del proyecto)