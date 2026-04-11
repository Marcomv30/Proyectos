-- ============================================================
-- fe_terminales — Puntos de venta / terminales por empresa
-- Permite multi-terminal: cada terminal tiene su propia serie
-- de consecutivos (sucursal + punto_venta).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.fe_terminales (
  id          BIGSERIAL    PRIMARY KEY,
  empresa_id  INTEGER      NOT NULL,
  nombre      VARCHAR(80)  NOT NULL,
  sucursal    VARCHAR(3)   NOT NULL DEFAULT '001',
  punto_venta VARCHAR(5)   NOT NULL,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  es_defecto  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, sucursal, punto_venta)
);

-- Solo el service_role accede (el backend usa adminSb)
ALTER TABLE public.fe_terminales ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fe_terminales TO service_role;
GRANT USAGE ON SEQUENCE public.fe_terminales_id_seq TO service_role;

-- ── Función: garantizar que solo haya un es_defecto por empresa ──
CREATE OR REPLACE FUNCTION public.fe_terminales_un_defecto()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.es_defecto THEN
    UPDATE public.fe_terminales
      SET es_defecto = FALSE
      WHERE empresa_id = NEW.empresa_id AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fe_terminales_defecto ON public.fe_terminales;
CREATE TRIGGER trg_fe_terminales_defecto
  AFTER INSERT OR UPDATE OF es_defecto ON public.fe_terminales
  FOR EACH ROW EXECUTE FUNCTION public.fe_terminales_un_defecto();
