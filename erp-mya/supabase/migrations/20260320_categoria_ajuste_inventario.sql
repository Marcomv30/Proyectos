-- Agregar categoría de asiento dedicada para Ajustes de Inventario
-- Se asigna al mismo tipo que "AJ - Asiento de Ajuste" (tipo_id = 5, AJUSTES)

INSERT INTO asiento_categorias (codigo, descripcion, activo, tipo_id)
SELECT 'AI', 'Ajuste de Inventario', true, tipo_id
FROM asiento_categorias
WHERE codigo = 'AJ'
ON CONFLICT (codigo) DO NOTHING;

-- Agregar a las categorías efectivas de todas las empresas que ya tengan AJ configurado
INSERT INTO asiento_categorias_empresa (empresa_id, categoria_base_id, codigo, descripcion, tipo_id)
SELECT
  ace.empresa_id,
  ac_new.id,
  ac_new.codigo,
  ac_new.descripcion,
  ac_new.tipo_id
FROM asiento_categorias_empresa ace
JOIN asiento_categorias ac_aj  ON ac_aj.codigo  = 'AJ' AND ac_aj.id = ace.categoria_base_id
CROSS JOIN (SELECT id, codigo, descripcion, tipo_id FROM asiento_categorias WHERE codigo = 'AI') ac_new
ON CONFLICT DO NOTHING;
