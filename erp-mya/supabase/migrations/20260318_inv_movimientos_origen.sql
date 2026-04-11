-- Agrega campo origen a inv_movimientos
-- origen: 'ajuste' (manual) | 'fe' (factura electrónica) | 'xml' (compra XML) | 'sistema'

ALTER TABLE inv_movimientos
  ADD COLUMN IF NOT EXISTS origen VARCHAR(20) NOT NULL DEFAULT 'ajuste';

COMMENT ON COLUMN inv_movimientos.origen IS 'ajuste=manual, fe=factura emitida, xml=compra XML, sistema=automático';
