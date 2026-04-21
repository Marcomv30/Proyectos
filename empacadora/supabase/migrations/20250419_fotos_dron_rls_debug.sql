-- DEBUG: RLS ultraminimalista sin autenticación (solo para TEST)
-- ADVERTENCIA: Esto hace las tablas públicas. Solo para diagnosticar.

-- Desactivar RLS temporalmente para diagnosticar
ALTER TABLE emp_fotos_dron DISABLE ROW LEVEL SECURITY;
ALTER TABLE emp_mosaicos DISABLE ROW LEVEL SECURITY;

-- Volver a activar SIN POLÍTICAS (= acceso público total)
ALTER TABLE emp_fotos_dron ENABLE ROW LEVEL SECURITY;
ALTER TABLE emp_mosaicos ENABLE ROW LEVEL SECURITY;

-- Permitir INSERT/SELECT a TODOS (incluyendo anon) para TEST
CREATE POLICY emp_fotos_dron_insert_debug ON emp_fotos_dron
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY emp_fotos_dron_select_debug ON emp_fotos_dron
  FOR SELECT
  USING (true);

CREATE POLICY emp_mosaicos_insert_debug ON emp_mosaicos
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY emp_mosaicos_select_debug ON emp_mosaicos
  FOR SELECT
  USING (true);
