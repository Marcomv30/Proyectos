param(
  [switch]$DeleteRemoved,
  [string]$ConfigPath = '.secrets/frontend-sync.env',
  [string]$StatePath = '.secrets/frontend-sync-state.json'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Host ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
}

function Get-RepoRoot {
  if ($PSScriptRoot) {
    return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  }
  return (Get-Location).Path
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

function ConvertTo-RepoRelativePath {
  param(
    [string]$Root,
    [string]$FullPath
  )

  $relative = [System.IO.Path]::GetRelativePath($Root, $FullPath)
  return ($relative -replace '\\', '/')
}

function ConvertTo-BashSingleQuoted {
  param([string]$Value)
  return "'" + ($Value -replace "'", "''\\''") + "'"
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
    $rendered = @($FilePath) + $Arguments
    throw "Comando falló ($LASTEXITCODE): $($rendered -join ' ')"
  }
}

function Get-FrontendFiles {
  param([string]$Root)

  $files = New-Object System.Collections.Generic.List[System.String]
  foreach ($dir in @('src', 'public')) {
    $target = Join-Path $Root $dir
    if (Test-Path -LiteralPath $target) {
      Get-ChildItem -LiteralPath $target -File -Recurse | ForEach-Object {
        $files.Add($_.FullName)
      }
    }
  }

  $rootFilePatterns = @(
    'package.json',
    'package-lock.json',
    'npm-shrinkwrap.json',
    'tsconfig.json',
    'tsconfig.*.json',
    'jsconfig.json',
    'postcss.config.js',
    'postcss.config.cjs',
    'postcss.config.mjs',
    'tailwind.config.js',
    'tailwind.config.cjs',
    'tailwind.config.mjs'
  )

  foreach ($pattern in $rootFilePatterns) {
    Get-ChildItem -LiteralPath $Root -File -Filter $pattern -ErrorAction SilentlyContinue | ForEach-Object {
      if (-not $files.Contains($_.FullName)) {
        $files.Add($_.FullName)
      }
    }
  }

  return $files | Sort-Object
}

function Get-StateMap {
  param([object]$State)

  $map = @{}
  if (-not $State -or -not $State.files) {
    return $map
  }

  foreach ($item in $State.files) {
    if ($item.path) {
      $map[[string]$item.path] = [string]$item.hash
    }
  }

  return $map
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

$repoRoot = Get-RepoRoot
$resolvedConfigPath = Join-Path $repoRoot $ConfigPath
$resolvedStatePath = Join-Path $repoRoot $StatePath
$stateDir = Split-Path -Parent $resolvedStatePath
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

$config = Read-KeyValueFile -Path $resolvedConfigPath
if (-not $config.Count) {
  throw "No se encontró la configuración en $resolvedConfigPath. Cree .secrets/frontend-sync.env usando la plantilla .secrets/frontend-sync.env.example."
}

$syncHost = Get-ConfigValue -Config $config -Key 'SYNC_HOST'
$syncPort = Get-ConfigValue -Config $config -Key 'SYNC_PORT' -Default '22'
$syncUser = Get-ConfigValue -Config $config -Key 'SYNC_USER'
$syncRemoteDir = Get-ConfigValue -Config $config -Key 'SYNC_REMOTE_DIR' -Default '/home/mya-frontend-src'
$syncPassword = Get-ConfigValue -Config $config -Key 'SYNC_SSH_PASSWORD'
$syncKeyPath = Get-ConfigValue -Config $config -Key 'SYNC_SSH_KEY_PATH'
$plinkPath = Get-ConfigValue -Config $config -Key 'PLINK_PATH'
$pscpPath = Get-ConfigValue -Config $config -Key 'PSCP_PATH'

if (-not $syncHost) { throw 'Falta SYNC_HOST en .secrets/frontend-sync.env.' }
if (-not $syncUser) { throw 'Falta SYNC_USER en .secrets/frontend-sync.env.' }

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
if ($syncPassword -and $puttyPlink -and $puttyPscp) {
  $usePutty = $true
}

if (-not $usePutty -and (-not $nativeSsh -or -not $nativeScp)) {
  throw 'No se encontraron ssh/scp nativos y tampoco plink/pscp para la sincronización.'
}

if ($syncKeyPath) {
  $syncKeyPath = (Resolve-Path -LiteralPath $syncKeyPath).Path
}

$target = "$syncUser@$syncHost"
Write-Step "Preparando sincronización de frontend hacia ${target}:${syncRemoteDir}"
if ($usePutty) {
  Write-Step 'Autenticación detectada: PuTTY (plink/pscp) con password no versionado.'
} elseif ($syncKeyPath) {
  Write-Step "Autenticación detectada: clave SSH $syncKeyPath"
} else {
  Write-Step 'Autenticación detectada: ssh/scp nativo. Si no hay agente o claves configuradas, puede pedir interacción.'
}

$frontendFiles = Get-FrontendFiles -Root $repoRoot
if (-not $frontendFiles.Count) {
  throw "No se encontraron archivos de frontend para sincronizar en $repoRoot"
}

$currentEntries = foreach ($file in $frontendFiles) {
  $relativePath = ConvertTo-RepoRelativePath -Root $repoRoot -FullPath $file
  $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  [pscustomobject]@{
    path = $relativePath
    hash = $hash
    full_path = $file
  }
}

$previousState = $null
if (Test-Path -LiteralPath $resolvedStatePath) {
  $previousState = Get-Content -LiteralPath $resolvedStatePath -Raw | ConvertFrom-Json
}

$previousMap = Get-StateMap -State $previousState
$currentMap = @{}
foreach ($entry in $currentEntries) {
  $currentMap[$entry.path] = $entry.hash
}

$changedEntries = @(
  foreach ($entry in $currentEntries) {
    if (-not $previousMap.ContainsKey($entry.path) -or $previousMap[$entry.path] -ne $entry.hash) {
      $entry
    }
  }
)

$removedPaths = @(
  foreach ($oldPath in $previousMap.Keys) {
    if (-not $currentMap.ContainsKey($oldPath)) {
      $oldPath
    }
  }
) | Sort-Object

Write-Step ("Archivos detectados para subir: {0}" -f $changedEntries.Count)
if ($DeleteRemoved) {
  Write-Step ("Archivos detectados para eliminar en remoto: {0}" -f $removedPaths.Count)
}

function Invoke-SshCommand {
  param([string]$RemoteCommand)

  if ($usePutty) {
    $args = @('-batch', '-P', $syncPort, '-pw', $syncPassword, $target, $RemoteCommand)
    Invoke-External -FilePath $puttyPlink -Arguments $args
    return
  }

  $args = @('-p', $syncPort)
  if ($syncKeyPath) {
    $args += @('-i', $syncKeyPath)
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
    $args = @('-batch', '-P', $syncPort, '-pw', $syncPassword, $LocalPath, "${target}:$RemotePath")
    Invoke-External -FilePath $puttyPscp -Arguments $args
    return
  }

  $args = @('-P', $syncPort)
  if ($syncKeyPath) {
    $args += @('-i', $syncKeyPath)
  }
  $args += @($LocalPath, "${target}:$RemotePath")
  Invoke-External -FilePath $nativeScp -Arguments $args
}

$mkdirTargets = @($syncRemoteDir)
foreach ($entry in $changedEntries) {
  $relativeDir = [System.IO.Path]::GetDirectoryName($entry.path)
  if ([string]::IsNullOrWhiteSpace($relativeDir)) { continue }
  $mkdirTargets += (($syncRemoteDir.TrimEnd('/')) + '/' + ($relativeDir -replace '\\', '/'))
}
$mkdirTargets = $mkdirTargets | Sort-Object -Unique

if ($mkdirTargets.Count) {
  $quotedDirs = $mkdirTargets | ForEach-Object { ConvertTo-BashSingleQuoted $_ }
  Invoke-SshCommand -RemoteCommand ("mkdir -p {0}" -f ($quotedDirs -join ' '))
}

$uploadedCount = 0
foreach ($entry in $changedEntries) {
  $remoteFile = ($syncRemoteDir.TrimEnd('/')) + '/' + $entry.path
  Write-Step ("Subiendo {0}" -f $entry.path)
  Invoke-ScpUpload -LocalPath $entry.full_path -RemotePath $remoteFile
  $uploadedCount++
}

$removedCount = 0
if ($DeleteRemoved -and $removedPaths.Count) {
  foreach ($relativePath in $removedPaths) {
    $remoteFile = ($syncRemoteDir.TrimEnd('/')) + '/' + $relativePath
    Write-Step ("Eliminando remoto {0}" -f $relativePath)
    Invoke-SshCommand -RemoteCommand ("rm -f {0}" -f (ConvertTo-BashSingleQuoted $remoteFile))
    $removedCount++
  }
}

$statePayload = [pscustomobject]@{
  generated_at = (Get-Date).ToString('o')
  files = @(
    foreach ($entry in $currentEntries | Sort-Object path) {
      [pscustomobject]@{
        path = $entry.path
        hash = $entry.hash
      }
    }
  )
}

$stateJson = $statePayload | ConvertTo-Json -Depth 5
Set-Content -LiteralPath $resolvedStatePath -Value $stateJson -Encoding UTF8

Write-Step 'Sincronización finalizada correctamente.'
Write-Host ("Resumen sync: detectados={0} subidos={1} eliminados_remotos={2} delete_removed={3}" -f $changedEntries.Count, $uploadedCount, $removedCount, $DeleteRemoved.ToString().ToLowerInvariant())
