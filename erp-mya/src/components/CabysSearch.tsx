import { useState, useRef } from 'react';

const API = 'http://localhost:3001';

export interface CabysItem {
  codigo:      string;
  descripcion: string;
  impuesto:    number;   // tasa IVA: 0, 1, 2, 4, 8, 13
  uri:         string;
  categorias:  string[]; // jerarquía hasta 8 niveles
}

interface Props {
  onSelect:  (item: CabysItem) => void;
  onClose:   () => void;
}

/**
 * CabysSearch — modal de búsqueda en el catálogo CABYS de Hacienda CR.
 *
 * Dos modos:
 *  - Texto: busca por descripción (?q=)
 *  - Código: busca por código exacto (?codigo=)
 *
 * Uso:
 *   <CabysSearch onSelect={item => console.log(item)} onClose={() => setOpen(false)} />
 */
export function CabysSearch({ onSelect, onClose }: Props) {
  const [modo, setModo]         = useState<'texto' | 'codigo'>('texto');
  const [query, setQuery]       = useState('');
  const [items, setItems]       = useState<CabysItem[]>([]);
  const [totalApi, setTotalApi] = useState<number | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError]       = useState('');
  const [expandido, setExpandido] = useState<string | null>(null);
  const [filtroLocal, setFiltroLocal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const filtroRef = useRef<HTMLInputElement>(null);

  const buscarQuery = async (q: string) => {
    if (!q.trim()) return;
    if (modo === 'codigo' && q.length !== 13) {
      setError('El código CABYS debe tener exactamente 13 dígitos.');
      return;
    }
    setCargando(true);
    setError('');
    setItems([]);
    setTotalApi(null);
    setFiltroLocal('');
    try {
      const param = modo === 'codigo' ? `codigo=${encodeURIComponent(q)}` : `q=${encodeURIComponent(q.trim())}`;
      const resp  = await fetch(`${API}/api/cabys?${param}`);
      const data  = await resp.json();
      if (!data.ok) { setError(data.error); return; }
      if (data.items.length === 0) setError('No se encontraron coincidencias.');
      setItems(data.items);
      setTotalApi(data.total ?? null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  const buscar = () => buscarQuery(query);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') buscar();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[100] p-4">
      <div className="bg-gray-800 border border-gray-600 rounded-xl flex flex-col w-full max-w-4xl max-h-[90vh]">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h3 className="text-blue-400 font-bold text-lg">Catálogo CABYS — Hacienda CR</h3>
            <p className="text-gray-500 text-xs mt-0.5">Busque por descripción o código para obtener la tarifa de IVA</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Barra de búsqueda */}
        <div className="px-6 py-3 border-b border-gray-700 flex gap-2 items-center">
          {/* Toggle modo */}
          <div className="flex rounded overflow-hidden border border-gray-600 text-xs flex-shrink-0">
            <button
              onClick={() => { setModo('texto'); setTimeout(() => inputRef.current?.focus(), 0); }}
              className={`px-3 py-1.5 transition-colors ${modo === 'texto' ? 'bg-blue-700 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
              Por texto
            </button>
            <button
              onClick={() => { setModo('codigo'); setTimeout(() => inputRef.current?.focus(), 0); }}
              className={`px-3 py-1.5 transition-colors ${modo === 'codigo' ? 'bg-blue-700 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}>
              Por código
            </button>
          </div>

          <div className="flex-1 relative">
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={e => {
                const val = modo === 'codigo'
                  ? e.target.value.replace(/\D/g, '').slice(0, 13)
                  : e.target.value;
                setQuery(val);
                setError('');
                if (modo === 'codigo' && val.length === 13) buscarQuery(val);
              }}
              onKeyDown={handleKey}
              placeholder={modo === 'codigo' ? '13 dígitos — Ej: 8413100000000' : 'Ej: computadora, seguro, diesel...'}
              className={`w-full bg-gray-700 border rounded px-3 py-1.5 text-sm focus:outline-none ${
                modo === 'codigo' && query.length > 0 && query.length < 13
                  ? 'border-yellow-600 focus:border-yellow-500'
                  : 'border-gray-600 focus:border-blue-500'
              }`}
            />
            {modo === 'codigo' && (
              <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs font-mono ${
                query.length === 13 ? 'text-green-400' : 'text-gray-500'
              }`}>
                {query.length}/13
              </span>
            )}
          </div>
          <button
            onClick={buscar}
            disabled={cargando || !query.trim() || (modo === 'codigo' && query.length !== 13)}
            className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 px-4 py-1.5 rounded text-sm font-medium transition-colors flex-shrink-0">
            {cargando ? '⏳ Buscando...' : '🔍 Buscar'}
          </button>
        </div>

        {/* Sub-filtro local (visible solo cuando hay resultados) */}
        {items.length > 0 && (
          <div className="px-6 py-2 border-b border-gray-700">
            <input
              ref={filtroRef}
              value={filtroLocal}
              onChange={e => setFiltroLocal(e.target.value)}
              placeholder="Filtrar dentro de los resultados..."
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 placeholder-gray-500"
            />
          </div>
        )}

        {/* Resultados */}
        <div className="overflow-y-auto flex-1 px-6 py-3">
          {error && (
            <p className="text-yellow-400 text-sm text-center py-4">{error}</p>
          )}
          {items.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-900">
                <tr className="text-gray-500 border-b border-gray-700">
                  <th className="text-left py-2 px-2 w-36">Código</th>
                  <th className="text-left py-2 px-2">Descripción</th>
                  <th className="text-center py-2 px-2 w-16">IVA</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody>
                {(filtroLocal.trim()
                  ? items.filter(it =>
                      it.descripcion.toLowerCase().includes(filtroLocal.toLowerCase()) ||
                      it.codigo.includes(filtroLocal)
                    )
                  : items
                ).map(item => (
                  <>
                    <tr key={item.codigo}
                      className="border-b border-gray-700 hover:bg-gray-750 cursor-pointer"
                      onClick={() => setExpandido(expandido === item.codigo ? null : item.codigo)}>
                      <td className="py-2 px-2 font-mono text-blue-400" onClick={e => { e.stopPropagation(); filtroRef.current?.focus(); }}>{item.codigo}</td>
                      <td className="py-2 px-2 text-gray-200" onClick={e => { e.stopPropagation(); filtroRef.current?.focus(); }}>{item.descripcion}</td>
                      <td className="py-2 px-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                          item.impuesto === 13 ? 'bg-green-900 text-green-300' :
                          item.impuesto === 0  ? 'bg-gray-700 text-gray-400' :
                          'bg-yellow-900 text-yellow-300'}`}>
                          {item.impuesto}%
                        </span>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <button
                          onClick={e => { e.stopPropagation(); onSelect(item); }}
                          className="bg-blue-700 hover:bg-blue-600 text-white px-2 py-0.5 rounded text-xs transition-colors">
                          Seleccionar
                        </button>
                      </td>
                    </tr>
                    {expandido === item.codigo && item.categorias.length > 0 && (
                      <tr key={`${item.codigo}-cats`} className="bg-gray-900 border-b border-gray-700">
                        <td colSpan={4} className="px-4 py-2">
                          <div className="flex flex-wrap gap-1">
                            {item.categorias.map((cat, i) => (
                              <span key={i} className="text-gray-400 text-xs">
                                {i > 0 && <span className="text-gray-600 mx-1">›</span>}
                                {cat}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
          {!cargando && !error && items.length === 0 && (
            <p className="text-gray-600 text-sm text-center py-8">
              Ingrese una descripción o código y presione Buscar
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-700 flex justify-between items-center">
          <span className="text-gray-600 text-xs">
            {items.length > 0
              ? (() => {
                  const visibles = filtroLocal.trim()
                    ? items.filter(it => it.descripcion.toLowerCase().includes(filtroLocal.toLowerCase()) || it.codigo.includes(filtroLocal)).length
                    : items.length;
                  const base = totalApi && totalApi > items.length
                    ? `${items.length} de ${totalApi.toLocaleString()} en API`
                    : `${items.length} resultado(s)`;
                  return filtroLocal.trim() ? `${visibles} visibles · ${base}` : base;
                })()
              : ''}
          </span>
          <button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 px-4 py-1.5 rounded text-sm transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
