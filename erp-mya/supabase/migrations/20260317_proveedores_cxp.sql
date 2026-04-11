-- Cuenta CXP por proveedor (para generar asiento automático al contabilizar XML)
ALTER TABLE tercero_proveedor_parametros
  ADD COLUMN IF NOT EXISTS cuenta_cxp_id INTEGER REFERENCES plan_cuentas_empresa(id);

-- Vincular comprobante con proveedor (por identificacion del emisor)
ALTER TABLE comprobantes_recibidos
  ADD COLUMN IF NOT EXISTS proveedor_id INTEGER REFERENCES terceros(id);
