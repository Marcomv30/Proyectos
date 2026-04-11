-- Campos IVA para declaración D-104 en comprobantes recibidos

-- 1. Tipo de cambio y totales serv/merc por categoría IVA en comprobantes_recibidos
ALTER TABLE comprobantes_recibidos
  ADD COLUMN IF NOT EXISTS tipo_cambio          NUMERIC(12,5) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_serv_gravados  NUMERIC(18,5) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_serv_exentos   NUMERIC(18,5) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_serv_exonerado NUMERIC(18,5) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_merc_gravados  NUMERIC(18,5) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_merc_exentos   NUMERIC(18,5) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_merc_exonerado NUMERIC(18,5) DEFAULT 0;

-- 2. Campos IVA por línea de detalle
ALTER TABLE comprobantes_lineas
  ADD COLUMN IF NOT EXISTS cabys             VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tarifa_iva_codigo VARCHAR(2),
  ADD COLUMN IF NOT EXISTS tipo_linea        VARCHAR(1),   -- S=Servicio, M=Mercadería
  ADD COLUMN IF NOT EXISTS exoneracion_tipo  VARCHAR(2),
  ADD COLUMN IF NOT EXISTS exoneracion_porc  NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exoneracion_monto NUMERIC(18,5) DEFAULT 0;

-- 3. Resumen IVA por tarifa por comprobante (para D-104 crédito fiscal)
CREATE TABLE IF NOT EXISTS comprobante_iva_resumen (
  id              BIGSERIAL PRIMARY KEY,
  comprobante_id  BIGINT   NOT NULL REFERENCES comprobantes_recibidos(id) ON DELETE CASCADE,
  empresa_id      INTEGER  NOT NULL,
  tarifa_codigo   VARCHAR(2) NOT NULL,  -- 01=Exento 02=1% 03=2% 04=4% 05=8% 06=13%
  tarifa_porc     NUMERIC(5,2) NOT NULL DEFAULT 0,
  base_imponible  NUMERIC(18,5) NOT NULL DEFAULT 0,
  monto_iva       NUMERIC(18,5) NOT NULL DEFAULT 0,
  monto_exonerado NUMERIC(18,5) NOT NULL DEFAULT 0,
  UNIQUE(comprobante_id, tarifa_codigo)
);

CREATE INDEX IF NOT EXISTS idx_iva_resumen_comprobante
  ON comprobante_iva_resumen (comprobante_id);

CREATE INDEX IF NOT EXISTS idx_iva_resumen_empresa
  ON comprobante_iva_resumen (empresa_id, tarifa_codigo);
