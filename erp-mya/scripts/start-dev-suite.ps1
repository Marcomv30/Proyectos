$ErrorActionPreference = 'Stop'

$root = 'D:\Proyectos'

$apps = @(
  @{
    Name = 'ERP Backend'
    Path = Join-Path $root 'erp-mya\server'
    Command = 'node index.js'
  },
  @{
    Name = 'ERP Frontend'
    Path = Join-Path $root 'erp-mya'
    Command = 'npm start'
  },
  @{
    Name = 'Empacadora'
    Path = Join-Path $root 'empacadora'
    Command = 'npm start'
  },
  @{
    Name = 'Consola'
    Path = Join-Path $root 'consola'
    Command = 'npm start'
  },
  @{
    Name = 'POS'
    Path = Join-Path $root 'pos-mya'
    Command = 'npm start'
  }
)

foreach ($app in $apps) {
  if (-not (Test-Path $app.Path)) {
    Write-Warning "No existe la ruta para $($app.Name): $($app.Path)"
    continue
  }

  Write-Host "Abriendo $($app.Name)..." -ForegroundColor Cyan
  Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    "Set-Location '$($app.Path)'; $($app.Command)"
  )
}

Write-Host ''
Write-Host 'Entorno dev lanzado:' -ForegroundColor Green
Write-Host '  ERP         -> http://localhost:3000'
Write-Host '  Empacadora  -> http://localhost:3002'
Write-Host '  Consola     -> http://localhost:3004'
Write-Host '  POS         -> http://localhost:3006'
Write-Host ''
Write-Host "Backend ERP publica el puerto activo en: $root\erp-mya\tmp\dev-api-port.txt"
