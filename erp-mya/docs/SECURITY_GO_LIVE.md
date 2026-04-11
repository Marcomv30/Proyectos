# Security Go-Live Checklist

Fecha: ____ / ____ / ______
Proyecto: ERP MYA
Responsable: ______________________

## 1) Preparación y secretos
- [ ] Rotar `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Rotar `RESEND_API_KEY`.
- [ ] Rotar `SECURITY_ALERT_CRON_SECRET`.
- [ ] Cargar secretos actualizados en Supabase Functions.
- [ ] Verificar que ningún secreto quede en código fuente ni archivos compartidos.

## 2) Migraciones de seguridad
- [ ] `001_rbac_permisos_rls.sql` ejecutado.
- [ ] `003_user_provisioning.sql` ejecutado.
- [ ] `004_security_hardening.sql` ejecutado.
- [ ] `005_security_alerts_retention.sql` ejecutado.
- [ ] `006_security_recipients_admin.sql` ejecutado.

## 3) Validación funcional de controles
- [ ] Login bloquea usuario tras 5 intentos fallidos.
- [ ] Desbloqueo manual desde UI funciona.
- [ ] Bitácora de seguridad registra:
  - [ ] `login_success`
  - [ ] `login_failed`
  - [ ] `login_blocked`
  - [ ] `login_unlocked`
- [ ] Cambios de permisos (`roles_permisos`) se auditan.
- [ ] Cambios de empresa/rol de usuario (`usuarios_empresas`) se auditan.

## 4) Alertas por correo
- [ ] Dominio de envío verificado en Resend.
- [ ] `SECURITY_ALERT_FROM_EMAIL` usa remitente verificado.
- [ ] Destinatarios activos cargados en `security_alert_recipients`.
- [ ] Worker `security-alert-worker` desplegado.
- [ ] Prueba manual de worker responde `ok: true`.
- [ ] Cola `security_alert_outbox` cambia de `pending` a `sent` (o `failed` con error claro).

## 5) Operación automática
- [ ] Cron worker cada 1-5 minutos.
- [ ] Job diario de archivo:
  - [ ] `select public.archive_security_audit_log(180, 5000);`
- [ ] Job diario de purga histórica:
  - [ ] `select public.purge_security_audit_archive(3650);`

## 6) Permisos por Empresa/Usuario/Rol
- [ ] Menús y submenús se muestran solo con permisos efectivos.
- [ ] Vistas críticas no cargan sin permiso de `ver`.
- [ ] Acciones (crear/editar/eliminar/aprobar) se ocultan o bloquean según permiso.
- [ ] Backend/RLS rechaza operación aun si el frontend fue manipulado.

## 7) Evidencias mínimas (adjuntar)
- [ ] Captura de `security_audit_log` con eventos recientes.
- [ ] Captura de `security_alert_outbox` con registros `sent`.
- [ ] Resultado de prueba de bloqueo y desbloqueo.
- [ ] Captura de destinatarios activos en UI.
- [ ] Resultado de jobs de archivo/purga.

## 8) Criterio de aceptación
Go-Live aprobado solo si:
- [ ] No hay secretos expuestos.
- [ ] Alertas críticas se envían correctamente.
- [ ] Bloqueo/desbloqueo funciona.
- [ ] Auditoría está completa.
- [ ] Retención automática está activa.

## 9) Plan de rollback (rápido)
Si falla producción:
1. Desactivar temporalmente cron de worker.
2. Mantener auditoría activa.
3. Revertir último cambio de función/secret.
4. Validar login y permisos base.
5. Rehabilitar cron una vez corregido.

## 10) Aprobaciones
- Seguridad: ______________________  Fecha: __/__/____
- Desarrollo: _____________________  Fecha: __/__/____
- Operaciones: ____________________  Fecha: __/__/____

