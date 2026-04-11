#!/usr/bin/env python3
"""
MYA Agent — Lector HID para Raspberry Pi
==========================================
Lee un lector de brazaletes tipo teclado y envía el UID al servidor MYA.

Configuración via /etc/mya-agent.env:
  MYA_SERVER    = http://192.168.1.100:3001
  EMPRESA_ID    = 1
  PUMP_ID       = 1
  AGENT_SECRET  = (el mismo valor que en el .env del servidor)
  HID_DEVICE    = /dev/input/event0   (dejar vacío para autodetectar)
"""

import os
import sys
import time
import logging
import requests
from evdev import InputDevice, categorize, ecodes, list_devices, KeyEvent

# ─── Configuración ────────────────────────────────────────────────────────────

SERVER_URL   = os.environ.get('MYA_SERVER',    'http://192.168.1.100:3001')
EMPRESA_ID   = int(os.environ.get('EMPRESA_ID',   '1'))
PUMP_ID      = int(os.environ.get('PUMP_ID',      '1'))
AGENT_SECRET = os.environ.get('AGENT_SECRET',  '')
DEVICE_PATH  = os.environ.get('HID_DEVICE',    '')   # vacío = autodetectar
RETRY_SEC    = int(os.environ.get('RETRY_SEC', '5'))  # segundos entre reintentos

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [MYA-Pi Bomba %(pump)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
log = logging.LoggerAdapter(logging.getLogger(), {'pump': PUMP_ID})

# ─── Mapa de teclas → caracteres ─────────────────────────────────────────────

KEY_MAP = {
    # Fila numérica superior
    'KEY_1': '1', 'KEY_2': '2', 'KEY_3': '3', 'KEY_4': '4', 'KEY_5': '5',
    'KEY_6': '6', 'KEY_7': '7', 'KEY_8': '8', 'KEY_9': '9', 'KEY_0': '0',
    # Teclado numérico
    'KEY_KP1': '1', 'KEY_KP2': '2', 'KEY_KP3': '3', 'KEY_KP4': '4',
    'KEY_KP5': '5', 'KEY_KP6': '6', 'KEY_KP7': '7', 'KEY_KP8': '8',
    'KEY_KP9': '9', 'KEY_KP0': '0',
    # Letras A-F para UIDs hexadecimales
    'KEY_A': 'A', 'KEY_B': 'B', 'KEY_C': 'C',
    'KEY_D': 'D', 'KEY_E': 'E', 'KEY_F': 'F',
    # Letras adicionales (algunos lectores emiten el ID completo)
    'KEY_G': 'G', 'KEY_H': 'H', 'KEY_I': 'I', 'KEY_J': 'J',
    'KEY_K': 'K', 'KEY_L': 'L', 'KEY_M': 'M', 'KEY_N': 'N',
    'KEY_O': 'O', 'KEY_P': 'P', 'KEY_Q': 'Q', 'KEY_R': 'R',
    'KEY_S': 'S', 'KEY_T': 'T', 'KEY_U': 'U', 'KEY_V': 'V',
    'KEY_W': 'W', 'KEY_X': 'X', 'KEY_Y': 'Y', 'KEY_Z': 'Z',
    # Guión (algunos formatos de UID)
    'KEY_MINUS': '-', 'KEY_KPMINUS': '-',
}

ENTER_KEYS = {'KEY_ENTER', 'KEY_KPENTER'}

# ─── Autodetección del lector HID ────────────────────────────────────────────

def encontrar_dispositivo():
    """
    Busca el primer dispositivo de entrada que se comporte como teclado.
    Si HID_DEVICE está definido, lo usa directamente.
    Excluye dispositivos del sistema (ratón, touchpad).
    """
    if DEVICE_PATH:
        log.info(f'Usando dispositivo configurado: {DEVICE_PATH}')
        return InputDevice(DEVICE_PATH)

    candidatos = []
    for path in list_devices():
        try:
            dev = InputDevice(path)
            caps = dev.capabilities()
            # Debe tener EV_KEY (teclas) y KEY_ENTER
            if ecodes.EV_KEY in caps and ecodes.KEY_ENTER in caps.get(ecodes.EV_KEY, []):
                # Excluir dispositivos con EV_REL (ratón/touchpad)
                if ecodes.EV_REL not in caps:
                    candidatos.append(dev)
                    log.info(f'Candidato: {path} — {dev.name}')
        except Exception:
            pass

    if not candidatos:
        return None

    if len(candidatos) == 1:
        return candidatos[0]

    # Más de uno: elegir por nombre (los lectores suelen llamarse "HID", "Scanner", "Barcode")
    keywords = ['hid', 'scanner', 'barcode', 'rfid', 'reader', 'card']
    for dev in candidatos:
        if any(k in dev.name.lower() for k in keywords):
            log.info(f'Seleccionado por nombre: {dev.name}')
            return dev

    # Fallback: el primero
    log.warning(f'Múltiples candidatos, usando el primero: {candidatos[0].name}')
    log.warning('Si no es correcto, defina HID_DEVICE=/dev/input/eventX en /etc/mya-agent.env')
    return candidatos[0]

# ─── Envío al servidor MYA ───────────────────────────────────────────────────

def enviar_uid(uid: str) -> bool:
    """Envía el UID al servidor MYA. Retorna True si fue aceptado."""
    url = f'{SERVER_URL}/api/brazaletes/lectura'
    try:
        resp = requests.post(
            url,
            json={'empresa_id': EMPRESA_ID, 'pump_id': PUMP_ID, 'uid': uid},
            headers={'Authorization': f'Agent {AGENT_SECRET}'},
            timeout=5,
        )
        data = resp.json()
        if data.get('ok'):
            log.info(f'UID {uid} → {data.get("operador_nombre", "aceptado")}')
            return True
        else:
            log.warning(f'UID {uid} rechazado: {data.get("error", "sin detalle")}')
            return False
    except requests.exceptions.ConnectionError:
        log.error(f'Sin conexión con el servidor ({SERVER_URL})')
        return False
    except Exception as e:
        log.error(f'Error enviando UID: {e}')
        return False

# ─── Loop principal ───────────────────────────────────────────────────────────

def leer_dispositivo(dev: InputDevice):
    """Lee eventos del dispositivo y acumula el UID hasta Enter."""
    log.info(f'Escuchando en: {dev.path} — {dev.name}')
    buffer = ''

    for event in dev.read_loop():
        if event.type != ecodes.EV_KEY:
            continue
        key_event = categorize(event)
        if key_event.keystate != KeyEvent.key_down:
            continue

        key = key_event.keycode
        # Manejar lista (algunos drivers retornan lista)
        if isinstance(key, list):
            key = key[0]

        if key in ENTER_KEYS:
            uid = buffer.strip()
            buffer = ''
            if uid:
                log.info(f'Lectura: {uid}')
                enviar_uid(uid)
        elif key in KEY_MAP:
            buffer += KEY_MAP[key]

def main():
    if not AGENT_SECRET:
        log.error('AGENT_SECRET no configurado. Revisar /etc/mya-agent.env')
        sys.exit(1)

    log.info(f'Iniciando — Empresa {EMPRESA_ID} | Bomba {PUMP_ID} | Servidor {SERVER_URL}')

    while True:
        try:
            dev = encontrar_dispositivo()
            if not dev:
                log.warning(f'No se encontró lector HID. Reintentando en {RETRY_SEC}s...')
                time.sleep(RETRY_SEC)
                continue

            # Tomar control exclusivo (evita que el SO procese las teclas del lector)
            dev.grab()
            try:
                leer_dispositivo(dev)
            finally:
                try:
                    dev.ungrab()
                except Exception:
                    pass

        except OSError as e:
            log.warning(f'Dispositivo desconectado: {e}. Reintentando en {RETRY_SEC}s...')
            time.sleep(RETRY_SEC)
        except KeyboardInterrupt:
            log.info('Detenido por el usuario.')
            sys.exit(0)
        except Exception as e:
            log.error(f'Error inesperado: {e}. Reintentando en {RETRY_SEC}s...')
            time.sleep(RETRY_SEC)

if __name__ == '__main__':
    main()
