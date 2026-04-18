param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Cargar configuración VPS
$VPS_HOST = '45.55.190.88'
$VPS_PORT = '22'
$VPS_USER = 'root'
$VPS_PASS = (Get-Content '.secrets/vps-file-sync.env' |
    Where-Object { $_ -match '^VPS_SSH_PASSWORD=' } |
    ForEach-Object { $_.Split('=',2)[1] })

$PLINK     = 'C:\Program Files\PuTTY\plink.exe'
$PSCP      = 'C:\Program Files\PuTTY\pscp.exe'
$BUILD     = 'D:\Proyectos\erp-mya\build'
$REMOTE    = '/home/mya-frontend'
$TARGET    = ($VPS_USER + '@' + $VPS_HOST)

Write-Host '═══════════════════════════════════'
Write-Host '  Deploy ERP-MYA Frontend VPS'
Write-Host '═══════════════════════════════════'

# Verificar build
if (-not (Test-Path ($BUILD + '\index.html'))) {
    Write-Host 'ERROR: Sin build. Ejecute npm run build primero.'
    exit 1
}
Write-Host 'Build OK ✓'

# Crear directorio remoto
Write-Host 'Creando directorio remoto...'
& $PLINK -batch -no-antispoof -P $VPS_PORT -pw $VPS_PASS $TARGET ('mkdir -p ' + $REMOTE)

# Backup anterior (opcional)
Write-Host 'Creando backup...'
& $PLINK -batch -no-antispoof -P $VPS_PORT -pw $VPS_PASS $TARGET ('[ -d ' + $REMOTE + ' ] && cp -r ' + $REMOTE + ' ' + $REMOTE + '.backup-$(date +%Y%m%d-%H%M%S) || true')

# Subir archivos
Write-Host 'Subiendo archivos...'
& $PSCP -batch -r -P $VPS_PORT -pw $VPS_PASS ($BUILD + '\*') ($TARGET + ':' + $REMOTE + '/')

# Recargar nginx
Write-Host 'Recargando Nginx...'
& $PLINK -batch -no-antispoof -P $VPS_PORT -pw $VPS_PASS $TARGET ('nginx -s reload')

Write-Host '✓ Deploy completado exitosamente'
Write-Host ''
Write-Host 'URL en producción: https://erp-mya.visionzn.net'
