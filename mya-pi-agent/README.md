# MYA Agent — Raspberry Pi

Script agente para leer brazaletes HID y enviar el pistero al servidor MYA.

## Instalación en la Pi

```bash
# 1. Copiar archivos a la Pi
scp mya_agent.py setup.sh pi@192.168.1.X:/home/pi/

# 2. Conectarse a la Pi
ssh pi@192.168.1.X

# 3. Ejecutar instalador (solicita la configuración interactivamente)
sudo bash setup.sh
```

## Configuración manual

Editar `/etc/mya-agent.env`:

```env
MYA_SERVER=http://192.168.1.100:3001
EMPRESA_ID=1
PUMP_ID=1
AGENT_SECRET=el_secret_del_servidor
HID_DEVICE=        # vacío = autodetectar
RETRY_SEC=5
```

Reiniciar: `sudo systemctl restart mya-agent`

## Ver logs

```bash
sudo journalctl -u mya-agent -f
```

## Identificar el lector HID

```bash
ls /dev/input/by-id/
# Buscar algo como: usb-HID_READER_xxx-event-kbd
# Luego definir HID_DEVICE=/dev/input/by-id/usb-HID_READER_xxx-event-kbd
```

## Flujo

```
Brazalete escaneado
  → Pi lee teclas HID
  → acumula UID hasta Enter
  → POST /api/brazaletes/lectura { empresa_id, pump_id, uid }
  → Servidor MYA identifica pistero
  → broadcast WebSocket → display en consola
```
