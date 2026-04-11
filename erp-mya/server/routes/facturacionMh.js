export async function consultarExoneracionMh(req, res) {
  const autorizacion = String(req.query.autorizacion || '').trim();
  if (!autorizacion) {
    return res.status(400).json({ ok: false, error: 'Se requiere ?autorizacion=' });
  }

  try {
    const exResp = await fetch(`https://api.hacienda.go.cr/fe/ex?autorizacion=${encodeURIComponent(autorizacion)}`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    });

    if (!exResp.ok) {
      return res.status(exResp.status === 404 ? 404 : 502).json({
        ok: false,
        error: exResp.status === 404
          ? 'La exoneracion no existe en la base de Tributacion.'
          : `Hacienda respondio ${exResp.status} al consultar la exoneracion.`,
      });
    }

    const exJson = await exResp.json();
    const identificacion = String(exJson?._identificacion || exJson?.identificacion || '').trim();
    let contribuyente = null;

    if (identificacion) {
      try {
        const aeResp = await fetch(`https://api.hacienda.go.cr/fe/ae?identificacion=${encodeURIComponent(identificacion)}`, {
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        });
        if (aeResp.ok) {
          contribuyente = await aeResp.json();
        }
      } catch {
        // Si la segunda consulta falla, devolvemos igual la exoneracion.
      }
    }

    return res.json({ ok: true, exoneracion: exJson, contribuyente });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: String(err?.message || 'No se pudo consultar Hacienda.'),
    });
  }
}
