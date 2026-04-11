// ============================================================
// MYA ERP — Fusion Sync Service (multi-empresa)
// Cada empresa activa tiene su propia instancia: SSH tunnel
// independiente, pool PG y ciclo de sincronización.
// ============================================================

import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
dotenv.config({ path: join(__dirname, '../.env') })

import { createClient }    from '@supabase/supabase-js'
import axios               from 'axios'
import { WebSocketServer } from 'ws'
import { createServer }    from 'net'
import pkg                 from 'pg'
import ssh2pkg             from 'ssh2'
import express             from 'express'
import { requirePermission, requireSuperuser } from '../lib/authz.js'
import { costaRicaDayRangeUtc, currentCostaRicaDateYmd, fusionDateTimeToUtcIso } from '../lib/costaRicaTime.js'

const { Pool }              = pkg
const { Client: SshClient } = ssh2pkg

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ─── WebSocket (compartido entre todas las instancias) ────────
let wss = null

export function attachWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws/combustible' })
  wss.on('connection', (ws) => { ws.on('close', () => {}) })
}

/**
 * Broadcast a todos los clientes WS.
 * @param {number|null} empresaId  null = todos ven el mensaje (p.ej. pump_status global)
 */
export function broadcastRaw(empresaId, event, data) {
  if (!wss) return
  const msg = JSON.stringify({ empresa_id: empresaId, event, data, ts: new Date().toISOString() })
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg)
  })
}

// ─── Helpers ──────────────────────────────────────────────────
function fusionDateTime(date8, time6) {
  return fusionDateTimeToUtcIso(date8, time6)
}

function serializeInstanceStatus(inst) {
  const status = inst?.getStatus?.() || null
  return {
    instancia_activa: !!status?.running,
    instancia_saludable: !!status?.healthy,
    sync_estado: status?.connection_mode || 'disconnected',
    active_tunnel_port: status?.active_tunnel_port || null,
    ultima_sync: status?.last_sync_ok_at || null,
    ultima_ejecucion: status?.last_sync_at || null,
    ultimo_error_sync: status?.last_error || null,
    sync_en_curso: !!status?.sync_running,
  }
}

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

// ─── FusionInstance ───────────────────────────────────────────
class FusionInstance {
  constructor(cfg) {
    // cfg: { empresa_id, ssh_host, ssh_port, ssh_user, ssh_pass,
    //        pg_db, pg_user, pg_pass, tunnel_port, api_url,
    //        poll_interval_ms, cant_registros }
    this.cfg          = cfg
    this.fusionPool   = null
    this.sshClient    = null
    this.tunnelServer = null
    this.syncRunning  = false
    this.intervalHandle = null
    this.tag          = `[E${cfg.empresa_id}]`
    this.activeTunnelPort = null
    this.connectionMode = 'disconnected'
    this.lastError = null
    this.lastSyncAt = null
    this.lastSyncOkAt = null
  }

  // ── SSH tunnel ─────────────────────────────────────────────
  async createSshTunnel() {
    const { ssh_host, ssh_port, ssh_user, ssh_pass,
            pg_db, pg_user, pg_pass, tunnel_port } = this.cfg
    const localTunnelPort = await findAvailablePort(tunnel_port)

    if (localTunnelPort !== tunnel_port) {
      console.warn(`${this.tag}[SSH Tunnel] Puerto ${tunnel_port} ocupado, usando ${localTunnelPort}`)
    }
    this.activeTunnelPort = localTunnelPort

    return new Promise((resolve, reject) => {
      this.sshClient = new SshClient()

      this.sshClient.on('ready', () => {
        console.log(`${this.tag}[SSH] Conectado a ${ssh_host}`)
        let settled = false
        const settle = (fn, arg) => { if (!settled) { settled = true; fn(arg) } }

        this.tunnelServer = createServer((sock) => {
          this.sshClient.forwardOut(
            '127.0.0.1', localTunnelPort,
            '127.0.0.1', 5432,
            (err, stream) => {
              if (err) { sock.end(); return }
              sock.pipe(stream)
              stream.pipe(sock)
              stream.on('close', () => sock.end())
              sock.on('close',   () => stream.end())
            }
          )
        })

        this.tunnelServer.listen(localTunnelPort, '127.0.0.1', () => {
          console.log(`${this.tag}[SSH Tunnel] Escuchando en 127.0.0.1:${localTunnelPort}`)
          this.fusionPool = new Pool({
            host: '127.0.0.1', port: localTunnelPort,
            database: pg_db, user: pg_user, password: pg_pass,
            ssl: false, max: 3, connectionTimeoutMillis: 10000,
          })
          this.fusionPool.on('error', (err) => {
            console.error(`${this.tag}[FusionPG] Pool error:`, err.message)
            this.lastError = err.message
            this.connectionMode = this.cfg.api_url ? 'http' : 'disconnected'
          })
          this.fusionPool.query('SELECT 1')
            .then(() => {
              this.connectionMode = 'pg'
              this.lastError = null
              console.log(`${this.tag}[FusionPG] Conexión OK`)
              settle(resolve)
            })
            .catch((err) => { console.error(`${this.tag}[FusionPG] Test falló:`, err.message); settle(resolve) })
        })

        this.tunnelServer.on('error', (err) => {
          console.error(`${this.tag}[SSH Tunnel] Error en puerto ${localTunnelPort}:`, err.message)
          settle(reject, err)
        })
      })

      this.sshClient.on('error', (err) => {
        console.error(`${this.tag}[SSH] Error:`, err.message)
        reject(err)
      })

      this.sshClient.connect({
        host: ssh_host, port: ssh_port,
        username: ssh_user, password: ssh_pass,
        readyTimeout: 10000,
      })
    })
  }

  // ── API HTTP Fusion (fallback) ─────────────────────────────
  async fetchFusion(tabla, cant) {
    const url = this.cfg.api_url
    if (!url) return null
    try {
      const { data } = await axios.get(url, {
        params: { tabla, cant: cant ?? this.cfg.cant_registros },
        timeout: 8000,
      })
      if (this.connectionMode !== 'pg') this.connectionMode = 'http'
      this.lastError = null
      if (Array.isArray(data) && Array.isArray(data[0])) return data[0]
      if (Array.isArray(data)) return data
      return []
    } catch (err) {
      console.error(`${this.tag}[Fusion HTTP] Error (${tabla}):`, err.message)
      this.lastError = err.message
      if (this.connectionMode !== 'pg') this.connectionMode = 'disconnected'
      return null
    }
  }

  // ── Sync ventas ────────────────────────────────────────────
  async syncVentas() {
    const empresaId = this.cfg.empresa_id
    const { data: ctrl } = await supabase
      .from('fusion_sync_control')
      .select('ultimo_id')
      .eq('empresa_id', empresaId)
      .eq('tabla_fusion', 'ssf_pump_sales')
      .single()

    const ultimoId = parseInt(ctrl?.ultimo_id || 0)
    let nuevas = []

    if (this.fusionPool) {
      try {
        const result = await this.fusionPool.query(`
          SELECT sale_id, end_date, end_time, pump_id, hose_id,
                 grade_id, volume, money, ppu, level, sale_type,
                 initial_volume, final_volume, start_date, start_time, preset_amount
          FROM ssf_pump_sales
          WHERE sale_id > $1
          ORDER BY sale_id ASC
          LIMIT $2
        `, [ultimoId, this.cfg.cant_registros])
        nuevas = result.rows
        console.log(`${this.tag}[Sync] PG → ultimoId=${ultimoId}, nuevas=${nuevas.length}`)
      } catch (err) {
        console.error(`${this.tag}[FusionPG] Error query, usando HTTP:`, err.message)
        this.lastError = err.message
        this.connectionMode = this.cfg.api_url ? 'http' : 'disconnected'
        this.fusionPool = null
      }
    }

    if (nuevas.length === 0 && !this.fusionPool) {
      const apiRows = await this.fetchFusion('ssf_pump_sales')
      if (!apiRows) return
      nuevas = apiRows.filter(r => parseInt(r.sale_id) > ultimoId)
      console.log(`${this.tag}[Sync] HTTP → ultimoId=${ultimoId}, nuevas=${nuevas.length}`)
    }

    if (nuevas.length === 0) return

    let importadas = 0
    for (const row of nuevas) {
      const { data, error } = await supabase.rpc('registrar_venta_combustible', {
        p_empresa_id:      empresaId,
        p_sale_id:         parseInt(row.sale_id),
        p_pump_id:         parseInt(row.pump_id),
        p_hose_id:         parseInt(row.hose_id),
        p_grade_id:        parseInt(row.grade_id),
        p_volume:          parseFloat(row.volume)         || 0,
        p_money:           parseFloat(row.money)          || 0,
        p_ppu:             parseFloat(row.ppu)            || 0,
        p_sale_type:       parseInt(row.sale_type)        || 1,
        p_start_at:        fusionDateTime(row.start_date, row.start_time),
        p_end_at:          fusionDateTime(row.end_date,   row.end_time),
        p_price_level:     parseInt(row.level)            || 1,
        p_initial_volume:  parseFloat(row.initial_volume) || null,
        p_final_volume:    parseFloat(row.final_volume)   || null,
        p_site_id:         null,
        p_preset_amount:   row.preset_amount && row.preset_amount !== '0'
                             ? parseFloat(row.preset_amount) : null,
      })

      if (error) {
        console.error(`${this.tag}[Sync] Error sale_id=${row.sale_id}:`, error.message)
      } else if (data?.[0]?.es_nueva) {
        importadas++
        broadcastRaw(empresaId, 'nueva_venta', {
          id:       data[0].venta_id,
          sale_id:  parseInt(row.sale_id),
          pump_id:  parseInt(row.pump_id),
          hose_id:  parseInt(row.hose_id),
          grade_id: parseInt(row.grade_id),
          volume:   parseFloat(row.volume),
          money:    parseFloat(row.money),
          ppu:      parseFloat(row.ppu),
          end_at:   fusionDateTime(row.end_date,   row.end_time),
          start_at: fusionDateTime(row.start_date, row.start_time),
        })
      }
    }

    // Actualizar control de sync directamente (no depender del RPC para avanzar el cursor)
    const maxSaleId = Math.max(...nuevas.map(r => parseInt(r.sale_id)))
    await supabase.from('fusion_sync_control').upsert(
      { empresa_id: empresaId, tabla_fusion: 'ssf_pump_sales',
        ultimo_id: maxSaleId, ultima_sync: new Date().toISOString() },
      { onConflict: 'empresa_id,tabla_fusion' }
    )

    if (importadas > 0) console.log(`${this.tag}[Sync] Ventas: ${importadas} importadas, cursor→${maxSaleId}`)
    else console.log(`${this.tag}[Sync] Ventas: 0 nuevas (ya existían), cursor→${maxSaleId}`)
  }

  // ── Sync tanques ───────────────────────────────────────────
  async syncTanques() {
    const rows = await this.fetchFusion('ssf_tank_actual_info')
    if (!rows || rows.length === 0) return

    const registros = rows.map(r => ({
      empresa_id:    this.cfg.empresa_id,
      tank_id:       parseInt(r.tank_id),
      prod_vol:      parseFloat(r.prod_vol)     || null,
      prod_height:   parseFloat(r.prod_height)  || null,
      water_vol:     parseFloat(r.water_vol)    > 0 ? parseFloat(r.water_vol)    : null,
      water_height:  parseFloat(r.water_height) > 0 ? parseFloat(r.water_height) : null,
      prod_temp:     parseFloat(r.prod_temp)    > -100 ? parseFloat(r.prod_temp) : null,
      tc_vol:        parseFloat(r.tc_vol)       || null,
      probe_status:  r.probe_status             || null,
      leido_at:      fusionDateTime(r.date_last_read, r.time_last_read),
      registrado_at: new Date().toISOString(),
    }))

    const { error } = await supabase
      .from('niveles_tanque')
      .upsert(registros, { onConflict: 'empresa_id,tank_id' })

    if (error) console.error(`${this.tag}[Sync] Error tanques:`, error.message)
    else broadcastRaw(this.cfg.empresa_id, 'niveles_tanque', registros)
  }

  // ── Sync alarmas ───────────────────────────────────────────
  async syncAlarmas() {
    const rows = await this.fetchFusion('ssf_alarm_status')
    if (!rows || rows.length === 0) return

    const alarmas = rows.map(r => ({
      empresa_id:       this.cfg.empresa_id,
      alarm_type:       r.alarm_type,
      location_type:    r.location_type,
      location_id:      String(r.location_id),
      alarm_status:     String(r.alarm_status),
      alarm_at:         fusionDateTime(r.alarm_date, r.alarm_time),
      severity:         r.severity,
      ack_user:         r.ack_user || null,
      ack_at:           fusionDateTime(r.ack_date, r.ack_time),
      last_modified_at: r.last_modified_date
        ? fusionDateTime(r.last_modified_date.slice(0,8), r.last_modified_date.slice(8))
        : null,
    }))

    await supabase
      .from('alarmas_fusion')
      .upsert(alarmas, { onConflict: 'empresa_id,alarm_type,location_type,location_id' })

    const activas = alarmas.filter(a => a.alarm_status !== '0')
    if (activas.length > 0) broadcastRaw(this.cfg.empresa_id, 'alarmas', activas)
  }

  // ── Sync turnos ────────────────────────────────────────────
  async syncTurnos() {
    const rows = await this.fetchFusion('ssf_addin_shifts_data')
    if (!rows || rows.length === 0) {
      console.log(`${this.tag}[Sync] Turnos: sin datos de Fusion`)
      return
    }

    const shifts = rows.filter(r => r.period_type === 'S')
    console.log(`${this.tag}[Sync] Turnos: ${rows.length} total, ${shifts.length} tipo S`)

    const turnos = rows.map(r => ({
      empresa_id:     this.cfg.empresa_id,
      period_type:    r.period_type,
      period_status:  r.perios_status || r.period_status,
      period_id:      parseInt(r.period_id),
      start_at:       fusionDateTime(r.period_start_date, r.period_start_time),
      end_at:         fusionDateTime(r.period_end_date,   r.period_end_time),
      start_trans_id: r.period_start_trans_id ? parseInt(r.period_start_trans_id) : null,
      end_trans_id:   r.period_end_trans_id   ? parseInt(r.period_end_trans_id)   : null,
    }))

    const { error } = await supabase
      .from('turnos_combustible')
      .upsert(turnos, { onConflict: 'empresa_id,period_type,period_id' })

    if (error) console.error(`${this.tag}[Sync] Error turnos:`, error.message)
  }

  // ── Sync pagos ─────────────────────────────────────────────
  async syncPagos() {
    let rows = []

    if (this.fusionPool) {
      try {
        const { data: ctrl } = await supabase
          .from('fusion_sync_control')
          .select('ultimo_id')
          .eq('empresa_id', this.cfg.empresa_id)
          .eq('tabla_fusion', 'ssf_addin_payments_data')
          .single()

        const ultimoId = parseInt(ctrl?.ultimo_id || 0)
        const result = await this.fusionPool.query(`
          SELECT * FROM ssf_addin_payments_data
          WHERE pay_sale_id > $1 ORDER BY pay_sale_id ASC LIMIT $2
        `, [ultimoId, this.cfg.cant_registros])
        rows = result.rows
        console.log(`${this.tag}[Sync] Pagos PG: ultimoId=${ultimoId}, filas=${rows.length}`)
      } catch (err) {
        console.error(`${this.tag}[FusionPG] Error pagos:`, err.message)
      }
    }

    if (rows.length === 0) {
      rows = await this.fetchFusion('ssf_addin_payments_data') || []
    }
    if (rows.length === 0) return

    const pagos = rows
      .filter(r => r.pay_sale_id && parseInt(r.pay_sale_id) > 0)
      .map(r => {
        const tipo = (r.pay_payment_type || r.pay_paymnet_type || r.pay_type || '').trim()
        return {
          empresa_id:   this.cfg.empresa_id,
          sale_id:      parseInt(r.pay_sale_id),
          payment_type: tipo || 'CASH',
          payment_info: (r.pay_payment_info || r.pay_info || '').trim() || null,
        }
      })

    if (pagos.length === 0) return

    const { error } = await supabase
      .from('pagos_combustible')
      .upsert(pagos, { onConflict: 'empresa_id,sale_id' })

    if (error) {
      console.error(`${this.tag}[Sync] Error pagos:`, error.message)
    } else {
      const maxSaleId = Math.max(...pagos.map(p => p.sale_id))
      await supabase.from('fusion_sync_control').upsert(
        { empresa_id: this.cfg.empresa_id, tabla_fusion: 'ssf_addin_payments_data',
          ultimo_id: maxSaleId, ultima_sync: new Date().toISOString() },
        { onConflict: 'empresa_id,tabla_fusion' }
      )
      console.log(`${this.tag}[Sync] Pagos: ${pagos.length} sincronizados`)
    }
  }

  // ── Sync pisteros ──────────────────────────────────────────
  async syncPisteros() {
    let headers = [], detalles = []

    if (this.fusionPool) {
      try {
        const { data: ctrl } = await supabase
          .from('fusion_sync_control')
          .select('ultimo_id')
          .eq('empresa_id', this.cfg.empresa_id)
          .eq('tabla_fusion', 'ssf_tkt_trx_header')
          .single()

        const ultimoTktId = parseInt(ctrl?.ultimo_id || 0)

        const hResult = await this.fusionPool.query(`
          SELECT tkt_trans_id, tkt_attendant_id, tkt_date, tkt_time, tkt_type,
                 tkt_customer_name, tkt_customer_tax_id, tkt_net_amount, tkt_total_amount
          FROM ssf_tkt_trx_header
          WHERE tkt_trans_id > $1 ORDER BY tkt_trans_id ASC LIMIT $2
        `, [ultimoTktId, this.cfg.cant_registros])
        headers = hResult.rows

        if (headers.length > 0) {
          const tktIds = headers.map(h => parseInt(h.tkt_trans_id))
          const dResult = await this.fusionPool.query(`
            SELECT tkt_trans_id, tkt_spirit_sale_id
            FROM ssf_tkt_trx_detail
            WHERE tkt_trans_id = ANY($1::int[]) AND tkt_spirit_sale_id > 0
          `, [tktIds])
          detalles = dResult.rows
        }
        console.log(`${this.tag}[Sync] Pisteros PG: ${headers.length} headers, ${detalles.length} con sale_id`)
      } catch (err) {
        console.error(`${this.tag}[FusionPG] Error pisteros:`, err.message)
        this.fusionPool = null
      }
    }

    if (!this.fusionPool && detalles.length === 0) {
      detalles = await this.fetchFusion('ssf_tkt_trx_detail') || []
      headers  = await this.fetchFusion('ssf_tkt_trx_header') || []
    }

    if (headers.length === 0 || detalles.length === 0) return

    const hdrMap = {}
    headers.forEach(h => { hdrMap[String(h.tkt_trans_id)] = h })

    const registros = detalles
      .filter(d => d.tkt_spirit_sale_id && parseInt(d.tkt_spirit_sale_id) > 0)
      .map(d => {
        const h = hdrMap[String(d.tkt_trans_id)] || {}
        return {
          empresa_id:      this.cfg.empresa_id,
          tkt_trans_id:    parseInt(d.tkt_trans_id),
          sale_id:         parseInt(d.tkt_spirit_sale_id),
          attendant_id:    h.tkt_attendant_id || null,
          tkt_date:        h.tkt_date ? fusionDateTime(String(h.tkt_date), '000000')?.slice(0, 10) : null,
          tkt_time:        h.tkt_time || null,
          tkt_type:        h.tkt_type || null,
          customer_name:   h.tkt_customer_name   || null,
          customer_tax_id: h.tkt_customer_tax_id || null,
          net_amount:      parseFloat(h.tkt_net_amount   || 0) || null,
          total_amount:    parseFloat(h.tkt_total_amount || 0) || null,
        }
      })

    if (registros.length === 0) return

    const { error } = await supabase
      .from('tkt_ventas_combustible')
      .upsert(registros, { onConflict: 'empresa_id,tkt_trans_id' })

    if (error) {
      console.error(`${this.tag}[Sync] Error pisteros:`, error.message)
    } else {
      const maxTktId = Math.max(...registros.map(r => r.tkt_trans_id))
      await supabase.from('fusion_sync_control').upsert(
        { empresa_id: this.cfg.empresa_id, tabla_fusion: 'ssf_tkt_trx_header',
          ultimo_id: maxTktId, ultima_sync: new Date().toISOString() },
        { onConflict: 'empresa_id,tabla_fusion' }
      )
      console.log(`${this.tag}[Sync] Pisteros: ${registros.length} tickets`)
    }
  }

  // ── Ciclo principal ────────────────────────────────────────
  async runSyncCycle() {
    if (this.syncRunning) return
    this.syncRunning = true
    this.lastSyncAt = new Date().toISOString()
    try {
      // Mantener Supabase al dia porque el dashboard y facturacion
      // consumen ventas/pagos/pisteros desde estas tablas sincronizadas.
      await this.syncTurnos()
      await this.syncVentas()
      await this.syncPagos()
      await this.syncPisteros()
      await Promise.all([this.syncTanques(), this.syncAlarmas()])
      this.lastSyncOkAt = new Date().toISOString()
      this.lastError = null
    } catch (err) {
      console.error(`${this.tag}[Sync] Error en ciclo:`, err.message)
      this.lastError = err.message
    } finally {
      this.syncRunning = false
    }
  }

  getStatus() {
    const hasRecentSync = !!this.lastSyncOkAt
    return {
      running: !!this.intervalHandle,
      sync_running: this.syncRunning,
      connection_mode: this.connectionMode,
      active_tunnel_port: this.activeTunnelPort,
      healthy: !!this.intervalHandle && (hasRecentSync || this.connectionMode === 'http' || this.connectionMode === 'pg'),
      last_error: this.lastError,
      last_sync_at: this.lastSyncAt,
      last_sync_ok_at: this.lastSyncOkAt,
    }
  }

  // ── Ciclo de diagnóstico (datos crudos de Fusion) ─────────
  async getDiagnostico() {
    const resultado = {}
    const eid = this.cfg.empresa_id

    const [rVentas, rPagos, rPisteros, rTurnos] = await Promise.all([
      supabase.from('ventas_combustible').select('sale_id,pump_id,end_at,turno_id')
        .eq('empresa_id', eid).order('sale_id', { ascending: false }).limit(5),
      supabase.from('pagos_combustible').select('sale_id,payment_type')
        .eq('empresa_id', eid).order('sale_id', { ascending: false }).limit(5),
      supabase.from('tkt_ventas_combustible').select('tkt_trans_id,sale_id,attendant_id,tkt_date')
        .eq('empresa_id', eid).order('tkt_trans_id', { ascending: false }).limit(5),
      supabase.from('turnos_combustible').select('period_id,period_type,period_status,start_trans_id,end_trans_id')
        .eq('empresa_id', eid).eq('period_type', 'S').order('period_id', { ascending: false }).limit(5),
    ])

    resultado.ultimas_ventas_supabase = rVentas.data
    resultado.pagos_supabase          = rPagos.data
    resultado.pisteros_supabase       = rPisteros.data
    resultado.turnos_supabase         = rTurnos.data

    if (this.fusionPool) {
      try {
        const [rP, rKhd, rKdt] = await Promise.all([
          this.fusionPool.query('SELECT * FROM ssf_addin_payments_data ORDER BY pay_sale_id DESC LIMIT 3'),
          this.fusionPool.query('SELECT tkt_trans_id, tkt_attendant_id, tkt_date FROM ssf_tkt_trx_header ORDER BY tkt_trans_id DESC LIMIT 3'),
          this.fusionPool.query('SELECT tkt_trans_id, tkt_spirit_sale_id FROM ssf_tkt_trx_detail WHERE tkt_spirit_sale_id > 0 ORDER BY tkt_trans_id DESC LIMIT 3'),
        ])
        resultado.fusion_pg = { pagos_recientes: rP.rows, khd_recientes: rKhd.rows, kdt_recientes: rKdt.rows }
      } catch (err) {
        resultado.fusion_pg_error = err.message
      }
    } else {
      resultado.fusion_pg = 'Túnel SSH no disponible'
      const [pagosHttp, khdHttp] = await Promise.all([
        this.fetchFusion('ssf_addin_payments_data', 3),
        this.fetchFusion('ssf_tkt_trx_header', 3),
      ])
      resultado.fusion_http = { pagos: pagosHttp, khd: khdHttp }
    }

    return resultado
  }

  // ── Inicio / parada ────────────────────────────────────────
  async start() {
    console.log(`${this.tag}[Fusion Sync] Iniciando polling cada ${this.cfg.poll_interval_ms / 1000}s`)
    this.connectionMode = 'disconnected'
    this.lastError = null
    try { await this.createSshTunnel() } catch (err) {
      this.connectionMode = this.cfg.api_url ? 'http' : 'disconnected'
      this.lastError = err?.message || 'Error desconocido al crear túnel SSH'
      console.error(`${this.tag}[SSH] Túnel falló: ${this.lastError}. Usando API HTTP como fallback`)
    }
    this.runSyncCycle()
    this.intervalHandle = setInterval(() => this.runSyncCycle(), this.cfg.poll_interval_ms)
  }

  stop() {
    if (this.intervalHandle) { clearInterval(this.intervalHandle); this.intervalHandle = null }
    if (this.fusionPool)     { this.fusionPool.end().catch(() => {}); this.fusionPool = null }
    if (this.tunnelServer)   { this.tunnelServer.close(); this.tunnelServer = null }
    if (this.sshClient)      { this.sshClient.end(); this.sshClient = null }
    this.activeTunnelPort = null
    this.connectionMode = 'disconnected'
    console.log(`${this.tag}[Fusion Sync] Detenido`)
  }
}

// ─── FusionManager ────────────────────────────────────────────
class FusionManager {
  constructor() {
    this.instances = new Map() // empresaId -> FusionInstance
  }

  /**
   * Lee fusion_config de Supabase y arranca una instancia por cada fila activa.
   * Si no hay filas (instalación nueva), intenta seed desde .env para empresa_id=1.
   */
  async loadFromDB(options = {}) {
    const empresaIds = Array.isArray(options.empresaIds)
      ? options.empresaIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      : []

    const { data: configs, error } = await supabase
      .from('fusion_config')
      .select('*')
      .eq('activo', true)

    if (error) {
      console.error('[FusionManager] Error leyendo fusion_config:', error.message)
    }

    let rows = configs || []

    if (empresaIds.length > 0) {
      rows = rows.filter((row) => empresaIds.includes(Number(row.empresa_id)))
    }

    // Compatibilidad: si no hay ninguna config, crear una desde .env
    if (rows.length === 0 && process.env.FUSION_SSH_HOST) {
      const envCfg = this._cfgFromEnv()
      const envEmpresaId = Number(envCfg.empresa_id)
      if (empresaIds.length === 0 || empresaIds.includes(envEmpresaId)) {
        console.log('[FusionManager] No hay fusion_config en BD, usando variables de entorno para empresa_id=' + envCfg.empresa_id)
        rows = [envCfg]
        // Intentar persistir para que futuras recargas no depandan de .env
        supabase.from('fusion_config').insert(envCfg).then(({ error: e }) => {
          if (e) console.warn('[FusionManager] No se pudo persistir config desde .env:', e.message)
          else   console.log('[FusionManager] Config desde .env guardada en fusion_config')
        })
      }
    }

    for (const cfg of rows) {
      await this.startInstance(cfg)
    }
  }

  _cfgFromEnv() {
    return {
      empresa_id:       parseInt(process.env.EMPRESA_ID || '1'),
      ssh_host:         process.env.FUSION_SSH_HOST || '168.228.51.221',
      ssh_port:         parseInt(process.env.FUSION_SSH_PORT || '22'),
      ssh_user:         process.env.FUSION_SSH_USER || 'mant',
      ssh_pass:         process.env.FUSION_SSH_PASS || 'mant',
      pg_db:            process.env.FUSION_PG_DB    || 'smartshipdb',
      pg_user:          process.env.FUSION_PG_USER  || 'ssfdbuser',
      pg_pass:          process.env.FUSION_PG_PASSWORD || 'smartshipfactory',
      tunnel_port:      parseInt(process.env.FUSION_TUNNEL_PORT || '15432'),
      api_url:          process.env.FUSION_API_URL  || null,
      poll_interval_ms: parseInt(process.env.POLL_INTERVAL_MS  || '15000'),
      cant_registros:   parseInt(process.env.FUSION_CANT       || '500'),
    }
  }

  async startInstance(cfg) {
    if (this.instances.has(cfg.empresa_id)) {
      this.instances.get(cfg.empresa_id).stop()
    }
    const inst = new FusionInstance(cfg)
    this.instances.set(cfg.empresa_id, inst)
    await inst.start()
  }

  stopInstance(empresaId) {
    const inst = this.instances.get(empresaId)
    if (inst) { inst.stop(); this.instances.delete(empresaId) }
  }

  getInstance(empresaId) {
    return this.instances.get(empresaId)
  }

  getAll() {
    return [...this.instances.values()]
  }

  stopAll() {
    for (const empresaId of [...this.instances.keys()]) {
      this.stopInstance(empresaId)
    }
  }
}

export const manager = new FusionManager()

// ─── Exported helpers (backwards-compat con index.js) ─────────
export async function startSyncScheduler(options = {}) {
  await manager.loadFromDB(options)
}

async function ensureInstanceForEmpresa(empresaId) {
  const empresaIdNum = Number(empresaId)
  if (!Number.isFinite(empresaIdNum) || empresaIdNum <= 0) return null

  const existing = manager.getInstance(empresaIdNum)
  if (existing) return existing

  const { data: cfg, error } = await supabase
    .from('fusion_config')
    .select('*')
    .eq('empresa_id', empresaIdNum)
    .eq('activo', true)
    .maybeSingle()

  if (error) {
    console.warn(`[FusionManager] No se pudo cargar fusion_config para empresa_id=${empresaIdNum}:`, error.message)
    return null
  }

  if (!cfg) return null

  try {
    await manager.startInstance(cfg)
    return manager.getInstance(empresaIdNum) || null
  } catch (err) {
    console.warn(`[FusionManager] No se pudo iniciar Fusion para empresa_id=${empresaIdNum}:`, err?.message || err)
    return null
  }
}

// ─── REST endpoints: combustible ──────────────────────────────
export const fusionRouter = express.Router()

fusionRouter.get('/ventas', async (req, res) => {
  const { fecha, empresa_id, pump_id } = req.query
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })
  const ctx = await requirePermission(req, res, Number(empresa_id), 'combustible:ver')
  if (!ctx) return

  let query = supabase
    .from('ventas_combustible')
    .select('*')
    .eq('empresa_id', empresa_id)
    .order('end_at', { ascending: false })
    .limit(200)

  if (fecha) {
    const range = costaRicaDayRangeUtc(fecha)
    if (range) {
      query = query.gte('end_at', range.desde).lt('end_at', range.hasta)
    }
  }
  if (pump_id) query = query.eq('pump_id', pump_id)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

fusionRouter.get('/tanques', async (req, res) => {
  const { empresa_id } = req.query
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })
  const ctx = await requirePermission(req, res, Number(empresa_id), 'combustible:ver')
  if (!ctx) return
  const { data, error } = await supabase
    .from('v_niveles_tanque_actual')
    .select('*')
    .eq('empresa_id', empresa_id)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

fusionRouter.get('/status', async (req, res) => {
  const { empresa_id } = req.query
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })
  const ctx = await requirePermission(req, res, Number(empresa_id), 'combustible:ver')
  if (!ctx) return

  const empresaIdNum = parseInt(String(empresa_id), 10)
  const inst = await ensureInstanceForEmpresa(empresaIdNum)
  if (!inst) {
    return res.json({
      ok: true,
      empresa_id: empresaIdNum,
      ...serializeInstanceStatus(null),
    })
  }

  res.json({
    ok: true,
    empresa_id: empresaIdNum,
    ...serializeInstanceStatus(inst),
  })
})

fusionRouter.get('/resumen-dia', async (req, res) => {
  const { empresa_id } = req.query
  const fecha = String(req.query.fecha || currentCostaRicaDateYmd())
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })
  const ctx = await requirePermission(req, res, Number(empresa_id), 'combustible:ver')
  if (!ctx) return
  const { data, error } = await supabase
    .from('v_ventas_dia')
    .select('*')
    .eq('empresa_id', empresa_id)
    .eq('fecha', fecha)
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

fusionRouter.post('/sync-now', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return
  const { empresa_id } = req.body
  if (empresa_id) {
    const inst = manager.getInstance(parseInt(empresa_id))
    if (!inst) return res.status(404).json({ error: 'No hay instancia activa para esa empresa' })
    inst.runSyncCycle()
  } else {
    manager.getAll().forEach(inst => inst.runSyncCycle())
  }
  res.json({ ok: true, message: 'Sync iniciado' })
})

fusionRouter.get('/diagnostico', async (req, res) => {
  const { empresa_id } = req.query
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id requerido' })
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return
  const inst = manager.getInstance(parseInt(empresa_id))
  if (!inst) return res.status(404).json({ error: 'No hay instancia activa para esa empresa' })
  const resultado = await inst.getDiagnostico()
  res.json(resultado)
})

// Busca el sale_id mínimo a partir de una fecha en Fusion PG
// GET /api/combustible/sale-id-desde?empresa_id=4&fecha=20260101
fusionRouter.get('/sale-id-desde', async (req, res) => {
  const { empresa_id, fecha } = req.query
  if (!empresa_id || !fecha) return res.status(400).json({ error: 'empresa_id y fecha (YYYYMMDD) requeridos' })
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return
  const inst = manager.getInstance(parseInt(empresa_id))
  if (!inst) return res.status(404).json({ error: 'No hay instancia activa para esa empresa' })
  if (!inst.fusionPool) return res.status(503).json({ error: 'Túnel SSH no disponible para esta empresa' })
  try {
    const result = await inst.fusionPool.query(
      `SELECT MIN(sale_id) - 1 AS ultimo_id FROM ssf_pump_sales WHERE end_date >= $1`,
      [String(fecha)]
    )
    const ultimoId = result.rows[0]?.ultimo_id ?? null
    res.json({ fecha, ultimo_id: ultimoId })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
