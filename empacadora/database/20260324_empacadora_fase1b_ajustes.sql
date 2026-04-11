-- ============================================================
-- EMPACADORA DE PIÑA — Fase 1b: Ajustes post-revisión AppSheet
-- Fecha: 2026-03-24
-- Agrega campos faltantes a emp_calibres y crea tablas catálogo:
--   emp_marcas, emp_transportistas
-- ============================================================

-- ─── AJUSTE: emp_calibres ─────────────────────────────────────
-- Agrega tipo (COR / CRW), pesos y cajas por paleta

ALTER TABLE emp_calibres
  ADD COLUMN IF NOT EXISTS tipo             VARCHAR(10) NOT NULL DEFAULT 'COR'
    CHECK (tipo IN ('COR', 'CRW', 'otro')),
  ADD COLUMN IF NOT EXISTS cajas_por_paleta INTEGER,
  ADD COLUMN IF NOT EXISTS peso_neto        DECIMAL(8, 3),   -- kg por caja
  ADD COLUMN IF NOT EXISTS tara             DECIMAL(8, 3),   -- kg tara caja
  ADD COLUMN IF NOT EXISTS peso_bruto       DECIMAL(8, 3);   -- peso_neto + tara

-- Actualizar datos iniciales con valores reales del AppSheet
UPDATE emp_calibres SET tipo='COR', cajas_por_paleta=75, peso_neto=12.40, tara=1.22, peso_bruto=13.62
  WHERE empresa_id=1 AND nombre='5';
UPDATE emp_calibres SET tipo='COR', cajas_por_paleta=75, peso_neto=12.40, tara=1.22, peso_bruto=13.62
  WHERE empresa_id=1 AND nombre='6';
UPDATE emp_calibres SET tipo='COR', cajas_por_paleta=75, peso_neto=12.40, tara=1.20, peso_bruto=13.60
  WHERE empresa_id=1 AND nombre='7';
UPDATE emp_calibres SET tipo='COR', cajas_por_paleta=75, peso_neto=12.15, tara=1.20, peso_bruto=13.35
  WHERE empresa_id=1 AND nombre='8';
UPDATE emp_calibres SET tipo='COR', cajas_por_paleta=75, peso_neto=11.80, tara=1.20, peso_bruto=13.00
  WHERE empresa_id=1 AND nombre='9';
UPDATE emp_calibres SET tipo='COR', cajas_por_paleta=75, peso_neto=11.60, tara=1.20, peso_bruto=12.80
  WHERE empresa_id=1 AND nombre='10';
UPDATE emp_calibres SET tipo='COR', cajas_por_paleta=75, peso_neto=11.60, tara=1.20, peso_bruto=12.80
  WHERE empresa_id=1 AND nombre='11';
UPDATE emp_calibres SET tipo='COR', cajas_por_paleta=75, peso_neto=11.60, tara=1.20, peso_bruto=12.80
  WHERE empresa_id=1 AND nombre='12';

-- Insertar calibres CRW (Crown — empaque diferente, 70 cajas/paleta)
INSERT INTO emp_calibres (empresa_id, nombre, frutas_por_caja, tipo, cajas_por_paleta, peso_neto, tara, peso_bruto, orden)
VALUES
  (1, 'CRW 5', 7, 'CRW', 70, 14.62, 1.22, 15.84, 110),
  (1, 'CRW 6', 8, 'CRW', 70, 14.62, 1.22, 15.84, 120),
  (1, 'CRW 7', 9, 'CRW', 70, 14.00, 1.20, 15.20, 130),
  (1, 'CRW 8', 10,'CRW', 70, 13.50, 1.20, 14.70, 140)
ON CONFLICT (empresa_id, nombre) DO NOTHING;

-- ─── MARCAS ────────────────────────────────────────────────────
-- Marcas de exportación: cada cliente tiene su marca (cartón/colilla/etiqueta propia)
CREATE TABLE IF NOT EXISTS emp_marcas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    INTEGER NOT NULL,
  nombre        VARCHAR(150) NOT NULL,
  cliente_id    INTEGER,          -- FK a terceros del ERP (cliente dueño)
  cliente_nombre VARCHAR(200),   -- desnormalizado
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_emp_marcas_empresa  ON emp_marcas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_emp_marcas_cliente  ON emp_marcas(cliente_id);

-- Datos iniciales (del AppSheet)
INSERT INTO emp_marcas (empresa_id, nombre) VALUES
  (1, 'Orsero'),
  (1, 'Orsero C'),
  (1, 'Orsero CRW'),
  (1, 'Orsero Oro B'),
  (1, 'Simba'),
  (1, 'Lilofruits'),
  (1, 'CND-C'),
  (1, 'CND-V'),
  (1, 'PCT'),
  (1, 'Genérica CRW')
ON CONFLICT (empresa_id, nombre) DO NOTHING;

-- ─── TRANSPORTISTAS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emp_transportistas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    INTEGER NOT NULL,
  nombre        VARCHAR(200) NOT NULL,
  telefono      VARCHAR(20),
  placa         VARCHAR(20),
  proveedor_id  UUID REFERENCES emp_proveedores_fruta(id),  -- productor al que pertenece
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emp_transportistas_empresa   ON emp_transportistas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_emp_transportistas_proveedor ON emp_transportistas(proveedor_id);

-- ─── RLS ──────────────────────────────────────────────────────
ALTER TABLE emp_marcas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE emp_transportistas ENABLE ROW LEVEL SECURITY;

CREATE POLICY emp_marcas_all         ON emp_marcas         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY emp_transportistas_all ON emp_transportistas FOR ALL TO authenticated USING (true) WITH CHECK (true);
