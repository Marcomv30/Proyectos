import { useState, useEffect, useRef } from 'react';
import { getNivelCuenta, soloMovimiento } from '../utils/cuentas';

interface Cuenta {
  id: number;
  codigo: string;
  nombre: string;
  cuenta_base_id?: number | null;
}

interface Props {
  cuentas: Cuenta[];
  titulo?: string;
  usarBaseId?: boolean;
  onSelect: (id: number, cuenta: Cuenta) => void;
  onClose: () => void;
}

/** Devuelve el código del padre nivel 4 de una cuenta nivel 5.
 *  Ej: "0601-01-071-001" → "0601-01-071" */
function codigoPadreN4(codigo: string): string {
  const parts = codigo.split('-');
  // nivel 5 tiene 4 segmentos con base de 4 chars (startNivel=2 + 3 guiones)
  return parts.slice(0, 3).join('-');
}

export function ModalSeleccionCuenta({ cuentas, titulo = 'Seleccionar cuenta', usarBaseId, onSelect, onClose }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  const handleSelect = (c: Cuenta) => {
    onSelect(usarBaseId ? (c.cuenta_base_id || c.id) : c.id, c);
  };

  // Separar nivel 4 y nivel 5
  const todas = soloMovimiento(cuentas);
  const nivel5 = todas.filter(c => getNivelCuenta(c.codigo) === 5);

  // Nivel 4 que son hoja (no tienen hijos nivel 5)
  const n4TieneHijos = new Set(nivel5.map(c => codigoPadreN4(c.codigo)));
  const nivel4Hojas = todas.filter(c => getNivelCuenta(c.codigo) === 4 && !n4TieneHijos.has(c.codigo));

  const q = busqueda.toLowerCase();

  // Con búsqueda: mostrar plano filtrando nivel 5 + nivel 4 hojas
  const listaPlana = busqueda
    ? [...nivel5, ...nivel4Hojas].filter(c =>
        c.codigo.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q)
      ).sort((a, b) => a.codigo < b.codigo ? -1 : 1)
    : null;

  // Sin búsqueda: mostrar agrupado nivel4 → nivel5
  const grupos: { padre: Cuenta | null; hijos: Cuenta[] }[] = [];
  if (!listaPlana) {
    // Agregar grupos con hijos nivel 5
    const n4ConHijos = todas.filter(c => getNivelCuenta(c.codigo) === 4 && n4TieneHijos.has(c.codigo));
    for (const padre of n4ConHijos) {
      const hijos = nivel5.filter(c => codigoPadreN4(c.codigo) === padre.codigo);
      if (hijos.length) grupos.push({ padre, hijos });
    }
    // Agregar nivel 4 hojas como grupo sin padre visual
    if (nivel4Hojas.length) grupos.push({ padre: null, hijos: nivel4Hojas });
    grupos.sort((a, b) => {
      const ca = a.padre?.codigo ?? a.hijos[0]?.codigo ?? '';
      const cb = b.padre?.codigo ?? b.hijos[0]?.codigo ?? '';
      return ca < cb ? -1 : 1;
    });
  }

  const totalSeleccionables = nivel5.length + nivel4Hojas.length;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[200] p-4" onKeyDown={handleKey}>
      <div className="bg-gray-800 border border-gray-600 rounded-xl w-full max-w-lg flex flex-col" style={{ maxHeight: '82vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="text-white font-semibold text-sm">{titulo}</span>
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

        {/* Lista */}
        <div className="overflow-y-auto flex-1">
          {listaPlana !== null ? (
            // Vista de búsqueda: lista plana
            listaPlana.length === 0
              ? <p className="px-4 py-6 text-center text-gray-500 text-sm">Sin resultados</p>
              : listaPlana.map(c => {
                  const esN4 = getNivelCuenta(c.codigo) === 4;
                  return (
                    <button key={c.id} onClick={() => handleSelect(c)}
                      className="w-full text-left px-4 py-2 border-b border-gray-700 hover:bg-gray-700 transition-colors flex items-baseline gap-3">
                      <span className={`font-mono text-xs shrink-0 ${esN4 ? 'text-yellow-400 font-bold' : 'text-blue-400'}`}>
                        {c.codigo}
                      </span>
                      <span className={`text-sm truncate ${esN4 ? 'text-white font-semibold' : 'text-gray-300'}`}>
                        {c.nombre}
                      </span>
                    </button>
                  );
                })
          ) : (
            // Vista agrupada: nivel 4 como header, nivel 5 como ítems
            grupos.length === 0
              ? <p className="px-4 py-6 text-center text-gray-500 text-sm">Sin cuentas disponibles</p>
              : grupos.map((g, gi) => (
                  <div key={gi}>
                    {g.padre && (
                      <div className="px-4 py-1.5 bg-gray-900 flex items-baseline gap-3 select-none border-b border-gray-700">
                        <span className="font-mono text-xs text-yellow-400 font-bold shrink-0">{g.padre.codigo}</span>
                        <span className="text-xs text-yellow-200 font-semibold uppercase tracking-wide truncate">{g.padre.nombre}</span>
                      </div>
                    )}
                    {g.hijos.map(c => {
                      const esN4 = getNivelCuenta(c.codigo) === 4;
                      return (
                        <button key={c.id} onClick={() => handleSelect(c)}
                          className="w-full text-left border-b border-gray-700 hover:bg-gray-700 transition-colors flex items-baseline gap-3"
                          style={{ paddingLeft: g.padre ? 28 : 16, paddingRight: 16, paddingTop: 7, paddingBottom: 7 }}>
                          <span className={`font-mono text-xs shrink-0 ${esN4 ? 'text-yellow-400 font-bold' : 'text-blue-400'}`}>
                            {c.codigo}
                          </span>
                          <span className="text-sm text-gray-200 truncate">{c.nombre}</span>
                        </button>
                      );
                    })}
                  </div>
                ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-700 text-xs text-gray-500">
          {listaPlana ? `${listaPlana.length} resultado${listaPlana.length !== 1 ? 's' : ''}` : `${totalSeleccionables} cuentas`}
        </div>
      </div>
    </div>
  );
}
