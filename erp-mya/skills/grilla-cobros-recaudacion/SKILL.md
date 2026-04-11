---
name: grilla-cobros-recaudacion
description: Disenar, implementar y ajustar grillas operativas para aplicacion de cobros y recaudos en ERP web (React + Supabase), con captura por factura, checks por fila, totales en vivo, navegacion por teclado (Enter/PgUp), validaciones de monto y cierre por forma de pago. Usar cuando el usuario pida mejoras de UX/flujo en pantallas de cobro por documentos, diferencias por descuento/ajuste, integracion entre vistas de Gestion de Cobro y Recaudacion, o reportes/tablas de auxiliar bancario derivados del cobro.
---

# Grilla Cobros Recaudacion

## Overview

Implementar cambios de grilla de cobros sin romper validaciones de negocio ni integracion con backend de recaudacion.

## Flujo Base

1. Identificar la pantalla objetivo.
- Revisar `src/pages/CXC/RecaudacionPagos.tsx` para captura por factura.
- Revisar `src/pages/CXC/CarteraCxc.tsx` y `src/App.tsx` si hay navegacion entre Gestion de Cobro y Recaudacion.

2. Preservar reglas operativas.
- Validar que pago por factura no exceda saldo.
- Validar que total aplicado no exceda monto disponible (monto recibido + ajuste autorizado).
- Mantener estados de negocio definidos por backend (`borrador`, `confirmado`, `contabilizado`, `conciliado`, `anulado`).

3. Mejorar UX de captura.
- Usar input numerico legible (separadores, alineacion derecha).
- Implementar atajos de teclado cuando se pida velocidad operativa (`Enter`, `PgUp`, flechas).
- Implementar acciones masivas (`Aplicar todos`, checks por fila).

4. Mantener consistencia visual.
- Evitar abreviaciones tecnicas en textos visibles al usuario final.
- Priorizar etiquetas claras: `Monto recibido`, `Ajuste por diferencia`, `Motivo de diferencia`, `No aplicado`.

5. Verificar y cerrar.
- Compilar con `npm run build`.
- Confirmar que el flujo critico funcione:
  - cargar cliente
  - digitar/seleccionar pagos
  - calcular totales
  - aplicar cobro
  - ver registro en historial/auxiliar

## Checklist de Cambios en Grilla

- Alinear montos a la derecha en inputs y columnas de importes.
- Formatear montos al salir del campo o al confirmar con teclado.
- Mantener navegacion vertical en captura por filas.
- Mantener grilla usable en desktop sin desbordes criticos.
- Evitar bloquear al usuario con reglas ambiguas; mostrar mensajes concretos de error.

## Backend Relacionado

Aplicar cambios de frontend considerando estas migraciones:
- `supabase/076_recaudacion_pagos_base.sql`
- `supabase/077_recaudacion_diferencias.sql`

Si la UX nueva requiere columnas/campos nuevos, agregar migracion incremental nueva; no reescribir migraciones anteriores.
