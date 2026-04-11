param(
  [string]$SourceDbUrl = "postgresql://postgres@db.deyetzlwobtsowpakdef.supabase.co:5432/postgres",
  [string]$SourceDbPassword = "",
  [string]$VpsHost = "45.55.190.88",
  [int]$VpsPort = 22,
  [string]$VpsUser = "root",
  [string]$VpsPassword = "",
  [string]$VpsDbPassword = "",
  [string]$ConfigPath = "",
  [switch]$SkipBackup
)

$ErrorActionPreference = "Stop"

function Require-Value($value, $name) {
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Falta $name."
  }
}

function Read-SimpleEnvFile($path) {
  $map = @{}
  Get-Content $path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 0) { return }
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()
    $map[$key] = $val
  }
  return $map
}

$repoRoot = Split-Path -Parent $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
  $ConfigPath = Join-Path $repoRoot ".secrets\db-migration.env"
}

if (Test-Path $ConfigPath) {
  $cfg = Read-SimpleEnvFile $ConfigPath
  if (-not $SourceDbPassword -and $cfg.ContainsKey("SOURCE_DB_PASSWORD")) { $SourceDbPassword = $cfg["SOURCE_DB_PASSWORD"] }
  if ($SourceDbUrl -eq "postgresql://postgres@db.deyetzlwobtsowpakdef.supabase.co:5432/postgres" -and $cfg.ContainsKey("SOURCE_DB_URL")) { $SourceDbUrl = $cfg["SOURCE_DB_URL"] }
  if ($VpsHost -eq "45.55.190.88" -and $cfg.ContainsKey("VPS_HOST")) { $VpsHost = $cfg["VPS_HOST"] }
  if ($VpsPort -eq 22 -and $cfg.ContainsKey("VPS_PORT")) { $VpsPort = [int]$cfg["VPS_PORT"] }
  if ($VpsUser -eq "root" -and $cfg.ContainsKey("VPS_USER")) { $VpsUser = $cfg["VPS_USER"] }
  if (-not $VpsPassword -and $cfg.ContainsKey("VPS_PASSWORD")) { $VpsPassword = $cfg["VPS_PASSWORD"] }
  if (-not $VpsDbPassword -and $cfg.ContainsKey("VPS_DB_PASSWORD")) { $VpsDbPassword = $cfg["VPS_DB_PASSWORD"] }
}

Require-Value $SourceDbPassword "SourceDbPassword"
Require-Value $VpsPassword "VpsPassword"
Require-Value $VpsDbPassword "VpsDbPassword"

$tmpDir = Join-Path $repoRoot "tmp"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

$pgBin = "C:\Program Files\PostgreSQL\17\bin"
$pgDump = Join-Path $pgBin "pg_dump.exe"
$psql = Join-Path $pgBin "psql.exe"

if (!(Test-Path $pgDump)) { throw "No se encontro pg_dump en $pgDump" }
if (!(Test-Path $psql)) { throw "No se encontro psql en $psql" }

$publicSql = Join-Path $tmpDir "public_schema_data.sql"
$publicSqlPg15 = Join-Path $tmpDir "public_schema_data.pg15.sql"
$authSql = Join-Path $tmpDir "auth_users_identities.sql"
$authSqlPg15 = Join-Path $tmpDir "auth_users_identities.pg15.sql"

Write-Host "1/5 Exportando esquema public..." -ForegroundColor Cyan
$env:PGPASSWORD = $SourceDbPassword
& $pgDump $SourceDbUrl -n public --clean --if-exists --no-owner --no-acl -f $publicSql
if ($LASTEXITCODE -ne 0) { throw "Fallo pg_dump de public." }

Write-Host "2/5 Exportando usuarios Auth..." -ForegroundColor Cyan
& $pgDump $SourceDbUrl -a --column-inserts --no-owner --no-acl -t auth.users -t auth.identities -f $authSql
if ($LASTEXITCODE -ne 0) { throw "Fallo pg_dump de auth.users/auth.identities." }

Write-Host "3/5 Normalizando SQL para PostgreSQL 15..." -ForegroundColor Cyan
Get-Content $publicSql | Where-Object {
  $_ -notmatch '^SET transaction_timeout = 0;$' -and
  $_ -notmatch '^\\restrict ' -and
  $_ -notmatch '^\\unrestrict '
} | Set-Content $publicSqlPg15

Get-Content $authSql | Where-Object {
  $_ -notmatch '^SET transaction_timeout = 0;$' -and
  $_ -notmatch '^\\restrict ' -and
  $_ -notmatch '^\\unrestrict '
} | Set-Content $authSqlPg15

$nodeScript = @"
const { Client } = require('ssh2');
const net = require('net');
const { spawn } = require('child_process');

const cfg = {
  ssh: {
    host: ${([System.Management.Automation.Language.CodeGeneration]::QuoteArgument($VpsHost))},
    port: $VpsPort,
    username: ${([System.Management.Automation.Language.CodeGeneration]::QuoteArgument($VpsUser))},
    password: ${([System.Management.Automation.Language.CodeGeneration]::QuoteArgument($VpsPassword))}
  },
  remoteDbPassword: ${([System.Management.Automation.Language.CodeGeneration]::QuoteArgument($VpsDbPassword))},
  publicSql: ${([System.Management.Automation.Language.CodeGeneration]::QuoteArgument($publicSqlPg15))},
  authSql: ${([System.Management.Automation.Language.CodeGeneration]::QuoteArgument($authSqlPg15))},
  psql: ${([System.Management.Automation.Language.CodeGeneration]::QuoteArgument($psql))},
  skipBackup: ${if ($SkipBackup) { "true" } else { "false" }}
};

function execRemote(conn, cmd, quiet = false) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code) => {
        if (code === 0) resolve({ stdout, stderr, code });
        else reject(new Error((stderr || stdout || `remote exit ${code}`).trim()));
      });
      stream.on('data', (d) => { const s = d.toString(); stdout += s; if (!quiet) process.stdout.write(s); });
      stream.stderr.on('data', (d) => { const s = d.toString(); stderr += s; if (!quiet) process.stderr.write(s); });
    });
  });
}

function runPsql(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cfg.psql, args, {
      env: { ...process.env, PGPASSWORD: cfg.remoteDbPassword },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`psql exit ${code}`)));
  });
}

(async () => {
  const conn = new Client();
  const server = net.createServer();
  try {
    await new Promise((resolve, reject) => conn.on('ready', resolve).on('error', reject).connect(cfg.ssh));

    if (!cfg.skipBackup) {
      const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      await execRemote(conn, `mkdir -p /root/db-backups && docker exec supabase-db pg_dumpall -U postgres | gzip > /root/db-backups/pre_migration_${ts}.sql.gz && ls -lh /root/db-backups/pre_migration_${ts}.sql.gz`);
    }

    await execRemote(conn, `cd /opt/supabase/docker && for c in supabase-studio supabase-kong supabase-storage supabase-analytics supabase-meta supabase-pooler realtime-dev.supabase-realtime supabase-auth supabase-rest supabase-vector supabase-imgproxy; do docker stop $c >/dev/null 2>&1 || true; done && echo services_stopped`);

    const inspect = await execRemote(conn, `docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' supabase-db`, true);
    const containerIp = inspect.stdout.trim();
    if (!containerIp) throw new Error('No se pudo obtener la IP de supabase-db');

    await new Promise((resolve, reject) => {
      server.on('connection', (socket) => {
        conn.forwardOut('127.0.0.1', 0, containerIp, 5432, (err, stream) => {
          if (err) return socket.destroy(err);
          socket.pipe(stream).pipe(socket);
          stream.on('error', () => socket.destroy());
          socket.on('error', () => stream.end());
        });
      });
      server.once('error', reject);
      server.listen(6545, '127.0.0.1', resolve);
    });

    const baseArgs = ['-h','127.0.0.1','-p','6545','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'];

    await runPsql([...baseArgs, '-c', 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;']);
    await runPsql([...baseArgs, '-f', cfg.publicSql]);
    await runPsql([...baseArgs, '-c', 'GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role; GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;']);
    await runPsql([...baseArgs, '-c', 'TRUNCATE TABLE auth.identities, auth.sessions, auth.refresh_tokens, auth.one_time_tokens, auth.mfa_factors, auth.mfa_challenges, auth.mfa_amr_claims CASCADE; TRUNCATE TABLE auth.users CASCADE;']);
    await runPsql([...baseArgs, '-f', cfg.authSql]);
    await runPsql([...baseArgs, '-Atc', "select 'usuarios='||count(*) from public.usuarios; select 'empresas='||count(*) from public.empresas; select 'usuarios_empresas='||count(*) from public.usuarios_empresas; select 'roles='||count(*) from public.roles; select 'modulos='||count(*) from public.modulos; select 'roles_permisos='||count(*) from public.roles_permisos; select 'auth.users='||count(*) from auth.users; select 'auth.identities='||count(*) from auth.identities;"]);

    await execRemote(conn, 'cd /opt/supabase/docker && docker compose up -d && docker compose up -d kong && for i in $(seq 1 30); do s=$(docker inspect -f "{{.State.Health.Status}}" supabase-kong 2>/dev/null || echo missing); echo "supabase-kong:$s"; [ "$s" = "healthy" ] && break; sleep 2; done && docker compose ps');
    await execRemote(conn, 'rm -f /root/mya_cloud_full.dump /root/mya_cloud_full.sql /root/mya_cloud_full_clean.sql || true', true);
  } catch (err) {
    console.error(`MIGRATION_ERROR: ${err.message}`);
    try { await execRemote(conn, 'cd /opt/supabase/docker && docker compose up -d'); } catch {}
    process.exit(1);
  } finally {
    try { server.close(); } catch {}
    try { conn.end(); } catch {}
  }
})();
"@

Write-Host "4/5 Ejecutando migracion en VPS..." -ForegroundColor Cyan
$nodeScript | node
if ($LASTEXITCODE -ne 0) { throw "Fallo la migracion al VPS." }

Write-Host "5/5 Migracion completada." -ForegroundColor Green
