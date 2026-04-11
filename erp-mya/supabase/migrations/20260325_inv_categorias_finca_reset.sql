-- Borrar TODAS las categorías de empresa 3 y reinsertar las 12 correctas
DELETE FROM inv_categorias WHERE empresa_id = 3;

INSERT INTO inv_categorias (empresa_id, nombre, descripcion, codigo_prefijo, activo) VALUES
  (3, 'Agroquímicos',               'Herbicidas, fungicidas, insecticidas y afines',               'AGQ', true),
  (3, 'Fertilizantes',              'Fertilizantes foliares, edáficos y correctores de suelo',    'FER', true),
  (3, 'Material de empaque',        'Cajas, bandejas, colillas, etiquetas y accesorios de empaque','EMP', true),
  (3, 'Herramientas',               'Herramientas manuales y de campo',                            'HER', true),
  (3, 'Repuestos y mantenimiento',  'Repuestos de maquinaria, equipos y labores de mantenimiento', 'REP', true),
  (3, 'Combustibles y lubricantes', 'Diesel, gasolina, aceites y grasas',                         'COM', true),
  (3, 'EPP',                        'Equipo de protección personal',                               'EPP', true),
  (3, 'Riego',                      'Cintas, tuberías, aspersores y accesorios de riego',         'RIE', true),
  (3, 'Limpieza',                   'Productos y materiales de limpieza e higiene',                'LIM', true),
  (3, 'Papelería',                  'Útiles de oficina y papelería general',                      'PAP', true),
  (3, 'Material vegetativo',        'Semillas, hijuelos, plantas y material de siembra',          'MVE', true),
  (3, 'Otros',                      'Artículos que no clasifican en las categorías anteriores',   'OTR', true);
