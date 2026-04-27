param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$VPS_HOST = '45.55.190.88'
$VPS_PORT = '22'
$VPS_USER = 'root'
$VPS_PASS = (Get-Content 'D:\Proyectos\erp-mya\.secrets\vps-file-sync.env' | Where-Object { $_ -match '^VPS_SSH_PASSWORD=' } | ForEach-Object { $_.Split('=',2)[1] })

$PLINK = 'C:\Program Files\PuTTY\plink.exe'
$PSCP = 'C:\Program Files\PuTTY\pscp.exe'
$BUILD = 'D:\Proyectos\aplicaciones\build'
$SERVER = 'D:\Proyectos\aplicaciones\server'
$REMOTE = '/home/mya-aplicaciones'
$TARGET = ($VPS_USER + '@' + $VPS_HOST)

Write-Host '========================================='
Write-Host '  Deploy Aplicaciones VPS'
Write-Host '========================================='

if (-not (Test-Path ($BUILD + '\index.html'))) {
    Write-Host 'ERROR: Sin build. Ejecute npm run build primero.'
    exit 1
}
Write-Host 'Build OK'

Write-Host 'Creando directorio remoto...'
& $PLINK -batch -no-antispoof -P $VPS_PORT -pw $VPS_PASS $TARGET "mkdir -p $REMOTE ; mkdir -p $REMOTE/server"

Write-Host 'Subiendo frontend build...'
& $PSCP -batch -r -P $VPS_PORT -pw $VPS_PASS ($BUILD + '\*') ($TARGET + ':' + $REMOTE + '/')

Write-Host 'Subiendo backend...'
& $PSCP -batch -r -P $VPS_PORT -pw $VPS_PASS ($SERVER + '\*') ($TARGET + ':' + $REMOTE + '/server/')

Write-Host ''
Write-Host 'Listo. Proximamente:'
Write-Host '  ssh root@45.55.190.88'
Write-Host '  cd /home/mya-aplicaciones && npm install'
Write-Host '  cd server && npm install && npm start'
