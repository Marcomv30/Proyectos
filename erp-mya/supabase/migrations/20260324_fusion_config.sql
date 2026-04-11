-- ============================================================
-- MYA ERP — Configuración de conexión Fusion por empresa
-- Tabla: fusion_config
-- ============================================================

CREATE TABLE IF NOT EXISTS fusion_config (
  id               serial        PRIMARY KEY,
  empresa_id       integer       NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  ssh_host         text          NOT NULL,
  ssh_port         integer       NOT NULL DEFAULT 22,
  ssh_user         text          NOT NULL,
  ssh_pass         text          NOT NULL,
  pg_db            text          NOT NULL,
  pg_user          text          NOT NULL,
  pg_pass          text          NOT NULL,
  tunnel_port      integer       NOT NULL DEFAULT 15432,
  api_url          text,
  poll_interval_ms integer       NOT NULL DEFAULT 15000,
  cant_registros   integer       NOT NULL DEFAULT 500,
  tcp_host         text,
  tcp_port         integer,
  activo           boolean       NOT NULL DEFAULT true,
  creado_at        timestamptz   NOT NULL DEFAULT now(),
  actualizado_at   timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (empresa_id)
);

-- Solo el servidor (service role) puede leer/escribir; acceso desde frontend
-- se hace siempre a través de los endpoints del server (no directo a Supabase).
ALTER TABLE fusion_config ENABLE ROW LEVEL SECURITY;

-- Sin policies → anon/authenticated no tienen acceso directo.
-- El servidor Node usa service_role_key que bypasea RLS.

COMMENT ON TABLE fusion_config IS
  'Parámetros de conexión Fusion (SSH tunnel + PostgreSQL) por empresa. Solo visible al superusuario vía API del servidor.';

-- ── Seed: empresa_id = 4 ──────────────────────────────────────
INSERT INTO fusion_config (
  empresa_id, ssh_host, ssh_port, ssh_user, ssh_pass,
  pg_db, pg_user, pg_pass, tunnel_port,
  api_url, poll_interval_ms, cant_registros, activo
) VALUES (
  4, '168.228.51.221', 22, 'mant', 'mant',
  'smartshipdb', 'ssfdbuser', 'smartshipfactory', 15433,
  'http://168.228.51.221/api/fusion.php', 15000, 200, true
)
ON CONFLICT (empresa_id) DO NOTHING;
