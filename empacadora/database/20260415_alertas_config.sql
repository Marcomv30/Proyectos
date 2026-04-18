-- =============================================================================
-- Alertas de Stock — Configuración y Log
-- 2026-04-15
-- =============================================================================

-- ── 1. Tabla de configuración de alertas ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS emp_alertas_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      INTEGER NOT NULL UNIQUE,
  activo          BOOLEAN NOT NULL DEFAULT false,
  emails          TEXT NOT NULL DEFAULT '',   -- lista separada por comas
  hora_envio      SMALLINT NOT NULL DEFAULT 7 CHECK (hora_envio BETWEEN 0 AND 23),
  solo_cambios    BOOLEAN NOT NULL DEFAULT true,  -- true = solo alerta si hay cambios vs último envío
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE emp_alertas_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emp_alertas_config_all" ON emp_alertas_config
  FOR ALL USING (true) WITH CHECK (true);

-- ── 2. Log de alertas enviadas ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emp_alertas_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       INTEGER NOT NULL,
  materiales_count INTEGER NOT NULL DEFAULT 0,
  emails_enviados  TEXT,
  estado           VARCHAR(20) DEFAULT 'enviado',   -- 'enviado' | 'error' | 'sin_alertas'
  respuesta        TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE emp_alertas_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emp_alertas_log_all" ON emp_alertas_log
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_emp_alertas_log_empresa
  ON emp_alertas_log (empresa_id, created_at DESC);

-- ── 3. Insertar config por defecto para empresas existentes ─────────────────
INSERT INTO emp_alertas_config (empresa_id, activo, emails)
SELECT DISTINCT empresa_id, false, ''
FROM emp_bodegas
ON CONFLICT (empresa_id) DO NOTHING;

-- ── 4. pg_cron: revisar alertas cada hora (la Edge Function decide si envía) ─
-- NOTA: Reemplazar YOUR_PROJECT_REF y YOUR_ANON_KEY con los valores reales
-- de Supabase. Ejecutar UNA VEZ manualmente después de configurar la EF.
--
-- SELECT cron.schedule(
--   'emp-alertas-stock',
--   '0 * * * *',   -- cada hora en punto
--   $$
--   SELECT net.http_post(
--     url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/alertas-stock',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer YOUR_ANON_KEY',
--       'Content-Type',  'application/json'
--     ),
--     body    := jsonb_build_object('source', 'cron')
--   ) AS request_id;
--   $$
-- );
