-- ============================================================
-- Materiales por defecto en líneas OPC (emp_programas_detalle)
-- Permite asignar bandeja (caja cartón) y colilla por calibre
-- para que se auto-completen al crear una boleta de producción.
-- ============================================================
ALTER TABLE public.emp_programas_detalle
  ADD COLUMN IF NOT EXISTS material_caja_id    UUID REFERENCES public.emp_materiales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS material_colilla_id UUID REFERENCES public.emp_materiales(id) ON DELETE SET NULL;
