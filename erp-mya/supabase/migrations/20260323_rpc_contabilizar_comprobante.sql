-- RPC para contabilizar un comprobante XML recibido.
-- Crea el asiento contable con las líneas editadas por el usuario,
-- marca el comprobante como contabilizado y crea el documento CXP.
--
-- POLÍTICA BASE/EMPRESA:
--   Los cuenta_id recibidos son plan_cuentas_empresa.id.
--   asiento_lineas.cuenta_id también referencia plan_cuentas_empresa.id (FK directa).
--   No se requiere conversión a base.

-- Eliminar TODAS las sobrecargas existentes del función por nombre
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure::text AS sig
    FROM pg_proc
    WHERE proname = 'contabilizar_comprobante'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.contabilizar_comprobante(
  p_empresa_id     INTEGER,
  p_comprobante_id BIGINT,
  p_categoria_id   BIGINT,
  p_fecha          DATE,
  p_descripcion    TEXT,
  p_moneda         TEXT    DEFAULT 'CRC',
  p_tipo_cambio    NUMERIC DEFAULT 1,
  p_lineas         JSONB   DEFAULT '[]',
  p_proveedor_id   BIGINT  DEFAULT NULL,
  p_tipo           TEXT    DEFAULT 'FE',
  p_numero         TEXT    DEFAULT NULL,
  p_monto_total    NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asiento_id  BIGINT;
  v_seq         INTEGER;
  v_numero_fmt  TEXT;
  v_year        TEXT;
  v_linea       JSONB;
  v_linea_num   INTEGER;
BEGIN
  -- 1. Verificar que no esté ya contabilizado
  IF EXISTS (
    SELECT 1 FROM comprobantes_recibidos
    WHERE id = p_comprobante_id AND contabilizado = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El comprobante ya fue contabilizado');
  END IF;

  -- 2. Validar que haya líneas
  IF p_lineas IS NULL OR jsonb_array_length(p_lineas) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Se requiere al menos una línea en el asiento');
  END IF;

  -- 3. Verificar que existe período contable activo para la fecha
  IF NOT EXISTS (
    SELECT 1 FROM periodos_contables
    WHERE empresa_id = p_empresa_id
      AND fecha_inicio <= p_fecha
      AND fecha_fin    >= p_fecha
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'No hay periodo contable activo para la fecha ' || p_fecha::TEXT ||
               '. Verifique en Contabilidad → Períodos Contables.'
    );
  END IF;

  -- 4. Generar número secuencial CO-NNN-YYYY
  v_year := EXTRACT(YEAR FROM p_fecha)::TEXT;
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(numero_formato, '^CO-(\d+)-\d{4}$', '\1'), '')::INTEGER
  ), 0) + 1
  INTO v_seq
  FROM asientos
  WHERE empresa_id = p_empresa_id
    AND numero_formato LIKE 'CO-%-' || v_year;

  v_numero_fmt := 'CO-' || LPAD(v_seq::TEXT, 3, '0') || '-' || v_year;

  -- 5. Insertar el asiento
  INSERT INTO asientos (
    empresa_id, fecha, descripcion, numero_formato,
    categoria_id, estado, moneda, tipo_cambio
  ) VALUES (
    p_empresa_id, p_fecha, p_descripcion, v_numero_fmt,
    p_categoria_id, 'CONFIRMADO',
    UPPER(COALESCE(p_moneda, 'CRC')),
    COALESCE(p_tipo_cambio, 1)
  )
  RETURNING id INTO v_asiento_id;

  -- 6. Insertar líneas del asiento
  v_linea_num := 1;
  FOR v_linea IN SELECT value FROM jsonb_array_elements(p_lineas)
  LOOP
    INSERT INTO asiento_lineas (
      asiento_id, cuenta_id, descripcion, referencia,
      debito_crc, credito_crc, debito_usd, credito_usd, linea
    ) VALUES (
      v_asiento_id,
      (v_linea->>'cuenta_id')::BIGINT,
      COALESCE(v_linea->>'descripcion', ''),
      COALESCE(v_linea->>'referencia', v_numero_fmt),
      COALESCE((v_linea->>'debito_crc')::NUMERIC,  0),
      COALESCE((v_linea->>'credito_crc')::NUMERIC, 0),
      COALESCE((v_linea->>'debito_usd')::NUMERIC,  0),
      COALESCE((v_linea->>'credito_usd')::NUMERIC, 0),
      v_linea_num
    );
    v_linea_num := v_linea_num + 1;
  END LOOP;

  -- 7. Actualizar saldos contables
  PERFORM actualizar_saldos_asiento(v_asiento_id::INTEGER);

  -- 8. Marcar comprobante como contabilizado
  UPDATE comprobantes_recibidos
  SET contabilizado = true,
      asiento_id    = v_asiento_id
  WHERE id = p_comprobante_id;

  -- 9. Crear documento CXP (si tiene proveedor)
  IF p_proveedor_id IS NOT NULL THEN
    INSERT INTO cxp_documentos (
      empresa_id, comprobante_id, proveedor_id, tipo,
      numero_comprobante, fecha_emision, moneda, tipo_cambio,
      monto_total, saldo, asiento_id, estado
    ) VALUES (
      p_empresa_id, p_comprobante_id, p_proveedor_id,
      COALESCE(p_tipo, 'FE'),
      p_numero, p_fecha,
      UPPER(COALESCE(p_moneda, 'CRC')),
      COALESCE(p_tipo_cambio, 1),
      COALESCE(p_monto_total, 0),
      COALESCE(p_monto_total, 0),
      v_asiento_id,
      'pendiente'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',             true,
    'asiento_id',     v_asiento_id,
    'numero_formato', v_numero_fmt
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
