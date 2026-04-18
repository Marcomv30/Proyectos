-- Devoluciones POS
-- Cada registro representa una devolucion (total o parcial) ligada a una venta POS.
-- Si la venta tenia FE, se emite NC electronica ligada al fe_documento original.

CREATE TABLE pos_devoluciones (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          INTEGER NOT NULL,
  venta_id            BIGINT NOT NULL REFERENCES pos_ventas(id),

  -- Referencia al fe_documento tipo '03' (NC) generado
  fe_doc_id           BIGINT REFERENCES fe_documentos(id),
  fe_clave            TEXT,
  fe_estado           TEXT CHECK (fe_estado IN ('pendiente','enviado','aceptado','rechazado','error')),

  -- Motivo MH
  motivo_codigo       VARCHAR(2) NOT NULL DEFAULT '01',  -- 01=Anula, 03=Corrige monto
  motivo_razon        TEXT NOT NULL,

  -- Totales devueltos
  subtotal            NUMERIC(18,5) NOT NULL DEFAULT 0,
  impuesto            NUMERIC(18,5) NOT NULL DEFAULT 0,
  total               NUMERIC(18,5) NOT NULL DEFAULT 0,

  cajero_id           UUID,
  cajero_nombre       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lineas de la devolucion (subset de pos_venta_lineas)
CREATE TABLE pos_devolucion_lineas (
  id                  BIGSERIAL PRIMARY KEY,
  devolucion_id       BIGINT NOT NULL REFERENCES pos_devoluciones(id) ON DELETE CASCADE,
  venta_linea_id      BIGINT REFERENCES pos_venta_lineas(id),
  producto_id         BIGINT,
  descripcion         TEXT NOT NULL,
  cantidad            NUMERIC(15,4) NOT NULL,
  precio_unitario     NUMERIC(18,5) NOT NULL DEFAULT 0,
  tarifa_iva          NUMERIC(7,4) NOT NULL DEFAULT 0,
  subtotal            NUMERIC(18,5) NOT NULL DEFAULT 0,
  impuesto            NUMERIC(18,5) NOT NULL DEFAULT 0,
  total_linea         NUMERIC(18,5) NOT NULL DEFAULT 0
);

CREATE INDEX idx_pos_dev_venta    ON pos_devoluciones(venta_id);
CREATE INDEX idx_pos_dev_empresa  ON pos_devoluciones(empresa_id);
CREATE INDEX idx_pos_devlin_dev   ON pos_devolucion_lineas(devolucion_id);
