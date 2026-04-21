-- RLS para emp_fotos_dron y emp_mosaicos
-- Permite que usuarios autenticados inserten fotos de su empresa

-- Habilitar RLS
ALTER TABLE emp_fotos_dron ENABLE ROW LEVEL SECURITY;
ALTER TABLE emp_mosaicos ENABLE ROW LEVEL SECURITY;

-- Política para emp_fotos_dron: usuarios autenticados pueden insertar fotos de su empresa
CREATE POLICY emp_fotos_dron_insert ON emp_fotos_dron
  FOR INSERT
  TO authenticated
  WITH CHECK (
    empresa_id = (
      SELECT COALESCE(
        (current_setting('app.empresa_id', true))::integer,
        (SELECT empresa_id FROM auth.users WHERE id = auth.uid() LIMIT 1)
      )
    )
  );

-- Política para emp_fotos_dron: usuarios pueden leer fotos de su empresa
CREATE POLICY emp_fotos_dron_select ON emp_fotos_dron
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = (
      SELECT COALESCE(
        (current_setting('app.empresa_id', true))::integer,
        (SELECT empresa_id FROM auth.users WHERE id = auth.uid() LIMIT 1)
      )
    )
  );

-- Política para emp_mosaicos: usuarios pueden insertar mosaicos de su empresa
CREATE POLICY emp_mosaicos_insert ON emp_mosaicos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    empresa_id = (
      SELECT COALESCE(
        (current_setting('app.empresa_id', true))::integer,
        (SELECT empresa_id FROM auth.users WHERE id = auth.uid() LIMIT 1)
      )
    )
  );

-- Política para emp_mosaicos: usuarios pueden leer mosaicos de su empresa
CREATE POLICY emp_mosaicos_select ON emp_mosaicos
  FOR SELECT
  TO authenticated
  USING (
    empresa_id = (
      SELECT COALESCE(
        (current_setting('app.empresa_id', true))::integer,
        (SELECT empresa_id FROM auth.users WHERE id = auth.uid() LIMIT 1)
      )
    )
  );
