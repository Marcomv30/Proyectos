-- ============================================================
-- EMPACADORA — Campos adicionales en recepciones
-- Fecha: 2026-03-24
-- Basado en boleta física "Envío de Fruta a Planta"
-- ============================================================

-- ─── Encabezado de recepción ──────────────────────────────────────────────────
ALTER TABLE emp_recepciones
  ADD COLUMN IF NOT EXISTS ggn_gln        VARCHAR(30),   -- GlobalG.A.P. número
  ADD COLUMN IF NOT EXISTS fecha_induccion DATE,          -- Fecha de inducción
  ADD COLUMN IF NOT EXISTS enviado_por    TEXT,           -- Quien despacha en finca
  ADD COLUMN IF NOT EXISTS recibido_por   TEXT;           -- Quien recibe en planta

-- ─── Detalle por VIN ──────────────────────────────────────────────────────────
ALTER TABLE emp_recepciones_detalle
  ADD COLUMN IF NOT EXISTS carreta        VARCHAR(20),    -- Número de carreta
  ADD COLUMN IF NOT EXISTS hora_carga     TIME;           -- Hora de carga por VIN
