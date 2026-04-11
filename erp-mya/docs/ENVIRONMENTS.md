# Entornos

Este proyecto maneja dos entornos separados:

- `local`: desarrollo diario en la PC.
- `vps`: despliegue remoto.

No se deben mezclar credenciales, URLs ni claves entre ambos entornos. La unica excepcion es una migracion planificada.

## Regla operativa

- `local` usa su propio `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `REACT_APP_SUPABASE_URL` y `REACT_APP_SUPABASE_ANON_KEY`.
- `vps` usa sus propias claves y su propio backend/Auth.
- Si el VPS autentica y local no, no asumir que es un bug de codigo: primero verificar que cada entorno apunte a su propio stack.

## Archivos usados en local

Frontend:

- `.env`
- `.env.development.local`

Backend:

- `server/.env`

Sincronizacion opcional al VPS sin Git:

- `scripts/sync-frontend-to-vps.ps1`
- `.secrets/frontend-sync.env`
- `.secrets/frontend-sync.env.example`
- se puede disparar desde Superusuario en local usando `FRONTEND_SYNC_CMD`

Los `.env` reales no se versionan. Usar los ejemplos versionados como plantilla.

## Plantillas recomendadas

Frontend local:

- `.env.example`
- `.env.development.local.example`

Backend local:

- `server/.env.example`

## Variables que nunca deben cruzarse

- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Checklist antes de probar login local

1. Confirmar que `server/.env` apunta al backend/Auth local.
2. Confirmar que `.env.development.local` apunta al mismo Supabase del backend local.
3. Reiniciar frontend y backend despues de cambiar variables.
4. Validar `http://localhost:3001/health`.
5. Validar `http://localhost:3000/api/runtime`.

## Migraciones entre local y VPS

Cuando se haga una migracion:

1. Respaldar base y claves del entorno origen.
2. Ejecutar la migracion en el entorno destino.
3. Verificar login y operaciones basicas en el destino.
4. No copiar automaticamente los `.env` del destino al entorno local.
5. Documentar cualquier nueva key o URL generada.

Para migracion de base hacia el VPS, ver:

- `docs/DB_MIGRATION_TO_VPS.md`
