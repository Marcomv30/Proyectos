-- ============================================================
-- EMPACADORA — FEE desde despacho
-- Liga emp_programas con datos FEE, emp_clientes con receptor
-- y emp_despachos con el fe_documento generado
-- ============================================================

-- ─── Programa: precio y datos FEE ────────────────────────────
ALTER TABLE emp_programas
  ADD COLUMN IF NOT EXISTS precio_usd_caja     NUMERIC(12,5),
  ADD COLUMN IF NOT EXISTS cabys               VARCHAR(13),        -- 13 dígitos CABYS piña
  ADD COLUMN IF NOT EXISTS partida_arancelaria VARCHAR(20),        -- arancel exportación
  ADD COLUMN IF NOT EXISTS notas_fee           TEXT;

-- ─── Cliente exportador: receptor FE ─────────────────────────
ALTER TABLE emp_clientes
  ADD COLUMN IF NOT EXISTS fe_receptor_id BIGINT;
-- No FK directa porque fe_receptores_bitacora está en el ERP (mismo Supabase)
-- Se valida en la app

-- ─── Despacho: referencia al fe_documento generado ───────────
ALTER TABLE emp_despachos
  ADD COLUMN IF NOT EXISTS fee_documento_id   BIGINT,
  ADD COLUMN IF NOT EXISTS fee_generada_at    TIMESTAMPTZ;
