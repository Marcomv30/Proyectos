-- Agrega codigo_impuesto (Nota 8 FE v4.4) a inv_productos
-- 01=IVA, 02=Selectivo Consumo, 03=Único Combustibles, 04=Beb.Alcohólicas,
-- 05=Beb.envasadas/jabones, 06=Tabaco, 07=IVA cálculo especial,
-- 08=IVA Bienes Usados, 12=Cemento, 99=Otros

ALTER TABLE inv_productos
  ADD COLUMN IF NOT EXISTS codigo_impuesto CHAR(2) NOT NULL DEFAULT '01';
