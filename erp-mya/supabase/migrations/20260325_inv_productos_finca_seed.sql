-- ─────────────────────────────────────────────────────────────────────────────
-- Catálogo de productos — Finca Piñera (empresa_id = 3)
-- Fuente: Catálogo AVZ
-- Ejecutar una sola vez. Requiere que las 12 categorías inv_categorias ya existan.
-- Productos con activo=false estaban marcados como FALSO en el catálogo original.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_agq BIGINT; v_fer BIGINT; v_emp BIGINT; v_otr BIGINT;
BEGIN
  SELECT id INTO v_agq FROM inv_categorias WHERE empresa_id = 3 AND codigo_prefijo = 'AGQ';
  SELECT id INTO v_fer FROM inv_categorias WHERE empresa_id = 3 AND codigo_prefijo = 'FER';
  SELECT id INTO v_emp FROM inv_categorias WHERE empresa_id = 3 AND codigo_prefijo = 'EMP';
  SELECT id INTO v_otr FROM inv_categorias WHERE empresa_id = 3 AND codigo_prefijo = 'OTR';

-- ── AGROQUÍMICOS (herbicidas, fungicidas, insecticidas, coadyuvantes) ─────────
INSERT INTO inv_productos (empresa_id, codigo, descripcion, categoria_id, tipo, unidad_medida, activo) VALUES
  -- Insecticidas / Nematicidas
  (3, '8',     'MOCAP 72 EC 20LITROS',               v_agq, 'producto', 'L',    true),
  (3, '26',    'OMITOX SOLENOPIS 10 KILOS',           v_agq, 'producto', 'kg',   true),
  (3, '109',   'STORM 0.005 BB 10KILOS',              v_agq, 'producto', 'kg',   true),
  (3, '235',   'ENGEO 24.7 SC 5LITROS',              v_agq, 'producto', 'L',    true),
  (3, '253',   'INTREPID 24 SC 4 LITROS',             v_agq, 'producto', 'L',    true),
  (3, '448',   'BIO BACTER 1LITROS',                  v_agq, 'producto', 'L',    true),
  (3, '572',   'DIMILIN 24 SL GALON',                 v_agq, 'producto', 'gal',  true),
  (3, '576',   'ACTARA 25 WG 500GRM',                 v_agq, 'producto', 'g',    true),
  (3, '853',   'RIMAZINON 60 EC 200LITROS',           v_agq, 'producto', 'L',    true),
  (3, '891',   'REVUS 25 SC 1LITRO',                  v_agq, 'producto', 'L',    true),
  (3, '900',   'PICUDO 20SC 20LT',                    v_agq, 'producto', 'L',    true),
  (3, '905',   'DAC CLORPIRIFOS 48 EC',               v_agq, 'producto', 'L',    true),
  (3, '09',    'GUERRERO 24 EC 20L',                  v_agq, 'producto', 'L',    true),
  (3, '030',   'Tomahawk 20 EC 20LTR',                v_agq, 'producto', 'L',    true),
  (3, '089',   'AIKIDO 2.5 EC 20LITROS',              v_agq, 'producto', 'L',    true),
  (3, '005',   'FANTASMA 12.5 EC 20LITROS',           v_agq, 'producto', 'L',    true),
  (3, '00001', 'ETHERL 48 SL GALON 5L',              v_agq, 'producto', 'gal',  true),
  (3, '00004', 'SENSHU 2.5 EC 20LTS',                 v_agq, 'producto', 'L',    true),
  (3, '02',    'MOSTAR 10.8EC 20LTS',                 v_agq, 'producto', 'L',    true),
  (3, '309',   'WINNER 4 LITROS',                     v_agq, 'producto', 'L',    true),
  (3, '428',   'GALLO 60 WP 10 GRAMOS',               v_agq, 'producto', 'g',    true),
  -- Fungicidas / Bactericidas
  (3, '18',    'COSTAR 18 WG 30 KGS',                 v_agq, 'producto', 'kg',   true),
  (3, '119',   'BIOREP',                               v_agq, 'producto', 'Unid', true),
  (3, '147',   'TRICHO-ECO 20%WP 20Kg',              v_agq, 'producto', 'kg',   true),
  (3, '286',   'BUZIL 72 WP 25 kgs',                  v_agq, 'producto', 'kg',   true),
  (3, '380',   'MAXICOVER 20 LITROS',                  v_agq, 'producto', 'L',    true),
  (3, '383',   'HEXACTO 75 WP 10KILO',                v_agq, 'producto', 'kg',   true),
  (3, '421',   'TIMOREX GOLD 22.3 EC 20LITROS',       v_agq, 'producto', 'L',    true),
  (3, '435',   'CONTROL PHYT CU 20 litros',           v_agq, 'producto', 'L',    true),
  (3, '624',   'DAC PROPINOZALE 25EC 20LT',           v_agq, 'producto', 'L',    true),
  (3, '636',   'STREPTON WP 25KLS',                   v_agq, 'producto', 'kg',   true),
  (3, '640',   'FYTOSAN 20WP 25KLS',                  v_agq, 'producto', 'kg',   true),
  (3, '611',   'BIO-TRI 1000 WP 25 KILOS',           v_agq, 'producto', 'kg',   true),
  (3, '993',   'FORAXIL 24EC 5LITROS',                v_agq, 'producto', 'L',    true),
  (3, '01',    'BELTANOL 50SL 5LTS',                  v_agq, 'producto', 'L',    true),
  (3, '850',   'GALAXY 20LITROS',                     v_agq, 'producto', 'L',    true),
  (3, '997',   'KUMULUS 80WG 25KG',                   v_agq, 'producto', 'kg',   true),
  (3, '00002', 'MICROTHIOL ESPECIAL 80WG 25KG',       v_agq, 'producto', 'kg',   true),
  (3, '08',    'SCHOLAR 23 1LITRO',                   v_agq, 'producto', 'L',    false),
  -- Herbicidas
  (3, '218',   'ATILA 20 SL 20LTS',                   v_agq, 'producto', 'L',    true),
  (3, '228',   'ARMERIL 24SL 200L',                   v_agq, 'producto', 'L',    true),
  (3, '267',   'GALANT 12 EC 20 LITROS',              v_agq, 'producto', 'L',    true),
  (3, '275',   'XENTARI 10.3 WG',                     v_agq, 'producto', 'kg',   true),
  (3, '359',   'AMETRINA 50 SC 20 LITROS',            v_agq, 'producto', 'L',    true),
  (3, '367',   'BASAGRAN 5LITRO',                     v_agq, 'producto', 'L',    true),
  (3, '379',   'STAREX 48 SC 20 LITROS',              v_agq, 'producto', 'L',    true),
  (3, '420',   'DIURON 80 SC 200 LITROS',             v_agq, 'producto', 'L',    true),
  (3, '429',   'ARSENAL 9.46 LITROS',                 v_agq, 'producto', 'L',    true),
  (3, '431',   'DUAL GOLD 20LITRO',                   v_agq, 'producto', 'L',    true),
  (3, '447',   'SHEIK 80 SC .35LTS',                  v_agq, 'producto', 'L',    true),
  (3, '459',   'ESCUDO 20LTS',                         v_agq, 'producto', 'L',    true),
  (3, '480',   'RIMAC AMETRINA 50 SC 200 LTS',        v_agq, 'producto', 'L',    true),
  (3, '490',   'RIMAXONE 20SL 200 LT',                v_agq, 'producto', 'L',    true),
  (3, '497',   'PAREJO 48 SL 10 LTS',                 v_agq, 'producto', 'L',    true),
  (3, '505',   'BROMOREX 30 LTS',                     v_agq, 'producto', 'L',    true),
  (3, '516',   'OPTILUX 48 SL 20 L',                  v_agq, 'producto', 'L',    true),
  (3, '582',   'BENON 50 SL 200LTS',                  v_agq, 'producto', 'L',    true),
  (3, '600',   'DAC GLIFOSATO 200 LTS',               v_agq, 'producto', 'L',    true),
  (3, '622',   'SELECTO XL 20LT',                     v_agq, 'producto', 'L',    true),
  (3, '627',   'SELECT 24 EC 20 LTS',                 v_agq, 'producto', 'L',    true),
  (3, '637',   'Stone 45 EC 20 L',                    v_agq, 'producto', 'L',    true),
  -- Coadyuvantes / Surfactantes / Adherentes
  (3, '266',   'AGRIOIL 98 SL',                       v_agq, 'producto', 'L',    true),
  (3, '311',   'SILWET L 77 100 L 20LTS',             v_agq, 'producto', 'L',    true),
  (3, '514',   'PACK HARD 20 LITRO',                  v_agq, 'producto', 'L',    true),
  (3, '638',   'SILIKON 19LTS',                        v_agq, 'producto', 'L',    true),
  (3, '811',   'SUNFREHS 1000LITROS',                  v_agq, 'producto', 'L',    true),
  (3, '142',   'ACT-2 200 LITROS',                    v_agq, 'producto', 'L',    true),
  (3, '146',   'ZAPICOL 23 LTS',                      v_agq, 'producto', 'L',    true),
  (3, '0003',  'COSMO AGUAS 100SP',                   v_agq, 'producto', 'Unid', true),
  (3, '006',   'DUPLO AL 19LTRS',                     v_agq, 'producto', 'L',    true),
  (3, '355',   'ATP UP .L 20LITRO',                   v_agq, 'producto', 'L',    true),
  (3, '996',   'NITROAMINO 20KILOS',                  v_agq, 'producto', 'kg',   true),
  (3, '021',   'QUARK N 20 LITROS',                   v_agq, 'producto', 'L',    true);

-- ── FERTILIZANTES (foliares, edáficos, bioestimulantes, correctores) ──────────
INSERT INTO inv_productos (empresa_id, codigo, descripcion, categoria_id, tipo, unidad_medida, activo) VALUES
  -- Macronutrientes sólidos
  (3, '13',    'NITRATO DE AMONIO 45 KILOS',          v_fer, 'producto', 'kg',   true),
  (3, '14',    'K.C.L. 25 KILOS',                     v_fer, 'producto', 'kg',   true),
  (3, '15',    'SULFATO DE MAGNESIO 25KILOS',         v_fer, 'producto', 'kg',   true),
  (3, '20',    'CAL DOLOMITA',                         v_fer, 'producto', 'kg',   true),
  (3, '360',   'UREA PRILADA GRANULAR 45 KILOS',      v_fer, 'producto', 'kg',   true),
  (3, '400',   'MAP SOLUBLE 12-61-0',                  v_fer, 'producto', 'kg',   true),
  (3, '559',   'ROSAFERT 12-12-17 50kg',              v_fer, 'producto', 'kg',   true),
  (3, '03',    'YARAMILA COMPLEX 12-11-18',            v_fer, 'producto', 'kg',   true),
  -- Macronutrientes líquidos
  (3, '63',    'FERTIG 8-24-0 20 20 LITROS',          v_fer, 'producto', 'L',    true),
  (3, '65',    'ACIDO FOSFORICO 35 KG',               v_fer, 'producto', 'kg',   true),
  (3, '250',   'FERTI G POTASIO 20 Kilos',            v_fer, 'producto', 'kg',   true),
  (3, '407',   'FERTI G CALCIO 20LTS 44%',            v_fer, 'producto', 'L',    true),
  (3, '414',   'N-LARGE 3.2 SL 208LTS',              v_fer, 'producto', 'L',    true),
  (3, '511',   'AUGE CALCIO 18% 25KG',               v_fer, 'producto', 'kg',   true),
  -- Micronutrientes
  (3, '73',    'ACIDO BORICO S.S.',                   v_fer, 'producto', 'kg',   true),
  (3, '203',   'SULFATO DE HIERRO',                   v_fer, 'producto', 'kg',   true),
  (3, '204',   'SULFATO ZINC',                         v_fer, 'producto', 'kg',   true),
  (3, '260',   'OCTABORATO DE SODIO 25KG',            v_fer, 'producto', 'kg',   true),
  (3, '397',   'RAISAN Cu 20LTRS',                    v_fer, 'producto', 'L',    true),
  (3, '468',   'FOLIVEEX BORO 25 KILOS',              v_fer, 'producto', 'kg',   true),
  (3, '807',   'BORTRAC YARA VITA 10LTS',             v_fer, 'producto', 'L',    true),
  (3, '808',   'CALTRAC YARA VITA 10 LTRS',           v_fer, 'producto', 'L',    true),
  (3, '810',   'MAGTRAC YARA VITA 10LTS',             v_fer, 'producto', 'L',    true),
  (3, '0004',  'FERTIMINS CAB 25KILOS',               v_fer, 'producto', 'kg',   true),
  (3, '0007',  'MICROMINS MAGNESIO 200LTS',           v_fer, 'producto', 'L',    true),
  (3, '008',   'LAST N YARAVITA',                     v_fer, 'producto', 'L',    true),
  -- Correctores de suelo / acidificantes
  (3, '38',    'PROTECSOL MV2 25kG',                  v_fer, 'producto', 'kg',   true),
  (3, '74',    'ACIDO CITRICO ANHIDRO USP 25 kg',     v_fer, 'producto', 'kg',   true),
  (3, '114',   'CARBON ACTIVADO 25kg',                v_fer, 'producto', 'kg',   true),
  (3, '0013',  'Rt Soil 20 LITROS',                   v_fer, 'producto', 'L',    true),
  -- Foliares / bioestimulantes
  (3, '22',    'FITOMARE',                             v_fer, 'producto', 'L',    true),
  (3, '24',    'ROOTING 20 LITROS',                   v_fer, 'producto', 'L',    true),
  (3, '86',    'AGRI FULL',                            v_fer, 'producto', 'L',    true),
  (3, '0127',  'MEGAFOL 20LITRO',                     v_fer, 'producto', 'L',    true),
  (3, '387',   'HUMITEC K',                            v_fer, 'producto', 'L',    true),
  (3, '583',   'ALGA 18 20KLS',                        v_fer, 'producto', 'kg',   true),
  (3, '586',   'INDAGRO H',                            v_fer, 'producto', 'L',    true),
  (3, '604',   'RADIGROW 20LTS',                      v_fer, 'producto', 'L',    true),
  (3, '0002',  'AGROPLANT BALANCE 20LTS',             v_fer, 'producto', 'L',    true),
  (3, '0006',  'KODASTIM 25LTS',                      v_fer, 'producto', 'L',    true),
  (3, '00009', 'ENERGER 10 GRS',                      v_fer, 'producto', 'g',    true),
  (3, '05',    'ACIGIB 10SL 5 LITROS',                v_fer, 'producto', 'L',    true),
  (3, '0011',  'PGR 20LITROS',                         v_fer, 'producto', 'L',    true),
  (3, '0012',  'CONT 20LITROS',                        v_fer, 'producto', 'L',    true),
  -- Microbiológicos / biofertilizantes
  (3, '465',   'EM-ACTIVADO (EM-ONE)',                 v_fer, 'producto', 'L',    true),
  (3, '488',   'SUPER BACTEROL 100',                  v_fer, 'producto', 'L',    true),
  (3, '0008',  'BIOBACTER 280 1LTS',                  v_fer, 'producto', 'L',    true);

-- ── MATERIAL DE EMPAQUE (bandejas, colillas, divisores, accesorios) ────────────
INSERT INTO inv_productos (empresa_id, codigo, descripcion, categoria_id, tipo, unidad_medida, activo) VALUES
  -- Piola / amarre
  (3, '196',       'MECATE PIOLA BLANCO 180 LB',                      v_emp, 'producto', 'Unid', true),
  (3, '0001',      'PIOLA',                                             v_emp, 'producto', 'Unid', true),
  -- Bandejas Kraft (negra/natural)
  (3, 'BK-0096',   'BANDEJA PIÑA GENERICA NEGRA BAJA KRAFT',          v_emp, 'producto', 'Unid', true),
  (3, 'BK-0742',   'BANDEJA PIÑA SIMBA BAJA KRAFT (637)',              v_emp, 'producto', 'Unid', true),
  (3, 'BK-0766',   'BANDEJA PIÑA SIMBA MINI KRAFT (636)',              v_emp, 'producto', 'Unid', true),
  (3, 'BK-0669',   'BANDEJA GENERICA KRAFT NEGRA MINI',               v_emp, 'producto', 'Unid', true),
  (3, 'BK-0603',   'BANDEJA GENERICA ALTA KRAFT',                     v_emp, 'producto', 'Unid', true),
  (3, 'BK-0500',   'BANDEJA GENERICA KRAFT VERDE',                    v_emp, 'producto', 'Unid', true),
  (3, 'BK-0013',   'BANDEJA PIÑA GENERICA ALTA KRAFT',                v_emp, 'producto', 'Unid', true),
  (3, 'BK-0826',   'BANDEJA METRO CHEP PINEAPPLE BAJA',               v_emp, 'producto', 'Unid', true),
  (3, 'BK-1014-01','BANDEJA SIMBA CROWNLESS PIÑA BAJA REF (637)',      v_emp, 'producto', 'Unid', true),
  (3, 'BK-1032-01','BANDEJA SIMBA CROWNLESS MINI REF (636)',           v_emp, 'producto', 'Unid', true),
  (3, '056',       'BANDEJA GENERICA ALTA KRAFT (056)',                v_emp, 'producto', 'Unid', true),
  (3, '057',       'BANDEJA GENERICA KRAFT VERDE (057)',               v_emp, 'producto', 'Unid', true),
  -- Bandejas Blancas (marca)
  (3, 'BM-0707',   'BANDEJA ORSERO PACK ORO PIÑA BAJA BLANCA',        v_emp, 'producto', 'Unid', true),
  (3, 'BM-0811',   'BANDEJA ORSERO PIÑA BAJA BLANCA (637)',            v_emp, 'producto', 'Unid', true),
  (3, 'BM-0857',   'BANDEJA ORSERO PIÑA MINI BLANCA (636)',            v_emp, 'producto', 'Unid', true),
  (3, 'BM-1052-01','BANDEJA CAPEXO',                                   v_emp, 'producto', 'Unid', true),
  (3, 'BM-0658',   'BANDEJA ITACU PINEAPPLES MINI SENC (676)',         v_emp, 'producto', 'Unid', true),
  (3, 'BM-0659',   'BANDEJA ITACU PINEAPPLES BAJA SENC (664)',         v_emp, 'producto', 'Unid', true),
  (3, 'BM-1016',   'BANDEJA TAPA ORSERO ORO 15-3 CM #2 BLANCA',       v_emp, 'producto', 'Unid', false),
  (3, 'BM-1071',   'BANDEJA TAPA CAPEXO PIÑA VERTICAL BLANCA',        v_emp, 'producto', 'Unid', false),
  (3, 'BK-0898',   'BANDEJA FONDO ORSERO ORO 15-3CM #2 KRAFT',        v_emp, 'producto', 'Unid', false),
  (3, 'FM-0079',   'FONDO PIÑA CAPEXO VERTICAL REFORZADO BLANCA',     v_emp, 'producto', 'Unid', false),
  -- Divisores y láminas
  (3, 'DK-0028',   'DIVISOR PIÑA ALTURA 13CM KRAFT (262)',            v_emp, 'producto', 'Unid', true),
  (3, 'DK-0029',   'DIVISOR PIÑA ALTURA 14 CM KRAFT (261)',           v_emp, 'producto', 'Unid', true),
  (3, 'DK-0071',   'DIVISOR CAJA 6 UND KRAFT',                        v_emp, 'producto', 'Unid', true),
  (3, 'LK-0091',   'LAMINA 6 HUECOS KRAFT (642)',                     v_emp, 'producto', 'Unid', true),
  (3, 'PS-0044',   'PAD PARA CUBRIR TARIMA 55x47.25 KRAFT',           v_emp, 'producto', 'Unid', true),
  -- Colillas Orsero
  (3, '027',    'COLILLA ORSERO #5',      v_emp, 'producto', 'Unid', true),
  (3, '028',    'COLILLA ORSERO #6',      v_emp, 'producto', 'Unid', true),
  (3, '029',    'COLILLA ORSERO #7',      v_emp, 'producto', 'Unid', true),
  (3, '031',    'COLILLA ORSERO #8',      v_emp, 'producto', 'Unid', true),
  (3, '032',    'COLILLA ORSERO #9',      v_emp, 'producto', 'Unid', true),
  (3, '033',    'COLILLA ORSERO #10',     v_emp, 'producto', 'Unid', true),
  -- Colillas Simba
  (3, '034',    'COLILLA SIMBA #5',       v_emp, 'producto', 'Unid', true),
  (3, '035',    'COLILLA SIMBA #6',       v_emp, 'producto', 'Unid', true),
  (3, '036',    'COLILLA SIMBA #7',       v_emp, 'producto', 'Unid', true),
  (3, '037',    'COLILLA SIMBA #8',       v_emp, 'producto', 'Unid', true),
  (3, '038',    'COLILLA SIMBA #9',       v_emp, 'producto', 'Unid', true),
  (3, '039',    'COLILLA SIMBA #10',      v_emp, 'producto', 'Unid', true),
  -- Colillas Orsero Oro
  (3, '040',    'COLILLA ORSERO ORO #5',  v_emp, 'producto', 'Unid', true),
  (3, '041',    'COLILLA ORSERO ORO #6',  v_emp, 'producto', 'Unid', true),
  (3, '042',    'COLILLA ORSERO ORO #7',  v_emp, 'producto', 'Unid', true),
  (3, '043',    'COLILLA ORSERO ORO #8',  v_emp, 'producto', 'Unid', true),
  (3, '044',    'COLILLA ORSERO ORO #9',  v_emp, 'producto', 'Unid', true),
  (3, '045',    'COLILLA ORSERO ORO #10', v_emp, 'producto', 'Unid', true),
  -- Otras colillas
  (3, '046',    'COLILLA CONAD',          v_emp, 'producto', 'Unid', true),
  (3, '049',    'COLILLA CAPEXO',         v_emp, 'producto', 'Unid', true),
  (3, '087',    'COLILLA',               v_emp, 'producto', 'Unid', true),
  -- Colillas serie 03xxx (códigos alternativos del mismo catálogo)
  (3, '03027',  'COLILLA ORSERO #5',      v_emp, 'producto', 'Unid', true),
  (3, '03028',  'COLILLA ORSERO #6',      v_emp, 'producto', 'Unid', true),
  (3, '03029',  'COLILLA ORSERO #7',      v_emp, 'producto', 'Unid', true),
  (3, '03031',  'COLILLA ORSERO #8',      v_emp, 'producto', 'Unid', true),
  (3, '03032',  'COLILLA ORSERO #9',      v_emp, 'producto', 'Unid', true),
  (3, '03034',  'COLILLA SIMBA #5',       v_emp, 'producto', 'Unid', true),
  (3, '03035',  'COLILLA SIMBA #6',       v_emp, 'producto', 'Unid', true),
  (3, '03036',  'COLILLA SIMBA #7',       v_emp, 'producto', 'Unid', true),
  (3, '03037',  'COLILLA SIMBA #8',       v_emp, 'producto', 'Unid', true),
  (3, '03038',  'COLILLA SIMBA #9',       v_emp, 'producto', 'Unid', true),
  (3, '03040',  'COLILLA ORSERO ORO #5',  v_emp, 'producto', 'Unid', true),
  (3, '03041',  'COLILLA ORSERO ORO #6',  v_emp, 'producto', 'Unid', true),
  (3, '03042',  'COLILLA ORSERO ORO #7',  v_emp, 'producto', 'Unid', true),
  (3, '03043',  'COLILLA ORSERO ORO #8',  v_emp, 'producto', 'Unid', true),
  (3, '03044',  'COLILLA ORSERO ORO #9',  v_emp, 'producto', 'Unid', true),
  (3, '03046',  'COLILLA CONAD',          v_emp, 'producto', 'Unid', true);

-- ── OTROS (equipos, misceláneos) ──────────────────────────────────────────────
INSERT INTO inv_productos (empresa_id, codigo, descripcion, categoria_id, tipo, unidad_medida, activo) VALUES
  (3, '050', 'BRASS LINEAR SCALE 12LBX2OZ BALANCIN', v_otr, 'producto', 'Unid', true),
  (3, '001', 'Varios',                                 v_otr, 'producto', 'Unid', true),
  (3, '004', 'TERMOGRAFO EMERSON',                     v_otr, 'producto', 'Unid', false);

END;
$$;
