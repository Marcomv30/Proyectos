-- Agregar control de sync para tickets y pagos
INSERT INTO fusion_sync_control (empresa_id, tabla_fusion, ultimo_id)
VALUES
  (1, 'ssf_tkt_trx_header',      0),
  (1, 'ssf_addin_payments_data', 0)
ON CONFLICT (empresa_id, tabla_fusion) DO NOTHING;
