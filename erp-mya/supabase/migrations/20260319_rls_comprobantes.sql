-- RLS para tablas de comprobantes electrónicos recibidos
-- Cada empresa sólo puede ver/modificar sus propios comprobantes.
-- El servidor usa service_role (bypass RLS) para insertar desde el proceso de descarga.

-- ─── comprobantes_recibidos ───────────────────────────────────────────────────
ALTER TABLE comprobantes_recibidos ENABLE ROW LEVEL SECURITY;

-- Un usuario autenticado sólo ve comprobantes de empresas a las que tiene acceso
CREATE POLICY "comprobantes_recibidos_select"
  ON comprobantes_recibidos FOR SELECT
  USING (public.has_empresa_access(empresa_id));

-- Sólo el service_role (servidor) puede insertar/actualizar/eliminar.
-- El frontend nunca escribe directamente en esta tabla.
CREATE POLICY "comprobantes_recibidos_insert"
  ON comprobantes_recibidos FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "comprobantes_recibidos_update"
  ON comprobantes_recibidos FOR UPDATE
  USING  (public.has_empresa_access(empresa_id))
  WITH CHECK (public.has_empresa_access(empresa_id));

CREATE POLICY "comprobantes_recibidos_delete"
  ON comprobantes_recibidos FOR DELETE
  USING (auth.role() = 'service_role');

-- ─── comprobantes_lineas ──────────────────────────────────────────────────────
ALTER TABLE comprobantes_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comprobantes_lineas_select"
  ON comprobantes_lineas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM comprobantes_recibidos cr
      WHERE cr.id = comprobantes_lineas.comprobante_id
        AND public.has_empresa_access(cr.empresa_id)
    )
  );

CREATE POLICY "comprobantes_lineas_insert"
  ON comprobantes_lineas FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "comprobantes_lineas_update"
  ON comprobantes_lineas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM comprobantes_recibidos cr
      WHERE cr.id = comprobantes_lineas.comprobante_id
        AND public.has_empresa_access(cr.empresa_id)
    )
  );

CREATE POLICY "comprobantes_lineas_delete"
  ON comprobantes_lineas FOR DELETE
  USING (auth.role() = 'service_role');

-- ─── comprobante_iva_resumen ──────────────────────────────────────────────────
ALTER TABLE comprobante_iva_resumen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comprobante_iva_resumen_select"
  ON comprobante_iva_resumen FOR SELECT
  USING (public.has_empresa_access(empresa_id));

CREATE POLICY "comprobante_iva_resumen_insert"
  ON comprobante_iva_resumen FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "comprobante_iva_resumen_update"
  ON comprobante_iva_resumen FOR UPDATE
  USING  (public.has_empresa_access(empresa_id))
  WITH CHECK (public.has_empresa_access(empresa_id));

CREATE POLICY "comprobante_iva_resumen_delete"
  ON comprobante_iva_resumen FOR DELETE
  USING (auth.role() = 'service_role');
