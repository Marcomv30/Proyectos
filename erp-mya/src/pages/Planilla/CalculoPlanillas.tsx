import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../../supabase';
import { logModuloEvento } from '../../utils/bitacora';
import { formatMoneyCRC, roundMoney } from '../../utils/reporting';
import { formatCompanyDate } from '../../utils/companyTimeZone';
import { PL_STYLES } from './planillaStyles';
import ColillaPago from './ColillaPago';

interface Props { empresaId: number; canEdit?: boolean; empresaNombre?: string; empresaCedula?: string; }

interface Periodo { id:number; nombre:string; frecuencia:string; fecha_inicio:string; fecha_fin:string; estado:string; total_bruto:number; total_deducciones:number; total_neto:number; total_patronal:number; notas:string|null; }
interface Colaborador {
  id:number; nombre_completo:string; numero_empleado:string|null;
  identificacion:string; tipo_salario:string; salario:number; estado:string;
  jornada:string; horas_semana:number|null; horas_mes_base:number|null;
  aplica_ccss:boolean; aplica_renta:boolean; aplica_banco_popular:boolean;
  email:string|null; email_personal:string|null;
  banco:string|null; numero_cuenta:string|null;
}
interface Linea {
  id?:number; colaborador_id:number; salario_base:number; dias_laborados:number;
  horas_extra_diurnas:number; horas_extra_nocturnas:number; horas_extra_feriado?:number;
  valor_hora_ordinaria?:number; monto_he_diurnas?:number; monto_he_nocturnas?:number; monto_he_feriado?:number;
  bonificacion:number; comision:number; otros_ingresos:number; total_bruto:number;
  ded_ccss_obrero:number; ded_banco_popular:number; ded_renta:number;
  ded_pension_comp:number; ded_asfa:number; ded_embargo:number; ded_adelanto:number; ded_otras:number;
  total_deducciones:number; salario_neto:number;
  ccss_patronal:number; provision_aguinaldo:number; provision_vacaciones:number;
  provision_cesantia:number; total_costo_empresa:number; estado:string; notas:string|null;
}
interface TasasCCSS {
  tasa_ccss_obrero:number; tasa_ccss_patronal:number; tasa_banco_popular:number;
  tasa_solidarista:number; incluir_solidarista:boolean;
  tasa_pension_comp:number; incluir_pension_comp:boolean;
  fecha_vigencia:string; decreto_referencia:string|null;
}
interface EscalaRenta { tramo:number; limite_inferior:number; limite_superior:number|null; tasa:number; }

// Frecuencias — días base para prorrateo de salario
const DIAS_PERIODO: Record<string, number> = { mensual:30, quincenal:15, bisemanal:14, semanal:7 };
const FRECUENCIAS = [
  { v:'semanal',    l:'Semanal (7 días)' },
  { v:'bisemanal',  l:'Bisemanal (14 días corridos)' },
  { v:'quincenal',  l:'Quincenal (días 1-15 / 16-fin)' },
  { v:'mensual',    l:'Mensual (30 días)' },
];

const ESTADO_COLORS: Record<string, string> = { abierto:'#38bdf8', calculado:'#f59e0b', cerrado:'#22c55e', contabilizado:'#a78bfa' };

function calcRenta(salarioMensual: number, escala: EscalaRenta[], diasLab: number, diasBase: number): number {
  // Renta se calcula sobre base mensual equivalente, luego se proratea
  const salMensual = salarioMensual * 30 / diasBase;
  let r = 0;
  for (const t of escala) {
    if (salMensual <= t.limite_inferior) break;
    const base = Math.min(salMensual, t.limite_superior ?? salMensual) - t.limite_inferior;
    if (base > 0) r += base * t.tasa;
  }
  return roundMoney(r * (diasLab / 30));
}

function valorHora(salario: number, jornada: string, horasMes: number | null): number {
  const base = horasMes ?? (jornada === 'nocturna' ? 180 : jornada === 'mixta' ? 216 : 240);
  return roundMoney(salario / base);
}

function calcLinea(c: Colaborador, tasas: TasasCCSS, escala: EscalaRenta[], diasLab: number, diasBase: number): Linea {
  const sal = roundMoney(c.salario * diasLab / diasBase);
  const vHora = valorHora(c.salario, c.jornada, c.horas_mes_base);

  // Horas extra (en base vacías — se ajustan manualmente por colaborador si aplica)
  const he_d = 0, he_n = 0, he_f = 0;
  const mHED = roundMoney(he_d * vHora * 1.5);
  const mHEN = roundMoney(he_n * vHora * 2.0);
  const mHEF = roundMoney(he_f * vHora * 2.0);
  const total_he = roundMoney(mHED + mHEN + mHEF);

  const bruto = roundMoney(sal + total_he);

  // Deducciones — respetar exenciones individuales
  const ccss_ob = c.aplica_ccss         ? roundMoney(bruto * tasas.tasa_ccss_obrero)   : 0;
  const bp       = c.aplica_banco_popular? roundMoney(bruto * tasas.tasa_banco_popular) : 0;
  const renta    = c.aplica_renta        ? calcRenta(c.salario, escala, diasLab, diasBase) : 0;
  const pension  = tasas.incluir_pension_comp ? roundMoney(bruto * tasas.tasa_pension_comp) : 0;
  const asfa     = tasas.incluir_solidarista  ? roundMoney(bruto * tasas.tasa_solidarista)  : 0;

  const tot_ded  = roundMoney(ccss_ob + bp + renta + pension + asfa);
  const neto     = roundMoney(bruto - tot_ded);

  // Cargas patronales (la empresa siempre las paga, independiente de exención obrera)
  const ccss_pat    = c.aplica_ccss ? roundMoney(bruto * tasas.tasa_ccss_patronal) : 0;
  const aguinaldo   = roundMoney(bruto / 12);
  const vacaciones  = roundMoney(bruto * 2 / 48);
  const ces_prov    = roundMoney((bruto / 30) * 22 / 12);
  const tot_costo   = roundMoney(bruto + ccss_pat + aguinaldo + vacaciones + ces_prov);

  return {
    colaborador_id:c.id, salario_base:sal, dias_laborados:diasLab,
    horas_extra_diurnas:he_d, horas_extra_nocturnas:he_n, horas_extra_feriado:he_f,
    valor_hora_ordinaria:vHora, monto_he_diurnas:mHED, monto_he_nocturnas:mHEN, monto_he_feriado:mHEF,
    bonificacion:0, comision:0, otros_ingresos:0, total_bruto:bruto,
    ded_ccss_obrero:ccss_ob, ded_banco_popular:bp, ded_renta:renta,
    ded_pension_comp:pension, ded_asfa:asfa, ded_embargo:0, ded_adelanto:0, ded_otras:0,
    total_deducciones:tot_ded, salario_neto:neto,
    ccss_patronal:ccss_pat, provision_aguinaldo:aguinaldo,
    provision_vacaciones:vacaciones, provision_cesantia:ces_prov,
    total_costo_empresa:tot_costo, estado:'calculado', notas:null,
  };
}

export default function CalculoPlanillas({ empresaId, canEdit, empresaNombre, empresaCedula }: Props) {
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNuevo, setShowNuevo] = useState(false);
  const [fPer, setFPer] = useState<Partial<Periodo>>({ frecuencia:'mensual', estado:'abierto' });
  const [savingPer, setSavingPer] = useState(false);
  const [perActivo, setPerActivo] = useState<Periodo|null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [tasas, setTasas] = useState<TasasCCSS|null>(null);
  const [escala, setEscala] = useState<EscalaRenta[]>([]);
  const [loadingL, setLoadingL] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [editLinea, setEditLinea] = useState<Linea|null>(null);
  const [showLinea, setShowLinea] = useState(false);
  const [savingL, setSavingL] = useState(false);
  const [error, setError] = useState('');
  // Colilla
  const [colillaLinea, setColillaLinea] = useState<Linea|null>(null);
  // Asiento contable
  const [showAsiento, setShowAsiento] = useState(false);
  const [asientoData, setAsientoData] = useState<any>(null);
  const [loadingAsiento, setLoadingAsiento] = useState(false);
  const [contabilizando, setContabilizando] = useState(false);
  // Exportar
  const [descargandoPdf, setDescargandoPdf] = useState(false);
  // Config cuentas
  const [showConfig, setShowConfig] = useState(false);
  const [cfgCuentas, setCfgCuentas] = useState<Record<string,any>>({});
  const [savingCfg, setSavingCfg] = useState(false);
  const [cuentasCatalogo, setCuentasCatalogo] = useState<{id:number;codigo:string;nombre:string}[]>([]);

  const loadPeriodos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('pl_periodos').select('*').eq('empresa_id', empresaId).order('fecha_inicio', { ascending:false });
    setPeriodos(data || []); setLoading(false);
  }, [empresaId]);

  const loadMaestros = useCallback(async () => {
    const anio = new Date().getFullYear();
    const [{ data: cols }, { data: tasasData }, { data: esc }] = await Promise.all([
      supabase.from('pl_colaboradores')
        .select('id,nombre_completo,numero_empleado,identificacion,tipo_salario,salario,estado,jornada,horas_semana,horas_mes_base,aplica_ccss,aplica_renta,aplica_banco_popular,email,email_personal,banco,numero_cuenta')
        .eq('empresa_id', empresaId).eq('estado','activo').order('nombre_completo'),
      // Tasas CCSS universales — una sola fila global, sin empresa_id
      supabase.from('v_tasas_ccss_vigente').select('*').maybeSingle(),
      supabase.from('pl_escala_renta').select('tramo,limite_inferior,limite_superior,tasa').eq('empresa_id', empresaId).eq('anio', anio).order('tramo'),
    ]);
    setColaboradores((cols || []).map(c => ({
      ...c,
      aplica_ccss: c.aplica_ccss ?? true,
      aplica_renta: c.aplica_renta ?? true,
      aplica_banco_popular: c.aplica_banco_popular ?? true,
      horas_mes_base: c.horas_mes_base ?? 240,
    })));
    setTasas(tasasData ? {
      tasa_ccss_obrero:    tasasData.tasa_ccss_obrero,
      tasa_ccss_patronal:  tasasData.tasa_ccss_patronal,
      tasa_banco_popular:  tasasData.tasa_banco_popular,
      tasa_solidarista:    tasasData.tasa_solidarista ?? 0,
      incluir_solidarista: tasasData.incluir_solidarista ?? false,
      tasa_pension_comp:   tasasData.tasa_pension_comp ?? 0.01,
      incluir_pension_comp:tasasData.incluir_pension_comp ?? false,
      fecha_vigencia:      tasasData.fecha_vigencia,
      decreto_referencia:  tasasData.decreto_referencia,
    } : {
      tasa_ccss_obrero:0.1067, tasa_ccss_patronal:0.2667, tasa_banco_popular:0.01,
      tasa_solidarista:0.01, incluir_solidarista:false,
      tasa_pension_comp:0.01, incluir_pension_comp:false,
      fecha_vigencia:'2024-01-01', decreto_referencia:'Decreto CCSS 2024',
    });
    setEscala(esc || []);
  }, [empresaId]);

  useEffect(() => { loadPeriodos(); loadMaestros(); }, [loadPeriodos, loadMaestros]);

  const abrirPeriodo = useCallback(async (p: Periodo) => {
    setPerActivo(p); setLoadingL(true);
    const { data } = await supabase.from('pl_planilla_lineas').select('*').eq('periodo_id', p.id);
    const sorted = (data || []).sort((a, b) => {
      const na = colaboradores.find(c => c.id === a.colaborador_id)?.nombre_completo ?? '';
      const nb = colaboradores.find(c => c.id === b.colaborador_id)?.nombre_completo ?? '';
      return na.localeCompare(nb, 'es');
    });
    setLineas(sorted); setLoadingL(false);
  }, [colaboradores]);

  const crearPeriodo = async () => {
    if (!fPer.nombre?.trim() || !fPer.fecha_inicio || !fPer.fecha_fin) { setError('Nombre y fechas son requeridos.'); return; }
    setSavingPer(true); setError('');
    const { error: err } = await supabase.from('pl_periodos').insert({ empresa_id:empresaId, nombre:fPer.nombre.trim(), frecuencia:fPer.frecuencia||'mensual', fecha_inicio:fPer.fecha_inicio, fecha_fin:fPer.fecha_fin, estado:'abierto', notas:fPer.notas?.trim()||null });
    if (err) { setError(err.message); }
    else { setShowNuevo(false); loadPeriodos(); logModuloEvento({ empresaId, modulo:'planilla', accion:'periodo_creado', descripcion:fPer.nombre }); }
    setSavingPer(false);
  };

  const calcular = async () => {
    if (!perActivo || !tasas) return;
    setCalculando(true); setError('');
    const diasBase = DIAS_PERIODO[perActivo.frecuencia] ?? 30;
    // Preservar ajustes manuales existentes
    const ajustesExistentes = lineas;
    const nuevas = colaboradores.map(c => {
      const ajuste = ajustesExistentes.find(l => l.colaborador_id === c.id);
      const base = calcLinea(c, tasas, escala, ajuste?.dias_laborados ?? diasBase, diasBase);
      if (!ajuste) return base;
      // Recalcular con los campos manuales preservados
      return recalcLinea({
        ...base,
        id: ajuste.id,
        dias_laborados:        ajuste.dias_laborados,
        horas_extra_diurnas:   ajuste.horas_extra_diurnas,
        horas_extra_nocturnas: ajuste.horas_extra_nocturnas,
        horas_extra_feriado:   ajuste.horas_extra_feriado   ?? 0,
        bonificacion:          ajuste.bonificacion           ?? 0,
        comision:              ajuste.comision               ?? 0,
        otros_ingresos:        ajuste.otros_ingresos         ?? 0,
        ded_embargo:           ajuste.ded_embargo            ?? 0,
        ded_adelanto:          ajuste.ded_adelanto           ?? 0,
        ded_otras:             ajuste.ded_otras              ?? 0,
        notas:                 ajuste.notas,
      });
    });
    await supabase.from('pl_planilla_lineas').delete().eq('periodo_id', perActivo.id);
    const { error: err } = await supabase.from('pl_planilla_lineas').insert(nuevas.map(l => ({ ...l, empresa_id:empresaId, periodo_id:perActivo.id })));
    if (!err) {
      const tot = { total_bruto:roundMoney(nuevas.reduce((s,l)=>s+l.total_bruto,0)), total_deducciones:roundMoney(nuevas.reduce((s,l)=>s+l.total_deducciones,0)), total_neto:roundMoney(nuevas.reduce((s,l)=>s+l.salario_neto,0)), total_patronal:roundMoney(nuevas.reduce((s,l)=>s+l.ccss_patronal+l.provision_aguinaldo+l.provision_vacaciones+l.provision_cesantia,0)) };
      await supabase.from('pl_periodos').update({ estado:'calculado', ...tot, updated_at:new Date().toISOString() }).eq('id', perActivo.id);
      logModuloEvento({ empresaId, modulo:'planilla', accion:'planilla_calculada', descripcion:perActivo.nombre, detalle:{ colaboradores:nuevas.length } });
      await loadPeriodos();
      setPerActivo(p => p ? { ...p, estado:'calculado', ...tot } : p);
      setLineas([...nuevas].sort((a, b) => {
        const na = colaboradores.find(c => c.id === a.colaborador_id)?.nombre_completo ?? '';
        const nb = colaboradores.find(c => c.id === b.colaborador_id)?.nombre_completo ?? '';
        return na.localeCompare(nb, 'es');
      }));
    } else { setError(err.message); }
    setCalculando(false);
  };

  const cerrar = async () => {
    if (!perActivo) return;
    if (!window.confirm('¿Confirma cerrar la planilla? No se puede deshacer.')) return;
    setCerrando(true);
    await supabase.from('pl_periodos').update({ estado:'cerrado', updated_at:new Date().toISOString() }).eq('id', perActivo.id);
    logModuloEvento({ empresaId, modulo:'planilla', accion:'planilla_cerrada', descripcion:perActivo.nombre });
    await loadPeriodos();
    setPerActivo(p => p ? { ...p, estado:'cerrado' } : p);
    setCerrando(false);
  };

  // Recalcula totales de la línea al ajustar campos manualmente
  const recalcLinea = (linea: Linea): Linea => {
    if (!tasas) return linea;
    const colab = colaboradores.find(c => c.id === linea.colaborador_id);
    const diasBase = DIAS_PERIODO[perActivo?.frecuencia ?? 'mensual'] ?? 30;
    const salBase = colab ? roundMoney(colab.salario * linea.dias_laborados / diasBase) : linea.salario_base;
    const vHora = linea.valor_hora_ordinaria ?? 0;
    const mHED = roundMoney((linea.horas_extra_diurnas ?? 0) * vHora * 1.5);
    const mHEN = roundMoney((linea.horas_extra_nocturnas ?? 0) * vHora * 2.0);
    const mHEF = roundMoney((linea.horas_extra_feriado ?? 0) * vHora * 2.0);
    const otrosIng = roundMoney((linea.bonificacion ?? 0) + (linea.comision ?? 0) + (linea.otros_ingresos ?? 0));
    const bruto = roundMoney(salBase + mHED + mHEN + mHEF + otrosIng);
    const aplica_ccss = colab?.aplica_ccss ?? true;
    const aplica_renta = colab?.aplica_renta ?? true;
    const aplica_bp = colab?.aplica_banco_popular ?? true;
    const ccss_ob = aplica_ccss  ? roundMoney(bruto * tasas.tasa_ccss_obrero)   : 0;
    const bp      = aplica_bp    ? roundMoney(bruto * tasas.tasa_banco_popular)  : 0;
    const renta   = aplica_renta ? calcRenta(colab?.salario ?? bruto, escala, linea.dias_laborados, diasBase) : 0;
    const pension = tasas.incluir_pension_comp ? roundMoney(bruto * tasas.tasa_pension_comp) : 0;
    const asfa    = tasas.incluir_solidarista  ? roundMoney(bruto * tasas.tasa_solidarista)  : 0;
    const embargo  = roundMoney(linea.ded_embargo ?? 0);
    const adelanto = roundMoney(linea.ded_adelanto ?? 0);
    const otras    = roundMoney(linea.ded_otras ?? 0);
    const tot_ded  = roundMoney(ccss_ob + bp + renta + pension + asfa + embargo + adelanto + otras);
    const neto     = roundMoney(bruto - tot_ded);
    const ccss_pat   = aplica_ccss ? roundMoney(bruto * tasas.tasa_ccss_patronal) : 0;
    const aguinaldo  = roundMoney(bruto / 12);
    const vacaciones = roundMoney(bruto * 2 / 48);
    const cesantia   = roundMoney((bruto / 30) * 22 / 12);
    const tot_costo  = roundMoney(bruto + ccss_pat + aguinaldo + vacaciones + cesantia);
    return {
      ...linea,
      salario_base: salBase,
      monto_he_diurnas: mHED, monto_he_nocturnas: mHEN, monto_he_feriado: mHEF,
      total_bruto: bruto,
      ded_ccss_obrero: ccss_ob, ded_banco_popular: bp, ded_renta: renta,
      ded_pension_comp: pension, ded_asfa: asfa,
      total_deducciones: tot_ded, salario_neto: neto,
      ccss_patronal: ccss_pat, provision_aguinaldo: aguinaldo,
      provision_vacaciones: vacaciones, provision_cesantia: cesantia,
      total_costo_empresa: tot_costo,
    };
  };

  const guardarLinea = async () => {
    if (!editLinea || !perActivo) return;
    setSavingL(true);
    const { error: err } = editLinea.id
      ? await supabase.from('pl_planilla_lineas').update({ ...editLinea, updated_at:new Date().toISOString() }).eq('id', editLinea.id)
      : await supabase.from('pl_planilla_lineas').upsert({ ...editLinea, empresa_id:empresaId, periodo_id:perActivo.id }, { onConflict: 'periodo_id,colaborador_id' });
    if (!err) { setShowLinea(false); abrirPeriodo(perActivo); }
    else { setError(err.message); }
    setSavingL(false);
  };

  const colNombre = (id: number) => colaboradores.find(c => c.id === id)?.nombre_completo ?? `ID ${id}`;
  const totBruto = lineas.reduce((s,l)=>s+l.total_bruto,0);

  // Preparar asiento contable
  const prepararAsiento = async () => {
    if (!perActivo) return;
    setLoadingAsiento(true); setError('');
    try {
      const res = await fetch(`/api/planilla/periodos/${perActivo.id}/preparar-asiento`, {
        headers: { 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` }
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error); setLoadingAsiento(false); return; }
      setAsientoData(data);
      setShowAsiento(true);
    } catch (e: any) { setError(e.message); }
    setLoadingAsiento(false);
  };

  const confirmarAsiento = async () => {
    if (!asientoData || !perActivo) return;
    setContabilizando(true); setError('');
    try {
      const res = await fetch(`/api/planilla/periodos/${perActivo.id}/confirmar-asiento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ empresa_id: empresaId, lineas: asientoData.lineas, descripcion: `Planilla ${perActivo.nombre}` }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error); setContabilizando(false); return; }
      logModuloEvento({ empresaId, modulo: 'planilla', accion: 'planilla_contabilizada', descripcion: perActivo.nombre, detalle: { asiento_id: data.asiento_id, numero: data.numero_formato } });
      setShowAsiento(false);
      await loadPeriodos();
      setPerActivo(p => p ? { ...p, estado: 'contabilizado' } : p);
    } catch (e: any) { setError(e.message); }
    setContabilizando(false);
  };

  // HTML compartido para PDF e impresión
  const buildReporteHtml = () => {
    const fmtN = (n: number) => new Intl.NumberFormat('es-CR',{style:'currency',currency:'CRC',maximumFractionDigits:0}).format(n??0);
    const fmtF = (s: string) => s ? new Date(s+'T12:00:00').toLocaleDateString('es-CR') : '';
    const rows = lineas.map(l => {
      const hExtra   = (l.monto_he_diurnas??0)+(l.monto_he_nocturnas??0)+(l.monto_he_feriado??0);
      const otrosIng = (l.bonificacion??0)+(l.comision??0)+(l.otros_ingresos??0);
      const ccssBP   = (l.ded_ccss_obrero??0)+(l.ded_banco_popular??0);
      const otrasDed = (l.ded_pension_comp??0)+(l.ded_asfa??0)+(l.ded_embargo??0)+(l.ded_adelanto??0)+(l.ded_otras??0);
      return `<tr>
        <td>${colNombre(l.colaborador_id)}</td>
        <td class="r">${l.dias_laborados}</td>
        <td class="r">${fmtN(l.salario_base)}</td>
        <td class="r">${hExtra>0?fmtN(hExtra):'—'}</td>
        <td class="r">${otrosIng>0?fmtN(otrosIng):'—'}</td>
        <td class="r b">${fmtN(l.total_bruto)}</td>
        <td class="r red">${fmtN(ccssBP)}</td>
        <td class="r pur">${l.ded_renta>0?fmtN(l.ded_renta):'—'}</td>
        <td class="r red">${otrasDed>0?fmtN(otrasDed):'—'}</td>
        <td class="r red b">${fmtN(l.total_deducciones)}</td>
        <td class="r grn b">${fmtN(l.salario_neto)}</td>
      </tr>`;
    }).join('');
    const totHExtra   = lineas.reduce((s,l)=>s+(l.monto_he_diurnas??0)+(l.monto_he_nocturnas??0)+(l.monto_he_feriado??0),0);
    const totOtrosIng = lineas.reduce((s,l)=>s+(l.bonificacion??0)+(l.comision??0)+(l.otros_ingresos??0),0);
    const totCCSSOb   = lineas.reduce((s,l)=>s+(l.ded_ccss_obrero??0)+(l.ded_banco_popular??0),0);
    const totRenta    = lineas.reduce((s,l)=>s+(l.ded_renta??0),0);
    const totOtrasDed = lineas.reduce((s,l)=>s+(l.ded_pension_comp??0)+(l.ded_asfa??0)+(l.ded_embargo??0)+(l.ded_adelanto??0)+(l.ded_otras??0),0);
    const totSalBase  = lineas.reduce((s,l)=>s+(l.salario_base??0),0);
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>
@page { size: Letter landscape; margin: 8mm 10mm; }
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Times New Roman',Times,serif; font-size:9pt; color:#1a1a1a; padding:16px 20px; }
.hdr { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:7pt; border-bottom:1.5pt solid #1a1a1a; margin-bottom:10pt; }
.empresa { font-size:12pt; font-weight:bold; }
.sub { font-size:8.5pt; color:#444; margin-top:2pt; }
.titulo { font-size:10pt; font-weight:bold; text-align:right; }
table { width:100%; border-collapse:collapse; }
th { font-size:9pt; font-weight:bold; padding:3px 5px; border-bottom:1.5pt solid #1a1a1a; text-align:left; white-space:nowrap; }
th.r, td.r { text-align:right; }
td { font-size:9pt; padding:3px 5px; border-bottom:0.5pt solid #d0d0d0; white-space:nowrap; }
.red { color:#c00; } .grn { color:#166534; } .pur { color:#5b21b6; } .b { font-weight:bold; }
tfoot td { font-weight:bold; border-top:1.5pt solid #1a1a1a; border-bottom:none; padding-top:5px; }
.footer { margin-top:10pt; font-size:8pt; color:#888; text-align:center; }
</style></head><body>
<div class="hdr">
  <div>
    <div class="empresa">${empresaNombre??''}${empresaCedula?` — Cédula Jurídica: ${empresaCedula}`:''}</div>
    <div class="sub">Detalle de Planilla — Colaboradores</div>
  </div>
  <div>
    <div class="titulo">${perActivo!.nombre}</div>
    <div class="sub" style="text-align:right">${fmtF(perActivo!.fecha_inicio)} al ${fmtF(perActivo!.fecha_fin)}</div>
    <div class="sub" style="text-align:right">${lineas.length} colaboradores</div>
  </div>
</div>
<table>
  <thead><tr>
    <th>Colaborador</th><th class="r">Días</th><th class="r">Sal. Base</th>
    <th class="r">H. Extra</th><th class="r">Otros Ing.</th><th class="r">Total Bruto</th>
    <th class="r">CCSS+BP</th><th class="r">Renta</th><th class="r">Otras Ded.</th>
    <th class="r">Total Ded.</th><th class="r">Neto a Pagar</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr>
    <td>TOTALES (${lineas.length})</td><td></td>
    <td class="r">${fmtN(totSalBase)}</td>
    <td class="r">${totHExtra>0?fmtN(totHExtra):'—'}</td>
    <td class="r">${totOtrosIng>0?fmtN(totOtrosIng):'—'}</td>
    <td class="r b">${fmtN(totBruto)}</td>
    <td class="r red">${fmtN(totCCSSOb)}</td>
    <td class="r pur">${totRenta>0?fmtN(totRenta):'—'}</td>
    <td class="r red">${totOtrasDed>0?fmtN(totOtrasDed):'—'}</td>
    <td class="r red b">${fmtN(lineas.reduce((s,l)=>s+l.total_deducciones,0))}</td>
    <td class="r grn b">${fmtN(totNeto)}</td>
  </tr></tfoot>
</table>
<div class="footer">Generado por MYA ERP · ${new Date().toLocaleDateString('es-CR',{timeZone:'America/Costa_Rica'})} · Confidencial</div>
</body></html>`;
  };

  // Exportar Excel (.xlsx)
  const exportarExcel = async () => {
    if (!perActivo || lineas.length === 0) return;
    const XLSX = await import('xlsx');
    const headers = ['Colaborador','Días','Sal. Base','H. Extra','Otros Ing.','Total Bruto','CCSS+BP','Renta','Otras Ded.','Total Ded.','Neto a Pagar'];
    const dataRows = lineas.map(l => {
      const hExtra   = (l.monto_he_diurnas??0)+(l.monto_he_nocturnas??0)+(l.monto_he_feriado??0);
      const otrosIng = (l.bonificacion??0)+(l.comision??0)+(l.otros_ingresos??0);
      const ccssBP   = (l.ded_ccss_obrero??0)+(l.ded_banco_popular??0);
      const otrasDed = (l.ded_pension_comp??0)+(l.ded_asfa??0)+(l.ded_embargo??0)+(l.ded_adelanto??0)+(l.ded_otras??0);
      return [colNombre(l.colaborador_id), l.dias_laborados, l.salario_base, hExtra||0, otrosIng||0, l.total_bruto, ccssBP, l.ded_renta||0, otrasDed||0, l.total_deducciones, l.salario_neto];
    });
    // Fila de totales
    const totHExtra   = lineas.reduce((s,l)=>s+(l.monto_he_diurnas??0)+(l.monto_he_nocturnas??0)+(l.monto_he_feriado??0),0);
    const totOtrosIng = lineas.reduce((s,l)=>s+(l.bonificacion??0)+(l.comision??0)+(l.otros_ingresos??0),0);
    const totals = [`TOTALES (${lineas.length})`, '', lineas.reduce((s,l)=>s+(l.salario_base??0),0), totHExtra, totOtrosIng, totBruto, lineas.reduce((s,l)=>s+(l.ded_ccss_obrero??0)+(l.ded_banco_popular??0),0), lineas.reduce((s,l)=>s+(l.ded_renta??0),0), lineas.reduce((s,l)=>s+(l.ded_pension_comp??0)+(l.ded_asfa??0)+(l.ded_embargo??0)+(l.ded_adelanto??0)+(l.ded_otras??0),0), lineas.reduce((s,l)=>s+l.total_deducciones,0), totNeto];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      [`${empresaNombre??''} — Detalle de Planilla — Colaboradores`],
      [`${perActivo.nombre} · ${perActivo.fecha_inicio} al ${perActivo.fecha_fin} · ${lineas.length} colaboradores`],
      [],
      headers,
      ...dataRows,
      [],
      totals,
    ]);

    // Ancho de columnas
    ws['!cols'] = [{ wch:30 },{ wch:6 },{ wch:14 },{ wch:12 },{ wch:12 },{ wch:14 },{ wch:14 },{ wch:12 },{ wch:12 },{ wch:14 },{ wch:14 }];

    // Combinar celda de título
    ws['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:10} }, { s:{r:1,c:0}, e:{r:1,c:10} }];

    XLSX.utils.book_append_sheet(wb, ws, 'Planilla');
    XLSX.writeFile(wb, `planilla_${perActivo.nombre}.xlsx`);
  };

  // Imprimir — abre ventana con HTML limpio
  const imprimirReporte = () => {
    if (!perActivo || lineas.length === 0) return;
    const html = buildReporteHtml();
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.onafterprint = () => win.close();
    setTimeout(() => { win.print(); }, 400);
  };

  // Descargar PDF via servidor
  const descargarPdfCalculo = async () => {
    if (!perActivo || lineas.length === 0) return;
    setDescargandoPdf(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? '';
      const html = buildReporteHtml();
      const res = await fetch('/api/planilla/reporte-pdf', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', ...(token?{'Authorization':`Bearer ${token}`}:{}) },
        body: JSON.stringify({ html, nombre: `planilla_${perActivo.nombre}` }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=url; a.download=`planilla_${perActivo.nombre}.pdf`; a.click();
        URL.revokeObjectURL(url);
      }
    } catch(e){ console.error(e); }
    finally { setDescargandoPdf(false); }
  };

  // Cargar config cuentas
  const abrirConfig = async () => {
    const [{ data: cfg }, { data: cat }] = await Promise.all([
      supabase.from('pl_config_deducciones').select('*').eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('cuentas_catalogo').select('id,codigo,nombre').eq('empresa_id', empresaId).eq('activa', true).order('codigo'),
    ]);
    setCfgCuentas(cfg || {});
    setCuentasCatalogo(cat || []);
    setShowConfig(true);
  };

  const guardarConfig = async () => {
    setSavingCfg(true);
    const campos = ['cuenta_sueldos_id','cuenta_ccss_obrero_id','cuenta_ccss_patronal_id','cuenta_renta_id','cuenta_banco_popular_id','cuenta_solidarista_id','cuenta_prov_aguinaldo_id','cuenta_prov_vacaciones_id','cuenta_prov_cesantia_id','cuenta_sueldos_pagar_id'];
    const payload: Record<string,any> = { empresa_id: empresaId, updated_at: new Date().toISOString() };
    campos.forEach(c => { payload[c] = cfgCuentas[c] ? Number(cfgCuentas[c]) : null; });
    const { error: err } = cfgCuentas.id
      ? await supabase.from('pl_config_deducciones').update(payload).eq('empresa_id', empresaId)
      : await supabase.from('pl_config_deducciones').insert(payload);
    if (!err) setShowConfig(false);
    else setError(err.message);
    setSavingCfg(false);
  };
  const totNeto  = lineas.reduce((s,l)=>s+l.salario_neto,0);
  const totPat   = lineas.reduce((s,l)=>s+l.ccss_patronal+l.provision_aguinaldo+l.provision_vacaciones+l.provision_cesantia,0);

  const modalNuevo = showNuevo && ReactDOM.createPortal(
    <div className="pl-overlay" onClick={() => setShowNuevo(false)}>
      <div className="pl-modal" onClick={e => e.stopPropagation()}>
        <p className="pl-modal-title">Nuevo Período de Planilla</p>
        {error && <div className="pl-err">{error}</div>}
        <div className="pl-field"><label>Nombre *</label><input className="pl-input" placeholder="Ej: Planilla Mensual Abril 2026" value={fPer.nombre??''} onChange={e => setFPer(p=>({...p,nombre:e.target.value}))} autoFocus /></div>
        <div className="pl-field"><label>Tipo de Período</label>
          <select className="pl-select" value={fPer.frecuencia??'mensual'} onChange={e => setFPer(p=>({...p,frecuencia:e.target.value}))}>
            {FRECUENCIAS.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
          </select>
        </div>
        <div className="pl-g2">
          <div className="pl-field"><label>Desde *</label><input type="date" className="pl-input" value={fPer.fecha_inicio??''} onChange={e => setFPer(p=>({...p,fecha_inicio:e.target.value}))} /></div>
          <div className="pl-field"><label>Hasta *</label><input type="date" className="pl-input" value={fPer.fecha_fin??''} onChange={e => setFPer(p=>({...p,fecha_fin:e.target.value}))} /></div>
        </div>
        <div className="pl-field"><label>Notas</label><input className="pl-input" value={fPer.notas??''} onChange={e => setFPer(p=>({...p,notas:e.target.value}))} /></div>
        <div className="pl-modal-foot">
          <button className="pl-btn" onClick={() => { setShowNuevo(false); setError(''); }}>Cancelar</button>
          <button className="pl-btn main" onClick={crearPeriodo} disabled={savingPer}>{savingPer ? 'Guardando...' : 'Crear Período'}</button>
        </div>
      </div>
    </div>, document.body
  );

  const modalLinea = showLinea && editLinea && ReactDOM.createPortal(
    <div className="pl-overlay" onClick={() => setShowLinea(false)}>
      <div className="pl-modal wide" onClick={e => e.stopPropagation()}>
        <p className="pl-modal-title">Ajustar línea — {colNombre(editLinea.colaborador_id)}</p>
        {error && <div className="pl-err">{error}</div>}
        {/* Valor hora referencia */}
        {editLinea.valor_hora_ordinaria ? (
          <div className="pl-info" style={{ marginBottom:12 }}>
            Valor hora ordinaria: <strong className="mono">{formatMoneyCRC(editLinea.valor_hora_ordinaria)}</strong>
            {' · '}H.Extra diurna (×1.5): <strong className="mono">{formatMoneyCRC(roundMoney(editLinea.valor_hora_ordinaria * 1.5))}</strong>
            {' · '}H.Extra nocturna/feriado (×2): <strong className="mono">{formatMoneyCRC(roundMoney(editLinea.valor_hora_ordinaria * 2))}</strong>
          </div>
        ) : null}
        <div className="pl-g3">
          {/* Campos de cantidad — sin formato moneda */}
          {([
            ['dias_laborados',       'Días Laborados'],
            ['horas_extra_diurnas',  'H.Extra Diurnas (×1.5)'],
            ['horas_extra_nocturnas','H.Extra Nocturnas (×2)'],
            ['horas_extra_feriado',  'H.Extra Feriado (×2)'],
          ] as const).map(([key, label]) => (
            <div className="pl-field" key={key}>
              <label>{label}</label>
              <input type="number" className="pl-input"
                value={(editLinea as unknown as Record<string,unknown>)[key] as number ?? 0}
                onChange={e => setEditLinea(p => p ? recalcLinea({ ...p, [key]: Number(e.target.value) }) : p)} />
            </div>
          ))}
          {/* Campos de monto — formato CRC con onFocus/onBlur */}
          {([
            ['bonificacion',  'Bonificación'],
            ['comision',      'Comisión'],
            ['otros_ingresos','Otros Ingresos'],
            ['ded_embargo',   'Embargo'],
            ['ded_adelanto',  'Adelanto'],
            ['ded_otras',     'Otras Ded.'],
          ] as const).map(([key, label]) => {
            const val = (editLinea as unknown as Record<string,unknown>)[key] as number ?? 0;
            return (
              <div className="pl-field" key={key}>
                <label>{label}</label>
                <input
                  className="pl-input mono"
                  inputMode="numeric"
                  placeholder="0,00"
                  defaultValue={val === 0 ? '' : formatMoneyCRC(val)}
                  key={`${key}-${val}`}
                  onFocus={e => { e.target.value = val === 0 ? '' : String(val); }}
                  onBlur={e => {
                    const raw = Number(e.target.value.replace(/[^\d]/g, '')) || 0;
                    setEditLinea(p => p ? recalcLinea({ ...p, [key]: raw }) : p);
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="pl-result">
          {([
            // Ingresos
            { l:'Salario base',        v: editLinea.salario_base,                                     sub: false },
            { l:'H.Extra diurnas',     v: editLinea.monto_he_diurnas??0,                              sub: false, hide: !(editLinea.horas_extra_diurnas > 0) },
            { l:'H.Extra nocturnas',   v: editLinea.monto_he_nocturnas??0,                            sub: false, hide: !(editLinea.horas_extra_nocturnas > 0) },
            { l:'H.Extra feriado',     v: editLinea.monto_he_feriado??0,                              sub: false, hide: !((editLinea.horas_extra_feriado??0) > 0) },
            { l:'Bonificación',        v: editLinea.bonificacion??0,                                  sub: false, hide: !((editLinea.bonificacion??0) > 0) },
            { l:'Comisión',            v: editLinea.comision??0,                                      sub: false, hide: !((editLinea.comision??0) > 0) },
            { l:'Otros ingresos',      v: editLinea.otros_ingresos??0,                                sub: false, hide: !((editLinea.otros_ingresos??0) > 0) },
            { l:'Total bruto',         v: editLinea.total_bruto,                                      sub: true  },
            // Deducciones
            { l:'CCSS obrero',         v: editLinea.ded_ccss_obrero??0,                               sub: false, hide: !((editLinea.ded_ccss_obrero??0) > 0) },
            { l:'Banco Popular',       v: editLinea.ded_banco_popular??0,                             sub: false, hide: !((editLinea.ded_banco_popular??0) > 0) },
            { l:'Imp. Renta',          v: editLinea.ded_renta??0,                                     sub: false, hide: !((editLinea.ded_renta??0) > 0) },
            { l:'Pensión comp.',       v: editLinea.ded_pension_comp??0,                              sub: false, hide: !((editLinea.ded_pension_comp??0) > 0) },
            { l:'Solidarista',         v: editLinea.ded_asfa??0,                                      sub: false, hide: !((editLinea.ded_asfa??0) > 0) },
            { l:'Embargo',             v: editLinea.ded_embargo??0,                                   sub: false, hide: !((editLinea.ded_embargo??0) > 0) },
            { l:'Adelanto',            v: editLinea.ded_adelanto??0,                                  sub: false, hide: !((editLinea.ded_adelanto??0) > 0) },
            { l:'Otras ded.',          v: editLinea.ded_otras??0,                                     sub: false, hide: !((editLinea.ded_otras??0) > 0) },
            { l:'Total deducciones',   v: editLinea.total_deducciones,                                sub: true  },
          ] as { l:string; v:number; sub:boolean; hide?:boolean }[])
            .filter(r => !r.hide)
            .map(({ l, v, sub }) => (
            <div className="row" key={l} style={sub ? { background:'rgba(34,197,94,0.08)', borderRadius:6, padding:'5px 8px', margin:'3px -4px' } : {}}>
              <span style={{ color: sub ? '#f3f7ff' : '#8ea3c7', fontWeight: sub ? 700 : 400 }}>{l}</span>
              <span className="mono" style={{ color: sub ? '#22c55e' : '#f3f7ff', fontWeight: sub ? 700 : 400 }}>{formatMoneyCRC(v)}</span>
            </div>
          ))}
          <div className="total"><span>NETO</span><span className="mono">{formatMoneyCRC(editLinea.salario_neto)}</span></div>
        </div>
        <div className="pl-field"><label>Notas</label><input className="pl-input" value={editLinea.notas??''} onChange={e => setEditLinea(p => p ? { ...p, notas:e.target.value } : p)} /></div>
        <div className="pl-modal-foot">
          <button className="pl-btn" onClick={() => setShowLinea(false)}>Cancelar</button>
          <button className="pl-btn main" onClick={guardarLinea} disabled={savingL}>{savingL ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>, document.body
  );

  // Empresa para colilla
  const empresaInfo = { nombre: empresaNombre ?? `Empresa ${empresaId}`, cedula: empresaCedula ?? '' };

  // Modal asiento contable
  const modalAsiento = showAsiento && asientoData && ReactDOM.createPortal(
    <div className="pl-overlay" onClick={() => setShowAsiento(false)}>
      <div className="pl-modal wide" onClick={e => e.stopPropagation()}>
        <p className="pl-modal-title">Asiento Contable — {perActivo?.nombre}</p>
        <p className="pl-modal-sub">Revise las líneas antes de confirmar. Esta acción no se puede deshacer.</p>
        {error && <div className="pl-err">{error}</div>}
        {!asientoData.cuadra && <div className="pl-err">⚠ El asiento no cuadra. Verifique las cuentas configuradas.</div>}
        <div className="pl-table-wrap" style={{ marginBottom: 14 }}>
          <table className="pl-table" style={{ fontSize: 12 }}>
            <thead><tr><th>#</th><th>Cuenta</th><th>Descripción</th><th className="r">Débito</th><th className="r">Crédito</th></tr></thead>
            <tbody>
              {asientoData.lineas.map((l: any) => (
                <tr key={l.linea}>
                  <td style={{ color:'#8ea3c7' }}>{l.linea}</td>
                  <td><span className="mono" style={{ color:'#38bdf8' }}>{l.cuenta_codigo}</span> {l.cuenta_nombre}</td>
                  <td style={{ color:'#8ea3c7', fontSize:11 }}>{l.descripcion}</td>
                  <td className="r mono" style={{ color: l.debito_crc > 0 ? '#f3f7ff' : '#475569' }}>{l.debito_crc > 0 ? formatMoneyCRC(l.debito_crc) : '—'}</td>
                  <td className="r mono" style={{ color: l.credito_crc > 0 ? '#f3f7ff' : '#475569' }}>{l.credito_crc > 0 ? formatMoneyCRC(l.credito_crc) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} style={{ color:'#f3f7ff', fontWeight:700 }}>TOTALES</td>
                <td className="r mono" style={{ fontWeight:700, color: asientoData.cuadra ? '#22c55e' : '#f87171' }}>{formatMoneyCRC(asientoData.total_debito)}</td>
                <td className="r mono" style={{ fontWeight:700, color: asientoData.cuadra ? '#22c55e' : '#f87171' }}>{formatMoneyCRC(asientoData.total_credito)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="pl-modal-foot">
          <button className="pl-btn" onClick={() => setShowAsiento(false)}>Cancelar</button>
          <button className="pl-btn main" onClick={confirmarAsiento} disabled={contabilizando || !asientoData.cuadra}>
            {contabilizando ? 'Contabilizando...' : '✓ Confirmar y Contabilizar'}
          </button>
        </div>
      </div>
    </div>, document.body
  );

  // Modal config cuentas contables
  const modalConfig = showConfig && ReactDOM.createPortal(
    <div className="pl-overlay" onClick={() => setShowConfig(false)}>
      <div className="pl-modal wide" onClick={e => e.stopPropagation()}>
        <p className="pl-modal-title">Configuración Cuentas Contables — Planilla</p>
        <p className="pl-modal-sub">Asigne las cuentas del catálogo para cada componente del asiento de planilla.</p>
        {error && <div className="pl-err">{error}</div>}
        <div className="pl-g2">
          {([
            ['cuenta_sueldos_id',         'Gasto Sueldos (Débito)'],
            ['cuenta_ccss_obrero_id',      'CCSS Obrero por Pagar (Crédito)'],
            ['cuenta_ccss_patronal_id',    'CCSS Patronal por Pagar (Crédito)'],
            ['cuenta_renta_id',            'Renta Retenida por Pagar (Crédito)'],
            ['cuenta_banco_popular_id',    'Banco Popular por Pagar (Crédito)'],
            ['cuenta_solidarista_id',      'Solidarista por Pagar (Crédito)'],
            ['cuenta_prov_aguinaldo_id',   'Provisión Aguinaldo'],
            ['cuenta_prov_vacaciones_id',  'Provisión Vacaciones'],
            ['cuenta_prov_cesantia_id',    'Provisión Cesantía'],
            ['cuenta_sueldos_pagar_id',    'Sueldos Netos por Pagar (Crédito)'],
          ] as const).map(([key, label]) => (
            <div className="pl-field" key={key}>
              <label>{label}</label>
              <select className="pl-select" value={cfgCuentas[key] ?? ''} onChange={e => setCfgCuentas(p => ({ ...p, [key]: e.target.value }))}>
                <option value="">— Sin asignar —</option>
                {cuentasCatalogo.map(c => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="pl-modal-foot">
          <button className="pl-btn" onClick={() => setShowConfig(false)}>Cancelar</button>
          <button className="pl-btn main" onClick={guardarConfig} disabled={savingCfg}>{savingCfg ? 'Guardando...' : 'Guardar Configuración'}</button>
        </div>
      </div>
    </div>, document.body
  );

  // Vista detalle período
  if (perActivo) {
    const esCerrado = ['cerrado','contabilizado'].includes(perActivo.estado);
    return (
      <div className="pl-wrap">
        <style>{PL_STYLES}</style>
        <style>{`
          @media print {
            @page { size: Letter landscape; margin: 8mm 10mm; }
            body * { visibility: hidden !important; }
            .pl-calculo-print, .pl-calculo-print * { visibility: visible !important; }
            .pl-calculo-print {
              position: fixed !important; top: 0 !important; left: 0 !important;
              width: 100% !important; padding: 0 !important;
              background: #fff !important; color: #1a1a1a !important;
              box-shadow: none !important; border-radius: 0 !important;
              font-family: 'Times New Roman', Times, serif !important;
            }
            .pl-calculo-print .pl-table-wrap { overflow: visible !important; }
            .pl-calculo-print table { width: 100% !important; border-collapse: collapse !important; font-family: 'Times New Roman', Times, serif !important; font-size: 9pt !important; color: #1a1a1a !important; }
            .pl-calculo-print th { font-size: 9pt !important; font-weight: bold !important; color: #1a1a1a !important; padding: 4px 5px !important; border-bottom: 1.5pt solid #1a1a1a !important; white-space: nowrap !important; background: none !important; text-transform: none !important; letter-spacing: 0 !important; }
            .pl-calculo-print td { font-size: 9pt !important; font-weight: normal !important; color: #1a1a1a !important; padding: 3px 5px !important; border-bottom: 0.5pt solid #d0d0d0 !important; white-space: nowrap !important; background: none !important; }
            .pl-calculo-print tfoot td { font-weight: bold !important; border-top: 1.5pt solid #1a1a1a !important; border-bottom: none !important; }
            .pl-print-hdr { display: block !important; margin-bottom: 8pt !important; padding-bottom: 6pt !important; border-bottom: 1.5pt solid #1a1a1a !important; font-family: 'Times New Roman', Times, serif !important; }
            .pl-print-hdr-empresa { font-size: 11pt !important; font-weight: bold !important; color: #1a1a1a !important; }
            .pl-print-hdr-titulo { font-size: 10pt !important; font-weight: bold !important; color: #1a1a1a !important; margin-top: 2pt !important; }
            .pl-print-hdr-sub { font-size: 8.5pt !important; color: #444 !important; margin-top: 2pt !important; }
            .no-print { display: none !important; }
          }
          .pl-print-hdr { display: none; }
        `}</style>
        {modalLinea}
        {modalAsiento}
        {modalConfig}
        {colillaLinea && (() => {
          const colab = colaboradores.find(c => c.id === colillaLinea.colaborador_id);
          return colab ? (
            <ColillaPago
              linea={colillaLinea}
              colaborador={{ nombre_completo: colab.nombre_completo, identificacion: colab.identificacion ?? '', numero_empleado: colab.numero_empleado, numero_asegurado: null, email: colab.email, email_personal: colab.email_personal, banco: colab.banco, numero_cuenta: colab.numero_cuenta }}
              periodo={perActivo}
              empresa={empresaInfo}
              periodoId={perActivo.id}
              onClose={() => setColillaLinea(null)}
            />
          ) : null;
        })()}
        <div className="pl-hdr">
          <div className="pl-hdr-left">
            <button className="pl-btn" style={{ marginBottom:6, fontSize:12, padding:'5px 12px' }} onClick={() => { setPerActivo(null); setLineas([]); }}>← Volver</button>
            <h2 className="pl-title">{perActivo.nombre}</h2>
            <p className="pl-sub">{formatCompanyDate(perActivo.fecha_inicio)} — {formatCompanyDate(perActivo.fecha_fin)}</p>
          </div>
          <div className="pl-btn-row">
            <span className="pl-chip" style={{ background:(ESTADO_COLORS[perActivo.estado]??'#8ea3c7')+'33', color:ESTADO_COLORS[perActivo.estado]??'#8ea3c7', padding:'5px 14px', fontSize:12 }}>{perActivo.estado.toUpperCase()}</span>
            {canEdit && <button className="pl-btn" style={{ fontSize:12 }} onClick={abrirConfig}>⚙ Cuentas</button>}
            {!esCerrado && canEdit && <button className="pl-btn blue" onClick={calcular} disabled={calculando}>{calculando ? 'Calculando...' : '⟳ Calcular'}</button>}
            {perActivo.estado === 'calculado' && canEdit && <button className="pl-btn main" onClick={cerrar} disabled={cerrando}>{cerrando ? 'Cerrando...' : '🔒 Cerrar'}</button>}
            {perActivo.estado === 'cerrado' && canEdit && <button className="pl-btn" style={{ borderColor:'#a78bfa', color:'#a78bfa' }} onClick={prepararAsiento} disabled={loadingAsiento}>{loadingAsiento ? 'Preparando...' : '📒 Contabilizar'}</button>}
            {perActivo.estado === 'contabilizado' && <span style={{ fontSize:12, color:'#a78bfa' }}>✓ Contabilizado</span>}
            {lineas.length > 0 && <>
              <button className="pl-btn" style={{ borderColor:'#16a34a', color:'#22c55e', fontSize:12 }} onClick={imprimirReporte}>🖨 Imprimir</button>
              <button className="pl-btn" style={{ fontSize:12 }} onClick={exportarExcel}>⬇ Excel</button>
              <button className="pl-btn" style={{ borderColor:'#7c3aed', color:'#a78bfa', fontSize:12 }} onClick={descargarPdfCalculo} disabled={descargandoPdf}>{descargandoPdf ? 'Generando...' : '⬇ PDF'}</button>
            </>}
          </div>
        </div>
        {error && <div className="pl-err">{error}</div>}
        <div className="pl-kpi-grid">
          {[
            { l:'Total Bruto',     v:formatMoneyCRC(totBruto), c:'#d6e2ff' },
            { l:'Total Neto',      v:formatMoneyCRC(totNeto),  c:'#22c55e' },
            { l:'Total Ded.',      v:formatMoneyCRC(lineas.reduce((s,l)=>s+l.total_deducciones,0)), c:'#f87171' },
            { l:'Costo Patronal',  v:formatMoneyCRC(totPat),   c:'#a78bfa' },
          ].map(s => <div className="pl-kpi" key={s.l}><div className="k">{s.l}</div><div className="v mono" style={{ fontSize:16, color:s.c }}>{s.v}</div></div>)}
        </div>
        <div className="pl-card pl-calculo-print">
          <div className="pl-print-hdr">
            <div className="pl-print-hdr-empresa">{empresaNombre}{empresaCedula ? ` — Cédula Jurídica: ${empresaCedula}` : ''}</div>
            <div className="pl-print-hdr-titulo">Detalle de Planilla — Colaboradores</div>
            <div className="pl-print-hdr-sub">{perActivo.nombre} · {formatCompanyDate(perActivo.fecha_inicio)} al {formatCompanyDate(perActivo.fecha_fin)} · {lineas.length} colaboradores</div>
          </div>
          <div className="pl-table-wrap">
            {loadingL ? <div className="pl-empty">Cargando...</div> : lineas.length === 0 ? <div className="pl-empty">Haga clic en "Calcular" para generar las líneas.</div> : (
              <table className="pl-table" style={{ fontSize:12 }}>
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th className="r">Días</th>
                    <th className="r">Sal. Base</th>
                    <th className="r">H. Extra</th>
                    <th className="r">Otros Ing.</th>
                    <th className="r" style={{ color:'#d6e2ff' }}>Total Bruto</th>
                    <th className="r" style={{ color:'#f87171' }}>CCSS+BP</th>
                    <th className="r" style={{ color:'#a78bfa' }}>Renta</th>
                    <th className="r" style={{ color:'#f87171' }}>Otras Ded.</th>
                    <th className="r" style={{ color:'#f87171' }}>Total Ded.</th>
                    <th className="r" style={{ color:'#22c55e' }}>Neto a Pagar</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map(l => {
                    const hExtra   = (l.monto_he_diurnas??0) + (l.monto_he_nocturnas??0) + (l.horas_extra_feriado ? (l.monto_he_feriado??0) : 0);
                    const otrosIng = (l.bonificacion??0) + (l.comision??0) + (l.otros_ingresos??0);
                    const ccssBP   = (l.ded_ccss_obrero??0) + (l.ded_banco_popular??0);
                    const otrasDed = (l.ded_pension_comp??0) + (l.ded_asfa??0) + (l.ded_embargo??0) + (l.ded_adelanto??0) + (l.ded_otras??0);
                    return (
                      <tr key={l.colaborador_id}>
                        <td style={{ fontWeight:600, color:'#f3f7ff', whiteSpace:'nowrap' }}>{colNombre(l.colaborador_id)}</td>
                        <td className="r mono">{l.dias_laborados}</td>
                        <td className="r mono">{formatMoneyCRC(l.salario_base)}</td>
                        <td className="r mono" style={{ color: hExtra > 0 ? '#38bdf8' : '#4a5568' }}>{hExtra > 0 ? formatMoneyCRC(hExtra) : '—'}</td>
                        <td className="r mono" style={{ color: otrosIng > 0 ? '#38bdf8' : '#4a5568' }}>{otrosIng > 0 ? formatMoneyCRC(otrosIng) : '—'}</td>
                        <td className="r mono" style={{ color:'#d6e2ff', fontWeight:700 }}>{formatMoneyCRC(l.total_bruto)}</td>
                        <td className="r mono" style={{ color:'#f87171' }}>{formatMoneyCRC(ccssBP)}</td>
                        <td className="r mono" style={{ color:'#a78bfa' }}>{l.ded_renta > 0 ? formatMoneyCRC(l.ded_renta) : '—'}</td>
                        <td className="r mono" style={{ color: otrasDed > 0 ? '#f87171' : '#4a5568' }}>{otrasDed > 0 ? formatMoneyCRC(otrasDed) : '—'}</td>
                        <td className="r mono" style={{ color:'#f87171', fontWeight:700 }}>{formatMoneyCRC(l.total_deducciones)}</td>
                        <td className="r mono" style={{ color:'#22c55e', fontWeight:800 }}>{formatMoneyCRC(l.salario_neto)}</td>
                        <td>
                          <div style={{ display:'flex', gap:4 }}>
                            <button className="pl-btn" style={{ padding:'3px 9px', fontSize:11 }} onClick={() => setColillaLinea({ ...l })}>🖨</button>
                            {canEdit && !esCerrado && <button className="pl-btn" style={{ padding:'3px 9px', fontSize:11 }} onClick={() => { setEditLinea({ ...l }); setError(''); setShowLinea(true); }}>Ajustar</button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ color:'#f3f7ff' }}>TOTALES ({lineas.length})</td>
                    <td></td>
                    <td className="r mono" style={{ color:'#d6e2ff' }}>{formatMoneyCRC(lineas.reduce((s,l)=>s+(l.salario_base??0),0))}</td>
                    <td className="r mono" style={{ color:'#38bdf8' }}>{(() => { const t = lineas.reduce((s,l)=>s+(l.monto_he_diurnas??0)+(l.monto_he_nocturnas??0)+(l.monto_he_feriado??0),0); return t > 0 ? formatMoneyCRC(t) : '—'; })()}</td>
                    <td className="r mono" style={{ color:'#38bdf8' }}>{(() => { const t = lineas.reduce((s,l)=>s+(l.bonificacion??0)+(l.comision??0)+(l.otros_ingresos??0),0); return t > 0 ? formatMoneyCRC(t) : '—'; })()}</td>
                    <td className="r mono" style={{ color:'#d6e2ff', fontWeight:800 }}>{formatMoneyCRC(totBruto)}</td>
                    <td className="r mono" style={{ color:'#f87171', fontWeight:800 }}>{formatMoneyCRC(lineas.reduce((s,l)=>s+(l.ded_ccss_obrero??0)+(l.ded_banco_popular??0),0))}</td>
                    <td className="r mono" style={{ color:'#a78bfa', fontWeight:800 }}>{(() => { const t = lineas.reduce((s,l)=>s+(l.ded_renta??0),0); return t > 0 ? formatMoneyCRC(t) : '—'; })()}</td>
                    <td className="r mono" style={{ color:'#f87171', fontWeight:800 }}>{(() => { const t = lineas.reduce((s,l)=>s+(l.ded_pension_comp??0)+(l.ded_asfa??0)+(l.ded_embargo??0)+(l.ded_adelanto??0)+(l.ded_otras??0),0); return t > 0 ? formatMoneyCRC(t) : '—'; })()}</td>
                    <td className="r mono" style={{ color:'#f87171', fontWeight:800 }}>{formatMoneyCRC(lineas.reduce((s,l)=>s+l.total_deducciones,0))}</td>
                    <td className="r mono" style={{ color:'#22c55e', fontWeight:800 }}>{formatMoneyCRC(totNeto)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pl-wrap">
      <style>{PL_STYLES}</style>
      {modalNuevo}
      <div className="pl-hdr">
        <div className="pl-hdr-left"><h2 className="pl-title">Cálculo de Planillas</h2><p className="pl-sub">Períodos de nómina — deducciones CCSS, renta CR y cargas patronales</p></div>
        {canEdit && <button className="pl-btn main" onClick={() => { setFPer({ frecuencia:'mensual', estado:'abierto' }); setError(''); setShowNuevo(true); }}>+ Nuevo Período</button>}
      </div>

      {tasas && (
        <div className="pl-info" style={{ marginBottom:14 }}>
          <strong>Tasas CCSS vigentes</strong> desde {formatCompanyDate(tasas.fecha_vigencia)}
          {tasas.decreto_referencia && <span style={{ color:'#8ea3c7' }}> ({tasas.decreto_referencia})</span>}
          {' — '}
          Obrero: <strong>{(tasas.tasa_ccss_obrero*100).toFixed(2)}%</strong> ·
          Patronal: <strong>{(tasas.tasa_ccss_patronal*100).toFixed(2)}%</strong> ·
          Banco Popular: <strong>{(tasas.tasa_banco_popular*100).toFixed(2)}%</strong> ·
          Renta: <strong>Escala progresiva MH</strong>
        </div>
      )}

      <div className="pl-card">
        <div className="pl-table-wrap">
          {loading ? <div className="pl-empty">Cargando...</div> : periodos.length === 0 ? <div className="pl-empty">No hay períodos creados.</div> : (
            <table className="pl-table">
              <thead><tr><th>Período</th><th>Frecuencia</th><th>Desde</th><th>Hasta</th><th className="r">Total Bruto</th><th className="r">Total Neto</th><th className="r">Costo Empresa</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {periodos.map(p => (
                  <tr key={p.id} style={{ cursor:'pointer' }} onClick={() => abrirPeriodo(p)}>
                    <td style={{ fontWeight:600, color:'#f3f7ff' }}>{p.nombre}</td>
                    <td style={{ color:'#8ea3c7' }}>{p.frecuencia}</td>
                    <td className="mono" style={{ color:'#8ea3c7' }}>{formatCompanyDate(p.fecha_inicio)}</td>
                    <td className="mono" style={{ color:'#8ea3c7' }}>{formatCompanyDate(p.fecha_fin)}</td>
                    <td className="r mono">{formatMoneyCRC(p.total_bruto)}</td>
                    <td className="r mono" style={{ color:'#22c55e', fontWeight:600 }}>{formatMoneyCRC(p.total_neto)}</td>
                    <td className="r mono" style={{ color:'#a78bfa' }}>{formatMoneyCRC(p.total_patronal)}</td>
                    <td><span className="pl-chip" style={{ background:(ESTADO_COLORS[p.estado]??'#8ea3c7')+'33', color:ESTADO_COLORS[p.estado]??'#8ea3c7' }}>{p.estado.toUpperCase()}</span></td>
                    <td style={{ color:'#22c55e', fontSize:12 }}>Abrir →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
