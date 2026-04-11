// ============================================================
// MYA ERP — Configuración Fusion (solo Superusuario)
// CRUD de parámetros de conexión SSH + PostgreSQL por empresa
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import OverlayPortal from '../../components/OverlayPortal'

interface GradoRow {
  grade_id: number
  nombre: string | null
  codigo_cabys: string | null
  tarifa_iva_porcentaje: number | null
  tarifa_iva_codigo: string | null
}

const TARIFA_OPTIONS = [
  { value: '10', label: '0% — Exento', pct: 0 },
  { value: '04', label: '1% — Reducida 1%', pct: 1 },
  { value: '05', label: '2% — Reducida 2%', pct: 2 },
  { value: '06', label: '4% — Reducida 4%', pct: 4 },
  { value: '07', label: '8% — Reducida 8%', pct: 8 },
  { value: '08', label: '13% — General', pct: 13 },
]

interface FusionConfig {
  id?: number
  empresa_id: number
  ssh_host: string
  ssh_port: number
  ssh_user: string
  ssh_pass: string
  pg_db: string
  pg_user: string
  pg_pass: string
  tunnel_port: number
  api_url: string
  poll_interval_ms: number
  cant_registros: number
  tcp_host: string
  tcp_port: number | null
  activo: boolean
  active_tunnel_port?: number | null
  instancia_activa?: boolean
  instancia_saludable?: boolean
  sync_estado?: string
  ultima_sync?: string | null
  ultimo_error_sync?: string | null
  actualizado_at?: string
}

interface Empresa {
  id: number
  codigo: string
  nombre: string
}

const API = process.env.REACT_APP_API_URL || ''

const DEFAULTS: Omit<FusionConfig, 'empresa_id'> = {
  ssh_host: '', ssh_port: 22, ssh_user: '', ssh_pass: '',
  pg_db: '', pg_user: '', pg_pass: '',
  tunnel_port: 15432, api_url: '', poll_interval_ms: 15000,
  cant_registros: 500, tcp_host: '', tcp_port: null, activo: true,
}

interface Props {
  empresaId: number
}

async function getAuthHeaders(extra: Record<string, string> = {}) {
  const { supabase } = await import('../../supabase')
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export default function FusionConfigPage({ empresaId }: Props) {
  const [configs, setConfigs]         = useState<FusionConfig[]>([])
  const [empresas, setEmpresas]       = useState<Empresa[]>([])
  const [editando, setEditando]       = useState<FusionConfig | null>(null)
  const [esNuevo, setEsNuevo]         = useState(false)
  const [loading, setLoading]         = useState(false)
  const [probando, setProbando]       = useState(false)
  const [resultadoTest, setResultadoTest] = useState<{ ok: boolean; mensaje?: string; error?: string } | null>(null)
  const [errGlobal, setErrGlobal]     = useState('')
  const [confirmEliminar, setConfirmEliminar] = useState<number | null>(null)
  const [grados, setGrados]               = useState<GradoRow[]>([])
  const [gradosEdit, setGradosEdit]       = useState<Record<number, Partial<GradoRow>>>({})
  const [gradosSaving, setGradosSaving]   = useState(false)
  const [gradosMsg, setGradosMsg]         = useState<{ ok: boolean; text: string } | null>(null)

  // ── Cargar empresas de Supabase ────────────────────────────
  useEffect(() => {
    import('../../supabase').then(({ supabase }) => {
      supabase.from('empresas').select('id,codigo,nombre').eq('activo', true).order('codigo')
        .then(({ data }) => { if (data) setEmpresas(data) })
    })
  }, [])

  // ── Cargar configs ─────────────────────────────────────────
  const cargarConfigs = useCallback(async () => {
    setLoading(true)
    setErrGlobal('')
    try {
      const resp = await fetch(`${API}/api/combustible/config`, {
        headers: await getAuthHeaders(),
      })
      if (!resp.ok) throw new Error(await resp.text())
      setConfigs(await resp.json())
    } catch (e: any) {
      setErrGlobal('Error cargando configuraciones: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargarConfigs() }, [cargarConfigs])

  // ── Abrir formulario ───────────────────────────────────────
  const abrirNuevo = () => {
    setEditando({ ...DEFAULTS, empresa_id: 0 })
    setEsNuevo(true)
    setResultadoTest(null)
  }

  const abrirEditar = async (cfg: FusionConfig) => {
    try {
      const resp = await fetch(`${API}/api/combustible/config/${cfg.empresa_id}`, {
        headers: await getAuthHeaders(),
      })
      if (!resp.ok) throw new Error(await resp.text())
      setEditando(await resp.json())
      setEsNuevo(false)
      setResultadoTest(null)
    } catch (e: any) {
      setErrGlobal('Error cargando config: ' + e.message)
    }
  }

  // ── Guardar ────────────────────────────────────────────────
  const guardar = async () => {
    if (!editando) return
    setLoading(true)
    setErrGlobal('')
    try {
      const url    = esNuevo
        ? `${API}/api/combustible/config`
        : `${API}/api/combustible/config/${editando.empresa_id}`
      const method = esNuevo ? 'POST' : 'PUT'
      const resp   = await fetch(url, {
        method,
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(editando),
      })
      const json = await resp.json()
      if (!resp.ok || json.error) throw new Error(json.error || 'Error al guardar')
      setEditando(null)
      await cargarConfigs()
    } catch (e: any) {
      setErrGlobal(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Eliminar ───────────────────────────────────────────────
  const eliminar = async (eid: number) => {
    setLoading(true)
    try {
      const resp = await fetch(`${API}/api/combustible/config/${eid}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
      })
      if (!resp.ok) throw new Error(await resp.text())
      setConfirmEliminar(null)
      await cargarConfigs()
    } catch (e: any) {
      setErrGlobal('Error al eliminar: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Reiniciar instancia ────────────────────────────────────
  const reiniciar = async (eid: number) => {
    try {
      const resp = await fetch(`${API}/api/combustible/config/${eid}/reiniciar`, {
        method: 'POST',
        headers: await getAuthHeaders(),
      })
      const json = await resp.json()
      if (!json.ok) throw new Error(json.error)
      await cargarConfigs()
    } catch (e: any) {
      setErrGlobal('Error al reiniciar: ' + e.message)
    }
  }

  // ── Probar conexión ────────────────────────────────────────
  const probarConexion = async () => {
    if (!editando) return
    setProbando(true)
    setResultadoTest(null)
    try {
      const resp = await fetch(`${API}/api/combustible/config/probar`, {
        method: 'POST',
        headers: await getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ssh_host:    editando.ssh_host,
          ssh_port:    editando.ssh_port,
          ssh_user:    editando.ssh_user,
          ssh_pass:    editando.ssh_pass,
          pg_db:       editando.pg_db,
          pg_user:     editando.pg_user,
          pg_pass:     editando.pg_pass,
          tunnel_port: editando.tunnel_port,
        }),
      })
      const json = await resp.json()
      setResultadoTest(json)
    } catch (e: any) {
      setResultadoTest({ ok: false, error: e.message })
    } finally {
      setProbando(false)
    }
  }

  // ── Grados combustible ────────────────────────────────────
  const cargarGrados = useCallback(async () => {
    const { supabase } = await import('../../supabase')
    const { data } = await supabase
      .from('grados_combustible')
      .select('grade_id, nombre, codigo_cabys, tarifa_iva_porcentaje, tarifa_iva_codigo')
      .eq('empresa_id', empresaId)
      .order('grade_id')
    if (data) setGrados(data as GradoRow[])
  }, [empresaId])

  useEffect(() => { void cargarGrados() }, [cargarGrados])

  const setGradoField = (gradeId: number, field: keyof GradoRow, value: string | number | null) => {
    setGradosEdit(prev => ({
      ...prev,
      [gradeId]: { ...(prev[gradeId] || {}), [field]: value },
    }))
  }

  const guardarGrados = async () => {
    setGradosSaving(true)
    setGradosMsg(null)
    try {
      const { supabase } = await import('../../supabase')
      for (const [idStr, cambios] of Object.entries(gradosEdit)) {
        const gradeId = Number(idStr)
        if (!Object.keys(cambios).length) continue
        const { error } = await supabase
          .from('grados_combustible')
          .update(cambios)
          .eq('empresa_id', empresaId)
          .eq('grade_id', gradeId)
        if (error) throw new Error(`Grado ${gradeId}: ${error.message}`)
      }
      setGradosEdit({})
      await cargarGrados()
      setGradosMsg({ ok: true, text: 'Grados guardados correctamente.' })
    } catch (e: any) {
      setGradosMsg({ ok: false, text: e.message })
    } finally {
      setGradosSaving(false)
    }
  }

  const empresaNombre = (id: number) => {
    const e = empresas.find(x => x.id === id)
    return e ? `${e.codigo} — ${e.nombre}` : `Empresa ${id}`
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 font-mono">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-white">Conexiones Fusion</h1>
            <p className="text-gray-500 text-xs mt-0.5">Parámetros SSH + PostgreSQL por empresa · Solo superusuario</p>
          </div>
          <button
            onClick={abrirNuevo}
            className="px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-bold transition-colors"
          >
            + Nueva conexión
          </button>
        </div>

        {errGlobal && (
          <div className="mb-4 px-4 py-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-xs">
            {errGlobal}
          </div>
        )}

        {/* Tabla de configs */}
        {loading && !editando ? (
          <div className="text-gray-500 text-sm py-8 text-center">Cargando…</div>
        ) : configs.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <div className="text-4xl mb-3">🔌</div>
            <p className="text-sm">No hay configuraciones Fusion.</p>
            <p className="text-xs text-gray-700 mt-1">Agregue una para habilitar la sincronización.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {configs.map(cfg => (
              <div key={cfg.empresa_id}
                className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex items-center gap-4">
                {/* Estado */}
                <div className="flex-shrink-0">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                    cfg.instancia_activa ? 'bg-green-400' : 'bg-gray-600'
                  }`} style={{ boxShadow: cfg.instancia_activa ? '0 0 6px #4ade80' : 'none' }} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold text-sm">{empresaNombre(cfg.empresa_id)}</span>
                    {cfg.activo
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/50 text-green-400 border border-green-800">activo</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-500 border border-gray-700">inactivo</span>
                    }
                    {cfg.instancia_activa
                      ? <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          cfg.instancia_saludable
                            ? 'bg-blue-900/50 text-blue-400 border-blue-800'
                            : 'bg-amber-900/40 text-amber-300 border-amber-800'
                        }`}>{cfg.instancia_saludable ? 'sync corriendo' : 'sync degradado'}</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-600 border border-gray-700">sync detenido</span>
                    }
                  </div>
                  <div className="text-gray-400 text-xs mt-1 flex flex-wrap gap-3">
                    <span>SSH: {cfg.ssh_host}:{cfg.ssh_port}</span>
                    <span>DB: {cfg.pg_db}</span>
                    <span>Tunnel: :{cfg.active_tunnel_port || cfg.tunnel_port}</span>
                    <span>Poll: {cfg.poll_interval_ms / 1000}s</span>
                    {cfg.sync_estado && <span>Modo: {cfg.sync_estado}</span>}
                    {cfg.ultima_sync && <span>Ult. sync: {new Date(cfg.ultima_sync).toLocaleString('es-CR')}</span>}
                  </div>
                  {cfg.ultimo_error_sync && (
                    <div className="text-amber-400 text-xs mt-2">
                      Error sync: {cfg.ultimo_error_sync}
                    </div>
                  )}
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {cfg.activo && !cfg.instancia_activa && (
                    <button onClick={() => reiniciar(cfg.empresa_id)}
                      className="px-3 py-1.5 rounded-lg bg-blue-900/50 hover:bg-blue-800/70 text-blue-300 text-xs font-medium border border-blue-800 transition-colors">
                      ▶ Iniciar
                    </button>
                  )}
                  {cfg.instancia_activa && (
                    <button onClick={() => reiniciar(cfg.empresa_id)}
                      className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium border border-gray-600 transition-colors">
                      ↺ Reiniciar
                    </button>
                  )}
                  <button onClick={() => abrirEditar(cfg)}
                    className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium border border-gray-600 transition-colors">
                    Editar
                  </button>
                  {confirmEliminar === cfg.empresa_id ? (
                    <>
                      <button onClick={() => eliminar(cfg.empresa_id)}
                        className="px-3 py-1.5 rounded-lg bg-red-900 hover:bg-red-800 text-red-300 text-xs font-medium border border-red-700 transition-colors">
                        Confirmar
                      </button>
                      <button onClick={() => setConfirmEliminar(null)}
                        className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 text-xs font-medium border border-gray-600 transition-colors">
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmEliminar(cfg.empresa_id)}
                      className="px-3 py-1.5 rounded-lg bg-gray-900 hover:bg-red-900/40 text-gray-600 hover:text-red-400 text-xs font-medium border border-gray-700 hover:border-red-800 transition-colors">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal de edición */}
        {editando && (
          <OverlayPortal>
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999] p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold text-white mb-1">
                {esNuevo ? 'Nueva conexión Fusion' : 'Editar conexión Fusion'}
              </h2>
              <p className="text-gray-500 text-xs mb-5">
                {esNuevo ? 'Agregue una nueva empresa con acceso a Fusion.' : `Empresa ${empresaNombre(editando.empresa_id)}`}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Empresa (solo al crear) */}
                {esNuevo && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">Empresa *</label>
                    <select
                      value={editando.empresa_id || ''}
                      onChange={e => setEditando({ ...editando, empresa_id: Number(e.target.value) })}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="">— Seleccione empresa —</option>
                      {empresas
                        .filter(e => !configs.some(c => c.empresa_id === e.id))
                        .map(e => (
                          <option key={e.id} value={e.id}>{e.codigo} — {e.nombre}</option>
                        ))
                      }
                    </select>
                  </div>
                )}

                {/* SSH */}
                <FieldGroup title="Conexión SSH" cols={2}>
                  <Field label="Host SSH *" value={editando.ssh_host}
                    onChange={v => setEditando({ ...editando, ssh_host: v })} />
                  <Field label="Puerto SSH" value={String(editando.ssh_port)}
                    onChange={v => setEditando({ ...editando, ssh_port: Number(v) })} type="number" />
                  <Field label="Usuario SSH *" value={editando.ssh_user}
                    onChange={v => setEditando({ ...editando, ssh_user: v })} />
                  <Field label="Contraseña SSH *" value={editando.ssh_pass}
                    onChange={v => setEditando({ ...editando, ssh_pass: v })} type="password"
                    hint="Dejelo en blanco para conservar la contrasena actual" />
                </FieldGroup>

                {/* PostgreSQL */}
                <FieldGroup title="Base de datos Fusion (PostgreSQL)" cols={2}>
                  <Field label="Base de datos *" value={editando.pg_db}
                    onChange={v => setEditando({ ...editando, pg_db: v })} />
                  <Field label="Puerto túnel local" value={String(editando.tunnel_port)}
                    onChange={v => setEditando({ ...editando, tunnel_port: Number(v) })} type="number"
                    hint="Debe ser único por empresa (p.ej. 15432, 15433…)" />
                  <Field label="Usuario PostgreSQL *" value={editando.pg_user}
                    onChange={v => setEditando({ ...editando, pg_user: v })} />
                  <Field label="Contraseña PostgreSQL *" value={editando.pg_pass}
                    onChange={v => setEditando({ ...editando, pg_pass: v })} type="password"
                    hint="Dejelo en blanco para conservar la contrasena actual" />
                </FieldGroup>

                {/* HTTP fallback */}
                <FieldGroup title="API HTTP (fallback opcional)" cols={2}>
                  <div className="sm:col-span-2">
                    <Field label="URL API Fusion" value={editando.api_url || ''}
                      onChange={v => setEditando({ ...editando, api_url: v })}
                      hint="Si SSH falla, se usa esta URL como respaldo" />
                  </div>
                </FieldGroup>

                {/* Sincronización */}
                <FieldGroup title="Parámetros de sincronización" cols={2}>
                  <Field label="Intervalo de polling (ms)" value={String(editando.poll_interval_ms)}
                    onChange={v => setEditando({ ...editando, poll_interval_ms: Number(v) })} type="number"
                    hint="Mínimo recomendado: 10000 (10s)" />
                  <Field label="Registros por ciclo" value={String(editando.cant_registros)}
                    onChange={v => setEditando({ ...editando, cant_registros: Number(v) })} type="number" />
                </FieldGroup>

                {/* Activo */}
                <div className="sm:col-span-2 flex items-center gap-3">
                  <input type="checkbox" id="activo" checked={editando.activo}
                    onChange={e => setEditando({ ...editando, activo: e.target.checked })}
                    className="w-4 h-4 rounded accent-green-500" />
                  <label htmlFor="activo" className="text-sm text-gray-300">
                    Sincronización activa
                  </label>
                </div>
              </div>

              {/* Resultado prueba */}
              {resultadoTest && (
                <div className={`mt-4 px-4 py-3 rounded-lg text-xs font-medium border ${
                  resultadoTest.ok
                    ? 'bg-green-900/40 border-green-700 text-green-300'
                    : 'bg-red-900/40 border-red-700 text-red-300'
                }`}>
                  {resultadoTest.ok
                    ? '✓ ' + (resultadoTest.mensaje || 'Conexión exitosa')
                    : '✗ ' + (resultadoTest.error || 'Fallo de conexión')
                  }
                </div>
              )}

              {/* Acciones del modal */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-800">
                <button
                  onClick={probarConexion}
                  disabled={probando || !editando.ssh_host || !editando.ssh_user}
                  className="px-4 py-2 rounded-lg bg-blue-900/50 hover:bg-blue-800/70 text-blue-300 text-xs font-bold border border-blue-800 transition-colors disabled:opacity-40"
                >
                  {probando ? 'Probando…' : '🔌 Probar conexión'}
                </button>
                <div className="flex gap-3">
                  <button onClick={() => setEditando(null)}
                    className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold border border-gray-600 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={guardar} disabled={loading}
                    className="px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-bold transition-colors disabled:opacity-40">
                    {loading ? 'Guardando…' : esNuevo ? 'Crear' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
          </OverlayPortal>
        )}

        {/* ── Grados de combustible ─────────────────────────── */}
        <div className="mt-10">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Grados de Combustible</h2>
              <p className="text-gray-500 text-xs mt-0.5">CABYS y tarifa IVA por grado · Aplica al generar lineas FE</p>
            </div>
            <button
              onClick={guardarGrados}
              disabled={gradosSaving || !Object.keys(gradosEdit).length}
              className="px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-bold transition-colors disabled:opacity-40"
            >
              {gradosSaving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>

          {gradosMsg && (
            <div className={`mb-3 px-4 py-2 rounded-lg text-xs font-medium border ${
              gradosMsg.ok
                ? 'bg-green-900/40 border-green-700 text-green-300'
                : 'bg-red-900/40 border-red-700 text-red-300'
            }`}>
              {gradosMsg.text}
            </div>
          )}

          {grados.length === 0 ? (
            <div className="text-gray-600 text-xs py-4 text-center">No hay grados registrados para esta empresa.</div>
          ) : (
            <div className="border border-gray-700 rounded-xl overflow-hidden">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(30,30,40,0.9)', borderBottom: '1px solid #374151' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', width: 60 }}>ID</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', width: 120 }}>Nombre</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Codigo CABYS (13 digitos)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', width: 220 }}>Tarifa IVA</th>
                  </tr>
                </thead>
                <tbody>
                  {grados.map((g, i) => {
                    const edits = gradosEdit[g.grade_id] || {}
                    const cabys = edits.codigo_cabys !== undefined ? (edits.codigo_cabys ?? '') : (g.codigo_cabys ?? '')
                    const tarifaCod = edits.tarifa_iva_codigo !== undefined ? (edits.tarifa_iva_codigo ?? '10') : (g.tarifa_iva_codigo ?? '10')
                    const dirty = !!gradosEdit[g.grade_id] && Object.keys(gradosEdit[g.grade_id]).length > 0
                    return (
                      <tr key={g.grade_id} style={{
                        borderTop: i === 0 ? 'none' : '1px solid #1f2937',
                        background: dirty ? 'rgba(234,179,8,0.06)' : 'transparent',
                      }}>
                        <td style={{ padding: '8px 12px', color: '#6b7280', fontFamily: 'monospace' }}>{g.grade_id}</td>
                        <td style={{ padding: '8px 12px', color: '#f8fafc', fontWeight: 600 }}>{g.nombre || `Grade ${g.grade_id}`}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <input
                            type="text"
                            value={String(cabys)}
                            maxLength={13}
                            placeholder="0000000000000"
                            onChange={e => setGradoField(g.grade_id, 'codigo_cabys', e.target.value)}
                            style={{
                              background: '#1f2937', border: '1px solid #374151', borderRadius: 6,
                              padding: '5px 8px', color: '#f8fafc', fontSize: 13, fontFamily: 'monospace',
                              width: 180, outline: 'none',
                            }}
                          />
                          {cabys && !/^\d{13}$/.test(String(cabys)) && (
                            <span style={{ color: '#f87171', fontSize: 11, marginLeft: 6 }}>Debe ser 13 digitos</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <select
                            value={String(tarifaCod)}
                            onChange={e => {
                              const opt = TARIFA_OPTIONS.find(o => o.value === e.target.value)
                              setGradoField(g.grade_id, 'tarifa_iva_codigo', e.target.value)
                              setGradoField(g.grade_id, 'tarifa_iva_porcentaje', opt?.pct ?? 0)
                            }}
                            style={{
                              background: '#1f2937', border: '1px solid #374151', borderRadius: 6,
                              padding: '5px 8px', color: '#f8fafc', fontSize: 13, outline: 'none', width: 200,
                            }}
                          >
                            {TARIFA_OPTIONS.map(o => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ─── Componentes auxiliares ────────────────────────────────────
function FieldGroup({ title, cols = 1, children }: {
  title: string; cols?: number; children: React.ReactNode
}) {
  return (
    <div className="sm:col-span-2">
      <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-2 border-b border-gray-800 pb-1">
        {title}
      </p>
      <div className={`grid grid-cols-1 ${cols === 2 ? 'sm:grid-cols-2' : ''} gap-3`}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', hint }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; hint?: string
}) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-gray-600"
      />
      {hint && <p className="text-gray-600 text-xs mt-1">{hint}</p>}
    </div>
  )
}
