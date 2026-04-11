# Migracion DB a VPS

Script repetible:

- [scripts/migrate-db-to-vps.ps1](/d:/Proyectos/erp-mya/scripts/migrate-db-to-vps.ps1)

## Que migra

- Todo el esquema `public` de la app.
- `auth.users`
- `auth.identities`

## Que no migra

- Esquemas internos del stack self-hosted como `storage`, `realtime`, `extensions`, etc.

Eso es intencional: restaurar el cluster completo encima de Supabase self-hosted rompe ownership, event triggers y objetos internos.

## Requisitos

- `pg_dump` y `psql` de PostgreSQL 17 instalados en Windows.
- Acceso SSH al VPS.
- Password de la BD origen.
- Password del usuario `supabase_admin` en el VPS.

## Uso

### Opcion recomendada: archivo local no versionado

Crear:

- `.secrets/db-migration.env`

Plantilla:

- `.secrets/db-migration.env.example`

Luego ejecutar:

```powershell
cd d:\Proyectos\erp-mya
.\scripts\migrate-db-to-vps.ps1
```

### Opcion manual: parametros

```powershell
cd d:\Proyectos\erp-mya

.\scripts\migrate-db-to-vps.ps1 `
  -SourceDbPassword "PASSWORD_ORIGEN" `
  -VpsPassword "PASSWORD_SSH_VPS" `
  -VpsDbPassword "PASSWORD_DB_VPS"
```

## Que hace

1. Exporta `public`.
2. Exporta `auth.users` y `auth.identities`.
3. Limpia incompatibilidades de PostgreSQL 17 -> 15.
4. Hace backup previo del VPS.
5. Detiene servicios de Supabase que pueden interferir.
6. Restaura `public`.
7. Reaplica permisos del esquema `public` para `postgres`, `anon`, `authenticated` y `service_role`.
8. Reemplaza usuarios Auth.
9. Vuelve a levantar el stack y verifica que `supabase-kong` quede `healthy`.
10. Imprime conteos de validacion.

## Validacion esperada

El script imprime conteos como:

```text
usuarios=...
empresas=...
usuarios_empresas=...
roles=...
modulos=...
roles_permisos=...
auth.users=...
auth.identities=...
```

Si esos conteos coinciden con origen, la migracion quedo consistente a nivel de app y login.

## Nota importante

Si se recrea el esquema `public` sin reponer sus grants, el VPS puede quedar con errores como:

- `permission denied for schema public`
- login devolviendo `Usuario o contraseña incorrectos` aunque el usuario exista

El script ya deja resuelto ese punto automaticamente.
