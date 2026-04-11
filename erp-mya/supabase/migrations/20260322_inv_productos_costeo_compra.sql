-- ============================================================
-- MYA ERP - Inventarios: costeo de compra y costo neto unitario
-- ============================================================

ALTER TABLE public.inv_productos
  ADD COLUMN IF NOT EXISTS unidad_compra            TEXT,
  ADD COLUMN IF NOT EXISTS factor_conversion        NUMERIC(15,4) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS descuento_compra_pct     NUMERIC(7,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonificacion_unidades    NUMERIC(15,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impuesto_consumo_monto   NUMERIC(15,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS flete_monto              NUMERIC(15,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incluir_flete_en_costo   BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS costo_bruto_ajustado     NUMERIC(15,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS costo_neto_unitario      NUMERIC(15,4) DEFAULT 0;

UPDATE public.inv_productos
SET
  unidad_compra = COALESCE(NULLIF(unidad_compra, ''), unidad_medida, 'Unid'),
  factor_conversion = CASE
    WHEN COALESCE(factor_conversion, 0) > 0 THEN factor_conversion
    WHEN COALESCE(cantidad_medida, 0) > 0 THEN cantidad_medida
    ELSE 1
  END,
  costo_bruto_ajustado = CASE
    WHEN COALESCE(costo_bruto_ajustado, 0) > 0 THEN costo_bruto_ajustado
    ELSE COALESCE(precio_compra_ref, 0)
  END,
  costo_neto_unitario = CASE
    WHEN COALESCE(costo_neto_unitario, 0) > 0 THEN costo_neto_unitario
    ELSE
      CASE
        WHEN COALESCE(
          CASE
            WHEN COALESCE(factor_conversion, 0) > 0 THEN factor_conversion
            WHEN COALESCE(cantidad_medida, 0) > 0 THEN cantidad_medida
            ELSE 1
          END, 1
        ) > 0
          THEN COALESCE(precio_compra_ref, 0) / (
            CASE
              WHEN COALESCE(factor_conversion, 0) > 0 THEN factor_conversion
              WHEN COALESCE(cantidad_medida, 0) > 0 THEN cantidad_medida
              ELSE 1
            END
          )
        ELSE COALESCE(precio_compra_ref, 0)
      END
  END
WHERE true;
