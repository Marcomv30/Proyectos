-- Corrige movimientos de inventario generados por Notas de Crédito que quedaron
-- con tipo='entrada' en lugar de 'salida'.
--
-- Aplica únicamente a movimientos con origen='xml' cuya referencia apunta a un
-- comprobante de tipo NOTA_CREDITO en la misma empresa.

UPDATE public.inv_movimientos m
SET
  tipo  = 'salida',
  notas = REPLACE(notas, 'Compra —', 'Nota Crédito —')
FROM public.comprobantes_recibidos c
WHERE m.referencia  = c.numero_comprobante
  AND m.empresa_id  = c.empresa_id
  AND m.origen      = 'xml'
  AND m.tipo        = 'entrada'
  AND c.tipo        = 'NOTA_CREDITO';

-- Verificación: muestra los registros afectados (ejecutar por separado si se desea auditar antes)
-- SELECT m.id, m.fecha, m.referencia, m.cantidad, m.tipo, m.notas
-- FROM public.inv_movimientos m
-- JOIN public.comprobantes_recibidos c ON m.referencia = c.numero_comprobante AND m.empresa_id = c.empresa_id
-- WHERE m.origen = 'xml' AND m.tipo = 'entrada' AND c.tipo = 'NOTA_CREDITO';
