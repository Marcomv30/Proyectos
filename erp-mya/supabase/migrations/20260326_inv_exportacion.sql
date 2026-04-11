-- ============================================================
-- Exportación: partida arancelaria en productos + combo lines
-- ============================================================

-- Partida arancelaria para FEE y comercio exterior
ALTER TABLE public.inv_productos
  ADD COLUMN IF NOT EXISTS partida_arancelaria TEXT;

-- Componentes / líneas de un combo o kit
CREATE TABLE IF NOT EXISTS public.inv_producto_lineas (
  id            BIGSERIAL PRIMARY KEY,
  empresa_id    INTEGER NOT NULL,
  producto_id   BIGINT  NOT NULL REFERENCES public.inv_productos(id) ON DELETE CASCADE,
  descripcion   TEXT    NOT NULL,
  cantidad      NUMERIC(15,4) DEFAULT 1,
  unidad_medida VARCHAR(20)   DEFAULT 'Unid',
  orden         INTEGER DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.inv_producto_lineas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inv_producto_lineas_all" ON public.inv_producto_lineas;
CREATE POLICY "inv_producto_lineas_all" ON public.inv_producto_lineas FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_inv_prod_lineas_producto ON public.inv_producto_lineas(producto_id);
