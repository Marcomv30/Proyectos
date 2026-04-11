export interface LiquidacionPagoRow {
  id: string
  tipoMedioPago: string
  subtipo: string
  monto: number
  referencia: string
  detalle: string
}

export const FE_MEDIO_PAGO_OPTIONS = [
  { value: '01', label: '01 - Efectivo' },
  { value: '02', label: '02 - Tarjeta' },
  { value: '03', label: '03 - Transferencia / deposito / SINPE' },
  { value: '04', label: '04 - Recaudado por terceros' },
  { value: '05', label: '05 - Colecturia' },
  { value: '06', label: '06 - Documento fiscal' },
  { value: '07', label: '07 - Otros' },
  { value: '99', label: '99 - No aplica' },
] as const

export const FE_SUBTIPO_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  '02': [
    { value: 'tarjeta_credito', label: 'Tarjeta credito' },
    { value: 'tarjeta_debito', label: 'Tarjeta debito' },
  ],
  '03': [
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'deposito', label: 'Deposito' },
    { value: 'sinpe_movil', label: 'SINPE movil' },
    { value: 'sinpe_bancario', label: 'SINPE bancario' },
  ],
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export function createLiquidacionPago(
  tipoMedioPago = '01',
  monto = 0,
  subtipo = '',
): LiquidacionPagoRow {
  return {
    id: uid(),
    tipoMedioPago,
    subtipo,
    monto,
    referencia: '',
    detalle: '',
  }
}

export function medioPagoPrincipal(rows: LiquidacionPagoRow[], condicionVenta: string, fallback = '01') {
  if (condicionVenta === '02') return '99'
  const activos = rows.filter((row) => Number(row.monto || 0) > 0)
  if (!activos.length) return fallback
  return [...activos].sort((a, b) => Number(b.monto || 0) - Number(a.monto || 0))[0].tipoMedioPago || fallback
}

export function liquidacionTotal(rows: LiquidacionPagoRow[]) {
  return rows.reduce((sum, row) => sum + Number(row.monto || 0), 0)
}

export function referenciaLabel(tipoMedioPago: string, subtipo: string) {
  if (tipoMedioPago === '02') return 'No. tarjeta / autorizacion'
  if (tipoMedioPago === '03' && subtipo.startsWith('sinpe')) return 'No. SINPE'
  if (tipoMedioPago === '03') return 'No. deposito / transferencia'
  if (['04', '05', '06'].includes(tipoMedioPago)) return 'No. referencia'
  return 'Referencia'
}

export function detalleLabel(tipoMedioPago: string) {
  if (tipoMedioPago === '07') return 'Detalle del medio'
  if (tipoMedioPago === '99') return 'Motivo / observacion'
  return 'Detalle'
}

export function serializeLiquidacionPagos(rows: LiquidacionPagoRow[], condicionVenta: string) {
  if (condicionVenta === '02') return []
  return rows
    .filter((row) => Number(row.monto || 0) > 0)
    .map((row, index) => ({
      linea: index + 1,
      tipo_medio_pago: row.tipoMedioPago,
      subtipo: row.subtipo || null,
      monto: Number(row.monto || 0),
      referencia: row.referencia.trim() || null,
      detalle: row.detalle.trim() || null,
    }))
}

export function hydrateLiquidacionPagos(input: any, fallbackTipo = '01', total = 0): LiquidacionPagoRow[] {
  const rows = Array.isArray(input)
    ? input.map((row) => ({
        id: uid(),
        tipoMedioPago: String(row?.tipo_medio_pago || row?.tipoMedioPago || fallbackTipo || '01'),
        subtipo: String(row?.subtipo || ''),
        monto: Number(row?.monto || 0),
        referencia: String(row?.referencia || ''),
        detalle: String(row?.detalle || ''),
      }))
    : []
  if (rows.length) return rows
  if (total > 0) return [createLiquidacionPago(fallbackTipo, total)]
  return [createLiquidacionPago(fallbackTipo, 0)]
}

export function validateLiquidacionPagos(rows: LiquidacionPagoRow[], totalDocumento: number, condicionVenta: string) {
  if (condicionVenta === '02') return ''
  const activos = rows.filter((row) => Number(row.monto || 0) > 0)
  if (!activos.length) return 'Debe registrar al menos un medio de pago para la liquidacion.'

  const diferencia = Math.abs(liquidacionTotal(activos) - Number(totalDocumento || 0))
  if (diferencia > 0.01) {
    return `La liquidacion de medios de pago no cuadra con el total del documento. Diferencia: ${diferencia.toFixed(2)}.`
  }

  for (const row of activos) {
    if (['02', '03', '04', '05', '06'].includes(row.tipoMedioPago) && !row.referencia.trim()) {
      return `Falta ${referenciaLabel(row.tipoMedioPago, row.subtipo).toLowerCase()} en la liquidacion.`
    }
    if (row.tipoMedioPago === '03' && !row.subtipo.trim()) {
      return 'Seleccione si el pago bancario fue deposito, transferencia o SINPE.'
    }
    if (['07', '99'].includes(row.tipoMedioPago) && !row.detalle.trim()) {
      return `Falta ${detalleLabel(row.tipoMedioPago).toLowerCase()} en la liquidacion.`
    }
  }

  return ''
}
