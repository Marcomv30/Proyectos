-- ============================================================
-- PLANILLA — SALDO DE VACACIONES AUTOMÁTICO
-- Trigger: al aprobar una ausencia de tipo vacaciones,
-- actualiza pl_vacaciones_saldo descontando los días.
-- Al revertir (rechazar/cancelar), los días se devuelven.
-- ============================================================

-- Función que ejecuta el trigger
CREATE OR REPLACE FUNCTION fn_actualizar_saldo_vacaciones()
RETURNS TRIGGER AS $$
DECLARE
  v_tipo_base VARCHAR;
  v_dias      NUMERIC;
  v_periodo   RECORD;
BEGIN
  -- Solo aplica a ausencias que descuentan vacaciones
  SELECT tipo_base, descuenta_vacaciones
    INTO v_tipo_base
    FROM pl_tipos_ausencia
   WHERE id = COALESCE(NEW.tipo_ausencia_id, OLD.tipo_ausencia_id);

  IF v_tipo_base IS NULL OR v_tipo_base != 'vacaciones' THEN
    RETURN NEW;
  END IF;

  v_dias := COALESCE(COALESCE(NEW.dias_habiles, NEW.dias_naturales), 0);

  -- Obtener el período de vacaciones activo del colaborador
  -- (el que tenga saldo pendiente y cubra la fecha de inicio de la ausencia)
  SELECT * INTO v_periodo
    FROM pl_vacaciones_saldo
   WHERE colaborador_id = COALESCE(NEW.colaborador_id, OLD.colaborador_id)
     AND periodo_inicio <= COALESCE(NEW.fecha_inicio, OLD.fecha_inicio)
     AND periodo_fin    >= COALESCE(NEW.fecha_inicio, OLD.fecha_inicio)
   ORDER BY periodo_inicio DESC
   LIMIT 1;

  IF v_periodo IS NULL THEN
    -- Si no existe período, buscar el más reciente
    SELECT * INTO v_periodo
      FROM pl_vacaciones_saldo
     WHERE colaborador_id = COALESCE(NEW.colaborador_id, OLD.colaborador_id)
     ORDER BY periodo_inicio DESC
     LIMIT 1;
  END IF;

  IF v_periodo IS NULL THEN
    RETURN NEW; -- Sin saldo registrado, no hacer nada
  END IF;

  -- INSERT / UPDATE: ausencia pasa a aprobada → descontar días
  IF TG_OP = 'INSERT' AND NEW.estado = 'aprobada' THEN
    UPDATE pl_vacaciones_saldo
       SET dias_disfrutados = dias_disfrutados + v_dias,
           updated_at       = NOW()
     WHERE id = v_periodo.id;

  ELSIF TG_OP = 'UPDATE' THEN
    -- De no-aprobada → aprobada: descontar
    IF OLD.estado != 'aprobada' AND NEW.estado = 'aprobada' THEN
      UPDATE pl_vacaciones_saldo
         SET dias_disfrutados = dias_disfrutados + v_dias,
             updated_at       = NOW()
       WHERE id = v_periodo.id;

    -- De aprobada → rechazada/cancelada: devolver días
    ELSIF OLD.estado = 'aprobada' AND NEW.estado IN ('rechazada', 'cancelada') THEN
      UPDATE pl_vacaciones_saldo
         SET dias_disfrutados = GREATEST(0, dias_disfrutados - v_dias),
             updated_at       = NOW()
       WHERE id = v_periodo.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger en pl_ausencias
DROP TRIGGER IF EXISTS tg_saldo_vacaciones ON pl_ausencias;
CREATE TRIGGER tg_saldo_vacaciones
  AFTER INSERT OR UPDATE OF estado ON pl_ausencias
  FOR EACH ROW
  EXECUTE FUNCTION fn_actualizar_saldo_vacaciones();

-- -------------------------------------------------------
-- Función para generar saldo de vacaciones anual
-- Llamar una vez al inicio de cada año o al ingresar
-- un colaborador nuevo. Genera 14 días por año (CT art 153)
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_generar_saldo_vacaciones_anual(
  p_empresa_id BIGINT,
  p_anio       INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
) RETURNS INTEGER AS $$
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
$$ LANGUAGE plpgsql;

-- Generar saldos 2026 para empresas existentes
SELECT fn_generar_saldo_vacaciones_anual(id, 2026) AS saldos_generados
FROM empresas;
