import { useState, useEffect, useRef } from 'react';

const API = 'http://localhost:3001';

interface Cuenta {
  id: number;
  nombre: string;
  tipo: 'HOTMAIL' | 'GMAIL' | 'IMAP';
  email: string;
  activo: boolean;
}

interface Comprobante {
  id: number;
  emisor_nombre: string;
  total_comprobante: number;
  moneda: string;
}

interface Props {
  empresaId: number;
  onDescargaCompletada?: () => void;
}


export function DescargaCorreo({ empresaId, onDescargaCompletada }: Props) {
  const [cuentas, setCuentas]         = useState<Cuenta[]>([]);
  const [cuentaId, setCuentaId]       = useState<number | null>(null);
  const [cargandoCuentas, setCargandoCuentas] = useState(true);

  // Hotmail OAuth
  const [autenticado, setAutenticado] = useState(false);
  const [authInfo, setAuthInfo]       = useState<{ url: string; codigo: string } | null>(null);

  // Descarga
  const [cargando, setCargando]       = useState(false);
  const [resultado, setResultado]     = useState<{ total: number; duplicados: number; descargados: Comprobante[] } | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [progreso, setProgreso]       = useState<{ procesados: number; total: number; mensaje: string } | null>(null);

  // Fechas
  const hastaRef = useRef<HTMLInputElement>(null);

  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    cargarCuentas();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cuentaId) {
      const cuenta = cuentas.find(c => c.id === cuentaId);
      if (cuenta?.tipo === 'HOTMAIL') verificarAuthHotmail();
    }
  }, [cuentaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargarCuentas = async () => {
    setCargandoCuentas(true);
    try {
      const res  = await fetch(API + '/api/cuentas-correo?empresa_id=' + empresaId);
      const data = await res.json();
      const activas = (data.cuentas || []).filter((c: Cuenta) => c.activo);
      setCuentas(activas);

      // Agregar opción Hotmail OAuth
      if (activas.length > 0) setCuentaId(activas[0].id);
    } catch {
      // ignore
    }
    setCargandoCuentas(false);
  };

  const verificarAuthHotmail = async () => {
    try {
      const res  = await fetch(API + '/api/correo/estado');
      const data = await res.json();
      setAutenticado(data.autenticado);
    } catch {
      setAutenticado(false);
    }
  };

  const iniciarAuthHotmail = async () => {
    setCargando(true);
    setError(null);
    try {
      const res  = await fetch(API + '/api/correo/iniciar-auth');
      const data = await res.json();
      setAuthInfo({ url: data.url, codigo: data.codigo });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  const authConfirmada = async () => {
    setAuthInfo(null);
    await verificarAuthHotmail();
  };

  const cuentaSeleccionada = cuentas.find(c => c.id === cuentaId);
  const esHotmailOAuth = cuentaSeleccionada?.tipo === 'HOTMAIL' &&
    !cuentaSeleccionada?.email; // sin password = OAuth

  const descargar = async () => {
    if (!cuentaId) return;
    setCargando(true);
    setError(null);
    setResultado(null);
    setProgreso(null);

    try {
      const params = new URLSearchParams({
        empresa_id:  String(empresaId),
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
      });

      // Decidir endpoint según tipo
      const cuenta = cuentas.find(c => c.id === cuentaId);
      let url: string;

      if (cuenta?.tipo === 'HOTMAIL') {
        // Usar endpoint OAuth de Hotmail existente
        url = API + '/api/correo/descargar-sse?' + params.toString();
      } else {
        // Usar endpoint IMAP
        url = API + '/api/cuentas-correo/' + cuentaId + '/descargar-sse?' + params.toString();
      }

      const eventSource = new EventSource(url);

      eventSource.onmessage = (e) => {
        const data = JSON.parse(e.data);

        if (data.tipo === 'total') {
          setProgreso({ procesados: 0, total: data.total, mensaje: 'Iniciando...' });
        } else if (data.tipo === 'progreso' || data.tipo === 'estado') {
          setProgreso(p => ({
            procesados: data.procesados || p?.procesados || 0,
            total:      data.total      || p?.total      || 0,
            mensaje:    data.mensaje    || '',
          }));
        } else if (data.tipo === 'fin') {
          setResultado({ total: data.descargados, duplicados: data.duplicados, descargados: [] });
          setProgreso(null);
          setCargando(false);
          eventSource.close();
          onDescargaCompletada?.();
        } else if (data.tipo === 'error') {
          setError(data.mensaje);
          setProgreso(null);
          setCargando(false);
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        setError('Error de conexión con el servidor');
        setProgreso(null);
        setCargando(false);
        eventSource.close();
      };

    } catch (e: any) {
      setError(e.message);
      setCargando(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h3 className="text-green-400 font-semibold text-lg mb-4">
        📥 Descargar Comprobantes
      </h3>

      {cargandoCuentas ? (
        <p className="text-gray-400 text-sm">Cargando cuentas...</p>
      ) : cuentas.length === 0 ? (
        <p className="text-gray-400 text-sm">
          No hay cuentas de correo configuradas.{' '}
          <span className="text-green-400">Ve a Contabilidad → Cuentas de Correo para agregar una.</span>
        </p>
      ) : (
        <>
          {/* Selector de cuenta */}
          <div className="mb-4">
            <label className="text-xs text-gray-400 block mb-2">Cuenta de correo</label>
            <select
              value={cuentaId ?? ''}
              onChange={e => { setCuentaId(Number(e.target.value)); setResultado(null); setError(null); }}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500"
            >
              {cuentas.map(c => (
                <option key={c.id} value={c.id}>
                  [{c.tipo}] {c.nombre} — {c.email}
                </option>
              ))}
            </select>
          </div>

          {/* Auth Hotmail OAuth si aplica */}
          {cuentaSeleccionada?.tipo === 'HOTMAIL' && !autenticado && !authInfo && (
            <div className="mb-4">
              <p className="text-gray-400 text-sm mb-2">
                Esta cuenta requiere autenticación con Microsoft.
              </p>
              <button onClick={iniciarAuthHotmail} disabled={cargando}
                className="bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium">
                {cargando ? 'Iniciando...' : '🔐 Autenticar con Microsoft'}
              </button>
            </div>
          )}

          {authInfo && (
            <div className="bg-gray-900 rounded-lg p-4 border border-blue-700 mb-4">
              <p className="text-blue-400 font-medium mb-3">Sigue estos pasos:</p>
              <ol className="text-gray-300 text-sm space-y-2 mb-4">
                <li>1. Abre: <a href={authInfo.url} target="_blank" rel="noreferrer" className="text-blue-400 underline">{authInfo.url}</a></li>
                <li>2. Ingresa el código: <span className="font-mono text-xl text-yellow-400 font-bold">{authInfo.codigo}</span></li>
                <li>3. Inicia sesión con tu cuenta Hotmail</li>
              </ol>
              <button onClick={authConfirmada}
                className="bg-green-700 hover:bg-green-600 text-white px-4 py-2 rounded text-sm font-medium">
                ✅ Ya me autentiqué
              </button>
            </div>
          )}

          {/* Rango de fechas y botón */}
          {(cuentaSeleccionada?.tipo !== 'HOTMAIL' || autenticado) && !authInfo && (
            <div>
              {cuentaSeleccionada?.tipo === 'HOTMAIL' && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-green-400 text-xs">● Microsoft conectado</span>
                  <button onClick={() => setAutenticado(false)} className="text-gray-500 text-xs hover:text-gray-300">
                    Desconectar
                  </button>
                </div>
              )}

              <div className="flex gap-3 mb-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Desde</label>
                  <input type="date" value={fechaDesde}
                    onChange={e => setFechaDesde(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') descargar();
                      if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); hastaRef.current?.focus(); }
                    }}
                    className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Hasta</label>
                  <input ref={hastaRef} type="date" value={fechaHasta}
                    onChange={e => setFechaHasta(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') descargar(); }}
                    className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white" />
                </div>
              </div>

              <button onClick={descargar} disabled={cargando}
                className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-6 py-2 rounded font-medium">
                {cargando ? '⏳ Descargando...' : '📥 Descargar comprobantes'}
              </button>
            </div>
          )}

          {/* Barra de progreso */}
          {progreso && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span className="truncate max-w-xs">{progreso.mensaje}</span>
                <span>{progreso.procesados} / {progreso.total}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-3">
                <div
                  className="bg-green-500 h-3 rounded-full transition-all duration-300"
                  style={{ width: (progreso.total > 0 ? (progreso.procesados / progreso.total) * 100 : 0) + '%' }}
                />
              </div>
            </div>
          )}

          {/* Resultado */}
          {resultado && (
            <div className="mt-4">
              <p className="text-green-400 font-medium">
                ✅ {resultado.total} nuevos | {resultado.duplicados} ya existían
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="mt-3 text-red-400 text-sm">❌ {error}</p>
          )}
        </>
      )}
    </div>
  );
}