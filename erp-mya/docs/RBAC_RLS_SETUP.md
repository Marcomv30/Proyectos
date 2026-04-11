# RBAC + RLS Setup

## 1) Ejecutar migración SQL
1. Abre Supabase SQL Editor.
2. Ejecuta el script: `supabase/001_rbac_permisos_rls.sql`.

## 2) Cargar permisos a roles
La migración crea `permisos` para cada fila de `modulos` con acciones:
- `ver`
- `crear`
- `editar`
- `eliminar`
- `aprobar`

Debes asignar permisos a cada rol en `roles_permisos`.

## 3) Requisito clave para la UI
La app valida módulos por `modulos.codigo`.

Tu `modulos.codigo` debe coincidir con los IDs internos de frontend:
- `contabilidad`
- `bancos`
- `proveedores`
- `clientes`
- `inventarios`
- `planilla`
- `activos`
- `cxc`
- `cxp`
- `facturacion`
- `pina`
- `costos`
- `estadisticas`
- `mantenimientos`

## 4) Empresas por usuario
Debe existir asignación activa en `usuarios_empresas`:
- `usuario_id`
- `empresa_id`
- `rol_id`
- `activo = true`

## 5) RLS (aislamiento por empresa)
La migración activa RLS automático para todas las tablas de `public` que tengan columna `empresa_id`, usando función `has_empresa_access(empresa_id)`.

## 6) Paso siguiente recomendado
Migrar login a Supabase Auth y completar `usuarios.auth_user_id` para que RLS funcione también a nivel backend con `auth.uid()`.

## 7) Hardening recomendado (ya implementado)
Ejecutar también:
- `supabase/003_user_provisioning.sql`
- `supabase/004_security_hardening.sql`

Incluye:
- Alta segura de usuarios (Auth + usuarios + usuarios_empresas).
- Reset de contraseña seguro por empresa compartida.
- Auditoría de cambios sensibles (`security_audit_log`).
- Bloqueo temporal por intentos fallidos de login (`login_guard`).

## 8) Alertas y retención (puntos pendientes completados)
Ejecutar:
- `supabase/005_security_alerts_retention.sql`

Incluye:
- Cola de alertas por correo (`security_alert_outbox`) para eventos críticos.
- Destinatarios configurables (`security_alert_recipients`).
- RPC para worker de envío (`claim_security_alerts`, `complete_security_alert`).
- Archivo de bitácora (`security_audit_log_archive`).
- Retención operativa: mantener 180 días en tabla activa y purga histórica.

## 9) Activar envío real de correos (worker)
La migración crea la cola, pero necesitas ejecutar el worker para enviar mails.

1. Deploy de función:
- `supabase functions deploy security-alert-worker`

2. Configurar secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `SECURITY_ALERT_FROM_EMAIL`
- `SECURITY_ALERT_CRON_SECRET` (recomendado)

3. Agregar destinatarios:
- `insert into public.security_alert_recipients(email) values ('seguridad@tuempresa.com');`

4. Configurar cron (cada 1-5 min) para invocar:
- `POST /functions/v1/security-alert-worker` con header `x-cron-secret`.

## 10) Admin de destinatarios desde UI
Ejecutar:
- `supabase/006_security_recipients_admin.sql`

Incluye RPC seguras para administrar destinatarios con permisos de mantenimiento:
- `upsert_security_alert_recipient`
- `set_security_alert_recipient_active`
- `delete_security_alert_recipient`
