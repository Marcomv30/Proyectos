-- Bitácora de cambios de asignación de dispositivos VIR
-- Registra cada vez que cambia el operador asignado a una pulsera/tag

CREATE TABLE IF NOT EXISTS public.comb_dispositivos_bitacora (
  id               BIGSERIAL PRIMARY KEY,
  empresa_id       INTEGER NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  dispositivo_id   BIGINT NOT NULL REFERENCES public.comb_dispositivos_identidad(id) ON DELETE CASCADE,
  attendant_id     VARCHAR(60),                  -- código fijo de la pulsera (ej. P001)
  operador_anterior TEXT,                         -- nombre antes del cambio
  operador_nuevo    TEXT,                         -- nombre después del cambio
  campo_cambiado    TEXT NOT NULL DEFAULT 'operador_nombre', -- qué campo cambió
  cambiado_por      TEXT,                         -- usuario que hizo el cambio (email/nombre)
  cambiado_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  motivo            TEXT                          -- opcional: razón del cambio
);

CREATE INDEX IF NOT EXISTS idx_disp_bitacora_dispositivo
  ON public.comb_dispositivos_bitacora(dispositivo_id, cambiado_at DESC);

CREATE INDEX IF NOT EXISTS idx_disp_bitacora_empresa
  ON public.comb_dispositivos_bitacora(empresa_id, cambiado_at DESC);

ALTER TABLE public.comb_dispositivos_bitacora ENABLE ROW LEVEL SECURITY;

CREATE POLICY disp_bitacora_all ON public.comb_dispositivos_bitacora
  FOR ALL USING (true) WITH CHECK (true);
