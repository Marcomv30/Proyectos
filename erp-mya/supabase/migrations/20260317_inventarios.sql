-- ─── Módulo Inventarios ──────────────────────────────────────────────────────

-- Categorías de productos
CREATE TABLE IF NOT EXISTS inv_categorias (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN DEFAULT true
);

-- Catálogo de productos / servicios
CREATE TABLE IF NOT EXISTS inv_productos (
  id                    BIGSERIAL PRIMARY KEY,
  empresa_id            INTEGER NOT NULL,
  codigo                VARCHAR(50),
  codigo_cabys          VARCHAR(20),
  descripcion           TEXT NOT NULL,
  descripcion_detallada TEXT,
  categoria_id          BIGINT REFERENCES inv_categorias(id),
  tipo                  VARCHAR(20) DEFAULT 'producto', -- producto | servicio | combo
  unidad_medida         VARCHAR(20) DEFAULT 'Unid',
  tarifa_iva            NUMERIC(5,2) DEFAULT 13,
  precio_venta          NUMERIC(15,2) DEFAULT 0,
  costo_promedio        NUMERIC(15,4) DEFAULT 0,
  stock_actual          NUMERIC(15,4) DEFAULT 0,
  stock_minimo          NUMERIC(15,4) DEFAULT 0,
  cabys_categorias      JSONB,          -- jerarquía de categorías CABYS
  cuenta_inventario_id  BIGINT,         -- plan_cuentas_base.id
  cuenta_gasto_id       BIGINT,
  cuenta_ingreso_id     BIGINT,
  activo                BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE inv_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE inv_productos   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_categorias_all" ON inv_categorias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "inv_productos_all"  ON inv_productos  FOR ALL USING (true) WITH CHECK (true);

-- Índices
CREATE INDEX IF NOT EXISTS idx_inv_productos_empresa  ON inv_productos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_inv_productos_cabys    ON inv_productos(codigo_cabys);
CREATE INDEX IF NOT EXISTS idx_inv_categorias_empresa ON inv_categorias(empresa_id);
