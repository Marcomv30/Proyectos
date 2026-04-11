param(
  [string]$ManifestPath,
  [string]$ConfigPath = '.secrets/vps-file-sync.env'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Host ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
}

function Read-KeyValueFile {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    return $map
  }

  foreach ($rawLine in Get-Content -LiteralPath $Path) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { continue }
    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    $map[$key] = $value
  }

  return $map
}

function Resolve-CommandPath {
  param([string[]]$Candidates)
  foreach ($candidate in $Candidates) {
    if (-not $candidate) { continue }
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }
  return $null
}

function Invoke-External {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Comando fallÃ³ ($LASTEXITCODE): $FilePath $($Arguments -join ' ')"
  }
}

function ConvertTo-BashSingleQuoted {
  param([string]$Value)
  return "'" + ($Value -replace "'", "''\\''") + "'"
}

function Get-ConfigValue {
  param(
    [hashtable]$Config,
    [string]$Key,
    [string]$Default = ''
  )

  if ($Config.ContainsKey($Key)) {
    return [string]$Config[$Key]
  }

  return $Default
}

if (-not $ManifestPath) {
  throw 'Debe indicar -ManifestPath.'
}

$resolvedManifestPath = Resolve-Path -LiteralPath $ManifestPath
$manifest = Get-Content -LiteralPath $resolvedManifestPath -Raw | ConvertFrom-Json
if (-not $manifest.files -or $manifest.files.Count -eq 0) {
  throw 'El manifest no contiene archivos para subir.'
}

$repoRoot = Resolve-Path -LiteralPath $manifest.source_dir
$resolvedConfigPath = Join-Path $repoRoot $ConfigPath
$config = Read-KeyValueFile -Path $resolvedConfigPath
if (-not $config.Count) {
  throw "No se encontrÃ³ la configuraciÃ³n en $resolvedConfigPath"
}

$hostName = Get-ConfigValue -Config $config -Key 'VPS_HOST'
$port = Get-ConfigValue -Config $config -Key 'VPS_PORT' -Default '22'
$user = Get-ConfigValue -Config $config -Key 'VPS_USER'
$password = Get-ConfigValue -Config $config -Key 'VPS_SSH_PASSWORD'
$keyPath = Get-ConfigValue -Config $config -Key 'VPS_SSH_KEY_PATH'
$plinkPath = Get-ConfigValue -Config $config -Key 'PLINK_PATH'
$pscpPath = Get-ConfigValue -Config $config -Key 'PSCP_PATH'

if (-not $hostName) { throw 'Falta VPS_HOST en .secrets/vps-file-sync.env.' }
if (-not $user) { throw 'Falta VPS_USER en .secrets/vps-file-sync.env.' }

if ($keyPath) {
  $keyPath = (Resolve-Path -LiteralPath $keyPath).Path
}

$nativeSsh = Resolve-CommandPath -Candidates @('ssh')
$nativeScp = Resolve-CommandPath -Candidates @('scp')
$puttyPlink = Resolve-CommandPath -Candidates @(
  $plinkPath,
  'plink.exe',
  'C:\Program Files\PuTTY\plink.exe',
  'C:\Program Files (x86)\PuTTY\plink.exe'
)
$puttyPscp = Resolve-CommandPath -Candidates @(
  $pscpPath,
  'pscp.exe',
  'C:\Program Files\PuTTY\pscp.exe',
  'C:\Program Files (x86)\PuTTY\pscp.exe'
)

$usePutty = $false
if ($password -and $puttyPlink -and $puttyPscp) {
  $usePutty = $true
}

if (-not $usePutty -and (-not $nativeSsh -or -not $nativeScp)) {
  throw 'No se encontraron ssh/scp nativos y tampoco plink/pscp para la subida.'
}

$target = "$user@$hostName"

function Invoke-SshCommand {
  param([string]$RemoteCommand)

  if ($usePutty) {
    Invoke-External -FilePath $puttyPlink -Arguments @('-batch', '-no-antispoof', '-P', $port, '-pw', $password, $target, $RemoteCommand)
    return
  }

  $args = @('-p', $port)
  if ($keyPath) {
    $args += @('-i', $keyPath)
  }
  $args += @($target, $RemoteCommand)
  Invoke-External -FilePath $nativeSsh -Arguments $args
}

function Invoke-ScpUpload {
  param(
    [string]$LocalPath,
    [string]$RemotePath
  )

  if ($usePutty) {
    Invoke-External -FilePath $puttyPscp -Arguments @('-batch', '-P', $port, '-pw', $password, $LocalPath, "${target}:$RemotePath")
    return
  }

  $args = @('-P', $port)
  if ($keyPath) {
    $args += @('-i', $keyPath)
  }
  $args += @($LocalPath, "${target}:$RemotePath")
  Invoke-External -FilePath $nativeScp -Arguments $args
}

$dirs = @()
foreach ($file in $manifest.files) {
  $remoteDir = [System.IO.Path]::GetDirectoryName([string]$file.remote_path).Replace('\', '/')
  if ($remoteDir) {
    $dirs += $remoteDir
  }
}
$dirs = @($dirs | Sort-Object -Unique)
if (@($dirs).Count -gt 0) {
  $quotedDirs = $dirs | ForEach-Object { ConvertTo-BashSingleQuoted $_ }
  $mkdirCmd = "mkdir -p {0}" -f ($quotedDirs -join ' ')
  Write-Step "Creando directorios remotos..."
  Invoke-SshCommand -RemoteCommand $mkdirCmd
}

$uploaded = 0
foreach ($file in $manifest.files) {
  $localPath = Resolve-Path -LiteralPath ([string]$file.local_path)
  $repoRelative = [string]$file.path
  $remotePath = [string]$file.remote_path
  $targetName = [string]$file.target

  Write-Step ("Subiendo {0} -> {1} ({2})" -f $repoRelative, $remotePath, $targetName)
  Invoke-ScpUpload -LocalPath $localPath -RemotePath $remotePath
  $uploaded++
}

Write-Step 'EnvÃ­o selectivo finalizado correctamente.'
Write-Host ("Resumen file_sync: seleccionados={0} subidos={1}" -f $manifest.files.Count, $uploaded)

