import { createClient } from '@supabase/supabase-js';
import { requirePermission } from '../lib/authz.js';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const round4 = (n) => Math.round(Number(n) * 10000) / 10000;

async function normalizarCuentasEmpresa(empresa_id, valores = []) {
  const ids = [...new Set((valores || []).map((v) => Number(v || 0)).filter(Boolean))];
  if (!ids.length) return { cuentasEmpresa: [], resolverEmpresa: () => null };

  const { data: cuentasEmpresa } = await getSupabase()
    .from('plan_cuentas_empresa')
    .select('id, cuenta_base_id')
    .eq('empresa_id', empresa_id)
    .or(ids.map((id) => `id.eq.${id},cuenta_base_id.eq.${id}`).join(','));

  const resolverEmpresa = (valor) => {
    const raw = Number(valor || 0);
    if (!raw) return null;
    const match = (cuentasEmpresa || []).find((c) => Number(c.id) === raw || Number(c.cuenta_base_id || 0) === raw);
    return Number(match?.id || raw) || null;
  };

  return { cuentasEmpresa: cuentasEmpresa || [], resolverEmpresa };
}

async function getConfigCxp(empresa_id) {
  const { data } = await getSupabase()
    .from('empresa_config_cxp').select('*').eq('empresa_id', empresa_id).maybeSingle();
  if (!data) return {};

  const { resolverEmpresa } = await normalizarCuentasEmpresa(empresa_id, [
    data.cuenta_cxp_id,
    data.cuenta_gasto_id,
    data.cuenta_iva_credito_id,
    data.cuenta_iva_gasto_id,
    data.cuenta_otros_cargos_id,
    data.cuenta_inventario_id,
  ]);

  return {
    ...data,
    cuenta_cxp_id: resolverEmpresa(data.cuenta_cxp_id),
    cuenta_gasto_id: resolverEmpresa(data.cuenta_gasto_id),
    cuenta_iva_credito_id: resolverEmpresa(data.cuenta_iva_credito_id),
    cuenta_iva_gasto_id: resolverEmpresa(data.cuenta_iva_gasto_id),
    cuenta_otros_cargos_id: resolverEmpresa(data.cuenta_otros_cargos_id),
    cuenta_inventario_id: resolverEmpresa(data.cuenta_inventario_id),
  };
}

async function getConfigInventario(empresa_id) {
  const { data } = await getSupabase()
    .from('empresa_config_inventario').select('*').eq('empresa_id', empresa_id).maybeSingle();
  if (!data) return {};

  const cfg = { ...data };
  const { resolverEmpresa } = await normalizarCuentasEmpresa(empresa_id, [
    cfg.cuenta_inventario_id,
    cfg.cuenta_costo_ventas_id,
    cfg.cuenta_ajuste_inv_id,
  ]);

  return {
    ...cfg,
    cuenta_inventario_id: resolverEmpresa(cfg.cuenta_inventario_id),
    cuenta_costo_ventas_id: resolverEmpresa(cfg.cuenta_costo_ventas_id),
    cuenta_ajuste_inv_id: resolverEmpresa(cfg.cuenta_ajuste_inv_id),
  };
}

async function getCategoriaCompras(empresa_id, cfg) {
  if (cfg.categoria_compras_id) return cfg.categoria_compras_id;
  const { data } = await getSupabase()
    .from('asiento_categorias').select('id').eq('empresa_id', empresa_id).order('id').limit(1).maybeSingle();
  return data?.id || null;
}

// Devuelve cuentas del plan base para enriquecer las líneas sugeridas con código+nombre
async function getCuentasInfo(empresa_id, cuentaIds) {
  const ids = [...new Set(cuentaIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data } = await getSupabase()
    .from('plan_cuentas_empresa').select('id, codigo, nombre').eq('empresa_id', empresa_id).in('id', ids);
  const map = {};
  (data || []).forEach(c => { map[c.id] = c; });
  return map;
}

// ─── Generador de líneas sugeridas (puro, sin efectos) ────────────────────────

function generarLineas(comp, lineas, ivaResumen, cfg, cfgInv = {}) {
  const { cuenta_cxp_id: cuentaCxpId, cuenta_gasto_id: cuentaGastoId,
          cuenta_iva_credito_id: cuentaIvaCreditoId, cuenta_iva_gasto_id: cuentaIvaGastoId,
          cuenta_otros_cargos_id: cuentaOtrosCargosId } = cfg;
  const { cuenta_inventario_id: cuentaInvId } = cfgInv;

  const propPorc  = Number(comp.proporcionalidad ?? 100) / 100;
  const ref       = comp.numero_comprobante || `CR-${comp.id}`;
  const esUSD     = (comp.moneda || 'CRC').toUpperCase() === 'USD';
  const tc        = Number(comp.tipo_cambio || 1);
  const resultado = [];

  const mk = (cuenta_id, descripcion, debito, credito) => ({
    linea:       resultado.length + 1,
    cuenta_id:   cuenta_id || null,
    descripcion,
    referencia:  ref,
    debito_usd:  esUSD ? round2(debito)       : 0,
    credito_usd: esUSD ? round2(credito)      : 0,
    debito_crc:  esUSD ? round2(debito * tc)  : round2(debito),
    credito_crc: esUSD ? round2(credito * tc) : round2(credito),
  });

  // 6a. Subtotal líneas → inventario (mercadería) o gasto (servicios)
  // a_inventario: true=forzar inv, false=forzar gasto, null=auto por tipo_linea
  const vaAInventario = (l) =>
    l.a_inventario === true  ? true  :
    l.a_inventario === false ? false :
    l.tipo_linea === 'M';

  // Paso 1: calcular subtotales para poder resolver ivaParaGasto (residual depende de totalSubtotal)
  const lineasMerc = (lineas || []).filter(l => cuentaInvId && vaAInventario(l));
  const lineasSvc  = (lineas || []).filter(l => !(cuentaInvId && vaAInventario(l)));
  const totalMerc  = lineasMerc.reduce((s, l) => s + Number(l.subtotal || 0), 0);
  const totalSvc   = lineasSvc.reduce((s, l)  => s + Number(l.subtotal || 0), 0);
  const totalSubtotal = totalMerc + totalSvc;

  // Cuando prop = 0%: IVA no acreditable se incorpora al costo, no va a cuenta de impuesto separada
  const ivaParaGasto = (() => {
    if (propPorc !== 0 || !lineas?.length) return 0;
    if (ivaResumen?.length) {
      return ivaResumen.reduce((s, iva) => {
        const monto = round2(Number(iva.monto_iva || 0) - Number(iva.monto_exonerado || 0));
        return s + (monto > 0 ? monto : 0);
      }, 0);
    }
    // Residual: IVA implícito en el total
    const ivaResidual = round2(Number(comp.total_comprobante) - totalSubtotal - Number(comp.total_otros_cargos || 0));
    return ivaResidual > 0 ? ivaResidual : 0;
  })();

  // Paso 2: empujar líneas de gasto/inventario con IVA incorporado si prop = 0%
  if (lineas?.length) {
    if (cuentaInvId) {
      if (totalMerc > 0) {
        // Inventario: si NO hay líneas de servicio, el IVA va aquí
        const mercConIva = round2(totalMerc + (totalSvc === 0 ? ivaParaGasto : 0));
        resultado.push(mk(cuentaInvId, `Inventario mercadería — ${lineasMerc.length} línea(s)`, mercConIva, 0));
      }
      if (totalSvc > 0) {
        // Gasto: siempre absorbe el IVA cuando prop = 0%
        const svcConIva = round2(totalSvc + ivaParaGasto);
        resultado.push(mk(cuentaGastoId, `Servicios y gastos — ${lineasSvc.length} línea(s)`, svcConIva, 0));
      }
    } else {
      const comprasConIva = round2(totalSubtotal + ivaParaGasto);
      resultado.push(mk(cuentaGastoId, `Compras — ${lineas.length} línea(s)`, comprasConIva, 0));
    }
  }

  // 6b. IVA
  const totalOtros = Number(comp.total_otros_cargos || 0);
  const ivaRows = ivaResumen?.length
    ? ivaResumen
    : (() => {
        const ivaResidual = round2(Number(comp.total_comprobante) - totalSubtotal - totalOtros);
        return ivaResidual > 0
          ? [{ tarifa_porc: null, monto_iva: ivaResidual }]
          : [];
      })();

  // Cuando proporcionalidad = 0%: el IVA es 100% no acreditable → se incorpora al costo,
  // no se registra en cuentas de impuesto. Ya fue sumado a la línea de gasto arriba.
  if (propPorc === 0) {
    // No se generan líneas de IVA separadas; el monto ya está en el gasto.
  } else {
    for (const iva of ivaRows) {
      const montoGruto    = Number(iva.monto_iva || 0);
      const montoExon     = Number(iva.monto_exonerado || 0);
      const monto         = round2(montoGruto - montoExon);
      if (monto === 0) continue;
      const acreditable   = round2(monto * propPorc);
      const noAcreditable = round2(monto - acreditable);
      const tarifa = iva.tarifa_porc != null ? `${iva.tarifa_porc}%` : '';
      const sufijo = tarifa ? ` ${tarifa}` : '';
      const exonInfo = montoExon > 0 ? ` [Exon. ₡${montoExon.toLocaleString('es-CR')}]` : '';
      if (acreditable > 0)
        resultado.push(mk(cuentaIvaCreditoId,
          `IVA crédito fiscal${sufijo} (${comp.proporcionalidad}%)${exonInfo}`, acreditable, 0));
      if (noAcreditable > 0)
        resultado.push(mk(cuentaIvaGastoId || cuentaGastoId,
          `IVA no acreditable${sufijo} (${100 - comp.proporcionalidad}%)${exonInfo}`, noAcreditable, 0));
    }
  }

  // 6c. Otros cargos
  if (totalOtros > 0)
    resultado.push(mk(cuentaOtrosCargosId || cuentaGastoId,
      'Otros cargos (Cruz Roja, 911, Bomberos, etc.)', totalOtros, 0));

  // 6d. CXP → crédito
  resultado.push(mk(cuentaCxpId, `CXP — ${comp.emisor_nombre}`, 0, Number(comp.total_comprobante)));

  // Nota de Crédito recibida: el proveedor nos devuelve → invertir todos los débitos/créditos
  // (NC reduce el gasto y el IVA acreditable, y cancela parcialmente la CXP)
  if (comp.tipo === 'NOTA_CREDITO') {
    return resultado.map(l => ({
      ...l,
      debito_crc:  round2(l.credito_crc),
      credito_crc: round2(l.debito_crc),
      debito_usd:  round2(l.credito_usd),
      credito_usd: round2(l.debito_usd),
    }));
  }

  return resultado;
}

const TIPO_DOC_LABEL = {
  FACTURA_COMPRA: 'Compra',
  NOTA_CREDITO:   'Nota Crédito',
  NOTA_DEBITO:    'Nota Débito',
  FACTURA_VENTA:  'Factura Venta',
};

// ─── GET /api/contabilizar/:id/preparar  (dry-run, devuelve sugerencia) ───────

export async function prepararContabilizacion(req, res) {
  const { id } = req.params;
  const empresa_id = Number(req.query.empresa_id || process.env.EMPRESA_ID || 1);
  try {
    const { data: comp, error: cErr } = await getSupabase()
      .from('comprobantes_recibidos').select('*')
      .eq('id', id).eq('empresa_id', empresa_id).single();
    if (cErr || !comp) return res.status(404).json({ ok: false, error: 'Comprobante no encontrado' });
    if (comp.contabilizado)  return res.status(400).json({ ok: false, error: 'El comprobante ya fue contabilizado' });
    if (!comp.cuadra)        return res.status(400).json({ ok: false, error: 'El comprobante no cuadra' });
    if (!comp.proveedor_id)  return res.status(400).json({ ok: false, error: 'El comprobante no tiene proveedor asignado' });

    const [{ data: lineas }, { data: ivaResumen }, cfg, cfgInv] = await Promise.all([
      getSupabase().from('comprobantes_lineas').select('*').eq('comprobante_id', id).order('num_linea'),
      getSupabase().from('comprobante_iva_resumen').select('*').eq('comprobante_id', id),
      getConfigCxp(empresa_id),
      getConfigInventario(empresa_id),
    ]);

    if (!cfg.cuenta_cxp_id)
      return res.status(400).json({ ok: false, error: 'Cuenta CXP Proveedores no configurada.' });

    // CXP config tiene prioridad sobre config de inventario para cuenta_inventario_id
    const cfgInvMerged = { ...cfgInv, ...(cfg.cuenta_inventario_id ? { cuenta_inventario_id: cfg.cuenta_inventario_id } : {}) };
    const lineasSugeridas = generarLineas(comp, lineas, ivaResumen, cfg, cfgInvMerged);

    // Enriquecer con nombre/código de cuenta para mostrar en el editor
    const cuentasInfo = await getCuentasInfo(empresa_id, lineasSugeridas.map(l => l.cuenta_id));
    const lineasRich = lineasSugeridas.map(l => ({
      ...l,
      cuenta_codigo: cuentasInfo[l.cuenta_id]?.codigo || null,
      cuenta_nombre: cuentasInfo[l.cuenta_id]?.nombre || null,
    }));

    // Números de exoneración únicos para mostrar como info
    const numerosExon = [...new Set(
      (lineas || [])
        .filter(l => l.exoneracion_numero)
        .map(l => l.exoneracion_numero)
    )];

    const categoriaId = await getCategoriaCompras(empresa_id, cfg);
    const { data: catRow } = categoriaId
      ? await getSupabase().from('asiento_categorias').select('id, codigo, descripcion').eq('id', categoriaId).maybeSingle()
      : { data: null };

    const advertencias = [
      ...(!cfg.cuenta_gasto_id      ? ['Sin cuenta gasto por defecto'] : []),
      ...(!cfg.cuenta_iva_credito_id ? ['Sin cuenta IVA crédito fiscal configurada'] : []),
      ...(lineasSugeridas.some(l => !l.cuenta_id) ? ['Hay líneas sin cuenta — asígnelas antes de confirmar'] : []),
      ...(numerosExon.length > 0 ? [`Exoneración: ${numerosExon.join(', ')}`] : []),
    ];

    res.json({
      ok: true,
      moneda:           comp.moneda || 'CRC',
      tipo_cambio:      Number(comp.tipo_cambio || 1),
      descripcion:      `${TIPO_DOC_LABEL[comp.tipo] || 'Compra'}: ${comp.emisor_nombre} — ${comp.numero_comprobante || `CR-${comp.id}`}`,
      fecha:            comp.fecha_emision,
      lineas:           lineasRich,
      advertencias,
      categoria_id:     catRow?.id || null,
      categoria_nombre: catRow ? `${catRow.codigo} — ${catRow.descripcion}` : null,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── POST /api/contabilizar/:id/confirmar  (guarda con líneas editadas) ───────

export async function confirmarContabilizacion(req, res) {
  const { id } = req.params;
  const empresa_id = Number(req.query.empresa_id || process.env.EMPRESA_ID || 1);
  const { lineas: lineasEditadas, fecha_override } = req.body;

  if (!Array.isArray(lineasEditadas) || lineasEditadas.length === 0)
    return res.status(400).json({ ok: false, error: 'Se requieren líneas del asiento' });

  try {
    const { data: comp, error: cErr } = await getSupabase()
      .from('comprobantes_recibidos').select('*')
      .eq('id', id).eq('empresa_id', empresa_id).single();
    if (cErr || !comp) return res.status(404).json({ ok: false, error: 'Comprobante no encontrado' });
    if (comp.contabilizado)  return res.status(400).json({ ok: false, error: 'El comprobante ya fue contabilizado' });
    if (!comp.proveedor_id)  return res.status(400).json({ ok: false, error: 'El comprobante no tiene proveedor asignado' });

    const cfg         = await getConfigCxp(empresa_id);
    const categoriaId = await getCategoriaCompras(empresa_id, cfg);
    const desc        = `${TIPO_DOC_LABEL[comp.tipo] || 'Compra'}: ${comp.emisor_nombre} — ${comp.numero_comprobante || `CR-${comp.id}`}`;
    const ref         = comp.numero_comprobante || `CR-${comp.id}`;

    // Renumerar líneas y asegurar referencia
    const lineasValidas = lineasEditadas
      .filter(l => l.cuenta_id)
      .map((l, i) => ({
        linea:       i + 1,
        cuenta_id:   Number(l.cuenta_id),
        descripcion: l.descripcion || '',
        referencia:  ref,
        debito_crc:  round2(l.debito_crc  || 0),
        credito_crc: round2(l.credito_crc || 0),
        debito_usd:  round2(l.debito_usd  || 0),
        credito_usd: round2(l.credito_usd || 0),
      }));

    const { data: rpcResult, error: rpcErr } = await getSupabase().rpc('contabilizar_comprobante', {
      p_empresa_id:     empresa_id,
      p_comprobante_id: comp.id,
      p_categoria_id:   categoriaId,
      p_fecha:          fecha_override || comp.fecha_emision,
      p_descripcion:    desc,
      p_moneda:         comp.moneda || 'CRC',
      p_tipo_cambio:    Number(comp.tipo_cambio || 1),
      p_lineas:         lineasValidas,
      p_proveedor_id:   comp.proveedor_id,
      p_tipo:           comp.tipo_xml || 'FE',
      p_numero:         comp.numero_comprobante,
      p_monto_total:    Number(comp.total_comprobante),
    });
    if (rpcErr) throw rpcErr;
    if (!rpcResult.ok) throw new Error(rpcResult.error);

    // ── Entradas automáticas de inventario para líneas mapeadas ──────────────
    const inventarioCreados = [];
    const { data: lineasDB } = await getSupabase()
      .from('comprobantes_lineas')
      .select('cantidad, precio_unitario, subtotal, tipo_linea, a_inventario, codigo_comercial, descripcion')
      .eq('comprobante_id', id)
      .or('a_inventario.eq.true,and(a_inventario.is.null,tipo_linea.eq.M)');

    if (lineasDB?.length && comp.emisor_identificacion) {
      const esUSD = (comp.moneda || 'CRC').toUpperCase() === 'USD';
      const tc    = Number(comp.tipo_cambio || 1);
      const fechaMov = comp.fecha_emision?.slice(0, 10)
        || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });

      for (const linea of lineasDB) {
        if (!linea.codigo_comercial) continue;

        const { data: mapeo } = await getSupabase()
          .from('inv_codigos_proveedor')
          .select('producto_id')
          .eq('empresa_id', empresa_id)
          .eq('emisor_identificacion', comp.emisor_identificacion)
          .eq('codigo_comercial', linea.codigo_comercial)
          .eq('tipo_codigo', '01')
          .maybeSingle();

        if (!mapeo?.producto_id) continue;

        const subtotalCRC  = esUSD ? Number(linea.subtotal) * tc : Number(linea.subtotal);
        const costoUnitario = linea.cantidad > 0
          ? round2(subtotalCRC / Number(linea.cantidad))
          : 0;

        const esNC = comp.tipo === 'NOTA_CREDITO';
        const { data: mov } = await getSupabase()
          .from('inv_movimientos')
          .insert({
            empresa_id,
            fecha:          fechaMov,
            tipo:           esNC ? 'salida' : 'entrada',
            origen:         'xml',
            producto_id:    mapeo.producto_id,
            cantidad:       Number(linea.cantidad),
            costo_unitario: costoUnitario,
            referencia:     comp.numero_comprobante || `CR-${comp.id}`,
            notas:          `${TIPO_DOC_LABEL[comp.tipo] || 'Compra'} — ${comp.emisor_nombre} — ${linea.descripcion}`,
          })
          .select('id')
          .single();

        if (mov) inventarioCreados.push(mov.id);
      }
    }

    res.json({
      ok:                true,
      asiento_id:        rpcResult.asiento_id,
      numero_formato:    rpcResult.numero_formato,
      moneda:            comp.moneda || 'CRC',
      inventario_movimientos: inventarioCreados.length,
      advertencias:      [
        ...(lineasEditadas.length !== lineasValidas.length
          ? [`${lineasEditadas.length - lineasValidas.length} línea(s) sin cuenta omitidas`]
          : []),
        ...(inventarioCreados.length > 0
          ? [`${inventarioCreados.length} entrada(s) de inventario registradas automáticamente`]
          : []),
      ],
    });
  } catch (err) {
    console.error('Error confirmarContabilizacion:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── POST /api/contabilizar/:id  (flujo legado — redirige a preparar+confirmar) ─
// Mantenido por compatibilidad, ya no se usa desde el frontend nuevo
export async function contabilizar(_req, res) {
  res.status(410).json({ ok: false, error: 'Use GET /preparar y POST /confirmar' });
}

// ─── PUT /api/contabilizar/linea/:lineaId/a-inventario ────────────────────────
// Cambia el destino contable de una línea: true=inventario, false=gasto, null=auto
export async function setLineaInventario(req, res) {
  const { lineaId } = req.params;
  const { a_inventario } = req.body; // true | false | null
  if (a_inventario !== true && a_inventario !== false && a_inventario !== null)
    return res.status(400).json({ ok: false, error: 'a_inventario debe ser true, false o null' });

  const sb = getSupabase();
  const { data: linea } = await sb
    .from('comprobantes_lineas')
    .select('id, comprobante_id')
    .eq('id', lineaId)
    .maybeSingle();
  if (!linea?.comprobante_id) return res.status(404).json({ ok: false, error: 'Linea no encontrada' });

  const { data: comp } = await sb
    .from('comprobantes_recibidos')
    .select('empresa_id, contabilizado')
    .eq('id', linea.comprobante_id)
    .maybeSingle();
  if (!comp?.empresa_id) return res.status(404).json({ ok: false, error: 'Comprobante no encontrado' });
  if (comp.contabilizado) return res.status(400).json({ ok: false, error: 'El comprobante ya fue contabilizado y no se puede modificar' });

  const ctx = await requirePermission(req, res, Number(comp.empresa_id), 'contabilidad:editar');
  if (!ctx) return;

  const { error } = await sb
    .from('comprobantes_lineas')
    .update({ a_inventario })
    .eq('id', lineaId);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
}

// ─── PUT /api/contabilizar/comprobante/:comprobanteId/lineas/a-inventario ──────
// Cambia el destino contable de TODAS las líneas de un comprobante de una vez
export async function setTodasLineasInventario(req, res) {
  const { comprobanteId } = req.params;
  const { a_inventario } = req.body; // true | false
  if (a_inventario !== true && a_inventario !== false)
    return res.status(400).json({ ok: false, error: 'a_inventario debe ser true o false' });

  const sb = getSupabase();
  const { data: comp } = await sb
    .from('comprobantes_recibidos')
    .select('empresa_id, contabilizado')
    .eq('id', comprobanteId)
    .maybeSingle();
  if (!comp?.empresa_id) return res.status(404).json({ ok: false, error: 'Comprobante no encontrado' });
  if (comp.contabilizado) return res.status(400).json({ ok: false, error: 'El comprobante ya fue contabilizado y no se puede modificar' });

  const ctx = await requirePermission(req, res, Number(comp.empresa_id), 'contabilidad:editar');
  if (!ctx) return;

  const { error } = await sb
    .from('comprobantes_lineas')
    .update({ a_inventario })
    .eq('comprobante_id', comprobanteId);
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true });
}

// ─── POST /api/contabilizar/linea/:lineaId/crear-producto ─────────────────────
// Crea un producto en inv_productos con los datos de la línea XML
// y registra el mapeo en inv_codigos_proveedor
export async function crearProductoDesdeLinea(req, res) {
  const { lineaId } = req.params;
  const empresa_id  = Number(req.body.empresa_id  || process.env.EMPRESA_ID || 1);
  const categoria_id = req.body.categoria_id ? Number(req.body.categoria_id) : null;
  const ctx = await requirePermission(req, res, empresa_id, 'contabilidad:editar');
  if (!ctx) return;
  const sb = getSupabase();

  // Obtener la línea
  const { data: linea, error: lErr } = await sb
    .from('comprobantes_lineas')
    .select('*')
    .eq('id', lineaId)
    .single();
  if (lErr || !linea) return res.status(404).json({ ok: false, error: 'Línea no encontrada' });

  // Obtener el comprobante para el emisor
  const { data: comp, error: cErr } = await sb
    .from('comprobantes_recibidos')
    .select('emisor_identificacion, emisor_nombre')
    .eq('id', linea.comprobante_id)
    .single();
  if (cErr || !comp) return res.status(404).json({ ok: false, error: 'Comprobante no encontrado' });

  // CABYS: trim para eliminar espacios del XML
  const cabys = linea.cabys ? String(linea.cabys).trim() : null;
  const cabysValido = cabys && cabys.length === 13 ? cabys : null;

  // Verificar si ya existe mapeo: primero por codigo_comercial (tipo='01'), luego por CABYS (tipo='04')
  if (comp.emisor_identificacion) {
    const tipoCheck  = linea.codigo_comercial ? '01' : '04';
    const codigoCheck = linea.codigo_comercial || cabysValido;
    if (codigoCheck) {
      const { data: mapeoExist } = await sb
        .from('inv_codigos_proveedor')
        .select('producto_id, inv_productos(id, descripcion)')
        .eq('empresa_id', empresa_id)
        .eq('emisor_identificacion', comp.emisor_identificacion)
        .eq('tipo_codigo', tipoCheck)
        .eq('codigo_comercial', codigoCheck)
        .maybeSingle();
      if (mapeoExist?.producto_id) {
        await sb.from('comprobantes_lineas').update({ a_inventario: true }).eq('id', lineaId);
        return res.json({
          ok: true,
          producto_id: mapeoExist.producto_id,
          descripcion: mapeoExist.inv_productos?.descripcion || linea.descripcion,
          ya_existia:  true,
        });
      }
    }
  }

  // Sin clave de match: verificar duplicado por descripción exacta para evitar crear dos veces
  if (linea.descripcion) {
    const { data: descExist } = await sb
      .from('inv_productos')
      .select('id, descripcion')
      .eq('empresa_id', empresa_id)
      .ilike('descripcion', linea.descripcion.trim())
      .maybeSingle();
    if (descExist?.id) {
      await sb.from('comprobantes_lineas').update({ a_inventario: true }).eq('id', lineaId);
      return res.json({
        ok: true,
        producto_id: descExist.id,
        descripcion: descExist.descripcion,
        ya_existia:  true,
      });
    }
  }

  // Mapeo tarifa_iva (%) → codigo_tarifa_iva FE v4.4
  const IVA_A_CODIGO = { 0: '01', 1: '02', 2: '03', 4: '04', 8: '05', 13: '06' };
  const codigoTarifa = linea.tarifa_iva_codigo
    || IVA_A_CODIGO[Number(linea.tarifa_iva)] || '06';

  // Generar código secuencial: SRV-XXXX o PROD-XXXX
  const prefijo = linea.tipo_linea === 'S' ? 'SRV' : 'PROD';
  const { count } = await sb
    .from('inv_productos')
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresa_id);
  const siguiente = String((count || 0) + 1).padStart(4, '0');
  const codigo = `${prefijo}-${siguiente}`;

  // Crear el producto con todos los datos del XML
  const { data: producto, error: pErr } = await sb
    .from('inv_productos')
    .insert({
      empresa_id,
      codigo,
      descripcion:       linea.descripcion,
      codigo_cabys:      cabysValido,
      tarifa_iva:        linea.tarifa_iva != null ? Number(linea.tarifa_iva) : 13,
      codigo_tarifa_iva: codigoTarifa,
      codigo_impuesto:   '01',
      unidad_medida:     linea.unidad || 'Unid',
      tipo:              linea.tipo_linea === 'S' ? 'servicio' : 'producto',
      categoria_id:      categoria_id,
      activo:            true,
    })
    .select('id, descripcion')
    .single();
  if (pErr) return res.status(500).json({ ok: false, error: pErr.message });

  // Registrar mapeo proveedor → producto
  // tipo='01' si tiene codigo_comercial, tipo='04' si solo tiene CABYS
  const mapeoTipo   = linea.codigo_comercial ? '01' : '04';
  const mapaoCodigo = linea.codigo_comercial || cabysValido;
  if (mapaoCodigo && comp.emisor_identificacion) {
    await sb
      .from('inv_codigos_proveedor')
      .upsert({
        empresa_id,
        emisor_identificacion: comp.emisor_identificacion,
        emisor_nombre:         comp.emisor_nombre,
        codigo_comercial:      mapaoCodigo,
        codigo_cabys:          cabysValido,
        descripcion_proveedor: linea.descripcion,
        tipo_codigo:           mapeoTipo,
        producto_id:           producto.id,
      }, { onConflict: 'empresa_id,emisor_identificacion,tipo_codigo,codigo_comercial' });
  }

  // Marcar la línea como destino inventario
  await sb.from('comprobantes_lineas').update({ a_inventario: true }).eq('id', lineaId);

  res.json({ ok: true, producto_id: producto.id, descripcion: producto.descripcion });
}

// ─── POST /api/contabilizar/:id/revertir ──────────────────────────────────────
// Genera un contra-asiento (débitos↔créditos invertidos), marca el asiento
// original como REVERTIDO, desmarca el comprobante para que pueda recontabilizarse.
export async function revertirContabilizacion(req, res) {
  const { id } = req.params;
  const empresa_id = Number(req.query.empresa_id || req.body.empresa_id || process.env.EMPRESA_ID || 1);

  const ctx = await requirePermission(req, res, empresa_id, 'contabilidad:editar');
  if (!ctx) return;

  const sb = getSupabase();

  // 1. Obtener el comprobante
  const { data: comp } = await sb.from('comprobantes_recibidos')
    .select('id, empresa_id, contabilizado, asiento_id, emisor_nombre, numero_comprobante')
    .eq('id', id).eq('empresa_id', empresa_id).maybeSingle();
  if (!comp) return res.status(404).json({ ok: false, error: 'Comprobante no encontrado' });
  if (!comp.contabilizado || !comp.asiento_id)
    return res.status(400).json({ ok: false, error: 'El comprobante no está contabilizado' });

  // 2. Obtener el asiento original
  const { data: asiento } = await sb.from('asientos')
    .select('id, numero_formato, fecha, descripcion, moneda, tipo_cambio, categoria_id')
    .eq('id', comp.asiento_id).maybeSingle();
  if (!asiento) return res.status(404).json({ ok: false, error: 'Asiento original no encontrado' });
  if (asiento.estado === 'REVERTIDO')
    return res.status(400).json({ ok: false, error: 'El asiento ya fue revertido' });

  // 3. Obtener líneas del asiento original
  const { data: lineas } = await sb.from('asiento_lineas')
    .select('cuenta_id, descripcion, debito_crc, credito_crc, debito_usd, credito_usd')
    .eq('asiento_id', comp.asiento_id).order('linea');
  if (!lineas?.length) return res.status(400).json({ ok: false, error: 'El asiento no tiene líneas' });

  // 4. Generar número secuencial para contra-asiento: RV-NNN-YYYY
  const v_year = new Date().getFullYear().toString();
  const { data: seqRow } = await sb.from('asientos')
    .select('numero_formato').eq('empresa_id', empresa_id)
    .like('numero_formato', `RV-%-${v_year}`).order('numero_formato', { ascending: false }).limit(1).maybeSingle();
  const lastSeq = seqRow
    ? parseInt((seqRow.numero_formato.match(/^RV-(\d+)-\d{4}$/) || [])[1] || '0') : 0;
  const numeroRev = `RV-${String(lastSeq + 1).padStart(3, '0')}-${v_year}`;

  // 5. Crear el contra-asiento
  const { data: asientoRev, error: errRev } = await sb.from('asientos').insert({
    empresa_id,
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: `REVERSIÓN de ${asiento.numero_formato} — ${comp.emisor_nombre}`,
    numero_formato: numeroRev,
    categoria_id: asiento.categoria_id,
    estado: 'CONFIRMADO',
    moneda: asiento.moneda,
    tipo_cambio: asiento.tipo_cambio,
  }).select('id').single();
  if (errRev) return res.status(500).json({ ok: false, error: errRev.message });

  // 6. Insertar líneas invertidas (débitos↔créditos)
  const lineasRev = lineas.map((l, i) => ({
    asiento_id: asientoRev.id,
    cuenta_id: l.cuenta_id,
    descripcion: l.descripcion,
    referencia: numeroRev,
    linea: i + 1,
    debito_crc:  round2(l.credito_crc),
    credito_crc: round2(l.debito_crc),
    debito_usd:  round2(l.credito_usd),
    credito_usd: round2(l.debito_usd),
  }));
  const { error: errLineas } = await sb.from('asiento_lineas').insert(lineasRev);
  if (errLineas) return res.status(500).json({ ok: false, error: errLineas.message });

  // 7. Actualizar saldos con el contra-asiento
  await sb.rpc('actualizar_saldos_asiento', { p_asiento_id: asientoRev.id });

  // 8. Marcar asiento original como REVERTIDO
  await sb.from('asientos').update({ estado: 'REVERTIDO' }).eq('id', comp.asiento_id);

  // 9. Desmarcar comprobante → puede recontabilizarse
  await sb.from('comprobantes_recibidos')
    .update({ contabilizado: false, asiento_id: null }).eq('id', id);

  // 10. Anular el documento CXP si existe
  await sb.from('cxp_documentos')
    .update({ estado: 'anulado' }).eq('comprobante_id', id).eq('empresa_id', empresa_id);

  res.json({ ok: true, asiento_rev_id: asientoRev.id, numero_formato: numeroRev });
}

// ─── POST /api/contabilizar/batch/confirmar ────────────────────────────────────
// Contabiliza automáticamente una lista de comprobantes (sin editor de asiento).
// Usa las líneas sugeridas por generarLineas tal cual, sin edición manual.
export async function confirmarBatch(req, res) {
  const empresa_id = Number(req.query.empresa_id || req.body.empresa_id || process.env.EMPRESA_ID || 1);
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ ok: false, error: 'Se requiere un arreglo de IDs' });

  const ctx = await requirePermission(req, res, empresa_id, 'contabilidad:editar');
  if (!ctx) return;

  const sb = getSupabase();
  const [cfg, cfgInv] = await Promise.all([getConfigCxp(empresa_id), getConfigInventario(empresa_id)]);
  if (!cfg.cuenta_cxp_id)
    return res.status(400).json({ ok: false, error: 'Cuenta CXP Proveedores no configurada.' });

  const categoriaId = await getCategoriaCompras(empresa_id, cfg);
  const cfgInvMerged = { ...cfgInv, ...(cfg.cuenta_inventario_id ? { cuenta_inventario_id: cfg.cuenta_inventario_id } : {}) };

  const results = [];
  for (const id of ids) {
    try {
      const { data: comp } = await sb.from('comprobantes_recibidos').select('*')
        .eq('id', id).eq('empresa_id', empresa_id).maybeSingle();
      if (!comp)             { results.push({ id, ok: false, error: 'No encontrado' }); continue; }
      if (comp.contabilizado){ results.push({ id, ok: false, error: 'Ya contabilizado' }); continue; }
      if (!comp.cuadra)      { results.push({ id, ok: false, error: 'Documento no cuadra' }); continue; }
      if (!comp.proveedor_id){ results.push({ id, ok: false, error: 'Sin proveedor asignado' }); continue; }

      const [{ data: lineas }, { data: ivaResumen }] = await Promise.all([
        sb.from('comprobantes_lineas').select('*').eq('comprobante_id', id).order('num_linea'),
        sb.from('comprobante_iva_resumen').select('*').eq('comprobante_id', id),
      ]);

      const lineasSugeridas = generarLineas(comp, lineas, ivaResumen, cfg, cfgInvMerged);
      const ref = comp.numero_comprobante || `CR-${comp.id}`;
      const desc = `Compra: ${comp.emisor_nombre} — ${ref}`;
      const lineasValidas = lineasSugeridas.filter(l => l.cuenta_id).map((l, i) => ({ ...l, linea: i + 1, referencia: ref }));

      if (lineasValidas.length === 0) {
        results.push({ id, ok: false, error: 'Sin cuentas configuradas para generar asiento' });
        continue;
      }

      const { data: rpcResult, error: rpcErr } = await sb.rpc('contabilizar_comprobante', {
        p_empresa_id:     empresa_id,
        p_comprobante_id: comp.id,
        p_categoria_id:   categoriaId,
        p_fecha:          comp.fecha_emision,
        p_descripcion:    desc,
        p_moneda:         comp.moneda || 'CRC',
        p_tipo_cambio:    Number(comp.tipo_cambio || 1),
        p_lineas:         lineasValidas,
        p_proveedor_id:   comp.proveedor_id,
        p_tipo:           comp.tipo_xml || 'FE',
        p_numero:         comp.numero_comprobante,
        p_monto_total:    Number(comp.total_comprobante),
      });

      if (rpcErr || !rpcResult?.ok) {
        results.push({ id, ok: false, error: rpcErr?.message || rpcResult?.error || 'Error RPC' });
      } else {
        results.push({ id, ok: true, asiento_id: rpcResult.asiento_id, numero_formato: rpcResult.numero_formato });
      }
    } catch (err) {
      results.push({ id, ok: false, error: err.message });
    }
  }

  const exitosos = results.filter(r => r.ok).length;
  const fallidos = results.filter(r => !r.ok).length;
  res.json({ ok: true, exitosos, fallidos, results });
}

// ─── GET /api/contabilizar/iva-reporte ────────────────────────────────────────
// Reporte D-104: IVA de compras agrupado por tarifa en un período.
export async function ivaReporte(req, res) {
  const empresa_id    = Number(req.query.empresa_id || process.env.EMPRESA_ID || 1);
  const { desde, hasta } = req.query; // YYYY-MM-DD

  const ctx = await requirePermission(req, res, empresa_id, 'contabilidad:ver');
  if (!ctx) return;

  const sb = getSupabase();

  // 1. Obtener IDs de comprobantes en el período (solo compras y NC procesados)
  let qComp = sb.from('comprobantes_recibidos')
    .select('id, tipo, numero_comprobante, emisor_nombre, fecha_emision, contabilizado, total_comprobante')
    .eq('empresa_id', empresa_id)
    .eq('procesado', true)
    .in('tipo', ['FACTURA_COMPRA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'FACTURA_VENTA']);

  if (desde) qComp = qComp.gte('fecha_emision', desde);
  if (hasta) qComp = qComp.lte('fecha_emision', hasta);

  const { data: comps, error: cErr } = await qComp.order('fecha_emision');
  if (cErr) return res.status(500).json({ ok: false, error: cErr.message });

  const ids = (comps || []).map(c => c.id);
  if (!ids.length) return res.json({ ok: true, filas: [], comprobantes: [] });

  // 2. Obtener resumen IVA
  const { data: ivaRows, error: iErr } = await sb
    .from('comprobante_iva_resumen')
    .select('tarifa_codigo, tarifa_porc, base_imponible, monto_iva, monto_exonerado, comprobante_id')
    .eq('empresa_id', empresa_id)
    .in('comprobante_id', ids);
  if (iErr) return res.status(500).json({ ok: false, error: iErr.message });

  // 3. Agrupar por tarifa
  const TARIFA_LABELS = {
    '01': 'Exento (0%)', '02': '1%', '03': '2%', '04': '4%', '05': '8%', '06': '13%',
    '07': 'Transitoria 2%', '08': 'Transitoria 1%',
  };
  const grouped = {};
  for (const row of (ivaRows || [])) {
    const k = row.tarifa_codigo || '01';
    if (!grouped[k]) grouped[k] = {
      tarifa_codigo: k,
      tarifa_nombre: TARIFA_LABELS[k] || k,
      tarifa_porc:   row.tarifa_porc,
      base_imponible: 0,
      monto_iva:      0,
      monto_exonerado: 0,
    };
    grouped[k].base_imponible  += Number(row.base_imponible  || 0);
    grouped[k].monto_iva       += Number(row.monto_iva       || 0);
    grouped[k].monto_exonerado += Number(row.monto_exonerado || 0);
  }
  const filas = Object.values(grouped).sort((a, b) => a.tarifa_codigo.localeCompare(b.tarifa_codigo));

  res.json({ ok: true, filas, comprobantes: comps || [] });
}

