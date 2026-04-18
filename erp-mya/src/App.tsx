import React, { useCallback, useState, useEffect, type ReactNode } from 'react';
import { supabase } from './supabase';
import ListaEmpresas from './pages/Empresas/ListaEmpresas';
import ListaActividades from './pages/Mantenimientos/ListaActividades';
import ListaUsuarios from './pages/Mantenimientos/ListaUsuarios';
import ListaRoles from './pages/Mantenimientos/ListaRoles';
import ListaModulos from './pages/Mantenimientos/ListaModulos';
import ParametrosEmpresa from './pages/Mantenimientos/ParametrosEmpresa';
import BitacoraSeguridad from './pages/Mantenimientos/BitacoraSeguridad';
import BitacoraModulos from './pages/Mantenimientos/BitacoraModulos';
import AlertasDestinatarios from './pages/Mantenimientos/AlertasDestinatarios';
import EstadoAcceso from './pages/Mantenimientos/EstadoAcceso';
import AsientosDuplicados from './pages/Mantenimientos/AsientosDuplicados';
import HistorialTipoCambio from './pages/Mantenimientos/HistorialTipoCambio';
import ConsultaContribuyenteMH from './pages/Mantenimientos/ConsultaContribuyenteMH';
import FeReceptoresBitacora from './pages/Mantenimientos/FeReceptoresBitacora';
import SimuladorImpuestoRenta from './pages/Mantenimientos/SimuladorImpuestoRenta';
import EscenariosRentaPrueba from './pages/Mantenimientos/EscenariosRentaPrueba';
import TercerosUnificados from './pages/Mantenimientos/TercerosUnificados';
import PlanCuentas from './pages/Contabilidad/PlanCuentas';
import ListaAsientos from './pages/Contabilidad/ListaAsientos';
import CatalogoEmpresa from './pages/Contabilidad/CatalogoEmpresa';
import MayorGeneral from './pages/Contabilidad/MayorGeneral';
import BalanceComprobacion from './pages/Contabilidad/BalanceComprobacion';
import BalanceSituacion from './pages/Contabilidad/BalanceSituacion';
import EstadoResultados from './pages/Contabilidad/EstadoResultados';
import TiposAsiento from './pages/Contabilidad/TiposAsiento';
import ReporteAsientosTipo from './pages/Contabilidad/ReporteAsientosTipo';
import SmokeContabilidad from './pages/Contabilidad/SmokeContabilidad';
import CierreMensual from './pages/Contabilidad/CierreMensual';
import AuditoriaCierres from './pages/Contabilidad/AuditoriaCierres';
import EstadosFinancieros from './pages/Contabilidad/EstadosFinancieros';
import CarteraCxc from './pages/CXC/CarteraCxc';
import RecaudacionPagos from './pages/CXC/RecaudacionPagos';
import ReportesCobro from './pages/CXC/ReportesCobro';
import TramitesCobro from './pages/CXC/TramitesCobro';
import CuentasBancarias from './pages/Bancos/CuentasBancarias';
import CombustibleModule from './pages/combustible/CombustibleModule';
import ComprobantesRecibidos from './pages/Contabilidad/ComprobantesRecibidos';
import CuentasCorreo from './pages/Contabilidad/CuentasCorreo';
import ParametrosContabilidad from './pages/Contabilidad/ParametrosContabilidad';
import InventariosModule from './pages/Inventarios/InventariosModule';
import FacturacionConfiguracion from './pages/Facturacion/FacturacionConfiguracion';
import ExoneracionesMH from './pages/Facturacion/ExoneracionesMH';
import ConsultaCabys from './pages/Facturacion/ConsultaCabys';
import FacturacionComprobantes from './pages/Facturacion/FacturacionComprobantes';
import FacturacionHistorial from './pages/Facturacion/FacturacionHistorial';
import NotaCreditoPage from './pages/Facturacion/NotaCreditoPage';
import NotaDebitoPage from './pages/Facturacion/NotaDebitoPage';
import FacturaExportacionPage from './pages/Facturacion/FacturaExportacionPage';
import SuperusuarioOperaciones from './pages/Superusuario/SuperusuarioOperaciones';
import { CierresPOS } from './pages/Contabilidad/CierresPoS';
import { ConfigPOS } from './pages/Contabilidad/ConfigPoS';
import DepartamentosCargos from './pages/Planilla/DepartamentosCargos';
import TasasCCSS from './pages/Planilla/TasasCCSS';
import RubrosColaborador from './pages/Planilla/RubrosColaborador';
import Colaboradores from './pages/Planilla/Colaboradores';
import ControlAsistencia from './pages/Planilla/ControlAsistencia';
import AusenciasPermisos from './pages/Planilla/AusenciasPermisos';
import CalculoPlanillas from './pages/Planilla/CalculoPlanillas';
import PrestacionesLegales from './pages/Planilla/PrestacionesLegales';
import AccionesPersonal from './pages/Planilla/AccionesPersonal';
import ReportesPlanilla from './pages/Planilla/ReportesPlanilla';


interface Empresa {
  id: number;
  codigo: string;
  cedula: string;
  nombre: string;
  activo: boolean;
}

interface Usuario {
  id: number;
  username: string;
  nombre: string;
  email?: string;
  auth_user_id?: string | null;
  es_superusuario?: boolean;
}
type RolesPorEmpresa = Record<number, string>;

type PermissionKey = `${string}:${string}`;
type PermissionAction = 'ver' | 'crear' | 'editar' | 'eliminar' | 'aprobar';

interface RoutePermission {
  modulo: string;
  accion: PermissionAction;
}

interface SubmenuConfig {
  id: string;
  nombre: string;
  icono: string;
  route: string;
  permission: RoutePermission;
  soloSuperusuario?: boolean;
}

interface MenuModuleConfig {
  id: string;
  nombre: string;
  icono: string;
  route: string;
  permission: RoutePermission;
  soloSuperusuario?: boolean;
  submenus: SubmenuConfig[];
}


interface ThemeColors {
  bgDark: string;
  bgDark2: string;
  accentMain: string;
  accentDim: string;
  accentSoft: string;
  accentMuted: string;
  gray100: string;
  gray200: string;
  gray400: string;
  gray600: string;
  gray800: string;
}

interface ColorPalette {
  id: string;
  nombre: string;
  colors: ThemeColors;
}

const MENU_CONFIG: MenuModuleConfig[] = [
  {
    nombre: 'Contabilidad', icono: '🧮', id: 'contabilidad', route: 'contabilidad',
    permission: { modulo: 'contabilidad', accion: 'ver' },
    submenus: [
      { id: 'plancuentas', nombre: 'Plan de Cuentas (BASE)', icono: '📋', route: 'contabilidad.plancuentas', permission: { modulo: 'contabilidad', accion: 'ver' }, soloSuperusuario: true },
      { id: 'asientos', nombre: 'Asientos', icono: '📝', route: 'contabilidad.asientos', permission: { modulo: 'contabilidad', accion: 'ver' } },
      { id: 'mayorgeneral', nombre: 'Mayor General', icono: '📚', route: 'contabilidad.mayorgeneral', permission: { modulo: 'contabilidad', accion: 'ver' } },
      { id: 'balancecomprobacion', nombre: 'Balance Comprobación', icono: '⚖️', route: 'contabilidad.balancecomprobacion', permission: { modulo: 'contabilidad', accion: 'ver' } },
      { id: 'balancesituacion', nombre: 'Balance de Situación', icono: '🏦', route: 'contabilidad.balancesituacion', permission: { modulo: 'contabilidad', accion: 'ver' } },
      { id: 'estadoderesultados', nombre: 'Estado de Resultados', icono: '📉', route: 'contabilidad.estadoderesultados', permission: { modulo: 'contabilidad', accion: 'ver' } },
      { id: 'eeff', nombre: 'Estados Financieros (EEFF)', icono: '📊', route: 'contabilidad.eeff', permission: { modulo: 'contabilidad', accion: 'ver' } },
      { id: 'smokecontabilidad', nombre: 'Smoke Contable', icono: '🧪', route: 'contabilidad.smokecontabilidad', permission: { modulo: 'contabilidad', accion: 'ver' } },
      { id: 'cierremensual', nombre: 'Cierre Mensual', icono: '🔒', route: 'contabilidad.cierremensual', permission: { modulo: 'contabilidad', accion: 'editar' } },
      { id: 'auditoriacierres', nombre: 'Auditoria Cierres', icono: '🕵️', route: 'contabilidad.auditoriacierres', permission: { modulo: 'contabilidad', accion: 'ver' } },
      { id: 'catalogo', nombre: 'Catálogo Contable (EMPRESA)', icono: '📂', route: 'contabilidad.catalogo', permission: { modulo: 'contabilidad', accion: 'ver' } },
      { id: 'tiposasiento', nombre: 'Tipos de Asiento', icono: '🏷️', route: 'contabilidad.tiposasiento', permission: { modulo: 'contabilidad', accion: 'ver' } },
      { id: 'reporteasientostipo', nombre: 'Reporte por Tipo', icono: '📑', route: 'contabilidad.reporteasientostipo', permission: { modulo: 'contabilidad', accion: 'ver' } },
     { id: 'comprobantes', nombre: 'Comprobantes Recibidos', icono: '📨', route: 'contabilidad.comprobantes', permission: { modulo: 'contabilidad', accion: 'ver' } },
     { id: 'cuentascorreo', nombre: 'Cuentas de Correo', icono: '📧', route: 'contabilidad.cuentascorreo', permission: { modulo: 'contabilidad', accion: 'ver' } },
     { id: 'parametroscontabilidad', nombre: 'Parámetros Contabilidad', icono: '⚙️', route: 'contabilidad.parametroscontabilidad', permission: { modulo: 'contabilidad', accion: 'ver' } },
     { id: 'cierres-pos', nombre: 'Cierres de Caja POS', icono: '🔐', route: 'contabilidad.cierres-pos', permission: { modulo: 'contabilidad', accion: 'ver' } },
     { id: 'config-pos', nombre: 'Configuración POS', icono: '🛒', route: 'contabilidad.config-pos', permission: { modulo: 'contabilidad', accion: 'editar' } },
    ],
  },
  {
    nombre: 'Bancos', icono: '🏛️', id: 'bancos', route: 'bancos', permission: { modulo: 'bancos', accion: 'ver' },
    submenus: [
      { id: 'cuentas', nombre: 'Cuentas bancarias', icono: 'CT', route: 'bancos.cuentas', permission: { modulo: 'bancos', accion: 'ver' } },
      { id: 'conciliacion', nombre: 'Conciliación Bancaria', icono: 'CB', route: 'bancos.conciliacion', permission: { modulo: 'bancos', accion: 'ver' } },
      { id: 'depositos', nombre: 'Depósitos e Ingresos', icono: 'DI', route: 'bancos.depositos', permission: { modulo: 'bancos', accion: 'ver' } },
      { id: 'egresos', nombre: 'Cheques / Notas de débito', icono: 'CH', route: 'bancos.egresos', permission: { modulo: 'bancos', accion: 'ver' } },
    ],
  },
  { nombre: 'Proveedores', icono: '📬', id: 'proveedores', route: 'proveedores', permission: { modulo: 'proveedores', accion: 'ver' }, submenus: [] },
  {
    nombre: 'Clientes', icono: '🧑‍💼', id: 'clientes', route: 'clientes', permission: { modulo: 'clientes', accion: 'ver' },
    submenus: [
      { id: 'catalogo', nombre: 'Catalogo de clientes', icono: 'CL', route: 'clientes.catalogo', permission: { modulo: 'clientes', accion: 'ver' } },
    ],
  },
  { nombre: 'Inventarios', icono: '📦', id: 'inventarios', route: 'inventarios', permission: { modulo: 'inventarios', accion: 'ver' }, submenus: [] },
  {
    nombre: 'Planilla', icono: '🪪', id: 'planilla', route: 'planilla',
    permission: { modulo: 'planilla', accion: 'ver' },
    submenus: [
      { id: 'colaboradores',    nombre: 'Colaboradores',          icono: '👥', route: 'planilla.colaboradores',    permission: { modulo: 'planilla', accion: 'ver' } },
      { id: 'departamentos',    nombre: 'Departamentos y Cargos', icono: '🏢', route: 'planilla.departamentos',    permission: { modulo: 'planilla', accion: 'ver' } },
      { id: 'asistencia',       nombre: 'Control de Asistencia',  icono: '⏱️', route: 'planilla.asistencia',       permission: { modulo: 'planilla', accion: 'ver' } },
      { id: 'ausencias',        nombre: 'Ausencias y Permisos',   icono: '📅', route: 'planilla.ausencias',        permission: { modulo: 'planilla', accion: 'ver' } },
      { id: 'planillas',        nombre: 'Cálculo de Planillas',   icono: '💰', route: 'planilla.planillas',        permission: { modulo: 'planilla', accion: 'ver' } },
      { id: 'prestaciones',     nombre: 'Prestaciones Legales',   icono: '⚖️', route: 'planilla.prestaciones',     permission: { modulo: 'planilla', accion: 'ver' } },
      { id: 'accion-personal',  nombre: 'Acciones de Personal',   icono: '📋', route: 'planilla.accion-personal',  permission: { modulo: 'planilla', accion: 'ver' } },
      { id: 'reportes-planilla',nombre: 'Reportes de Planilla',   icono: '📊', route: 'planilla.reportes-planilla',permission: { modulo: 'planilla', accion: 'ver' } },
      { id: 'rubros',           nombre: 'Rubros Variables',       icono: '💼', route: 'planilla.rubros',           permission: { modulo: 'planilla', accion: 'ver' } },
      { id: 'tasas-ccss',       nombre: 'Tasas CCSS (Historial)', icono: '📜', route: 'planilla.tasas-ccss',       permission: { modulo: 'planilla', accion: 'ver' } },
    ],
  },
  { nombre: 'Activos Fijos', icono: '🏗️', id: 'activos', route: 'activos', permission: { modulo: 'activos', accion: 'ver' }, submenus: [] },
  {
    nombre: 'Cuentas por Cobrar', icono: '🗂️', id: 'cxc', route: 'cxc', permission: { modulo: 'cxc', accion: 'ver' },
    submenus: [
      { id: 'cartera', nombre: 'Cartera de Cuentas por Cobrar', icono: '📋', route: 'cxc.cartera', permission: { modulo: 'cxc', accion: 'ver' } },
      { id: 'gestioncobro', nombre: 'Gestión de Cobro', icono: '📞', route: 'cxc.gestioncobro', permission: { modulo: 'cxc', accion: 'ver' } },
      { id: 'tramitescobro', nombre: 'Tramites de Cobro', icono: 'TR', route: 'cxc.tramitescobro', permission: { modulo: 'cxc', accion: 'ver' } },
      { id: 'recaudacion', nombre: 'Recaudación y Aplicación de Pagos', icono: '💰', route: 'cxc.recaudacion', permission: { modulo: 'cxc', accion: 'ver' } },
      { id: 'reportescobro', nombre: 'Reportes de Cobro', icono: 'RP', route: 'cxc.reportescobro', permission: { modulo: 'cxc', accion: 'ver' } },
    ],
  },
  { nombre: 'Cuentas a Pagar', icono: '🧾', id: 'cxp', route: 'cxp', permission: { modulo: 'cxp', accion: 'ver' }, submenus: [] },
  {
    nombre: 'Facturación', icono: '💳', id: 'facturacion', route: 'facturacion', permission: { modulo: 'facturacion', accion: 'ver' },
    submenus: [
      { id: 'configuracion', nombre: 'Datos del emisor', icono: 'EM', route: 'facturacion.configuracion', permission: { modulo: 'facturacion', accion: 'ver' } },
      { id: 'exoneraciones', nombre: 'Exoneraciones MH', icono: 'EX', route: 'facturacion.exoneraciones', permission: { modulo: 'facturacion', accion: 'ver' } },
      { id: 'cabys', nombre: 'Consulta CABYS', icono: 'CB', route: 'facturacion.cabys', permission: { modulo: 'facturacion', accion: 'ver' } },
      { id: 'comprobantes', nombre: 'Facturación Electrónica', icono: 'FE', route: 'facturacion.comprobantes', permission: { modulo: 'facturacion', accion: 'ver' } },
      { id: 'nota-debito', nombre: 'Nota de Débito', icono: 'ND', route: 'facturacion.nota-debito', permission: { modulo: 'facturacion', accion: 'ver' } },
      { id: 'nota-credito', nombre: 'Nota de Crédito', icono: 'NC', route: 'facturacion.nota-credito', permission: { modulo: 'facturacion', accion: 'ver' } },
      { id: 'historial', nombre: 'Comprobantes Electrónicos', icono: 'CE', route: 'facturacion.historial', permission: { modulo: 'facturacion', accion: 'ver' } },
      { id: 'facturacion-exportacion', nombre: 'Factura Exportación', icono: 'FEE', route: 'facturacion.facturacion-exportacion', permission: { modulo: 'facturacion', accion: 'ver' } },
    ],
  },
  { nombre: 'Contro Piña', icono: '🍍', id: 'pina', route: 'pina', permission: { modulo: 'pina', accion: 'ver' }, submenus: [] },
  { nombre: 'Costos', icono: '📈', id: 'costos', route: 'costos', permission: { modulo: 'costos', accion: 'ver' }, submenus: [] },
  { nombre: 'Estadísticas', icono: '📊', id: 'estadisticas', route: 'estadisticas', permission: { modulo: 'estadisticas', accion: 'ver' }, submenus: [] },
  
{ nombre: 'Combustible', icono: '⛽', id: 'combustible', route: 'combustible',
permission: { modulo: 'combustible', accion: 'ver' }, submenus: [] },
  {nombre: 'Mantenimientos', icono: '🛠️', id: 'mantenimientos', route: 'mantenimientos',
    permission: { modulo: 'mantenimientos', accion: 'ver' },
    submenus: [
      { id: 'parametrosempresa', nombre: 'Parámetros Empresa', icono: '⚙️', route: 'mantenimientos.parametrosempresa', permission: { modulo: 'mantenimientos', accion: 'ver' } },
      { id: 'empresas', nombre: 'Empresas', icono: '🏢', route: 'mantenimientos.empresas', permission: { modulo: 'mantenimientos', accion: 'aprobar' } },
      { id: 'actividades', nombre: 'Actividades', icono: '🏭', route: 'mantenimientos.actividades', permission: { modulo: 'mantenimientos', accion: 'aprobar' } },
      { id: 'usuarios', nombre: 'Usuarios', icono: '👤', route: 'mantenimientos.usuarios', permission: { modulo: 'mantenimientos', accion: 'aprobar' } },
      { id: 'roles', nombre: 'Roles', icono: '🔑', route: 'mantenimientos.roles', permission: { modulo: 'mantenimientos', accion: 'aprobar' } },
      { id: 'modulos', nombre: 'Módulos', icono: '📋', route: 'mantenimientos.modulos', permission: { modulo: 'mantenimientos', accion: 'aprobar' } },
      { id: 'seguridad', nombre: 'Bitácora Seguridad', icono: '🛡️', route: 'mantenimientos.seguridad', permission: { modulo: 'mantenimientos', accion: 'ver' } },
      { id: 'bitacoramodulos', nombre: 'Bitácora Módulos', icono: '🧭', route: 'mantenimientos.bitacoramodulos', permission: { modulo: 'mantenimientos', accion: 'ver' } },
      { id: 'alertas', nombre: 'Destinatarios Alertas', icono: '📧', route: 'mantenimientos.alertas', permission: { modulo: 'mantenimientos', accion: 'ver' } },
      { id: 'estadoacceso', nombre: 'Estado de Acceso', icono: '🔍', route: 'mantenimientos.estadoacceso', permission: { modulo: 'mantenimientos', accion: 'ver' } },
      { id: 'asientosduplicados', nombre: 'Asientos Duplicados', icono: '🧹', route: 'mantenimientos.asientosduplicados', permission: { modulo: 'mantenimientos', accion: 'ver' } },
      { id: 'historialtipocambio', nombre: 'Historial Tipo Cambio', icono: '💱', route: 'mantenimientos.historialtipocambio', permission: { modulo: 'mantenimientos', accion: 'ver' } },
      { id: 'consultacontribuyentemh', nombre: 'Consulta Contribuyente MH', icono: '🧾', route: 'mantenimientos.consultacontribuyentemh', permission: { modulo: 'mantenimientos', accion: 'ver' } },
      { id: 'bitacorareceptoresfe', nombre: 'Bitácora Receptores FE', icono: '📒', route: 'mantenimientos.bitacorareceptoresfe', permission: { modulo: 'mantenimientos', accion: 'ver' } },
      { id: 'simuladorrenta', nombre: 'Simulador Impuesto Renta', icono: '🧮', route: 'mantenimientos.simuladorrenta', permission: { modulo: 'mantenimientos', accion: 'ver' } },
      { id: 'escenariosrentaprueba', nombre: 'Escenarios Renta Prueba', icono: '🧪', route: 'mantenimientos.escenariosrentaprueba', permission: { modulo: 'mantenimientos', accion: 'ver' } },
      { id: 'tercerosunificados', nombre: 'Terceros (Clientes/Prov.)', icono: '👥', route: 'mantenimientos.tercerosunificados', permission: { modulo: 'mantenimientos', accion: 'ver' } },
      { id: 'operacionessensibles', nombre: 'Operaciones sensibles', icono: '🛡️', route: 'mantenimientos.operacionessensibles', permission: { modulo: 'mantenimientos', accion: 'ver' }, soloSuperusuario: true },
    ],
  },
];

const ROUTE_PERMISSION_MAP = new Map<string, RoutePermission>();
MENU_CONFIG.forEach((moduleItem) => {
  ROUTE_PERMISSION_MAP.set(moduleItem.route, moduleItem.permission);
  moduleItem.submenus.forEach((submenuItem) => {
    ROUTE_PERMISSION_MAP.set(submenuItem.route, submenuItem.permission);
  });
});

const FAVORITOS_DEFAULT = ['clientes', 'inventarios', 'contabilidad', 'bancos', 'planilla', 'cxc', 'cxp'];


const COLOR_PALETTES: ColorPalette[] = [
  {
    id: 'emerald',
    nombre: 'Esmeralda',
    colors: {
      bgDark: '#0f1a14',
      bgDark2: '#162010',
      accentMain: '#22c55e',
      accentDim: '#16a34a',
      accentSoft: '#dcfce7',
      accentMuted: '#bbf7d0',
      gray100: '#f3f4f6',
      gray200: '#e5e7eb',
      gray400: '#9ca3af',
      gray600: '#4b5563',
      gray800: '#1f2937'
    }
  },
  {
    id: 'ocean',
    nombre: 'Océano',
    colors: {
      bgDark: '#0b1726',
      bgDark2: '#122236',
      accentMain: '#38bdf8',
      accentDim: '#0284c7',
      accentSoft: '#e0f2fe',
      accentMuted: '#bae6fd',
      gray100: '#f1f5f9',
      gray200: '#e2e8f0',
      gray400: '#94a3b8',
      gray600: '#475569',
      gray800: '#1e293b'
    }
  },
  {
    id: 'sunset',
    nombre: 'Atardecer',
    colors: {
      bgDark: '#221417',
      bgDark2: '#2f1b20',
      accentMain: '#f97316',
      accentDim: '#ea580c',
      accentSoft: '#ffedd5',
      accentMuted: '#fed7aa',
      gray100: '#faf7f5',
      gray200: '#ece3df',
      gray400: '#a8a29e',
      gray600: '#57534e',
      gray800: '#292524'
    }
  },
  {
    id: 'violet',
    nombre: 'Violeta',
    colors: {
      bgDark: '#181227',
      bgDark2: '#231a37',
      accentMain: '#a78bfa',
      accentDim: '#8b5cf6',
      accentSoft: '#ede9fe',
      accentMuted: '#ddd6fe',
      gray100: '#f5f3ff',
      gray200: '#e9e5ff',
      gray400: '#a1a1aa',
      gray600: '#52525b',
      gray800: '#27272a'
    }
  },
  {
    id: 'dark',
    nombre: 'Dark',
    colors: {
      bgDark:     '#0a0a0a',
      bgDark2:    '#111111',
      accentMain: '#e2e8f0',
      accentDim:  '#94a3b8',
      accentSoft: '#1e293b',
      accentMuted:'#334155',
      gray100: '#f8fafc',
      gray200: '#e2e8f0',
      gray400: '#94a3b8',
      gray600: '#64748b',
      gray800: '#1e293b',
    },
  },
  {
    id: 'white',
    nombre: 'Blanco',
    colors: {
      bgDark:     '#ffffff',
      bgDark2:    '#f8fafc',
      accentMain: '#2563eb',
      accentDim:  '#1d4ed8',
      accentSoft: '#eff6ff',
      accentMuted:'#bfdbfe',
      gray100: '#f1f5f9',
      gray200: '#e2e8f0',
      gray400: '#64748b',
      gray600: '#334155',
      gray800: '#0f172a',
    },
  },
  {
    id: 'ruby',
    nombre: 'Rubí',
    colors: {
      bgDark: '#241315',
      bgDark2: '#311a1d',
      accentMain: '#ef4444',
      accentDim: '#dc2626',
      accentSoft: '#fee2e2',
      accentMuted: '#fecaca',
      gray100: '#f7f4f4',
      gray200: '#ebe4e4',
      gray400: '#a8a29e',
      gray600: '#57534e',
      gray800: '#292524'
    }
  }
];

const THEME_STORAGE_KEY = 'mya-color-theme';
const REPORT_COMPANY_NAME_KEY = 'mya_report_company_name';
const MAYOR_GENERAL_PREFILL_KEY = 'mya_mayor_general_prefill';
const ASIENTO_OPEN_PREFILL_KEY = 'mya_asiento_open_prefill';

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; }
  :root {
    --bg-dark:     #0f1a14;
    --bg-dark2:    #162010;
    --green-main:  #22c55e;
    --green-dim:   #16a34a;
    --green-soft:  #dcfce7;
    --green-muted: #bbf7d0;
    --gray-100:    #f3f4f6;
    --gray-200:    #e5e7eb;
    --gray-400:    #9ca3af;
    --gray-600:    #4b5563;
    --gray-800:    #1f2937;
    --white:       #ffffff;
    --sidebar-w:   84px;
    --navbar-h:    86px;
  }
  .login-wrap { min-height:100vh; display:grid; grid-template-columns:1.25fr 460px; background:#0f172a; }
  .login-showcase { position:relative; overflow:hidden; display:flex; align-items:flex-end; padding:48px; }
  .login-slide-layer {
    position:absolute; inset:0;
    background-size:cover; background-position:center center; background-repeat:no-repeat;
    filter:saturate(1.2) contrast(1.08) brightness(1.08);
    opacity:0; transform:scale(1.02);
    transition:opacity 0.9s ease, transform 1.6s ease;
  }
  .login-slide-layer.active { opacity:1; transform:scale(1.0); }
  .login-deco {
    position:absolute; inset:0; pointer-events:none;
    background:
      linear-gradient(140deg, rgba(15,23,42,0.10) 0%, rgba(2,132,199,0.22) 48%, rgba(15,23,42,0.36) 100%),
      radial-gradient(circle at 72% 24%, rgba(56,189,248,0.22), transparent 52%),
      radial-gradient(circle at 20% 78%, rgba(34,197,94,0.20), transparent 52%);
    box-shadow: inset 0 -120px 190px rgba(2, 6, 23, 0.40);
  }
  .login-brand { position:relative; z-index:1; max-width:640px; color:#f8fafc; }
  .login-badge { display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border-radius:999px;
    border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.08); font-size:11px; letter-spacing:0.06em; text-transform:uppercase; }
  .login-hero-title { margin-top:16px; font-size:42px; line-height:1.05; letter-spacing:-0.04em; font-weight:600; }
  .login-hero-sub { margin-top:12px; font-size:15px; color:#cbd5e1; max-width:560px; }
  .login-hero-chip { margin-top:24px; display:inline-flex; align-items:center; gap:10px; border-radius:999px; padding:10px 16px;
    border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.10); font-family:'DM Mono',monospace; font-size:13px; }
  .login-dots { margin-top:20px; display:flex; gap:8px; }
  .login-dot { width:10px; height:10px; border-radius:999px; border:none; background:rgba(255,255,255,0.35); cursor:pointer; }
  .login-dot.active { background:#38bdf8; width:24px; }

  .login-panel-wrap { display:flex; align-items:center; justify-content:center; padding:28px; background:#e2e8f0; }
  .login-panel { width:100%; max-width:420px; background:#ffffff; border:1px solid #e2e8f0; border-radius:18px; padding:34px 28px;
    box-shadow:0 18px 45px rgba(15,23,42,0.16); }
  .login-logo { width:52px; height:52px; border-radius:14px; background:linear-gradient(135deg,var(--green-dim),var(--green-main)); display:flex; align-items:center; justify-content:center; font-family:'DM Mono',monospace; font-size:20px; font-weight:500; color:white; margin-bottom:14px; box-shadow:0 8px 20px rgba(15,23,42,0.2); }
  .login-logo img { width:34px; height:34px; object-fit:contain; border-radius:8px; }
  .login-title { font-size:25px; font-weight:700; color:#0f172a; letter-spacing:-0.02em; }
  .login-sub { font-size:13px; color:#64748b; margin-top:4px; margin-bottom:24px; }
  .field-label { display:block; font-size:11px; font-weight:600; color:#64748b; letter-spacing:0.06em; text-transform:uppercase; margin-bottom:6px; }
  .field-input { width:100%; padding:11px 13px; background:#f8fafc; border:1px solid #dbe1ea; border-radius:10px; color:#0f172a; font-size:14px; font-family:'DM Sans',sans-serif; outline:none; transition:border-color 0.2s,box-shadow 0.2s; margin-bottom:14px; }
  .field-input:focus { border-color:#38bdf8; box-shadow:0 0 0 3px rgba(56,189,248,0.18); }
  .field-input option { background:#ffffff; color:#0f172a; }
  .field-hint { font-size:11px; color:#64748b; font-family:'DM Mono',monospace; margin-top:-10px; margin-bottom:14px; }
  .btn-login { width:100%; padding:12px; background:linear-gradient(135deg,var(--green-dim),var(--green-main)); border:none; border-radius:10px; color:white; font-size:14px; font-weight:600; font-family:'DM Sans',sans-serif; cursor:pointer; transition:opacity 0.2s,transform 0.1s; margin-top:6px; }
  .btn-login:hover { opacity:0.92; }
  .btn-login:active { transform:scale(0.98); }
  .btn-login:disabled { opacity:0.6; cursor:not-allowed; }
  .login-error { font-size:12px; color:#dc2626; text-align:center; margin:4px 0 10px; }
  .login-footer { font-size:11px; color:#94a3b8; text-align:center; margin-top:24px; font-family:'DM Mono',monospace; }
  .app-shell { height:100vh; display:grid; grid-template-rows:auto 1fr; grid-template-columns:var(--sidebar-w) 1fr; grid-template-areas:"sidebar navbar" "sidebar main"; background:var(--gray-100); }
  .navbar {
    grid-area:navbar;
    background:var(--bg-dark);
    display:flex;
    flex-direction:column;
    gap:8px;
    padding:10px 24px 8px;
    border-bottom:1px solid rgba(34,197,94,0.12);
    position:sticky;
    top:0;
    z-index:40;
  }
  .navbar-top { display:flex; align-items:flex-start; gap:16px; }
  .navbar-menu-btn {
    display:none; width:36px; height:36px; border-radius:8px;
    border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.1);
    color:#fff; font-size:18px; line-height:1; cursor:pointer;
    align-items:center; justify-content:center; flex-shrink:0;
  }
  .navbar-company { flex:1; }
  .navbar-company-name { font-size:14px; font-weight:600; color:white; }
  .navbar-company-sub { font-size:11px; color:var(--green-main); font-family:'DM Mono',monospace; }
  .navbar-company-switch { margin-top:6px; width:320px; max-width:100%; padding:6px 9px; border-radius:8px;
    border:1px solid rgba(255,255,255,0.15); background:rgba(255,255,255,0.06); color:#fff;
    font-size:12px; font-family:'DM Sans',sans-serif; outline:none; }
  .navbar-company-switch:focus { border-color:var(--green-main); box-shadow:0 0 0 3px rgba(34,197,94,0.15); }
  .navbar-company-switch option { background:#1a2e1a; color:#fff; }
  .navbar-right { display:flex; align-items:center; gap:20px; margin-top:2px; }
  .navbar-tools { position:relative; }
  .navbar-tool-btn {
    width:40px; height:40px; border-radius:50%; border:1px solid rgba(255,255,255,0.24);
    background:rgba(255,255,255,0.12); color:#fff; font-size:18px; cursor:pointer;
    display:flex; align-items:center; justify-content:center; transition:all 0.18s ease;
    box-shadow:0 6px 14px rgba(2,6,23,0.18);
  }
  .navbar-tool-btn:hover { background:rgba(255,255,255,0.22); transform:translateY(-1px); }
  .navbar-tool-btn.active { background:rgba(255,255,255,0.26); border-color:rgba(255,255,255,0.4); }
  .navbar-dropdown {
    position:absolute; top:50px; right:0; width:350px; max-height:64vh; overflow:auto; z-index:40;
    background:#fff; border:1px solid #dbe1ea; border-radius:0; box-shadow:0 24px 45px rgba(2,6,23,0.20);
  }
  .navbar-dropdown-head {
    position:sticky; top:0; z-index:2;
    padding:14px 16px; border-bottom:1px solid #e5e7eb; font-size:22px; color:#64748b; text-align:center;
    background:#f8fafc;
  }
  .navbar-dropdown-item {
    width:100%; display:flex; align-items:center; gap:12px; padding:12px 14px; border:none;
    border-bottom:1px solid #e5e7eb; background:#fff; color:#1f3b63; cursor:pointer; text-align:left;
    font-size:15px; font-weight:500;
  }
  .navbar-dropdown-item:last-child { border-bottom:none; }
  .navbar-dropdown-item:hover { background:#f8fafc; }
  .navbar-dropdown-icon { width:22px; text-align:center; color:#64748b; font-size:17px; }
  .navbar-dropdown::-webkit-scrollbar { width:8px; }
  .navbar-dropdown::-webkit-scrollbar-track { background:#f1f5f9; border-radius:999px; }
  .navbar-dropdown::-webkit-scrollbar-thumb { background:#94a3b8; border-radius:999px; }
  .navbar-dropdown::-webkit-scrollbar-thumb:hover { background:#64748b; }
  .navbar-badge { font-size:11px; font-family:'DM Mono',monospace; color:var(--gray-400); }
  .navbar-badge span { color:var(--green-main); font-weight:500; }
  .navbar-tc {
    font-size:11px;
    font-family:'DM Mono',monospace;
    color:#d1fae5;
    background:rgba(34,197,94,0.12);
    border:1px solid rgba(34,197,94,0.25);
    border-radius:7px;
    padding:4px 8px;
    display:flex;
    align-items:center;
    gap:10px;
    white-space:nowrap;
  }
  .navbar-tc b { color:#86efac; font-weight:700; }
  .navbar-clock { font-size:13px; font-family:'DM Mono',monospace; color:white; font-weight:500; background:rgba(34,197,94,0.10); padding:4px 10px; border-radius:6px; border:1px solid rgba(34,197,94,0.2); }
  .navbar-user { display:flex; align-items:center; gap:8px; }
  .navbar-user-meta { display:flex; flex-direction:column; gap:2px; }
  .navbar-company-picker { width:36px; height:36px; border-radius:10px; border:1px solid rgba(255,255,255,0.24); background:rgba(255,255,255,0.12); color:#fff; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
  .navbar-company-picker:hover { background:rgba(255,255,255,0.22); }
  .navbar-username { font-size:13px; font-weight:500; color:white; }
  .navbar-userrole { font-size:11px; color:var(--green-main); font-family:'DM Mono',monospace; }
  .company-modal-backdrop { position:fixed; inset:0; background:rgba(2,6,23,0.52); display:flex; align-items:center; justify-content:center; z-index:80; padding:16px; }
  .company-modal { width:min(520px, 100%); background:#fff; border:1px solid #dbe1ea; border-radius:14px; box-shadow:0 20px 42px rgba(2,6,23,0.28); overflow:hidden; }
  .company-modal-head { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid #e5e7eb; background:#f8fafc; }
  .company-modal-title { font-size:14px; font-weight:700; color:#1f2937; }
  .company-modal-close { border:1px solid #d1d5db; background:#fff; color:#334155; border-radius:8px; padding:6px 10px; font-size:12px; cursor:pointer; }
  .company-modal-list { max-height:55vh; overflow:auto; padding:10px; display:flex; flex-direction:column; gap:8px; }
  .company-item { width:100%; border:1px solid #e5e7eb; border-radius:10px; background:#fff; padding:10px 12px; text-align:left; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .company-item:hover { border-color:#86efac; background:#f0fdf4; }
  .company-item.active { border-color:#22c55e; background:#dcfce7; }
  .company-item-name { font-size:13px; font-weight:600; color:#1f2937; }
  .company-item-sub { font-size:11px; color:#64748b; }
  .company-item-code { font-size:11px; color:#166534; font-family:'DM Mono',monospace; }
  .navbar-logout { display:flex; align-items:center; gap:6px; padding:7px 10px; border-radius:8px; border:1px solid rgba(248,113,113,0.28); background:rgba(248,113,113,0.12); color:#fecaca; font-size:12px; font-weight:600; cursor:pointer; transition:background 0.16s,border-color 0.16s,transform 0.1s; }
  .navbar-logout:hover { background:rgba(248,113,113,0.2); border-color:rgba(248,113,113,0.45); }
  .navbar-logout:active { transform:scale(0.98); }
  .navbar-logout-icon { font-size:13px; line-height:1; }
  .sidebar { grid-area:sidebar; width:var(--sidebar-w); background:linear-gradient(180deg,var(--bg-dark2),var(--bg-dark)); display:flex; flex-direction:column; align-items:stretch; padding:10px 10px 14px; border-right:1px solid rgba(255,255,255,0.08); overflow:hidden; transition:width 0.24s ease, box-shadow 0.24s ease; position:relative; z-index:70; }
  .sidebar:hover { width:260px; box-shadow:8px 0 32px rgba(0,0,0,0.28); }
  .sidebar-logo { width:100%; height:44px; display:flex; align-items:center; justify-content:flex-start; padding:0 8px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:12px; margin-bottom:10px; overflow:hidden; }
  .sidebar-logo-inner { min-width:30px; width:30px; height:30px; border-radius:9px; background:linear-gradient(135deg,var(--green-dim),var(--green-main)); display:flex; align-items:center; justify-content:center; font-family:'DM Mono',monospace; font-size:14px; font-weight:500; color:white; box-shadow:0 0 16px rgba(34,197,94,0.25); overflow:hidden; }
  .sidebar-logo-inner img { width:20px; height:20px; object-fit:contain; }
  .sidebar-logo-label { margin-left:10px; font-size:12px; font-weight:600; color:#f9fafb; letter-spacing:0.02em; white-space:nowrap; opacity:0; transform:translateX(-6px); transition:opacity 0.16s ease, transform 0.16s ease; }
  .sidebar:hover .sidebar-logo-label { opacity:1; transform:translateX(0); }
  .sidebar-item { width:100%; min-height:44px; border-radius:12px; display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:6px; padding:0 8px; transition:background 0.16s ease,border-color 0.16s ease; border:1px solid transparent; backdrop-filter:blur(2px); }
  .sidebar-item:hover { background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.16); }
  .sidebar-item.active { background:rgba(255,255,255,0.14); border-color:rgba(255,255,255,0.22); }
  .sidebar-icon-wrap { min-width:28px; width:28px; height:28px; border-radius:9px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12); transition:background 0.16s ease, border-color 0.16s ease; }
  .sidebar-icon { font-size:15px; color:#d1d5db; line-height:1; transition:color 0.16s; }
  .sidebar-item:hover .sidebar-icon-wrap,.sidebar-item.active .sidebar-icon-wrap { background:linear-gradient(135deg,var(--green-dim),var(--green-main)); border-color:transparent; }
  .sidebar-item:hover .sidebar-icon,.sidebar-item.active .sidebar-icon { color:white; }
  .sidebar-label { font-size:12px; color:#d1d5db; font-weight:500; white-space:nowrap; opacity:0; transform:translateX(-8px); transition:opacity 0.16s ease, transform 0.16s ease, color 0.16s; }
  .sidebar:hover .sidebar-label { opacity:1; transform:translateX(0); }
  .sidebar-item:hover .sidebar-label,.sidebar-item.active .sidebar-label { color:white; }
  .sidebar-divider { width:100%; height:1px; background:linear-gradient(90deg, transparent, rgba(255,255,255,0.14), transparent); margin:6px 0 8px; }
  .sidebar-exit { margin-top:auto; width:100%; min-height:42px; border-radius:12px; display:flex; align-items:center; gap:10px; padding:0 8px; cursor:pointer; border:1px solid transparent; transition:background 0.16s ease,border-color 0.16s ease; }
  .sidebar-exit:hover { background:rgba(248,113,113,0.16); border-color:rgba(248,113,113,0.24); }
  .sidebar-exit-icon-wrap { min-width:28px; width:28px; height:28px; border-radius:9px; background:rgba(248,113,113,0.20); border:1px solid rgba(248,113,113,0.28); display:flex; align-items:center; justify-content:center; }
  .sidebar-exit-icon { font-size:14px; color:#fca5a5; }
  .sidebar-exit-label { font-size:12px; color:#fca5a5; font-weight:500; white-space:nowrap; opacity:0; transform:translateX(-8px); transition:opacity 0.16s ease, transform 0.16s ease; }
  .sidebar:hover .sidebar-exit-label { opacity:1; transform:translateX(0); }
  .main-content { grid-area:main; padding:8px 32px 28px; overflow-y:auto; position:relative; isolation:isolate; background:var(--bg-dark); }
  .main-fullscreen .bg-gray-950 { background-color: var(--bg-dark) !important; }
  .main-fullscreen .bg-gray-900 { background-color: var(--bg-dark2) !important; }
  .main-fullscreen .border-gray-800 { border-color: rgba(255,255,255,0.07) !important; }

  /* ── Tema Blanco ─────────────────────────────────────────── */
  [data-theme="white"] .sidebar { border-right:1px solid #e2e8f0; }
  [data-theme="white"] .sidebar:hover { box-shadow:4px 0 16px rgba(0,0,0,0.08); }
  [data-theme="white"] .sidebar-logo { background:rgba(0,0,0,0.03); border:1px solid rgba(0,0,0,0.07); }
  [data-theme="white"] .sidebar-logo-label { color:#1e293b; }
  [data-theme="white"] .sidebar-item:hover { background:rgba(37,99,235,0.08); border-color:rgba(37,99,235,0.18); }
  [data-theme="white"] .sidebar-item.active { background:rgba(37,99,235,0.12); border-color:rgba(37,99,235,0.24); }
  [data-theme="white"] .sidebar-icon-wrap { background:rgba(0,0,0,0.05); border:1px solid rgba(0,0,0,0.09); }
  [data-theme="white"] .sidebar-icon { color:#475569; }
  [data-theme="white"] .sidebar-item:hover .sidebar-icon { color:white; }
  [data-theme="white"] .sidebar-label { color:#475569; }
  [data-theme="white"] .sidebar-item:hover .sidebar-label,
  [data-theme="white"] .sidebar-item.active .sidebar-label { color:#1e293b; }
  [data-theme="white"] .sidebar-divider { background:linear-gradient(90deg,transparent,rgba(0,0,0,0.10),transparent); }

  [data-theme="white"] .navbar { border-bottom:1px solid #e2e8f0; }
  [data-theme="white"] .navbar-menu-btn { border:1px solid #e2e8f0; background:#f1f5f9; color:#334155; }
  [data-theme="white"] .navbar-company-name { color:#0f172a; }
  [data-theme="white"] .navbar-company-switch { border:1px solid #e2e8f0; background:#f8fafc; color:#1e293b; }
  [data-theme="white"] .navbar-company-switch option { background:#fff; color:#1e293b; }
  [data-theme="white"] .navbar-tool-btn { border:1px solid #e2e8f0; background:#f1f5f9; color:#334155; box-shadow:0 2px 6px rgba(0,0,0,0.06); }
  [data-theme="white"] .navbar-tool-btn:hover { background:#e2e8f0; }
  [data-theme="white"] .navbar-tool-btn.active { background:#e2e8f0; border-color:#cbd5e1; }
  [data-theme="white"] .navbar-tc { color:#1e40af; background:rgba(37,99,235,0.08); border:1px solid rgba(37,99,235,0.20); }
  [data-theme="white"] .navbar-tc b { color:#1d4ed8; }
  [data-theme="white"] .navbar-clock { color:#1e293b; background:rgba(37,99,235,0.07); border:1px solid rgba(37,99,235,0.16); }
  [data-theme="white"] .navbar-username { color:#0f172a; }
  [data-theme="white"] .navbar-company-picker { border:1px solid #e2e8f0; background:#f1f5f9; color:#334155; }
  [data-theme="white"] .navbar-company-picker:hover { background:#e2e8f0; }
  [data-theme="white"] .navbar-breadcrumb-home { color:#2563eb; }
  [data-theme="white"] .navbar-breadcrumb-module { color:#334155; }
  [data-theme="white"] .navbar-breadcrumb-submenu { color:#1e293b; }
  [data-theme="white"] .welcome-bar { border-color:rgba(37,99,235,0.15); }
  [data-theme="white"] .welcome-bar-text p { color:#475569; }
  [data-theme="white"] .welcome-bar-date { color:#64748b; }
  [data-theme="white"] .welcome-bar-cia { color:#1e40af; background:rgba(37,99,235,0.09); border:1px solid rgba(37,99,235,0.18); }
  [data-theme="white"] .section-title { color:#64748b; }

  [data-theme="white"] .main-fullscreen .border-gray-800 { border-color:#e2e8f0 !important; }
  [data-theme="white"] .main-fullscreen .border-gray-700 { border-color:#cbd5e1 !important; }
  [data-theme="white"] .main-fullscreen .border-gray-600 { border-color:#94a3b8 !important; }
  [data-theme="white"] .main-fullscreen .text-white { color:#1e293b !important; }
  [data-theme="white"] .main-fullscreen .text-gray-200 { color:#334155 !important; }
  [data-theme="white"] .main-fullscreen .text-gray-300 { color:#475569 !important; }
  [data-theme="white"] .main-fullscreen .text-gray-400 { color:#64748b !important; }
  [data-theme="white"] .main-fullscreen .text-gray-500 { color:#94a3b8 !important; }
  [data-theme="white"] .main-fullscreen .text-gray-600 { color:#64748b !important; }
  [data-theme="white"] .main-fullscreen .bg-gray-800 { background-color:#e2e8f0 !important; }
  [data-theme="white"] .main-fullscreen .bg-gray-700 { background-color:#cbd5e1 !important; }
  [data-theme="white"] .main-fullscreen [class*="hover:bg-gray"]:hover { background-color:#e2e8f0 !important; }
  .navbar-breadcrumb {
    display:flex; align-items:center; gap:8px;
    margin:0; padding:4px 0 2px;
    font-size:16px; color:#94a3b8;
    border-top:1px solid rgba(255,255,255,0.08);
    margin-left:-24px;
    margin-right:-24px;
    padding-left:24px;
    padding-right:24px;
    min-width:0;
  }
  .navbar-breadcrumb-text { display:flex; align-items:center; gap:8px; flex:0 0 auto; white-space:nowrap; }
  .navbar-extra { flex:1; min-width:0; display:flex; align-items:center; justify-content:flex-end; gap:6px; padding-right:8px; }
  .navbar-breadcrumb-home { cursor:pointer; color:#22c55e; font-weight:500; flex:0 0 auto; }
  .navbar-breadcrumb-sep { flex:0 0 auto; }
  .navbar-breadcrumb-module { color:#f1f5f9; font-weight:500; min-width:0; overflow:hidden; text-overflow:ellipsis; }
  .navbar-breadcrumb-module.is-link { color:#94a3b8; cursor:pointer; }
  .navbar-breadcrumb-submenu { color:#f8fafc; font-weight:500; min-width:0; overflow:hidden; text-overflow:ellipsis; }
  .sidebar-backdrop {
    display:none; position:fixed; inset:0; z-index:50; background:rgba(2,6,23,0.45);
  }
  .section-title { font-size:11px; font-weight:600; color:var(--gray-400); letter-spacing:0.08em; text-transform:uppercase; margin-bottom:14px; }
  .favoritos-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:16px; margin-bottom:32px; }
  .fav-card { background:var(--card-bg); border:1px solid var(--card-border); border-radius:16px; padding:24px 16px; display:flex; flex-direction:column; align-items:center; gap:12px; cursor:pointer; transition:all 0.2s; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
  .fav-card:hover { border-color:var(--green-main); box-shadow:0 6px 20px rgba(34,197,94,0.14); transform:translateY(-3px); }
  .fav-card.active { border-color:var(--green-main); background:var(--green-soft); }
  .fav-icon { width:52px; height:52px; border-radius:14px; background:var(--green-soft); display:flex; align-items:center; justify-content:center; font-size:24px; transition:all 0.2s; }
  .fav-card:hover .fav-icon,.fav-card.active .fav-icon { background:linear-gradient(135deg,var(--green-dim),var(--green-main)); }
  .fav-name { font-size:13px; font-weight:600; color:var(--card-text); text-align:center; }
  .fav-arrow { font-size:11px; color:var(--green-dim); font-weight:600; opacity:0; transition:opacity 0.2s; }
  .fav-card:hover .fav-arrow { opacity:1; }
  .all-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:12px; }
  .mod-card { background:var(--card-bg); border:1px solid var(--card-border); border-radius:12px; padding:16px 12px; display:flex; flex-direction:column; align-items:center; gap:8px; cursor:pointer; transition:all 0.18s; }
  .mod-card:hover { border-color:var(--green-main); box-shadow:0 4px 12px rgba(34,197,94,0.10); transform:translateY(-2px); }
  .mod-icon { width:38px; height:38px; border-radius:10px; background:var(--green-soft); display:flex; align-items:center; justify-content:center; font-size:18px; transition:background 0.18s; }
  .mod-card:hover .mod-icon { background:linear-gradient(135deg,var(--green-dim),var(--green-main)); }
  .mod-name { font-size:11px; font-weight:500; color:var(--card-text); text-align:center; line-height:1.3; }
  .welcome-bar { background:var(--bg-dark); border-radius:14px; padding:18px 24px; display:flex; align-items:center; gap:16px; margin-bottom:24px; border:1px solid rgba(34,197,94,0.15); }
  .welcome-bar-avatar { width:42px; height:42px; border-radius:10px; background:linear-gradient(135deg,var(--green-dim),var(--green-main)); display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:600; color:white; flex-shrink:0; }
  .welcome-bar-text h2 { font-size:16px; font-weight:600; color:white; }
  .welcome-bar-text p { font-size:12px; color:var(--gray-400); margin-top:2px; }
  .welcome-bar-right { margin-left:auto; text-align:right; }
  .welcome-bar-cia { font-size:11px; font-family:'DM Mono',monospace; color:var(--green-main); background:rgba(34,197,94,0.12); padding:3px 10px; border-radius:6px; display:inline-block; border:1px solid rgba(34,197,94,0.2); }
  .welcome-bar-date { font-size:11px; color:var(--gray-400); margin-top:5px; font-family:'DM Mono',monospace; }
  .loading { display:flex; align-items:center; justify-content:center; min-height:100vh; background:var(--bg-dark); color:var(--green-main); font-family:'DM Mono',monospace; font-size:14px; }
  .theme-switcher-compact { position:fixed; right:16px; bottom:16px; z-index:40; }
  .theme-compact-btn { border:none; cursor:pointer; display:flex; align-items:center; gap:8px; padding:8px 10px;
    border-radius:999px; background:rgba(15,23,42,0.88); color:#fff; box-shadow:0 10px 24px rgba(0,0,0,0.22);
    border:1px solid rgba(255,255,255,0.12); backdrop-filter:blur(8px); }
  .theme-compact-dot { width:18px; height:18px; border-radius:999px; border:1px solid rgba(255,255,255,0.5); }
  .theme-compact-label { font-size:11px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#cbd5e1; }
  .theme-compact-btn:hover { transform:translateY(-1px); }
  @media (max-width: 1100px) {
    .login-wrap { grid-template-columns:1fr; }
    .login-showcase { display:none; }
    .login-panel-wrap { min-height:100vh; padding:16px; }
    .login-panel { max-width:540px; border-radius:14px; padding:24px 20px; }
  }

  @media (max-width: 980px) {
    :root { --navbar-h: 78px; }
    .app-shell {
      grid-template-columns:1fr;
      grid-template-areas:"navbar" "main";
      grid-template-rows:auto 1fr;
    }
    .navbar {
      padding:10px 14px;
      gap:10px;
      z-index:55;
    }
    .navbar-top { align-items:center; width:100%; }
    .navbar-menu-btn { display:flex; }
    .navbar-company-name { font-size:13px; }
    .navbar-company-sub { font-size:10px; }
    .navbar-company-switch { width:100%; max-width:280px; margin-top:4px; }
    .navbar-right { gap:8px; margin-top:0; }
    .navbar-badge, .navbar-clock, .navbar-tc { display:none; }
    .navbar-user-meta { display:none; }
    .navbar-logout { padding:6px 8px; font-size:11px; }
    .navbar-dropdown { width:min(92vw, 340px); right:0; }

    .sidebar {
      position:fixed;
      left:0;
      top:0;
      height:100vh;
      width:260px;
      transform:translateX(-100%);
      transition:transform 0.22s ease;
      z-index:60;
      box-shadow:8px 0 24px rgba(0,0,0,0.26);
      overflow-y:auto;
    }
    .sidebar.open { transform:translateX(0); }
    .sidebar:hover { width:260px; box-shadow:8px 0 24px rgba(0,0,0,0.26); }
    .sidebar .sidebar-logo-label,
    .sidebar .sidebar-label,
    .sidebar .sidebar-exit-label {
      opacity:1;
      transform:translateX(0);
    }
    .sidebar-backdrop.show { display:block; }
    .main-content { padding:6px 14px 22px; }
    .navbar-breadcrumb {
      font-size:15px;
      padding:6px 14px 2px;
      margin-left:-14px;
      margin-right:-14px;
    }
    .welcome-bar { padding:14px; gap:10px; flex-wrap:wrap; }
    .welcome-bar-right { margin-left:0; text-align:left; width:100%; }
    .favoritos-grid { grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:10px; }
    .all-grid { grid-template-columns:repeat(auto-fill,minmax(110px,1fr)); gap:10px; }
  }

  @media (max-width: 620px) {
    .navbar-company-switch { max-width:100%; }
    .navbar-user { gap:6px; }
    .navbar-company-picker { width:32px; height:32px; font-size:14px; border-radius:9px; }
    .navbar-logout span:last-child { display:none; }
    .main-content { padding:5px 12px 12px; }
    .navbar-breadcrumb {
      font-size:14px;
      padding:5px 12px 2px;
      margin-left:-12px;
      margin-right:-12px;
    }
    .navbar-breadcrumb-module { display:none; }
    .navbar-breadcrumb-module.is-link { display:none; }
    .navbar-breadcrumb-module + .navbar-breadcrumb-sep { display:none; }
    .navbar-extra { display:none; }
    .login-panel { padding:20px 16px; }
    .login-title { font-size:22px; }
    .field-input { margin-bottom:12px; }
  }
`;

function ThemeSwitcher({
  paletteId,
  onChange
}: {
  paletteId: string;
  onChange: (id: string) => void;
}) {
  const selected = COLOR_PALETTES.find(p => p.id === paletteId) || COLOR_PALETTES[0];
  const handleCycleTheme = () => {
    const currentIndex = COLOR_PALETTES.findIndex((p) => p.id === selected.id);
    const next = COLOR_PALETTES[(currentIndex + 1) % COLOR_PALETTES.length];
    onChange(next.id);
  };

  return (
    <div className="theme-switcher-compact">
      <button
        type="button"
        className="theme-compact-btn"
        onClick={handleCycleTheme}
        title={`Tema actual: ${selected.nombre}. Click para cambiar.`}
      >
        <span
          className="theme-compact-dot"
          style={{ background: `linear-gradient(135deg, ${selected.colors.accentDim}, ${selected.colors.accentMain})` }}
        />
        <span className="theme-compact-label">{selected.nombre}</span>
      </button>
    </div>
  );
}
function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span>{time.toLocaleTimeString('es-CR')}</span>;
}

async function cargarPermisosUsuarioEmpresaViaApi(empresaId: number): Promise<PermissionKey[] | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) return null;

  const response = await fetch(`/api/auth/permisos?empresa_id=${empresaId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) return null;
  const payload = await response.json();
  if (!payload?.ok || !Array.isArray(payload?.permissions)) return null;

  const normalized = payload.permissions
    .map((p: unknown) => String(p || '').toLowerCase())
    .filter((p: string) => p.includes(':')) as PermissionKey[];

  return Array.from(new Set(normalized));
}

type LoginApiSuccess = {
  ok: true;
  usuario: Usuario;
  session: { access_token: string; refresh_token: string };
  empresas_autorizadas: Empresa[];
  roles_por_empresa: Record<string, string> | Record<number, string>;
};

async function loginViaApi(username: string, password: string, moduloCodigo?: string): Promise<
  | { kind: 'success'; data: LoginApiSuccess }
  | { kind: 'handled_error'; message: string }
  | { kind: 'unavailable' }
> {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, ...(moduloCodigo ? { modulo_codigo: moduloCodigo } : {}) }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = String(payload?.message || payload?.error || 'No se pudo iniciar sesión');
      return { kind: 'handled_error', message };
    }

    if (!payload?.ok) {
      return { kind: 'handled_error', message: 'No se pudo iniciar sesión' };
    }

    return { kind: 'success', data: payload as LoginApiSuccess };
  } catch {
    return { kind: 'unavailable' };
  }
}

async function cambiarEmpresaActivaViaApi(empresaId: number): Promise<PermissionKey[] | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) return null;

  const switchResp = await fetch('/api/auth/select-empresa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken, empresa_id: empresaId }),
  });

  if (!switchResp.ok) return null;
  return cargarPermisosUsuarioEmpresaViaApi(empresaId);
}

const PERMISOS_TTL_MS = 5 * 60 * 1000; // 5 minutos
const PERMISOS_CACHE_VERSION = 2;

function permisosCacheKey(usuarioId: number, empresaId: number) {
  return `mya_permisos_v${PERMISOS_CACHE_VERSION}_${usuarioId}_${empresaId}`;
}

function clearPermisosCache(usuarioId?: number, empresaId?: number) {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('mya_permisos_')) keys.push(key);
    }
    keys.forEach((key) => {
      const matchesUser = typeof usuarioId !== 'number' || key.includes(`_${usuarioId}_`);
      const matchesEmpresa = typeof empresaId !== 'number' || key.endsWith(`_${empresaId}`);
      if (matchesUser && matchesEmpresa) {
        sessionStorage.removeItem(key);
      }
    });
  } catch {
    // ignore storage errors
  }
}

async function cargarPermisosUsuarioEmpresa(usuarioId: number, empresaId: number): Promise<PermissionKey[]> {
  const cacheKey = permisosCacheKey(usuarioId, empresaId);
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { ts, permisos } = JSON.parse(cached);
      if (Date.now() - ts < PERMISOS_TTL_MS) return permisos;
    }
  } catch { /* sessionStorage no disponible */ }

  const viaApi = await cargarPermisosUsuarioEmpresaViaApi(empresaId);
  if (!viaApi) throw new Error('No se pudieron cargar permisos desde access-api');

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), permisos: viaApi }));
  } catch { /* ignorar si falla el cache */ }

  return viaApi;
}

function Login({ onLogin }: {
  onLogin: (
    usuario: Usuario,
    empresa: Empresa,
    permisos: PermissionKey[],
    empresasAutorizadas: Empresa[],
    rolesPorEmpresa: RolesPorEmpresa
  ) => void;
}) {
  const moduloCodigo = undefined;
  const LOGIN_HERO_SLIDES = [
    {
      title: 'Control total de su operación, empresa por empresa.',
      subtitle: 'Inicie sesión y seleccione la compañía autorizada para trabajar con permisos precisos por rol, módulo y actividad.',
      image: `${process.env.PUBLIC_URL}/branding/login-1.jpg`
    },
    {
      title: 'Permisos inteligentes por empresa, rol y módulo.',
      subtitle: 'Su equipo ve exactamente lo que necesita. Sin menús sobrantes, sin riesgo operativo.',
      image: `${process.env.PUBLIC_URL}/branding/login-2.jpg`
    },
    {
      title: 'ERP moderno para decisiones claras.',
      subtitle: 'Rendimiento, trazabilidad y seguridad en un solo flujo de trabajo.',
      image: `${process.env.PUBLIC_URL}/branding/login-3.jpg`
    }
  ];

  const [slideIndex, setSlideIndex] = useState(0);
  const [faseEmpresa, setFaseEmpresa] = useState(false);
  const [empresaSeleccionadaId, setEmpresaSeleccionadaId] = useState<number | null>(null);
  const [pendingAuth, setPendingAuth] = useState<{
    usuario: Usuario;
    empresasAutorizadas: Empresa[];
    rolesPorEmpresa: RolesPorEmpresa;
  } | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % LOGIN_HERO_SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [LOGIN_HERO_SLIDES.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Complete todos los campos'); return;
    }
    setCargando(true); setError('');
    const usernameKey = username.trim();

    // Intentar hasta 3 veces — los errores de compute de Edge Functions suelen ser transitorios
    let loginApiResult = await loginViaApi(usernameKey, password, moduloCodigo);
    if (loginApiResult.kind !== 'success') {
      await new Promise(r => setTimeout(r, 1500));
      loginApiResult = await loginViaApi(usernameKey, password, moduloCodigo);
    }
    if (loginApiResult.kind !== 'success') {
      await new Promise(r => setTimeout(r, 2500));
      loginApiResult = await loginViaApi(usernameKey, password, moduloCodigo);
    }

    if (loginApiResult.kind === 'success') {
      const { data } = loginApiResult;
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (setSessionError) {
        console.error('[Auth] setSession failed', setSessionError);
        setError(setSessionError.message || 'No se pudo establecer la sesión');
        setCargando(false);
        return;
      }

      const rolesPorEmpresa: RolesPorEmpresa = {};
      Object.entries(data.roles_por_empresa || {}).forEach(([k, v]) => {
        rolesPorEmpresa[Number(k)] = String(v);
      });

      const empresasAutorizadas = (data.empresas_autorizadas || []) as Empresa[];
      if (empresasAutorizadas.length === 1) {
        const empresaUnica = empresasAutorizadas[0];
        const permisos = await cargarPermisosUsuarioEmpresa(data.usuario.id, empresaUnica.id);
        onLogin(data.usuario, empresaUnica, permisos, empresasAutorizadas, rolesPorEmpresa);
        setCargando(false);
        return;
      }

      setPendingAuth({
        usuario: data.usuario,
        empresasAutorizadas,
        rolesPorEmpresa,
      });
      setEmpresaSeleccionadaId(empresasAutorizadas[0]?.id ?? null);
      setFaseEmpresa(true);
      setPassword('');
      setCargando(false);
      return;
    }

    if (loginApiResult.kind === 'handled_error') {
      const esRecursos = loginApiResult.message.toLowerCase().includes('compute') || loginApiResult.message.toLowerCase().includes('resource');
      setError(esRecursos
        ? 'Servidor temporalmente sobrecargado. Intente de nuevo en unos segundos.'
        : loginApiResult.message);
      setCargando(false);
      return;
    }
    setError('Servidor de autenticación no disponible. Espere unos segundos e intente de nuevo.');
    setCargando(false);
    return;
  };

  const confirmarEmpresa = async () => {
    if (!pendingAuth || !empresaSeleccionadaId) return;
    setCargando(true);
    setError('');
    try {
      const empresaElegida = pendingAuth.empresasAutorizadas.find((e) => e.id === empresaSeleccionadaId);
      if (!empresaElegida) {
        setError('Seleccione una empresa valida');
        setCargando(false);
        return;
      }
      const permisos = await cargarPermisosUsuarioEmpresa(pendingAuth.usuario.id, empresaElegida.id);
      onLogin(
        pendingAuth.usuario,
        empresaElegida,
        permisos,
        pendingAuth.empresasAutorizadas,
        pendingAuth.rolesPorEmpresa
      );
    } catch {
      setError('No se pudieron cargar permisos para la empresa seleccionada.');
    } finally {
      setCargando(false);
    }
  };

  const volverALogin = async () => {
    setFaseEmpresa(false);
    setPendingAuth(null);
    setEmpresaSeleccionadaId(null);
    setPassword('');
    setError('');
    await supabase.auth.signOut();
  };

  return (
    <div className="login-wrap">
      <section className="login-showcase">
        {LOGIN_HERO_SLIDES.map((slide, idx) => (
          <div
            key={`${slide.image}-${idx}`}
            className={`login-slide-layer ${idx === slideIndex ? 'active' : ''}`}
            style={{ backgroundImage: `url(${slide.image})` }}
          />
        ))}
        <div className="login-deco" />
        <div className="login-brand">
          <span className="login-badge">ERP | SISTEMAS MYA</span>
          <h1 className="login-hero-title">{LOGIN_HERO_SLIDES[slideIndex].title}</h1>
           <p className="login-hero-sub">{LOGIN_HERO_SLIDES[slideIndex].subtitle}</p>
          <span className="login-hero-chip">Soporte | +506 8379 0976</span>
          <div className="login-dots">
            {LOGIN_HERO_SLIDES.map((_, idx) => (
              <button
                key={`dot-${idx}`}
                type="button"
                className={`login-dot ${idx === slideIndex ? 'active' : ''}`}
                onClick={() => setSlideIndex(idx)}
                aria-label={`Ir al slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="login-panel-wrap">
        <div className="login-panel">
          <div className="login-logo">
            {/* <img src={`${process.env.PUBLIC_URL}/favicon.ico`} alt="ERP-MYA" /> */}
            MyA
          </div>
          <div className="login-title">Iniciar Sesión</div>
          <div className="login-sub">Morales y Alfaro — Contabilidad Pública y Privada</div>
          {!faseEmpresa ? (
            <form onSubmit={handleSubmit}>
              <label className="field-label">Usuario</label>
              <input className="field-input" type="text" placeholder="Ingrese su usuario"
                value={username} onChange={e => setUsername(e.target.value)}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('login-password')?.focus(); } }} />
              <label className="field-label">Contraseña</label>
              <input id="login-password" className="field-input" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} />
              {error && <div className="login-error">{error}</div>}
              <button className="btn-login" type="submit" disabled={cargando}>
                {cargando ? 'Verificando...' : 'Continuar →'}
              </button>
            </form>
          ) : (
            <div>
              <label className="field-label">Seleccione Empresa</label>
              <select
                className="field-input"
                value={empresaSeleccionadaId ?? ''}
                onChange={(e) => setEmpresaSeleccionadaId(Number(e.target.value))}
              >
                {(pendingAuth?.empresasAutorizadas || []).map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.codigo} — {emp.nombre}</option>
                ))}
              </select>
              {error && <div className="login-error">{error}</div>}
              <button className="btn-login" type="button" disabled={cargando} onClick={confirmarEmpresa}>
                {cargando ? 'Abriendo...' : 'Abrir Empresa →'}
              </button>
              <button
                className="btn-login"
                type="button"
                onClick={volverALogin}
                style={{ marginTop: '8px', background: '#e2e8f0', color: '#0f172a', border: '1px solid #cbd5e1' }}
              >
                ← Volver
              </button>
            </div>
          )}
          <div className="login-footer">Sistema MYA v3.0 · {new Date().getFullYear()}</div>
        </div>
      </section>
      
    </div>
  );
}

function Dashboard({ usuario, empresa, onSalir, permisos, empresasAutorizadas, rolesPorEmpresa, onCambiarEmpresa }: {
  usuario: Usuario;
  empresa: Empresa;
  onSalir: () => void;
  permisos: PermissionKey[];
  empresasAutorizadas: Empresa[];
  rolesPorEmpresa: RolesPorEmpresa;
  onCambiarEmpresa: (empresaId: number) => Promise<void>;
}) {
  const [moduloActivo, setModuloActivo] = useState('');
  const [submenu, setSubmenu] = useState('');
  const [recaudacionPrefill, setRecaudacionPrefill] = useState<{ terceroId: number; moneda?: 'CRC' | 'USD' } | null>(null);
  const [tramitePrefill, setTramitePrefill] = useState<{ terceroId: number; moneda?: 'CRC' | 'USD' } | null>(null);
  const [showMaintDropdown, setShowMaintDropdown] = useState(false);
  const [showEmpresasModal, setShowEmpresasModal] = useState(false);
  const [cambiandoEmpresa, setCambiandoEmpresa] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [tipoCambioHoy, setTipoCambioHoy] = useState<{ compra: number; venta: number } | null>(null);
  const [navbarExtra, setNavbarExtra] = useState<ReactNode>(null);
  const maintDropdownRef = React.useRef<HTMLDivElement | null>(null);
  const can = useCallback((moduloId: string, accion: PermissionAction = 'ver') => (
    permisos.includes(`${moduloId}:${accion}`)
    || (accion !== 'aprobar' && permisos.includes(`${moduloId}:aprobar`))
  ), [permisos]);
  const canAccess = (route: string) => {
    if (route === 'contabilidad.auditoriacierres') {
      return Boolean(usuario.es_superusuario);
    }
    const rule = ROUTE_PERMISSION_MAP.get(route);
    if (!rule) return true;
    return can(rule.modulo, rule.accion);
  };

  const modulosPermitidos = MENU_CONFIG.filter(m => canAccess(m.route) && (!m.soloSuperusuario || Boolean(usuario.es_superusuario)));
  const modulosSidebar = modulosPermitidos;
  const modulosNavegables = modulosPermitidos.filter((m) => m.id !== 'mantenimientos');
  const moduloMantenimientos = MENU_CONFIG.find((m) => m.id === 'mantenimientos');
  const puedeVerMantenimientos = Boolean(moduloMantenimientos && canAccess(moduloMantenimientos.route));
  const submenusMantenimientos = ((moduloMantenimientos?.submenus || []).filter((s) => canAccess(s.route)));
  const moduloActivoConfig = modulosPermitidos.find(m => m.id === moduloActivo);
  const esSuperusuario = !!usuario.es_superusuario;
  const submenusPermitidos = (moduloActivoConfig?.submenus || []).filter(s => canAccess(s.route) && (!s.soloSuperusuario || esSuperusuario));
  const submenuActivoLabel = submenusPermitidos.find(s => s.id === submenu)?.nombre || submenu;

  useEffect(() => {
    if (!moduloActivo) return;

    const moduloPermitido = modulosPermitidos.find((m) => m.id === moduloActivo);
    if (!moduloPermitido) {
      setModuloActivo('');
      setSubmenu('');
      return;
    }

    if (moduloPermitido.submenus.length === 0) {
      if (submenu) setSubmenu('');
      return;
    }

    if (submenu && !submenusPermitidos.some((s) => s.id === submenu)) {
      setSubmenu('');
    }
  }, [moduloActivo, submenu, modulosPermitidos, submenusPermitidos]);

  useEffect(() => {
    setModuloActivo('');
    setSubmenu('');
    setRecaudacionPrefill(null);
    setTramitePrefill(null);
    setShowMaintDropdown(false);
    setShowEmpresasModal(false);
    setMobileSidebarOpen(false);
  }, [empresa.id]);

  useEffect(() => {
    if (submenu !== 'recaudacion') {
      setRecaudacionPrefill(null);
    }
    if (submenu !== 'tramitescobro') {
      setTramitePrefill(null);
    }
  }, [submenu]);

  const cambiarEmpresaDesdeModal = async (empresaId: number) => {
    if (!empresaId || empresaId === empresa.id || cambiandoEmpresa) return;
    setCambiandoEmpresa(true);
    try {
      await onCambiarEmpresa(empresaId);
      setShowEmpresasModal(false);
    } finally {
      setCambiandoEmpresa(false);
    }
  };

  useEffect(() => {
    const cargarTipoCambioHoy = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase.rpc('get_tipo_cambio_historial', {
        p_empresa_id: empresa.id,
        p_fecha_desde: today,
        p_fecha_hasta: today,
      });

      if (!error && Array.isArray(data) && data.length > 0) {
        const row: any = data[0];
        const compra = Number(row?.compra || 0);
        const venta = Number(row?.venta || 0);
        if (compra > 0 && venta > 0) {
          setTipoCambioHoy({ compra, venta });
          console.debug('[TC] Cargado desde historial', { empresaId: empresa.id, fecha: today, compra, venta });
          return;
        }
      }

      // Si no existe TC del dia, intenta consulta silenciosa al BCCR.
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const jwt = sessionData.session?.access_token;
        if (!jwt) {
          setTipoCambioHoy(null);
          return;
        }

        const { data: payload, error: fnError } = await supabase.functions.invoke('bccr-tipo-cambio', {
          headers: { Authorization: `Bearer ${jwt}` },
          body: { fecha: today },
        });

        if (fnError || !payload?.ok) {
          setTipoCambioHoy(null);
          return;
        }

        const compra = Number(payload.compra || 0);
        const venta = Number(payload.venta || 0);
        if (compra <= 0 || venta <= 0) {
          setTipoCambioHoy(null);
          console.debug('[TC] Respuesta BCCR sin valores validos', { empresaId: empresa.id, fecha: today, compra, venta });
          return;
        }

        setTipoCambioHoy({ compra, venta });
        console.debug('[TC] Cargado desde BCCR', { empresaId: empresa.id, fecha: payload.fecha || today, compra, venta });

        // Persistir silenciosamente si el usuario tiene permisos.
        if (can('mantenimientos', 'editar')) {
          await supabase.rpc('set_tipo_cambio_dia', {
            p_empresa_id: empresa.id,
            p_fecha: payload.fecha || today,
            p_compra: compra,
            p_venta: venta,
            p_fuente: 'BCCR',
            p_raw_data: payload,
          });
          console.debug('[TC] Guardado silencioso en historial', { empresaId: empresa.id, fecha: payload.fecha || today });
        }
      } catch {
        setTipoCambioHoy(null);
        console.debug('[TC] No disponible en arranque', { empresaId: empresa.id, fecha: today });
      }
    };
    cargarTipoCambioHoy();
  }, [empresa.id, can]);

  useEffect(() => {
    const onDocClick = (ev: MouseEvent) => {
      if (!maintDropdownRef.current) return;
      if (!maintDropdownRef.current.contains(ev.target as Node)) {
        setShowMaintDropdown(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const abrirModulo = (modId: string) => {
    const modulo = modulosPermitidos.find((m) => m.id === modId);
    if (!modulo) {
      setModuloActivo('');
      setSubmenu('');
      return;
    }

    const submenusPermitidosModulo = (modulo.submenus || []).filter((s) => canAccess(s.route));
    setModuloActivo(modId);
    if (submenusPermitidosModulo.length === 1) {
      setSubmenu(submenusPermitidosModulo[0].id);
    } else {
      setSubmenu('');
    }
    if (window.innerWidth <= 980) setMobileSidebarOpen(false);
  };

  const abrirMayorGeneralDesdeBalance = (payload: {
    cuenta: string;
    nombre?: string;
    desde: string;
    hasta: string;
    moneda: 'CRC' | 'USD';
    origen?: 'balancecomprobacion' | 'estadoderesultados' | 'balancesituacion';
  }) => {
    try {
      sessionStorage.setItem(
        MAYOR_GENERAL_PREFILL_KEY,
        JSON.stringify({
          empresaId: empresa.id,
          ...payload,
        })
      );
    } catch {
      // ignore storage errors
    }
    setModuloActivo('contabilidad');
    setSubmenu('mayorgeneral');
    if (window.innerWidth <= 980) setMobileSidebarOpen(false);
  };

  const abrirAsientoDesdeEstadoResultados = (asientoId: number) => {
    try {
      sessionStorage.setItem(
        ASIENTO_OPEN_PREFILL_KEY,
        JSON.stringify({
          empresaId: empresa.id,
          asientoId: Number(asientoId || 0),
        })
      );
    } catch {
      // ignore storage errors
    }
    setModuloActivo('contabilidad');
    setSubmenu('asientos');
    if (window.innerWidth <= 980) setMobileSidebarOpen(false);
  };

  const modulosDashboard = (() => {
    const tieneCxp = modulosNavegables.some((m) => m.id === 'cxp');
    return modulosNavegables.filter((m) => !(tieneCxp && m.id === 'proveedores'));
  })();
  const favoritos = modulosDashboard.filter(m => FAVORITOS_DEFAULT.includes(m.id));
  const otrosModulos = modulosDashboard.filter(m => !FAVORITOS_DEFAULT.includes(m.id));
  const fecha = new Date().toLocaleDateString('es-CR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const rolActivo = usuario.es_superusuario ? 'Super Usuario' : (rolesPorEmpresa[empresa.id] || 'Sin rol');

  return (
    <div className="app-shell">
      <div
        className={`sidebar-backdrop ${mobileSidebarOpen ? 'show' : ''}`}
        onClick={() => setMobileSidebarOpen(false)}
      />
      <aside className={`sidebar ${mobileSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-inner">
            <img src={`${process.env.PUBLIC_URL}/favicon.ico`} alt="MYA" />
            
          </div>
          <span className="sidebar-logo-label">Sistemas MYA</span>
        </div>
        {modulosSidebar.map((mod, i) => (
          <React.Fragment key={mod.id}>
            {i === 9 && <div className="sidebar-divider" />}
            <div className={`sidebar-item ${moduloActivo === mod.id ? 'active' : ''}`}
              onClick={() => abrirModulo(mod.id)}
              title={mod.nombre}>
              <span className="sidebar-icon-wrap">
                <span className="sidebar-icon">{mod.icono}</span>
              </span>
              <span className="sidebar-label">{mod.nombre}</span>
            </div>
          </React.Fragment>
        ))}
      </aside>

      <nav className="navbar">
        <div className="navbar-top">
        <button
          className="navbar-menu-btn"
          title="Abrir menu"
          onClick={() => setMobileSidebarOpen((prev) => !prev)}
        >
          ☰
        </button>
        <div className="navbar-company">
          <div className="navbar-company-name">{empresa.nombre}</div>
          <div className="navbar-company-sub">Cédula {empresa.cedula}</div>
        </div>
        <div className="navbar-right">
          <div className="navbar-badge">CIA <span>{empresa.codigo}</span></div>
          <div className="navbar-badge">Ver <span>3.0</span></div>
          {tipoCambioHoy && (
            <div className="navbar-tc" title="Tipo de cambio del día">
              <span>TC</span>
              <span>C: <b>{tipoCambioHoy.compra.toFixed(2)}</b></span>
              <span>V: <b>{tipoCambioHoy.venta.toFixed(2)}</b></span>
            </div>
          )}
          <div className="navbar-clock"><Clock /></div>
          {puedeVerMantenimientos && submenusMantenimientos.length > 0 && (
            <div className="navbar-tools" ref={maintDropdownRef}>
              <button
                className={`navbar-tool-btn ${showMaintDropdown ? 'active' : ''}`}
                title="Mantenimientos"
                onClick={() => setShowMaintDropdown((prev) => !prev)}
              >
                ⚙️
              </button>
              {showMaintDropdown && (
                <div className="navbar-dropdown">
                  <div className="navbar-dropdown-head">Configuración</div>
                  {submenusMantenimientos.map((item) => (
                    <button
                      key={item.id}
                      className="navbar-dropdown-item"
                      onClick={() => {
                        setModuloActivo('mantenimientos');
                        setSubmenu(item.id);
                        setShowMaintDropdown(false);
                      }}
                    >
                      <span className="navbar-dropdown-icon">{item.icono}</span>
                      <span>{item.nombre}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="navbar-user">
            {empresasAutorizadas.length > 1 && (
              <button
                className="navbar-company-picker"
                title="Cambiar empresa"
                onClick={() => setShowEmpresasModal(true)}
              >
                🏢
              </button>
            )}
            <div className="navbar-user-meta">
              <span className="navbar-username">{usuario.nombre}</span>
              <span className="navbar-userrole">{rolActivo}</span>
            </div>
            <button className="navbar-logout" onClick={onSalir} title="Cerrar sesión">
              <span className="navbar-logout-icon">⏻</span>
              <span>Salir</span>
            </button>
          </div>
        </div>
        </div>
        {moduloActivo && (
          <div
            className="navbar-breadcrumb"
            title={`Inicio > ${modulosPermitidos.find(m => m.id === moduloActivo)?.nombre || moduloActivo}${submenu ? ` > ${submenuActivoLabel}` : ''}`}
          >
            <div className="navbar-breadcrumb-text">
              <span className="navbar-breadcrumb-home"
                onClick={() => { setModuloActivo(''); setSubmenu(''); }}>
                Inicio
              </span>
              <span className="navbar-breadcrumb-sep">›</span>
              <span className={`navbar-breadcrumb-module ${submenu ? 'is-link' : ''}`}
                onClick={() => submenu ? setSubmenu('') : null}>
                {modulosPermitidos.find(m => m.id === moduloActivo)?.nombre || moduloActivo}
              </span>
              {submenu && (
                <>
                  <span className="navbar-breadcrumb-sep">›</span>
                  <span className="navbar-breadcrumb-submenu">{submenuActivoLabel}</span>
                </>
              )}
            </div>
            {navbarExtra && <div className="navbar-extra">{navbarExtra}</div>}
          </div>
        )}
      </nav>

    <main className={`main-content${['inventarios', 'combustible'].includes(moduloActivo) ? ' main-fullscreen' : ''}`} style={moduloActivo === 'combustible' ? { padding: 0, overflow: 'hidden' } : moduloActivo === 'inventarios' ? { padding: 0 } : {}}>

      {moduloActivo === 'contabilidad' && submenu === 'asientos' && canAccess('contabilidad.asientos') && 
       <ListaAsientos
         empresaId={empresa.id}
         canConfigurarCierreRapido={Boolean(
           usuario.es_superusuario
           || can('mantenimientos', 'editar')
           || can('contabilidad', 'aprobar')
         )}
       />}

       {moduloActivo === 'contabilidad' && submenu === 'cuentascorreo' && canAccess('contabilidad.cuentascorreo') && (
          <CuentasCorreo empresaId={empresa.id} />
        )}
      {moduloActivo === 'contabilidad' && submenu === 'parametroscontabilidad' && canAccess('contabilidad.parametroscontabilidad') && (
        <ParametrosContabilidad empresaId={empresa.id} canEdit={can('contabilidad', 'editar')} />
      )}

      {moduloActivo === 'mantenimientos' && submenu === 'roles' && canAccess('mantenimientos.roles') && (
        <ListaRoles
          canCreate={can('mantenimientos', 'crear')}
          canEdit={can('mantenimientos', 'editar')}
          canDelete={can('mantenimientos', 'eliminar')}
        />
      )}
      {moduloActivo === 'mantenimientos' && submenu === 'usuarios' && canAccess('mantenimientos.usuarios') && (
        <ListaUsuarios
          empresaId={empresa.id}
          canCreate={can('mantenimientos', 'crear')}
          canEdit={can('mantenimientos', 'editar')}
          canDelete={can('mantenimientos', 'eliminar')}
          esSuperUsuario={usuario.es_superusuario}
        />
      )}
      {moduloActivo === 'mantenimientos' && submenu === 'modulos' && canAccess('mantenimientos.modulos') && (
        <ListaModulos
          canCreate={can('mantenimientos', 'crear')}
          canEdit={can('mantenimientos', 'editar')}
          canDelete={can('mantenimientos', 'eliminar')}
        />
      )}
      {moduloActivo === 'mantenimientos' && submenu === 'parametrosempresa' && canAccess('mantenimientos.parametrosempresa') && (
        <ParametrosEmpresa
          empresaId={empresa.id}
          canEdit={can('mantenimientos', 'editar')}
        />
      )}
      {moduloActivo === 'mantenimientos' && submenu === 'seguridad' && canAccess('mantenimientos.seguridad') && (
        <BitacoraSeguridad canUnlock={can('mantenimientos', 'editar')} />
      )}
      {moduloActivo === 'mantenimientos' && submenu === 'bitacoramodulos' && canAccess('mantenimientos.bitacoramodulos') && (
        <BitacoraModulos empresaId={empresa.id} canView={can('mantenimientos', 'ver')} />
      )}
      {moduloActivo === 'mantenimientos' && submenu === 'alertas' && canAccess('mantenimientos.alertas') && (
        <AlertasDestinatarios
          canCreate={can('mantenimientos', 'crear')}
          canEdit={can('mantenimientos', 'editar')}
          canDelete={can('mantenimientos', 'eliminar')}
        />
      )}
      {moduloActivo === 'mantenimientos' && submenu === 'estadoacceso' && canAccess('mantenimientos.estadoacceso') && (
        <EstadoAcceso canView={can('mantenimientos', 'ver')} />
      )}
      {moduloActivo === 'mantenimientos' && submenu === 'asientosduplicados' && canAccess('mantenimientos.asientosduplicados') && (
        <AsientosDuplicados empresaId={empresa.id} canEdit={can('mantenimientos', 'editar')} />
      )}
      {moduloActivo === 'mantenimientos' && submenu === 'historialtipocambio' && canAccess('mantenimientos.historialtipocambio') && (
        <HistorialTipoCambio empresaId={empresa.id} canEdit={can('mantenimientos', 'editar')} />
      )}
      {moduloActivo === 'mantenimientos' && submenu === 'consultacontribuyentemh' && canAccess('mantenimientos.consultacontribuyentemh') && (
        <ConsultaContribuyenteMH
          canView={can('mantenimientos', 'ver')}
          canEdit={can('mantenimientos', 'editar')}
          empresaId={empresa.id}
        />
      )}
      {moduloActivo === 'mantenimientos' && submenu === 'bitacorareceptoresfe' && canAccess('mantenimientos.bitacorareceptoresfe') && (
        <FeReceptoresBitacora
          empresaId={empresa.id}
          canView={can('mantenimientos', 'ver')}
          canEdit={can('mantenimientos', 'editar')}
        />
      )}
      {moduloActivo === 'mantenimientos' && submenu === 'simuladorrenta' && canAccess('mantenimientos.simuladorrenta') && (
        <SimuladorImpuestoRenta empresaId={empresa.id} canView={can('mantenimientos', 'ver')} />
      )}
      {moduloActivo === 'mantenimientos' && submenu === 'escenariosrentaprueba' && canAccess('mantenimientos.escenariosrentaprueba') && (
        <EscenariosRentaPrueba
          empresaId={empresa.id}
          canView={can('mantenimientos', 'ver')}
          canEdit={can('mantenimientos', 'editar')}
        />
      )}
      {moduloActivo === 'mantenimientos' && submenu === 'tercerosunificados' && canAccess('mantenimientos.tercerosunificados') && (
        <TercerosUnificados
          empresaId={empresa.id}
          canView={can('mantenimientos', 'ver')}
          canEdit={can('mantenimientos', 'editar')}
        />
      )}
      {moduloActivo === 'mantenimientos' && submenu === 'operacionessensibles' && esSuperusuario && (
        <SuperusuarioOperaciones empresaId={empresa.id} empresaNombre={empresa.nombre} />
      )}
      {moduloActivo === 'contabilidad' && submenu === 'plancuentas' && canAccess('contabilidad.plancuentas') && esSuperusuario && <PlanCuentas />}
      {moduloActivo === 'contabilidad' && submenu === 'mayorgeneral' && canAccess('contabilidad.mayorgeneral') && (
        <MayorGeneral
          empresaId={empresa.id}
          onVolver={(destino) => {
            if (destino === 'estadoderesultados') setSubmenu('estadoderesultados');
            else if (destino === 'balancesituacion') setSubmenu('balancesituacion');
            else setSubmenu('balancecomprobacion');
          }}
        />
      )}
      {moduloActivo === 'contabilidad' && submenu === 'balancecomprobacion' && canAccess('contabilidad.balancecomprobacion') && (
        <BalanceComprobacion empresaId={empresa.id} onVerMovimientos={abrirMayorGeneralDesdeBalance} />
      )}
      {moduloActivo === 'contabilidad' && submenu === 'balancesituacion' && canAccess('contabilidad.balancesituacion') && (
        <BalanceSituacion empresaId={empresa.id} onVerMovimientos={abrirMayorGeneralDesdeBalance} />
      )}
      {moduloActivo === 'contabilidad' && submenu === 'estadoderesultados' && canAccess('contabilidad.estadoderesultados') && (
        <EstadoResultados
          empresaId={empresa.id}
          onVerMovimientos={abrirMayorGeneralDesdeBalance}
          onVerAsientoCierre={abrirAsientoDesdeEstadoResultados}
        />
      )}
      {moduloActivo === 'contabilidad' && submenu === 'eeff' && canAccess('contabilidad.eeff') && (
        <EstadosFinancieros
          empresaId={empresa.id}
          onVerMovimientos={abrirMayorGeneralDesdeBalance}
          onVerAsientoCierre={abrirAsientoDesdeEstadoResultados}
        />
      )}
      {moduloActivo === 'contabilidad' && submenu === 'smokecontabilidad' && canAccess('contabilidad.smokecontabilidad') && (
        <SmokeContabilidad empresaId={empresa.id} />
      )}
      {moduloActivo === 'contabilidad' && submenu === 'cierremensual' && canAccess('contabilidad.cierremensual') && (
        <CierreMensual empresaId={empresa.id} onVerAsiento={abrirAsientoDesdeEstadoResultados} />
      )}
      {moduloActivo === 'contabilidad' && submenu === 'auditoriacierres' && canAccess('contabilidad.auditoriacierres') && (
        <AuditoriaCierres empresaId={empresa.id} />
      )}
      {moduloActivo === 'contabilidad' && submenu === '' && (
      <div>
        <div className="section-title" style={{ marginBottom: '20px' }}>
          📒 Contabilidad
        </div>
        <div className="favoritos-grid">
          {submenusPermitidos.map(item => (
            <div key={item.id} className="fav-card" onClick={() => setSubmenu(item.id)}>
              <div className="fav-icon">{item.icono}</div>
              <div className="fav-name">{item.nombre}</div>
              <div className="fav-arrow">Abrir →</div>
            </div>
          ))}
        </div>
      </div>
    )}

      {moduloActivo === 'mantenimientos' && submenu === 'empresas' && canAccess('mantenimientos.empresas') && <ListaEmpresas empresaId={empresa.id} />}
      {moduloActivo === 'mantenimientos' && submenu === 'actividades' && canAccess('mantenimientos.actividades') && <ListaActividades />}

      {moduloActivo === 'contabilidad' && submenu === 'catalogo' && canAccess('contabilidad.catalogo') && (
        <CatalogoEmpresa
          empresaId={empresa.id}
          canEdit={can('contabilidad', 'editar')}
        />
      )}
      {moduloActivo === 'contabilidad' && submenu === 'tiposasiento' && canAccess('contabilidad.tiposasiento') && (
        <TiposAsiento empresaId={empresa.id} canEdit={can('contabilidad', 'editar')} />
      )}
      {moduloActivo === 'contabilidad' && submenu === 'reporteasientostipo' && canAccess('contabilidad.reporteasientostipo') && (
        <ReporteAsientosTipo empresaId={empresa.id} />
      )}
      {moduloActivo === 'contabilidad' && submenu === 'comprobantes' && canAccess('contabilidad.comprobantes') && (
          <ComprobantesRecibidos empresaId={empresa.id} />
        )}
      {moduloActivo === 'mantenimientos' && submenu === '' && (
        <div>
          <div className="section-title" style={{ marginBottom: '20px' }}>
            🔧 Mantenimientos
          </div>
          <div className="favoritos-grid">
              {submenusPermitidos.map(item => (
                <div key={item.id} className="fav-card" onClick={() => setSubmenu(item.id)}>
                  <div className="fav-icon">{item.icono}</div>
                  <div className="fav-name">{item.nombre}</div>
                  <div className="fav-arrow">Abrir →</div>
                </div>
              ))}
          </div>
        </div>
      )}
      {moduloActivo === 'clientes' && submenu === '' && canAccess('clientes') && (
        <div>
          <div className="section-title" style={{ marginBottom: '20px' }}>
            🧑‍💼 Clientes
          </div>
          <div className="favoritos-grid">
            {submenusPermitidos.map(item => (
              <div key={item.id} className="fav-card" onClick={() => setSubmenu(item.id)}>
                <div className="fav-icon">{item.icono}</div>
                <div className="fav-name">{item.nombre}</div>
                <div className="fav-arrow">Abrir →</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {moduloActivo === 'clientes' && submenu === 'catalogo' && canAccess('clientes.catalogo') && (
        <TercerosUnificados
          empresaId={empresa.id}
          canView={can('clientes', 'ver')}
          canEdit={can('clientes', 'editar')}
          modo="clientes"
        />
      )}
      {moduloActivo === 'bancos' && submenu === '' && canAccess('bancos') && (
        <div>
          <div className="section-title" style={{ marginBottom: '20px' }}>
            🏛️ Bancos
          </div>
          <div className="favoritos-grid">
            {submenusPermitidos.map(item => (
              <div key={item.id} className="fav-card" onClick={() => setSubmenu(item.id)}>
                <div className="fav-icon">{item.icono}</div>
                <div className="fav-name">{item.nombre}</div>
                <div className="fav-arrow">Abrir →</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {moduloActivo === 'bancos' && submenu === 'cuentas' && canAccess('bancos.cuentas') && (
        <CuentasBancarias
          empresaId={empresa.id}
          canView={can('bancos', 'ver')}
          canEdit={can('bancos', 'editar')}
          vista="cuentas"
          onAbrirCatalogoContable={canAccess('contabilidad.catalogo') ? () => {
            setModuloActivo('contabilidad');
            setSubmenu('catalogo');
          } : undefined}
        />
      )}
      {moduloActivo === 'bancos' && submenu === 'conciliacion' && canAccess('bancos.conciliacion') && (
        <CuentasBancarias
          empresaId={empresa.id}
          canView={can('bancos', 'ver')}
          canEdit={can('bancos', 'editar')}
          vista="conciliacion"
          onAbrirCatalogoContable={canAccess('contabilidad.catalogo') ? () => {
            setModuloActivo('contabilidad');
            setSubmenu('catalogo');
          } : undefined}
        />
      )}
      {moduloActivo === 'bancos' && submenu === 'depositos' && canAccess('bancos.depositos') && (
        <CuentasBancarias
          empresaId={empresa.id}
          canView={can('bancos', 'ver')}
          canEdit={can('bancos', 'editar')}
          vista="depositos"
          onAbrirCatalogoContable={canAccess('contabilidad.catalogo') ? () => {
            setModuloActivo('contabilidad');
            setSubmenu('catalogo');
          } : undefined}
        />
      )}
      {moduloActivo === 'bancos' && submenu === 'egresos' && canAccess('bancos.egresos') && (
        <CuentasBancarias
          empresaId={empresa.id}
          canView={can('bancos', 'ver')}
          canEdit={can('bancos', 'editar')}
          vista="egresos"
          onAbrirCatalogoContable={canAccess('contabilidad.catalogo') ? () => {
            setModuloActivo('contabilidad');
            setSubmenu('catalogo');
          } : undefined}
        />
      )}
      {moduloActivo === 'proveedores' && submenu === '' && canAccess('proveedores') && (
        <TercerosUnificados
          empresaId={empresa.id}
          canView={can('proveedores', 'ver')}
          canEdit={can('proveedores', 'editar')}
          modo="proveedores"
        />
      )}
      {moduloActivo === 'cxc' && submenu === '' && (
        <div>
          <div className="section-title" style={{ marginBottom: '20px' }}>
            🗂️ Cuentas a Cobrar
          </div>
          <div className="favoritos-grid">
            {submenusPermitidos.map(item => (
              <div key={item.id} className="fav-card" onClick={() => setSubmenu(item.id)}>
                <div className="fav-icon">{item.icono}</div>
                <div className="fav-name">{item.nombre}</div>
                <div className="fav-arrow">Abrir →</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {moduloActivo === 'cxc' && submenu === 'cartera' && canAccess('cxc.cartera') && (
        <CarteraCxc
          empresaId={empresa.id}
          canView={can('cxc', 'ver')}
          canEdit={can('cxc', 'editar')}
          modo="cartera"
        />
      )}
      {moduloActivo === 'cxc' && submenu === 'gestioncobro' && canAccess('cxc.gestioncobro') && (
        <CarteraCxc
          empresaId={empresa.id}
          canView={can('cxc', 'ver')}
          canEdit={can('cxc', 'editar')}
          modo="gestion"
          onAbrirRecaudacion={({ terceroId, moneda }) => {
            setRecaudacionPrefill({ terceroId, moneda });
            setSubmenu('recaudacion');
          }}
          onAbrirTramite={({ terceroId, moneda }) => {
            setTramitePrefill({ terceroId, moneda });
            setSubmenu('tramitescobro');
          }}
          onAbrirReportes={() => setSubmenu('reportescobro')}
        />
      )}
      {moduloActivo === 'cxc' && submenu === 'tramitescobro' && canAccess('cxc.tramitescobro') && (
        <TramitesCobro
          empresaId={empresa.id}
          empresaNombre={empresa.nombre}
          canView={can('cxc', 'ver')}
          canEdit={can('cxc', 'editar')}
          isAdmin={Boolean(usuario?.es_superusuario)}
          prefillTerceroId={tramitePrefill?.terceroId || null}
          prefillMoneda={tramitePrefill?.moneda || null}
          onVolverGestion={() => setSubmenu('gestioncobro')}
          onAbrirRecaudacion={({ terceroId, moneda }) => {
            setRecaudacionPrefill({ terceroId, moneda });
            setSubmenu('recaudacion');
          }}
        />
      )}
      {moduloActivo === 'cxc' && submenu === 'recaudacion' && canAccess('cxc.recaudacion') && (
        <RecaudacionPagos
          empresaId={empresa.id}
          empresaNombre={empresa.nombre}
          canView={can('cxc', 'ver')}
          canEdit={can('cxc', 'editar')}
          prefillTerceroId={recaudacionPrefill?.terceroId || null}
          prefillMoneda={recaudacionPrefill?.moneda || null}
          onAbrirReportes={() => setSubmenu('reportescobro')}
        />
      )}
      {moduloActivo === 'cxc' && submenu === 'reportescobro' && canAccess('cxc.reportescobro') && (
        <ReportesCobro
          empresaId={empresa.id}
          canView={can('cxc', 'ver')}
          canEdit={can('cxc', 'editar')}
          onVolverGestion={() => setSubmenu('gestioncobro')}
          onVolverRecaudacion={() => setSubmenu('recaudacion')}
        />
      )}
      {moduloActivo === 'facturacion' && submenu === '' && canAccess('facturacion') && (
        <div>
          <div className="section-title" style={{ marginBottom: '20px' }}>
            💳 Facturación
          </div>
          <div className="favoritos-grid">
            {submenusPermitidos.map(item => (
              <div key={item.id} className="fav-card" onClick={() => setSubmenu(item.id)}>
                <div className="fav-icon">{item.icono}</div>
                <div className="fav-name">{item.nombre}</div>
                <div className="fav-arrow">Abrir →</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {moduloActivo === 'facturacion' && submenu === 'configuracion' && canAccess('facturacion.configuracion') && (
        <FacturacionConfiguracion empresaId={empresa.id} canEdit={can('facturacion', 'editar')} />
      )}
      {moduloActivo === 'facturacion' && submenu === 'exoneraciones' && canAccess('facturacion.exoneraciones') && (
        <ExoneracionesMH empresaId={empresa.id} canEdit={can('facturacion', 'editar')} />
      )}
      {moduloActivo === 'facturacion' && submenu === 'cabys' && canAccess('facturacion.cabys') && (
        <ConsultaCabys empresaId={empresa.id} />
      )}
      {moduloActivo === 'facturacion' && submenu === 'comprobantes' && canAccess('facturacion.comprobantes') && (
        <FacturacionComprobantes empresaId={empresa.id} canEdit={can('facturacion', 'editar')} />
      )}
      {moduloActivo === 'facturacion' && submenu === 'nota-credito' && canAccess('facturacion.nota-credito') && (
        <NotaCreditoPage empresaId={empresa.id} />
      )}
      {moduloActivo === 'facturacion' && submenu === 'nota-debito' && canAccess('facturacion.nota-debito') && (
        <NotaDebitoPage empresaId={empresa.id} />
      )}
      {moduloActivo === 'facturacion' && submenu === 'historial' && canAccess('facturacion.historial') && (
        <FacturacionHistorial empresaId={empresa.id} setNavbarExtra={setNavbarExtra} />
      )}
      {moduloActivo === 'facturacion' && submenu === 'facturacion-exportacion' && canAccess('facturacion.facturacion-exportacion') && (
        <FacturaExportacionPage empresaId={empresa.id} canEdit={can('facturacion', 'editar')} />
      )}

    {moduloActivo === 'planilla' && submenu === '' && (
      <div>
        <div className="section-title" style={{ marginBottom: '20px' }}>🪪 Planilla</div>
        <div className="favoritos-grid">
          {submenusPermitidos.map(item => (
            <div key={item.id} className="fav-card" onClick={() => setSubmenu(item.id)}>
              <div className="fav-icon">{item.icono}</div>
              <div className="fav-name">{item.nombre}</div>
              <div className="fav-arrow">Abrir →</div>
            </div>
          ))}
        </div>
      </div>
    )}
    {moduloActivo === 'planilla' && submenu === 'colaboradores' && canAccess('planilla.colaboradores') && (
      <Colaboradores empresaId={empresa.id} canEdit={can('planilla','editar')} empresaNombre={empresa.nombre} />
    )}
    {moduloActivo === 'planilla' && submenu === 'departamentos' && canAccess('planilla.departamentos') && (
      <DepartamentosCargos empresaId={empresa.id} canEdit={can('planilla','editar')} />
    )}
    {moduloActivo === 'planilla' && submenu === 'asistencia' && canAccess('planilla.asistencia') && (
      <ControlAsistencia empresaId={empresa.id} canEdit={can('planilla','editar')} />
    )}
    {moduloActivo === 'planilla' && submenu === 'ausencias' && canAccess('planilla.ausencias') && (
      <AusenciasPermisos empresaId={empresa.id} canEdit={can('planilla','editar')} />
    )}
    {moduloActivo === 'planilla' && submenu === 'planillas' && canAccess('planilla.planillas') && (
      <CalculoPlanillas empresaId={empresa.id} canEdit={can('planilla','editar')} empresaNombre={empresa.nombre} empresaCedula={empresa.cedula} />
    )}
    {moduloActivo === 'planilla' && submenu === 'prestaciones' && canAccess('planilla.prestaciones') && (
      <PrestacionesLegales empresaId={empresa.id} canEdit={can('planilla','editar')} />
    )}
    {moduloActivo === 'planilla' && submenu === 'accion-personal' && canAccess('planilla.accion-personal') && (
      <AccionesPersonal empresaId={empresa.id} canEdit={can('planilla','editar')} />
    )}
    {moduloActivo === 'planilla' && submenu === 'reportes-planilla' && canAccess('planilla.reportes-planilla') && (
      <ReportesPlanilla empresaId={empresa.id} empresaNombre={empresa.nombre} empresaCedula={empresa.cedula ?? undefined} />
    )}
    {moduloActivo === 'planilla' && submenu === 'rubros' && canAccess('planilla.rubros') && (
      <RubrosColaborador empresaId={empresa.id} canEdit={can('planilla','editar')} />
    )}
    {moduloActivo === 'planilla' && submenu === 'tasas-ccss' && canAccess('planilla.tasas-ccss') && (
      <TasasCCSS canEdit={can('planilla','editar')} />
    )}

    {moduloActivo === 'combustible' && canAccess('combustible') && (
    <CombustibleModule empresaId={empresa.id} onHome={() => setModuloActivo('')} isSuperusuario={esSuperusuario} setNavbarExtra={setNavbarExtra} />
    )}

    {moduloActivo === 'contabilidad' && submenu === 'cierres-pos' && canAccess('contabilidad.cierres-pos') && (
      <CierresPOS empresaId={empresa.id} />
    )}
    {moduloActivo === 'contabilidad' && submenu === 'config-pos' && canAccess('contabilidad.config-pos') && (
      <ConfigPOS empresaId={empresa.id} />
    )}

    {moduloActivo === 'inventarios' && canAccess('inventarios') && (
      <InventariosModule empresaId={empresa.id} onHome={() => setModuloActivo('')} setNavbarExtra={setNavbarExtra} />
    )}
    {moduloActivo && submenu && !submenusPermitidos.some(item => item.id === submenu) && (
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '26px', color: '#6b7280', fontSize: '14px' }}>
        No tiene acceso a esta vista con el rol actual.
      </div>
    )}

    {moduloActivo === '' && (
      <>
        <div className="welcome-bar">
          <div className="welcome-bar-avatar">{usuario.nombre[0]?.toUpperCase()}</div>
          <div className="welcome-bar-text">
            <h2>Bienvenido, {usuario.nombre}</h2>
            <p>Sus accesos directos están listos</p>
          </div>
          <div className="welcome-bar-right">
            <div className="welcome-bar-cia">CIA {empresa.codigo}</div>
            <div className="welcome-bar-date">{fecha}</div>
          </div>
        </div>
        {modulosNavegables.length === 0 ? (
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '26px', color: '#6b7280', fontSize: '14px' }}>
            No tiene módulos habilitados para esta empresa. Solicite permisos al administrador.
          </div>
        ) : (
          <>
            <div className="section-title">⭐ Accesos Directos</div>
            <div className="favoritos-grid">
              {favoritos.map(mod => (
                <div key={mod.id}
                  className={`fav-card ${moduloActivo === mod.id ? 'active' : ''}`}
                  onClick={() => abrirModulo(mod.id)}>
                  <div className="fav-icon">{mod.icono}</div>
                  <div className="fav-name">{mod.nombre}</div>
                  <div className="fav-arrow">Abrir →</div>
                </div>
              ))}
            </div>
            <div className="section-title">Todos los Módulos</div>
            <div className="all-grid">
              {otrosModulos.map(mod => (
                <div key={mod.id} className="mod-card"
                  onClick={() => abrirModulo(mod.id)}>
                  <div className="mod-icon">{mod.icono}</div>
                  <div className="mod-name">{mod.nombre}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </>
    )}

    </main>
    {showEmpresasModal && (
      <div className="company-modal-backdrop" onClick={() => !cambiandoEmpresa && setShowEmpresasModal(false)}>
        <div className="company-modal" onClick={(e) => e.stopPropagation()}>
          <div className="company-modal-head">
            <div className="company-modal-title">Empresas autorizadas</div>
            <button
              className="company-modal-close"
              onClick={() => setShowEmpresasModal(false)}
              disabled={cambiandoEmpresa}
            >
              Cerrar
            </button>
          </div>
          <div className="company-modal-list">
            {empresasAutorizadas.map((emp) => {
              const activa = Number(emp.id) === Number(empresa.id);
              return (
                <button
                  key={emp.id}
                  className={`company-item ${activa ? 'active' : ''}`}
                  onClick={() => cambiarEmpresaDesdeModal(emp.id)}
                  disabled={activa || cambiandoEmpresa}
                >
                  <div>
                    <div className="company-item-name">{emp.nombre}</div>
                    <div className="company-item-sub">Cédula {emp.cedula}</div>
                  </div>
                  <div className="company-item-code">{activa ? 'ACTIVA' : `CIA ${emp.codigo}`}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    )}
    </div>
  );
}

function App() {
  
  const [sesion, setSesion] = useState<{
    usuario: Usuario;
    empresa: Empresa;
    permisos: PermissionKey[];
    empresasAutorizadas: Empresa[];
    rolesPorEmpresa: RolesPorEmpresa;
  } | null>(null);
  const [paletteId, setPaletteId] = useState<string>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return COLOR_PALETTES.some(palette => palette.id === saved) ? saved as string : COLOR_PALETTES[0].id;
  });

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, paletteId);
  }, [paletteId]);

  useEffect(() => {
    try {
      if (sesion?.empresa?.nombre) {
        localStorage.setItem(REPORT_COMPANY_NAME_KEY, sesion.empresa.nombre);
      } else {
        localStorage.removeItem(REPORT_COMPANY_NAME_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }, [sesion?.empresa?.id, sesion?.empresa?.nombre]);

  useEffect(() => {
    if (!sesion) return undefined;

    const refreshPermisos = async () => {
      try {
        clearPermisosCache(sesion.usuario.id, sesion.empresa.id);
        const permisos = await cargarPermisosUsuarioEmpresa(sesion.usuario.id, sesion.empresa.id);
        setSesion((prev) => (prev ? { ...prev, permisos } : prev));
      } catch {
        // ignore silent refresh failures
      }
    };

    const onRefresh = () => {
      refreshPermisos();
    };

    window.addEventListener('mya:refresh-permisos', onRefresh);
    return () => window.removeEventListener('mya:refresh-permisos', onRefresh);
  }, [sesion]);

  const palette = COLOR_PALETTES.find(item => item.id === paletteId) || COLOR_PALETTES[0];
  const cssVars: Record<string, string> = {
    '--bg-dark': palette.colors.bgDark,
    '--bg-dark2': palette.colors.bgDark2,
    '--green-main': palette.colors.accentMain,
    '--green-dim': palette.colors.accentDim,
    '--green-soft': palette.colors.accentSoft,
    '--green-muted': palette.colors.accentMuted,
    '--gray-100': palette.colors.gray100,
    '--gray-200': palette.colors.gray200,
    '--gray-400': palette.colors.gray400,
    '--gray-600': palette.colors.gray600,
    '--gray-800': palette.colors.gray800,
    '--card-bg':     paletteId === 'white' ? '#ffffff' : 'rgba(255,255,255,0.07)',
    '--card-border': paletteId === 'white' ? '#e2e8f0' : 'rgba(255,255,255,0.10)',
    '--card-text':   paletteId === 'white' ? '#374151' : '#e2e8f0',
  };

  const cambiarEmpresaActiva = async (empresaId: number) => {
    if (!sesion) return;
    const empresaNueva = sesion.empresasAutorizadas.find((e) => e.id === empresaId);
    if (!empresaNueva || empresaNueva.id === sesion.empresa.id) return;

    try {
      clearPermisosCache(sesion.usuario.id, empresaNueva.id);
      const permisos = await cambiarEmpresaActivaViaApi(empresaNueva.id);
      if (!permisos) {
        alert('No se pudieron cargar permisos desde access-api para la empresa seleccionada.');
        return;
      }
      setSesion({
        ...sesion,
        empresa: empresaNueva,
        permisos,
      });
    } catch {
      alert('No se pudieron cargar permisos para la empresa seleccionada.');
    }
  };
  return (
    
    <div style={cssVars as React.CSSProperties} data-theme={paletteId}>
      <style>{styles}</style>
      <ThemeSwitcher paletteId={paletteId} onChange={setPaletteId} />
      {sesion
        ? <Dashboard
            usuario={sesion.usuario}
            empresa={sesion.empresa}
            permisos={sesion.permisos}
            empresasAutorizadas={sesion.empresasAutorizadas}
            rolesPorEmpresa={sesion.rolesPorEmpresa}
            onCambiarEmpresa={cambiarEmpresaActiva}
            onSalir={() => { sessionStorage.clear(); supabase.auth.signOut(); setSesion(null); }}
          />
        : <Login onLogin={(u, e, p, ea, rolesMap) => setSesion({
            usuario: u,
            empresa: e,
            permisos: p,
            empresasAutorizadas: ea,
            rolesPorEmpresa: rolesMap,
          })} />
      }
    </div>
    
  );
  
}

export default App;
