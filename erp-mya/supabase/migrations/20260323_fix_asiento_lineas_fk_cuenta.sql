-- Migra cuenta_id de plan_cuentas_base → plan_cuentas_empresa
-- en asiento_lineas y saldos_contables, actualiza FKs,
-- y corrige actualizar_saldos_asiento para usar IDs de empresa.

BEGIN;

-- ── 1. Migrar asiento_lineas ──────────────────────────────────────────────────
UPDATE public.asiento_lineas al
SET cuenta_id = pce.id
FROM public.asientos a,
     public.plan_cuentas_empresa pce
WHERE a.id = al.asiento_id
  AND pce.empresa_id = a.empresa_id
  AND pce.cuenta_base_id = al.cuenta_id;

ALTER TABLE public.asiento_lineas
  DROP CONSTRAINT IF EXISTS asiento_lineas_cuenta_id_fkey;

ALTER TABLE public.asiento_lineas
  ADD CONSTRAINT asiento_lineas_cuenta_id_fkey
  FOREIGN KEY (cuenta_id)
  REFERENCES public.plan_cuentas_empresa(id)
  ON DELETE RESTRICT;

-- ── 2. Migrar saldos_contables ────────────────────────────────────────────────
UPDATE public.saldos_contables sc
SET cuenta_id = pce.id
FROM public.plan_cuentas_empresa pce
WHERE pce.empresa_id = sc.empresa_id
  AND pce.cuenta_base_id = sc.cuenta_id;

-- Eliminar filas huérfanas (sin mapeo empresa) antes de poner el FK
DELETE FROM public.saldos_contables sc
WHERE NOT EXISTS (
  SELECT 1 FROM public.plan_cuentas_empresa pce
  WHERE pce.id = sc.cuenta_id
);

ALTER TABLE public.saldos_contables
  DROP CONSTRAINT IF EXISTS saldos_contables_cuenta_id_fkey;

ALTER TABLE public.saldos_contables
  ADD CONSTRAINT saldos_contables_cuenta_id_fkey
  FOREIGN KEY (cuenta_id)
  REFERENCES public.plan_cuentas_empresa(id)
  ON DELETE RESTRICT;

-- ── 3. Corregir actualizar_saldos_asiento ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.actualizar_saldos_asiento(p_asiento_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asiento    RECORD;
  v_linea      RECORD;
  v_periodo_id INTEGER;
  v_naturaleza TEXT;
  v_saldo_crc  NUMERIC(18,2);
  v_saldo_usd  NUMERIC(18,2);
BEGIN
  SELECT * INTO v_asiento FROM asientos WHERE id = p_asiento_id;

  SELECT id INTO v_periodo_id
  FROM periodos_contables
  WHERE empresa_id = v_asiento.empresa_id
    AND fecha_inicio <= v_asiento.fecha
    AND fecha_fin    >= v_asiento.fecha
    AND estado = 'ABIERTO'
  LIMIT 1;

  IF v_periodo_id IS NULL THEN
    RAISE EXCEPTION 'No existe período contable abierto para la fecha %', v_asiento.fecha;
  END IF;

  FOR v_linea IN
    SELECT * FROM asiento_lineas WHERE asiento_id = p_asiento_id
  LOOP
    -- Naturaleza desde plan_cuentas_empresa → plan_cuentas_base
    SELECT pcb.naturaleza INTO v_naturaleza
    FROM plan_cuentas_empresa pce
    JOIN plan_cuentas_base pcb ON pcb.id = pce.cuenta_base_id
    WHERE pce.id = v_linea.cuenta_id;

    v_saldo_crc := CASE WHEN v_naturaleza = 'DEBITO'
      THEN v_linea.debito_crc - v_linea.credito_crc
      ELSE v_linea.credito_crc - v_linea.debito_crc END;

    v_saldo_usd := CASE WHEN v_naturaleza = 'DEBITO'
      THEN v_linea.debito_usd - v_linea.credito_usd
      ELSE v_linea.credito_usd - v_linea.debito_usd END;

    INSERT INTO saldos_contables (
      empresa_id, periodo_id, cuenta_id,
      debito_crc, credito_crc, saldo_crc,
      debito_usd, credito_usd, saldo_usd,
      updated_at
    ) VALUES (
      v_asiento.empresa_id, v_periodo_id, v_linea.cuenta_id,
      v_linea.debito_crc, v_linea.credito_crc, v_saldo_crc,
      v_linea.debito_usd, v_linea.credito_usd, v_saldo_usd,
      NOW()
    )
    ON CONFLICT (empresa_id, periodo_id, cuenta_id) DO UPDATE SET
      debito_crc  = saldos_contables.debito_crc  + EXCLUDED.debito_crc,
      credito_crc = saldos_contables.credito_crc + EXCLUDED.credito_crc,
      saldo_crc   = saldos_contables.saldo_crc   + EXCLUDED.saldo_crc,
      debito_usd  = saldos_contables.debito_usd  + EXCLUDED.debito_usd,
      credito_usd = saldos_contables.credito_usd + EXCLUDED.credito_usd,
      saldo_usd   = saldos_contables.saldo_usd   + EXCLUDED.saldo_usd,
      updated_at  = NOW();
  END LOOP;
END;
$$;

COMMIT;
