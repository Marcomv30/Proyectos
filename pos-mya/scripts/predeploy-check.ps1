param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Step($msg) {
  Write-Host ""
  Write-Host ("== " + $msg) -ForegroundColor Cyan
}

function Ok($msg) {
  Write-Host ("[OK] " + $msg) -ForegroundColor Green
}

function Warn($msg) {
  Write-Host ("[WARN] " + $msg) -ForegroundColor Yellow
}

function Fail($msg) {
  Write-Host ("[FAIL] " + $msg) -ForegroundColor Red
}

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$failed = @()
$warnings = @()

Step "Proyecto"
if (Test-Path ".\package.json") {
  Ok "package.json encontrado"
} else {
  $failed += "No existe package.json"
  Fail "No existe package.json"
}

Step "Variables de produccion"
$envFile = ".\.env.production"
if (-not (Test-Path $envFile)) {
  $failed += "No existe .env.production"
  Fail "No existe .env.production"
} else {
  $envLines = Get-Content $envFile
  $api = ($envLines | Where-Object { $_ -match '^VITE_API_URL=' } | Select-Object -First 1)
  $supabase = ($envLines | Where-Object { $_ -match '^VITE_SUPABASE_URL=' } | Select-Object -First 1)
  $anon = ($envLines | Where-Object { $_ -match '^VITE_SUPABASE_ANON_KEY=' } | Select-Object -First 1)

  if ($api) { Ok $api } else { $failed += "Falta VITE_API_URL"; Fail "Falta VITE_API_URL" }
  if ($supabase) { Ok $supabase } else { $failed += "Falta VITE_SUPABASE_URL"; Fail "Falta VITE_SUPABASE_URL" }
  if ($anon) { Ok "VITE_SUPABASE_ANON_KEY configurada" } else { $failed += "Falta VITE_SUPABASE_ANON_KEY"; Fail "Falta VITE_SUPABASE_ANON_KEY" }

  if ($api -notmatch '^VITE_API_URL=https://api\.visionzn\.net$') {
    $warnings += "VITE_API_URL no apunta a https://api.visionzn.net"
    Warn "VITE_API_URL no apunta a https://api.visionzn.net"
  }
}

Step "Git"
$gitStatus = git status --short 2>$null
if ($LASTEXITCODE -eq 0) {
  if ([string]::IsNullOrWhiteSpace(($gitStatus | Out-String))) {
    Ok "Sin cambios pendientes"
  } else {
    $warnings += "Hay cambios locales pendientes en git"
    Warn "Hay cambios locales pendientes:"
    $gitStatus | ForEach-Object { Write-Host ("  " + $_) }
  }
} else {
  $warnings += "No se pudo leer git status"
  Warn "No se pudo leer git status"
}

Step "Build"
try {
  npm.cmd run build
  if ($LASTEXITCODE -eq 0 -and (Test-Path ".\dist\index.html")) {
    Ok "Build completado"
  } else {
    $failed += "Build no genero dist/index.html"
    Fail "Build no genero dist/index.html"
  }
} catch {
  $failed += "Build fallo: $($_.Exception.Message)"
  Fail ("Build fallo: " + $_.Exception.Message)
}

Step "Script de deploy"
if (Test-Path ".\scripts\deploy-vps.ps1") {
  Ok "deploy-vps.ps1 encontrado"
} else {
  $failed += "No existe scripts/deploy-vps.ps1"
  Fail "No existe scripts/deploy-vps.ps1"
}

Step "Resumen"
if ($warnings.Count -gt 0) {
  Write-Host "Advertencias:" -ForegroundColor Yellow
  $warnings | ForEach-Object { Write-Host (" - " + $_) -ForegroundColor Yellow }
}

if ($failed.Count -gt 0) {
  Write-Host "Bloqueos:" -ForegroundColor Red
  $failed | ForEach-Object { Write-Host (" - " + $_) -ForegroundColor Red }
  exit 1
}

Write-Host "Predeploy local OK. Antes de publicar en VPS, validar nginx, SSL, backend ERP y migraciones SQL." -ForegroundColor Green
