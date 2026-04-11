# Responsive Pattern (ERP)

Base oficial para vistas con datos tabulares:

1. Desktop: tabla completa.
2. Mobile (`<= 620px`): tarjetas por registro.

## Regla global ya disponible

En `src/index.css`:

- `.rv-desktop-table`: visible en desktop, oculto en mobile.
- `.rv-mobile-cards`: oculto en desktop, visible en mobile.

## Estructura recomendada

```tsx
<div className="rv-desktop-table">
  {/* tabla */}
</div>

<div className="rv-mobile-cards">
  {/* cards */}
</div>
```

## Checklist para nuevas vistas

- Header y toolbar con `flex-wrap`.
- Inputs y botones full width en mobile.
- Cards con:
  - encabezado (id + estado),
  - datos clave en grid 2 columnas,
  - acciones al final.
- Evitar depender de scroll horizontal en mobile.

## Estado actual (Mar 2026)

Ya homologadas con este patron:

- `Contabilidad`: PlanCuentas, ListaAsientos, MayorGeneral, ReporteAsientosTipo, CatalogoEmpresa, TiposAsiento.
- `Mantenimientos`: ListaActividades, ListaModulos, ListaUsuarios, ListaRoles, EstadoAcceso, BitacoraSeguridad, AlertasDestinatarios.
- `Empresas`: ListaEmpresas.
