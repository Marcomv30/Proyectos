param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Cargar configuracion VPS
$VPS_HOST = '45.55.190.88'
$VPS_PORT = '22'
$VPS_USER = 'root'
$VPS_PASS = (Get-Content '.secrets/vps-file-sync.env' |
    Where-Object { $_ -match '^VPS_SSH_PASSWORD=' } |
    ForEach-Object { $_.Split('=',2)[1] })

$PLINK  = 'C:\Program Files\PuTTY\plink.exe'
$PSCP   = 'C:\Program Files\PuTTY\pscp.exe'
$BUILD  = 'D:\Proyectos\pos-mya\dist'
$REMOTE = '/var/www/pos-mya'
$TARGET = ($VPS_USER + '@' + $VPS_HOST)

Write-Host '==================================='
Write-Host '  Deploy POS-MYA VPS'
Write-Host '==================================='

# Verificar build
if (-not (Test-Path ($BUILD + '\index.html'))) {
    Write-Host 'ERROR: Sin build. Ejecute npm run build primero.'
    exit 1
}
Write-Host 'Build OK'

# Version para auto-refresh del cliente
$versionPayload = @{ version = (Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss') } | ConvertTo-Json -Compress
Set-Content -Path ($BUILD + '\version.json') -Value $versionPayload -Encoding UTF8

# Crear directorio remoto
Write-Host 'Creando directorio remoto...'
& $PLINK -batch -no-antispoof -P $VPS_PORT -pw $VPS_PASS $TARGET ('mkdir -p ' + $REMOTE)

# Backup anterior
Write-Host 'Creando backup...'
& $PLINK -batch -no-antispoof -P $VPS_PORT -pw $VPS_PASS $TARGET ('[ -d ' + $REMOTE + ' ] && cp -r ' + $REMOTE + ' ' + $REMOTE + '.backup-$(date +%Y%m%d-%H%M%S) || true')

# Limpiar directorio remoto y subir desde cero
Write-Host 'Limpiando directorio remoto...'
& $PLINK -batch -no-antispoof -P $VPS_PORT -pw $VPS_PASS $TARGET ('rm -rf ' + $REMOTE + ' && mkdir -p ' + $REMOTE + '/assets')

Write-Host 'Subiendo archivos raiz...'
Get-ChildItem -Path $BUILD -File | ForEach-Object {
    & $PSCP -batch -P $VPS_PORT -pw $VPS_PASS $_.FullName ($TARGET + ':' + $REMOTE + '/')
}

Write-Host 'Subiendo assets...'
& $PSCP -batch -r -P $VPS_PORT -pw $VPS_PASS ($BUILD + '\assets\*') ($TARGET + ':' + $REMOTE + '/assets/')

# Recargar nginx
Write-Host 'Recargando Nginx...'
& $PLINK -batch -no-antispoof -P $VPS_PORT -pw $VPS_PASS $TARGET ('nginx -s reload')

Write-Host 'Deploy completado exitosamente'
Write-Host 'URL en produccion: https://pos-mya.visionzn.net'
