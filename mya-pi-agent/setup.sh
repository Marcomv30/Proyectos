#!/bin/bash
# ============================================================
# MYA Agent — Instalador para Raspberry Pi
# Ejecutar como root: sudo bash setup.sh
# ============================================================

set -e

echo ""
echo "================================================"
echo "  MYA Agent — Instalación en Raspberry Pi"
echo "================================================"
echo ""

# ─── Verificar root ──────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  echo "ERROR: Ejecutar como root: sudo bash setup.sh"
  exit 1
fi

# ─── Solicitar configuración ─────────────────────────────────
echo "Configuración del agente:"
echo ""

read -p "  IP o hostname del servidor MYA (ej: 192.168.1.100): " SERVER_IP
read -p "  Puerto del servidor MYA [3001]: " SERVER_PORT
SERVER_PORT=${SERVER_PORT:-3001}

read -p "  Empresa ID [1]: " EMPRESA_ID
EMPRESA_ID=${EMPRESA_ID:-1}

read -p "  Número de bomba (1-10): " PUMP_ID
read -p "  AGENT_SECRET (del .env del servidor): " AGENT_SECRET

echo ""
echo "  Servidor : http://${SERVER_IP}:${SERVER_PORT}"
echo "  Empresa  : ${EMPRESA_ID}"
echo "  Bomba    : ${PUMP_ID}"
echo ""
read -p "¿Confirmar instalación? (s/n): " CONFIRM
if [ "$CONFIRM" != "s" ]; then
  echo "Cancelado."
  exit 0
fi

# ─── Actualizar sistema e instalar dependencias ───────────────
echo ""
echo "[1/4] Actualizando sistema..."
apt-get update -qq
apt-get install -y -qq python3-pip python3-evdev

echo "[2/4] Instalando librería requests..."
pip3 install requests --quiet

# ─── Copiar script ───────────────────────────────────────────
echo "[3/4] Instalando script..."
cp mya_agent.py /usr/local/bin/mya_agent.py
chmod +x /usr/local/bin/mya_agent.py

# ─── Crear archivo de configuración ──────────────────────────
cat > /etc/mya-agent.env << EOF
# MYA Agent — Configuración
# Editar con: sudo nano /etc/mya-agent.env
# Reiniciar con: sudo systemctl restart mya-agent

MYA_SERVER=http://${SERVER_IP}:${SERVER_PORT}
EMPRESA_ID=${EMPRESA_ID}
PUMP_ID=${PUMP_ID}
AGENT_SECRET=${AGENT_SECRET}

# Ruta del lector HID (dejar vacío para autodetectar)
# Para identificar el dispositivo: ls /dev/input/by-id/
# HID_DEVICE=/dev/input/event0

# Segundos entre reintentos si se desconecta el lector
RETRY_SEC=5
EOF

chmod 600 /etc/mya-agent.env
echo "    Configuración guardada en /etc/mya-agent.env"

# ─── Instalar servicio systemd ────────────────────────────────
echo "[4/4] Instalando servicio systemd..."
cat > /etc/systemd/system/mya-agent.service << EOF
[Unit]
Description=MYA Agent — Lector HID Bomba ${PUMP_ID}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/mya-agent.env
ExecStart=/usr/bin/python3 /usr/local/bin/mya_agent.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mya-agent
systemctl start mya-agent

# ─── Resultado ───────────────────────────────────────────────
echo ""
echo "================================================"
echo "  Instalación completa"
echo "================================================"
echo ""
echo "  Estado del servicio:"
systemctl status mya-agent --no-pager -l
echo ""
echo "  Comandos útiles:"
echo "    Ver logs en vivo : sudo journalctl -u mya-agent -f"
echo "    Reiniciar        : sudo systemctl restart mya-agent"
echo "    Editar config    : sudo nano /etc/mya-agent.env"
echo "    Ver dispositivos : ls /dev/input/by-id/"
echo ""
