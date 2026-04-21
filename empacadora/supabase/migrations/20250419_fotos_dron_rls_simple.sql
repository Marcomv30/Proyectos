-- RLS simple para emp_fotos_dron y emp_mosaicos
-- Usuarios autenticados pueden insertar y leer (sin restricciones de empresa por ahora)

-- Eliminar políticas anteriores si existen
DROP POLICY IF EXISTS emp_fotos_dron_insert ON emp_fotos_dron;
DROP POLICY IF EXISTS emp_fotos_dron_select ON emp_fotos_dron;
DROP POLICY IF EXISTS emp_mosaicos_insert ON emp_mosaicos;
DROP POLICY IF EXISTS emp_mosaicos_select ON emp_mosaicos;

-- RLS SIMPLE: cualquier usuario autenticado puede insertar
CREATE POLICY emp_fotos_dron_insert_simple ON emp_fotos_dron
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY emp_fotos_dron_select_simple ON emp_fotos_dron
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY emp_mosaicos_insert_simple ON emp_mosaicos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY emp_mosaicos_select_simple ON emp_mosaicos
  FOR SELECT
  TO authenticated
  USING (true);

-- Permitir públicamente LEER (no escribir) desde Storage
CREATE POLICY emp_fotos_dron_select_public ON emp_fotos_dron
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY emp_mosaicos_select_public ON emp_mosaicos
  FOR SELECT
  TO anon
  USING (true);
