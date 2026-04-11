-- ============================================================
-- Materiales configurados por calibre (+ marca opcional)
-- Reemplaza los campos fijos material_caja_id / material_colilla_id
-- por una lista extensible: agrega colillas, divisores, etc.
-- sin tocar código.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.emp_calibre_materiales (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id    INTEGER NOT NULL,
  calibre_id    UUID NOT NULL REFERENCES public.emp_calibres(id)  ON DELETE CASCADE,
  marca_id      UUID          REFERENCES public.emp_marcas(id)    ON DELETE CASCADE,  -- NULL = aplica a todas las marcas
  material_id   UUID NOT NULL REFERENCES public.emp_materiales(id) ON DELETE CASCADE,
  cantidad      NUMERIC(10,4) DEFAULT 1,
  orden         INTEGER DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.emp_calibre_materiales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emp_calibre_materiales_all" ON public.emp_calibre_materiales FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_ecm_calibre ON public.emp_calibre_materiales(calibre_id);
CREATE INDEX IF NOT EXISTS idx_ecm_marca   ON public.emp_calibre_materiales(marca_id);

-- Migrar datos existentes de emp_calibres (caja + colilla) a la nueva tabla
INSERT INTO public.emp_calibre_materiales (empresa_id, calibre_id, material_id, cantidad, orden)
SELECT c.empresa_id, c.id, c.material_caja_id, 1, 1
FROM   public.emp_calibres c
WHERE  c.material_caja_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.emp_calibre_materiales (empresa_id, calibre_id, material_id, cantidad, orden)
SELECT c.empresa_id, c.id, c.material_colilla_id, 1, 2
FROM   public.emp_calibres c
WHERE  c.material_colilla_id IS NOT NULL
ON CONFLICT DO NOTHING;
