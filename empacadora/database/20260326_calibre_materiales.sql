-- ============================================================
-- Materiales por defecto en calibres
-- Bandeja y colilla se configuran una vez en el calibre y se
-- auto-completan al seleccionar calibre en la línea OPC.
-- ============================================================
ALTER TABLE public.emp_calibres
  ADD COLUMN IF NOT EXISTS material_caja_id    UUID REFERENCES public.emp_materiales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS material_colilla_id UUID REFERENCES public.emp_materiales(id) ON DELETE SET NULL;
