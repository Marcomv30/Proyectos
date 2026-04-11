# Reporting Pattern (ERP MYA)

Directivas obligatorias para reportes nuevos:

1. Encabezado:
- Primero: nombre de empresa.
- Segundo: nombre del reporte (mas pequeno que empresa).
- Subtitulo: solo periodo (`Desde ... Hasta ...`).

2. Pie:
- Fecha/hora de generado.
- Numero de pagina visible (`Pagina 1` en impresion web estandar).

3. Tabla:
- Encabezados centrados.
- Tipografia compacta.
- Numeros en formato `99,999,999.99`.
- Filas sin salto de linea (ellipsis cuando aplique).
- Bordes: mantener marco externo del cuadro, lineas verticales entre columnas y linea de encabezado.
- No usar lineas horizontales en filas de detalle.
- Estandar booleanos:
  - UI/listados: `✓` (true) y `·` (false).
  - Exportaciones (CSV/Excel/PDF): `✓` (true) y vacio (false).
  - Reusar helper comun: `formatBooleanFlag` en `src/utils/reporting.ts`.

4. Paginacion:
- Todo listado grande debe tener paginacion en UI (tamano de pagina configurable o fijo razonable, recomendado 30/50).
- El paginador debe incluir al menos: `Ir al inicio`, `Anterior`, `Siguiente`, `Ir al final`.
- Mostrar rango visible y total (`Mostrando A-B de N`).
- En pantallas de validacion/importacion, incluir filtro `Solo errores` cuando exista columna de error.

5. Implementacion:
- Usar `exportPdfWithPrint` en `src/utils/reporting.ts`.
- No crear plantillas ad-hoc por reporte.
