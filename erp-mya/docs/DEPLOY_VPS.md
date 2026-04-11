# Deploy VPS

Guia corta para publicar y validar `ERP-MYA` en el VPS.

## Arquitectura actual

- `https://app.visionzn.net` = frontend servido por `nginx`
- `https://api.visionzn.net` = backend Node/Express servido por `pm2`
- `https://supabase.visionzn.net` = Supabase self-hosted del VPS

## Frontend

Codigo fuente en:

```bash
/home/mya-frontend-src
```

Sitio publicado en:

```bash
/home/mya-frontend
```

### Sincronizar cambios desde local sin Git

Si el VPS no esta usando un repo Git, puedes subir solo archivos nuevos o modificados desde Windows con:

```powershell
cd d:\Proyectos\erp-mya
Copy-Item .secrets\frontend-sync.env.example .secrets\frontend-sync.env
.\scripts\sync-frontend-to-vps.ps1
```

El script:

- compara hashes contra el ultimo estado sincronizado
- sube solo archivos agregados o modificados
- sincroniza solo el frontend (`src`, `public` y archivos raiz necesarios)
- no toca `server`, `node_modules`, `build`, `.env*` ni `.git`
- no elimina archivos remotos por defecto

Configuracion no versionada:

```text
.secrets/frontend-sync.env
```

Plantilla:

```text
.secrets/frontend-sync.env.example
```

Si tambien quieres reflejar eliminaciones locales en el VPS:

```powershell
.\scripts\sync-frontend-to-vps.ps1 -DeleteRemoved
```

El estado local del ultimo sync se guarda en:

```text
.secrets/frontend-sync-state.json
```

### Variables requeridas

Archivo:

```bash
/home/mya-frontend-src/.env.production.local
```

Contenido esperado:

```bash
REACT_APP_SUPABASE_URL=https://supabase.visionzn.net
REACT_APP_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY del VPS>
REACT_APP_API_URL=https://api.visionzn.net
```

### Build y publicacion

```bash
cd /home/mya-frontend-src
rm -rf build
NODE_OPTIONS=--max-old-space-size=4096 npm run build
rsync -av --delete build/ /home/mya-frontend/
```

Flujo recomendado sin Git:

1. Desde Windows, ejecutar `.\scripts\sync-frontend-to-vps.ps1`
2. En el VPS, compilar y publicar el frontend

Para dispararlo desde Superusuario en local, `FRONTEND_SYNC_CMD` puede apuntar a:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sync-frontend-to-vps.ps1
```

Si quieres que funcione sin prompts desde la app, usa clave SSH o PuTTY (`plink`/`pscp`) con el password guardado en `.secrets/frontend-sync.env`.

### Validacion

```bash
ls -la /home/mya-frontend/index.html
curl -I https://app.visionzn.net
```

## Backend

Codigo en:

```bash
/home/mya-backend
```

Variables en:

```bash
/home/mya-backend/.env
```

Claves esperadas:

```bash
SUPABASE_URL=https://supabase.visionzn.net
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_KEY del VPS>
```

### Reinicio

```bash
cd /home/mya-backend
pm2 restart mya-api
```

### Validacion

```bash
curl -s http://127.0.0.1:4000/health
pm2 logs mya-api --lines 80
```

## Supabase VPS

La `anon key` real del VPS se puede validar asi:

```bash
curl -i "https://supabase.visionzn.net/auth/v1/settings" -H "apikey: <SUPABASE_ANON_KEY>"
```

Debe responder `200 OK`.

Para revisar las claves reales cargadas por el stack:

```bash
docker inspect supabase-kong --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E 'ANON_KEY|SERVICE_ROLE_KEY|SUPABASE'
```

## Problemas comunes

### `403 Forbidden` en `app.visionzn.net`

Revisar:

```bash
ls -la /home/mya-frontend/index.html
nginx -t
systemctl reload nginx
```

### Pagina en blanco

Abrir `F12 > Console`.

Si aparece `supabaseUrl is required`, falta `.env.production.local` o no se recompilo el frontend.

### `bad_jwt`

Frontend y backend estan apuntando a Supabase distintos o con keys cruzadas.

Produccion del VPS debe quedar asi:

- frontend: `SUPABASE_URL + ANON_KEY` del VPS
- backend: `SUPABASE_URL + SERVICE_ROLE_KEY` del VPS

### Build falla por memoria

```bash
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

### Build falla por modulos faltantes

Instalar dependencias faltantes dentro de `/home/mya-frontend-src` y repetir build.

## Verificacion final

1. Abrir `https://app.visionzn.net` en incognito.
2. Iniciar sesion.
3. Cambiar de empresa.
4. Validar dashboard de combustible.
5. Validar `https://api.visionzn.net/health`.
