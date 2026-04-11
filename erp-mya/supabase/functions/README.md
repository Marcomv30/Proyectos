# Supabase Edge Functions

## security-alert-worker

Procesa la cola `public.security_alert_outbox` y envia correos usando Resend.

### Variables de entorno requeridas

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `SECURITY_ALERT_FROM_EMAIL` (ej: `Seguridad <alertas@tu-dominio.com>`)
- `SECURITY_ALERT_CRON_SECRET` (obligatorio para proteger endpoint)

Opcionales:

- `SECURITY_ALERT_BATCH_SIZE` (default `20`)

### Deploy

```bash
supabase functions deploy security-alert-worker
```

### Configurar secrets

```bash
supabase secrets set \
SUPABASE_URL="https://TU-PROYECTO.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY" \
RESEND_API_KEY="re_xxx" \
SECURITY_ALERT_FROM_EMAIL="Seguridad <alertas@tu-dominio.com>" \
SECURITY_ALERT_CRON_SECRET="cambia-esto"
```

### Ejecucion manual (test)

```bash
curl -X POST \
  "https://TU-PROYECTO.supabase.co/functions/v1/security-alert-worker" \
  -H "x-cron-secret: cambia-esto"
```

### Programacion (cron)

Llamar cada 1-5 minutos al endpoint de la funcion con metodo `POST`.

---

## access-api

API inicial de acceso (BFF) para frontend.

### Endpoints v1

- `POST /functions/v1/access-api/auth/login`
  - body JSON: `{ "username": "marco", "password": "xxxxxx" }`
- `GET /functions/v1/access-api/me/access?empresa_id=<id>`
- `GET /functions/v1/access-api/me/menu?empresa_id=<id>`
- `POST /functions/v1/access-api/auth/switch-company`
  - body JSON: `{ "empresa_id": 1 }`

Retorna snapshot de acceso efectivo por usuario + empresa:

- usuario actual
- rol en la empresa
- lista `permissions` en formato `modulo:accion`
- `permission_map` para validaciones rapidas en frontend

### Variables de entorno requeridas

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ALLOWED_ORIGINS` (CSV; ej: `https://erp.tudominio.com,http://localhost:3000`)

### Deploy

```bash
supabase functions deploy access-api
```

### Configurar secrets

```bash
supabase secrets set \
SUPABASE_URL="https://TU-PROYECTO.supabase.co" \
SUPABASE_ANON_KEY="TU_ANON_KEY" \
ALLOWED_ORIGINS="https://erp.tudominio.com,http://localhost:3000"
```

### Ejecucion manual (test)

```bash
curl -X POST \
  "https://TU-PROYECTO.supabase.co/functions/v1/access-api/auth/login" \
  -H "apikey: TU_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"username":"marco","password":"xxxxxx"}'
```

```bash
curl -X GET \
  "https://TU-PROYECTO.supabase.co/functions/v1/access-api/me/access?empresa_id=1" \
  -H "Authorization: Bearer TU_ACCESS_TOKEN" \
  -H "apikey: TU_ANON_KEY"
```

```bash
curl -X POST \
  "https://TU-PROYECTO.supabase.co/functions/v1/access-api/auth/switch-company" \
  -H "Authorization: Bearer TU_ACCESS_TOKEN" \
  -H "apikey: TU_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"empresa_id":1}'
```

---

## bccr-tipo-cambio

Consulta tipo de cambio compra/venta del BCCR para una fecha puntual.

### Endpoint

- `POST /functions/v1/bccr-tipo-cambio`
  - body JSON: `{ "fecha": "2026-03-06" }`
  - Las credenciales del BCCR se leen solo desde secrets del servidor.

### Variables de entorno recomendadas

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ALLOWED_ORIGINS` (CSV; ej: `https://erp.tudominio.com,http://localhost:3000`)
- `BCCR_NOMBRE`
- `BCCR_CORREO`
- `BCCR_TOKEN`
- `BCCR_SUBNIVELES` (default `S`)

### Deploy

```bash
supabase functions deploy bccr-tipo-cambio
```

### Configurar secrets

```bash
supabase secrets set \
SUPABASE_URL="https://TU-PROYECTO.supabase.co" \
SUPABASE_ANON_KEY="TU_ANON_KEY" \
ALLOWED_ORIGINS="https://erp.tudominio.com,http://localhost:3000" \
BCCR_NOMBRE="TuNombre" \
BCCR_CORREO="tu@correo.com" \
BCCR_TOKEN="tu-token-bccr" \
BCCR_SUBNIVELES="S"
```

### Nota de seguridad

`bccr-tipo-cambio` requiere JWT valido en `Authorization: Bearer <access_token>`.

---

## mh-contribuyente

Consulta API de Ministerio de Hacienda para datos de contribuyente y actividades tributarias.

### Endpoint

- `POST /functions/v1/mh-contribuyente`
  - body JSON: `{ "cedula": "3101..." }`

### Variables de entorno recomendadas

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ALLOWED_ORIGINS` (CSV; ej: `https://erp.tudominio.com,http://localhost:3000`)
- `MH_CONTRIBUYENTE_API_URL` (default `https://api.hacienda.go.cr/fe/ae`)
- `MH_CONTRIBUYENTE_API_METHOD` (`POST` o `GET`, default `GET`)
- `MH_CONTRIBUYENTE_QUERY_PARAM` (default `identificacion`, para `GET`)
- `MH_CONTRIBUYENTE_CONTENT_TYPE` (default `application/json`)
- `MH_CONTRIBUYENTE_AUTH_HEADER` (default `Authorization`)
- `MH_CONTRIBUYENTE_AUTH_SCHEME` (default `Bearer`)
- `MH_CONTRIBUYENTE_TOKEN` (opcional, token de API)
- `MH_CONTRIBUYENTE_APIKEY_HEADER` (opcional)
- `MH_CONTRIBUYENTE_APIKEY_VALUE` (opcional)

### Deploy

```bash
supabase functions deploy mh-contribuyente
```

### Configurar secrets

```bash
supabase secrets set \
SUPABASE_URL="https://TU-PROYECTO.supabase.co" \
SUPABASE_ANON_KEY="TU_ANON_KEY" \
ALLOWED_ORIGINS="https://erp.tudominio.com,http://localhost:3000" \
MH_CONTRIBUYENTE_API_URL="https://api.hacienda.go.cr/fe/ae" \
MH_CONTRIBUYENTE_API_METHOD="GET" \
MH_CONTRIBUYENTE_QUERY_PARAM="identificacion" \
MH_CONTRIBUYENTE_AUTH_HEADER="Authorization" \
MH_CONTRIBUYENTE_AUTH_SCHEME="Bearer" \
MH_CONTRIBUYENTE_TOKEN="tu-token-api"
```

### Nota de seguridad

`mh-contribuyente` requiere JWT valido en `Authorization: Bearer <access_token>`.

---

## dev-turno-helper (temporal/local)

Abre turno de caja sin UI para entorno de desarrollo. No requiere JWT, se protege con `x-dev-secret`.

### Endpoint

- `POST /functions/v1/dev-turno-helper`
  - headers:
    - `x-dev-secret: <DEV_TURNO_HELPER_SECRET>`
  - body JSON (opcional):
    - `empresa_id`
    - `punto_venta_id`
    - `caja_id`
    - `saldo_inicial`
    - `observacion`
    - `cajero_auth_user_id`

Si no envias IDs, toma los primeros activos.

### Variables de entorno requeridas

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGINS` (debe incluir localhost)
- `DEV_TURNO_HELPER_ENABLED` = `true`
- `DEV_TURNO_HELPER_SECRET` = secreto fuerte

### Deploy (solo local/dev)

```bash
supabase functions deploy dev-turno-helper --no-verify-jwt
```

### Configurar secrets

```bash
supabase secrets set \
SUPABASE_URL="https://TU-PROYECTO.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="TU_SERVICE_ROLE_KEY" \
ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000" \
DEV_TURNO_HELPER_ENABLED="true" \
DEV_TURNO_HELPER_SECRET="cambia-esto-ya"
```

### Ejecucion manual (PowerShell)

```powershell
$URL="https://TU-PROYECTO.supabase.co/functions/v1/dev-turno-helper"
$SECRET="cambia-esto-ya"

Invoke-RestMethod -Method Post `
  -Uri $URL `
  -Headers @{ "x-dev-secret"=$SECRET; "Content-Type"="application/json" } `
  -Body '{"saldo_inicial":50000,"observacion":"apertura dev"}'
```

### Apagado antes de produccion

- Poner `DEV_TURNO_HELPER_ENABLED="false"` o eliminar la funcion.
- Rotar/eliminar `DEV_TURNO_HELPER_SECRET`.

---

## cxc-notify-client

Envia notificaciones de cobro al cliente con adjuntos usando Resend.

### Endpoint

- `GET /functions/v1/cxc-notify-client?empresa_id=<id>`
  - Requiere JWT de usuario autenticado.
  - Devuelve estado funcional de configuracion del envio.
- `POST /functions/v1/cxc-notify-client`
  - Requiere JWT de usuario autenticado en `Authorization: Bearer <access_token>`.
  - La funcion valida el token internamente y valida permiso `cxc:editar` para la empresa.
  - body JSON:
    - `empresa_id` (number)
    - `tercero_id` (number)
    - `etiqueta_envio` (string opcional: `estado_cuenta`, `recordatorio`, `promesa_vencida`, `aviso_formal`)
    - `to_email` (string)
    - `reply_to` (string opcional)
    - `subject` (string)
    - `html` (string)
    - `text` (string, opcional)
    - `attachments` (opcional, max 5):
      - `filename`
      - `content_base64`
      - `content_type`

### Variables de entorno requeridas

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGINS`
- `RESEND_API_KEY`
- `CXC_NOTIFY_FROM_EMAIL` (ej: `Cobros <cobros@tu-dominio.com>`)
- `CXC_NOTIFY_REPLY_TO` (opcional, ej: `cobros@tu-dominio.com`)
- `CXC_NOTIFY_BCC` (opcional, ej: `cobros@tu-dominio.com` para copia oculta automatica)

### Deploy

```bash
supabase functions deploy cxc-notify-client --no-verify-jwt
```

### Nota operativa

- Se despliega con `--no-verify-jwt` para evitar rechazo del gateway y permitir que la funcion haga la validacion JWT internamente.
- Si falta configuracion de correo, la UI debe mostrar al usuario final:
  - `El envio de correos no esta habilitado. Contacte al administrador.`
- Si `CXC_NOTIFY_BCC` esta configurado, cada correo de cobro enviado tambien queda copiado en esa cuenta interna.
