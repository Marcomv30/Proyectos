import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabase';

const styles = `
  .su-wrap { color:#d6e2ff; }
  .su-header { margin-bottom:18px; }
  .su-title { font-size:20px; font-weight:800; color:#f8fbff; margin-bottom:6px; }
  .su-sub { font-size:13px; color:#8ea3c7; max-width:860px; }
  .su-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:18px; }
  .su-card { background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:18px; padding:22px; box-shadow:0 18px 30px rgba(3,8,20,.18); }
  .su-card-title { font-size:16px; font-weight:800; color:#ffe2e6; margin-bottom:8px; }
  .su-card-sub { font-size:13px; color:#9fb0cf; line-height:1.55; margin-bottom:14px; }
  .su-list { margin:0 0 16px 0; padding-left:18px; color:#d6e2ff; font-size:13px; line-height:1.6; }
  .su-badge { display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; font-size:12px; font-weight:800; background:#34181c; color:#ffb3bb; border:1px solid rgba(255,179,187,0.18); margin-bottom:16px; }
  .su-btn { padding:11px 16px; border:none; border-radius:12px; font-size:13px; font-weight:800; cursor:pointer; transition:filter .18s ease, opacity .18s ease; }
  .su-btn-danger { background:linear-gradient(135deg,#5c1f29,#7d2f3a); color:#ffe2e6; box-shadow:0 14px 24px rgba(125,47,58,.18); }
  .su-btn-danger:hover { filter:brightness(1.05); }
  .su-btn:disabled { opacity:.6; cursor:default; filter:none; }
  .su-msg { margin-bottom:14px; padding:10px 14px; border-radius:12px; font-size:12px; font-weight:700; }
  .su-msg.ok { background:#0f2c20; border:1px solid #1d6e4f; color:#9df4c7; }
  .su-msg.err { background:#34181c; border:1px solid #7d2f3a; color:#ffb3bb; }
  .su-modal-overlay { position:fixed; inset:0; background:rgba(6,10,18,0.72); display:flex; align-items:flex-start; justify-content:center; z-index:30000; padding:calc(var(--navbar-h, 86px) + 16px) 16px 16px; overflow:auto; box-sizing:border-box; }
  .su-modal { width:min(560px, 92vw); background:#172131; border:1px solid rgba(137,160,201,0.18); border-radius:18px; padding:26px; box-shadow:0 24px 60px rgba(0,0,0,.34); margin:0 auto; }
  .su-modal-title { font-size:17px; font-weight:800; color:#ffced5; margin-bottom:8px; }
  .su-modal-sub { font-size:13px; color:#9fb0cf; line-height:1.55; margin-bottom:14px; }
  .su-modal-warn { padding:11px 14px; background:#34181c; border:1px solid #7d2f3a; border-radius:12px; color:#ffb3bb; font-size:12px; font-weight:700; margin-bottom:14px; }
  .su-label { display:block; font-size:11px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.08em; font-weight:800; margin-bottom:6px; }
  .su-input { width:100%; padding:11px 12px; border:1px solid rgba(137,160,201,0.22); border-radius:12px; font-size:13px; color:#f3f7ff; outline:none; background:#1d2738; }
  .su-input:focus { border-color:#4c7bf7; box-shadow:0 0 0 3px rgba(76,123,247,0.16); }
  .su-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
  .su-btn-secondary { background:#243149; color:#d6e2ff; border:1px solid rgba(137,160,201,0.18); }
  .su-meta { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-bottom:14px; }
  .su-meta-item { background:#111927; border:1px solid rgba(137,160,201,0.12); border-radius:12px; padding:10px 12px; }
  .su-meta-label { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#7f92b5; font-weight:800; margin-bottom:5px; }
  .su-meta-value { font-size:12px; color:#f3f7ff; word-break:break-word; }
  .su-chip { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:999px; font-size:11px; font-weight:800; margin-bottom:12px; }
  .su-chip.warn { background:#3b2a12; border:1px solid rgba(245,158,11,.28); color:#fcd34d; }
  .su-chip.ok { background:#0f2c20; border:1px solid rgba(29,110,79,.35); color:#9df4c7; }
  .su-chip.info { background:#1a2740; border:1px solid rgba(96,165,250,.24); color:#bfdbfe; }
  .su-log { margin-top:12px; background:#0f1724; border:1px solid rgba(137,160,201,0.12); border-radius:12px; padding:12px; max-height:220px; overflow:auto; font-size:11px; color:#b9cae9; white-space:pre-wrap; }
  .su-progress { margin-top:12px; }
  .su-progress-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:6px; }
  .su-progress-label { font-size:12px; font-weight:700; color:#c8d6f2; }
  .su-progress-pct { font-size:11px; color:#8ea3c7; font-family:'DM Mono', monospace; }
  .su-progress-track { width:100%; height:10px; border-radius:999px; background:#0f1724; border:1px solid rgba(137,160,201,0.14); overflow:hidden; }
  .su-progress-fill { height:100%; border-radius:999px; background:linear-gradient(90deg,#22c55e,#38bdf8); box-shadow:0 0 14px rgba(56,189,248,.28); transition:width .22s ease; }
  .su-summary { margin-top:12px; background:#111927; border:1px solid rgba(137,160,201,0.12); border-radius:12px; padding:10px 12px; }
  .su-summary-title { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#7f92b5; font-weight:800; margin-bottom:6px; }
  .su-summary-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:8px; }
  .su-summary-item { background:#172131; border:1px solid rgba(137,160,201,0.10); border-radius:10px; padding:8px 10px; }
  .su-summary-label { font-size:10px; color:#8ea3c7; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
  .su-summary-value { font-size:13px; color:#f3f7ff; font-weight:800; }
  .vps-bar-wrap { margin-bottom:12px; }
  .vps-bar-header { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px; }
  .vps-bar-label { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#7f92b5; font-weight:800; }
  .vps-bar-value { font-size:11px; color:#c8d6f2; font-family:'DM Mono', monospace; }
  .vps-bar-track { width:100%; height:8px; border-radius:999px; background:#0f1724; border:1px solid rgba(137,160,201,0.14); overflow:hidden; }
  .vps-bar-fill { height:100%; border-radius:999px; transition:width .4s ease; }
  .vps-bar-fill.ok { background:linear-gradient(90deg,#22c55e,#38bdf8); box-shadow:0 0 10px rgba(56,189,248,.22); }
  .vps-bar-fill.warn { background:linear-gradient(90deg,#f59e0b,#ef4444); box-shadow:0 0 10px rgba(239,68,68,.22); }
  .vps-proc-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 0; border-bottom:1px solid rgba(137,160,201,0.10); }
  .vps-proc-row:last-child { border-bottom:none; }
  .vps-proc-name { font-size:12px; font-weight:800; color:#f3f7ff; }
  .vps-proc-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .vps-proc-dot.online { background:#22c55e; box-shadow:0 0 6px rgba(34,197,94,.5); }
  .vps-proc-dot.errored, .vps-proc-dot.stopped { background:#ef4444; }
  .vps-proc-dot.launching { background:#f59e0b; }
  .vps-proc-dot.unknown { background:#64748b; }
  .vps-proc-meta { font-size:10px; color:#8ea3c7; }
  .vps-log-panel { margin-top:10px; background:#0a0f1a; border:1px solid rgba(137,160,201,0.12); border-radius:10px; padding:10px; max-height:180px; overflow:auto; font-size:10px; color:#b9cae9; white-space:pre-wrap; font-family:'DM Mono', monospace; }
  .vps-dot-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
  .vps-status-pill { display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:800; }
  .vps-status-pill .dot { width:8px; height:8px; border-radius:50%; }
  .vps-status-pill.online .dot { background:#22c55e; box-shadow:0 0 6px rgba(34,197,94,.5); }
  .vps-status-pill.offline .dot { background:#ef4444; }
  .vps-ts { font-size:10px; color:#5c7099; font-family:'DM Mono', monospace; }
  .vps-toggle { font-size:11px; color:#60a5fa; cursor:pointer; background:none; border:none; padding:0; font-weight:700; }
  .vps-toggle:hover { color:#93c5fd; }
`;

const API = process.env.REACT_APP_API_URL || '';

type DeployTarget = 'erp' | 'empacadora' | 'consola' | 'pos';

type DeployTargetOption = {
  id: DeployTarget;
  label: string;
};

type VpsStats = {
  ts: string;
  system: {
    total_mem: number;
    free_mem: number;
    used_mem: number;
    mem_pct: number;
    load_avg: number[];
    cpu_count: number;
    sys_uptime: number;
  };
  process: {
    uptime: number;
    rss: number;
    heap_used: number;
    heap_total: number;
  };
  disk: { total: string; used: string; free: string; pct: number };
  pm2: { name: string; pid: number; status: string; pm_uptime: number; restarts: number; cpu: number; mem: number }[];
  errors: string[];
  out: string[];
};

type FrontendDeployStatus = {
  sync: {
    running: boolean;
    started_at: string | null;
    finished_at: string | null;
    ok: boolean | null;
    error: string;
    logs: string[];
  };
  file_sync: {
    running: boolean;
    started_at: string | null;
    finished_at: string | null;
    ok: boolean | null;
    error: string;
    logs: string[];
  };
  running: boolean;
  started_at: string | null;
  finished_at: string | null;
  ok: boolean | null;
  error: string;
  logs: string[];
  config: {
    target: DeployTarget;
    target_label: string;
    available_targets: DeployTargetOption[];
    source_dir: string;
    publish_dir: string;
    backup_dir: string;
    sync_cmd: string;
    sync_configured: boolean;
    git_repo_exists: boolean;
    install_cmd: string;
    build_cmd: string;
    build_subdir: string;
    source_configured: boolean;
    source_exists: boolean;
    package_json_exists: boolean;
    build_dir_exists: boolean;
    publish_exists: boolean;
    publish_same_as_build: boolean;
    env_mode: string;
    env_file: string;
    env_path: string;
    env_exists: boolean;
    current_supabase_url: string;
    current_anon_key_masked: string;
    current_api_url: string;
    file_sync_available: boolean;
    file_sync_script_path: string;
    file_sync_frontend_dir: string;
    file_sync_backend_dir: string;
    file_sync_misc_dir: string;
    sync_check: {
      available: boolean;
      checked_at: string | null;
      pending_update: boolean | null;
      branch: string;
      local_commit: string;
      remote_commit: string;
      error: string;
    };
  };
};

type FrontendDeployEnvelope = {
  ok: boolean;
  error?: string;
  message?: string;
  status?: FrontendDeployStatus;
};

type SyncSummary = {
  detected: string;
  uploaded: string;
  removed: string;
  deleteRemoved: string;
} | null;

type FileSyncCandidate = {
  path: string;
  supported: boolean;
  target: string;
  remote_path: string;
};

function getProgress(logs: string[], running: boolean, ok: boolean | null) {
  if (ok === true) return 100;
  if (!running) return 0;
  const joined = logs.join('\n').toLowerCase();
  if (joined.includes('frontend publicado correctamente') || joined.includes('sincronizacion finalizada correctamente')) return 100;
  if (joined.includes('copiando nuevo build') || joined.includes('respaldando publicacion actual')) return 88;
  if (joined.includes('compilando frontend')) return 68;
  if (joined.includes('ejecutando instalacion')) return 38;
  if (joined.includes('variables de frontend preparadas') || joined.includes('ejecutando sincronizacion')) return 20;
  if (joined.includes('solicitud iniciada')) return 8;
  return 6;
}

function getSyncSummary(logs: string[]): SyncSummary {
  const line = [...logs].reverse().find((entry) => entry.includes('Resumen sync:'))
  if (!line) return null

  const detected = /detectados=(\d+)/.exec(line)?.[1] || '0'
  const uploaded = /subidos=(\d+)/.exec(line)?.[1] || '0'
  const removed = /eliminados_remotos=(\d+)/.exec(line)?.[1] || '0'
  const deleteRemovedRaw = /delete_removed=(true|false)/.exec(line)?.[1] || 'false'

  return {
    detected,
    uploaded,
    removed,
    deleteRemoved: deleteRemovedRaw === 'true' ? 'Si' : 'No',
  }
}

function getSyncHeadline(sync: FrontendDeployStatus['sync'] | undefined, summary: SyncSummary) {
  if (!sync) return 'Sin ejecuciones'
  if (sync.running) return 'Sincronizando...'
  if (sync.ok === true && summary && summary.uploaded === '0' && summary.removed === '0') {
    return 'Sin cambios por sincronizar'
  }
  if (sync.ok === true) return 'Ultima sincronizacion OK'
  if (sync.ok === false) return 'Ultima sincronizacion con error'
  return 'Sin ejecuciones'
}

export default function SuperusuarioOperaciones({
  empresaId,
  empresaNombre,
}: {
  empresaId: number;
  empresaNombre: string;
}) {
  const [deployTarget, setDeployTarget] = useState<DeployTarget>('erp');
  const [okMsg, setOkMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [working, setWorking] = useState(false);
  const [deployStatus, setDeployStatus] = useState<FrontendDeployStatus | null>(null);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [deployPassword, setDeployPassword] = useState('');
  const [deployPasswordError, setDeployPasswordError] = useState('');
  const [deployWorking, setDeployWorking] = useState(false);
  const [syncPassword, setSyncPassword] = useState('');
  const [syncPasswordError, setSyncPasswordError] = useState('');
  const [syncWorking, setSyncWorking] = useState(false);
  const [fileSyncModalOpen, setFileSyncModalOpen] = useState(false);
  const [fileSyncPassword, setFileSyncPassword] = useState('');
  const [fileSyncPasswordError, setFileSyncPasswordError] = useState('');
  const [fileSyncWorking, setFileSyncWorking] = useState(false);
  const [fileCandidates, setFileCandidates] = useState<FileSyncCandidate[]>([]);
  const [fileCandidatesLoading, setFileCandidatesLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [fileSearch, setFileSearch] = useState('');
  const [deploySupabaseUrl, setDeploySupabaseUrl] = useState('');
  const [deployAnonKey, setDeployAnonKey] = useState('');
  const [deployApiUrl, setDeployApiUrl] = useState('');
  const syncProgress = getProgress(deployStatus?.sync?.logs || [], !!deployStatus?.sync?.running, deployStatus?.sync?.ok ?? null);
  const fileSyncProgress = getProgress(deployStatus?.file_sync?.logs || [], !!deployStatus?.file_sync?.running, deployStatus?.file_sync?.ok ?? null);
  const deployProgress = getProgress(deployStatus?.logs || [], !!deployStatus?.running, deployStatus?.ok ?? null);
  const showSyncCard = !!deployStatus?.config?.sync_configured;
  const showFileSyncCard = !!deployStatus?.config?.file_sync_available;
  const publishIsBuildOnly = !!deployStatus?.config?.publish_same_as_build;
  const hasStoredAnonKey = !!deployStatus?.config?.current_anon_key_masked;
  const deployRunning = !!deployStatus?.running;
  const syncCheck = deployStatus?.config?.sync_check;
  const syncSummary = getSyncSummary(deployStatus?.sync?.logs || []);
  const syncHeadline = getSyncHeadline(deployStatus?.sync, syncSummary);
  const supportedCandidates = fileCandidates.filter((item) => item.supported);
  const unsupportedCandidates = fileCandidates.filter((item) => !item.supported);
  const targetOptions = deployStatus?.config?.available_targets?.length
    ? deployStatus.config.available_targets
    : [
        { id: 'erp', label: 'ERP' },
        { id: 'empacadora', label: 'Empacadora' },
        { id: 'consola', label: 'Consola' },
        { id: 'pos', label: 'POS' },
      ] as DeployTargetOption[];
  const fileSearchNeedle = fileSearch.trim().toLowerCase();
  const filteredSupportedCandidates = supportedCandidates.filter((item) => !fileSearchNeedle || item.path.toLowerCase().includes(fileSearchNeedle) || item.remote_path.toLowerCase().includes(fileSearchNeedle));
  const filteredUnsupportedCandidates = unsupportedCandidates.filter((item) => !fileSearchNeedle || item.path.toLowerCase().includes(fileSearchNeedle));
  const selectedHasFrontendFiles = selectedFiles.some((filePath) => supportedCandidates.some((item) => item.path === filePath && item.target === 'frontend'));

  const [vpsStats, setVpsStats] = useState<VpsStats | null>(null);
  const [vpsLoading, setVpsLoading] = useState(false);
  const [vpsShowErrors, setVpsShowErrors] = useState(false);
  const [vpsShowOut, setVpsShowOut] = useState(false);
  const vpsLastFetch = useRef<number>(0);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('mya_frontend_deploy_target') as DeployTarget | null;
      if (stored && ['erp', 'empacadora', 'consola', 'pos'].includes(stored)) {
        setDeployTarget(stored);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('mya_frontend_deploy_target', deployTarget);
    } catch {}
  }, [deployTarget]);

  const cargarVpsStats = useCallback(async () => {
    if (vpsLoading) return;
    setVpsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const resp = await fetch(`${API}/api/admin/vps-monitor/stats`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error('Error al consultar monitor VPS');
      const json = await resp.json();
      if (json.ok) {
        setVpsStats(json as VpsStats);
        vpsLastFetch.current = Date.now();
      }
    } catch {}
    setVpsLoading(false);
  }, [vpsLoading]);

  useEffect(() => {
    void cargarVpsStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = window.setInterval(() => {
      void cargarVpsStats();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [cargarVpsStats]);

  const fmtBytes = (b: number) => {
    if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
    if (b >= 1e6) return `${(b / 1e6).toFixed(0)} MB`;
    return `${(b / 1e3).toFixed(0)} KB`;
  };

  const fmtUptime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const fmtTs = (ts: string) => {
    try { return new Date(ts).toLocaleTimeString('es-CR'); } catch { return ts; }
  };

  const authHeaders = async (extra: Record<string, string> = {}) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    return {
      ...extra,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const withTarget = (basePath: string) => `${basePath}${basePath.includes('?') ? '&' : '?'}target=${encodeURIComponent(deployTarget)}`;

  const abrirPublicacionFrontend = () => {
    setDeployPassword('');
    setDeployPasswordError('');
    setDeploySupabaseUrl(deployStatus?.config?.current_supabase_url || '');
    setDeployAnonKey('');
    setDeployApiUrl(deployStatus?.config?.current_api_url || API || 'https://api.visionzn.net');
    setFileSyncModalOpen(false);
    setDeployModalOpen(true);
  };

  const cargarDeployStatus = React.useCallback(async () => {
    try {
      const resp = await fetch(withTarget(`${API}/api/admin/frontend-deploy/status`), {
        headers: await authHeaders(),
      });
      const json = await resp.json() as FrontendDeployEnvelope;
      if (!resp.ok || !json.ok) throw new Error(json.error || 'No se pudo consultar el estado de publicación.');
      setDeployStatus((json.status || json) as FrontendDeployStatus);
    } catch (error: any) {
      setErrMsg(error.message || 'No se pudo consultar el estado del deploy de frontend.');
    }
  }, [deployTarget]);

  React.useEffect(() => {
    void cargarDeployStatus();
  }, [cargarDeployStatus]);

  React.useEffect(() => {
    const shouldPoll = !!deployStatus?.running || !!deployStatus?.sync?.running || !!deployStatus?.file_sync?.running || deployModalOpen || syncModalOpen || fileSyncModalOpen;
    if (!shouldPoll) return;

    const timer = window.setInterval(() => {
      void cargarDeployStatus();
    }, 2500);

    return () => window.clearInterval(timer);
  }, [cargarDeployStatus, deployModalOpen, syncModalOpen, fileSyncModalOpen, deployStatus?.running, deployStatus?.sync?.running, deployStatus?.file_sync?.running]);

  const ejecutarResetCatalogo = async () => {
    if (!password) {
      setPasswordError('Ingrese su contrasena.');
      return;
    }

    setPasswordError('');
    setWorking(true);
    setErrMsg('');
    setOkMsg('');

    const { data: session } = await supabase.auth.getSession();
    const email = session?.session?.user?.email;
    if (!email) {
      setPasswordError('No se pudo obtener la sesion activa.');
      setWorking(false);
      return;
    }

    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
    if (authErr) {
      setPasswordError('Contrasena incorrecta.');
      setWorking(false);
      return;
    }

    const { data, error } = await supabase.rpc('reiniciar_catalogo_empresa', { p_empresa_id: empresaId });
    if (error) {
      setErrMsg(error.message || 'No se pudo vaciar el catalogo de la empresa.');
      setWorking(false);
      return;
    }

    const r = data as any;
    setOkMsg(`Catalogo empresa vaciado. Cuentas: ${r?.cuentas ?? 0}, Asientos: ${r?.asientos ?? 0}.`);
    setModalOpen(false);
    setPassword('');
    setWorking(false);
  };

  const ejecutarDeployFrontend = async () => {
    if (!deployPassword) {
      setDeployPasswordError('Ingrese su contrasena.');
      return;
    }

    setDeployPasswordError('');
    setDeployWorking(true);
    setErrMsg('');
    setOkMsg('');

    const { data: session } = await supabase.auth.getSession();
    const email = session?.session?.user?.email;
    if (!email) {
      setDeployPasswordError('No se pudo obtener la sesion activa.');
      setDeployWorking(false);
      return;
    }

    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: deployPassword });
    if (authErr) {
      setDeployPasswordError('Contrasena incorrecta.');
      setDeployWorking(false);
      return;
    }

    try {
      const resp = await fetch(`${API}/api/admin/frontend-deploy/run`, {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          target: deployTarget,
          supabase_url: deploySupabaseUrl.trim(),
          anon_key: deployAnonKey.trim(),
          api_url: deployApiUrl.trim(),
        }),
      });
      const json = await resp.json() as FrontendDeployEnvelope;
      setDeployStatus((json.status || json) as FrontendDeployStatus);
      if (!resp.ok || !json.ok) throw new Error(json.error || 'No se pudo publicar el frontend.');
      setOkMsg(publishIsBuildOnly ? 'Compilación iniciada.' : 'Publicación iniciada.');
      setDeployPassword('');
    } catch (error: any) {
      setErrMsg(error.message || 'No se pudo publicar el frontend.');
    } finally {
      setDeployWorking(false);
    }
  };

  const ejecutarSyncFrontend = async () => {
    if (!syncPassword) {
      setSyncPasswordError('Ingrese su contrasena.');
      return;
    }

    setSyncPasswordError('');
    setSyncWorking(true);
    setErrMsg('');
    setOkMsg('');

    const { data: session } = await supabase.auth.getSession();
    const email = session?.session?.user?.email;
    if (!email) {
      setSyncPasswordError('No se pudo obtener la sesion activa.');
      setSyncWorking(false);
      return;
    }

    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: syncPassword });
    if (authErr) {
      setSyncPasswordError('Contrasena incorrecta.');
      setSyncWorking(false);
      return;
    }

    try {
      const resp = await fetch(`${API}/api/admin/frontend-deploy/sync`, {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ target: deployTarget }),
      });
      const json = await resp.json() as FrontendDeployEnvelope;
      setDeployStatus((json.status || json) as FrontendDeployStatus);
      if (!resp.ok || !json.ok) throw new Error(json.error || 'No se pudo sincronizar el frontend.');
      setOkMsg('Sincronización iniciada.');
      setSyncPassword('');
    } catch (error: any) {
      setErrMsg(error.message || 'No se pudo sincronizar el frontend.');
    } finally {
      setSyncWorking(false);
    }
  };

  const cargarFileCandidates = React.useCallback(async () => {
    try {
      setFileCandidatesLoading(true);
      const resp = await fetch(withTarget(`${API}/api/admin/frontend-deploy/files`), {
        headers: await authHeaders(),
      });
      const json = await resp.json() as { ok: boolean; error?: string; files?: FileSyncCandidate[] };
      if (!resp.ok || !json.ok) throw new Error(json.error || 'No se pudo consultar los archivos candidatos.');
      const files = json.files || [];
      setFileCandidates(files);
      setSelectedFiles((prev) => prev.filter((item) => files.some((candidate) => candidate.path === item && candidate.supported)));
    } catch (error: any) {
      setErrMsg(error.message || 'No se pudo consultar los archivos candidatos.');
    } finally {
      setFileCandidatesLoading(false);
    }
  }, [deployTarget]);

  const toggleSelectedFile = (filePath: string) => {
    setSelectedFiles((prev) => prev.includes(filePath)
      ? prev.filter((item) => item !== filePath)
      : [...prev, filePath]);
  };

  const seleccionarTodosFiles = () => {
    setSelectedFiles(supportedCandidates.map((item) => item.path));
  };

  const limpiarSeleccionFiles = () => {
    setSelectedFiles([]);
  };

  const ejecutarVpsPublish = async () => {
    if (!fileSyncPassword) { setFileSyncPasswordError('Ingrese su contrasena.'); return; }
    if (!selectedFiles.length) { setFileSyncPasswordError('Seleccione al menos un archivo.'); return; }
    setFileSyncPasswordError('');
    setFileSyncWorking(true);
    setErrMsg('');
    setOkMsg('');
    const { data: session } = await supabase.auth.getSession();
    const email = session?.session?.user?.email;
    if (!email) { setFileSyncPasswordError('No se pudo obtener la sesion activa.'); setFileSyncWorking(false); return; }
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: fileSyncPassword });
    if (authErr) { setFileSyncPasswordError('Contrasena incorrecta.'); setFileSyncWorking(false); return; }
    try {
      const resp = await fetch(`${API}/api/admin/frontend-deploy/vps-publish`, {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ target: deployTarget, paths: selectedFiles }),
      });
      const json = await resp.json() as FrontendDeployEnvelope;
      setDeployStatus((json.status || json) as FrontendDeployStatus);
      if (!resp.ok || !json.ok) throw new Error(json.error || 'No se pudo publicar en VPS.');
      setOkMsg('Publicacion en VPS iniciada. Ver logs abajo.');
      setFileSyncPassword('');
    } catch (error: any) {
      setErrMsg(error.message || 'No se pudo publicar en VPS.');
    } finally {
      setFileSyncWorking(false);
    }
  };

  const ejecutarFileSync = async () => {
    if (!fileSyncPassword) {
      setFileSyncPasswordError('Ingrese su contrasena.');
      return;
    }
    if (!selectedFiles.length) {
      setFileSyncPasswordError('Seleccione al menos un archivo.');
      return;
    }

    setFileSyncPasswordError('');
    setFileSyncWorking(true);
    setErrMsg('');
    setOkMsg('');

    const { data: session } = await supabase.auth.getSession();
    const email = session?.session?.user?.email;
    if (!email) {
      setFileSyncPasswordError('No se pudo obtener la sesion activa.');
      setFileSyncWorking(false);
      return;
    }

    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: fileSyncPassword });
    if (authErr) {
      setFileSyncPasswordError('Contrasena incorrecta.');
      setFileSyncWorking(false);
      return;
    }

    try {
      const resp = await fetch(`${API}/api/admin/frontend-deploy/files/run`, {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ target: deployTarget, paths: selectedFiles }),
      });
      const json = await resp.json() as FrontendDeployEnvelope;
      setDeployStatus((json.status || json) as FrontendDeployStatus);
      if (!resp.ok || !json.ok) throw new Error(json.error || 'No se pudieron enviar los archivos al VPS.');
      setOkMsg('Envio de archivos iniciado.');
      setFileSyncPassword('');
    } catch (error: any) {
      setErrMsg(error.message || 'No se pudieron enviar los archivos al VPS.');
    } finally {
      setFileSyncWorking(false);
    }
  };

  return (
    <>
      <style>{styles}</style>
      <div className="su-wrap">
        <div className="su-header">
          <div className="su-title">Operaciones sensibles</div>
          <div className="su-sub">
            Aqui concentramos acciones de soporte o de riesgo alto para que no queden visibles en las pantallas operativas normales.
          </div>
        </div>

        {okMsg ? <div className="su-msg ok">{okMsg}</div> : null}
        {errMsg ? <div className="su-msg err">{errMsg}</div> : null}

        <div className="su-card" style={{ marginBottom: '18px' }}>
          <div className="su-card-title" style={{ marginBottom: '6px' }}>Destino de despliegue</div>
          <div className="su-card-sub" style={{ marginBottom: '10px' }}>
            Seleccione la app que quiere sincronizar, subir o publicar. Cada destino usa su propia carpeta fuente y su propia publicación en VPS.
          </div>
          <div className="su-meta" style={{ marginBottom: 0 }}>
            <div className="su-meta-item">
              <div className="su-meta-label">App objetivo</div>
              <select
                className="su-input"
                value={deployTarget}
                onChange={(e) => setDeployTarget(e.target.value as DeployTarget)}
              >
                {targetOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="su-meta-item">
              <div className="su-meta-label">Perfil activo</div>
              <div className="su-meta-value">{deployStatus?.config?.target_label || targetOptions.find((item) => item.id === deployTarget)?.label || deployTarget}</div>
            </div>
            <div className="su-meta-item">
              <div className="su-meta-label">Entorno</div>
              <div className="su-meta-value">{deployStatus?.config?.env_mode || 'react'} · {deployStatus?.config?.env_file || 'Sin detectar'}</div>
            </div>
          </div>
        </div>

        <div className="su-grid">
          {showSyncCard ? (
          <section className="su-card">
            <div className="su-card-title">Sincronizar frontend al VPS</div>
            <div className="su-card-sub">
              Ejecuta un comando configurado en el servidor para actualizar el código fuente del frontend antes de publicarlo.
            </div>
            {syncCheck?.available ? (
              <div className={`su-chip ${syncCheck.pending_update ? 'warn' : syncCheck.error ? 'info' : 'ok'}`}>
                {syncCheck.pending_update
                  ? 'Hay cambios pendientes por sincronizar'
                  : syncCheck.error
                    ? 'No se pudo verificar el remoto'
                    : 'Sin cambios pendientes'}
              </div>
            ) : null}
            <div className="su-meta">
              <div className="su-meta-item">
                <div className="su-meta-label">Estado</div>
                <div className="su-meta-value">
                  {syncHeadline}
                </div>
              </div>
              <div className="su-meta-item">
                <div className="su-meta-label">Fuente</div>
                <div className="su-meta-value">
                  {deployStatus?.config?.source_dir || 'Sin configurar'}
                </div>
              </div>
              <div className="su-meta-item">
                <div className="su-meta-label">Comando</div>
                <div className="su-meta-value">
                  {deployStatus?.config?.sync_cmd || 'Sin configurar'}
                </div>
              </div>
              {syncCheck?.available ? (
                <div className="su-meta-item">
                  <div className="su-meta-label">Rama</div>
                  <div className="su-meta-value">
                    {syncCheck.branch || 'Sin detectar'}
                  </div>
                </div>
              ) : null}
              {syncCheck?.available ? (
                <div className="su-meta-item">
                  <div className="su-meta-label">Commits</div>
                  <div className="su-meta-value">
                    {syncCheck.local_commit && syncCheck.remote_commit
                      ? `${syncCheck.local_commit} -> ${syncCheck.remote_commit}`
                      : syncCheck.local_commit || syncCheck.remote_commit || 'Sin detectar'}
                  </div>
                </div>
              ) : null}
            </div>
            <ul className="su-list">
              <li>Actualiza el código fuente del servidor.</li>
              <li>No publica por sí sola el sitio.</li>
              <li>Después de sincronizar, use `Publicar frontend` para compilar y activar el cambio.</li>
            </ul>
            {syncCheck?.error ? <div className="su-msg err" style={{ marginBottom: '12px' }}>{syncCheck.error}</div> : null}
            {deployStatus?.sync?.error ? <div className="su-msg err" style={{ marginBottom: '12px' }}>{deployStatus.sync.error}</div> : null}
            <div className="su-actions" style={{ justifyContent: 'space-between' }}>
              <button className="su-btn su-btn-secondary" onClick={() => void cargarDeployStatus()} disabled={syncWorking}>
                Refrescar estado
              </button>
              <button
                className="su-btn su-btn-danger"
                onClick={() => { setSyncPassword(''); setSyncPasswordError(''); setSyncModalOpen(true); }}
                disabled={syncWorking || deployStatus?.sync?.running || !deployStatus?.config?.sync_configured}
              >
                {deployStatus?.sync?.running ? 'Sincronizando...' : 'Sincronizar frontend'}
              </button>
            </div>
          </section>
          ) : null}

          {showFileSyncCard ? (
          <section className="su-card">
            <div className="su-card-title">Enviar archivos seleccionados al VPS</div>
            <div className="su-card-sub">
              Detecta archivos cambiados del repo local y le permite escoger solo los que quiere subir al VPS sin armar `scp` uno por uno.
            </div>
            <div className={`su-chip ${deployStatus?.file_sync?.running ? 'warn' : deployStatus?.file_sync?.ok === true ? 'ok' : deployStatus?.file_sync?.ok === false ? 'info' : 'info'}`}>
              {deployStatus?.file_sync?.running
                ? 'Envio en curso'
                : deployStatus?.file_sync?.ok === true
                  ? 'Ultimo envio OK'
                  : deployStatus?.file_sync?.ok === false
                    ? 'Ultimo envio con error'
                    : 'Sin ejecuciones'}
            </div>
            <div className="su-meta">
              <div className="su-meta-item">
                <div className="su-meta-label">Frontend remoto</div>
                <div className="su-meta-value">{deployStatus?.config?.file_sync_frontend_dir || 'Sin configurar'}</div>
              </div>
              <div className="su-meta-item">
                <div className="su-meta-label">Backend remoto</div>
                <div className="su-meta-value">{deployStatus?.config?.file_sync_backend_dir || 'Sin configurar'}</div>
              </div>
              <div className="su-meta-item">
                <div className="su-meta-label">Destino misc</div>
                <div className="su-meta-value">{deployStatus?.config?.file_sync_misc_dir || 'Sin configurar'}</div>
              </div>
              <div className="su-meta-item">
                <div className="su-meta-label">Script</div>
                <div className="su-meta-value">{deployStatus?.config?.file_sync_script_path || 'Sin configurar'}</div>
              </div>
            </div>
            <ul className="su-list">
              <li>Mapea `server/*` al backend del VPS.</li>
              <li>Mapea `src/*`, `public/*` y archivos raíz del frontend a la carpeta remota del destino seleccionado.</li>
              <li>Archivos `.sql` o `docs/*` se envian al destino misc para soporte puntual.</li>
            </ul>
            {deployStatus?.file_sync?.error ? <div className="su-msg err" style={{ marginBottom: '12px' }}>{deployStatus.file_sync.error}</div> : null}
            <div className="su-actions" style={{ justifyContent: 'space-between' }}>
              <button className="su-btn su-btn-secondary" onClick={() => void cargarDeployStatus()} disabled={fileSyncWorking}>
                Refrescar estado
              </button>
              <button
                className="su-btn su-btn-danger"
                onClick={() => {
                  setFileSyncPassword('');
                  setFileSyncPasswordError('');
                  setSelectedFiles([]);
                  setFileSearch('');
                  void cargarFileCandidates();
                  setFileSyncModalOpen(true);
                }}
                disabled={fileSyncWorking || deployStatus?.file_sync?.running}
              >
                {deployStatus?.file_sync?.running ? 'Enviando...' : 'Elegir archivos'}
              </button>
            </div>
          </section>
          ) : null}

          <section className="su-card">
            <div className="vps-dot-header">
              <div className="su-card-title" style={{ marginBottom: 0 }}>Monitor VPS</div>
              {vpsStats ? (
                <div className={`vps-status-pill ${vpsStats.pm2.some((p) => p.status === 'online') ? 'online' : 'offline'}`}>
                  <span className="dot" />
                  {vpsStats.pm2.some((p) => p.status === 'online') ? 'Online' : 'Offline'}
                </div>
              ) : null}
            </div>
            {vpsStats ? (
              <>
                <div className="vps-ts">Actualizado: {fmtTs(vpsStats.ts)}</div>
                <div style={{ marginBottom: '14px' }} />

                {/* RAM */}
                <div className="vps-bar-wrap">
                  <div className="vps-bar-header">
                    <span className="vps-bar-label">RAM</span>
                    <span className="vps-bar-value">{vpsStats.system.mem_pct}% · {fmtBytes(vpsStats.system.used_mem)} / {fmtBytes(vpsStats.system.total_mem)}</span>
                  </div>
                  <div className="vps-bar-track">
                    <div className={`vps-bar-fill ${vpsStats.system.mem_pct >= 85 ? 'warn' : 'ok'}`} style={{ width: `${vpsStats.system.mem_pct}%` }} />
                  </div>
                </div>

                {/* CPU */}
                <div className="vps-bar-wrap">
                  <div className="vps-bar-header">
                    <span className="vps-bar-label">CPU</span>
                    <span className="vps-bar-value">
                      load {vpsStats.system.load_avg[0].toFixed(2)} · {vpsStats.system.cpu_count} núcleos
                    </span>
                  </div>
                  <div className="vps-bar-track">
                    {(() => {
                      const pct = Math.min(100, Math.round((vpsStats.system.load_avg[0] / vpsStats.system.cpu_count) * 100));
                      return <div className={`vps-bar-fill ${pct >= 80 ? 'warn' : 'ok'}`} style={{ width: `${pct}%` }} />;
                    })()}
                  </div>
                </div>

                {/* Disco */}
                {vpsStats.disk.total ? (
                  <div className="vps-bar-wrap">
                    <div className="vps-bar-header">
                      <span className="vps-bar-label">Disco</span>
                      <span className="vps-bar-value">{vpsStats.disk.pct}% · {vpsStats.disk.used} / {vpsStats.disk.total}</span>
                    </div>
                    <div className="vps-bar-track">
                      <div className={`vps-bar-fill ${vpsStats.disk.pct >= 85 ? 'warn' : 'ok'}`} style={{ width: `${vpsStats.disk.pct}%` }} />
                    </div>
                  </div>
                ) : null}

                {/* Procesos PM2 */}
                {vpsStats.pm2.length ? (
                  <div style={{ marginTop: '4px', marginBottom: '12px' }}>
                    {vpsStats.pm2.map((p) => (
                      <div key={p.name} className="vps-proc-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`vps-proc-dot ${p.status}`} />
                          <span className="vps-proc-name">{p.name}</span>
                        </div>
                        <span className="vps-proc-meta">
                          {fmtUptime(Math.floor((Date.now() - p.pm_uptime) / 1000))} · {p.restarts} reinic. · {fmtBytes(p.mem)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* Proceso Node (este servidor) */}
                <div className="su-meta" style={{ marginBottom: '10px' }}>
                  <div className="su-meta-item">
                    <div className="su-meta-label">Uptime API</div>
                    <div className="su-meta-value">{fmtUptime(vpsStats.process.uptime)}</div>
                  </div>
                  <div className="su-meta-item">
                    <div className="su-meta-label">Heap usado</div>
                    <div className="su-meta-value">{fmtBytes(vpsStats.process.heap_used)} / {fmtBytes(vpsStats.process.heap_total)}</div>
                  </div>
                  <div className="su-meta-item">
                    <div className="su-meta-label">RSS</div>
                    <div className="su-meta-value">{fmtBytes(vpsStats.process.rss)}</div>
                  </div>
                  <div className="su-meta-item">
                    <div className="su-meta-label">Uptime sistema</div>
                    <div className="su-meta-value">{fmtUptime(vpsStats.system.sys_uptime)}</div>
                  </div>
                </div>

                {/* Logs de salida */}
                {vpsStats.out.length ? (
                  <div style={{ marginBottom: '8px' }}>
                    <button className="vps-toggle" onClick={() => setVpsShowOut((v) => !v)}>
                      {vpsShowOut ? '▲ Ocultar actividad reciente' : '▼ Ver actividad reciente'}
                    </button>
                    {vpsShowOut ? (
                      <div className="vps-log-panel">{vpsStats.out.join('\n')}</div>
                    ) : null}
                  </div>
                ) : null}

                {/* Errores recientes */}
                {vpsStats.errors.length ? (
                  <div style={{ marginBottom: '8px' }}>
                    <button className="vps-toggle" onClick={() => setVpsShowErrors((v) => !v)} style={{ color: '#fca5a5' }}>
                      {vpsShowErrors ? '▲ Ocultar errores' : `▼ Ver errores recientes (${vpsStats.errors.length})`}
                    </button>
                    {vpsShowErrors ? (
                      <div className="vps-log-panel" style={{ color: '#fca5a5' }}>{vpsStats.errors.join('\n')}</div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="su-card-sub">{vpsLoading ? 'Cargando...' : 'Sin datos. Solo disponible en VPS.'}</div>
            )}

            <div className="su-actions" style={{ justifyContent: 'flex-end', marginTop: '8px' }}>
              <button className="su-btn su-btn-secondary" onClick={() => void cargarVpsStats()} disabled={vpsLoading}>
                {vpsLoading ? 'Actualizando...' : 'Refrescar'}
              </button>
            </div>
          </section>

          <section className="su-card">
            <div className="su-card-title">Vaciar catalogo contable de empresa</div>
            <div className="su-card-sub">
              Borra el catalogo contable operativo de la empresa actual y sus asientos, dejando la empresa lista para volver a inicializar desde base o importar un modelo propio.
            </div>
            <div className="su-badge">Empresa actual: {empresaNombre} (#{empresaId})</div>
            <ul className="su-list">
              <li>No toca el Plan de Cuentas (BASE).</li>
              <li>No toca Combustibles / Fusion.</li>
              <li>Se usa solo para soporte, migraciones o reinicios controlados.</li>
            </ul>
            <button className="su-btn su-btn-danger" onClick={() => { setPassword(''); setPasswordError(''); setModalOpen(true); }} disabled={working}>
              Vaciar catalogo empresa
            </button>
          </section>

          <section className="su-card">
            <div className="su-card-title">Publicar frontend</div>
            <div className="su-card-sub">
              {publishIsBuildOnly
                ? 'Compila el frontend usando la configuración actual del entorno local.'
                : 'Compila el frontend desde una carpeta fuente configurada en el VPS, respalda la publicación actual y reemplaza el sitio publicado.'}
            </div>
            {!publishIsBuildOnly && syncCheck?.available ? (
              <div className={`su-chip ${syncCheck.pending_update ? 'warn' : syncCheck.error ? 'info' : 'ok'}`}>
                {syncCheck.pending_update
                  ? 'Hay cambios remotos pendientes'
                  : syncCheck.error
                    ? 'No se pudo validar cambios remotos'
                    : 'Fuente sincronizada con remoto'}
              </div>
            ) : null}
            <div className="su-meta">
              <div className="su-meta-item">
                <div className="su-meta-label">Estado</div>
                <div className="su-meta-value">
                  {deployStatus?.running ? 'Publicando...' : deployStatus?.ok === true ? 'Última publicación OK' : deployStatus?.ok === false ? 'Última publicación con error' : 'Sin ejecuciones'}
                </div>
              </div>
              <div className="su-meta-item">
                <div className="su-meta-label">Fuente</div>
                <div className="su-meta-value">
                  {deployStatus?.config?.source_dir || 'Sin configurar'}
                </div>
              </div>
              {!publishIsBuildOnly ? (
                <div className="su-meta-item">
                  <div className="su-meta-label">Publicación</div>
                  <div className="su-meta-value">
                    {deployStatus?.config?.publish_dir || 'Sin configurar'}
                  </div>
                </div>
              ) : null}
              <div className="su-meta-item">
                <div className="su-meta-label">Build</div>
                <div className="su-meta-value">
                  {deployStatus?.config?.build_cmd || 'npm run build'}
                </div>
              </div>
              <div className="su-meta-item">
                <div className="su-meta-label">Supabase actual</div>
                <div className="su-meta-value">
                  {deployStatus?.config?.current_supabase_url || 'Sin configurar'}
                </div>
              </div>
              <div className="su-meta-item">
                <div className="su-meta-label">Anon key actual</div>
                <div className="su-meta-value">
                  {deployStatus?.config?.current_anon_key_masked || 'Sin configurar'}
                </div>
              </div>
            </div>
            <ul className="su-list">
              {publishIsBuildOnly ? (
                <li>En este entorno solo compila, porque `build` y el destino final son el mismo directorio.</li>
              ) : (
                <li>Hace respaldo automático del frontend actual.</li>
              )}
              <li>Usa la configuración específica del destino seleccionado.</li>
              {!publishIsBuildOnly ? (
                <li>Si la carpeta fuente no existe, mostrará el error y no tocará la publicación actual.</li>
              ) : null}
            </ul>
            {deployStatus?.error ? <div className="su-msg err" style={{ marginBottom: '12px' }}>{deployStatus.error}</div> : null}
            <div className="su-actions" style={{ justifyContent: 'space-between' }}>
              <button className="su-btn su-btn-secondary" onClick={() => void cargarDeployStatus()} disabled={deployWorking}>
                Refrescar estado
              </button>
              <button
                className="su-btn su-btn-danger"
                onClick={abrirPublicacionFrontend}
                disabled={deployWorking || deployStatus?.running}
              >
                {deployStatus?.running ? (publishIsBuildOnly ? 'Compilando...' : 'Publicando...') : (publishIsBuildOnly ? 'Compilar frontend' : 'Publicar frontend')}
              </button>
            </div>
          </section>
        </div>
      </div>

      {modalOpen ? (
        <div className="su-modal-overlay">
          <div className="su-modal">
            <div className="su-modal-title">Confirmar operacion sensible</div>
            <div className="su-modal-sub">
              Esta accion eliminara el catalogo contable y los asientos de <strong>{empresaNombre}</strong>. La empresa quedara vacia para volver a cargar su modelo.
            </div>
            <div className="su-modal-warn">
              Esta operacion no se puede deshacer desde la interfaz. Para continuar, valide su contrasena de superusuario.
            </div>
            <label className="su-label">Contrasena de superusuario</label>
            <input
              className="su-input"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && ejecutarResetCatalogo()}
              autoFocus
              placeholder="Su contrasena de acceso"
            />
            {passwordError ? <div style={{ marginTop: '8px', fontSize: '12px', color: '#ffb3bb', fontWeight: 700 }}>{passwordError}</div> : null}
            <div className="su-actions">
              <button className="su-btn su-btn-secondary" onClick={() => setModalOpen(false)} disabled={working}>
                Cancelar
              </button>
              <button className="su-btn su-btn-danger" onClick={ejecutarResetCatalogo} disabled={working || !password}>
                {working ? 'Verificando...' : 'Confirmar vaciado'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {syncModalOpen ? (
        <div className="su-modal-overlay">
          <div className="su-modal">
            <div className="su-modal-title">Confirmar sincronizacion de frontend</div>
            <div className="su-modal-sub">
              Esta acción ejecutará el comando configurado en el servidor para actualizar el código fuente del frontend.
            </div>
            <div className="su-modal-warn">
              La sincronización no publica el sitio. Después de completarla, debe usar `Publicar frontend` para compilar y activar el cambio.
            </div>
            <div className="su-progress">
              <div className="su-progress-head">
                <span className="su-progress-label">Progreso de sincronizacion</span>
                <span className="su-progress-pct">{syncProgress}%</span>
              </div>
              <div className="su-progress-track">
                <div className="su-progress-fill" style={{ width: `${syncProgress}%` }} />
              </div>
            </div>
            {syncSummary ? (
              <div className="su-summary">
                <div className="su-summary-title">Resumen de sincronizacion</div>
                <div className="su-summary-grid">
                  <div className="su-summary-item">
                    <div className="su-summary-label">Detectados</div>
                    <div className="su-summary-value">{syncSummary.detected}</div>
                  </div>
                  <div className="su-summary-item">
                    <div className="su-summary-label">Subidos</div>
                    <div className="su-summary-value">{syncSummary.uploaded}</div>
                  </div>
                  <div className="su-summary-item">
                    <div className="su-summary-label">Eliminados</div>
                    <div className="su-summary-value">{syncSummary.removed}</div>
                  </div>
                  <div className="su-summary-item">
                    <div className="su-summary-label">Borrar remotos</div>
                    <div className="su-summary-value">{syncSummary.deleteRemoved}</div>
                  </div>
                </div>
              </div>
            ) : null}
            {deployStatus?.sync?.logs?.length ? (
              <div className="su-log">{deployStatus.sync.logs.join('\n')}</div>
            ) : null}
            <label className="su-label">Contrasena de superusuario</label>
            <input
              className="su-input"
              type="password"
              value={syncPassword}
              onChange={(e) => {
                setSyncPassword(e.target.value);
                setSyncPasswordError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && ejecutarSyncFrontend()}
              autoFocus
              placeholder="Su contrasena de acceso"
            />
            {syncPasswordError ? <div style={{ marginTop: '8px', fontSize: '12px', color: '#ffb3bb', fontWeight: 700 }}>{syncPasswordError}</div> : null}
            <div className="su-actions">
              <button className="su-btn su-btn-secondary" onClick={() => setSyncModalOpen(false)} disabled={syncWorking}>
                Cancelar
              </button>
              <button className="su-btn su-btn-danger" onClick={ejecutarSyncFrontend} disabled={syncWorking || !syncPassword}>
                {syncWorking ? 'Sincronizando...' : 'Confirmar sincronizacion'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {fileSyncModalOpen ? (
        <div className="su-modal-overlay">
          <div className="su-modal" style={{ width: 'min(760px, 94vw)' }}>
            <div className="su-modal-title">Enviar archivos seleccionados al VPS</div>
            <div className="su-modal-sub">
              Marque los archivos cambiados que desea subir. El sistema calcula el destino remoto segun la ruta del archivo dentro del repo.
            </div>
            <div className="su-modal-warn">
              Este paso solo sube archivos. Si el cambio afecta backend, luego reinicie `pm2`. Si afecta frontend, despues compile y publique.
            </div>
            <div className="su-progress">
              <div className="su-progress-head">
                <span className="su-progress-label">Progreso del envio selectivo</span>
                <span className="su-progress-pct">{fileSyncProgress}%</span>
              </div>
              <div className="su-progress-track">
                <div className="su-progress-fill" style={{ width: `${fileSyncProgress}%` }} />
              </div>
            </div>
            {!deployStatus?.file_sync?.running && deployStatus?.file_sync?.ok === true ? (
              <div className="su-msg ok" style={{ marginTop: '12px' }}>
                Envio finalizado correctamente. Revise el resumen y los logs para confirmar los archivos subidos.
              </div>
            ) : null}
            {!deployStatus?.file_sync?.running && deployStatus?.file_sync?.ok === false ? (
              <div className="su-msg err" style={{ marginTop: '12px' }}>
                El envio termino con error. Revise los logs para ver el punto exacto del fallo.
              </div>
            ) : null}
            <div className="su-actions" style={{ justifyContent: 'space-between', marginTop: '12px' }}>
              <button className="su-btn su-btn-secondary" onClick={() => void cargarFileCandidates()} disabled={fileCandidatesLoading || fileSyncWorking || !!deployStatus?.file_sync?.running}>
                {fileCandidatesLoading ? 'Cargando...' : 'Recargar lista'}
              </button>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="su-btn su-btn-secondary" onClick={seleccionarTodosFiles} disabled={!supportedCandidates.length || fileSyncWorking || !!deployStatus?.file_sync?.running}>
                  Seleccionar todos
                </button>
                <button className="su-btn su-btn-secondary" onClick={limpiarSeleccionFiles} disabled={!selectedFiles.length || fileSyncWorking || !!deployStatus?.file_sync?.running}>
                  Limpiar
                </button>
              </div>
            </div>
            <label className="su-label">Buscar archivo</label>
            <input
              className="su-input"
              type="text"
              value={fileSearch}
              onChange={(e) => setFileSearch(e.target.value)}
              disabled={!!deployStatus?.file_sync?.running}
              placeholder="Filtrar por ruta, nombre o destino remoto"
            />
            <div style={{ marginTop: '10px' }} />
            <div className="su-summary">
              <div className="su-summary-title">Archivos detectados</div>
              <div className="su-summary-grid">
                <div className="su-summary-item">
                  <div className="su-summary-label">Compatibles</div>
                  <div className="su-summary-value">{filteredSupportedCandidates.length}</div>
                </div>
                <div className="su-summary-item">
                  <div className="su-summary-label">No mapeados</div>
                  <div className="su-summary-value">{filteredUnsupportedCandidates.length}</div>
                </div>
                <div className="su-summary-item">
                  <div className="su-summary-label">Seleccionados</div>
                  <div className="su-summary-value">{selectedFiles.length}</div>
                </div>
              </div>
            </div>
            <div className="su-log" style={{ maxHeight: '280px' }}>
              {fileCandidatesLoading ? 'Cargando archivos candidatos...' : (
                filteredSupportedCandidates.length || filteredUnsupportedCandidates.length
                  ? ''
                  : fileSearchNeedle
                    ? 'No hay archivos que coincidan con la busqueda.'
                    : 'No hay archivos cambiados detectados en el repo local.'
              )}
              {filteredSupportedCandidates.map((item) => (
                <label key={item.path} style={{ display: 'block', marginBottom: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedFiles.includes(item.path)}
                    onChange={() => toggleSelectedFile(item.path)}
                    disabled={!!deployStatus?.file_sync?.running}
                    style={{ marginRight: '8px' }}
                  />
                  <span>{item.path}</span>
                  <div style={{ fontSize: '10px', color: '#8ea3c7', marginLeft: '22px' }}>{item.remote_path}</div>
                </label>
              ))}
              {filteredUnsupportedCandidates.length ? (
                <div style={{ marginTop: '10px', fontSize: '11px', color: '#ffb3bb' }}>
                  {filteredUnsupportedCandidates.map((item) => `[sin mapeo] ${item.path}`).join('\n')}
                </div>
              ) : null}
            </div>
            {deployStatus?.file_sync?.logs?.length ? (
              <div className="su-log">{deployStatus.file_sync.logs.join('\n')}</div>
            ) : null}
            <label className="su-label">Rutas a enviar</label>
            <textarea
              className="su-input"
              rows={6}
              value={selectedFiles.join('\n')}
              onChange={(e) => {
                const next = e.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
                setSelectedFiles(Array.from(new Set(next)));
                setFileSyncPasswordError('');
              }}
              disabled={!!deployStatus?.file_sync?.running}
              placeholder="Una ruta por linea. Tambien puede pegar rutas manualmente si aparecen en la lista."
            />
            <div style={{ marginTop: '10px' }} />
            <label className="su-label">Contrasena de superusuario</label>
            <input
              className="su-input"
              type="password"
              value={fileSyncPassword}
              onChange={(e) => {
                setFileSyncPassword(e.target.value);
                setFileSyncPasswordError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && ejecutarFileSync()}
              disabled={!!deployStatus?.file_sync?.running}
              autoFocus
              placeholder="Su contrasena de acceso"
            />
            {fileSyncPasswordError ? <div style={{ marginTop: '8px', fontSize: '12px', color: '#ffb3bb', fontWeight: 700 }}>{fileSyncPasswordError}</div> : null}
            <div className="su-actions">
              <button className="su-btn su-btn-secondary" onClick={() => setFileSyncModalOpen(false)} disabled={fileSyncWorking || !!deployStatus?.file_sync?.running}>
                {!deployStatus?.file_sync?.running && deployStatus?.file_sync?.ok === true ? 'Cerrar' : 'Cancelar'}
              </button>
              {selectedHasFrontendFiles ? (
                <button
                  className="su-btn su-btn-secondary"
                  onClick={() => void ejecutarVpsPublish()}
                  disabled={fileSyncWorking || !!deployStatus?.file_sync?.running || !fileSyncPassword || !selectedFiles.length}
                  title="Sube los archivos seleccionados al VPS y compila el frontend remotamente"
                >
                  {deployStatus?.file_sync?.running ? 'Publicando...' : 'Subir y publicar en VPS'}
                </button>
              ) : null}
              <button className="su-btn su-btn-danger" onClick={ejecutarFileSync} disabled={fileSyncWorking || !!deployStatus?.file_sync?.running || !fileSyncPassword || !selectedFiles.length}>
                {deployStatus?.file_sync?.running ? 'Enviando...' : !deployStatus?.file_sync?.running && deployStatus?.file_sync?.ok === true ? 'Envio completado' : 'Confirmar envio'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deployModalOpen ? (
        <div className="su-modal-overlay">
          <div className="su-modal">
            <div className="su-modal-title">Confirmar publicación de frontend</div>
            <div className="su-modal-sub">
              {publishIsBuildOnly
                ? 'Esta acción compilará el frontend con la configuración actual del entorno local.'
                : 'Esta acción compilará el frontend en el VPS y reemplazará la publicación actual con respaldo previo.'}
            </div>
            <div className="su-modal-warn">
              {publishIsBuildOnly
                ? 'Confirme el origen de Supabase antes de compilar. En local no se hará copia final porque `build` ya es el destino.'
                : 'Confirme el origen de Supabase antes de publicar. El build se generará con estos valores y reemplazará la publicación actual con respaldo previo.'}
            </div>
            <div className="su-progress">
              <div className="su-progress-head">
                <span className="su-progress-label">{publishIsBuildOnly ? 'Progreso de compilacion' : 'Progreso de publicacion'}</span>
                <span className="su-progress-pct">{deployProgress}%</span>
              </div>
              <div className="su-progress-track">
                <div className="su-progress-fill" style={{ width: `${deployProgress}%` }} />
              </div>
            </div>
            {deployRunning ? (
              <div className="su-msg" style={{ marginTop: '14px', marginBottom: 0, background: '#1a2740', border: '1px solid rgba(96,165,250,.24)', color: '#bfdbfe' }}>
                {publishIsBuildOnly
                  ? 'La compilacion sigue en curso. Espere el cierre del proceso y el resumen final en los logs.'
                  : 'La publicacion sigue en curso. Espere el cierre del proceso y el resumen final en los logs.'}
              </div>
            ) : deployStatus?.ok === true ? (
              <div className="su-msg ok" style={{ marginTop: '14px', marginBottom: 0 }}>
                {publishIsBuildOnly
                  ? 'Compilacion finalizada correctamente. Revise el resumen y los logs para confirmar el resultado.'
                  : 'Publicacion finalizada correctamente. Revise el resumen y los logs para confirmar el resultado.'}
              </div>
            ) : deployStatus?.ok === false ? (
              <div className="su-msg err" style={{ marginTop: '14px', marginBottom: 0 }}>
                {publishIsBuildOnly
                  ? 'La compilacion termino con error. Revise los logs antes de volver a intentar.'
                  : 'La publicacion termino con error. Revise los logs antes de volver a intentar.'}
              </div>
            ) : null}
            {deployStatus?.logs?.length ? (
              <div className="su-log">{deployStatus.logs.join('\n')}</div>
            ) : null}
            <label className="su-label">SUPABASE URL</label>
            <input
              className="su-input"
              type="text"
              value={deploySupabaseUrl}
              onChange={(e) => setDeploySupabaseUrl(e.target.value)}
              disabled={deployWorking || deployRunning}
              autoComplete="off"
              name="frontend-supabase-url"
              placeholder="https://supabase.visionzn.net"
            />
            <div style={{ marginTop: '10px' }} />
            <label className="su-label">ANON KEY</label>
            <input
              className="su-input"
              type="password"
              value={deployAnonKey}
              onChange={(e) => setDeployAnonKey(e.target.value)}
              disabled={deployWorking || deployRunning}
              autoComplete="new-password"
              name="frontend-anon-key"
              placeholder={hasStoredAnonKey ? 'Deje vacío para conservar la anon key actual' : 'Pegue la anon key / public key del entorno'}
            />
            <div style={{ marginTop: '10px' }} />
            <label className="su-label">API URL</label>
            <input
              className="su-input"
              type="text"
              value={deployApiUrl}
              onChange={(e) => setDeployApiUrl(e.target.value)}
              disabled={deployWorking || deployRunning}
              autoComplete="off"
              name="frontend-api-url"
              placeholder="https://api.visionzn.net"
            />
            <div style={{ marginTop: '10px' }} />
            <label className="su-label">Contrasena de superusuario</label>
            <input
              className="su-input"
              type="password"
              value={deployPassword}
              onChange={(e) => {
                setDeployPassword(e.target.value);
                setDeployPasswordError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && ejecutarDeployFrontend()}
              disabled={deployWorking || deployRunning}
              autoComplete="current-password"
              name="superuser-password"
              autoFocus={!deployRunning}
              placeholder="Su contrasena de acceso"
            />
            {deployPasswordError ? <div style={{ marginTop: '8px', fontSize: '12px', color: '#ffb3bb', fontWeight: 700 }}>{deployPasswordError}</div> : null}
            <div className="su-actions">
              <button className="su-btn su-btn-secondary" onClick={() => setDeployModalOpen(false)} disabled={deployWorking || deployRunning}>
                {!deployRunning && deployStatus?.ok === true ? 'Cerrar' : 'Cancelar'}
              </button>
              <button className="su-btn su-btn-danger" onClick={ejecutarDeployFrontend} disabled={deployWorking || deployRunning || !deployPassword || !deploySupabaseUrl.trim() || (!deployAnonKey.trim() && !hasStoredAnonKey) || !deployApiUrl.trim()}>
                {deployRunning
                  ? (publishIsBuildOnly ? 'Compilacion en curso' : 'Publicacion en curso')
                  : !deployRunning && deployStatus?.ok === true
                    ? (publishIsBuildOnly ? 'Compilacion completada' : 'Publicacion completada')
                    : deployWorking
                      ? (publishIsBuildOnly ? 'Compilando...' : 'Publicando...')
                      : (publishIsBuildOnly ? 'Confirmar compilación' : 'Confirmar publicación')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
