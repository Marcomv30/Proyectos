-- ============================================================
-- MYA ERP - Inventarios: capa comercial y escalas de precio
-- ============================================================

ALTER TABLE public.inv_productos
  ADD COLUMN IF NOT EXISTS precio_compra_ref         NUMERIC(15,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_autorizado_pct  NUMERIC(7,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impuesto_venta_incluido   BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS cantidad_medida           NUMERIC(15,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_por_medida         NUMERIC(15,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ubicacion                 TEXT,
  ADD COLUMN IF NOT EXISTS referencia_parte          TEXT,
  ADD COLUMN IF NOT EXISTS catalogo_ref              TEXT,
  ADD COLUMN IF NOT EXISTS serie                     TEXT;

CREATE TABLE IF NOT EXISTS public.inv_producto_escalas (
  id            BIGSERIAL PRIMARY KEY,
  producto_id    BIGINT NOT NULL REFERENCES public.inv_productos(id) ON DELETE CASCADE,
  escala         SMALLINT NOT NULL CHECK (escala BETWEEN 1 AND 4),
  utilidad_pct   NUMERIC(7,2)  DEFAULT 0,
  precio_venta   NUMERIC(15,4) DEFAULT 0,
  precio_final   NUMERIC(15,4) DEFAULT 0,
  activo         BOOLEAN       DEFAULT true,
  created_at     TIMESTAMPTZ   DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   DEFAULT NOW(),
  CONSTRAINT inv_producto_escalas_uq UNIQUE (producto_id, escala)
);

ALTER TABLE public.inv_producto_escalas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_producto_escalas_all"
ON public.inv_producto_escalas
FOR ALL
USING (true)
WITH CHECK (true);

INSERT INTO public.inv_producto_escalas (producto_id, escala, utilidad_pct, precio_venta, precio_final, activo)
SELECT
  p.id,
  1,
  CASE
    WHEN COALESCE(p.costo_promedio, 0) > 0 AND COALESCE(p.precio_venta, 0) > 0
      THEN ROUND((((p.precio_venta / p.costo_promedio) - 1) * 100)::numeric, 2)
    ELSE 0
  END,
  COALESCE(p.precio_venta, 0),
  ROUND(COALESCE(p.precio_venta, 0) * (1 + (COALESCE(p.tarifa_iva, 0) / 100.0)), 4),
  true
FROM public.inv_productos p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.inv_producto_escalas e
  WHERE e.producto_id = p.id
    AND e.escala = 1
);

CREATE INDEX IF NOT EXISTS idx_inv_producto_escalas_producto
  ON public.inv_producto_escalas(producto_id);
