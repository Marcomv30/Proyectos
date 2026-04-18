param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ─── Configuración ────────────────────────────────────────────────────────────
$SECRETS_FILE = 'D:\Proyectos\erp-mya\.secrets\vps-file-sync.env'
$PLINK        = 'C:\Program Files\PuTTY\plink.exe'
$PSCP         = 'C:\Program Files\PuTTY\pscp.exe'
$BUILD        = 'D:\Proyectos\empacadora\build'
$REMOTE       = '/home/mya-empacadora'
$URL          = 'https://empacadora.visionzn.net'

# Leer contraseña del archivo de secretos compartido
$VPS_PASS = (Get-Content $SECRETS_FILE |
    Where-Object { $_ -match '^VPS_SSH_PASSWORD=' } |
    ForEach-Object { $_.Split('=',2)[1] })
$VPS_HOST = '45.55.190.88'
$VPS_PORT = '22'
$VPS_USER = 'root'
$TARGET   = "$VPS_USER@$VPS_HOST"

Write-Host ''
Write-Host '═══════════════════════════════════════'
Write-Host '  Deploy Empacadora de Piña — VPS'
Write-Host '═══════════════════════════════════════'
Write-Host ''

# ─── 1. Verificar build ───────────────────────────────────────────────────────
if (-not (Test-Path "$BUILD\index.html")) {
    Write-Host '  ERROR: No hay build. Ejecutá primero: npm run build'
    Write-Host ''
    exit 1
}
Write-Host '  [1/4] Build verificado ✓'

# ─── 2. Backup en VPS ────────────────────────────────────────────────────────
Write-Host '  [2/4] Creando backup en VPS...'
& $PLINK -batch -no-antispoof -P $VPS_PORT -pw $VPS_PASS $TARGET `
    "[ -d $REMOTE ] && cp -r $REMOTE ${REMOTE}.backup-`$(date +%Y%m%d-%H%M%S) || true"

# ─── 3. Subir archivos ────────────────────────────────────────────────────────
Write-Host '  [3/4] Subiendo archivos al VPS...'
& $PSCP -batch -r -P $VPS_PORT -pw $VPS_PASS "$BUILD\*" "${TARGET}:${REMOTE}/"

# ─── 4. Recargar Nginx ────────────────────────────────────────────────────────
Write-Host '  [4/4] Recargando Nginx...'
& $PLINK -batch -no-antispoof -P $VPS_PORT -pw $VPS_PASS $TARGET 'nginx -s reload'

Write-Host ''
Write-Host '  ✓ Deploy completado exitosamente'
Write-Host "  URL: $URL"
Write-Host ''
