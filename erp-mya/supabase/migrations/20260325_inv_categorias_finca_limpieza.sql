-- ─────────────────────────────────────────────────────────────────────────────
-- Limpieza de categorías duplicadas — empresa_id = 3
-- Elimina duplicados y entradas incorrectas dejando solo las 12 correctas
-- ─────────────────────────────────────────────────────────────────────────────

-- Borrar duplicados y categorías incorrectas (AGR, INS y duplicados de AGQ y FER)
DELETE FROM inv_categorias
WHERE empresa_id = 3
  AND (
    codigo_prefijo IN ('AGR', 'INS')
    OR (codigo_prefijo = 'AGQ' AND id NOT IN (
          SELECT MIN(id) FROM inv_categorias WHERE empresa_id = 3 AND codigo_prefijo = 'AGQ'
        ))
    OR (codigo_prefijo = 'FER' AND id NOT IN (
          SELECT MIN(id) FROM inv_categorias WHERE empresa_id = 3 AND codigo_prefijo = 'FER'
        ))
  );
