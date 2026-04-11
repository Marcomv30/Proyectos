// ============================================================
// MYA ERP — Fusion Config CRUD (solo superusuario)
// Endpoint: /api/combustible/config
// ============================================================

import express       from 'express'
import { createClient } from '@supabase/supabase-js'
import { createServer } from 'net'
import pkg            from 'pg'
import ssh2pkg        from 'ssh2'
import { manager }   from '../services/fusionSync.js'
import { requireSuperuser } from '../lib/authz.js'

const { Pool }              = pkg
const { Client: SshClient } = ssh2pkg

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const fusionConfigRouter = express.Router()

function findAvailablePort(preferredPort, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const tester = createServer()
    tester.unref()
    tester.on('error', reject)
    tester.listen(preferredPort, host, () => {
      const address = tester.address()
      const port = typeof address === 'object' && address ? address.port : preferredPort
      tester.close((closeErr) => {
        if (closeErr) reject(closeErr)
        else resolve(port)
      })
    })
  })
}

function _serializeConfigForClient(row) {
  if (!row) return row
  const status = manager.getInstance(row.empresa_id)?.getStatus?.() || null
  return {
    ...row,
    ssh_pass: '',
    pg_pass: '',
    instancia_activa: !!status?.running,
    instancia_saludable: !!status?.healthy,
    sync_estado: status?.connection_mode || 'disconnected',
    active_tunnel_port: status?.active_tunnel_port || null,
    ultima_sync: status?.last_sync_ok_at || null,
    ultimo_error_sync: status?.last_error || null,
  }
}

// ── GET /api/combustible/config ───────────────────────────────
// Lista todas las configuraciones (contraseñas enmascaradas)
fusionConfigRouter.get('/', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return
  const { data, error } = await supabase
    .from('fusion_config')
    .select('id,empresa_id,ssh_host,ssh_port,ssh_user,pg_db,pg_user,tunnel_port,api_url,poll_interval_ms,cant_registros,tcp_host,tcp_port,activo,creado_at,actualizado_at')
    .order('empresa_id')

  if (error) return res.status(500).json({ error: error.message })

  // Agregar estado de cada instancia en memoria
  const configs = (data || []).map(_serializeConfigForClient)

  res.json(configs)
})

// ── GET /api/combustible/config/:empresaId ────────────────────
// Obtiene una config (con contraseñas para edición)
fusionConfigRouter.get('/:empresaId', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return
  const empresaId = parseInt(req.params.empresaId)
  if (isNaN(empresaId)) return res.status(400).json({ error: 'empresa_id inválido' })

  const { data, error } = await supabase
    .from('fusion_config')
    .select('*')
    .eq('empresa_id', empresaId)
    .single()

  if (error) return res.status(error.code === 'PGRST116' ? 404 : 500).json({ error: error.message })
  res.json(_serializeConfigForClient(data))
})

// ── POST /api/combustible/config ──────────────────────────────
// Crea nueva configuración (y arranca instancia si activo=true)
fusionConfigRouter.post('/', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return
  const cfg = _sanitizeCfg(req.body)
  if (!cfg.empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })
  if (!cfg.ssh_host)   return res.status(400).json({ error: 'ssh_host requerido' })

  const { data, error } = await supabase
    .from('fusion_config')
    .insert({ ...cfg, creado_at: new Date().toISOString(), actualizado_at: new Date().toISOString() })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  if (data.activo) {
    await manager.startInstance(data).catch(err =>
      console.error('[fusionConfig] Error al iniciar instancia:', err.message)
    )
  }

  res.status(201).json({ ok: true, config: _serializeConfigForClient(data) })
})

// ── PUT /api/combustible/config/:empresaId ────────────────────
// Actualiza configuración existente y reinicia la instancia
fusionConfigRouter.put('/:empresaId', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return
  const empresaId = parseInt(req.params.empresaId)
  if (isNaN(empresaId)) return res.status(400).json({ error: 'empresa_id inválido' })

  const { data: actual, error: actualErr } = await supabase
    .from('fusion_config')
    .select('*')
    .eq('empresa_id', empresaId)
    .single()
  if (actualErr || !actual) return res.status(404).json({ error: 'Configuracion no encontrada' })

  const updates = _sanitizeCfg(req.body)
  delete updates.empresa_id  // no se puede cambiar empresa_id
  if (!updates.ssh_pass) delete updates.ssh_pass
  if (!updates.pg_pass) delete updates.pg_pass
  updates.actualizado_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('fusion_config')
    .update(updates)
    .eq('empresa_id', empresaId)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Reiniciar instancia con nueva config
  if (data.activo) {
    await manager.startInstance(data).catch(err =>
      console.error('[fusionConfig] Error al reiniciar instancia:', err.message)
    )
  } else {
    manager.stopInstance(empresaId)
  }

  res.json({ ok: true, config: _serializeConfigForClient(data) })
})

// ── DELETE /api/combustible/config/:empresaId ─────────────────
fusionConfigRouter.delete('/:empresaId', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return
  const empresaId = parseInt(req.params.empresaId)
  if (isNaN(empresaId)) return res.status(400).json({ error: 'empresa_id inválido' })

  manager.stopInstance(empresaId)

  const { error } = await supabase
    .from('fusion_config')
    .delete()
    .eq('empresa_id', empresaId)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// ── POST /api/combustible/config/probar ───────────────────────
// Prueba conexión SSH + PG sin guardar ni afectar instancias
fusionConfigRouter.post('/probar', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return
  const { ssh_host, ssh_port = 22, ssh_user, ssh_pass,
          pg_db, pg_user, pg_pass, tunnel_port = 15432 } = req.body

  if (!ssh_host || !ssh_user || !ssh_pass)
    return res.status(400).json({ error: 'ssh_host, ssh_user y ssh_pass son requeridos' })

  let sshClient = null
  let tunnelServer = null
  let pool = null
  let testPort = null

  try {
    testPort = await findAvailablePort(Number(tunnel_port) + 1000)
    await new Promise((resolve, reject) => {
      sshClient = new SshClient()

      sshClient.on('ready', () => {
        tunnelServer = createServer((sock) => {
          sshClient.forwardOut('127.0.0.1', testPort, '127.0.0.1', 5432, (err, stream) => {
            if (err) { sock.end(); return }
            sock.pipe(stream); stream.pipe(sock)
            stream.on('close', () => sock.end())
            sock.on('close',   () => stream.end())
          })
        })

        tunnelServer.listen(testPort, '127.0.0.1', async () => {
          if (!pg_db || !pg_user || !pg_pass) { resolve(); return }
          pool = new Pool({
            host: '127.0.0.1', port: testPort,
            database: pg_db, user: pg_user, password: pg_pass,
            ssl: false, max: 1, connectionTimeoutMillis: 8000,
          })
          try {
            await pool.query('SELECT version()')
            resolve()
          } catch (err) {
            reject(new Error('SSH OK pero fallo PostgreSQL: ' + err.message))
          }
        })

        tunnelServer.on('error', err => reject(new Error('Tunnel error: ' + err.message)))
      })

      sshClient.on('error', err => reject(new Error('SSH error: ' + err.message)))
      sshClient.connect({ host: ssh_host, port: Number(ssh_port), username: ssh_user, password: ssh_pass, readyTimeout: 8000 })
    })

    const mensaje = testPort && testPort !== Number(tunnel_port) + 1000
      ? `Conexión exitosa usando puerto temporal ${testPort}`
      : 'Conexión exitosa'
    res.json({ ok: true, mensaje, test_port: testPort })
  } catch (err) {
    res.status(200).json({ ok: false, error: err.message })
  } finally {
    if (pool)         pool.end().catch(() => {})
    if (tunnelServer) tunnelServer.close()
    if (sshClient)    sshClient.end()
  }
})

// ── POST /api/combustible/config/:empresaId/reiniciar ─────────
fusionConfigRouter.post('/:empresaId/reiniciar', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return
  const empresaId = parseInt(req.params.empresaId)
  if (isNaN(empresaId)) return res.status(400).json({ error: 'empresa_id inválido' })

  const { data, error } = await supabase
    .from('fusion_config')
    .select('*')
    .eq('empresa_id', empresaId)
    .single()

  if (error) return res.status(404).json({ error: 'Configuración no encontrada' })
  if (!data.activo) return res.status(400).json({ error: 'La configuración está inactiva' })

  await manager.startInstance(data).catch(err =>
    console.error('[fusionConfig] Error al reiniciar:', err.message)
  )
  res.json({ ok: true, mensaje: 'Instancia reiniciada' })
})

// ─── Helpers ──────────────────────────────────────────────────
function _sanitizeCfg(body) {
  const allowed = ['empresa_id','ssh_host','ssh_port','ssh_user','ssh_pass',
                   'pg_db','pg_user','pg_pass','tunnel_port','api_url',
                   'poll_interval_ms','cant_registros','tcp_host','tcp_port','activo']
  const cfg = {}
  for (const k of allowed) {
    if (body[k] !== undefined) cfg[k] = body[k]
  }
  // Convertir numéricos
  for (const k of ['empresa_id','ssh_port','tunnel_port','poll_interval_ms','cant_registros','tcp_port']) {
    if (cfg[k] !== undefined && cfg[k] !== null && cfg[k] !== '') cfg[k] = Number(cfg[k])
  }
  return cfg
}
