# Guía de Despliegue: MYA ERP en VPS
## Supabase Self-Hosted + Node.js/Express + React + Nginx + SSL
**Stack:** Ubuntu 24.04 LTS · Docker · PM2 · Nginx · Certbot  
**Proveedor sugerido:** Vultr High Frequency, Miami — 4vCPU / 8GB RAM / 160GB NVMe

---

## Índice

1. [Configuración inicial del VPS](#1-configuración-inicial-del-vps)
2. [Instalación de Docker y Docker Compose](#2-instalación-de-docker-y-docker-compose)
3. [Supabase Self-Hosted](#3-supabase-self-hosted)
4. [Node.js/Express con PM2](#4-nodejsexpress-con-pm2)
5. [Build y servir React](#5-build-y-servir-react)
6. [Nginx como reverse proxy](#6-nginx-como-reverse-proxy)
7. [SSL con Certbot (Let's Encrypt)](#7-ssl-con-certbot-lets-encrypt)
8. [Firewall y seguridad](#8-firewall-y-seguridad)
9. [Backups automáticos de PostgreSQL](#9-backups-automáticos-de-postgresql)
10. [Flujo de deploy desde Windows](#10-flujo-de-deploy-desde-windows)
11. [Cheatsheet de comandos útiles](#11-cheatsheet-de-comandos-útiles)

---

## 1. Configuración inicial del VPS

### 1.1 Crear el servidor en Vultr
- Región: **Miami (ewr)**
- Plan: **High Frequency — 4 vCPU / 8GB / 160GB NVMe** (~$48/mes)
- SO: **Ubuntu 24.04 LTS x64**
- Activar: SSH Key (recomendado), IPv4

### 1.2 Primer acceso y actualización

```bash
# Desde tu máquina Windows (PowerShell o Windows Terminal)
ssh root@TU_IP_DEL_VPS

# En el servidor:
apt update && apt upgrade -y
apt install -y curl wget git unzip ufw fail2ban
```

### 1.3 Crear usuario no-root

```bash
adduser mya
usermod -aG sudo mya

# Copiar tu llave SSH al nuevo usuario
rsync --archive --chown=mya:mya ~/.ssh /home/mya

# Verificar acceso (desde tu PC)
ssh mya@TU_IP_DEL_VPS
```

### 1.4 Deshabilitar acceso root por SSH

```bash
nano /etc/ssh/sshd_config
# Cambiar:
#   PermitRootLogin yes  →  PermitRootLogin no
#   PasswordAuthentication yes  →  PasswordAuthentication no

systemctl restart sshd
```

---

## 2. Instalación de Docker y Docker Compose

```bash
# Instalar Docker (método oficial)
curl -fsSL https://get.docker.com | sh

# Agregar tu usuario al grupo docker
sudo usermod -aG docker mya

# Cerrar sesión y volver a entrar para que tome efecto
exit
ssh mya@TU_IP_DEL_VPS

# Verificar
docker --version
docker compose version
```

---

## 3. Supabase Self-Hosted

Supabase se despliega como un conjunto de contenedores Docker usando su repositorio oficial.

### 3.1 Clonar el repositorio de Supabase

```bash
cd /opt
sudo git clone --depth 1 https://github.com/supabase/supabase
sudo chown -R mya:mya /opt/supabase
cd /opt/supabase/docker
cp .env.example .env
```

### 3.2 Configurar variables de entorno

```bash
nano /opt/supabase/docker/.env
```

Editar los siguientes valores **obligatorios**:

```env
############################################
# SECRETS — Cambiar TODOS estos valores
############################################

# JWT Secret (mínimo 32 caracteres aleatorios)
JWT_SECRET=tu_jwt_secret_muy_largo_y_aleatorio_aqui

# Anon Key y Service Role Key
# Generarlos en: https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys
# O usando: node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({role:'anon',iss:'supabase'},process.env.JWT_SECRET,{expiresIn:'10y'}))"
ANON_KEY=tu_anon_key_generada
SERVICE_ROLE_KEY=tu_service_role_key_generada

############################################
# BASE DE DATOS
############################################
POSTGRES_PASSWORD=una_password_segura_para_postgres
POSTGRES_DB=postgres

############################################
# URLs — Reemplazar con tu dominio real
############################################
SITE_URL=https://app.tudominio.com
API_EXTERNAL_URL=https://supabase.tudominio.com
SUPABASE_PUBLIC_URL=https://supabase.tudominio.com

# Dashboard (Supabase Studio)
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=password_seguro_para_studio

############################################
# Email (para Auth — usar SMTP real en prod)
############################################
SMTP_ADMIN_EMAIL=admin@tudominio.com
SMTP_HOST=smtp.tuproveedor.com
SMTP_PORT=587
SMTP_USER=tu_usuario_smtp
SMTP_PASS=tu_password_smtp
SMTP_SENDER_NAME=MYA ERP
```

> **Tip para generar JWT Secret:** Usar `openssl rand -base64 32` en el terminal del VPS.

### 3.3 Levantar Supabase

```bash
cd /opt/supabase/docker

# Primera vez (descarga imágenes ~2-3 min)
docker compose up -d

# Ver estado de los contenedores
docker compose ps

# Ver logs si algo falla
docker compose logs -f
```

Los contenedores que deben estar `running`:
- `supabase-db` (PostgreSQL)
- `supabase-auth` (GoTrue)
- `supabase-rest` (PostgREST)
- `supabase-realtime`
- `supabase-storage`
- `supabase-studio` (dashboard en puerto 3000)
- `supabase-kong` (API gateway, puerto 8000)

### 3.4 Verificar que funciona

```bash
# Studio debería responder (internamente por ahora)
curl http://localhost:3000
curl http://localhost:8000/rest/v1/ -H "apikey: TU_ANON_KEY"
```

### 3.5 Migrar tu base de datos existente

En tu máquina Windows, con tu proyecto Supabase Cloud actual:

```bash
# Exportar desde Supabase Cloud
pg_dump "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" \
  --no-owner --no-acl -Fc -f mya_backup.dump

# Importar al VPS self-hosted
pg_restore -d "postgresql://postgres:[POSTGRES_PASSWORD]@TU_IP:5432/postgres" \
  --no-owner --no-acl mya_backup.dump
```

> **Alternativa más fácil:** Usar el Supabase Studio de tu proyecto Cloud para exportar SQL,
> y ejecutarlo en el Studio del VPS.

### 3.6 Auto-inicio de Supabase con el servidor

```bash
# Crear servicio systemd
sudo nano /etc/systemd/system/supabase.service
```

```ini
[Unit]
Description=Supabase Self-Hosted
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/supabase/docker
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
User=mya

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable supabase
```

---

## 4. Node.js/Express con PM2

### 4.1 Instalar Node.js (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # v22.x.x
npm --version
```

### 4.2 Instalar PM2 globalmente

```bash
sudo npm install -g pm2
```

### 4.3 Subir tu backend

**Opción A — desde tu PC con SCP:**
```bash
# En Windows PowerShell
scp -r D:\Proyectos\erp-mya\backend mya@TU_IP:/home/mya/mya-backend
```

**Opción B — clonar desde Git (recomendado a largo plazo):**
```bash
cd /home/mya
git clone https://github.com/tu-usuario/mya-backend.git
cd mya-backend
npm install
```

### 4.4 Variables de entorno del backend

```bash
nano /home/mya/mya-backend/.env
```

```env
NODE_ENV=production
PORT=4000

# Apuntar al Supabase local (en Docker, mismo host)
SUPABASE_URL=http://localhost:8000
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key

# PostgreSQL directo (para conexiones pesadas)
DATABASE_URL=postgresql://postgres:tu_password@localhost:5432/postgres

# Wayne Fusion (si aplica)
FUSION_HOST=168.228.51.221
FUSION_PORT=3011
```

### 4.5 Levantar con PM2

```bash
cd /home/mya/mya-backend

# Iniciar la app
pm2 start src/index.js --name "mya-api" --env production

# Guardar configuración para auto-inicio
pm2 save
pm2 startup systemd
# Copiar y ejecutar el comando que te da PM2

# Ver estado
pm2 status
pm2 logs mya-api
```

---

## 5. Build y servir React

### 5.1 Buildear en tu PC local (recomendado)

```bash
# En Windows, en D:\Proyectos\erp-mya\frontend
npm run build

# Subir el build al VPS
scp -r dist/ mya@TU_IP:/home/mya/mya-frontend/
```

### 5.2 Alternativa: buildear en el VPS

```bash
cd /home/mya/mya-frontend
npm install
npm run build
# El build queda en /home/mya/mya-frontend/dist
```

> Nginx va a servir la carpeta `dist` como archivos estáticos.

---

## 6. Nginx como reverse proxy

### 6.1 Instalar Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
```

### 6.2 Configurar virtual hosts

```bash
sudo nano /etc/nginx/sites-available/mya
```

```nginx
# ─── Frontend React ──────────────────────────────────────────
server {
    listen 80;
    server_name app.tudominio.com;

    root /home/mya/mya-frontend/dist;
    index index.html;

    # SPA: redirigir todo a index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache de assets estáticos
    location ~* \.(js|css|png|jpg|svg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}

# ─── API Node.js/Express ─────────────────────────────────────
server {
    listen 80;
    server_name api.tudominio.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# ─── Supabase API (Kong gateway) ─────────────────────────────
server {
    listen 80;
    server_name supabase.tudominio.com;

    # Aumentar límite para uploads de comprobantes XML
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ─── Supabase Studio (dashboard) ─────────────────────────────
server {
    listen 80;
    server_name studio.tudominio.com;

    # IMPORTANTE: Restringir acceso por IP si es posible
    # allow TU_IP_FIJA;
    # deny all;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# Activar el sitio
sudo ln -s /etc/nginx/sites-available/mya /etc/nginx/sites-enabled/
sudo nginx -t   # verificar sintaxis
sudo systemctl reload nginx
```

### 6.3 DNS — Apuntar tus subdominios al VPS

En tu proveedor de dominio (Cloudflare, GoDaddy, etc.), crear registros **A**:

| Subdominio | IP |
|---|---|
| `app.tudominio.com` | TU_IP_DEL_VPS |
| `api.tudominio.com` | TU_IP_DEL_VPS |
| `supabase.tudominio.com` | TU_IP_DEL_VPS |
| `studio.tudominio.com` | TU_IP_DEL_VPS |

---

## 7. SSL con Certbot (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx

# Obtener certificados para todos los subdominios de una vez
sudo certbot --nginx \
  -d app.tudominio.com \
  -d api.tudominio.com \
  -d supabase.tudominio.com \
  -d studio.tudominio.com

# Certbot modifica nginx automáticamente para HTTPS
# Verificar renovación automática
sudo certbot renew --dry-run
```

> Certbot instala un cron/timer que renueva los certificados automáticamente antes de que expiren.

---

## 8. Firewall y seguridad

### 8.1 Configurar UFW

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Permitir SSH (¡primero, para no quedarte afuera!)
sudo ufw allow ssh

# HTTP y HTTPS para Nginx
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Activar
sudo ufw enable
sudo ufw status verbose
```

> **Importante:** Los puertos de Supabase (5432, 8000, 3000) NO se exponen al exterior.
> Solo Nginx los proxea. Docker no es manejado por UFW — verificar con `docker ps` que
> ningún contenedor esté publicando en 0.0.0.0.

### 8.2 Ajustar exposición de puertos en Docker Compose

En `/opt/supabase/docker/docker-compose.yml`, asegurarse que los puertos estén
vinculados a `127.0.0.1` (solo local), no a `0.0.0.0`:

```yaml
# Cambiar esto:
ports:
  - "8000:8000"

# Por esto:
ports:
  - "127.0.0.1:8000:8000"
```

Aplicar cambios:
```bash
cd /opt/supabase/docker
docker compose down && docker compose up -d
```

### 8.3 Fail2Ban (protección contra fuerza bruta SSH)

```bash
# Ya instalado en el paso 1, verificar que esté activo
sudo systemctl status fail2ban
sudo fail2ban-client status sshd
```

---

## 9. Backups automáticos de PostgreSQL

### 9.1 Script de backup

```bash
nano /home/mya/backup-db.sh
```

```bash
#!/bin/bash
FECHA=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/mya/backups"
DB_CONTAINER="supabase-db"
DB_PASSWORD="tu_postgres_password"

mkdir -p $BACKUP_DIR

# Dump completo
docker exec $DB_CONTAINER pg_dumpall -U postgres \
  | gzip > "$BACKUP_DIR/mya_full_$FECHA.sql.gz"

# Mantener solo los últimos 7 días
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "Backup completado: mya_full_$FECHA.sql.gz"
```

```bash
chmod +x /home/mya/backup-db.sh
```

### 9.2 Cron para backup automático diario

```bash
crontab -e
# Agregar: backup todos los días a las 2:00 AM
0 2 * * * /home/mya/backup-db.sh >> /home/mya/backup.log 2>&1
```

### 9.3 Enviar backups a almacenamiento externo (opcional)

```bash
# Instalar rclone para sincronizar con Google Drive / S3 / etc.
curl https://rclone.org/install.sh | sudo bash
rclone config  # seguir el wizard para configurar destino
```

---

## 10. Flujo de deploy desde Windows

Una vez configurado el servidor, el flujo de trabajo diario desde `D:\Proyectos\erp-mya` es:

### Deploy del backend (Node.js)

```powershell
# En PowerShell, desde D:\Proyectos\erp-mya\backend

# Opción A: SCP directo
scp -r . mya@TU_IP:/home/mya/mya-backend/
ssh mya@TU_IP "cd /home/mya/mya-backend && npm install && pm2 restart mya-api"

# Opción B: Git pull (más limpio)
ssh mya@TU_IP "cd /home/mya/mya-backend && git pull && npm install && pm2 restart mya-api"
```

### Deploy del frontend (React)

```powershell
# Build local
cd D:\Proyectos\erp-mya\frontend
npm run build

# Subir el build
scp -r dist/ mya@TU_IP:/home/mya/mya-frontend/
# Nginx sirve los archivos estáticos — no requiere restart
```

### Script de deploy automatizado (Windows)

Guardar como `deploy.ps1` en `D:\Proyectos\erp-mya\`:

```powershell
param(
    [string]$Target = "all"  # "frontend", "backend", o "all"
)

$VPS = "mya@TU_IP_DEL_VPS"

if ($Target -eq "frontend" -or $Target -eq "all") {
    Write-Host "Building frontend..." -ForegroundColor Cyan
    Set-Location frontend
    npm run build
    Write-Host "Deploying frontend..." -ForegroundColor Cyan
    scp -r dist/ "${VPS}:/home/mya/mya-frontend/"
    Set-Location ..
    Write-Host "Frontend deployed!" -ForegroundColor Green
}

if ($Target -eq "backend" -or $Target -eq "all") {
    Write-Host "Deploying backend..." -ForegroundColor Cyan
    ssh $VPS "cd /home/mya/mya-backend && git pull && npm install --production && pm2 restart mya-api"
    Write-Host "Backend deployed!" -ForegroundColor Green
}

Write-Host "Deploy completo." -ForegroundColor Green
```

```powershell
# Usar:
.\deploy.ps1           # todo
.\deploy.ps1 frontend  # solo frontend
.\deploy.ps1 backend   # solo backend
```

---

## 11. Cheatsheet de comandos útiles

### Supabase

```bash
# Ver estado de contenedores
cd /opt/supabase/docker && docker compose ps

# Reiniciar Supabase completo
docker compose restart

# Ver logs de un servicio específico
docker compose logs -f supabase-db
docker compose logs -f supabase-auth

# Acceder a PostgreSQL directamente
docker exec -it supabase-db psql -U postgres

# Actualizar Supabase (nueva versión)
git -C /opt/supabase pull
cd /opt/supabase/docker
docker compose pull
docker compose up -d
```

### PM2 (Node.js)

```bash
pm2 status              # estado de todas las apps
pm2 logs mya-api        # logs en tiempo real
pm2 restart mya-api     # reiniciar
pm2 reload mya-api      # zero-downtime reload
pm2 stop mya-api        # detener
pm2 monit               # monitor interactivo
```

### Nginx

```bash
sudo nginx -t                    # verificar configuración
sudo systemctl reload nginx      # aplicar cambios sin downtime
sudo tail -f /var/log/nginx/error.log   # ver errores
```

### Sistema

```bash
htop                             # monitor de recursos
df -h                            # espacio en disco
free -h                          # memoria RAM disponible
docker stats                     # uso de recursos por contenedor
```

---

## Arquitectura final

```
Internet
    │
    ▼
[Cloudflare DNS]
    │
    ▼
[VPS Vultr Miami — Ubuntu 24.04]
    │
    ├── Nginx (80/443) ──┬── app.tudominio.com    → /home/mya/mya-frontend/dist (static)
    │                    ├── api.tudominio.com    → localhost:4000 (Node.js/PM2)
    │                    ├── supabase.tudominio.com → localhost:8000 (Kong/Docker)
    │                    └── studio.tudominio.com → localhost:3000 (Studio/Docker)
    │
    ├── PM2
    │    └── mya-api (Node.js/Express :4000)
    │
    └── Docker Compose (/opt/supabase/docker)
         ├── supabase-db        (PostgreSQL :5432 — solo interno)
         ├── supabase-auth      (GoTrue)
         ├── supabase-rest      (PostgREST)
         ├── supabase-realtime  (WebSockets)
         ├── supabase-storage   (S3-compatible)
         ├── supabase-studio    (:3000 — solo interno)
         └── supabase-kong      (:8000 — solo interno)
```

---

*Guía preparada para MYA ERP — Abril 2026*  
*Stack: React + TypeScript + Node.js/Express + Supabase Self-Hosted + PostgreSQL*
