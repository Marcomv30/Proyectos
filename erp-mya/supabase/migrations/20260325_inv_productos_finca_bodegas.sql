-- ─────────────────────────────────────────────────────────────────────────────
-- Bodegas empresa_id = 3 + asignación a productos
-- Crea Bodega Finca (principal) y Bodega Planta, asigna bodega_id a cada
-- producto según su categoría, y re-codifica con prefijo F-/P- secuencial.
-- Ejecutar DESPUÉS de 20260325_inv_productos_finca_seed.sql
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_finca  BIGINT;
  v_planta BIGINT;
BEGIN

-- ── 1. Crear bodegas si no existen ───────────────────────────────────────────
INSERT INTO inv_bodegas (empresa_id, nombre, descripcion, es_principal, activo)
SELECT 3, 'Finca', 'Bodega de insumos de campo (agroquímicos, fertilizantes, etc.)', true, true
WHERE NOT EXISTS (SELECT 1 FROM inv_bodegas WHERE empresa_id = 3 AND nombre = 'Finca');

INSERT INTO inv_bodegas (empresa_id, nombre, descripcion, es_principal, activo)
SELECT 3, 'Planta', 'Bodega de materiales de empaque — planta empacadora', false, true
WHERE NOT EXISTS (SELECT 1 FROM inv_bodegas WHERE empresa_id = 3 AND nombre = 'Planta');

SELECT id INTO v_finca  FROM inv_bodegas WHERE empresa_id = 3 AND nombre = 'Finca';
SELECT id INTO v_planta FROM inv_bodegas WHERE empresa_id = 3 AND nombre = 'Planta';

-- ── 2. Asignar bodega_id según categoría ─────────────────────────────────────
-- EMP → Planta | todo lo demás → Finca
UPDATE inv_productos p
SET bodega_id = CASE
  WHEN c.codigo_prefijo = 'EMP' THEN v_planta
  ELSE v_finca
END
FROM inv_categorias c
WHERE p.empresa_id = 3
  AND p.categoria_id = c.id
  AND c.empresa_id = 3;

-- ── 3. Re-codificar: F-00001 / P-00001 secuencial por bodega ─────────────────
-- Orden: por código de categoría, luego por descripción (alfabético)
WITH renumerados AS (
  SELECT
    p.id,
    CASE WHEN p.bodega_id = v_planta THEN 'P' ELSE 'F' END
      || '-'
      || lpad(
           ROW_NUMBER() OVER (
             PARTITION BY p.bodega_id
             ORDER BY c.codigo_prefijo, p.descripcion
           )::text,
           5, '0'
         ) AS nuevo_codigo
  FROM inv_productos p
  JOIN inv_categorias c ON c.id = p.categoria_id
  WHERE p.empresa_id = 3
    AND p.bodega_id IS NOT NULL
)
UPDATE inv_productos p
SET codigo = r.nuevo_codigo
FROM renumerados r
WHERE p.id = r.id;

END;
$$;
