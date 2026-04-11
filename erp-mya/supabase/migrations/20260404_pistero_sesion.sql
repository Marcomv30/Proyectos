-- Sesiones de pistero por bomba
-- Una sesión activa = pistero identificado en esa bomba, despacho autorizado

CREATE TABLE IF NOT EXISTS public.comb_pistero_sesion (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      INTEGER NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  pump_id         INTEGER NOT NULL,
  dispositivo_id  BIGINT REFERENCES public.comb_dispositivos_identidad(id) ON DELETE SET NULL,
  attendant_id    VARCHAR(60),
  operador_nombre TEXT,
  inicio_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fin_at          TIMESTAMPTZ,
  estado          TEXT NOT NULL DEFAULT 'activo',   -- activo | finalizado | cancelado
  origen          TEXT NOT NULL DEFAULT 'vir_fisico', -- vir_fisico | consola_manual
  auth_command    TEXT,   -- comando REQ_PUMP_AUTH enviado a Fusion
  sale_ids        TEXT[], -- sale_ids de Fusion asociados a esta sesión
  notas           TEXT
);

CREATE INDEX IF NOT EXISTS idx_pistero_sesion_empresa_pump
  ON public.comb_pistero_sesion(empresa_id, pump_id, estado);

CREATE INDEX IF NOT EXISTS idx_pistero_sesion_activas
  ON public.comb_pistero_sesion(empresa_id, estado)
  WHERE estado = 'activo';

ALTER TABLE public.comb_pistero_sesion ENABLE ROW LEVEL SECURITY;

CREATE POLICY pistero_sesion_all ON public.comb_pistero_sesion
  FOR ALL USING (true) WITH CHECK (true);
