-- ============================================================
-- EMPACADORA DE PIÑA — Fase 1: Configuración Base
-- Fecha: 2026-03-24
-- Todas las tablas usan prefijo emp_
-- empresa_id = FK a la tabla empresas del ERP
-- ============================================================

-- ─── CALIBRES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emp_calibres (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    INTEGER NOT NULL,
  nombre        VARCHAR(20) NOT NULL,        -- '5', '6', '7' ... '12'
  frutas_por_caja INTEGER NOT NULL,
  descripcion   TEXT,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  orden         INTEGER NOT NULL DEFAULT 0,  -- para ordenar en UI
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, nombre)
);

-- Índice
CREATE INDEX IF NOT EXISTS idx_emp_calibres_empresa ON emp_calibres(empresa_id);

-- Datos iniciales calibres 5-12
INSERT INTO emp_calibres (empresa_id, nombre, frutas_por_caja, orden) VALUES
  (1, '5',  5,  10),
  (1, '6',  6,  20),
  (1, '7',  7,  30),
  (1, '8',  8,  40),
  (1, '9',  9,  50),
  (1, '10', 10, 60),
  (1, '11', 11, 70),
  (1, '12', 12, 80)
ON CONFLICT (empresa_id, nombre) DO NOTHING;

-- ─── PROVEEDORES DE FRUTA ─────────────────────────────────────
-- Catálogo propio, independiente de proveedores del ERP
CREATE TABLE IF NOT EXISTS emp_proveedores_fruta (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  INTEGER NOT NULL,
  codigo      VARCHAR(20),
  nombre      VARCHAR(200) NOT NULL,
  cedula      VARCHAR(30),
  tipo        VARCHAR(10) NOT NULL CHECK (tipo IN ('propio', 'tercero')),
  telefono    VARCHAR(20),
  email       VARCHAR(150),
  direccion   TEXT,
  contacto    VARCHAR(150),  -- persona de contacto
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_emp_proveedores_empresa ON emp_proveedores_fruta(empresa_id);
CREATE INDEX IF NOT EXISTS idx_emp_proveedores_tipo    ON emp_proveedores_fruta(tipo);

-- ─── PARCELAS DE FINCA PROPIA ──────────────────────────────────
CREATE TABLE IF NOT EXISTS emp_parcelas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    INTEGER NOT NULL,
  proveedor_id  UUID REFERENCES emp_proveedores_fruta(id),
  codigo        VARCHAR(20),
  nombre        VARCHAR(150) NOT NULL,
  hectareas     DECIMAL(10, 2),
  ubicacion     TEXT,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_parcelas_empresa    ON emp_parcelas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_emp_parcelas_proveedor  ON emp_parcelas(proveedor_id);

-- ─── MATERIALES DE EMPAQUE ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS emp_materiales (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    INTEGER NOT NULL,
  codigo        VARCHAR(30),
  nombre        VARCHAR(250) NOT NULL,
  tipo          VARCHAR(20) NOT NULL CHECK (tipo IN ('carton', 'colilla', 'etiqueta', 'accesorio', 'otro')),
  cliente_id    INTEGER,        -- FK a terceros del ERP (cliente dueño del material)
  cliente_nombre VARCHAR(200), -- desnormalizado para evitar JOIN al ERP
  marca         VARCHAR(150),
  calibre_id    UUID REFERENCES emp_calibres(id),  -- NULL = aplica todos los calibres
  unidad_medida VARCHAR(30) NOT NULL DEFAULT 'unidad',
  stock_minimo  DECIMAL(12, 2) NOT NULL DEFAULT 0,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_materiales_empresa  ON emp_materiales(empresa_id);
CREATE INDEX IF NOT EXISTS idx_emp_materiales_tipo     ON emp_materiales(tipo);
CREATE INDEX IF NOT EXISTS idx_emp_materiales_cliente  ON emp_materiales(cliente_id);

-- ─── INVENTARIO DE MATERIALES ──────────────────────────────────
CREATE TABLE IF NOT EXISTS emp_inv_materiales (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            INTEGER NOT NULL,
  material_id           UUID NOT NULL REFERENCES emp_materiales(id) ON DELETE CASCADE,
  stock_actual          DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ultima_actualizacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, material_id)
);

CREATE INDEX IF NOT EXISTS idx_emp_inv_mat_empresa  ON emp_inv_materiales(empresa_id);

-- ─── MOVIMIENTOS DE MATERIALES ─────────────────────────────────
CREATE TABLE IF NOT EXISTS emp_mov_materiales (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  INTEGER NOT NULL,
  material_id UUID NOT NULL REFERENCES emp_materiales(id),
  tipo        VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'salida')),
  cantidad    DECIMAL(12, 2) NOT NULL,
  referencia  VARCHAR(100),  -- # factura, lote, etc.
  notas       TEXT,
  fecha       DATE NOT NULL DEFAULT CURRENT_DATE,
  usuario_id  UUID,          -- auth.users.id
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_mov_mat_empresa   ON emp_mov_materiales(empresa_id);
CREATE INDEX IF NOT EXISTS idx_emp_mov_mat_material  ON emp_mov_materiales(material_id);
CREATE INDEX IF NOT EXISTS idx_emp_mov_mat_fecha     ON emp_mov_materiales(fecha);

-- ─── FUNCIÓN: actualizar stock al insertar movimiento ──────────
CREATE OR REPLACE FUNCTION emp_fn_actualizar_stock()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO emp_inv_materiales (empresa_id, material_id, stock_actual, ultima_actualizacion)
  VALUES (NEW.empresa_id, NEW.material_id,
    CASE NEW.tipo WHEN 'entrada' THEN NEW.cantidad ELSE -NEW.cantidad END,
    NOW())
  ON CONFLICT (empresa_id, material_id) DO UPDATE
    SET stock_actual = emp_inv_materiales.stock_actual +
          CASE NEW.tipo WHEN 'entrada' THEN NEW.cantidad ELSE -NEW.cantidad END,
        ultima_actualizacion = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_emp_actualizar_stock
  AFTER INSERT ON emp_mov_materiales
  FOR EACH ROW EXECUTE FUNCTION emp_fn_actualizar_stock();

-- ─── RLS (Row Level Security) ─────────────────────────────────
ALTER TABLE emp_calibres           ENABLE ROW LEVEL SECURITY;
ALTER TABLE emp_proveedores_fruta  ENABLE ROW LEVEL SECURITY;
ALTER TABLE emp_parcelas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE emp_materiales         ENABLE ROW LEVEL SECURITY;
ALTER TABLE emp_inv_materiales     ENABLE ROW LEVEL SECURITY;
ALTER TABLE emp_mov_materiales     ENABLE ROW LEVEL SECURITY;

-- Política simple: usuario autenticado puede todo (ajustar según roles del ERP)
CREATE POLICY emp_calibres_all           ON emp_calibres           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY emp_proveedores_all        ON emp_proveedores_fruta  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY emp_parcelas_all           ON emp_parcelas           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY emp_materiales_all         ON emp_materiales         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY emp_inv_materiales_all     ON emp_inv_materiales     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY emp_mov_materiales_all     ON emp_mov_materiales     FOR ALL TO authenticated USING (true) WITH CHECK (true);
