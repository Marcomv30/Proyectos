-- ============================================================
-- Importación catálogo exportación (categoría EXP)
-- 127 productos únicos — 4 duplicados del CSV omitidos
-- Ejecutar en Supabase SQL Editor
-- AJUSTAR empresa_id si es diferente de 1
-- ============================================================

DO $$
DECLARE
  v_emp  INTEGER := 1;   -- << AJUSTAR empresa_id
  v_cat  BIGINT;
BEGIN
  -- Obtener o crear categoría EXP
  SELECT id INTO v_cat FROM inv_categorias
  WHERE empresa_id = v_emp AND UPPER(TRIM(nombre)) = 'EXP'
  LIMIT 1;

  IF v_cat IS NULL THEN
    INSERT INTO inv_categorias (empresa_id, nombre, activo)
    VALUES (v_emp, 'EXP', true)
    RETURNING id INTO v_cat;
  END IF;

  -- Insertar productos con código secuencial EXP-00001, EXP-00002 ...
  -- La secuencia parte desde el último código EXP existente en la empresa
  INSERT INTO inv_productos
    (empresa_id, codigo, descripcion, tipo, unidad_medida, tarifa_iva, codigo_tarifa_iva,
     codigo_cabys, partida_arancelaria, activo, categoria_id)
  SELECT
    v_emp,
    'EXP-' || LPAD(
      (COALESCE(
        (SELECT MAX(NULLIF(REGEXP_REPLACE(codigo, '[^0-9]', '', 'g'), '')::INTEGER)
         FROM inv_productos
         WHERE empresa_id = v_emp AND codigo LIKE 'EXP-%'),
        0
      ) + ROW_NUMBER() OVER ())::TEXT,
    5, '0'),
    p.nombre, 'producto', 'Unid', p.iva, '01',
    '0131800029900', '200820000000', true, v_cat
  FROM (VALUES
    ('CAJAS DE PIÑA CALIBRE 5 SIMBA',               10),
    ('CAJAS DE PIÑA CALIBRE 6 SIMBA',               10),
    ('CAJAS DE PIÑA CALIBRE 7 SIMBA',               10),
    ('CAJAS DE PIÑA CALIBRE 8 SIMBA GN',            10),
    ('CAJAS DE PIÑA CALIBRE 9 SIMBA',               10),
    ('CAJAS DE PIÑA CALIBRE 10 SIMBA',              10),
    ('CAJAS DE PIÑA CALIBRE 5 ORSERO',              10),
    ('CAJAS DE PIÑA CALIBRE 6 ORSERO',              10),
    ('CAJAS DE PIÑA CALIBRE 7 ORSERO',              10),
    ('CAJAS DE PIÑA CALIBRE 8 ORSERO',              10),
    ('CAJAS DE PIÑA CALIBRE 9 ORSERO',              10),
    ('CAJAS DE PIÑA CALIBRE 10 ORSERO',             10),
    ('CAJAS DE PIÑA CALIBRE 5 ORO',                 10),
    ('CAJAS DE PIÑA CALIBRE 6 ORO',                 10),
    ('CAJAS DE PIÑA CALIBRE 7 ORO',                 10),
    ('CAJAS DE PIÑA CALIBRE 8 ORO',                 10),
    ('CAJAS DE PIÑA CALIBRE 9 ORO',                 10),
    ('CAJAS DE PIÑA CALIBRE 5',                     10),
    ('CAJAS DE PIÑA CALIBRE 6 ORO BLANCO',          10),
    ('CAJAS DE PIÑA CALIBRE 7 ORO BLANCO',          10),
    ('CAJAS DE PIÑA CALIBRE 8 ORSERO C SC',         10),
    ('CAJAS DE PIÑA CALIBRE 9 ORSERO C SC',         10),
    ('CAJAS DE PIÑA CALIBRE 9 ORO BLANCO',          10),
    ('CAJAS DE PIÑA CALIBRE 7 ORSERO CRW COLOR',    10),
    ('CAJAS DE PIÑA CALIBRE 8 ORSERO CRW VERDE',    10),
    ('CAJAS DE PIÑA CALIBRE 9 CRW',                 10),
    ('CAJAS DE PIÑA CALIBRE 10 CRW',                10),
    ('CAJAS DE PIÑA CALIBRE 6 ORSERO CRW COLOR',    10),
    ('CAJAS DE PIÑA CALIBRE 7 SIMBA CRW',           10),
    ('CAJAS DE PIÑA CALIBRE 8 SIMBA CRW',           10),
    ('CAJAS DE PIÑA CALIBRE 9 SIMBA CRW',           10),
    ('CAJAS DE PIÑA CALIBRE 10 SIMBA CRW V',        10),
    ('CAJAS DE PIÑA CALIBRE 12 SIMBA CRW',          10),
    ('CAJAS DE PIÑA CALIBRE 7 ORSERO CRW VERDE',    10),
    ('CAJAS DE PIÑA CALIBRE 6 ORO GENERICO SC',     10),
    ('CAJAS DE PIÑA CALIBRE 5 ORO BLANCO',          10),
    ('CAJAS DE PIÑA CALIBRE 7 SIMBA GOLDMAR',       10),
    ('CAJAS DE PIÑA CALIBRE 6 CONAD VERDE',         10),
    ('CAJAS DE PIÑA CALIBRE 7 CONAD VERDE',         10),
    ('CAJAS DE PIÑA CALIBRE 8 CONAD VERDE',         10),
    ('CAJAS DE PIÑA CALIBRE 6 CONAD COLOR',         10),
    ('CAJAS DE PIÑA CALIBRE 7 CONAD COLOR GN',      10),
    ('CAJAS DE PIÑA CALIBRE 8 CONAD COLOR',         10),
    ('CAJAS DE PIÑA CALIBRE 6 ORSERO C',            10),
    ('CAJAS DE PIÑA CALIBRE 7 ORSERO C',            10),
    ('CAJAS DE PIÑA CALIBRE 8 ORSERO C',            10),
    ('CAJAS DE PIÑA CALIBRE 9 ORSERO C',            10),
    ('CAJAS DE PIÑA CALIBRE 8 METRO CHEF',          10),
    ('CAJAS DE PIÑA CALIBRE 8 SIMBA',               10),
    ('CAJAS DE PIÑA CALIBRE 6 ORSERO CRW VERDE',    10),
    ('CAJAS DE PIÑA CALIBRE 8 SIMBA CRW V',         10),
    ('CAJA DE PIÑA CALIBRE 8 ORSERO GN CRW C',      10),
    ('CAJA DE PIÑA CALIBRE 6 CONAD VERDE GN',       10),
    ('CAJAS DE PIÑA CALIBRE 6 CONAD COLOR GN',      10),
    ('CAJA DE PIÑA CALIBRE 8 ORSERO CRW COLOR',     10),
    ('CAJAS DE PIÑA CALIBRE 8 CONAD COLOR GN',      10),
    ('CAJAS DE PIÑA CALIBRE 8 SIMBA GN CRW V',      10),
    ('CAJAS DE PIÑA CALIBRE 9 SIMBA GN CROW V',     10),
    ('CAJAS DE PIÑA CALIBRE 7 SIMBA GN',            10),
    ('CAJAS DE PIÑA CALIBRE 9 SIMBA GN',            10),
    ('CAJAS DE PIÑA CALIBRE 6 SIMBA GN',            10),
    ('CAJAS DE PIÑA CALIBRE 7 CONAD VERD GN',       10),
    ('CAJAS DE PIÑA CALIBRE 8 SIMBA C',             10),
    ('CAJAS DE PIÑA CALIBRE 8 CONAD VERD GN',       10),
    ('CAJAS DE PIÑA CALIBRE 6 GN N CRW COLOR',      10),
    ('CAJAS DE PIÑA CALIBRE 7 GN N CRW COLOR',      10),
    ('CAJAS DE PIÑA CALIBRE 6 GN N CRW VERDE',      10),
    ('CAJAS DE PIÑA CALIBRE 7 GN N CRW VERDE',      10),
    ('CAJAS DE PIÑA CALIBRE 8 GN N CRW VERDE',      10),
    ('CAJAS DE PIÑA CALIBRE 9 GN N CRW VERDE',      10),
    ('CAJAS DE PIÑA 5 SIMBA CRW VERDE',             10),
    ('CAJAS DE PIÑA CALIBRE 6 SIMBA GN CRW V',      10),
    ('CAJAS DE PIÑA CALIBRE 7 SIMBA GN CRW V',      10),
    ('CAJAS DE PIÑA CALIBRE 9 SIMBA CRW V',         10),
    ('CAJAS DE PIÑA CALIBRE 6 ORSERO GN VERDE',     10),
    ('CAJAS DE PIÑA CALIBRE 6 ORSERO GN CRW C',     10),
    ('CAJAS DE PIÑA CALIBRE 7 ORSERO GN CRW C',     10),
    ('CAJAS DE PIÑA CALIBRE 6 ORSERO GN CRW V',     10),
    ('CAJAS DE PIÑA CALIBRE 9 SIMBA C',             10),
    ('CAJAS DE PIÑA CALIBRE 7 ORO GN',              10),
    ('CAJAS DE PIÑA CALIBRE 8 ORO GN',              10),
    ('CAJAS DE PIÑA CALIBRE 6 GN N CRW C',          10),
    ('CAJAS DE PIÑA CALIBRE 7 CONAD COLOR',         10),
    ('CAJAS DE PIÑA CALIBRE 6 ORO VERTICAL',        10),
    ('CAJAS DE PIÑA CALIBRE 5 ORSERO C',            10),
    ('CAJAS DE PIÑA CALIBRE 7 ORO GENERICO',        10),
    ('CAJA DE PIÑA CALIBRE 5 ORSERO CRW COLOR',     10),
    ('CAJA DE PIÑA CALIBRE 6 SIMBA CRW V',          10),
    ('CAJA DE PIÑA CALIBRE 7 SIMBA CRW V',          10),
    ('CAJA DE PIÑA CALIBRE 5 SIMBA CRW V',          10),
    ('CAJAS DE PIÑA CALIBRE 5 ORSERO CRW V',        10),
    ('CAJAS DE PIÑA CALIBRE 6 ORO GENERICO',        10),
    ('CAJAS DE PIÑA CALIBRE 5 GENERICO',            10),
    ('CAJAS DE PIÑA CALIBRE 8 ORO GENERICO SC',     10),
    ('CAJAS DE PIÑA CALIBRE 9 GENERICO',             1),
    ('CAJAS DE PIÑA CALIBRE 6 GN ORO VERTICAL',     10),
    ('CAJAS DE PIÑA CALIBRE 6',                     10),
    ('CAJAS DE PIÑA CALIBRE 7',                     10),
    ('CAJAS DE PIÑA CALIBRE 8 ORO BLANCO',          10),
    ('CAJAS DE PIÑA CALIBRE 8',                     10),
    ('CAJAS DE PIÑA CALIBRE 9',                     10),
    ('CAJAS DE PIÑA CALIBRE 10',                    10),
    ('Gate Fee',                                    10),
    ('CAJAS DE PIÑA CALIBRE 8 GENERICO',             1),
    ('KILOS DE PIÑA CALIBRE 6',                     10),
    ('KILOS DE PIÑA CALIBRE 7',                     10),
    ('KILOS DE PIÑA CALIBRE 8',                     10),
    ('KILOS DE PIÑA CALIBRE 9',                     10),
    ('KILOS DE PIÑA CALIBRE 10',                    10),
    ('FLETE INTERNO',                               10),
    ('CAJAS DE PIÑA CALIBRE 8 ORO SC',              10),
    ('CAJAS DE PIÑA CALIBRE 9 ORO SC',              10),
    ('CAJAS DE PIÑA CALIBRE 9 ORSERO SC',           10),
    ('CAJAS DE PIÑA CALIBRE 9 SIMBA SC',            10),
    ('CAJAS DE PIÑA CALIBRE 8 ORSERO SC',           10),
    ('CAJAS DE PIÑA CALIBRE 8 SIMBA SC',            10),
    ('CAJAS DE PIÑA CALIBRE 6 ORSERO SC',           10),
    ('CAJAS DE PIÑA CALIBRE 7 ORO SC',              10),
    ('LAMINA 6 HUECOS KRAFT',                       10),
    ('CAJAS DE PIÑA CALIBRE 7 ORO GENERICO SC',     10),
    ('KILOS DE PIÑA CALIBRE 5',                     10),
    ('CAJAS DE PIÑA CALIBRE 10 GENERICO',            1),
    ('FILTRO ETILENO',                              10),
    ('CAJAS DE PIÑA CALIBRE 5 CRW',                10),
    ('CAJAS DE PIÑA CALIBRE 6 CRW',                10),
    ('CAJAS DE PIÑA CALIBRE 7 CRW',                10)
  ) AS p(nombre, iva)
  WHERE NOT EXISTS (
    SELECT 1 FROM inv_productos
    WHERE empresa_id = v_emp AND UPPER(TRIM(descripcion)) = UPPER(TRIM(p.nombre))
  );

  RAISE NOTICE 'Importación completada — categoría EXP id=%', v_cat;
END $$;
