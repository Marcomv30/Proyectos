import { useState, useEffect } from 'react';
import { supabase } from '../../supabase';

interface Parametros {
  id?: number;
  empresa_id: number;
  ruta_comprobantes: string;
}

interface Props {
  empresaId: number;
  canEdit: boolean;
}

export default function ParametrosContabilidad({ empresaId, canEdit }: Props) {
  const [parametros, setParametros] = useState<Parametros>({
    empresa_id: empresaId,
    ruta_comprobantes: 'C:/MYA/comprobantes',
  });
  const [cargando, setCargando]   = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje]     = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    cargar();
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cargar = async () => {
    setCargando(true);
    const { data } = await supabase
      .from('parametros_empresa')
      .select('*')
      .eq('empresa_id', empresaId)
      .maybeSingle();

    if (data) setParametros(data);
    setCargando(false);
  };

  const guardar = async () => {
    setGuardando(true);
    setMensaje(null);

    const { error } = await supabase
      .from('parametros_empresa')
      .upsert({
        empresa_id:         empresaId,
        ruta_comprobantes:  parametros.ruta_comprobantes,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'empresa_id' });

    if (error) {
      setMensaje({ ok: false, texto: 'Error al guardar: ' + error.message });
    } else {
      setMensaje({ ok: true, texto: '✅ Parámetros guardados correctamente' });
      setTimeout(() => setMensaje(null), 3000);
    }
    setGuardando(false);
  };

  if (cargando) return <p className="text-gray-400 p-6">Cargando...</p>;

  return (
    <div className="p-6 text-gray-200 max-w-2xl">
      <h1 className="text-2xl font-bold text-green-400 mb-6">
        ⚙️ Parámetros de Contabilidad
      </h1>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 flex flex-col gap-6">

        {/* Ruta comprobantes */}
        <div>
          <label className="text-sm font-medium text-gray-300 block mb-1">
            Ruta de almacenamiento de comprobantes electrónicos
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Carpeta base donde se guardan los XML y PDF descargados del correo. 
            Se crean subcarpetas automáticas por empresa y año.
          </p>
          <input
            type="text"
            value={parametros.ruta_comprobantes}
            onChange={e => setParametros(p => ({ ...p, ruta_comprobantes: e.target.value }))}
            disabled={!canEdit}
            placeholder="C:/MYA/comprobantes"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500 disabled:opacity-50 font-mono"
          />
          <p className="text-xs text-gray-500 mt-2">
            Ejemplo de estructura: <span className="font-mono text-gray-400">{parametros.ruta_comprobantes}/empresa_{empresaId}/2026/ID_00001_1.xml</span>
          </p>
        </div>
        <div className="flex gap-2 mt-2">
        <button
            onClick={async () => {
            await fetch('http://localhost:3001/api/correo/abrir-carpeta?ruta=' + 
                encodeURIComponent(parametros.ruta_comprobantes));
            }}
            className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-xs"
        >
            📂 Abrir carpeta
        </button>
        </div>
        {/* Mensaje */}
        {mensaje && (
          <div className={'px-4 py-3 rounded text-sm ' + (mensaje.ok ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300')}>
            {mensaje.texto}
          </div>
        )}

        {/* Botón guardar */}
        {canEdit && (
          <div>
            <button
              onClick={guardar}
              disabled={guardando}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 px-6 py-2 rounded font-medium text-sm"
            >
              {guardando ? 'Guardando...' : '💾 Guardar parámetros'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}