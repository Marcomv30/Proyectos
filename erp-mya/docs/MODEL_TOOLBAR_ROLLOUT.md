# Model Toolbar Rollout

Estandar de lista para modulos:

- busqueda rapida
- filtros por estado/tipo
- exportacion CSV/EXCEL/PDF
- acciones de negocio al final (crear/reset/seed)

## Componente base

- `src/components/ListToolbar.tsx`

## Lote 1 (Contabilidad)

- [x] `PlanCuentas.tsx`
- [x] `ListaAsientos.tsx`
- [x] `TiposAsiento.tsx`

## Lote 2 (Mantenimientos)

- [ ] `ListaEmpresas.tsx`
- [ ] `ListaActividades.tsx`
- [ ] `ListaUsuarios.tsx`
- [ ] `ListaRoles.tsx`
- [ ] `ListaModulos.tsx`

## Criterio de cierre por vista

- usa `ListToolbar`
- mantiene filtros existentes
- exporta con columnas definidas
- responsive sin regressions (`<900px` y `<620px`)

