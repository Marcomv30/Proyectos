import { useState, useEffect, useCallback, useRef } from 'react';
import { ModalSeleccionCuenta } from '../../components/ModalSeleccionCuenta';
import { createPortal } from 'react-dom';
import { supabase } from '../../supabase';

interface ConfigPOSState {
  empresa_id: number;
  categoria_pos_id?: number | null;
  cuenta_efectivo_id?: number | null;
  cuenta_sinpe_id?: number | null;
  cuenta_tarjeta_id?: number | null;
  cuenta_transferencia_id?: number | null;
  cuenta_ventas_id?: number | null;
  cuenta_iva_ventas_id?: number | null;
  cuenta_diferencias_id?: number | null;
  [key: string]: any;
}

interface CuentaInfo {
  id: number;
  codigo: string;
  nombre: string;
}

interface Cuenta {
  id: number;
  codigo: string;
  nombre: string;
}

// Modal con búsqueda remota
function ModalSeleccionCuentaDinamica({
  empresaId,
  authToken,
  onSelect,
  onClose,
}: {
  empresaId: number;
  authToken: string;
  onSelect: (cuentaId: number, cuenta: Cuenta) => void;
  onClose: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!busqueda.trim()) {
      setResultados([]);
      return;
    }

    setCargando(true);
    timerRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          empresa_id: empresaId.toString(),
          q: busqueda,
        });
        const resp = await fetch(`/api/pos/cuentas?${params}`, {
          headers: { 'Authorization': `Bearer ${authToken}` },
        });
        const json = await resp.json();
        if (json.ok) {
          setResultados(json.cuentas || []);
        }
      } catch (e) {
        console.error('Error buscando cuentas:', e);
      }
      setCargando(false);
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [busqueda, empresaId]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[200] p-4" onKeyDown={handleKey}>
      <div className="bg-gray-800 border border-gray-600 rounded-xl w-full max-w-lg flex flex-col" style={{ maxHeight: '82vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="text-white font-semibold text-sm">Seleccionar cuenta</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Buscador */}
        <div className="px-4 py-3 border-b border-gray-700">
          <input
            ref={inputRef}
            type="text"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por código o nombre..."
            className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto">
          {cargando && (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              🔍 Buscando cuentas...
            </div>
          )}
          {!cargando && !busqueda.trim() && (
            <div className="px-4 py-8 text-center text-gray-400 text-sm">
              <div>📝 Escribe para buscar cuentas</div>
              <div className="text-xs mt-2 text-gray-500">Por código (ej: 1105) o nombre (ej: CAJA)</div>
            </div>
          )}
          {!cargando && busqueda.trim() && resultados.length === 0 && (
            <div className="px-4 py-8 text-center">
              <div className="text-gray-400 text-sm">❌ Sin resultados para "{busqueda}"</div>
              <div className="text-xs text-gray-500 mt-2">Verifica que existan cuentas en el Plan de Cuentas</div>
            </div>
          )}
          {!cargando && resultados.length > 0 && (
            <div className="divide-y divide-gray-700">
              {resultados.map(cuenta => (
                <button
                  key={cuenta.id}
                  onClick={() => {
                    onSelect(cuenta.id, cuenta);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-gray-700 transition-colors text-sm"
                >
                  <div className="font-semibold text-blue-400">{cuenta.codigo}</div>
                  <div className="text-gray-300">{cuenta.nombre}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ConfigPOS({ empresaId }: { empresaId: number }) {
  const [config, setConfig] = useState<ConfigPOSState>({
    empresa_id: empresaId,
    categoria_pos_id: null,
    cuenta_efectivo_id: null,
    cuenta_sinpe_id: null,
    cuenta_tarjeta_id: null,
    cuenta_transferencia_id: null,
    cuenta_ventas_id: null,
    cuenta_iva_ventas_id: null,
    cuenta_diferencias_id: null,
  });

  const [cuentas, setCuentas] = useState<Record<number, CuentaInfo>>({});
  const [cuentasDisp, setCuentasDisp] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [modalCuenta, setModalCuenta] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  const campos = [
    { key: 'cuenta_efectivo_id', label: 'Efectivo en Caja', descripcion: 'Cuenta de activo para efectivo en caja' },
    { key: 'cuenta_sinpe_id', label: 'Banco SINPE', descripcion: 'Cuenta de activo para depósitos SINPE' },
    { key: 'cuenta_tarjeta_id', label: 'Banco Tarjeta', descripcion: 'Cuenta de activo para depósitos con tarjeta' },
    { key: 'cuenta_transferencia_id', label: 'Banco Transferencia', descripcion: 'Cuenta de activo para transferencias bancarias' },
    { key: 'cuenta_ventas_id', label: 'Ventas Realizadas', descripcion: 'Cuenta de ingresos por ventas' },
    { key: 'cuenta_iva_ventas_id', label: 'IVA por Pagar', descripcion: 'Cuenta de pasivo para IVA a pagar' },
    { key: 'cuenta_diferencias_id', label: 'Diferencias de Caja', descripcion: 'Cuenta para sobrantes/faltantes de caja' },
  ];

  // Obtener token de Supabase al cargar
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setAuthToken(data.session?.access_token || '');
    })();
  }, []);

  const cargarCuentasDisponibles = useCallback(async () => {
    if (!authToken) return;
    try {
      const resp = await fetch(`/api/pos/cuentas?empresa_id=${empresaId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      const json = await resp.json();
      if (json.ok) setCuentasDisp(json.cuentas || []);
    } catch (e) {
      console.error('Error cargando cuentas:', e);
    }
  }, [empresaId, authToken]);

  const cargarCuentasInfo = useCallback(async (cuentaIds: number[]) => {
    if (!authToken) return;
    try {
      const resp = await fetch(`/api/pos/cuentas?empresa_id=${empresaId}&ids=${cuentaIds.join(',')}`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      const json = await resp.json();
      if (json.ok) {
        const map: Record<number, CuentaInfo> = {};
        (json.cuentas || []).forEach((c: CuentaInfo) => {
          map[c.id] = c;
        });
        setCuentas(map);
      }
    } catch (e) {
      console.error('Error cargando cuentas:', e);
    }
  }, [empresaId, authToken]);

  const cargarConfig = useCallback(async () => {
    if (!authToken) return;
    setCargando(true);
    try {
      const resp = await fetch(`/api/pos/config-pos?empresa_id=${empresaId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      const json = await resp.json();
      if (json.ok && json.config) {
        setConfig(json.config);
        // Cargar info de cuentas
        const ids = Object.values(json.config)
          .filter((v: any) => typeof v === 'number' && v > 0) as number[];
        if (ids.length > 0) {
          cargarCuentasInfo(ids);
        }
      }
    } catch (e) {
      console.error('Error cargando config:', e);
    }
    setCargando(false);
  }, [empresaId, authToken, cargarCuentasInfo]);

  useEffect(() => {
    cargarConfig();
    cargarCuentasDisponibles();
  }, [cargarConfig, cargarCuentasDisponibles]);

  const guardarConfig = async () => {
    setGuardando(true);
    try {
      const resp = await fetch(`/api/pos/config-pos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(config),
      });
      const json = await resp.json();
      if (json.ok) {
        setMensaje({ tipo: 'success', texto: '✅ Configuración guardada correctamente' });
        setTimeout(() => setMensaje(null), 3000);
      } else {
        setMensaje({ tipo: 'error', texto: `❌ Error: ${json.error}` });
      }
    } catch (e) {
      console.error('Error guardando:', e);
      setMensaje({ tipo: 'error', texto: '❌ Error al guardar la configuración' });
    }
    setGuardando(false);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '900px' }}>
      <h1>⚙️ Configuración Contable POS</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        Asigne las cuentas contables que se usarán para registrar los asientos de cierre de caja.
      </p>

      {cargando ? (
        <p>Cargando...</p>
      ) : (
        <div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: '16px',
            marginBottom: '24px',
          }}>
            {campos.map((campo) => (
              <div key={campo.key} style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '16px',
                background: '#f9fafb',
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ display: 'block', fontWeight: '600', marginBottom: '4px' }}>
                    {campo.label}
                  </label>
                  <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
                    {campo.descripcion}
                  </p>
                </div>

                <div style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'center',
                }}>
                  <div style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    minHeight: '40px',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '14px',
                    color: config[campo.key as keyof ConfigPOSState] ? '#1f2937' : '#9ca3af',
                  }}>
                    {config[campo.key as keyof ConfigPOSState] && cuentas[config[campo.key as keyof ConfigPOSState] as number]
                      ? `${cuentas[config[campo.key as keyof ConfigPOSState] as number].codigo} - ${cuentas[config[campo.key as keyof ConfigPOSState] as number].nombre}`
                      : 'No asignada'}
                  </div>

                  <button
                    onClick={() => setModalCuenta(campo.key)}
                    style={{
                      padding: '10px 16px',
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                    }}
                  >
                    Seleccionar
                  </button>

                  {config[campo.key as keyof ConfigPOSState] && (
                    <button
                      onClick={() => {
                        const newConfig = { ...config };
                        newConfig[campo.key as keyof ConfigPOSState] = null;
                        setConfig(newConfig);
                      }}
                      style={{
                        padding: '10px 16px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={guardarConfig}
              disabled={guardando}
              style={{
                padding: '12px 24px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              {guardando ? 'Guardando...' : '💾 Guardar Configuración'}
            </button>

            <button
              onClick={cargarConfig}
              style={{
                padding: '12px 24px',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              🔄 Descartar Cambios
            </button>
          </div>
        </div>
      )}

      {/* Modal selector de cuenta */}
      {modalCuenta && (
        <ModalSeleccionCuentaDinamica
          empresaId={empresaId}
          authToken={authToken}
          onSelect={(cuentaId: number, cuenta: Cuenta) => {
            const newConfig = { ...config };
            newConfig[modalCuenta] = cuentaId;
            setConfig(newConfig);
            // Agregar a cache
            setCuentas({ ...cuentas, [cuentaId]: cuenta });
            setModalCuenta(null);
          }}
          onClose={() => setModalCuenta(null)}
        />
      )}

      {/* Modal de mensaje */}
      {mensaje && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end z-[300]">
          <div className={`w-full p-4 ${mensaje.tipo === 'success' ? 'bg-green-900 border-t-2 border-green-500' : 'bg-red-900 border-t-2 border-red-500'}`}>
            <div className={`text-sm font-medium ${mensaje.tipo === 'success' ? 'text-green-200' : 'text-red-200'}`}>
              {mensaje.texto}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
