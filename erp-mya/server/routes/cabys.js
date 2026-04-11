// ─── GET /api/cabys?q=<texto>  ó  ?codigo=<codigo> ───────────────────────────
// Proxy hacia https://api.hacienda.go.cr/fe/cabys
// Normaliza ambas formas de respuesta a un array uniforme.

export async function buscarCabys(req, res) {
  const { q, codigo } = req.query;
  if (!q && !codigo)
    return res.status(400).json({ ok: false, error: 'Se requiere ?q= o ?codigo=' });

  const url = codigo
    ? `https://api.hacienda.go.cr/fe/cabys?codigo=${encodeURIComponent(codigo)}`
    : `https://api.hacienda.go.cr/fe/cabys?q=${encodeURIComponent(q)}`;

  try {
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    });
    if (!resp.ok) return res.status(502).json({ ok: false, error: `Hacienda respondió ${resp.status}` });

    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { return res.status(502).json({ ok: false, error: 'Respuesta inválida de Hacienda', raw: text.slice(0, 200) }); }

    // Formatos confirmados de la API Hacienda:
    //   ?codigo= → array directo:   [{codigo, descripcion, impuesto, categorias:[...], uri}]
    //   ?q=      → objeto paginado: { total, cantidad, cabys:[{...mismo formato...}] }
    let raw = [];
    if (Array.isArray(json)) {
      raw = json;                          // ?codigo=
    } else if (Array.isArray(json.cabys)) {
      raw = json.cabys;                    // ?q=
    } else if (Array.isArray(json.array)) {
      raw = json.array;
    } else if (json.codigo) {
      raw = [json];
    }
    const items = raw.map(it => normalizar(it));

    res.json({ ok: true, total: json.total ?? items.length, cantidad: json.cantidad, items });
  } catch (err) {
    console.error('[cabys]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}

function normalizar(it) {
  return {
    codigo:      it._codigo      || it.codigo      || '',
    descripcion: it._descripcion || it.descripcion || '',
    impuesto:    Number(it._impuesto ?? it.impuesto ?? 0),
    uri:         it._uri         || it.uri         || '',
    categorias:  (it._categorias?.array || it.categorias || []).filter(Boolean),
  };
}
