import os from 'os'
import fs from 'fs'
import { spawn } from 'child_process'
import express from 'express'
import { requireSuperuser } from '../lib/authz.js'

export const vpsMonitorRouter = express.Router()

function runCapture(cmd, args = []) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { out += d.toString() })
    child.on('error', () => resolve(null))
    child.on('close', () => resolve(out.trim()))
  })
}

function parseDf(dfOut) {
  if (!dfOut) return { total: '', used: '', free: '', pct: 0 }
  const lines = dfOut.split('\n')
  const dataLine = lines.find((l) => /^\//.test(l.trim())) || lines[1] || ''
  const parts = dataLine.trim().split(/\s+/)
  if (parts.length < 5) return { total: '', used: '', free: '', pct: 0 }
  const pctStr = parts[4].replace('%', '')
  return {
    total: parts[1],
    used: parts[2],
    free: parts[3],
    pct: parseInt(pctStr, 10) || 0,
  }
}

vpsMonitorRouter.get('/stats', async (req, res) => {
  const ctx = await requireSuperuser(req, res)
  if (!ctx) return

  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const loadAvg = os.loadavg()
  const cpuCount = os.cpus().length
  const sysUptime = os.uptime()
  const procUptime = process.uptime()
  const procMem = process.memoryUsage()

  const [dfOut, pm2Out] = await Promise.all([
    runCapture('df', ['-h', '/']),
    runCapture('pm2', ['jlist']),
  ])

  const disk = parseDf(dfOut)

  let pm2Processes = []
  if (pm2Out) {
    try {
      pm2Processes = JSON.parse(pm2Out).map((p) => ({
        name: p.name,
        pid: p.pid,
        status: p.pm2_env?.status || 'unknown',
        pm_uptime: p.pm2_env?.pm_uptime || 0,
        restarts: p.pm2_env?.restart_time ?? 0,
        cpu: p.monit?.cpu ?? 0,
        mem: p.monit?.memory ?? 0,
      }))
    } catch {}
  }

  // Leer últimas líneas del log de errores
  const pm2Home = process.env.PM2_HOME || (os.homedir() + '/.pm2')
  const errorLogPath = `${pm2Home}/logs/mya-api-error.log`
  let recentErrors = []
  try {
    if (fs.existsSync(errorLogPath)) {
      const tailOut = await runCapture('tail', ['-n', '30', errorLogPath])
      if (tailOut) {
        recentErrors = tailOut.split('\n').filter(Boolean)
      }
    }
  } catch {}

  // Últimas líneas del log de salida (sin ruido de sync)
  const outLogPath = `${pm2Home}/logs/mya-api-out.log`
  let recentOut = []
  try {
    if (fs.existsSync(outLogPath)) {
      const tailOut = await runCapture('tail', ['-n', '20', outLogPath])
      if (tailOut) {
        recentOut = tailOut.split('\n').filter((l) => Boolean(l) && !/\[E\d+\]\[Sync\]/.test(l))
      }
    }
  } catch {}

  res.json({
    ok: true,
    ts: new Date().toISOString(),
    system: {
      total_mem: totalMem,
      free_mem: freeMem,
      used_mem: usedMem,
      mem_pct: Math.round((usedMem / totalMem) * 100),
      load_avg: loadAvg,
      cpu_count: cpuCount,
      sys_uptime: sysUptime,
    },
    process: {
      uptime: procUptime,
      rss: procMem.rss,
      heap_used: procMem.heapUsed,
      heap_total: procMem.heapTotal,
    },
    disk,
    pm2: pm2Processes,
    errors: recentErrors,
    out: recentOut,
  })
})
