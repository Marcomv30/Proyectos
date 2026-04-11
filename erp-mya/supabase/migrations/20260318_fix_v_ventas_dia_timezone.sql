-- Corrige v_ventas_dia para usar zona horaria America/Costa_Rica (UTC-6)
-- El campo end_at es TIMESTAMPTZ en UTC; sin conversión, ventas de noche
-- aparecen en el día siguiente UTC en lugar del día local correcto.

CREATE OR REPLACE VIEW v_ventas_dia AS
SELECT
  vc.empresa_id,
  (vc.end_at AT TIME ZONE 'America/Costa_Rica')::DATE AS fecha,
  vc.pump_id,
  d.descripcion AS bomba,
  gc.nombre AS combustible,
  COUNT(*) AS transacciones,
  SUM(vc.volume) AS litros_total,
  SUM(vc.money) AS monto_total,
  AVG(vc.ppu) AS ppu_promedio
FROM ventas_combustible vc
LEFT JOIN dispensadores d ON d.empresa_id = vc.empresa_id AND d.pump_id = vc.pump_id
LEFT JOIN grados_combustible gc ON gc.empresa_id = vc.empresa_id AND gc.grade_id = vc.grade_id
GROUP BY vc.empresa_id, fecha, vc.pump_id, d.descripcion, gc.nombre;
