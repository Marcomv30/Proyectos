-- Tipo de identificación del emisor (01=Física, 02=Jurídica, 03=DIMEX, 04=NITE)
ALTER TABLE comprobantes_recibidos
  ADD COLUMN IF NOT EXISTS emisor_tipo_id VARCHAR(2);
