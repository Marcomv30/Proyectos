# Puesta En Marcha Correo CXC

Guia corta para dejar operativo el envio de correos de cobro en `Tramites de Cobro`.

## Alcance

El usuario final no debe configurar nada tecnico. Esta guia es solo para implementacion, soporte o administracion.

## Requisitos

- Dominio verificado en Resend
- DNS propagado correctamente
- Proyecto Supabase enlazado
- Permisos del modulo `cxc`

## Secrets requeridos

Configurar en Supabase:

```powershell
supabase secrets set RESEND_API_KEY="re_xxx"
supabase secrets set CXC_NOTIFY_FROM_EMAIL="Cobros <erp-mya@visionzn.net>"
supabase secrets set CXC_NOTIFY_REPLY_TO="cobros@visionzn.net"
```

## Migraciones SQL

Ejecutar en SQL Editor:

- [087_cxc_correos_bitacora.sql](d:/Proyectos/erp-mya/supabase/087_cxc_correos_bitacora.sql)

Esto crea:

- `public.cxc_correos_bitacora`
- `public.vw_cxc_correos_bitacora`

## Deploy de function

```powershell
supabase functions deploy cxc-notify-client --no-verify-jwt
```

Nota:

- Se usa `--no-verify-jwt` porque la funcion valida el token por dentro.
- No quitar esto sin volver a probar el flujo completo.

## Verificacion funcional

1. Ingresar al ERP con un usuario con permiso `cxc:editar`.
2. Ir a `Cuentas por Cobrar > Tramites de Cobro`.
3. Seleccionar cliente desde `Gestion de Cobro`.
4. Confirmar que en la tarjeta de correo aparezca:
   - `Envio de correos habilitado.`
5. Enviar un correo de prueba.
6. Validar:
   - llegada del correo
   - adjuntos
   - registro en `Bitacora de correos enviados`

## Que ve el usuario final

Si todo esta bien:

- Puede redactar y enviar.

Si falta configuracion:

- Vera: `El envio de correos no esta habilitado. Contacte al administrador.`
- Los campos quedan bloqueados.

## Panel admin

Si el usuario es superusuario, ve un mini diagnostico con:

- estado tecnico
- remitente configurado
- reply-to por defecto
- estado funcional

No expone secrets ni credenciales.

## Checklist de soporte

Si no envia:

1. Revisar panel admin en la UI.
2. Confirmar secrets:
   - `RESEND_API_KEY`
   - `CXC_NOTIFY_FROM_EMAIL`
   - `CXC_NOTIFY_REPLY_TO`
3. Confirmar que la function esta desplegada:
   - `cxc-notify-client`
4. Confirmar que fue desplegada con:
   - `--no-verify-jwt`
5. Revisar bitacora:
   - destino
   - estado
   - detalle de error
6. Si aplica, revisar Resend y DNS del dominio.

## No hacer

- No pedir al usuario final que configure DNS.
- No pedir al usuario final que despliegue functions.
- No exponer API keys ni detalles tecnicos en pantalla operativa.

