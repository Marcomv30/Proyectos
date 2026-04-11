import { useState, useEffect, useCallback, useRef } from 'react';
import { ModalSeleccionCuenta } from '../../components/ModalSeleccionCuenta';
import { createPortal } from 'react-dom';
import { supabase } from '../../supabase';

interface Cierre {
  id: number;
  apertura_at: string;
  cierre_at: string;
  monto_inicial: number;
  total_ventas: number;
  total_efectivo: number;
  total_sinpe: number;
  total_tarjeta: number;
  total_transferencia: number;
  contabilizado: boolean;
  asiento_id: number | null;
  caja: { id: number; nombre: string } | null;
  asiento: { id: number; numero_formato: string } | null;
}

interface Cuenta {
  id: number;
  codigo: string;
  nombre: string;
}

interface EditorAsiento {
  cierre: Cierre;
  lineas: any[];
  totalDebito: number;
  totalCredito: number;
  cuadra: boolean;
  editando: boolean;
}

// Helper para obtener token de Supabase
async function getAuthToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
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

export function CierresPOS({ empresaId }: { empresaId: number }) {
  const [cierres, setCierres] = useState<Cierre[]>([]);
  const [cargando, setCargando] = useState(false);
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [filtroCaja, setFiltroCaja] = useState('');

  const [editor, setEditor] = useState<EditorAsiento | null>(null);
  const [modalCuenta, setModalCuenta] = useState<{ index: number } | null>(null);
  const [contabilizando, setContabilizando] = useState(false);
  const [cuentasDisp, setCuentasDisp] = useState<Cuenta[]>([]);
  const [authToken, setAuthToken] = useState('');

  // Obtener token de Supabase al cargar
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setAuthToken(data.session?.access_token || '');
    })();
  }, []);

  const cargarCuentas = useCallback(async () => {
    if (!authToken) return;
    try {
      const resp = await fetch(`/api/pos/cuentas?empresa_id=${empresaId}&nivel=5`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      const json = await resp.json();
      if (json.ok) setCuentasDisp(json.cuentas || []);
    } catch (e) {
      console.error('Error cargando cuentas:', e);
    }
  }, [empresaId, authToken]);

  const cargarCierres = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams({
        empresa_id: empresaId.toString(),
        ...(filtroDesde && { desde: filtroDesde }),
        ...(filtroHasta && { hasta: filtroHasta }),
        ...(filtroCaja && { caja_id: filtroCaja.toString() }),
      });
      const resp = await fetch(`/api/pos/cierres?${params}`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      const json = await resp.json();
      if (json.ok) setCierres(json.cierres || []);
    } catch (e) {
      console.error('Error cargando cierres:', e);
    }
    setCargando(false);
  }, [empresaId, filtroDesde, filtroHasta, filtroCaja]);

  // Cargar cierres y cuentas
  useEffect(() => {
    cargarCierres();
    cargarCuentas();
  }, [cargarCierres, cargarCuentas]);

  const abrirEditor = async (cierre: Cierre) => {
    if (cierre.contabilizado) return;

    try {
      const resp = await fetch(`/api/pos/cierres/${cierre.id}/preparar-asiento?empresa_id=${empresaId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      const json = await resp.json();
      if (json.ok && json.asiento) {
        setEditor({
          cierre,
          lineas: json.asiento.lineas,
          totalDebito: json.asiento.totalDebito,
          totalCredito: json.asiento.totalCredito,
          cuadra: json.asiento.cuadra,
          editando: false,
        });
      }
    } catch (e) {
      console.error('Error preparando asiento:', e);
    }
  };

  const confirmarAsiento = async () => {
    if (!editor || !editor.lineas.length) return;

    setContabilizando(true);
    try {
      const resp = await fetch(`/api/pos/cierres/${editor.cierre.id}/confirmar-asiento`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          empresa_id: empresaId,
          lineas: editor.lineas,
          descripcion: `Cierre de caja ${editor.cierre.id}`,
        }),
      });
      const json = await resp.json();
      if (json.ok) {
        alert(`Asiento creado: ${json.numero_formato}`);
        setEditor(null);
        cargarCierres();
      } else {
        alert(`Error: ${json.error}`);
      }
    } catch (e) {
      console.error('Error contabilizando:', e);
      alert('Error al contabilizar');
    }
    setContabilizando(false);
  };

  const fmt = (n: number) => {
    if (!n) return '0.00';
    return n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>🛒 Cierres de Caja POS</h1>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          type="date"
          value={filtroDesde}
          onChange={(e) => setFiltroDesde(e.target.value)}
          placeholder="Desde"
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
        <input
          type="date"
          value={filtroHasta}
          onChange={(e) => setFiltroHasta(e.target.value)}
          placeholder="Hasta"
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
        <input
          type="text"
          value={filtroCaja}
          onChange={(e) => setFiltroCaja(e.target.value)}
          placeholder="ID Caja"
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
        <button
          onClick={cargarCierres}
          disabled={cargando}
          style={{
            padding: '8px 16px',
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          {cargando ? 'Cargando...' : '🔄 Actualizar'}
        </button>
      </div>

      {/* Tabla de cierres */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          border: '1px solid #e5e7eb',
        }}>
          <thead style={{ background: '#f3f4f6' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Fecha Cierre</th>
              <th style={{ padding: '12px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Caja</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>M. Inicial</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Ventas</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Efectivo</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>SINPE</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Tarjeta</th>
              <th style={{ padding: '12px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Transf.</th>
              <th style={{ padding: '12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {cierres.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px' }}>
                  {new Date(c.cierre_at).toLocaleString('es-CR', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </td>
                <td style={{ padding: '12px' }}>{c.caja?.nombre || `Caja ${c.id}`}</td>
                <td style={{ padding: '12px', textAlign: 'right' }}>₡{fmt(c.monto_inicial)}</td>
                <td style={{ padding: '12px', textAlign: 'right' }}>₡{fmt(c.total_ventas)}</td>
                <td style={{ padding: '12px', textAlign: 'right' }}>₡{fmt(c.total_efectivo)}</td>
                <td style={{ padding: '12px', textAlign: 'right' }}>₡{fmt(c.total_sinpe)}</td>
                <td style={{ padding: '12px', textAlign: 'right' }}>₡{fmt(c.total_tarjeta)}</td>
                <td style={{ padding: '12px', textAlign: 'right' }}>₡{fmt(c.total_transferencia)}</td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  {c.contabilizado ? (
                    <button
                      onClick={() => { /* navegar a asiento */ }}
                      style={{
                        padding: '6px 12px',
                        background: '#9333ea',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      📋 Asiento
                    </button>
                  ) : (
                    <button
                      onClick={() => abrirEditor(c)}
                      style={{
                        padding: '6px 12px',
                        background: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      📒 Contab.
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal editor de asiento */}
      {editor && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '1000px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
            display: 'flex',
            gap: '20px',
          }}>
            {/* Columna izquierda: resumen */}
            <div style={{ flex: '0 0 300px' }}>
              <h2 style={{ marginBottom: '16px' }}>Resumen Cierre</h2>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '16px' }}>
                <div><strong>Fecha:</strong> {new Date(editor.cierre.cierre_at).toLocaleDateString('es-CR')}</div>
                <div><strong>Caja:</strong> {editor.cierre.caja?.nombre}</div>
              </div>

              <div style={{
                background: '#f3f4f6',
                padding: '12px',
                borderRadius: '6px',
                fontSize: '13px',
                marginBottom: '16px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Monto inicial:</span>
                  <span>₡{fmt(editor.cierre.monto_inicial)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Total ventas:</span>
                  <span>₡{fmt(editor.cierre.total_ventas)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Efectivo:</span>
                  <span>₡{fmt(editor.cierre.total_efectivo)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>SINPE:</span>
                  <span>₡{fmt(editor.cierre.total_sinpe)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Tarjeta:</span>
                  <span>₡{fmt(editor.cierre.total_tarjeta)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Transf.:</span>
                  <span>₡{fmt(editor.cierre.total_transferencia)}</span>
                </div>
              </div>

              <div style={{
                background: editor.cuadra ? '#d1fae5' : '#fee2e2',
                padding: '12px',
                borderRadius: '6px',
                marginBottom: '16px',
                fontSize: '13px',
                color: editor.cuadra ? '#065f46' : '#991b1b',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Débitos:</span>
                  <span>₡{fmt(editor.totalDebito)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Créditos:</span>
                  <span>₡{fmt(editor.totalCredito)}</span>
                </div>
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid currentColor' }}>
                  {editor.cuadra ? '✓ Cuadra' : '✗ No cuadra'}
                </div>
              </div>

              <button
                onClick={confirmarAsiento}
                disabled={!editor.cuadra || contabilizando}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: editor.cuadra && !contabilizando ? '#3b82f6' : '#ccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: editor.cuadra && !contabilizando ? 'pointer' : 'not-allowed',
                  marginBottom: '10px',
                }}
              >
                {contabilizando ? 'Contabilizando...' : '✓ Confirmar'}
              </button>

              <button
                onClick={() => setEditor(null)}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>

            {/* Columna derecha: tabla de líneas */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ marginBottom: '16px' }}>Líneas del Asiento</h2>
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12px',
                }}>
                  <thead style={{ background: '#f3f4f6' }}>
                    <tr>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Cuenta</th>
                      <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Descripción</th>
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Débito</th>
                      <th style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #e5e7eb' }}>Crédito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editor.lineas.map((l, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '8px' }}>
                          <button
                            onClick={() => setModalCuenta({ index: i })}
                            style={{
                              background: '#dbeafe',
                              border: '1px solid #3b82f6',
                              color: '#1e40af',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '11px',
                            }}
                          >
                            {l.cuenta_codigo || 'Seleccionar'}
                          </button>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input
                            type="text"
                            value={l.descripcion}
                            onChange={(e) => {
                              const nuevas = [...editor.lineas];
                              nuevas[i].descripcion = e.target.value;
                              setEditor({ ...editor, lineas: nuevas });
                            }}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              fontSize: '11px',
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            value={l.debito_crc}
                            onChange={(e) => {
                              const nuevas = [...editor.lineas];
                              nuevas[i].debito_crc = parseFloat(e.target.value) || 0;
                              setEditor({ ...editor, lineas: nuevas });
                            }}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              fontSize: '11px',
                              textAlign: 'right',
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          <input
                            type="number"
                            value={l.credito_crc}
                            onChange={(e) => {
                              const nuevas = [...editor.lineas];
                              nuevas[i].credito_crc = parseFloat(e.target.value) || 0;
                              setEditor({ ...editor, lineas: nuevas });
                            }}
                            style={{
                              width: '100%',
                              padding: '4px',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              fontSize: '11px',
                              textAlign: 'right',
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Modal selector de cuenta */}
          {modalCuenta && (
            <ModalSeleccionCuentaDinamica
              empresaId={empresaId}
              authToken={authToken}
              onSelect={(cuentaId: number, cuenta: Cuenta) => {
                const nuevas = [...editor.lineas];
                nuevas[modalCuenta.index].cuenta_id = cuentaId;
                nuevas[modalCuenta.index].cuenta_codigo = cuenta.codigo;
                nuevas[modalCuenta.index].cuenta_nombre = cuenta.nombre;
                setEditor({ ...editor, lineas: nuevas });
                setModalCuenta(null);
              }}
              onClose={() => setModalCuenta(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
