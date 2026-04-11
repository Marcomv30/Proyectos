-- ============================================================
-- EMPACADORA — GPS silencioso en recepciones de campo
-- Fecha: 2026-03-27
-- Agrega coordenadas geográficas al detalle por VIN
-- ============================================================

-- Coordenadas capturadas en el momento de registrar cada VIN
-- desde el dispositivo del operario en campo
ALTER TABLE emp_recepciones_detalle
  ADD COLUMN IF NOT EXISTS lat           NUMERIC(10, 7),   -- latitud decimal
  ADD COLUMN IF NOT EXISTS lng           NUMERIC(10, 7),   -- longitud decimal
  ADD COLUMN IF NOT EXISTS gps_precision NUMERIC(6, 1);    -- precisión en metros (accuracy)

-- Comentario: lat/lng son NULL cuando el navegador no tiene permiso
-- o el dispositivo no tiene GPS. La app captura silenciosamente sin
-- bloquear al operario si la ubicación no está disponible.
