// ============================================================
// MYA ERP — Fusion Sync Server
// Entry point: server/index.js
// ============================================================

import express from 'express'
import http    from 'http'
import cors    from 'cors'
import dotenv  from 'dotenv'
import fs      from 'fs'
import path    from 'path'
import { fileURLToPath } from 'url'
import { fusionRouter, startSyncScheduler, attachWebSocket, broadcastRaw } from './services/fusionSync.js'
import { fusionConfigRouter } from './routes/fusionConfig.js'
import { pumpRouter, startPumpMonitor, setPumpBroadcast, setPumpSaleEndHook } from './services/pumpStatus.js'
import { listar, crear, actualizar, eliminar, probar, descargarSSE as descargarSSECuenta } from './routes/cuentasCorreo.js';
import { estadoAuth, iniciarAuth, descargar, descargarSSE, verArchivo, abrirCarpeta, procesarXML } from './routes/correo.js';
import { prepararContabilizacion, confirmarContabilizacion, setLineaInventario, setTodasLineasInventario, crearProductoDesdeLinea, revertirContabilizacion, confirmarBatch, ivaReporte } from './routes/contabilizacion.js';
import { buscarCabys } from './routes/cabys.js';
import { backfillExoneracion } from './routes/backfill.js';
import { consultarExoneracionMh } from './routes/facturacionMh.js';
import { guardarCertificadoEmisor, guardarCredencialesEmisor } from './routes/facturacionEmisor.js';
import { emitirDocumento, backfillFacturasCreditoCxc, consultarEstadoDocumento, descargarXml, reenviarCorreoDocumento, reEmitirSubsanado, importarFee } from './routes/facturacionEmitir.js';
import { getTerminales, crearTerminal, actualizarTerminal, eliminarTerminal } from './routes/facturacionTerminales.js';
import { authLogin, authPermisos, authResetPassword, authUpdateUser, authSelectEmpresa } from './routes/auth.js';
import { getEmpresaModulos, setEmpresaModulos, clearEmpresaModulos } from './routes/empresas.js';
import { enviarGuiaEmail } from './routes/emailEmpacadora.js';
import { startFeConsultaCron } from './services/feConsultaCron.js';
import { startCierreTurnoCron } from './services/cierreTurnoCron.js'
import { brazaletesRouter, setBrazoleteBroadcast } from './routes/brazaletes.js'
import { pistaPageRouter, pistaApiRouter, setPistaBroadcast } from './routes/pista.js'
import { startHidReaderMonitor, setHidBroadcast } from './services/hidReaderMonitor.js';
import { fusionDirectRouter } from './routes/fusionDirect.js';
import { frontendDeployRouter } from './routes/frontendDeploy.js';
import { vpsMonitorRouter } from './routes/vpsMonitor.js';
import { posRouter } from './routes/pos.js';
import planillaRouter from './routes/planilla.js';
import { consolaFusionRouter } from './routes/consolaFusion.js';
import { consolaCatalogosRouter } from './routes/consolaCatalogos.js';
import { virRouter, startVirMonitor, setVirBroadcast, finalizarSesionPump } from './services/virMonitor.js';
import { adminSb, getModulosEfectivosEmpresa } from './lib/authz.js';



process.on('uncaughtException',  (err)    => console.error('[Server] Error no capturado:', err.message))
process.on('unhandledRejection', (reason) => console.error('[Server] Promise rechazada:', reason?.message || reason))

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const RUNTIME_PORT_FILE = path.resolve(__dirname, '../tmp/dev-api-port.txt')

const app    = express()
const server = http.createServer(app)
const DEFAULT_PORT = Number(process.env.PORT || 3001)
let activePort = DEFAULT_PORT
const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005',
  'http://localhost:3006',
  'https://app.visionzn.net',
  'https://empacadora.visionzn.net',
  'https://consola.visionzn.net',
  'https://api.visionzn.net',
  'https://pos.visionzn.net',
  'https://pos-mya.visionzn.net',
])

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true)
      return
    }
    // Permitir cualquier origen en el mismo puerto del servidor (PWA pista)
    const serverPort = String(process.env.PORT || 3001)
    if (origin.endsWith(`:${serverPort}`)) {
      callback(null, true)
      return
    }
    callback(new Error(`Origen no permitido por CORS: ${origin}`))
  },
}));
app.use(express.json({ limit: '2mb' }));

app.get('/api/correo/estado', estadoAuth);
app.get('/api/correo/iniciar-auth', iniciarAuth);
app.post('/api/correo/descargar', descargar);

app.use(express.json({ limit: '2mb' }))
app.use('/api/combustible', fusionRouter)
app.use('/api/combustible', pumpRouter)
app.use('/api/combustible/config', fusionConfigRouter)
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }))
app.get('/api/runtime', (_req, res) => res.json({ ok: true, port: activePort }))
app.get('/api/correo/descargar-sse', descargarSSE);
app.get('/api/correo/archivo', verArchivo);

app.get('/api/cuentas-correo', listar);
app.post('/api/cuentas-correo', crear);
app.put('/api/cuentas-correo/:id', actualizar);
app.delete('/api/cuentas-correo/:id', eliminar);
app.post('/api/cuentas-correo/:id/probar', probar);
app.get('/api/cuentas-correo/:id/descargar-sse', descargarSSECuenta);
app.get('/api/correo/abrir-carpeta', abrirCarpeta);
app.post('/api/correo/procesar-xml/:id', procesarXML);
app.get('/api/cabys', buscarCabys);
app.get('/api/facturacion/exoneracion', consultarExoneracionMh);
app.post('/api/facturacion/emisor/certificado', guardarCertificadoEmisor);
app.post('/api/facturacion/emisor/credenciales', guardarCredencialesEmisor);
app.post('/api/facturacion/emitir/:id', emitirDocumento);
app.post('/api/facturacion/backfill-cxc', backfillFacturasCreditoCxc);
app.get('/api/facturacion/estado/:id', consultarEstadoDocumento);
app.get('/api/facturacion/xml/:id', descargarXml);
app.post('/api/facturacion/reenviar/:id', reenviarCorreoDocumento);
app.post('/api/facturacion/re-emitir/:id', reEmitirSubsanado);
app.post('/api/facturacion/importar-fee', importarFee);
app.get('/api/facturacion/terminales', getTerminales);
app.post('/api/facturacion/terminales', crearTerminal);
app.put('/api/facturacion/terminales/:id', actualizarTerminal);
app.delete('/api/facturacion/terminales/:id', eliminarTerminal);
app.post('/api/auth/login', authLogin);
app.post('/api/auth/select-empresa', authSelectEmpresa);
app.get('/api/auth/permisos', authPermisos);
app.post('/api/auth/reset-password', authResetPassword);
app.put('/api/auth/update-user/:id', authUpdateUser);
app.get('/api/empresas/:id/modulos', getEmpresaModulos);
app.post('/api/empresas/:id/modulos', setEmpresaModulos);
app.delete('/api/empresas/:id/modulos', clearEmpresaModulos);
app.get('/api/contabilizar/:id/preparar', prepararContabilizacion);
app.post('/api/contabilizar/:id/confirmar', confirmarContabilizacion);
app.put('/api/contabilizar/linea/:lineaId/a-inventario', setLineaInventario);
app.put('/api/contabilizar/comprobante/:comprobanteId/lineas/a-inventario', setTodasLineasInventario);
app.post('/api/contabilizar/linea/:lineaId/crear-producto', crearProductoDesdeLinea);
app.post('/api/contabilizar/:id/revertir', revertirContabilizacion);
app.post('/api/contabilizar/batch/confirmar', confirmarBatch);
app.get('/api/contabilizar/iva-reporte', ivaReporte);
app.post('/api/backfill/exoneracion', backfillExoneracion);
app.post('/api/empacadora/email/guia', enviarGuiaEmail);
app.use('/api/fusion', fusionDirectRouter);
app.use('/api/consola/fusion', consolaFusionRouter);
app.use('/api/consola/catalogos', consolaCatalogosRouter);
app.use('/api/consola/pisteros', virRouter);
app.use('/api/admin/frontend-deploy', frontendDeployRouter)
app.use('/api/admin/vps-monitor', vpsMonitorRouter)
app.use('/api/pos', posRouter)
app.use('/api/planilla', planillaRouter)
app.use('/api/brazaletes', brazaletesRouter)
app.options('/api/pista/*', cors({ origin: true, credentials: false }))
app.use('/api/pista', cors({ origin: true, credentials: false }), pistaApiRouter)
app.use('/pista', pistaPageRouter)

let startupDone = false
let shuttingDown = false

async function empresaTieneModuloCombustible() {
  const empresaId = Number(process.env.EMPRESA_ID || 0)
  if (!empresaId) return false

  try {
    const sb = adminSb()
    const { data: modulo, error: moduloErr } = await sb
      .from('modulos')
      .select('id')
      .eq('codigo', 'combustible')
      .maybeSingle()

    if (moduloErr) {
      console.warn('[MYA Server] No se pudo consultar el modulo combustible:', moduloErr.message)
      return false
    }

    if (!modulo?.id) {
      console.warn('[MYA Server] Modulo combustible no encontrado en catalogo. Se omite Fusion/PumpStatus.')
      return false
    }

    const modulosEmpresa = await getModulosEfectivosEmpresa(sb, empresaId)
    return modulosEmpresa.includes(Number(modulo.id))
  } catch (err) {
    console.warn('[MYA Server] No se pudo validar modulos efectivos de la empresa:', err.message)
    return false
  }
}

async function hayFusionConfigActiva() {
  try {
    const sb = adminSb()
    const empresaId = Number(process.env.EMPRESA_ID || 0)

    let query = sb
      .from('fusion_config')
      .select('id', { count: 'exact', head: true })
      .eq('activo', true)

    // Si hay EMPRESA_ID definido, solo buscar config de esa empresa
    if (empresaId > 0) {
      query = query.eq('empresa_id', empresaId)
    }

    const { count, error } = await query

    if (error) {
      console.warn('[MYA Server] No se pudo consultar fusion_config activa:', error.message)
      return false
    }

    return Number(count || 0) > 0
  } catch (err) {
    console.warn('[MYA Server] No se pudo validar fusion_config activa:', err.message)
    return false
  }
}

async function onServerReadyLegacyUnused() {
  if (startupDone) return
  startupDone = true
  try {
    fs.mkdirSync(path.dirname(RUNTIME_PORT_FILE), { recursive: true })
    fs.writeFileSync(RUNTIME_PORT_FILE, String(activePort), 'utf8')
  } catch (err) {
    console.warn('[MYA Server] No se pudo escribir el puerto runtime:', err.message)
  }
  console.log(`[MYA Server] Corriendo en http://localhost:${activePort}`)
  console.log(`[MYA Server] FUSION_API_URL: ${process.env.FUSION_API_URL}`)
  console.log(`[MYA Server] EMPRESA_ID: ${process.env.EMPRESA_ID}`)

  attachWebSocket(server)          // WebSocket en /ws/combustible
  setPumpBroadcast(broadcastRaw)   // conectar broadcast al monitor de bombas
  setVirBroadcast(broadcastRaw)    // conectar broadcast al monitor VIR
  await startSyncScheduler()       // sync ventas/tanques/alarmas cada 15s
  startPumpMonitor()               // monitor TCP estado bombas en tiempo real
  void startVirMonitor()           // monitor VIR lectura de dispositivos por bomba
  startFeConsultaCron()            // consulta periódica estado MH + correo automático
}

async function onServerReady() {
  if (startupDone) return
  startupDone = true
  try {
    fs.mkdirSync(path.dirname(RUNTIME_PORT_FILE), { recursive: true })
    fs.writeFileSync(RUNTIME_PORT_FILE, String(activePort), 'utf8')
  } catch (err) {
    console.warn('[MYA Server] No se pudo escribir el puerto runtime:', err.message)
  }
  console.log(`[MYA Server] Corriendo en http://localhost:${activePort}`)
  console.log(`[MYA Server] FUSION_API_URL: ${process.env.FUSION_API_URL}`)
  console.log(`[MYA Server] EMPRESA_ID: ${process.env.EMPRESA_ID}`)

  attachWebSocket(server)
  setPumpBroadcast(broadcastRaw)
  setVirBroadcast(broadcastRaw)
  setPumpSaleEndHook((pumpId, _sale) => {
    const empresaId = Number(process.env.EMPRESA_ID || 0)
    if (empresaId > 0) void finalizarSesionPump(empresaId, pumpId)
  })

  const empresaId = Number(process.env.EMPRESA_ID || 0)
  const combustibleActivo = await empresaTieneModuloCombustible()
  const fusionConfigActiva = await hayFusionConfigActiva()

  if (combustibleActivo) {
    await startSyncScheduler({ empresaIds: empresaId > 0 ? [empresaId] : [] })
    startPumpMonitor()
    void startVirMonitor()
  } else if (fusionConfigActiva) {
    console.log('[MYA Server] Hay fusion_config activa en BD. Se inicia Fusion multiempresa usando la configuracion almacenada.')
    await startSyncScheduler()
    startPumpMonitor()
    void startVirMonitor()
  } else {
    console.log(`[MYA Server] Modulo combustible no habilitado para EMPRESA_ID=${process.env.EMPRESA_ID} y no hay fusion_config activa. Se omite Fusion/PumpStatus.`)
  }

  startFeConsultaCron()
  startCierreTurnoCron()
  setBrazoleteBroadcast(broadcastRaw)
  setHidBroadcast(broadcastRaw)
  setPistaBroadcast(broadcastRaw)
  if (empresaId > 0) void startHidReaderMonitor(empresaId)
}

function startListening(port) {
  activePort = port
  server.listen(port, () => {
    void onServerReady()
  })
}

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`[MYA Server] El puerto ${activePort} ya está en uso. Cierre la instancia anterior o cambie PORT.`)
    process.exit(1)
  }
  console.error('[MYA Server] Error del servidor:', err.message)
  process.exit(1)
})

function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[MYA Server] Cerrando por ${signal}...`)
  try {
    if (fs.existsSync(RUNTIME_PORT_FILE)) fs.unlinkSync(RUNTIME_PORT_FILE)
  } catch (err) {
    console.warn('[MYA Server] No se pudo limpiar el puerto runtime:', err.message)
  }
  server.close(() => {
    console.log('[MYA Server] Puerto liberado. Proceso cerrado.')
    process.exit(0)
  })
  setTimeout(() => {
    console.warn('[MYA Server] Cierre forzado por timeout.')
    process.exit(1)
  }, 5000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

startListening(DEFAULT_PORT)
