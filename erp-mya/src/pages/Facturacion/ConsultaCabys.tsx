import React, { useMemo, useRef, useState } from 'react';

type CabysItem = {
  codigo: string;
  descripcion: string;
  impuesto: number;
  uri?: string;
  categorias?: string[];
};

type Props = {
  empresaId: number;
};

const API = 'http://localhost:3001';

const getCabysTipo = (item: CabysItem): 'mercancia' | 'servicio' | '' => {
  const primerDigito = String(item.codigo || '').trim().charAt(0);
  if (['0', '1', '2', '3', '4'].includes(primerDigito)) return 'mercancia';
  if (['5', '6', '7', '8', '9'].includes(primerDigito)) return 'servicio';
  return '';
};

export default function ConsultaCabys({ empresaId }: Props) {
  const [modo, setModo] = useState<'texto' | 'codigo'>('texto');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CabysItem[]>([]);
  const [selected, setSelected] = useState<CabysItem | null>(null);
  const [totalApi, setTotalApi] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const visibleItems = useMemo(() => items, [items]);

  const buscar = async (raw?: string) => {
    const q = (typeof raw === 'string' ? raw : query).trim();
    if (!q) return;
    if (modo === 'codigo' && q.length !== 13) {
      setError('El codigo CABYS debe tener 13 digitos.');
      return;
    }
    setBusy(true);
    setError('');
    setItems([]);
    setSelected(null);
    setTotalApi(null);
    try {
      const param = modo === 'codigo'
        ? `codigo=${encodeURIComponent(q)}`
        : `q=${encodeURIComponent(q)}`;
      const resp = await fetch(`${API}/api/cabys?${param}`);
      const text = await resp.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text || 'No hubo respuesta del servidor.');
      }
      if (!resp.ok || !data?.ok) {
        throw new Error(String(data?.error || 'No se pudo consultar CABYS.'));
      }
      const nextItems = Array.isArray(data.items) ? data.items : [];
      setItems(nextItems);
      setTotalApi(typeof data.total === 'number' ? data.total : null);
      if (!nextItems.length) {
        setError('No se encontraron coincidencias.');
      } else {
        setSelected(nextItems[0]);
      }
    } catch (err: any) {
      setError(String(err?.message || 'No se pudo consultar CABYS.'));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    buscar();
  };

  const handleChange = (value: string) => {
    const next = modo === 'codigo'
      ? value.replace(/\D/g, '').slice(0, 13)
      : value;
    setQuery(next);
    setError('');
    if (modo === 'codigo' && next.length === 13) {
      void buscar(next);
    }
  };

  return (
    <div className="fcab-wrap">
      <div className="fcab-head">
        <div>
          <div className="fcab-title">Consulta CABYS</div>
          <div className="fcab-sub">Consulta por codigo o por descripcion desde el catalogo CABYS y valida la tarifa IVA asociada.</div>
        </div>
        <div className="fcab-badge">CIA {String(empresaId).padStart(3, '0')}</div>
      </div>

      <div className="fcab-card">
        <div className="fcab-toolbar">
          <div className="fcab-toggle">
            <button
              type="button"
              className={modo === 'texto' ? 'is-active' : ''}
              onClick={() => {
                setModo('texto');
                setQuery('');
                setItems([]);
                setSelected(null);
                setError('');
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
            >
              Buscar por texto
            </button>
            <button
              type="button"
              className={modo === 'codigo' ? 'is-active' : ''}
              onClick={() => {
                setModo('codigo');
                setQuery('');
                setItems([]);
                setSelected(null);
                setError('');
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
            >
              Buscar por codigo
            </button>
          </div>

          <form className="fcab-search" onSubmit={onSubmit}>
            <input
              ref={inputRef}
              value={query}
              autoFocus
              onChange={(e) => handleChange(e.target.value)}
              placeholder={modo === 'codigo' ? '13 digitos CABYS' : 'Escriba codigo o descripcion'}
            />
            <button type="submit" disabled={busy || !query.trim() || (modo === 'codigo' && query.trim().length !== 13)}>
              {busy ? 'Buscando...' : 'Buscar'}
            </button>
          </form>
        </div>

        {error ? <div className="fcab-msg fcab-err">{error}</div> : null}
        {!error && items.length > 0 ? (
          <div className="fcab-msg fcab-ok">
            {totalApi && totalApi > items.length
              ? `${items.length} resultados visibles de ${totalApi}.`
              : `${items.length} resultado(s) encontrados.`}
          </div>
        ) : null}

        <div className="fcab-grid">
          <div className="fcab-table-wrap">
            <table className="fcab-table">
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Descripcion</th>
                  <th>Tipo</th>
                  <th>IVA</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.length ? visibleItems.map((item) => {
                  const active = selected?.codigo === item.codigo;
                  const tipo = getCabysTipo(item);
                  return (
                    <tr
                      key={item.codigo}
                      className={active ? 'is-active' : ''}
                      onClick={() => setSelected(item)}
                    >
                      <td className="mono">{item.codigo}</td>
                      <td className="fcab-desc">{item.descripcion}</td>
                      <td>
                        {tipo ? (
                          <span className={`fcab-tipo ${tipo === 'servicio' ? 'tipo-servicio' : 'tipo-mercancia'}`}>
                            {tipo === 'servicio' ? 'Servicio' : 'Mercancia'}
                          </span>
                        ) : <span className="fcab-tipo tipo-neutro">-</span>}
                      </td>
                      <td>
                        <span className={`fcab-iva iva-${item.impuesto === 13 ? 'full' : item.impuesto === 0 ? 'zero' : 'mid'}`}>
                          {item.impuesto}%
                        </span>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={4} className="fcab-empty">
                      {busy ? 'Consultando catalogo CABYS...' : 'No hay resultados para mostrar.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="fcab-side">
            <div className="fcab-side-title">Detalle CABYS</div>
            {selected ? (
              <>
                <div className="fcab-side-box">
                  <label>Codigo</label>
                  <div className="mono">{selected.codigo}</div>
                </div>
                <div className="fcab-side-box">
                  <label>Descripcion</label>
                  <div>{selected.descripcion}</div>
                </div>
                <div className="fcab-side-box">
                  <label>Tipo CABYS</label>
                  <div>
                    {getCabysTipo(selected) === 'servicio'
                      ? 'Servicio'
                      : getCabysTipo(selected) === 'mercancia'
                        ? 'Mercancia'
                        : '-'}
                  </div>
                </div>
                <div className="fcab-side-box">
                  <label>Tarifa IVA</label>
                  <div>{selected.impuesto}%</div>
                </div>
                {selected.categorias && selected.categorias.length ? (
                  <div className="fcab-side-box">
                    <label>Categorias</label>
                    <div className="fcab-cats">
                      {selected.categorias.map((cat, idx) => (
                        <span key={`${selected.codigo}-${idx}`}>{cat}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="fcab-side-empty">Seleccione un registro para ver el detalle.</div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .fcab-wrap { display:flex; flex-direction:column; gap:18px; }
        .fcab-head {
          display:flex; align-items:flex-start; justify-content:space-between; gap:16px;
          padding:24px 28px; background:linear-gradient(180deg, rgba(56,189,248,.16), rgba(56,189,248,.06));
          border:1px solid var(--card-border); border-radius:22px;
        }
        .fcab-title { font-size:24px; font-weight:800; color:var(--card-text); letter-spacing:.01em; }
        .fcab-sub { margin-top:8px; color:var(--gray-400); max-width:820px; }
        .fcab-badge {
          padding:10px 14px; border-radius:999px; border:1px solid rgba(56,189,248,.25);
          background:rgba(56,189,248,.12); color:var(--green-main); font-weight:700; white-space:nowrap;
        }
        .fcab-card {
          display:flex; flex-direction:column; gap:18px; padding:22px 24px;
          background:var(--card-bg); border:1px solid var(--card-border); border-radius:22px;
        }
        .fcab-toolbar { display:flex; flex-wrap:wrap; gap:16px; align-items:center; justify-content:space-between; }
        .fcab-toggle {
          display:inline-flex; border:1px solid var(--card-border); border-radius:14px; overflow:hidden; background:var(--bg-dark);
        }
        .fcab-toggle button {
          border:0; background:transparent; color:var(--gray-400); padding:12px 16px; font-weight:700; cursor:pointer;
        }
        .fcab-toggle button.is-active { background:rgba(56,189,248,.16); color:var(--card-text); }
        .fcab-search { display:flex; gap:12px; flex:1; min-width:320px; }
        .fcab-search input {
          flex:1; min-width:220px; background:var(--bg-dark); color:var(--card-text);
          border:1px solid var(--card-border); border-radius:14px; padding:14px 16px; outline:none;
        }
        .fcab-search input:focus { border-color:var(--green-main); box-shadow:0 0 0 1px rgba(56,189,248,.2); }
        .fcab-search button {
          border:1px solid rgba(56,189,248,.35); background:rgba(56,189,248,.16); color:var(--card-text);
          border-radius:14px; padding:14px 18px; font-weight:800; cursor:pointer;
        }
        .fcab-search button:disabled { opacity:.45; cursor:not-allowed; }
        .fcab-msg { padding:12px 14px; border-radius:14px; font-size:14px; }
        .fcab-ok { background:rgba(34,197,94,.12); border:1px solid rgba(34,197,94,.24); color:#86efac; }
        .fcab-err { background:rgba(239,68,68,.12); border:1px solid rgba(239,68,68,.24); color:#fca5a5; }
        .fcab-grid { display:grid; grid-template-columns:minmax(0, 1.25fr) minmax(300px, .75fr); gap:18px; }
        .fcab-table-wrap {
          overflow:auto; border:1px solid var(--card-border); border-radius:18px; background:rgba(255,255,255,.01);
        }
        .fcab-table { width:100%; border-collapse:collapse; min-width:860px; }
        .fcab-table th, .fcab-table td { padding:14px 16px; border-bottom:1px solid rgba(148,163,184,.14); text-align:left; }
        .fcab-table th { color:var(--green-main); font-size:13px; letter-spacing:.08em; text-transform:uppercase; background:rgba(15,23,42,.45); }
        .fcab-table tbody tr { cursor:pointer; }
        .fcab-table tbody tr:hover { background:rgba(56,189,248,.06); }
        .fcab-table tbody tr.is-active { background:rgba(56,189,248,.12); }
        .fcab-table td { color:var(--gray-200); }
        .fcab-table .mono { font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight:700; color:var(--card-text); }
        .fcab-desc { color:var(--card-text); font-weight:600; }
        .fcab-tipo {
          display:inline-flex; align-items:center; justify-content:center; min-width:94px;
          padding:4px 10px; border-radius:999px; font-weight:800; font-size:12px;
        }
        .fcab-tipo.tipo-servicio { background:rgba(249,115,22,.14); border:1px solid rgba(249,115,22,.24); color:#fdba74; }
        .fcab-tipo.tipo-mercancia { background:rgba(56,189,248,.12); border:1px solid rgba(56,189,248,.22); color:#93c5fd; }
        .fcab-tipo.tipo-neutro { background:rgba(148,163,184,.12); border:1px solid rgba(148,163,184,.18); color:var(--gray-400); }
        .fcab-iva { display:inline-flex; align-items:center; justify-content:center; min-width:52px; padding:4px 10px; border-radius:999px; font-weight:800; }
        .fcab-iva.iva-full { background:rgba(34,197,94,.16); border:1px solid rgba(34,197,94,.25); color:#86efac; }
        .fcab-iva.iva-zero { background:rgba(148,163,184,.12); border:1px solid rgba(148,163,184,.2); color:var(--gray-400); }
        .fcab-iva.iva-mid { background:rgba(249,115,22,.14); border:1px solid rgba(249,115,22,.24); color:#fdba74; }
        .fcab-empty { text-align:center; color:var(--gray-400); }
        .fcab-side {
          display:flex; flex-direction:column; gap:12px; padding:18px;
          border:1px solid var(--card-border); border-radius:18px; background:rgba(255,255,255,.02);
        }
        .fcab-side-title { font-size:16px; font-weight:800; color:var(--card-text); }
        .fcab-side-box {
          display:flex; flex-direction:column; gap:8px; padding:14px 16px;
          border:1px solid rgba(148,163,184,.16); border-radius:14px; background:var(--bg-dark);
          color:var(--card-text);
        }
        .fcab-side-box label { color:var(--green-main); font-size:12px; letter-spacing:.08em; text-transform:uppercase; font-weight:800; }
        .fcab-cats { display:flex; flex-wrap:wrap; gap:8px; }
        .fcab-cats span {
          padding:6px 10px; border-radius:999px; background:rgba(56,189,248,.08); border:1px solid rgba(56,189,248,.16); color:var(--gray-200); font-size:12px;
        }
        .fcab-side-empty {
          min-height:220px; display:flex; align-items:center; justify-content:center; text-align:center;
          color:var(--gray-400); border:1px dashed rgba(148,163,184,.22); border-radius:14px; padding:18px;
        }
        @media (max-width: 1100px) {
          .fcab-grid { grid-template-columns:1fr; }
          .fcab-search { min-width:100%; }
        }
      `}</style>
    </div>
  );
}
