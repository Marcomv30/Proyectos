-- ─── Módulo POS — Punto de Venta ─────────────────────────────────────────────

-- Cajas registradoras
CREATE TABLE IF NOT EXISTS pos_cajas (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  INTEGER NOT NULL,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sesiones de caja (turnos)
CREATE TABLE IF NOT EXISTS pos_sesiones (
  id                   BIGSERIAL PRIMARY KEY,
  empresa_id           INTEGER NOT NULL,
  caja_id              BIGINT REFERENCES pos_cajas(id),
  cajero_id            UUID,
  cajero_nombre        TEXT,
  estado               TEXT NOT NULL DEFAULT 'abierta', -- abierta | cerrada
  apertura_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  cierre_at            TIMESTAMPTZ,
  monto_inicial        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_ventas         NUMERIC(12,2),
  total_efectivo       NUMERIC(12,2),
  total_tarjeta        NUMERIC(12,2),
  total_transferencia  NUMERIC(12,2),
  notas                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ventas POS
CREATE TABLE IF NOT EXISTS pos_ventas (
  id               BIGSERIAL PRIMARY KEY,
  empresa_id       INTEGER NOT NULL,
  sesion_id        BIGINT REFERENCES pos_sesiones(id),
  caja_id          BIGINT REFERENCES pos_cajas(id),
  cajero_id        UUID,
  cajero_nombre    TEXT,
  cliente_id       BIGINT,
  cliente_nombre   TEXT,
  cliente_cedula   TEXT,
  cliente_email    TEXT,
  tipo_documento   TEXT NOT NULL DEFAULT 'tiquete',  -- tiquete | factura | proforma
  fe_documento_id  BIGINT,
  fe_clave         TEXT,
  estado           TEXT NOT NULL DEFAULT 'pagada',   -- pagada | anulada
  subtotal         NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento        NUMERIC(12,2) NOT NULL DEFAULT 0,
  gravado          NUMERIC(12,2) NOT NULL DEFAULT 0,
  exento           NUMERIC(12,2) NOT NULL DEFAULT 0,
  iva              NUMERIC(12,2) NOT NULL DEFAULT 0,
  total            NUMERIC(12,2) NOT NULL DEFAULT 0,
  tipo_pago        TEXT NOT NULL DEFAULT 'efectivo', -- efectivo | tarjeta | transferencia | mixto
  monto_recibido   NUMERIC(12,2),
  cambio           NUMERIC(12,2),
  notas            TEXT,
  anulada          BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Líneas de venta POS
CREATE TABLE IF NOT EXISTS pos_venta_lineas (
  id              BIGSERIAL PRIMARY KEY,
  venta_id        BIGINT NOT NULL REFERENCES pos_ventas(id) ON DELETE CASCADE,
  producto_id     BIGINT,
  codigo          TEXT,
  descripcion     TEXT NOT NULL,
  unidad          TEXT NOT NULL DEFAULT 'Unid',
  cantidad        NUMERIC(12,4) NOT NULL DEFAULT 1,
  precio_unit     NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
  descuento_monto NUMERIC(12,2) NOT NULL DEFAULT 0,
  iva_pct         NUMERIC(5,2) NOT NULL DEFAULT 13,
  iva_monto       NUMERIC(12,2) NOT NULL DEFAULT 0,
  gravado         NUMERIC(12,2) NOT NULL DEFAULT 0,
  exento          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  exonerado       BOOLEAN NOT NULL DEFAULT false,
  cabys_code      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pos_cajas_empresa ON pos_cajas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pos_sesiones_empresa ON pos_sesiones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pos_ventas_empresa ON pos_ventas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pos_ventas_sesion ON pos_ventas(sesion_id);
CREATE INDEX IF NOT EXISTS idx_pos_ventas_created ON pos_ventas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_venta_lineas_venta ON pos_venta_lineas(venta_id);

-- RLS
ALTER TABLE pos_cajas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sesiones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_ventas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_venta_lineas ENABLE ROW LEVEL SECURITY;

-- Políticas: solo service_role accede (el servidor maneja todo)
CREATE POLICY "service_role_pos_cajas"        ON pos_cajas        USING (auth.role() = 'service_role');
CREATE POLICY "service_role_pos_sesiones"     ON pos_sesiones     USING (auth.role() = 'service_role');
CREATE POLICY "service_role_pos_ventas"       ON pos_ventas       USING (auth.role() = 'service_role');
CREATE POLICY "service_role_pos_venta_lineas" ON pos_venta_lineas USING (auth.role() = 'service_role');

-- ─── Registro del módulo en el sistema de permisos ────────────────────────────

-- Módulo
INSERT INTO modulos (codigo, nombre, activo)
VALUES ('pos', 'Punto de Venta', true)
ON CONFLICT (codigo) DO NOTHING;

-- Permisos ver y editar
INSERT INTO permisos (modulo_id, accion)
SELECT m.id, a.accion
FROM modulos m
CROSS JOIN (VALUES ('ver'), ('editar')) AS a(accion)
WHERE m.codigo = 'pos'
ON CONFLICT DO NOTHING;

-- Habilitar en todas las empresas que ya tienen módulos configurados (empresa_modulos)
INSERT INTO empresa_modulos (empresa_id, modulo_id)
SELECT DISTINCT em.empresa_id, m.id
FROM empresa_modulos em
CROSS JOIN modulos m
WHERE m.codigo = 'pos'
ON CONFLICT DO NOTHING;

-- Habilitar en todas las actividades económicas que ya tienen módulos (actividad_modulos)
INSERT INTO actividad_modulos (actividad_id, modulo_id)
SELECT DISTINCT am.actividad_id, m.id
FROM actividad_modulos am
CROSS JOIN modulos m
WHERE m.codigo = 'pos'
ON CONFLICT DO NOTHING;
