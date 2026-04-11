import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import express from 'express'
import { fileURLToPath } from 'url'
import { requireSuperuser } from '../lib/authz.js'

export const frontendDeployRouter = express.Router()

const routeDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(routeDir, '..', '..')
const projectsRoot = path.resolve(repoRoot, '..')

const DEPLOY_TARGETS = {
  erp: {
    label: 'ERP',
    defaultSourceDir: repoRoot,
    defaultPublishDir: '/home/mya-frontend',
    defaultBackupDir: '/home/frontend-backups',
    defaultBuildCmd: 'npm run build',
    defaultBuildSubdir: 'build',
    defaultFrontendDir: '/home/mya-frontend-src',
    defaultEnvFile: '.env.production.local',
    envMode: 'react',
    envPrefix: 'FRONTEND_DEPLOY',
    syncPrefix: 'FRONTEND',
  },
  empacadora: {
    label: 'Empacadora',
    defaultSourceDir: path.join(projectsRoot, 'empacadora'),
    defaultPublishDir: '/home/mya-empacadora',
    defaultBackupDir: '/home/empacadora-backups',
    defaultBuildCmd: 'npm run build',
    defaultBuildSubdir: 'build',
    defaultFrontendDir: '/home/mya-empacadora-src',
    defaultEnvFile: '.env.production',
    envMode: 'react',
    envPrefix: 'EMPACADORA_DEPLOY',
    syncPrefix: 'EMPACADORA',
  },
  consola: {
    label: 'Consola',
    defaultSourceDir: path.join(projectsRoot, 'consola'),
    defaultPublishDir: '/home/mya-consola',
    defaultBackupDir: '/home/consola-backups',
    defaultBuildCmd: 'npm run build',
    defaultBuildSubdir: 'build',
    defaultFrontendDir: '/home/mya-consola-src',
    defaultEnvFile: '.env.production',
    envMode: 'react',
    envPrefix: 'CONSOLA_DEPLOY',
    syncPrefix: 'CONSOLA',
  },
  pos: {
    label: 'POS',
    defaultSourceDir: path.join(projectsRoot, 'pos-mya'),
    defaultPublishDir: '/home/mya-pos',
    defaultBackupDir: '/home/pos-backups',
    defaultBuildCmd: 'npm run build',
    defaultBuildSubdir: 'dist',
    defaultFrontendDir: '/home/mya-pos-src',
    defaultEnvFile: '.env.production',
    envMode: 'vite',
    envPrefix: 'POS_DEPLOY',
    syncPrefix: 'POS',
  },
}

function normalizeTarget(value) {
  const raw = String(value || 'erp').trim().toLowerCase()
  return DEPLOY_TARGETS[raw] ? raw : 'erp'
}

function getTargetProfile(target) {
  return DEPLOY_TARGETS[normalizeTarget(target)]
}

const deployState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  ok: null,
  error: '',
  logs: [],
}

const syncState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  ok: null,
  error: '',
  logs: [],
}

const fileSyncState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  ok: null,
  error: '',
  logs: [],
}

function getFrontendEnvPath(cfg) {
  return path.join(cfg.sourceDir, cfg.envFile)
}

function getConfig(target = 'erp') {
  const normalizedTarget = normalizeTarget(target)
  const profile = getTargetProfile(normalizedTarget)
  const envPrefix = profile.envPrefix
  const syncPrefix = profile.syncPrefix
  return {
    target: normalizedTarget,
    targetLabel: profile.label,
    envMode: profile.envMode,
    envFile: String(process.env[`${envPrefix}_ENV_FILE`] || profile.defaultEnvFile).trim(),
    sourceDir: String(process.env[`${envPrefix}_SOURCE_DIR`] || profile.defaultSourceDir).trim(),
    publishDir: String(process.env[`${envPrefix}_PUBLISH_DIR`] || profile.defaultPublishDir).trim(),
    backupDir: String(process.env[`${envPrefix}_BACKUP_DIR`] || profile.defaultBackupDir).trim(),
    syncCmd: String(process.env[`${syncPrefix}_SYNC_CMD`] || '').trim(),
    installCmd: String(process.env[`${envPrefix}_INSTALL_CMD`] || '').trim(),
    buildCmd: String(process.env[`${envPrefix}_BUILD_CMD`] || profile.defaultBuildCmd).trim(),
    buildSubdir: String(process.env[`${envPrefix}_BUILD_SUBDIR`] || profile.defaultBuildSubdir).trim(),
    fileSyncFrontendDir: String(process.env[`VPS_FILE_SYNC_${normalizedTarget.toUpperCase()}_DIR`] || profile.defaultFrontendDir).trim(),
    fileSyncBackendDir: String(process.env.VPS_FILE_SYNC_BACKEND_DIR || '/home/mya-backend').trim(),
    fileSyncMiscDir: String(process.env.VPS_FILE_SYNC_MISC_DIR || '/root').trim(),
  }
}

function pushLog(targetState, line) {
  const stamp = new Date().toISOString()
  targetState.logs.push(`[${stamp}] ${line}`)
  if (targetState.logs.length > 200) {
    targetState.logs = targetState.logs.slice(-200)
  }
}

function addLog(line) {
  pushLog(deployState, line)
}

function addSyncLog(line) {
  pushLog(syncState, line)
}

function addFileSyncLog(line) {
  pushLog(fileSyncState, line)
}

async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function emptyDir(dir) {
  const entries = await fs.readdir(dir)
  await Promise.all(entries.map((entry) => fs.rm(path.join(dir, entry), { recursive: true, force: true })))
}

function parseEnvText(text) {
  const map = {}
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return map
}

async function readEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return parseEnvText(raw)
  } catch {
    return {}
  }
}

function getEnvKeyNames(cfg) {
  if (cfg.envMode === 'vite') {
    return {
      supabaseUrl: 'VITE_SUPABASE_URL',
      anonKey: 'VITE_SUPABASE_ANON_KEY',
      apiUrl: 'VITE_API_URL',
    }
  }
  return {
    supabaseUrl: 'REACT_APP_SUPABASE_URL',
    anonKey: 'REACT_APP_SUPABASE_ANON_KEY',
    apiUrl: 'REACT_APP_API_URL',
  }
}

function serializeEnvFile(values, cfg) {
  const envKeys = getEnvKeyNames(cfg)
  return [
    `${envKeys.supabaseUrl}=${values[envKeys.supabaseUrl] || ''}`,
    `${envKeys.anonKey}=${values[envKeys.anonKey] || ''}`,
    `${envKeys.apiUrl}=${values[envKeys.apiUrl] || ''}`,
    '',
  ].join('\n')
}

function maskSecret(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.length <= 12) return `${raw.slice(0, 4)}...`
  return `${raw.slice(0, 8)}...${raw.slice(-6)}`
}

function commandNeedsGitRepo(command) {
  const raw = String(command || '').trim().toLowerCase()
  return raw.startsWith('git ') || raw === 'git'
}

function runShellCommand(command, cwd, onLine = addLog) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
      const lines = chunk.toString().split(/\r?\n/).filter(Boolean)
      lines.forEach(onLine)
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      const lines = chunk.toString().split(/\r?\n/).filter(Boolean)
      lines.forEach((line) => onLine(`ERR ${line}`))
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else {
        const detail = (stderr || stdout).trim()
        reject(new Error(detail || `Comando fallo (${code}): ${command}`))
      }
    })
  })
}

function runShellCapture(command, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error((stderr || stdout || `Comando fallo (${code}): ${command}`).trim()))
    })
  })
}

function shortCommit(value) {
  const raw = String(value || '').trim()
  return raw ? raw.slice(0, 7) : ''
}

function normalizeRepoPath(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
}

function isFrontendRootFile(fileName) {
  return [
    'package.json',
    'package-lock.json',
    'npm-shrinkwrap.json',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'jsconfig.json',
    'index.html',
    'eslint.config.js',
    'postcss.config.js',
    'postcss.config.cjs',
    'postcss.config.mjs',
    'tailwind.config.js',
    'tailwind.config.cjs',
    'tailwind.config.mjs',
    'vite.config.js',
    'vite.config.ts',
    'vite.config.mjs',
    'vite.config.cjs',
  ].includes(fileName)
}

function mapRepoPathToRemote(relativePath, cfg) {
  const rel = normalizeRepoPath(relativePath)
  if (!rel) return null

  const posixJoin = (...parts) => path.posix.join(...parts.map((part) => String(part || '').replace(/\\/g, '/')))

  if (rel.startsWith('server/')) {
    return {
      target: 'backend',
      remote_path: posixJoin(cfg.fileSyncBackendDir, rel.slice('server/'.length)),
    }
  }

  if (rel.startsWith('src/') || rel.startsWith('public/') || isFrontendRootFile(rel)) {
    return {
      target: 'frontend',
      remote_path: posixJoin(cfg.fileSyncFrontendDir, rel),
    }
  }

  if (/\.sql$/i.test(rel) || rel.startsWith('docs/')) {
    return {
      target: 'misc',
      remote_path: posixJoin(cfg.fileSyncMiscDir, path.posix.basename(rel)),
    }
  }

  return null
}

async function listChangedRepoFiles(cfg, sourceExists, gitRepoExists) {
  if (!cfg.sourceDir || !sourceExists || !gitRepoExists) return []

  const [diffRaw, untrackedRaw] = await Promise.all([
    runShellCapture('git diff --name-only --relative HEAD', cfg.sourceDir).catch(() => ''),
    runShellCapture('git ls-files --others --exclude-standard', cfg.sourceDir).catch(() => ''),
  ])

  const candidates = new Set()
  for (const raw of `${diffRaw}\n${untrackedRaw}`.split(/\r?\n/)) {
    const rel = normalizeRepoPath(raw)
    if (rel) candidates.add(rel)
  }

  const paths = []
  for (const rel of [...candidates].sort()) {
    const abs = path.join(cfg.sourceDir, rel)
    if (!(await pathExists(abs))) continue
    try {
      const stat = await fs.stat(abs)
      if (stat.isFile()) paths.push(rel)
    } catch {}
  }

  return paths
}

async function getFileSyncCandidates(cfg, sourceExists, gitRepoExists) {
  const relPaths = await listChangedRepoFiles(cfg, sourceExists, gitRepoExists)
  return relPaths.map((rel) => {
    const mapping = mapRepoPathToRemote(rel, cfg)
    return {
      path: rel,
      supported: !!mapping,
      target: mapping?.target || '',
      remote_path: mapping?.remote_path || '',
    }
  })
}

async function getSyncCheck(cfg, sourceExists) {
  const base = {
    available: false,
    checked_at: null,
    pending_update: null,
    branch: '',
    local_commit: '',
    remote_commit: '',
    error: '',
  }

  if (!cfg.sourceDir || !sourceExists) return base
  if (!(await pathExists(path.join(cfg.sourceDir, '.git')))) return base

  try {
    const branch = await runShellCapture('git rev-parse --abbrev-ref HEAD', cfg.sourceDir)
    const localCommit = await runShellCapture('git rev-parse HEAD', cfg.sourceDir)
    const remoteLine = await runShellCapture(`git ls-remote origin refs/heads/${branch}`, cfg.sourceDir)
    const remoteCommit = String(remoteLine || '').split(/\s+/)[0] || ''

    return {
      available: true,
      checked_at: new Date().toISOString(),
      pending_update: !!remoteCommit && remoteCommit !== localCommit,
      branch,
      local_commit: shortCommit(localCommit),
      remote_commit: shortCommit(remoteCommit),
      error: '',
    }
  } catch (err) {
    return {
      ...base,
      available: true,
      checked_at: new Date().toISOString(),
      error: err.message || 'No se pudo comprobar si hay cambios pendientes.',
    }
  }
}

async function getStatusPayload(target = 'erp') {
  const cfg = getConfig(target)
  const envPath = cfg.sourceDir ? getFrontendEnvPath(cfg) : ''
  const buildDir = cfg.sourceDir ? path.join(cfg.sourceDir, cfg.buildSubdir) : ''
  const fileSyncScriptPath = path.join(repoRoot, 'scripts', 'upload-selected-to-vps.ps1')
  const sourceConfigured = !!cfg.sourceDir
  const sourceExists = sourceConfigured ? await pathExists(cfg.sourceDir) : false
  const publishExists = await pathExists(cfg.publishDir)
  const packageJsonExists = sourceExists ? await pathExists(path.join(cfg.sourceDir, 'package.json')) : false
  const buildDirExists = sourceExists ? await pathExists(buildDir) : false
  const envExists = sourceExists ? await pathExists(envPath) : false
  const fileSyncScriptExists = sourceExists ? await pathExists(fileSyncScriptPath) : false
  const envValues = envExists ? await readEnvFile(envPath) : {}
  const envKeys = getEnvKeyNames(cfg)
  const publishSameAsBuild = !!buildDir && path.resolve(buildDir) === path.resolve(cfg.publishDir)
  const gitRepoExists = sourceExists ? await pathExists(path.join(cfg.sourceDir, '.git')) : false
  const syncConfigured = !!cfg.syncCmd && (!commandNeedsGitRepo(cfg.syncCmd) || gitRepoExists)
  const syncCheck = await getSyncCheck(cfg, sourceExists)

  return {
    sync: {
      running: syncState.running,
      started_at: syncState.startedAt,
      finished_at: syncState.finishedAt,
      ok: syncState.ok,
      error: syncState.error,
      logs: syncState.logs.slice(-40),
    },
    file_sync: {
      running: fileSyncState.running,
      started_at: fileSyncState.startedAt,
      finished_at: fileSyncState.finishedAt,
      ok: fileSyncState.ok,
      error: fileSyncState.error,
      logs: fileSyncState.logs.slice(-60),
    },
    running: deployState.running,
    started_at: deployState.startedAt,
    finished_at: deployState.finishedAt,
    ok: deployState.ok,
    error: deployState.error,
    logs: deployState.logs.slice(-60),
    config: {
      target: cfg.target,
      target_label: cfg.targetLabel,
      available_targets: Object.entries(DEPLOY_TARGETS).map(([id, item]) => ({ id, label: item.label })),
      source_dir: cfg.sourceDir,
      publish_dir: cfg.publishDir,
      backup_dir: cfg.backupDir,
      sync_cmd: cfg.syncCmd,
      sync_configured: syncConfigured,
      git_repo_exists: gitRepoExists,
      install_cmd: cfg.installCmd,
      build_cmd: cfg.buildCmd,
      build_subdir: cfg.buildSubdir,
      source_configured: sourceConfigured,
      source_exists: sourceExists,
      package_json_exists: packageJsonExists,
      build_dir_exists: buildDirExists,
      publish_exists: publishExists,
      publish_same_as_build: publishSameAsBuild,
      env_mode: cfg.envMode,
      env_file: cfg.envFile,
      env_path: envPath,
      env_exists: envExists,
      current_supabase_url: envValues[envKeys.supabaseUrl] || '',
      current_anon_key_masked: maskSecret(envValues[envKeys.anonKey] || ''),
      current_api_url: envValues[envKeys.apiUrl] || '',
      sync_check: syncCheck,
      file_sync_available: fileSyncScriptExists && gitRepoExists,
      file_sync_script_path: fileSyncScriptPath,
      file_sync_frontend_dir: cfg.fileSyncFrontendDir,
      file_sync_backend_dir: cfg.fileSyncBackendDir,
      file_sync_misc_dir: cfg.fileSyncMiscDir,
    },
  }
}

async function prepareFrontendEnv(cfg, overrides = {}) {
  const envPath = getFrontendEnvPath(cfg)
  const existing = await readEnvFile(envPath)
  const envKeys = getEnvKeyNames(cfg)
  const merged = {
    [envKeys.supabaseUrl]: String(overrides.supabaseUrl || existing[envKeys.supabaseUrl] || '').trim(),
    [envKeys.anonKey]: String(overrides.anonKey || existing[envKeys.anonKey] || '').trim(),
    [envKeys.apiUrl]: String(overrides.apiUrl || existing[envKeys.apiUrl] || process.env.REACT_APP_API_URL || 'https://api.visionzn.net').trim(),
  }

  if (!merged[envKeys.supabaseUrl]) throw new Error(`Falta ${envKeys.supabaseUrl} para publicar el frontend.`)
  if (!merged[envKeys.anonKey]) throw new Error(`Falta ${envKeys.anonKey} para publicar el frontend.`)
  if (!merged[envKeys.apiUrl]) throw new Error(`Falta ${envKeys.apiUrl} para publicar el frontend.`)

  await fs.writeFile(envPath, serializeEnvFile(merged, cfg), 'utf8')
  addLog(`Variables de frontend preparadas en ${envPath}`)
  addLog(`SUPABASE_URL: ${merged[envKeys.supabaseUrl]}`)
  addLog(`ANON_KEY: ${maskSecret(merged[envKeys.anonKey])}`)
  addLog(`API_URL: ${merged[envKeys.apiUrl]}`)
}

async function runFrontendDeploy(target = 'erp', overrides = {}) {
  const cfg = getConfig(target)
  if (!cfg.sourceDir) {
    throw new Error('Falta FRONTEND_DEPLOY_SOURCE_DIR en el servidor.')
  }

  const packageJsonPath = path.join(cfg.sourceDir, 'package.json')
  const buildDir = path.join(cfg.sourceDir, cfg.buildSubdir)
  const publishSameAsBuild = path.resolve(buildDir) === path.resolve(cfg.publishDir)
  if (!(await pathExists(cfg.sourceDir))) {
    throw new Error(`No existe el directorio fuente del frontend: ${cfg.sourceDir}`)
  }
  if (!(await pathExists(packageJsonPath))) {
    throw new Error(`No se encontró package.json en ${cfg.sourceDir}`)
  }

  addLog(`Usando fuente: ${cfg.sourceDir}`)
  addLog(`Publicacion destino: ${cfg.publishDir}`)
  await prepareFrontendEnv(cfg, overrides)

  if (cfg.installCmd) {
    addLog(`Ejecutando instalacion: ${cfg.installCmd}`)
    await runShellCommand(cfg.installCmd, cfg.sourceDir)
  }

  addLog(`Compilando frontend: ${cfg.buildCmd}`)
  await runShellCommand(cfg.buildCmd, cfg.sourceDir)

  if (!(await pathExists(buildDir))) {
    throw new Error(`No se encontró el build generado en ${buildDir}`)
  }

  await fs.mkdir(cfg.backupDir, { recursive: true })
  await fs.mkdir(cfg.publishDir, { recursive: true })

  if (publishSameAsBuild) {
    addLog('El directorio de publicacion coincide con build. Se omite la copia final y se da la compilacion por publicada.')
    addLog('Frontend compilado correctamente')
    return
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupTarget = path.join(cfg.backupDir, `frontend-${timestamp}`)

  addLog(`Respaldando publicacion actual en ${backupTarget}`)
  await fs.cp(cfg.publishDir, backupTarget, { recursive: true })

  addLog('Limpiando directorio publicado actual')
  await emptyDir(cfg.publishDir)

  addLog('Copiando nuevo build a publicacion')
  await fs.cp(buildDir, cfg.publishDir, { recursive: true })

  addLog('Frontend publicado correctamente')
}

async function runFrontendSync(target = 'erp') {
  const cfg = getConfig(target)
  if (!cfg.sourceDir) {
    throw new Error('Falta FRONTEND_DEPLOY_SOURCE_DIR en el servidor.')
  }
  if (!cfg.syncCmd) {
    throw new Error('Falta FRONTEND_SYNC_CMD en el servidor.')
  }
  if (!(await pathExists(cfg.sourceDir))) {
    throw new Error(`No existe el directorio fuente del frontend: ${cfg.sourceDir}`)
  }

  addSyncLog(`Usando fuente: ${cfg.sourceDir}`)
  addSyncLog(`Ejecutando sincronizacion: ${cfg.syncCmd}`)
  await runShellCommand(cfg.syncCmd, cfg.sourceDir, addSyncLog)
  addSyncLog('Sincronizacion finalizada correctamente')
}

async function runSelectedFileSync(target = 'erp', selectedPaths = []) {
  const cfg = getConfig(target)
  if (!cfg.sourceDir) {
    throw new Error('Falta FRONTEND_DEPLOY_SOURCE_DIR en el servidor.')
  }

  const scriptPath = path.join(repoRoot, 'scripts', 'upload-selected-to-vps.ps1')
  if (!(await pathExists(scriptPath))) {
    throw new Error(`No se encontró el script de file sync: ${scriptPath}`)
  }
  if (!(await pathExists(cfg.sourceDir))) {
    throw new Error(`No existe el directorio fuente del frontend: ${cfg.sourceDir}`)
  }
  if (!(await pathExists(path.join(cfg.sourceDir, '.git')))) {
    throw new Error('El envío de archivos requiere un repo Git local.')
  }

  const candidates = await getFileSyncCandidates(cfg, true, true)
  const candidateMap = new Map(candidates.filter((item) => item.supported).map((item) => [item.path, item]))
  const normalized = [...new Set((Array.isArray(selectedPaths) ? selectedPaths : []).map(normalizeRepoPath).filter(Boolean))]

  if (!normalized.length) {
    throw new Error('Seleccione al menos un archivo para enviar.')
  }

  const manifestFiles = normalized.map((rel) => {
    const item = candidateMap.get(rel)
    if (!item) {
      throw new Error(`El archivo no es compatible o ya no está disponible para sync: ${rel}`)
    }
    return {
      path: rel,
      target: item.target,
      local_path: path.join(cfg.sourceDir, rel),
      remote_path: item.remote_path,
    }
  })

  const manifestPath = path.join(repoRoot, 'tmp', `vps-file-sync-manifest-${Date.now()}.json`)
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, JSON.stringify({ source_dir: cfg.sourceDir, files: manifestFiles }, null, 2), 'utf8')

  addFileSyncLog(`Usando fuente: ${cfg.sourceDir}`)
  addFileSyncLog(`Archivos seleccionados: ${manifestFiles.length}`)
  addFileSyncLog(`Ejecutando file sync con ${path.relative(repoRoot, scriptPath)}`)

  try {
    await runShellCommand(`powershell -ExecutionPolicy Bypass -File "${scriptPath}" -ManifestPath "${manifestPath}"`, repoRoot, addFileSyncLog)
    addFileSyncLog('Envio de archivos finalizado correctamente')
  } finally {
    await fs.rm(manifestPath, { force: true }).catch(() => {})
  }
}

frontendDeployRouter.get('/status', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return

  res.json({ ok: true, status: await getStatusPayload(req.query?.target) })
})

frontendDeployRouter.get('/files', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return

  const cfg = getConfig(req.query?.target)
  const sourceExists = !!cfg.sourceDir && await pathExists(cfg.sourceDir)
  const gitRepoExists = sourceExists ? await pathExists(path.join(cfg.sourceDir, '.git')) : false
  const files = await getFileSyncCandidates(cfg, sourceExists, gitRepoExists)
  res.json({ ok: true, files })
})

frontendDeployRouter.post('/run', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return

  if (deployState.running) {
    return res.status(409).json({ ok: false, error: 'Ya hay una publicación en curso.' })
  }

  deployState.running = true
  deployState.startedAt = new Date().toISOString()
  deployState.finishedAt = null
  deployState.ok = null
  deployState.error = ''
  deployState.logs = []

  addLog(`Solicitud iniciada por ${ctx.usuario.username || ctx.usuario.email || 'superusuario'}`)

  void (async () => {
    try {
      await runFrontendDeploy(req.body?.target, {
        supabaseUrl: req.body?.supabase_url,
        anonKey: req.body?.anon_key,
        apiUrl: req.body?.api_url,
      })
      deployState.ok = true
      deployState.finishedAt = new Date().toISOString()
    } catch (err) {
      deployState.ok = false
      deployState.error = err.message || 'Error desconocido al publicar frontend.'
      deployState.finishedAt = new Date().toISOString()
      addLog(`Fallo de publicación: ${deployState.error}`)
    } finally {
      deployState.running = false
    }
  })()

  res.status(202).json({ ok: true, status: await getStatusPayload(req.body?.target), message: 'Publicacion iniciada.' })
})

frontendDeployRouter.post('/sync', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return

  if (syncState.running) {
    return res.status(409).json({ ok: false, error: 'Ya hay una sincronización en curso.' })
  }

  syncState.running = true
  syncState.startedAt = new Date().toISOString()
  syncState.finishedAt = null
  syncState.ok = null
  syncState.error = ''
  syncState.logs = []

  addSyncLog(`Solicitud iniciada por ${ctx.usuario.username || ctx.usuario.email || 'superusuario'}`)

  void (async () => {
    try {
      await runFrontendSync(req.body?.target)
      syncState.ok = true
      syncState.finishedAt = new Date().toISOString()
    } catch (err) {
      syncState.ok = false
      syncState.error = err.message || 'Error desconocido al sincronizar frontend.'
      syncState.finishedAt = new Date().toISOString()
      addSyncLog(`Fallo de sincronizacion: ${syncState.error}`)
    } finally {
      syncState.running = false
    }
  })()

  res.status(202).json({ ok: true, status: await getStatusPayload(req.body?.target), message: 'Sincronizacion iniciada.' })
})

// ── Publicación completa en VPS: upload + build remoto ───────
async function runVpsFullPublish(target = 'erp', selectedPaths = []) {
  const cfg = getConfig(target)

  // Paso 1: subir archivos
  addFileSyncLog('=== Paso 1/2: Subiendo archivos al VPS ===')
  await runSelectedFileSync(target, selectedPaths)

  // Paso 2: SSH → build en VPS
  addFileSyncLog('=== Paso 2/2: Compilando frontend en VPS ===')

  const secretsPath = path.join(repoRoot, '.secrets', 'vps-file-sync.env')
  const secrets = await readEnvFile(secretsPath)

  const vpsHost = (secrets.VPS_HOST || '').trim()
  const vpsUser = (secrets.VPS_USER || 'root').trim()
  const vpsPort = (secrets.VPS_PORT || '22').trim()
  const vpsPw   = (secrets.VPS_SSH_PASSWORD || '').trim()
  const plinkRaw = (secrets.PLINK_PATH || 'C:\\Program Files\\PuTTY\\plink.exe').trim()

  if (!vpsHost) throw new Error('Falta VPS_HOST en .secrets/vps-file-sync.env')
  if (!vpsPw)   throw new Error('Falta VPS_SSH_PASSWORD en .secrets/vps-file-sync.env')

  const frontendSrc = (secrets[`VPS_FILE_SYNC_${cfg.target.toUpperCase()}_DIR`] || cfg.fileSyncFrontendDir).trim()
  const frontendPub = cfg.publishDir || '/home/mya-frontend'

  const remoteCmd = [
    `cd ${frontendSrc}`,
    'GENERATE_SOURCEMAP=false NODE_OPTIONS=--max-old-space-size=768 npm run build',
    `mkdir -p ${frontendPub}`,
    `rm -rf ${frontendPub}/*`,
    `cp -r ${frontendSrc}/build/* ${frontendPub}/`,
    'echo PUBLICADO_OK',
  ].join(' && ')

  // Construir comando plink (cmd.exe friendly)
  const plinkQ = plinkRaw.includes(' ') ? `"${plinkRaw}"` : plinkRaw
  const sshCmd = `${plinkQ} -batch -no-antispoof -P ${vpsPort} -pw ${vpsPw} ${vpsUser}@${vpsHost} "${remoteCmd}"`

  addFileSyncLog(`Conectando a ${vpsUser}@${vpsHost}...`)
  await runShellCommand(sshCmd, cfg.sourceDir, addFileSyncLog)
  addFileSyncLog('Frontend publicado en VPS correctamente.')
}

frontendDeployRouter.post('/vps-publish', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return

  if (fileSyncState.running) {
    return res.status(409).json({ ok: false, error: 'Ya hay un envio en curso.' })
  }

  fileSyncState.running = true
  fileSyncState.startedAt = new Date().toISOString()
  fileSyncState.finishedAt = null
  fileSyncState.ok = null
  fileSyncState.error = ''
  fileSyncState.logs = []

  addFileSyncLog(`Publicacion VPS iniciada por ${ctx.usuario?.username || ctx.usuario?.email || 'superusuario'}`)

  void (async () => {
    try {
      await runVpsFullPublish(req.body?.target, req.body?.paths)
      fileSyncState.ok = true
      fileSyncState.finishedAt = new Date().toISOString()
    } catch (err) {
      fileSyncState.ok = false
      fileSyncState.error = err.message || 'Error al publicar en VPS.'
      fileSyncState.finishedAt = new Date().toISOString()
      addFileSyncLog(`Error: ${fileSyncState.error}`)
    } finally {
      fileSyncState.running = false
    }
  })()

  res.status(202).json({ ok: true, status: await getStatusPayload(req.body?.target), message: 'Publicacion VPS iniciada.' })
})

frontendDeployRouter.post('/files/run', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return

  if (fileSyncState.running) {
    return res.status(409).json({ ok: false, error: 'Ya hay un envío de archivos en curso.' })
  }

  fileSyncState.running = true
  fileSyncState.startedAt = new Date().toISOString()
  fileSyncState.finishedAt = null
  fileSyncState.ok = null
  fileSyncState.error = ''
  fileSyncState.logs = []

  addFileSyncLog(`Solicitud iniciada por ${ctx.usuario.username || ctx.usuario.email || 'superusuario'}`)

  void (async () => {
    try {
      await runSelectedFileSync(req.body?.target, req.body?.paths)
      fileSyncState.ok = true
      fileSyncState.finishedAt = new Date().toISOString()
    } catch (err) {
      fileSyncState.ok = false
      fileSyncState.error = err.message || 'Error desconocido al enviar archivos.'
      fileSyncState.finishedAt = new Date().toISOString()
      addFileSyncLog(`Fallo de file sync: ${fileSyncState.error}`)
    } finally {
      fileSyncState.running = false
    }
  })()

  res.status(202).json({ ok: true, status: await getStatusPayload(req.body?.target), message: 'Envio de archivos iniciado.' })
})
