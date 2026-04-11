/**
 * feXml.js — Constructor de XML para Facturación Electrónica CR (MH v4.4)
 * Soporta: FE (01), ND (02), NC (03), Tiquete (04), FEE (09)
 *
 * Cambios v4.4 vs v4.3:
 *  - Namespaces actualizados a v4.4
 *  - ProveedorSistemas (nuevo, requerido) después de Clave
 *  - CodigoActividad → CodigoActividadEmisor
 *  - MedioPago movido dentro de ResumenFactura
 *  - CodigoCABYS es ahora elemento directo (string 13 chars)
 *  - CodigoComercial sigue siendo CodigoType {Tipo, Codigo}
 *  - BaseImponible en LineaDetalle (requerido cuando gravado)
 *  - ImpuestoAsumidoEmisorFabrica = 0 (requerido)
 *  - Impuesto.CodigoTarifaIVA (ya era correcto)
 *  - Exoneracion: TipoDocumentoEX1, TarifaExonerada, sin FechaEmision
 *  - InformacionReferencia: TipoDocIR, FechaEmisionIR
 *  - FEE: sin totales de exoneración/no sujeto en ResumenFactura
 *  - FEE: PartidaArancelaria opcional en LineaDetalle
 */

const NAMESPACE = {
  '01': 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica',
  '02': 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/notaDebitoElectronica',
  '03': 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/notaCreditoElectronica',
  '04': 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/tiqueteElectronico',
  '09': 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronicaExportacion',
};

const ROOT_ELEMENT = {
  '01': 'FacturaElectronica',
  '02': 'NotaDebitoElectronica',
  '03': 'NotaCreditoElectronica',
  '04': 'TiqueteElectronico',
  '09': 'FacturaElectronicaExportacion',
};

function compactXml(xml) {
  return String(xml || '')
    .replace(/>\s+\n\s*</g, '>\n<')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function esc(v) {
  if (v == null) return '';
  return String(v)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmt(n, dec = 5) {
  return Number(n || 0).toFixed(dec);
}

function fechaIso(fecha) {
  const d = String(fecha || '').trim();
  if (!d) return new Date().toISOString().replace('Z', '-06:00');
  if (d.includes('T')) return d;
  return `${d}T00:00:00-06:00`;
}

function normalizarCodigoTarifaIva(codigo, porcentaje) {
  const raw = String(codigo || '').trim();
  const pct = Number(porcentaje || 0);
  const allowed = new Set(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']);
  if (allowed.has(raw)) return raw;

  if (pct === 13) return '08';
  if (pct === 8) return '07';
  if (pct === 4) return '06';
  if (pct === 2) return '05';
  if (pct === 1) return '04';
  if (pct === 0.5) return '09';
  if (pct <= 0) return '10';

  return '08';
}

function parseLiquidacionPagos(doc) {
  const raw = Array.isArray(doc?.liquidacion_pago_json) ? doc.liquidacion_pago_json : [];
  return raw
    .map((row) => ({
      tipo_medio_pago: String(row?.tipo_medio_pago || row?.tipoMedioPago || '').trim(),
      subtipo: String(row?.subtipo || '').trim(),
      monto: Number(row?.monto || 0),
      referencia: String(row?.referencia || '').trim(),
      detalle: String(row?.detalle || '').trim(),
    }))
    .filter((row) => row.tipo_medio_pago && row.monto > 0);
}

/**
 * Genera la clave numérica de 50 dígitos (MH v4.4).
 * Código país (3) + Día (2) + Mes (2) + Año (2) + Tipo ident emisor (2) +
 * Identificación emisor (12) + Sucursal (3) + Punto venta (5) +
 * Tipo comp (2) + Consecutivo (10) + Situación (1) + Código seguridad (8)
 */
export function generarClave(params) {
  const {
    pais = '506',
    fecha,
    tipoIdentEmisor,
    idEmisor,
    sucursal = '001',
    puntoVenta = '00001',
    tipoDoc,
    consecutivo,
    situacion = '1',
  } = params;

  const d = fecha instanceof Date ? fecha : new Date();
  const dd  = String(d.getDate()).padStart(2, '0');
  const mm  = String(d.getMonth() + 1).padStart(2, '0');
  const aa  = String(d.getFullYear()).slice(-2);
  const sec = String(Math.floor(Math.random() * 99999999)).padStart(8, '0');
  const idPad = String(idEmisor || '').replace(/\D/g, '').padStart(12, '0');

  // Estructura 50 dígitos: país(3)+fecha(6)+cédula(12)+sucursal(3)+puntoVenta(5)+tipo(2)+consecutivo(10)+situación(1)+seguridad(8)
  const clave = [
    pais,                                  // 3
    dd, mm, aa,                            // 6 (total 9)
    idPad,                                 // 12 (total 21)
    String(sucursal).padStart(3, '0'),     // 3  (total 24)
    String(puntoVenta).padStart(5, '0'),   // 5  (total 29)
    String(tipoDoc).padStart(2, '0'),      // 2  (total 31)
    String(consecutivo).padStart(10, '0'), // 10 (total 41)
    String(situacion),                     // 1  (total 42)
    sec,                                   // 8  (total 50)
  ].join('');

  if (clave.length !== 50) throw new Error(`Clave generada de ${clave.length} dígitos (esperado 50)`);
  return clave;
}

/**
 * Genera el número consecutivo de 20 dígitos:
 * Sucursal (3) + PuntoVenta (5) + TipoDoc (2) + Número (10)
 */
export function generarConsecutivo(sucursal, puntoVenta, tipoDoc, numero) {
  return [
    String(sucursal).padStart(3, '0'),
    String(puntoVenta).padStart(5, '0'),
    String(tipoDoc).padStart(2, '0'),
    String(numero).padStart(10, '0'),
  ].join('');
}

/**
 * Construye el XML del comprobante electrónico v4.4.
 *
 * @param {object} params.doc          — fila fe_documentos
 * @param {array}  params.lineas       — filas fe_documento_lineas
 * @param {object} params.emisor       — datos fe_config_empresa (con campos XML)
 * @param {string} params.clave        — 50 dígitos
 * @param {string} params.consecutivo  — 20 dígitos
 * @param {object} [params.referencia] — para NC/ND: { tipoDoc, numero, fecha, codigo, razon }
 * @returns {string} XML sin firma
 */
export function construirXml({ doc, lineas, emisor, clave, consecutivo, referencia, fechaEmision }) {
  const tipo = String(doc.tipo_documento);
  const ns   = NAMESPACE[tipo];
  const root = ROOT_ELEMENT[tipo];
  if (!ns) throw new Error(`Tipo de documento no soportado: ${tipo}`);

  const esFee   = tipo === '09';
  const moneda  = doc.moneda === 'USD' ? 'USD' : 'CRC';
  const tCambio = moneda === 'USD' ? fmt(emisor.tipo_cambio_usd || 530, 5) : '1.00000';

  // ProveedorSistemas: cédula del proveedor de software (la empresa misma si es propio)
  const proveedorSistemas = (emisor.proveedor_sistemas || emisor.numero_identificacion || '').replace(/\D/g, '');

  // ── Emisor ────────────────────────────────────────────────────────────────
  const xmlEmisor = `
  <Emisor>
    <Nombre>${esc(emisor.nombre_emisor)}</Nombre>
    <Identificacion>
      <Tipo>${esc(emisor.tipo_identificacion || '02')}</Tipo>
      <Numero>${esc((emisor.numero_identificacion || '').replace(/\D/g, ''))}</Numero>
    </Identificacion>
    ${emisor.nombre_comercial ? `<NombreComercial>${esc(emisor.nombre_comercial)}</NombreComercial>` : ''}
    <Ubicacion>
      <Provincia>${esc(emisor.provincia || '1')}</Provincia>
      <Canton>${esc(String(emisor.canton || '01').padStart(2, '0'))}</Canton>
      <Distrito>${esc(String(emisor.distrito || '01').padStart(2, '0'))}</Distrito>
      ${emisor.barrio && String(emisor.barrio).trim().length >= 5 ? `<Barrio>${esc(String(emisor.barrio).trim())}</Barrio>` : ''}
      <OtrasSenas>${esc(emisor.otras_senas || 'Sin otras señas')}</OtrasSenas>
    </Ubicacion>
    ${emisor.telefono_emisor ? `<Telefono><CodigoPais>506</CodigoPais><NumTelefono>${esc(emisor.telefono_emisor.replace(/\D/g, ''))}</NumTelefono></Telefono>` : ''}
    ${emisor.correo_envio ? `<CorreoElectronico>${esc(emisor.correo_envio)}</CorreoElectronico>` : ''}
  </Emisor>`;

  // ── Receptor ──────────────────────────────────────────────────────────────
  let xmlReceptor = '';
  if (doc.receptor_nombre && doc.receptor_nombre !== 'Consumidor final') {
    const tipoIdent = doc.receptor_tipo_identificacion || '02';
    const idNum     = (doc.receptor_identificacion || '').replace(/\D/g, '');
    xmlReceptor = `
  <Receptor>
    <Nombre>${esc(doc.receptor_nombre)}</Nombre>
    ${idNum ? `<Identificacion>
      <Tipo>${esc(tipoIdent)}</Tipo>
      <Numero>${esc(idNum)}</Numero>
    </Identificacion>` : ''}
    ${esFee && doc.receptor_identificacion && !idNum ? `<IdentificacionExtranjero>${esc(doc.receptor_identificacion)}</IdentificacionExtranjero>` : ''}
    ${doc.receptor_telefono ? `<Telefono>
      <CodigoPais>506</CodigoPais>
      <NumTelefono>${esc(doc.receptor_telefono.replace(/\D/g, ''))}</NumTelefono>
    </Telefono>` : ''}
    ${doc.receptor_email ? `<CorreoElectronico>${esc(doc.receptor_email)}</CorreoElectronico>` : ''}
  </Receptor>`;
  }

  // ── Líneas ────────────────────────────────────────────────────────────────
  const lineasFiscal = lineas.map((l) => {
    const cantidad          = Number(l.cantidad || 1);
    const precioUnit        = Number(l.precio_unitario || 0);
    const montoTotalRaw     = cantidad * precioUnit;
    const descuentoMonto    = Number(l.descuento_monto || 0);
    const subtotalNetoRaw   = Math.max(montoTotalRaw - descuentoMonto, 0);
    const tarifaPctRaw      = Number(l.tarifa_iva_porcentaje || 0);
    const codigoTarifa      = normalizarCodigoTarifaIva(l.tarifa_iva_codigo, tarifaPctRaw);
    const gravado           = tarifaPctRaw > 0 && !['01', '02', '03', '10', '11'].includes(codigoTarifa);
    const impuestoMontoRaw  = subtotalNetoRaw * (tarifaPctRaw / 100);
    const exonMontoRaw      = Number(l.exoneracion_monto || 0);
    const impuestoNetoRaw   = (gravado || exonMontoRaw > 0) ? Math.max(impuestoMontoRaw - exonMontoRaw, 0) : 0;
    const totalLineaRaw     = subtotalNetoRaw + impuestoNetoRaw;
    const exento            = !gravado;
    const tieneExon         = Number(l.exoneracion_porcentaje || 0) > 0;
    return {
      ...l,
      cantidad,
      precioUnit,
      montoTotalRaw,
      descuentoMonto,
      subtotalNetoRaw,
      tarifaPctRaw,
      impuestoMontoRaw,
      exonMontoRaw,
      impuestoNetoRaw,
      totalLineaRaw,
      codigoTarifa,
      gravado,
      exento,
      tieneExon,
    };
  });

  const xmlLineas = lineasFiscal.map((l) => {
    const montoTotal    = fmt(l.montoTotalRaw);
    const descuento     = l.descuentoMonto;
    const subtotal      = fmt(l.subtotalNetoRaw);
    const impuestoMonto = l.impuestoMontoRaw;
    const exonMonto     = l.exonMontoRaw;
    const impuestoNeto  = fmt(l.impuestoNetoRaw);
    const totalLinea    = fmt(l.totalLineaRaw);

    // Descuento v4.4: MontoDescuento + CodigoDescuento (04 = descuento comercial)
    const xmlDescuento = descuento > 0 ? `
    <Descuento>
      <MontoDescuento>${fmt(descuento)}</MontoDescuento>
      <CodigoDescuento>04</CodigoDescuento>
    </Descuento>` : '';

    const tarifaPct    = fmt(l.tarifaPctRaw, 2);

    let xmlExoneracion = '';
    if (Number(l.exoneracion_porcentaje || 0) > 0) {
      xmlExoneracion = `
        <Exoneracion>
          <TipoDocumentoEX1>01</TipoDocumentoEX1>
          <NumeroDocumento>${esc(l.exoneracion_autorizacion || '')}</NumeroDocumento>
          <NombreInstitucion>01</NombreInstitucion>
          <TarifaExonerada>${fmt(l.exoneracion_porcentaje, 2)}</TarifaExonerada>
      <MontoExoneracion>${fmt(exonMonto)}</MontoExoneracion>
        </Exoneracion>`;
    }

    // MH v4.4 espera BaseImponible/Impuesto antes de MontoTotalLinea también en líneas exentas.
    // Para exentas usamos CodigoTarifaIVA 10 con monto 0 sobre la base neta.
    const xmlImpuesto = l.gravado || exonMonto > 0 ? `
    <BaseImponible>${subtotal}</BaseImponible>
    <Impuesto>
      <Codigo>01</Codigo>
      <CodigoTarifaIVA>${esc(l.codigoTarifa)}</CodigoTarifaIVA>
      <Tarifa>${tarifaPct}</Tarifa>
      <Monto>${fmt(impuestoMonto)}</Monto>
      ${xmlExoneracion}
    </Impuesto>` : `
    <BaseImponible>${subtotal}</BaseImponible>
    <Impuesto>
      <Codigo>01</Codigo>
      <CodigoTarifaIVA>10</CodigoTarifaIVA>
      <Tarifa>0.00</Tarifa>
      <Monto>${fmt(0)}</Monto>
    </Impuesto>`;

    // CodigoComercial (código interno de la empresa) — CodigoType: Tipo + Codigo
    const xmlCodigoComercial = l.codigo_interno
      ? `<CodigoComercial><Tipo>04</Tipo><Codigo>${esc(l.codigo_interno)}</Codigo></CodigoComercial>` : '';

    // CodigoCABYS — elemento directo string 13 chars en v4.4
    const xmlCabys = l.cabys ? `<CodigoCABYS>${esc(l.cabys)}</CodigoCABYS>` : '';

    // PartidaArancelaria — solo FEE (opcional)
    const xmlPartida = esFee && l.partida_arancelaria
      ? `<PartidaArancelaria>${esc(l.partida_arancelaria)}</PartidaArancelaria>` : '';

    return `
  <LineaDetalle>
    <NumeroLinea>${l.linea}</NumeroLinea>
    ${xmlPartida}
    ${xmlCabys}
    ${xmlCodigoComercial}
    <Cantidad>${fmt(l.cantidad, 3)}</Cantidad>
    <UnidadMedida>${esc(l.unidad_medida || 'Unid')}</UnidadMedida>
    ${esFee ? `<UnidadMedidaComercial>${esc(l.unidad_medida || 'Unid')}</UnidadMedidaComercial>` : ''}
    <Detalle>${esc(l.descripcion)}</Detalle>
    <PrecioUnitario>${fmt(l.precioUnit)}</PrecioUnitario>
    <MontoTotal>${montoTotal}</MontoTotal>
    ${xmlDescuento}
    <SubTotal>${subtotal}</SubTotal>
    ${xmlImpuesto}
    <ImpuestoAsumidoEmisorFabrica>${fmt(0)}</ImpuestoAsumidoEmisorFabrica>
    <ImpuestoNeto>${(l.gravado || exonMonto > 0) ? impuestoNeto : fmt(0)}</ImpuestoNeto>
    <MontoTotalLinea>${totalLinea}</MontoTotalLinea>
  </LineaDetalle>`;
  }).join('');

  // ── ResumenFactura ────────────────────────────────────────────────────────
  // MH v4.4 determina servicio vs mercancía por el UnidadMedida del XML,
  // NO por un campo interno. Códigos de servicio oficiales MH:
  const SERVICE_UND = new Set(['Sp', 'Os', 'Al', 'Alc', 'Spe', 'I']);

  let totalServGrav = 0, totalServExen = 0, totalServExon = 0;
  let totalMercGrav = 0, totalMercExen = 0, totalMercExon = 0;

  let totalDescuentos = 0;
  let totalImpuesto = 0;
  let totalVentaNeta = 0;

  for (const l of lineasFiscal) {
    // Usar subtotalNetoRaw (= SubTotal en el XML) para que la suma coincida
    // con lo que MH recalcula desde las líneas de detalle.
    const montoClasificacion = l.subtotalNetoRaw;
    // Clasificar como servicio según UnidadMedida (igual que MH lo hace al validar).
    const esServ = SERVICE_UND.has(String(l.unidad_medida || ''));
    const exento = l.exento;
    const tieneExon = l.tieneExon;

    totalDescuentos += l.descuentoMonto;
    totalImpuesto += l.impuestoNetoRaw;
    totalVentaNeta += l.subtotalNetoRaw;

    if (esServ) {
      if (tieneExon)   totalServExon += montoClasificacion;
      else if (exento) totalServExen += montoClasificacion;
      else             totalServGrav += montoClasificacion;
    } else {
      if (tieneExon)   totalMercExon += montoClasificacion;
      else if (exento) totalMercExen += montoClasificacion;
      else             totalMercGrav += montoClasificacion;
    }
  }

  const totalGrav  = totalServGrav + totalMercGrav;
  const totalExen  = totalServExen + totalMercExen;
  const totalExon  = totalServExon + totalMercExon;
  const totalVenta = lineasFiscal.reduce((acc, l) => acc + l.montoTotalRaw, 0);
  const totalComprobante = totalVentaNeta + totalImpuesto;
  const desgloseImpuestos = new Map();

  for (const l of lineasFiscal) {
    if (!(l.gravado || l.exonMontoRaw > 0 || l.impuestoMontoRaw > 0)) continue;
    const key = `${l.codigoTarifa}|01`;
    const montoDesglose = l.tieneExon ? l.impuestoNetoRaw : l.impuestoMontoRaw;
    const actual = desgloseImpuestos.get(key) || {
      codigo: '01',
      codigoTarifaIVA: l.codigoTarifa,
      totalMontoImpuesto: 0,
    };
    actual.totalMontoImpuesto += montoDesglose;
    desgloseImpuestos.set(key, actual);
  }

  const xmlDesgloseImpuestos = Array.from(desgloseImpuestos.values())
    .map((row) => `
    <TotalDesgloseImpuesto>
      <Codigo>${esc(row.codigo)}</Codigo>
      <CodigoTarifaIVA>${esc(row.codigoTarifaIVA)}</CodigoTarifaIVA>
      <TotalMontoImpuesto>${fmt(row.totalMontoImpuesto)}</TotalMontoImpuesto>
    </TotalDesgloseImpuesto>`)
    .join('');

  const pagos = parseLiquidacionPagos(doc);
  const condicionSinMedioPago = ['02', '08', '10'].includes(String(doc.condicion_venta || '01'));
  const pagosXml = pagos.length
    ? pagos
    : (condicionSinMedioPago ? [] : [{ tipo_medio_pago: doc.medio_pago || '01', subtipo: '', monto: Number(doc.total_comprobante || 0), referencia: '', detalle: '' }]);
  const xmlMedioPago = pagosXml.map((row) => `
    <MedioPago>
      <TipoMedioPago>${esc(row.tipo_medio_pago)}</TipoMedioPago>
      ${pagosXml.length > 1 ? `<TotalMedioPago>${fmt(row.monto)}</TotalMedioPago>` : ''}
      ${row.tipo_medio_pago === '07' && row.detalle ? `<MedioPagoOtros>${esc(row.detalle)}</MedioPagoOtros>` : ''}
    </MedioPago>`).join('');

  const xmlResumen = `
  <ResumenFactura>
    <CodigoTipoMoneda>
      <CodigoMoneda>${moneda}</CodigoMoneda>
      <TipoCambio>${tCambio}</TipoCambio>
    </CodigoTipoMoneda>
    ${totalServGrav > 0 ? `<TotalServGravados>${fmt(totalServGrav)}</TotalServGravados>` : ''}
    ${totalServExen > 0 ? `<TotalServExentos>${fmt(totalServExen)}</TotalServExentos>` : ''}
    ${!esFee && totalServExon > 0 ? `<TotalServExonerado>${fmt(totalServExon)}</TotalServExonerado>` : ''}
    ${totalMercGrav > 0 ? `<TotalMercanciasGravadas>${fmt(totalMercGrav)}</TotalMercanciasGravadas>` : ''}
    ${totalMercExen > 0 ? `<TotalMercanciasExentas>${fmt(totalMercExen)}</TotalMercanciasExentas>` : ''}
    ${!esFee && totalMercExon > 0 ? `<TotalMercExonerada>${fmt(totalMercExon)}</TotalMercExonerada>` : ''}
    <TotalGravado>${fmt(totalGrav)}</TotalGravado>
    <TotalExento>${fmt(totalExen)}</TotalExento>
    ${!esFee ? `<TotalExonerado>${fmt(totalExon)}</TotalExonerado>` : ''}
    <TotalVenta>${fmt(totalVenta)}</TotalVenta>
    <TotalDescuentos>${fmt(totalDescuentos)}</TotalDescuentos>
    <TotalVentaNeta>${fmt(totalVentaNeta)}</TotalVentaNeta>
    ${xmlDesgloseImpuestos}
    <TotalImpuesto>${fmt(totalImpuesto)}</TotalImpuesto>
    ${xmlMedioPago}
    <TotalComprobante>${fmt(totalComprobante)}</TotalComprobante>
  </ResumenFactura>`;

  // ── Información de referencia (NC/ND) — v4.4: TipoDocIR, FechaEmisionIR ──
  const xmlReferencia = referencia ? `
  <InformacionReferencia>
    <TipoDocIR>${esc(referencia.tipoDoc || '01')}</TipoDocIR>
    <Numero>${esc(referencia.numero)}</Numero>
    <FechaEmisionIR>${fechaIso(referencia.fecha)}</FechaEmisionIR>
    <Codigo>${esc(referencia.codigo || '01')}</Codigo>
    <Razon>${esc(referencia.razon || 'Anula documento')}</Razon>
  </InformacionReferencia>` : '';

  // ── Documento completo ────────────────────────────────────────────────────
  return compactXml(`<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="${ns}" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <Clave>${clave}</Clave>
  <ProveedorSistemas>${esc(proveedorSistemas.padStart(12, '0'))}</ProveedorSistemas>
  <CodigoActividadEmisor>${esc(emisor.actividad_codigo || '')}</CodigoActividadEmisor>
  <NumeroConsecutivo>${consecutivo}</NumeroConsecutivo>
  <FechaEmision>${fechaIso(fechaEmision || doc.fecha_emision)}</FechaEmision>
  ${xmlEmisor}
  ${xmlReceptor}
  <CondicionVenta>${esc(doc.condicion_venta || '01')}</CondicionVenta>
  ${Number(doc.plazo_credito_dias || 0) > 0 ? `<PlazoCredito>${doc.plazo_credito_dias}</PlazoCredito>` : ''}
  <DetalleServicio>
    ${xmlLineas}
  </DetalleServicio>
  ${xmlResumen}
  ${xmlReferencia}
</${root}>`);
}
