-- ============================================================
-- Fix: trigger emp_fn_actualizar_paletas
-- Bug: al mover una boleta de OPC, solo actualizaba el destino,
--      nunca descontaba del origen.
-- ============================================================

CREATE OR REPLACE FUNCTION emp_fn_actualizar_paletas()
RETURNS TRIGGER AS $$
DECLARE
  v_det_new  UUID;
  v_det_old  UUID;
  v_prog_new UUID;
  v_prog_old UUID;
BEGIN
  -- Extraer IDs según la operación
  v_det_new  := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.programa_det_id END;
  v_det_old  := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.programa_det_id END;
  v_prog_new := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.programa_id END;
  v_prog_old := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.programa_id END;

  -- ── OPC nuevo (o único en INSERT/DELETE) ─────────────────────
  IF v_det_new IS NOT NULL THEN
    UPDATE emp_programas_detalle
    SET paletas_producidas = (
      SELECT COUNT(*) FROM emp_boletas
      WHERE programa_det_id = v_det_new AND aplica = TRUE
    )
    WHERE id = v_det_new;
  END IF;

  -- ── OPC anterior (solo UPDATE cuando cambió de línea) ────────
  IF v_det_old IS NOT NULL AND v_det_old IS DISTINCT FROM v_det_new THEN
    UPDATE emp_programas_detalle
    SET paletas_producidas = (
      SELECT COUNT(*) FROM emp_boletas
      WHERE programa_det_id = v_det_old AND aplica = TRUE
    )
    WHERE id = v_det_old;
  END IF;

  -- ── ORP nuevo ────────────────────────────────────────────────
  IF v_prog_new IS NOT NULL THEN
    UPDATE emp_programas
    SET paletas_empacadas = (
      SELECT COALESCE(SUM(paletas_producidas), 0)
      FROM emp_programas_detalle
      WHERE programa_id = v_prog_new
    )
    WHERE id = v_prog_new;
  END IF;

  -- ── ORP anterior (si cambió de programa) ─────────────────────
  IF v_prog_old IS NOT NULL AND v_prog_old IS DISTINCT FROM v_prog_new THEN
    UPDATE emp_programas
    SET paletas_empacadas = (
      SELECT COALESCE(SUM(paletas_producidas), 0)
      FROM emp_programas_detalle
      WHERE programa_id = v_prog_old
    )
    WHERE id = v_prog_old;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- El trigger ya existe, solo se reemplaza la función
