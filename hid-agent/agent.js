// ============================================================
// MYA HID Agent — Agente lector de brazaletes por pista
//
// Modo STDIN  (MODO=stdin):  lector teclado USB, una sola bomba.
//             Requiere que esta ventana tenga foco al leer.
//
// Modo SERIAL (MODO=serial): lectores USB-serial (CH340/CP2102).
//             Soporta Cara A y Cara B independientes.
//             Requiere: npm install serialport
// ============================================================

import 'dotenv/config'
import { createInterface } from 'readline'

const API_URL      = process.env.API_URL      || 'http://localhost:3001'
const AGENT_SECRET = process.env.AGENT_SECRET || ''
const EMPRESA_ID   = Number(process.env.EMPRESA_ID || 4)
const PISTA        = process.env.PISTA        || '?'
const MODO         = process.env.MODO         || 'stdin'

// ── Reporte al servidor ───────────────────────────────────

async function reportarLectura(pump_id, uid) {
  try {
    const resp = await fetch(`${API_URL}/api/brazaletes/lectura`, {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        'Authorization': `Agent ${AGENT_SECRET}`,
      },
      body: JSON.stringify({ empresa_id: EMPRESA_ID, pump_id, uid }),
    })
    const data = await resp.json()
    if (data.ok) {
      console.log(`[Pista ${PISTA}] ✓ Bomba ${pump_id} → ${data.operador_nombre}`)
    } else {
      console.warn(`[Pista ${PISTA}] ✗ Bomba ${pump_id} uid=${uid}: ${data.error}`)
    }
  } catch (err) {
    console.error(`[Pista ${PISTA}] Error de red:`, err.message)
  }
}

// ── Modo STDIN ────────────────────────────────────────────

function iniciarStdin() {
  const pump_id = Number(process.env.PUMP_A_ID || 1)
  console.log(`  Bomba:    ${pump_id}`)
  console.log(`  ⚠ Modo stdin: esta ventana debe tener foco al leer`)
  console.log(`═══════════════════════════════════════\n`)

  const rl = createInterface({ input: process.stdin })
  rl.on('line', (line) => {
    const uid = line.trim()
    if (!uid) return
    console.log(`[Pista ${PISTA}] Lectura → ${uid}`)
    void reportarLectura(pump_id, uid)
  })
}

// ── Modo SERIAL ───────────────────────────────────────────

async function iniciarSerial() {
  const { SerialPort } = await import('serialport')
  const { ReadlineParser } = await import('@serialport/parser-readline')

  const LECTORES = [
    { puerto: process.env.PUMP_A_PORT, pump_id: Number(process.env.PUMP_A_ID), cara: 'A' },
    { puerto: process.env.PUMP_B_PORT, pump_id: Number(process.env.PUMP_B_ID), cara: 'B' },
  ].filter(l => l.puerto && l.pump_id)

  if (!LECTORES.length) {
    console.error('ERROR: Configure PUMP_A_PORT y PUMP_A_ID en .env')
    process.exit(1)
  }

  const BAUD = Number(process.env.SERIAL_BAUD || 9600)

  for (const { puerto, pump_id, cara } of LECTORES) {
    console.log(`  Cara ${cara}: ${puerto} → Bomba ${pump_id}`)
  }
  console.log(`═══════════════════════════════════════\n`)

  for (const { puerto, pump_id, cara } of LECTORES) {
    function conectar() {
      try {
        const port = new SerialPort({ path: puerto, baudRate: BAUD, autoOpen: true })
        const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }))

        port.on('open', () =>
          console.log(`[Pista ${PISTA}] Cara ${cara} conectada (${puerto}) → Bomba ${pump_id}`)
        )
        port.on('error', (err) => {
          console.warn(`[Pista ${PISTA}] Cara ${cara} error: ${err.message} — reconectando en 5s`)
          setTimeout(conectar, 5000)
        })
        parser.on('data', (line) => {
          const uid = line.trim()
          if (!uid) return
          console.log(`[Pista ${PISTA}] Cara ${cara} → ${uid}`)
          void reportarLectura(pump_id, uid)
        })
      } catch {
        console.warn(`[Pista ${PISTA}] Cara ${cara} no disponible (${puerto}) — reintentando en 5s`)
        setTimeout(conectar, 5000)
      }
    }
    conectar()
  }
}

// ── Inicio ────────────────────────────────────────────────

console.log(`\n═══════════════════════════════════════`)
console.log(`  MYA HID Agent — Pista ${PISTA}`)
console.log(`  Servidor: ${API_URL}`)
console.log(`  Empresa:  ${EMPRESA_ID}`)
console.log(`  Modo:     ${MODO}`)

if (MODO === 'serial') {
  iniciarSerial()
} else {
  iniciarStdin()
}
