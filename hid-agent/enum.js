import HID from 'node-hid'
import 'dotenv/config'

const VID_A = Number(process.env.PUMP_A_VID)
const PID_A = Number(process.env.PUMP_A_PID)

console.log(`\nBuscando VID=0x${VID_A.toString(16).toUpperCase()} PID=0x${PID_A.toString(16).toUpperCase()}\n`)

const all = HID.devices()
const matches = all.filter(d => d.vendorId === VID_A && d.productId === PID_A)

if (!matches.length) {
  console.log('Dispositivo no encontrado. ¿Está conectado?')
} else {
  matches.forEach((d, i) => {
    console.log(`── Interfaz ${i} ──────────────────────`)
    console.log(`  path:        ${d.path}`)
    console.log(`  usagePage:   0x${(d.usagePage||0).toString(16).toUpperCase()}`)
    console.log(`  usage:       0x${(d.usage||0).toString(16).toUpperCase()}`)
    console.log(`  interface:   ${d.interface}`)
    console.log(`  product:     ${d.product}`)
  })
}
