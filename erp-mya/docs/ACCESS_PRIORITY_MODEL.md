# Access Priority Model (Empresa / Usuario / Rol / Permiso)

## Priority Order
1. **Empresa habilita modulos**
   - Source: `empresa_modulos` (if configured).
   - If a module is not active for a company, it is hidden for all users in that company.

2. **Usuario limita modulos dentro de la empresa**
   - Source: `usuarios_empresas_modulos`.
   - If user-module rows exist, they work as a whitelist for that user in that company.

3. **Rol define acciones por modulo**
   - Source: `roles_permisos` + `permisos`.
   - Actions: `ver`, `crear`, `editar`, `eliminar`, `aprobar`.

## Effective Rule
Access is granted only when all filters pass:

`EmpresaModuloActivo AND UsuarioEmpresaActivo AND UsuarioModuloActivo AND RolAccion`

## SQL Components
- Migration: `supabase/008_empresa_usuario_modulo_access.sql`
- Function: `has_module_access(empresa_id, modulo_codigo)`
- Function: `has_permission(empresa_id, modulo_codigo, accion)` (updated)
- RPC: `get_effective_permissions(empresa_id)`
- RPC admin: `set_user_empresa_modules(usuario_empresa_id, modulo_ids[])`

## Admin UX
In `Mantenimientos > Usuarios`:
- Select user.
- Assign company and role as before.
- New section: **Modulos por usuario/empresa**.
- Select company assignment.
- Mark allowed modules.
- Click **Guardar Modulos Usuario**.

## Final User UX
- Login and select company.
- Sidebar only shows modules that pass effective access.
- Submenus and buttons are hidden by action permissions (`crear/editar/eliminar`).

