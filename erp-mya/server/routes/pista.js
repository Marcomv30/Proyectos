// ============================================================
// MYA — Pista PWA
// Página móvil para selección manual de pistero por bomba.
//
// Rutas:
//   GET  /pista?e=4&p=3&k=TOKEN        → HTML page (QR link)
//   GET  /api/pista/pisteros?e=4&k=TOKEN → lista de pisteros activos
//   POST /api/pista/tap                 → registra sesión
// ============================================================

import express from 'express'
import QRCode from 'qrcode'
import { adminSb } from '../lib/authz.js'
import { sesionesActivas } from '../services/virMonitor.js'

// ── Página (montada en /pista) ────────────────────────────────
export const pistaPageRouter = express.Router()

// ── API     (montada en /api/pista) ──────────────────────────
export const pistaApiRouter  = express.Router()

let _broadcast = null
export function setPistaBroadcast(fn) { _broadcast = fn }

// ── Auth helper ───────────────────────────────────────────────
function checkToken(k) {
  const secret = process.env.AGENT_SECRET || ''
  return !!secret && k === secret
}

// ─────────────────────────────────────────────────────────────
// GET /pista?e=4&p=3&k=TOKEN → HTML PWA
// ─────────────────────────────────────────────────────────────
pistaPageRouter.get('/', (req, res) => {
  const { e, p, k } = req.query
  if (!e || !p || !checkToken(k)) {
    return res.status(401).send(
      '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;background:#0f172a;color:#f1f5f9">' +
      '<h2>URL inválida</h2><p>Escanee el código QR en la bomba correspondiente.</p></body></html>'
    )
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(buildHtml(e, p, k))
})

// ─────────────────────────────────────────────────────────────
// GET /api/pista/qr?e=4&p=3&k=TOKEN&host=http://192.168.1.100:3001
// Devuelve SVG del código QR para imprimir en la bomba
// ─────────────────────────────────────────────────────────────
pistaApiRouter.get('/qr', async (req, res) => {
  const { e, p, k, host } = req.query
  if (!e || !p || !checkToken(k))
    return res.status(401).json({ error: 'No autorizado' })

  const serverBase = host || `http://localhost:${process.env.PORT || 3001}`
  const url = `${serverBase}/pista?e=${encodeURIComponent(e)}&p=${encodeURIComponent(p)}&k=${encodeURIComponent(k)}`

  try {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 2, width: 256 })
    res.setHeader('Content-Type', 'image/svg+xml')
    res.send(svg)
  } catch (err) {
    res.status(500).json({ error: 'Error generando QR' })
  }
})

// ─────────────────────────────────────────────────────────────
// GET /api/pista/pisteros?e=4&k=TOKEN
// Usa comb_brazaletes — catálogo principal de pisteros en ERP
// ─────────────────────────────────────────────────────────────
pistaApiRouter.get('/pisteros', async (req, res) => {
  const { e: empresa_id, k } = req.query
  if (!empresa_id || !checkToken(k))
    return res.status(401).json({ error: 'No autorizado' })

  const { data, error } = await adminSb()
    .from('comb_dispositivos_identidad')
    .select('id, operador_nombre, alias, attendant_id')
    .eq('empresa_id', Number(empresa_id))
    .order('operador_nombre')

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true, pisteros: data || [] })
})

// ─────────────────────────────────────────────────────────────
// POST /api/pista/tap
// Body: { empresa_id, pump_id, operador_nombre, attendant_id }
// El cliente ya tiene los datos de la lista — no se hace lookup extra
// Auth: Authorization: Agent TOKEN
// ─────────────────────────────────────────────────────────────
pistaApiRouter.post('/tap', async (req, res) => {
  const authHeader = req.headers.authorization || ''
  const k = authHeader.startsWith('Agent ') ? authHeader.slice(6) : ''
  if (!checkToken(k))
    return res.status(401).json({ error: 'No autorizado' })

  const { empresa_id, pump_id, operador_nombre, attendant_id } = req.body
  if (!empresa_id || !pump_id || !operador_nombre)
    return res.status(400).json({ error: 'empresa_id, pump_id y operador_nombre requeridos' })

  const nombre = String(operador_nombre).trim()

  sesionesActivas[Number(pump_id)] = {
    id              : null,
    pump_id         : Number(pump_id),
    attendant_id    : attendant_id || null,
    operador_nombre : nombre,
    inicio_at       : new Date().toISOString(),
    origen          : 'pwa',
  }

  if (_broadcast) _broadcast(Number(empresa_id), 'pistero_asignado', {
    pump_id        : Number(pump_id),
    operador_nombre: nombre,
    attendant_id   : attendant_id || null,
    origen         : 'pwa',
  })

  console.log(`[PWA Pista] ${nombre} → Bomba ${pump_id}`)
  res.json({ ok: true, operador_nombre: nombre })
})

// ─────────────────────────────────────────────────────────────
// HTML PWA (self-contained, sin dependencias externas)
// ─────────────────────────────────────────────────────────────
function buildHtml(e, p, k) {
  // Usamos JSON.stringify para incrustar los valores de forma segura en JS
  const eJ = JSON.stringify(String(e))
  const pJ = JSON.stringify(String(p))
  const kJ = JSON.stringify(String(k))

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#0f172a">
<title>MYA · Bomba ${p}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f172a;--surface:#1e293b;--border:#334155;
  --text:#f1f5f9;--sub:#94a3b8;--accent:#f59e0b;
  --success:#10b981;--danger:#ef4444;
}
html,body{height:100%;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,sans-serif}
#root{display:flex;flex-direction:column;min-height:100vh}

/* Header */
header{
  background:var(--surface);border-bottom:1px solid var(--border);
  padding:14px 18px;display:flex;align-items:center;gap:12px;
  position:sticky;top:0;z-index:10;
}
.pump-badge{
  background:var(--accent);color:#000;font-weight:900;font-size:22px;
  width:50px;height:50px;border-radius:14px;
  display:flex;align-items:center;justify-content:center;flex-shrink:0;
}
.hdr-text h1{font-size:17px;font-weight:700;line-height:1.2}
.hdr-text p{font-size:12px;color:var(--sub)}

/* Screens */
.screen{display:none;flex:1;flex-direction:column}
.screen.active{display:flex}

/* Loading */
#s-loading{align-items:center;justify-content:center;gap:14px;color:var(--sub);font-size:14px}
.spinner{width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* List */
#s-list{overflow-y:auto}
#s-list .inner{padding:14px 16px;display:flex;flex-direction:column;gap:8px}
.section-lbl{font-size:11px;font-weight:600;color:var(--sub);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
.pistero-btn{
  width:100%;min-height:70px;background:var(--surface);border:1px solid var(--border);
  border-radius:14px;color:var(--text);font-size:17px;font-weight:600;
  padding:14px 18px;text-align:left;cursor:pointer;
  display:flex;align-items:center;gap:14px;
  transition:background .12s,border-color .12s,transform .08s;
  -webkit-tap-highlight-color:transparent;
}
.pistero-btn:active{transform:scale(.97);background:#263348;border-color:#4b6a9a}
.avatar{
  width:42px;height:42px;background:#1d3557;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-size:17px;font-weight:800;color:#93c5fd;flex-shrink:0;
}
.no-data{color:var(--sub);font-size:14px;padding:24px 0;text-align:center}

/* OK */
#s-ok{align-items:center;justify-content:center;padding:40px 24px;text-align:center;gap:0}
.check-ring{
  width:92px;height:92px;background:var(--success);border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  margin-bottom:22px;animation:pop .3s ease both;
}
@keyframes pop{0%{transform:scale(.5);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
#s-ok h2{font-size:26px;font-weight:800;margin-bottom:6px}
#s-ok .sub{font-size:14px;color:var(--sub);margin-bottom:28px}
#s-ok .cd{font-size:13px;color:var(--sub);background:var(--surface);border-radius:8px;padding:8px 18px}

/* Known pistero */
#s-known{align-items:center;justify-content:center;padding:32px 24px}
.known-inner{display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;max-width:320px}
.known-avatar{width:80px;height:80px;border-radius:50%;background:#1d3557;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:900;color:#93c5fd;border:3px solid #2d4a7a}
.known-lbl{font-size:13px;color:var(--sub);margin:0}
.known-name{font-size:26px;font-weight:800;margin:0;text-align:center}
.btn-primary{width:100%;padding:16px;border-radius:14px;border:none;background:var(--success);color:#fff;font-size:17px;font-weight:700;cursor:pointer;margin-top:8px;-webkit-tap-highlight-color:transparent;transition:opacity .15s}
.btn-primary:active{opacity:.85}
.btn-ghost{width:100%;padding:12px;border-radius:14px;border:1px solid var(--border);background:transparent;color:var(--sub);font-size:14px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.btn-ghost:active{color:var(--text)}

/* Error */
#s-error{align-items:center;justify-content:center;padding:40px 24px;text-align:center;gap:14px}
#s-error .err-txt{color:#f87171;font-size:15px;max-width:280px}
.retry-btn{
  padding:12px 28px;background:var(--surface);border:1px solid var(--border);
  border-radius:10px;color:var(--text);font-size:15px;cursor:pointer;
  -webkit-tap-highlight-color:transparent;
}
</style>
</head>
<body>
<div id="root">
  <header>
    <div class="pump-badge">${p}</div>
    <div class="hdr-text">
      <h1>MYA · Pista</h1>
      <p id="hdr-sub">Seleccione su nombre</p>
    </div>
  </header>

  <div id="s-loading" class="screen active">
    <div class="spinner"></div>
    <span>Cargando…</span>
  </div>

  <!-- Pantalla: celular conocido → "¿Eres X?" -->
  <div id="s-known" class="screen">
    <div class="known-inner">
      <div class="known-avatar" id="kn-avatar">?</div>
      <p class="known-lbl">¿Eres tú?</p>
      <h2 class="known-name" id="kn-name">—</h2>
      <button class="btn-primary" id="kn-yes">Soy yo — Bomba ${p}</button>
      <button class="btn-ghost" id="kn-change">No soy yo / Cambiar</button>
    </div>
  </div>

  <!-- Pantalla: lista completa -->
  <div id="s-list" class="screen">
    <div class="inner">
      <div class="section-lbl">¿Quién atiende la bomba ${p}?</div>
      <div id="list-items"></div>
    </div>
  </div>

  <!-- Pantalla: confirmación OK -->
  <div id="s-ok" class="screen">
    <div class="check-ring">
      <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
    <h2 id="ok-name">—</h2>
    <p class="sub">Registrado · Bomba ${p}</p>
    <div class="cd" id="ok-cd">Vuelve al inicio en 8s…</div>
  </div>

  <!-- Pantalla: error -->
  <div id="s-error" class="screen">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
    <div class="err-txt" id="err-msg">Error de conexión</div>
    <button class="retry-btn" id="retry-btn">Reintentar</button>
  </div>
</div>

<script>
(function(){
  var E=${eJ}, P=${pJ}, K=${kJ}
  var BASE=window.location.origin
  var STORE_KEY='mya_pistero_v1'
  var pisteros=[]
  var cdTimer=null

  var SCREENS=['s-loading','s-known','s-list','s-ok','s-error']
  function show(id){
    for(var i=0;i<SCREENS.length;i++){
      document.getElementById(SCREENS[i]).className='screen'+(SCREENS[i]===id?' active':'')
    }
  }

  function esc(s){
    return String(s||'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
  }
  function initial(s){ return (s||'?').trim().charAt(0).toUpperCase() }

  // ── localStorage helpers ─────────────────────────────────
  function getSaved(){
    try{ return JSON.parse(localStorage.getItem(STORE_KEY)||'null') }catch(e){ return null }
  }
  function save(nombre, attendantId){
    try{ localStorage.setItem(STORE_KEY, JSON.stringify({nombre:nombre, attendant_id:attendantId||null})) }catch(e){}
  }
  function clearSaved(){
    try{ localStorage.removeItem(STORE_KEY) }catch(e){}
  }

  // ── Inicio ───────────────────────────────────────────────
  function init(){
    var saved=getSaved()
    if(saved && saved.nombre){
      // Celular conocido — mostrar pantalla "¿Eres tú?"
      document.getElementById('kn-avatar').textContent=initial(saved.nombre)
      document.getElementById('kn-name').textContent=saved.nombre
      show('s-known')
    } else {
      loadList()
    }
  }

  function loadList(){
    show('s-loading')
    fetch(BASE+'/api/pista/pisteros?e='+encodeURIComponent(E)+'&k='+encodeURIComponent(K))
      .then(function(r){ return r.json() })
      .then(function(data){
        if(!data.ok) throw new Error(data.error||'Error')
        pisteros=data.pisteros||[]
        renderList()
        show('s-list')
      })
      .catch(function(){
        document.getElementById('err-msg').textContent='No se pudo cargar la lista. Verifique la conexión.'
        show('s-error')
      })
  }

  function renderList(){
    var el=document.getElementById('list-items')
    if(!pisteros.length){
      el.innerHTML='<div class="no-data">Sin pisteros activos registrados.</div>'
      return
    }
    var html=''
    for(var i=0;i<pisteros.length;i++){
      var p=pisteros[i]
      var nombre=esc(p.operador_nombre||p.alias||'Sin nombre')
      var ini=initial(p.operador_nombre||p.alias)
      html+='<button class="pistero-btn" data-nombre="'+nombre+'" data-aid="'+esc(p.attendant_id||'')+'">'+
              '<div class="avatar">'+ini+'</div>'+
              '<span>'+nombre+'</span>'+
            '</button>'
    }
    el.innerHTML=html
    el.querySelectorAll('.pistero-btn').forEach(function(btn){
      btn.addEventListener('click',function(){ tap(btn.dataset.nombre, btn.dataset.aid) })
    })
  }

  // ── Tap (registrar sesión) ───────────────────────────────
  function tap(nombre, attendantId){
    show('s-loading')
    fetch(BASE+'/api/pista/tap',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Agent '+K},
      body:JSON.stringify({empresa_id:Number(E),pump_id:Number(P),operador_nombre:nombre,attendant_id:attendantId||null})
    })
    .then(function(r){ return r.json() })
    .then(function(data){
      if(!data.ok) throw new Error(data.error||'No se pudo registrar')
      save(nombre, attendantId)
      showOk(data.operador_nombre||nombre||'Pistero')
    })
    .catch(function(err){
      document.getElementById('err-msg').textContent=err.message||'Error de conexión'
      show('s-error')
    })
  }

  function showOk(nombre){
    document.getElementById('ok-name').textContent=nombre
    show('s-ok')
    var secs=8
    var cdEl=document.getElementById('ok-cd')
    cdEl.textContent='Vuelve al inicio en '+secs+'s\u2026'
    clearInterval(cdTimer)
    cdTimer=setInterval(function(){
      secs--
      cdEl.textContent='Vuelve al inicio en '+secs+'s\u2026'
      if(secs<=0){ clearInterval(cdTimer); show('s-known') }
    },1000)
  }

  // ── Eventos ──────────────────────────────────────────────
  document.getElementById('kn-yes').addEventListener('click', function(){
    var saved=getSaved()
    if(saved) tap(saved.nombre, saved.attendant_id)
  })
  document.getElementById('kn-change').addEventListener('click', function(){
    clearSaved()
    loadList()
  })
  document.getElementById('retry-btn').addEventListener('click', init)

  init()
})()
</script>
</body>
</html>`
}
