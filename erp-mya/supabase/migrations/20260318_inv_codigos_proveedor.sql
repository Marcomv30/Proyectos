-- ============================================================
-- MYA ERP — Códigos de proveedor
-- Mapeo: emisor + CodigoComercial Tipo01 → inv_productos
-- Permite auto-identificar productos en compras XML
-- ============================================================

-- 1. Agregar código comercial a líneas de comprobante
ALTER TABLE comprobantes_lineas
  ADD COLUMN IF NOT EXISTS codigo_comercial      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS tipo_codigo_comercial CHAR(2) DEFAULT '01';

-- 2. Tabla de mapeo proveedor → producto
CREATE TABLE IF NOT EXISTS inv_codigos_proveedor (
  id                    BIGSERIAL PRIMARY KEY,
  empresa_id            INTEGER  NOT NULL,
  emisor_identificacion VARCHAR(20) NOT NULL,
  emisor_nombre         TEXT,
  tipo_codigo           CHAR(2)  NOT NULL DEFAULT '01',  -- 01=proveedor, 04=CABYS
  codigo_comercial      VARCHAR(100) NOT NULL,
  codigo_cabys          VARCHAR(20),
  descripcion_proveedor TEXT,
  producto_id           BIGINT   REFERENCES inv_productos(id) ON DELETE SET NULL,
  precio_ultimo         NUMERIC(15,2),
  fecha_ultima_compra   DATE,
  total_compras         INTEGER  NOT NULL DEFAULT 0,
  activo                BOOLEAN  NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (empresa_id, emisor_identificacion, tipo_codigo, codigo_comercial)
);

ALTER TABLE inv_codigos_proveedor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_codigos_proveedor_all"
  ON inv_codigos_proveedor FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_inv_codigos_prov_empresa
  ON inv_codigos_proveedor (empresa_id);
CREATE INDEX IF NOT EXISTS idx_inv_codigos_prov_emisor
  ON inv_codigos_proveedor (empresa_id, emisor_identificacion);
CREATE INDEX IF NOT EXISTS idx_inv_codigos_prov_producto
  ON inv_codigos_proveedor (producto_id) WHERE producto_id IS NOT NULL;

-- 3. Función upsert con incremento de total_compras
CREATE OR REPLACE FUNCTION fn_upsert_codigo_proveedor(
  p_empresa_id            INTEGER,
  p_emisor_identificacion VARCHAR,
  p_emisor_nombre         TEXT,
  p_tipo_codigo           CHAR(2),
  p_codigo_comercial      VARCHAR,
  p_codigo_cabys          VARCHAR,
  p_descripcion           TEXT,
  p_precio                NUMERIC,
  p_fecha                 DATE
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO inv_codigos_proveedor (
    empresa_id, emisor_identificacion, emisor_nombre,
    tipo_codigo, codigo_comercial, codigo_cabys,
    descripcion_proveedor, precio_ultimo, fecha_ultima_compra, total_compras
  ) VALUES (
    p_empresa_id, p_emisor_identificacion, p_emisor_nombre,
    p_tipo_codigo, p_codigo_comercial, p_codigo_cabys,
    p_descripcion, p_precio, p_fecha, 1
  )
  ON CONFLICT (empresa_id, emisor_identificacion, tipo_codigo, codigo_comercial)
  DO UPDATE SET
    emisor_nombre         = COALESCE(EXCLUDED.emisor_nombre,   inv_codigos_proveedor.emisor_nombre),
    codigo_cabys          = COALESCE(EXCLUDED.codigo_cabys,    inv_codigos_proveedor.codigo_cabys),
    descripcion_proveedor = EXCLUDED.descripcion_proveedor,
    precio_ultimo         = EXCLUDED.precio_ultimo,
    fecha_ultima_compra   = GREATEST(EXCLUDED.fecha_ultima_compra, inv_codigos_proveedor.fecha_ultima_compra),
    total_compras         = inv_codigos_proveedor.total_compras + 1,
    updated_at            = NOW();
END;
$$;
