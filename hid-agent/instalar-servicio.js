import { Service } from 'node-windows'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const svc = new Service({
  name       : 'MYA HID Agent',
  description: 'Agente lector de brazaletes RFID — MYA ERP',
  script     : join(__dirname, 'agent.js'),
  nodeOptions: ['--experimental-vm-modules'],
  workingDirectory: __dirname,
  wait       : 2,   // segundos entre reinicios si falla
  grow       : 0.5,
})

svc.on('install', () => {
  console.log('✓ Servicio instalado. Iniciando...')
  svc.start()
})

svc.on('start', () => {
  console.log('✓ MYA HID Agent corriendo como servicio de Windows')
  console.log('  Para detenerlo: node desinstalar-servicio.js')
})

svc.on('error', (err) => console.error('Error:', err))

svc.install()
