-- ============================================================
-- PLANILLA — Grant RPC generar saldo vacaciones anual
-- Permite llamar la función desde el frontend vía supabase.rpc()
-- ============================================================

-- SECURITY DEFINER para bypassear RLS al insertar en pl_vacaciones_saldo
CREATE OR REPLACE FUNCTION fn_generar_saldo_vacaciones_anual(
  p_empresa_id BIGINT,
  p_anio       INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_periodo_inicio DATE;
  v_periodo_fin    DATE;
  v_count          INTEGER := 0;
  v_colab          RECORD;
BEGIN
  v_periodo_inicio := make_date(p_anio, 1, 1);
  v_periodo_fin    := make_date(p_anio, 12, 31);

  FOR v_colab IN
    SELECT id, fecha_ingreso FROM pl_colaboradores
     WHERE empresa_id = p_empresa_id
       AND estado IN ('activo', 'vacaciones', 'incapacitado')
  LOOP
    -- Solo si lleva al menos 50 semanas trabajadas (CT: vacaciones al año cumplido)
    IF (CURRENT_DATE - v_colab.fecha_ingreso) >= 350 THEN
      INSERT INTO pl_vacaciones_saldo (
        empresa_id, colaborador_id,
        periodo_inicio, periodo_fin,
        dias_generados, dias_disfrutados
      ) VALUES (
        p_empresa_id, v_colab.id,
        v_periodo_inicio, v_periodo_fin,
        14, 0
      )
      ON CONFLICT (colaborador_id, periodo_inicio) DO NOTHING;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Permitir que usuarios autenticados llamen esta función
GRANT EXECUTE ON FUNCTION fn_generar_saldo_vacaciones_anual(BIGINT, INTEGER) TO authenticated;
