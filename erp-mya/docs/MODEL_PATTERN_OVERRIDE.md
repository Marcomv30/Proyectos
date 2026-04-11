# Model Pattern: Herencia + Override por Empresa

Patron recomendado para catalogos/configuraciones que deben:
- tener una base comun,
- permitir personalizacion por empresa,
- y poder volver al estado heredado.

## 1) Estructura de datos

Use estas tres capas:

1. `*_base`
- Catalogo maestro global.
- Solo administracion central.

2. `*_empresa`
- Override explicito por empresa.
- Solo filas que realmente cambian.

3. (Opcional) `*_actividad`
- Plantilla por tipo de empresa/actividad.
- Se usa cuando no hay override por empresa.

## 2) Regla de prioridad (obligatoria)

1. Si la empresa tiene filas en `*_empresa` -> usar override por empresa.
2. Si no tiene filas en `*_empresa` -> usar herencia por actividad (si existe).
3. Si no existe herencia por actividad -> usar base global o sin acceso, segun el modulo.

## 3) RPC estandar (backend)

Cada modulo con override debe tener minimo:

1. `set_<modulo>_empresa(p_empresa_id, p_item_ids[])`
- reemplaza configuracion de esa empresa.
- valida sesion y permisos.

2. `clear_<modulo>_empresa_override(p_empresa_id)`
- elimina override de esa empresa.
- vuelve a herencia.

3. `get_<modulo>_empresa_effective(p_empresa_id)`
- devuelve estado efectivo actual para UI/reportes.

## 4) Seguridad (RLS + permisos)

- Todas las RPC en `security definer` con `set search_path = public`.
- Validar:
  - `auth.uid() is not null`
  - `has_permission(p_empresa_id, 'mantenimientos', 'editar')` (o permiso del modulo correspondiente)
- Tablas de override con RLS activo y politicas restringidas.
- Auditar cambios con `audit_event`.

## 5) UI estandar

En la pantalla del modulo (empresa seleccionada), siempre incluir:

1. Indicador de modo:
- `Override por empresa`
- `Herencia por actividad`

2. Boton:
- `Guardar para esta empresa`

3. Boton:
- `Volver a herencia`

4. Mensajeria:
- exito/error visible y corta.

## 6) Contrato UX recomendado

- El usuario siempre trabaja sobre la empresa activa.
- Cambios no deben afectar otras empresas.
- Debe quedar claro cuando esta en override vs herencia.

## 7) Casos ya aplicables en ERP MYA

Prioridad de implementacion:

1. Modulos por empresa (ya implementado)
- `empresa_modulos` + herencia `actividad_modulos`.

2. Modulos por usuario dentro de empresa
- `usuarios_empresas_modulos` sobre lo heredado por empresa.

3. Plan de cuentas
- `plan_cuentas_base` + `plan_cuentas_empresa`.

4. Tipos/categorias de asiento
- base global + override por empresa.

5. Impuestos/retenciones
- base fiscal + override por empresa.

## 8) Checklist rapido por modulo

- [ ] Tabla `*_base` definida
- [ ] Tabla `*_empresa` definida
- [ ] Funcion de acceso efectivo actualizada con prioridad correcta
- [ ] RPC `set_..._empresa` creada
- [ ] RPC `clear_..._empresa_override` creada
- [ ] RLS/politicas y grants aplicados
- [ ] Auditoria de cambios
- [ ] UI con botones guardar/restaurar
- [ ] Vista de depuracion/estado efectivo

