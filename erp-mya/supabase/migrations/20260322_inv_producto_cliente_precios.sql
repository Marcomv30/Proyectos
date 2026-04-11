-- ============================================================
-- MYA ERP - Inventarios: precios especiales por cliente-articulo
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inv_producto_cliente_precios (
  id                    BIGSERIAL PRIMARY KEY,
  empresa_id            BIGINT NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  producto_id           BIGINT NOT NULL REFERENCES public.inv_productos(id) ON DELETE CASCADE,
  tercero_id            BIGINT NOT NULL REFERENCES public.terceros(id) ON DELETE CASCADE,
  escala_precio         SMALLINT NOT NULL DEFAULT 1 CHECK (escala_precio BETWEEN 1 AND 4),
  precio_venta          NUMERIC(15,4) NOT NULL DEFAULT 0,
  descuento_maximo_pct  NUMERIC(7,2) NOT NULL DEFAULT 0,
  activo                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inv_producto_cliente_precios_uq UNIQUE (empresa_id, producto_id, tercero_id)
);

ALTER TABLE public.inv_producto_cliente_precios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_producto_cliente_precios_all"
ON public.inv_producto_cliente_precios
FOR ALL
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_inv_producto_cliente_precios_empresa_tercero
  ON public.inv_producto_cliente_precios (empresa_id, tercero_id);

CREATE INDEX IF NOT EXISTS idx_inv_producto_cliente_precios_producto
  ON public.inv_producto_cliente_precios (producto_id);
