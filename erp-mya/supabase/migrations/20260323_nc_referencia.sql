-- Agrega soporte para vincular Notas de Crédito (NC) a la FE original
-- y parsear el número de referencia del XML

ALTER TABLE public.comprobantes_recibidos
  ADD COLUMN IF NOT EXISTS nc_referencia_numero  TEXT,          -- numero_comprobante de la FE original (del XML)
  ADD COLUMN IF NOT EXISTS nc_referencia_id      BIGINT         -- FK al comprobante original si existe en el sistema
    REFERENCES public.comprobantes_recibidos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comprobantes_nc_ref
  ON public.comprobantes_recibidos (empresa_id, nc_referencia_id)
  WHERE nc_referencia_id IS NOT NULL;

-- Auto-vincular NC existentes que ya tienen nc_referencia_numero y la FE está en el sistema
UPDATE public.comprobantes_recibidos nc
SET nc_referencia_id = fe.id
FROM public.comprobantes_recibidos fe
WHERE nc.empresa_id = fe.empresa_id
  AND nc.nc_referencia_numero IS NOT NULL
  AND nc.nc_referencia_numero = fe.numero_comprobante
  AND nc.nc_referencia_id IS NULL
  AND nc.tipo IN ('NOTA_CREDITO', 'NOTA_DEBITO');
