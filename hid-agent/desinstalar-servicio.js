import { Service } from 'node-windows'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const svc = new Service({
  name  : 'MYA HID Agent',
  script: join(__dirname, 'agent.js'),
})

svc.on('uninstall', () => console.log('✓ Servicio desinstalado'))
svc.uninstall()
