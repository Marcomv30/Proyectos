# Puesta En Marcha Turnos De Caja Y Cierre

Guia corta para dejar operativo el flujo de apertura de turno, recaudacion y cierre de caja en `Cuentas por Cobrar`.

## Alcance

El usuario final no debe ejecutar SQL ni configurar funciones. Esta guia es para implementacion, soporte o administracion.

## Requisitos

- Migraciones de caja turnos aplicadas
- Recaudacion enlazada a turno
- Usuario con permisos `cxc:ver` y `cxc:editar`
- Punto de venta y caja activos

## Migraciones SQL requeridas

Ejecutar en SQL Editor:

- [082_caja_turnos_mvp.sql](d:/Proyectos/erp-mya/supabase/082_caja_turnos_mvp.sql)
- [086_recaudacion_turno_enforced.sql](d:/Proyectos/erp-mya/supabase/086_recaudacion_turno_enforced.sql)

Opcionales para demo:

- [083_seed_caja_turnos_demo.sql](d:/Proyectos/erp-mya/supabase/083_seed_caja_turnos_demo.sql)
- [085_seed_caja_turnos_rpc_dev.sql](d:/Proyectos/erp-mya/supabase/085_seed_caja_turnos_rpc_dev.sql)

## Que habilitan estas migraciones

- `public.caja_turnos`
- `public.caja_turno_medios`
- `public.caja_turno_bitacora`
- `public.vw_caja_turnos`
- `public.vw_caja_turno_medios`
- `public.abrir_caja_turno(...)`
- `public.cerrar_caja_turno(...)`
- recaudacion obligatoria ligada a `turno_id`

## Flujo funcional esperado

1. Abrir turno en `Reportes de Cobro y Recaudacion`.
2. Aplicar cobros en `Recaudacion y Aplicacion de Pagos`.
3. El sistema obliga a seleccionar un turno abierto del usuario.
4. Cerrar turno desde `Reportes de Cobro y Recaudacion`.
5. Generar:
   - acta de liquidacion
   - cierre consolidado
   - pagos aplicados

## Que ve el usuario final

### En Recaudacion

- Si no hay turno abierto:
  - `No hay turno de caja abierto para este usuario. Debe abrir turno antes de aplicar cobros.`
- El boton `Aplicar cobro` queda bloqueado.

### En Reportes

- Puede abrir turno
- Puede cerrar su propio turno
- Puede imprimir acta de liquidacion
- Puede ver cierre consolidado

## Reglas de negocio actuales

- Un cajero no puede tener dos turnos abiertos al mismo tiempo.
- Una caja no puede tener dos turnos abiertos al mismo tiempo.
- Solo el cajero del turno puede cerrarlo.
- Un cobro no se registra sin `turno_id`.
- El cierre consolida por turno.

## Function dev temporal

Para pruebas locales se puede usar:

- `dev-turno-helper`

Deploy:

```powershell
supabase functions deploy dev-turno-helper --no-verify-jwt
```

Secrets:

```powershell
supabase secrets set DEV_TURNO_HELPER_ENABLED="true"
supabase secrets set DEV_TURNO_HELPER_SECRET="cambia-esto-ya"
```

Uso:

```powershell
$URL="https://TU-PROYECTO.supabase.co/functions/v1/dev-turno-helper"
$SECRET="cambia-esto-ya"

Invoke-RestMethod -Method Post `
  -Uri $URL `
  -Headers @{ "x-dev-secret"=$SECRET; "Content-Type"="application/json" } `
  -Body '{"saldo_inicial":50000,"observacion":"apertura dev"}'
```

## Verificacion funcional

1. Ir a `Cuentas por Cobrar > Reportes de Cobro y Recaudacion`.
2. Abrir turno.
3. Confirmar que aparezca `Turno abierto`.
4. Ir a `Recaudacion y Aplicacion de Pagos`.
5. Aplicar un cobro.
6. Volver a `Reportes`.
7. Cerrar turno con saldo final fisico.
8. Validar:
   - turno en tabla
   - cierre consolidado
   - acta de liquidacion

## Checklist de soporte

Si no deja cobrar:

1. Confirmar que exista turno abierto del usuario.
2. Confirmar que el turno pertenece a esa caja y punto de venta.
3. Revisar mensaje en pantalla:
   - `turno_caja_requerido`
   - `turno_no_abierto`
   - `turno_no_pertenece_al_usuario`
4. Revisar que `086_recaudacion_turno_enforced.sql` este aplicada.

Si no deja abrir turno:

1. Verificar que haya punto de venta activo.
2. Verificar que haya caja activa.
3. Verificar que el usuario no tenga otro turno abierto.
4. Verificar que la caja no tenga otro turno abierto.

Si no deja cerrar turno:

1. Verificar que el turno siga abierto.
2. Verificar que el usuario actual sea el cajero del turno.
3. Verificar que el cierre se haga desde la vista de reportes.

## Paneles donde revisar

- [ReportesCobro.tsx](d:/Proyectos/erp-mya/src/pages/CXC/ReportesCobro.tsx)
- [RecaudacionPagos.tsx](d:/Proyectos/erp-mya/src/pages/CXC/RecaudacionPagos.tsx)

## No hacer

- No pedir al usuario final que abra turnos por SQL.
- No pedir al usuario final que use `dev-turno-helper` en produccion.
- No dejar `dev-turno-helper` activo al salir a dominio si no es necesario.
