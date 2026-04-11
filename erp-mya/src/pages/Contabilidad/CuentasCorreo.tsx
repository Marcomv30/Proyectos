import { useState, useEffect } from 'react';

const API = 'http://localhost:3001';

interface Cuenta {
  id: number;
  nombre: string;
  tipo: 'HOTMAIL' | 'GMAIL' | 'IMAP';
  email: string;
  activo: boolean;
  ultima_descarga: string | null;
  imap_host?: string;
  imap_port?: number;
  imap_tls?: boolean;
}

interface Props {
  empresaId: number;
}

const TIPO_LABELS: Record<string, string> = {
  HOTMAIL: '📧 Hotmail / Outlook',
  GMAIL:   '📬 Gmail',
  IMAP:    '🖧 IMAP Corporativo',
};

const TIPO_COLORS: Record<string, string> = {
  HOTMAIL: 'bg-blue-900 text-blue-300',
  GMAIL:   'bg-red-900 text-red-300',
  IMAP:    'bg-gray-700 text-gray-300',
};

const FORM_VACIO = {
  nombre: '',
  tipo: 'GMAIL' as Cuenta['tipo'],
  email: '',
  password: '',
  imap_host: '',
  imap_port: 993,
  imap_tls: true,
};

export default function CuentasCorreo({ empresaId }: Props) {
  const [cuentas, setCuentas]         = useState<Cuenta[]>([]);
  const [cargando, setCargando]       = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando]       = useState<Cuenta | null>(null);
  const [form, setForm]               = useState({ ...FORM_VACIO });
  const [guardando, setGuardando]     = useState(false);
  const [probando, setProbando]       = useState<number | null>(null);
  const [mensajes, setMensajes]       = useState<Record<number, { ok: boolean; texto: string }>>({});
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    cargar();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = async () => {
    setCargando(true);
    const res  = await fetch(API + '/api/cuentas-correo?empresa_id=' + empresaId);
    const data = await res.json();
    setCuentas(data.cuentas || []);
    setCargando(false);
  };

  const abrirNueva = () => {
    setEditando(null);
    setForm({ ...FORM_VACIO });
    setError(null);
    setMostrarForm(true);
  };

  const abrirEditar = (c: Cuenta) => {
    setEditando(c);
    setForm({
      nombre:    c.nombre,
      tipo:      c.tipo,
      email:     c.email,
      password:  '',
      imap_host: c.imap_host || '',
      imap_port: c.imap_port || 993,
      imap_tls:  c.imap_tls !== false,
    });
    setError(null);
    setMostrarForm(true);
  };

  const guardar = async () => {
    if (!form.nombre || !form.email) {
      setError('Nombre y email son requeridos');
      return;
    }
    if (!editando && !form.password) {
      setError('La contraseña es requerida para cuentas nuevas');
      return;
    }
    setGuardando(true);
    setError(null);

    const body = {
      empresa_id: empresaId,
      nombre:     form.nombre,
      tipo:       form.tipo,
      email:      form.email,
      password:   form.password || undefined,
      imap_host:  form.tipo === 'IMAP' ? form.imap_host : undefined,
      imap_port:  form.tipo === 'IMAP' ? form.imap_port : undefined,
      imap_tls:   form.tipo === 'IMAP' ? form.imap_tls : undefined,
    };

    const url    = editando ? API + '/api/cuentas-correo/' + editando.id : API + '/api/cuentas-correo';
    const method = editando ? 'PUT' : 'POST';

    const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();

    if (!data.ok) {
      setError(data.error || 'Error al guardar');
    } else {
      setMostrarForm(false);
      await cargar();
    }
    setGuardando(false);
  };

  const eliminar = async (id: number) => {
    if (!window.confirm('¿Eliminar esta cuenta?')) return;
    await fetch(API + '/api/cuentas-correo/' + id, { method: 'DELETE' });
    await cargar();
  };

  const probarCuenta = async (id: number) => {
    setProbando(id);
    setMensajes(m => ({ ...m, [id]: { ok: false, texto: 'Probando...' } }));
    const res  = await fetch(API + '/api/cuentas-correo/' + id + '/probar', { method: 'POST' });
    const data = await res.json();
    setMensajes(m => ({ ...m, [id]: { ok: data.ok, texto: data.ok ? '✅ Conexión exitosa' : '❌ ' + data.error } }));
    setProbando(null);
  };

  const toggleActivo = async (c: Cuenta) => {
    await fetch(API + '/api/cuentas-correo/' + c.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !c.activo }),
    });
    await cargar();
  };

  return (
    <div className="p-6 text-gray-200">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-green-400">Cuentas de Correo</h1>
        <button onClick={abrirNueva}
          className="bg-green-700 hover:bg-green-600 px-4 py-2 rounded font-medium text-sm">
          + Agregar cuenta
        </button>
      </div>

      {/* Lista de cuentas */}
      {cargando ? (
        <p className="text-gray-400">Cargando...</p>
      ) : cuentas.length === 0 ? (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center text-gray-500">
          No hay cuentas configuradas. Agrega una para empezar.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {cuentas.map(c => (
            <div key={c.id} className={'bg-gray-800 border rounded-lg p-4 ' + (c.activo ? 'border-gray-700' : 'border-gray-700 opacity-60')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={'text-xs px-2 py-1 rounded ' + (TIPO_COLORS[c.tipo] || 'bg-gray-700 text-gray-300')}>
                    {TIPO_LABELS[c.tipo]}
                  </span>
                  <div>
                    <div className="font-medium text-white">{c.nombre}</div>
                    <div className="text-sm text-gray-400">{c.email}</div>
                    {c.ultima_descarga && (
                      <div className="text-xs text-gray-500 mt-1">
                        Última descarga: {new Date(c.ultima_descarga).toLocaleString('es-CR')}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleActivo(c)}
                    className={'text-xs px-2 py-1 rounded ' + (c.activo ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400')}
                  >
                    {c.activo ? '● Activa' : '○ Inactiva'}
                  </button>
                  <button
                    onClick={() => probarCuenta(c.id)}
                    disabled={probando === c.id}
                    className="bg-gray-700 hover:bg-blue-800 text-xs px-3 py-1 rounded transition-colors"
                  >
                    {probando === c.id ? 'Probando...' : '🔌 Probar'}
                  </button>
                  <button
                    onClick={() => abrirEditar(c)}
                    className="bg-gray-700 hover:bg-gray-600 text-xs px-3 py-1 rounded"
                  >
                    ✏️ Editar
                  </button>
                  <button
                    onClick={() => eliminar(c.id)}
                    className="bg-gray-700 hover:bg-red-800 text-xs px-3 py-1 rounded transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              {mensajes[c.id] && (
                <div className={'mt-2 text-xs px-3 py-2 rounded ' + (mensajes[c.id].ok ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300')}>
                  {mensajes[c.id].texto}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal formulario */}
      {mostrarForm && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-green-400 mb-4">
              {editando ? 'Editar cuenta' : 'Nueva cuenta de correo'}
            </h2>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Nombre descriptivo</label>
                <input type="text" value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Correo facturas empresa"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Tipo</label>
                <select value={form.tipo}
                  onChange={e => setForm(f => ({ ...f, tipo: e.target.value as Cuenta['tipo'] }))}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500">
                  <option value="GMAIL">Gmail (personal o Google Workspace)</option>
                  <option value="HOTMAIL">Hotmail / Outlook personal</option>
                  <option value="IMAP">IMAP Corporativo</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Email</label>
                <input type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="correo@empresa.com"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  {form.tipo === 'GMAIL' ? 'Contraseña de aplicación' : 'Contraseña'}
                  {editando && <span className="text-gray-500 ml-1">(dejar vacío para no cambiar)</span>}
                </label>
                <input type="password" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder={form.tipo === 'GMAIL' ? 'xxxx xxxx xxxx xxxx' : '••••••••'}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
                {form.tipo === 'GMAIL' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Gmail → Cuenta → Seguridad → Verificación en 2 pasos → Contraseñas de aplicación
                  </p>
                )}
              </div>

              {form.tipo === 'IMAP' && (
                <>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Servidor IMAP</label>
                    <input type="text" value={form.imap_host}
                      onChange={e => setForm(f => ({ ...f, imap_host: e.target.value }))}
                      placeholder="mail.empresa.com"
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-gray-400 block mb-1">Puerto</label>
                      <input type="number" value={form.imap_port}
                        onChange={e => setForm(f => ({ ...f, imap_port: Number(e.target.value) }))}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                        <input type="checkbox" checked={form.imap_tls}
                          onChange={e => setForm(f => ({ ...f, imap_tls: e.target.checked }))}
                          className="rounded" />
                        TLS/SSL
                      </label>
                    </div>
                  </div>
                </>
              )}

              {error && (
                <p className="text-red-400 text-xs bg-red-900 bg-opacity-30 px-3 py-2 rounded">{error}</p>
              )}

              <div className="flex gap-3 mt-2">
                <button onClick={guardar} disabled={guardando}
                  className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 py-2 rounded font-medium text-sm">
                  {guardando ? 'Guardando...' : editando ? 'Actualizar' : 'Guardar'}
                </button>
                <button onClick={() => setMostrarForm(false)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded text-sm">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}