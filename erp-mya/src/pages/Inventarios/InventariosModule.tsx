// ============================================================
// MYA ERP - Modulo Inventarios
// Landing con sub-navegacion interna (modelo Combustible)
// ============================================================

import { useState, useEffect, type ReactNode } from 'react';
import DashboardInventario from './DashboardInventario';
import CatalogoProductos from './CatalogoProductos';
import ProductoFormPage, { ProductoCatalogo } from './ProductoFormPage';
import CategoriasProductos from './CategoriasProductos';
import MovimientosStock from './MovimientosStock';
import KardexProducto from './KardexProducto';
import CodigosProveedor from './CodigosProveedor';
import ValorizacionInventario from './ValorizacionInventario';
import AjusteInventario from './AjusteInventario';
import ListadoAjustes from './ListadoAjustes';
import ConciliacionBodegas from './ConciliacionBodegas';
import { ModalSeleccionCuenta } from '../../components/ModalSeleccionCuenta';
import { supabase } from '../../supabase';

interface CuentaBase { id: number; codigo: string; nombre: string; cuenta_base_id?: number | null; }
interface CfgInv {
  cuenta_inventario_id:   number | null;
  cuenta_costo_ventas_id: number | null;
  cuenta_ajuste_inv_id:   number | null;
}

type SubModulo =
  | 'home'
  | 'dashboard'
  | 'catalogo'
  | 'categorias'
  | 'movimientos'
  | 'kardex'
  | 'codigos'
  | 'valorizacion'
  | 'ajuste'
  | 'bodegas';

interface SubModuloCard {
  id: SubModulo;
  icon: string;
  nombre: string;
  descripcion: string;
  color: string;
  disponible: boolean;
}

const SUBMODULOS: SubModuloCard[] = [
  {
    id: 'dashboard',
    icon: 'DB',
    nombre: 'Dashboard',
    descripcion: 'Resumen general: totales, stock bajo minimo, productos sin CABYS y alertas.',
    color: '#22c55e',
    disponible: true,
  },
  {
    id: 'catalogo',
    icon: 'CAT',
    nombre: 'Catalogo de Productos',
    descripcion: 'Alta, edicion y busqueda de productos y servicios con codigo CABYS y tarifa IVA.',
    color: '#38bdf8',
    disponible: true,
  },
  {
    id: 'categorias',
    icon: 'CG',
    nombre: 'Categorias',
    descripcion: 'Gestion de categorias para clasificar productos y servicios del catalogo.',
    color: '#a78bfa',
    disponible: true,
  },
  {
    id: 'movimientos',
    icon: 'MV',
    nombre: 'Movimientos de Stock',
    descripcion: 'Entradas, salidas y ajustes de inventario con trazabilidad de cada transaccion.',
    color: '#f59e0b',
    disponible: true,
  },
  {
    id: 'kardex',
    icon: 'KX',
    nombre: 'Kardex',
    descripcion: 'Kardex por producto con saldo acumulativo, costo promedio ponderado y valor de inventario. Art. 9 MH-CR.',
    color: '#06b6d4',
    disponible: true,
  },
  {
    id: 'codigos',
    icon: 'CP',
    nombre: 'Codigos de Proveedor',
    descripcion: 'Mapeo de CodigoComercial XML (Hacienda) a producto interno. Permite entradas automaticas al contabilizar compras.',
    color: '#f97316',
    disponible: true,
  },
  {
    id: 'valorizacion',
    icon: 'VL',
    nombre: 'Valorizacion',
    descripcion: 'Stock x Costo Promedio a una fecha. Requerido para D-101 (Renta) y cierre fiscal MH-CR.',
    color: '#22d3ee',
    disponible: true,
  },
  {
    id: 'ajuste',
    icon: 'AJ',
    nombre: 'Ajuste',
    descripcion: 'Entradas y salidas manuales de inventario con asiento contable automatico.',
    color: '#f59e0b',
    disponible: true,
  },
  {
    id: 'bodegas',
    icon: 'BD',
    nombre: 'Conciliación Bodegas',
    descripcion: 'Compara stock global vs. desglose por bodega POS. Detecta diferencias y sincroniza.',
    color: '#a78bfa',
    disponible: true,
  },
];

const BREADCRUMB_LABEL: Partial<Record<SubModulo, string>> = {
  dashboard:   'Dashboard',
  catalogo:    'Catalogo de Productos',
  categorias:  'Categorias',
  movimientos: 'Movimientos de Stock',
  kardex:       'Kardex',
  codigos:      'Codigos de Proveedor',
  valorizacion: 'Valorizacion',
  ajuste:       'Ajuste de Inventario',
  bodegas:      'Conciliación de Bodegas',
};

interface Props {
  empresaId: number;
  onHome: () => void;
  setNavbarExtra?: (node: ReactNode) => void;
}

const NAVBAR_EXTRA_META: Partial<Record<SubModulo, string>> = {
  dashboard: 'Resumen y alertas del inventario',
  catalogo: 'Productos, servicios y CABYS',
  categorias: 'Clasificacion del catalogo',
  movimientos: 'Entradas, salidas y trazabilidad',
  kardex: 'Saldo y costo por producto',
  codigos: 'Mapeo con proveedores',
  valorizacion: 'Stock valorizado a la fecha',
  ajuste: 'Ajustes manuales y asiento contable',
  bodegas: 'Stock global vs. desglose por bodega POS',
}

export default function InventariosModule({ empresaId, onHome, setNavbarExtra }: Props) {
  const [activo, setActivo]         = useState<SubModulo>('home');
  const [ajusteVista, setAjusteVista] = useState<'lista' | 'nuevo'>('lista');
  const [catalogoVista, setCatalogoVista] = useState<'lista' | 'nuevo' | 'editar'>('lista');
  const [productoEdicion, setProductoEdicion] = useState<ProductoCatalogo | null>(null);
  const [kardexInicial, setKardexInicial] = useState<number | undefined>(undefined);
  const [modalConfig, setModalConfig] = useState(false);
  const [cuentas, setCuentas]       = useState<CuentaBase[]>([]);
  const [cfgInv, setCfgInv]         = useState<CfgInv>({
    cuenta_inventario_id: null, cuenta_costo_ventas_id: null, cuenta_ajuste_inv_id: null,
  });
  const [cfgLabels, setCfgLabels]   = useState<Record<string, string>>({});
  const [modalCuentaCfg, setModalCuentaCfg] = useState<keyof CfgInv | null>(null);
  const [guardando, setGuardando]   = useState(false);

  const resolverCuentaEmpresa = (valor: number | null | undefined, cuentasList: CuentaBase[]) => {
    const raw = Number(valor || 0);
    if (!raw) return null;
    return cuentasList.find((c) => c.id === raw)
      || cuentasList.find((c) => Number(c.cuenta_base_id || 0) === raw)
      || null;
  };

  useEffect(() => {
    Promise.all([
      supabase.from('plan_cuentas_empresa').select('id, codigo, nombre, cuenta_base_id')
        .eq('empresa_id', empresaId).eq('activo', true)
        .order('codigo'),
      supabase.from('empresa_config_inventario').select('*')
        .eq('empresa_id', empresaId).maybeSingle(),
    ]).then(([cuentasRes, cfgRes]) => {
      const cuentasList = (cuentasRes.data || []) as CuentaBase[];
      setCuentas(cuentasList);

      const data = cfgRes.data as any;
      if (!data) return;

      const cuentaInventario = resolverCuentaEmpresa(data.cuenta_inventario_id, cuentasList);
      const cuentaCostoVentas = resolverCuentaEmpresa(data.cuenta_costo_ventas_id, cuentasList);
      const cuentaAjuste = resolverCuentaEmpresa(data.cuenta_ajuste_inv_id, cuentasList);

      const cfg: CfgInv = {
        cuenta_inventario_id: cuentaInventario?.id || null,
        cuenta_costo_ventas_id: cuentaCostoVentas?.id || null,
        cuenta_ajuste_inv_id: cuentaAjuste?.id || null,
      };
      setCfgInv(cfg);

      const map: Record<string, string> = {};
      [cuentaInventario, cuentaCostoVentas, cuentaAjuste].filter(Boolean).forEach((c) => {
        map[String((c as CuentaBase).id)] = `${(c as CuentaBase).codigo} - ${(c as CuentaBase).nombre}`;
      });
      setCfgLabels(map);
    });
  }, [empresaId]);

  useEffect(() => {
    if (!setNavbarExtra) return undefined;
    if (activo === 'home') {
      setNavbarExtra(null);
      return () => setNavbarExtra(null);
    }

    setNavbarExtra(
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '6px 10px',
            borderRadius: 999,
            border: '1px solid rgba(56,189,248,.24)',
            background: 'rgba(56,189,248,.12)',
            color: '#bae6fd',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
          }}
        >
          {BREADCRUMB_LABEL[activo] || 'Inventarios'}
        </span>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>
          {NAVBAR_EXTRA_META[activo] || 'Operacion del modulo inventarios'}
        </span>
      </div>
    );

    return () => setNavbarExtra(null);
  }, [activo, setNavbarExtra]);


  const guardarConfig = async () => {
    setGuardando(true);
    const payload = { empresa_id: empresaId, ...cfgInv, updated_at: new Date().toISOString() };
    const { error } = await supabase
      .from('empresa_config_inventario')
      .upsert(payload, { onConflict: 'empresa_id' });
    if (error) {
      alert('Error al guardar: ' + error.message);
      setGuardando(false);
      return;
    }
    setGuardando(false);
    setModalConfig(false);
  };

  // Landing
  if (activo === 'home') {
    return (
      <>
      <div className="min-h-screen bg-gray-950 text-white p-6 font-mono">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 mb-1">
              <button
                onClick={onHome}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors mr-1"
              >
                Home /
              </button>
              <span className="text-3xl">INV</span>
              <h1 className="text-2xl font-bold text-white tracking-tight">Inventarios</h1>
            </div>
            <button
              onClick={() => setModalConfig(true)}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors border border-gray-700"
            >
              Configuracion contable
            </button>
          </div>
          <p className="text-gray-500 text-sm ml-12">
            Catalogo de productos, control de stock y movimientos
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
          {SUBMODULOS.map(sm => (
            <button
              key={sm.id}
              onClick={() => { if (sm.disponible) { setActivo(sm.id); if (sm.id === 'ajuste') setAjusteVista('lista'); setKardexInicial(undefined); } }}
              disabled={!sm.disponible}
              className={`
                text-left rounded-2xl border p-5 flex flex-col gap-3 transition-all
                ${sm.disponible
                  ? 'bg-gray-900 border-gray-700 hover:border-opacity-80 hover:scale-[1.02] cursor-pointer'
                  : 'bg-gray-900/40 border-gray-800 cursor-not-allowed opacity-50'
                }
              `}
              style={sm.disponible ? { borderColor: sm.color + '55' } : {}}
            >
              <div className="flex items-start justify-between">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                  style={{ background: sm.color + '22' }}
                >
                  {sm.icon}
                </div>
                {!sm.disponible && (
                  <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full mt-1">
                    Proximamente
                  </span>
                )}
                {sm.disponible && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full mt-1 font-medium"
                    style={{ background: sm.color + '22', color: sm.color }}
                  >
                    Disponible
                  </span>
                )}
              </div>

              <div>
                <h2
                  className="text-base font-semibold mb-1"
                  style={{ color: sm.disponible ? sm.color : '#6b7280' }}
                >
                  {sm.nombre}
                </h2>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {sm.descripcion}
                </p>
              </div>

              {sm.disponible && (
                <div className="flex justify-end">
                  <span className="text-xs font-medium" style={{ color: sm.color }}>
                    Abrir {'>'}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Modal configuracion contable */}
      {modalConfig && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-white font-bold text-lg mb-1">Configuracion contable - Inventarios</h2>
            <p className="text-gray-500 text-xs mb-5">
              Si configura estas cuentas, al contabilizar compras XML la mercaderia ira a <strong>Inventario</strong> en lugar de Gasto.
            </p>

            {(['cuenta_inventario_id', 'cuenta_costo_ventas_id', 'cuenta_ajuste_inv_id'] as const).map(campo => {
              const labels: Record<string, string> = {
                cuenta_inventario_id:   'Inventario de Mercaderias (Activo)',
                cuenta_costo_ventas_id: 'Costo de Ventas (Gasto)',
                cuenta_ajuste_inv_id:   'Ajustes de Inventario (Gasto)',
              };
              const id = cfgInv[campo];
              return (
                <div key={campo} className="mb-4">
                  <label className="block text-xs text-gray-400 mb-1">{labels[campo]}</label>
                  <button
                    onClick={() => setModalCuentaCfg(campo)}
                    className="w-full text-left bg-gray-900 border border-gray-600 hover:border-gray-500 rounded px-3 py-2 text-sm transition-colors"
                  >
                    {id && cfgLabels[id]
                      ? <span className="text-white">{cfgLabels[id]}</span>
                      : <span className="text-gray-500">- Sin asignar -</span>
                    }
                  </button>
                </div>
              );
            })}

            <div className="flex gap-3 mt-6">
              <button onClick={guardarConfig} disabled={guardando}
                className="flex-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium text-white">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
              <button onClick={() => setModalConfig(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm text-gray-300">
                Cancelar
              </button>
            </div>

            {modalCuentaCfg && (
              <ModalSeleccionCuenta
                cuentas={cuentas as any}
                titulo={modalCuentaCfg === 'cuenta_inventario_id' ? 'Inventario de Mercaderias' : modalCuentaCfg === 'cuenta_costo_ventas_id' ? 'Costo de Ventas' : 'Ajustes de Inventario'}
                onSelect={(id, cuenta: any) => {
                  setCfgInv(prev => ({ ...prev, [modalCuentaCfg]: id }));
                  setCfgLabels(prev => ({ ...prev, [id]: `${cuenta.codigo} - ${cuenta.nombre}` }));
                  setModalCuentaCfg(null);
                }}
                onClose={() => setModalCuentaCfg(null)}
              />
            )}
          </div>
        </div>
      )}
      </>
    );
  }

  // Sub-modulo activo
  const smActivo = SUBMODULOS.find(s => s.id === activo);
  return (
    <div className="min-h-screen bg-gray-950 text-white font-mono">
      {/* Barra de navegacion interna */}
      <div className="bg-gray-900 border-b border-gray-800 flex items-center gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0">
          <button
            onClick={onHome}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-800 whitespace-nowrap"
          >
            Home
          </button>
          <span className="text-gray-700 text-xs">/</span>
          <button
            onClick={() => setActivo('home')}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-gray-800 whitespace-nowrap"
          >
            Inventarios
          </button>
          <span className="text-gray-700 text-xs">/</span>
          <span className="text-xs font-medium px-2 py-1 whitespace-nowrap" style={{ color: smActivo?.color }}>
            {BREADCRUMB_LABEL[activo]}
          </span>
        </div>

        {/* Tabs de navegacion rapida */}
        <div className="flex items-center gap-1 ml-auto px-2 py-2 flex-shrink-0">
          {SUBMODULOS.filter(sm => sm.disponible).map(sm => (
            <button
              key={sm.id}
              onClick={() => { setActivo(sm.id); if (sm.id === 'ajuste') setAjusteVista('lista'); setKardexInicial(undefined); }}
              className={`
                px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap
                ${activo === sm.id
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                }
              `}
              style={activo === sm.id ? { background: sm.color + '33', color: sm.color } : {}}
            >
              {sm.icon} {sm.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div>
        {activo === 'dashboard' && (
          <DashboardInventario
            empresaId={empresaId}
            onIrCatalogo={() => setActivo('catalogo')}
            onIrAjuste={() => setActivo('ajuste')}
          />
        )}
        {activo === 'catalogo' && (
          catalogoVista === 'lista' ? (
            <CatalogoProductos
              empresaId={empresaId}
              onNuevo={() => {
                setProductoEdicion(null);
                setCatalogoVista('nuevo');
              }}
              onEditar={(producto) => {
                setProductoEdicion(producto);
                setCatalogoVista('editar');
              }}
            />
          ) : (
            <ProductoFormPage
              empresaId={empresaId}
              modo={catalogoVista === 'nuevo' ? 'nuevo' : 'editar'}
              producto={productoEdicion}
              onAbrirConfig={() => setModalConfig(true)}
              onVolver={() => {
                setProductoEdicion(null);
                setCatalogoVista('lista');
              }}
              onGuardado={() => {
                setProductoEdicion(null);
                setCatalogoVista('lista');
              }}
            />
          )
        )}
        {activo === 'categorias' && (
          <CategoriasProductos empresaId={empresaId} />
        )}
        {activo === 'movimientos' && (
          <MovimientosStock empresaId={empresaId} />
        )}
        {activo === 'kardex' && (
          <KardexProducto empresaId={empresaId} productoIdInicial={kardexInicial} />
        )}
        {activo === 'codigos' && (
          <CodigosProveedor empresaId={empresaId} />
        )}
        {activo === 'valorizacion' && (
          <ValorizacionInventario empresaId={empresaId} />
        )}
        {activo === 'ajuste' && ajusteVista === 'lista' && (
          <ListadoAjustes
            empresaId={empresaId}
            onNuevoAjuste={() => setAjusteVista('nuevo')}
            onVerKardex={pid => { setKardexInicial(pid); setActivo('kardex'); }}
          />
        )}
        {activo === 'ajuste' && ajusteVista === 'nuevo' && (
          <AjusteInventario
            empresaId={empresaId}
            onVolver={() => setAjusteVista('lista')}
          />
        )}
        {activo === 'bodegas' && (
          <ConciliacionBodegas empresaId={empresaId} />
        )}
      </div>
    </div>
  );
}
