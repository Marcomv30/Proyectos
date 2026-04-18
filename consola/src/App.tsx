import { Fragment, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Activity,
  BadgeCheck,
  Cable,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  DollarSign,
  FileText,
  Fuel,
  Gauge,
  KeyRound,
  LogOut,
  Menu,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';

import { supabase } from './supabase';
import CombustibleModule from './pages/combustible/CombustibleModule';
import CierreReportePage, { type CierreMya as CierreMyaReport } from './pages/turnos/CierreReportePage';

type RouteKey =
  | 'dashboard'
  | 'surtidores'
  | 'lecturas'
  | 'autorizaciones'
  | 'dispositivos'
  | 'configuracion'
  | 'bitacora'
  | 'precios';

type EmpresaOpcion = {
  id: number;
  nombre: string;
  codigo?: string | null;
};

type TempSession = {
  access_token: string;
  refresh_token: string;
};

type LoginState = {
  empresaId: number;
  empresaNombre: string;
  empresaCodigo: string;
  usuarioNombre: string;
  esSuperusuario: boolean;
};

type FusionStatus = {
  ok?: boolean;
  // Campos legacy (por compatibilidad)
  running?: boolean;
  connected?: boolean;
  sync_running?: boolean;
  // Campos reales del endpoint /api/combustible/status
  instancia_activa?: boolean;
  instancia_saludable?: boolean;
  sync_estado?: string;        // 'pg' | 'http' | 'disconnected'
  sync_en_curso?: boolean;
  active_tunnel_port?: number | null;
  ultima_sync?: string | null;
  ultima_ejecucion?: string | null;
  ultimo_error_sync?: string | null;
  // Otros
  tunnel_ok?: boolean;
  tcp_ok?: boolean;
  ws_port?: number | null;
  [key: string]: unknown;
};

type VentaFusion = {
  sale_id?: number;
  end_at?: string | null;
  volume?: number | null;
  amount?: number | null;
  pump_id?: number | null;
  bomba?: string | null;
  combustible?: string | null;
  payment_type?: string | null;
  [key: string]: unknown;
};

type TurnoFusion = {
  period_id?: number;
  period_status?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  pump_id?: number | null;
  [key: string]: unknown;
};

type ConsolaSnapshot = {
  status: FusionStatus | null;
  ventas: VentaFusion[];
  turnos: TurnoFusion[];
  config: Record<string, unknown> | null;
};


type VirReading = {
  ok?: boolean;
  pump_id?: string;
  device_id?: string | null;
  entity_id?: string | null;
  card_number?: string | null;
  vehicle_hint?: string | null;
  holder_name?: string | null;
  raw?: string;
  fields?: Record<string, string>;
};

type AuthPreview = {
  ok?: boolean;
  error?: string;
  pump_id?: string;
  command_preview?: string;
  command?: string;
  params?: Record<string, string | null>;
  fields?: Record<string, string>;
  raw?: string;
};

type DeviceCatalogItem = {
  id: number;
  empresa_id: number;
  tipo_dispositivo: string;
  identificador_uid: string;
  alias?: string | null;
  estado?: string | null;
  usuario_id?: number | null;
  attendant_id?: string | null;
  operador_nombre?: string | null;
  vehiculo_codigo?: string | null;
  placa?: string | null;
  pump_id_preferido?: number | null;
  grade_id_preferido?: number | null;
  payment_type?: string | null;
  payment_info?: string | null;
  notas?: string | null;
  ultimo_leido_at?: string | null;
};

const API = process.env.REACT_APP_API_URL || '';
const MODULO_CODIGO = 'combustible';
const OPERATIONS_MENU: Array<{ key: RouteKey; label: string; icon: typeof Activity }> = [
  { key: 'dashboard', label: 'Combustible', icon: Activity },
  { key: 'surtidores', label: 'Surtidores', icon: Gauge },
  { key: 'lecturas', label: 'Lecturas VIR', icon: ScanLine },
  { key: 'autorizaciones', label: 'Turnos', icon: Clock },
];

const ADMIN_MENU: Array<{ key: RouteKey; label: string; icon: typeof Activity }> = [
  { key: 'precios', label: 'Precios', icon: DollarSign },
  { key: 'dispositivos', label: 'Dispositivos', icon: KeyRound },
  { key: 'configuracion', label: 'Configuracion', icon: Cable },
  { key: 'bitacora', label: 'Bitacora', icon: BadgeCheck },
];

// ─── Toast system ─────────────────────────────────────────────────────────────

type Toast = { id: number; message: string; sub?: string; color: 'emerald' | 'amber' | 'red' };
let _toastSeq = 0;
const _toastListeners = new Set<(t: Toast) => void>();
function pushToast(toast: Omit<Toast, 'id'>) {
  const t = { ...toast, id: ++_toastSeq };
  _toastListeners.forEach(fn => fn(t));
}

function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const fn = (t: Toast) => {
      setToasts(prev => [...prev.slice(-4), t]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 4500);
    };
    _toastListeners.add(fn);
    return () => { _toastListeners.delete(fn); };
  }, []);

  if (!toasts.length) return null;

  const colorMap = {
    emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
    amber:   'border-amber-500/40   bg-amber-500/10   text-amber-200',
    red:     'border-red-500/40     bg-red-500/10     text-red-200',
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`rounded-2xl border px-4 py-3 shadow-xl text-sm backdrop-blur-sm transition-all ${colorMap[t.color]}`}
          style={{ animation: 'toast-in 0.2s ease-out' }}
        >
          <div className="font-semibold">{t.message}</div>
          {t.sub && <div className="mt-0.5 text-xs opacity-70">{t.sub}</div>}
        </div>
      ))}
      <style>{`@keyframes toast-in { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}

function fmtNumber(value: number | null | undefined, digits = 0) {
  return new Intl.NumberFormat('es-CR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return 'Sin dato';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('es-CR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Costa_Rica',
  }).format(date);
}

function parseApiError(raw: string, status: number) {
  if (!raw) return `Error HTTP ${status}`;
  try {
    const parsed = JSON.parse(raw) as { error?: string; message?: string };
    return parsed.error || parsed.message || `Error HTTP ${status}`;
  } catch {
    if (raw.trim().startsWith('<')) return `Servidor devolvio HTML: ${status}`;
    return raw;
  }
}

async function parseJson<T>(resp: Response): Promise<T> {
  const raw = await resp.text();
  if (!resp.ok) throw new Error(parseApiError(raw, resp.status));
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

// ─── Helpers de formulario ────────────────────────────────────────────────────

const inputCls = 'w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-slate-100 outline-none';
const labelCls = 'mb-2 block text-xs uppercase tracking-[0.25em] text-slate-500';

function Field({
  label,
  children,
  span2 = false,
}: {
  label: string;
  children: ReactNode;
  span2?: boolean;
}) {
  return (
    <div className={span2 ? 'md:col-span-2' : undefined}>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

// ─── Surtidores ───────────────────────────────────────────────────────────────

type LivePumpState = {
  pump_id: number;
  status: string;
  hose_id: string | null;
  grade: string | null;
  volume: number | null;
  money: number | null;
  ppu: number | null;
  ts: string | null;
  // solo para la bomba seleccionada (ultima venta)
  last_volume?: number | null;
  last_money?: number | null;
};

function pumpStatusColor(status: string | null | undefined): string {
  const v = String(status || '').toUpperCase();
  if (v === 'IDLE') return '#22c55e';
  if (v === 'CALLING' || v === 'AUTHORIZED') return '#38bdf8';
  if (v === 'STARTING' || v === 'FUELLING') return '#f59e0b';
  if (v === 'PAUSED') return '#a78bfa';
  if (v === 'ERROR' || v === 'STOP') return '#f87171';
  return '#475569';
}

function pumpStatusLabel(status: string | null | undefined) {
  const v = String(status || '').toUpperCase();
  if (v === 'IDLE') return 'Libre';
  if (v === 'CALLING') return 'Llamando';
  if (v === 'AUTHORIZED') return 'Autorizada';
  if (v === 'STARTING') return 'Iniciando';
  if (v === 'FUELLING') return 'Despachando';
  if (v === 'PAUSED') return 'Pausada';
  if (v === 'ERROR') return 'Error';
  if (v === 'STOP') return 'Detenida';
  if (v === 'UNKNOWN') return 'Sin señal';
  return status || '—';
}

function buildInitialPumps(): Record<number, LivePumpState> {
  const out: Record<number, LivePumpState> = {};
  for (let i = 1; i <= 10; i++) {
    out[i] = { pump_id: i, status: 'UNKNOWN', hose_id: null, grade: null, volume: null, money: null, ppu: null, ts: null };
  }
  return out;
}

async function resolveWsUrl(): Promise<string> {
  const apiBase = process.env.REACT_APP_API_URL;
  if (apiBase) return apiBase.replace(/^http/, 'ws') + '/ws/combustible';
  try {
    const resp = await fetch('/api/runtime');
    const body = await resp.json() as { port?: number };
    if (body?.port) {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      return `${proto}://${window.location.hostname}:${body.port}/ws/combustible`;
    }
  } catch {}
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws/combustible`;
}

type PumpAction = {
  label: string;
  path: string;
  tone: 'danger' | 'warning' | 'neutral';
  description: string;
};

function actionsForStatus(status: string | null | undefined): PumpAction[] {
  const v = String(status || '').toUpperCase();
  if (v === 'CALLING' || v === 'AUTHORIZED') return [
    { label: 'Desautorizar', path: 'desautorizar', tone: 'warning', description: 'Cancela la autorizacion antes de que inicie el despacho.' },
  ];
  if (v === 'STARTING') return [
    { label: 'Desautorizar', path: 'desautorizar', tone: 'warning', description: 'Cancela la autorizacion antes de que inicie el despacho.' },
    { label: 'Detener', path: 'detener', tone: 'danger', description: 'Detiene la bomba de forma inmediata.' },
  ];
  if (v === 'FUELLING') return [
    { label: 'Pausar', path: 'pausar', tone: 'warning', description: 'Pausa el despacho en curso sin cancelarlo.' },
    { label: 'Detener', path: 'detener', tone: 'danger', description: 'Detiene el despacho de forma inmediata.' },
  ];
  if (v === 'PAUSED') return [
    { label: 'Reanudar', path: 'reanudar', tone: 'neutral', description: 'Reanuda el despacho que fue pausado.' },
    { label: 'Detener', path: 'detener', tone: 'danger', description: 'Cancela el despacho definitivamente.' },
  ];
  if (v === 'ERROR' || v === 'STOP') return [
    { label: 'Detener', path: 'detener', tone: 'danger', description: 'Intenta limpiar el estado de error.' },
  ];
  return [];
}

const ACTION_TONE = {
  danger:  'border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20',
  neutral: 'border-slate-600 bg-slate-800/60 text-slate-200 hover:bg-slate-800',
} as const;

type GradeInfo = {
  grade_id: number;
  nombre: string;
  color: string | null;
};

const COMBUSTIBLE_COLORS: Record<string, string> = {
  'Regular': '#22c55e',
  'Super':   '#a855f7',
  'Diesel':  '#38bdf8',
  'Gas LP':  '#f59e0b',
};

type PisteroSesion = {
  id?: number;
  pump_id: number;
  attendant_id?: string | null;
  operador_nombre?: string | null;
  vehiculo_codigo?: string | null;
  placa?: string | null;
  inicio_at?: string;
  auto_auth?: boolean;
  origen?: string;
};

function SurtidoresPage({
  empresaId,
  token,
  onNavigate,
}: {
  empresaId: number;
  token: string;
  onNavigate: (route: RouteKey) => void;
}) {
  const [pumps, setPumps] = useState<Record<number, LivePumpState>>(buildInitialPumps);
  const [selected, setSelected] = useState(1);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [grades, setGrades] = useState<Record<number, GradeInfo>>({});

  // Pisteros activos por bomba
  const [pisteros, setPisteros] = useState<Record<number, PisteroSesion>>({});
  const [ventas, setVentas] = useState<Array<Record<string, unknown>>>([]);
  const [ventasLoading, setVentasLoading] = useState(false);
  const [ventasFiltro, setVentasFiltro] = useState<'hoy' | 'turno' | 'todo'>('hoy');
  const [turnoActivo, setTurnoActivo] = useState<{ start_at?: string } | null>(null);
  // Asignación manual
  const [assignPanel, setAssignPanel] = useState(false);
  const [devices, setDevices] = useState<DeviceCatalogItem[]>([]);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<number | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);

  // Accion pendiente de confirmar
  const [pending, setPending] = useState<{ action: PumpAction; pumpId: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<{ ok: boolean; message: string; raw?: string } | null>(null);

  // Cargar grados desde Supabase
  useEffect(() => {
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('grados_combustible')
          .select('grade_id, nombre')
          .eq('empresa_id', empresaId);
        if (error || !data) return;
        const map: Record<number, GradeInfo> = {};
        data.forEach((g) => {
          map[g.grade_id] = {
            grade_id: g.grade_id,
            nombre: g.nombre,
            color: COMBUSTIBLE_COLORS[g.nombre] ?? null,
          };
        });
        setGrades(map);
      } catch {}
    })();
  }, [empresaId]);

  // Cargar sesiones de pistero activas
  useEffect(() => {
    void (async () => {
      try {
        const resp = await fetch(`${API}/api/consola/pisteros/activas?empresa_id=${empresaId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await resp.json() as { ok?: boolean; sesiones?: PisteroSesion[] };
        if (data.ok && data.sesiones) {
          const map: Record<number, PisteroSesion> = {};
          data.sesiones.forEach((s) => { if (s.pump_id) map[s.pump_id] = s; });
          setPisteros(map);
        }
      } catch {}
    })();
  }, [empresaId, token]);

  const loadDevices = useCallback(async () => {
    if (devicesLoaded) return;
    try {
      const { data } = await supabase
        .from('comb_dispositivos_identidad')
        .select('id, operador_nombre, alias, attendant_id, estado')
        .eq('empresa_id', empresaId)
        .eq('estado', 'activo');
      setDevices((data as DeviceCatalogItem[]) ?? []);
    } catch {}
    setDevicesLoaded(true);
  }, [empresaId, devicesLoaded]);

  const loadVentas = useCallback(async (filtro?: 'hoy' | 'turno' | 'todo') => {
    const f = filtro ?? ventasFiltro;
    setVentasLoading(true);
    try {
      const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Costa_Rica' });
      const params = new URLSearchParams({ empresa_id: String(empresaId) });
      if (f === 'hoy') params.set('fecha', hoy);
      const resp = await fetch(`${API}/api/fusion/ventas?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json() as Array<Record<string, unknown>>;
      setVentas(Array.isArray(data) ? data : []);
    } catch {}
    setVentasLoading(false);
  }, [empresaId, token, ventasFiltro]);

  useEffect(() => { void loadVentas(); }, [loadVentas]);

  // Refrescar ventas cada 15s
  useEffect(() => {
    const t = setInterval(() => { void loadVentas(); }, 15000);
    return () => clearInterval(t);
  }, [loadVentas]);

  const loadSnapshot = useCallback(async () => {
    try {
      const resp = await fetch(`${API}/api/combustible/estados`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const data = await resp.json() as LivePumpState[];
      setPumps((prev) => {
        const next = { ...prev };
        data.forEach((p) => { if (p.pump_id) next[p.pump_id] = { ...next[p.pump_id], ...p }; });
        return next;
      });
    } catch {}
  }, [token]);

  useEffect(() => { void loadSnapshot(); }, [loadSnapshot]);

  useEffect(() => {
    fetch(`${API}/api/consola/fusion/turnos/estado?empresa_id=${empresaId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((d: { ok?: boolean; fields?: Record<string, string> }) => {
        if (d.ok && d.fields?.SSD && d.fields?.SST) {
          const { SSD, SST } = d.fields;
          setTurnoActivo({ start_at: `${SSD.slice(0,4)}-${SSD.slice(4,6)}-${SSD.slice(6,8)}T${SST.slice(0,2)}:${SST.slice(2,4)}:${SST.slice(4,6)}-06:00` });
        }
      }).catch(() => {});
  }, [empresaId, token]);

  // WebSocket en tiempo real
  useEffect(() => {
    let disposed = false;
    let retry = 0;

    const connect = async () => {
      const url = await resolveWsUrl();
      if (disposed) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => { retry = 0; setWsConnected(true); };
      ws.onerror = () => { setWsConnected(false); };
      ws.onclose = () => {
        setWsConnected(false);
        if (disposed) return;
        const wait = Math.min(3000 + retry * 1000, 10000);
        retry += 1;
        setTimeout(() => { void connect(); }, wait);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as {
            empresa_id?: number | null;
            event: string;
            data: Record<string, unknown>;
          };
          if (msg.empresa_id != null && msg.empresa_id !== empresaId) return;
          const id = Number(msg.data?.pump_id);
          if (!id) return;
          if (msg.event === 'pump_status') {
            setPumps((prev) => {
              const d = msg.data as Partial<LivePumpState>;
              const newStatus = String(d.status || '').toUpperCase();
              const idle = ['IDLE', 'CLOSED', 'ERROR', 'STOP', 'UNKNOWN'].includes(newStatus);
              return {
                ...prev,
                [id]: {
                  ...prev[id],
                  ...d,
                  // pump_status no trae progress — preservar datos de despacho salvo que la bomba ya esté libre
                  grade:  idle ? null : (d.grade  ?? prev[id]?.grade  ?? null),
                  volume: idle ? null : (d.volume ?? prev[id]?.volume ?? null),
                  money:  idle ? null : (d.money  ?? prev[id]?.money  ?? null),
                  ppu:    idle ? null : (d.ppu    ?? prev[id]?.ppu    ?? null),
                },
              };
            });
          } else if (msg.event === 'pump_delivery') {
            setPumps((prev) => ({ ...prev, [id]: { ...prev[id], ...(msg.data as Partial<LivePumpState>) } }));
          } else if (msg.event === 'pump_sale_end') {
            setPumps((prev) => ({
              ...prev,
              [id]: { ...prev[id], grade: null, volume: null, money: null, ppu: null, last_volume: (msg.data.volume as number) ?? null, last_money: (msg.data.money as number) ?? null },
            }));
            void loadVentas();
          } else if (msg.event === 'pistero_asignado') {
            const s = msg.data as PisteroSesion;
            if (s.pump_id) setPisteros(prev => ({ ...prev, [s.pump_id]: s }));
          } else if (msg.event === 'pistero_liberado') {
            const d = msg.data as { pump_id: number };
            if (d.pump_id) setPisteros(prev => { const next = { ...prev }; delete next[d.pump_id]; return next; });
          } else if (msg.event === 'hid_scan') {
            const d = msg.data as { pump_id: number; operador_nombre: string | null };
            pushToast({
              color  : 'emerald',
              message: `Bomba ${d.pump_id} — ${d.operador_nombre ?? 'Operador'}`,
              sub    : 'Brazalete leído · sesión abierta',
            });
          }
        } catch {}
      };
    };

    void connect();
    return () => { disposed = true; wsRef.current?.close(); setWsConnected(false); };
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function executeAction() {
    if (!pending) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      const url = `${API}/api/consola/fusion/surtidores/${pending.pumpId}/${pending.action.path}?empresa_id=${empresaId}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json() as { ok?: boolean; error?: string; status?: string; raw?: string; command_preview?: string };
      if (!resp.ok) {
        setActionResult({ ok: false, message: data.error || `Error HTTP ${resp.status}`, raw: data.command_preview });
      } else {
        setActionResult({ ok: true, message: data.status ? `Estado: ${data.status}` : 'Comando enviado correctamente.', raw: data.raw });
      }
    } catch (err) {
      setActionResult({ ok: false, message: err instanceof Error ? err.message : 'Error de comunicacion.' });
    } finally {
      setActionLoading(false);
      setPending(null);
    }
  }

  async function assignPistero() {
    if (!selectedDevice) return;
    setAssignLoading(true);
    setActionResult(null);
    try {
      const resp = await fetch(`${API}/api/consola/pisteros/asignar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresaId, pump_id: selected, dispositivo_id: selectedDevice }),
      });
      const data = await resp.json() as { ok?: boolean; error?: string };
      if (!resp.ok) setActionResult({ ok: false, message: data.error || `Error ${resp.status}` });
      else setActionResult({ ok: true, message: 'Pistero asignado correctamente.' });
      setAssignPanel(false);
      setSelectedDevice(null);
    } catch (err) {
      setActionResult({ ok: false, message: err instanceof Error ? err.message : 'Error de comunicacion.' });
    } finally {
      setAssignLoading(false);
    }
  }

  async function liberarPistero() {
    try {
      const resp = await fetch(`${API}/api/consola/pisteros/liberar/${selected}?empresa_id=${empresaId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json() as { ok?: boolean; error?: string };
      if (!resp.ok) setActionResult({ ok: false, message: data.error || `Error ${resp.status}` });
      else setActionResult({ ok: true, message: 'Bomba liberada.' });
    } catch (err) {
      setActionResult({ ok: false, message: err instanceof Error ? err.message : 'Error de comunicacion.' });
    }
  }

  const pump = pumps[selected];
  const pumpIdStr = String(selected).padStart(3, '0');
  const actions = actionsForStatus(pump?.status);
  const pumpIds = Array.from({ length: 10 }, (_, i) => i + 1);

  // Resuelve nombre del grado: DB por id numérico → DB por texto → COMBUSTIBLE_COLORS por texto → raw de Fusion
  function resolveGradeName(p: LivePumpState | undefined): string | null {
    if (!p?.grade) return null;
    const raw = String(p.grade);
    // 1. Lookup por grade_id numérico
    const numId = Number(raw);
    if (!Number.isNaN(numId) && grades[numId]?.nombre) return grades[numId].nombre;
    // 2. Fusion puede devolver el nombre directamente (ej. "Reg", "Sup", "Super", "Gas LP")
    //    — si ya es texto reconocible lo mostramos tal cual
    if (Number.isNaN(numId) && raw) return raw;
    // 3. Número pero sin nombre en DB
    return `Grado ${raw}`;
  }

  function resolveColor(p: LivePumpState | undefined): string {
    if (!p) return '#475569';
    const isActive = ['FUELLING', 'STARTING', 'AUTHORIZED', 'CALLING', 'PAUSED'].includes(String(p.status).toUpperCase());
    if (!isActive || !p.grade) return pumpStatusColor(p.status);
    const raw = String(p.grade);
    const numId = Number(raw);
    // 1. Color desde DB (por id numérico)
    if (!Number.isNaN(numId) && grades[numId]) {
      const c = grades[numId].color ?? COMBUSTIBLE_COLORS[grades[numId].nombre];
      if (c) return c;
    }
    // 2. Fusion devuelve texto directamente — buscar en mapa por ese texto
    if (Number.isNaN(numId)) {
      const c = COMBUSTIBLE_COLORS[raw];
      if (c) return c;
    }
    return pumpStatusColor(p.status);
  }

  return (
    <div className="space-y-5">
      <style>{`@keyframes border-travel { to { transform: rotate(360deg); } }`}</style>
      {/* Encabezado */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-50">Surtidores</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Panel de control operacional. Estado en tiempo real y acciones por bomba.
          </p>
        </div>
        <div className="flex w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs sm:w-auto sm:justify-start">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: wsConnected ? '#4ade80' : '#f87171', boxShadow: wsConnected ? '0 0 6px #4ade80' : '0 0 6px #f87171' }}
          />
          <span className="text-slate-400">{wsConnected ? 'En vivo' : 'Reconectando...'}</span>
        </div>
      </div>

      {/* Grid de bombas + panel de acciones */}
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">

        {/* Tarjetas de bombas — una por bomba con toda la info */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {pumpIds.map((id) => {
            const p = pumps[id];
            const isSelected = id === selected;
            const color = resolveColor(p);
            const gradeName = resolveGradeName(p);
            const isFuelling = ['FUELLING', 'STARTING'].includes(String(p?.status).toUpperCase());
            const isActive = ['FUELLING', 'STARTING', 'AUTHORIZED', 'CALLING'].includes(String(p?.status).toUpperCase());
            const isIdle = !isActive && String(p?.status || 'UNKNOWN').toUpperCase() !== 'PAUSED';

            return (
              <button
                key={id}
                className={`relative overflow-hidden rounded-2xl text-left transition-all ${
                  isSelected ? 'shadow-lg' : 'hover:brightness-110'
                } ${isIdle && !isSelected ? 'opacity-40' : ''}`}
                onClick={() => { setSelected(id); setPending(null); setActionResult(null); }}
                style={{
                  padding: isFuelling ? 2 : 0,
                  background: isFuelling ? `${color}55` : 'transparent',
                  border: isFuelling ? 'none' : undefined,
                  borderColor: !isFuelling ? (isActive ? `${color}55` : '#1e293b') : undefined,
                  borderLeftColor: !isFuelling ? (isActive ? color : '#334155') : undefined,
                  borderLeftWidth: !isFuelling ? 3 : undefined,
                }}
                type="button"
              >
                {/* Cometa giratorio en el borde */}
                {isFuelling && (
                  <div
                    className="pointer-events-none absolute"
                    style={{
                      inset: '-100%',
                      background: `conic-gradient(from 0deg, transparent 0%, transparent 78%, ${color}33 88%, ${color}99 93%, ${color}33 97%, transparent 100%)`,
                      animation: 'border-travel 3s linear infinite',
                    }}
                  />
                )}

                {/* Contenido sobre el cometa */}
                <div
                  className="relative rounded-2xl"
                  style={{
                    zIndex: 1,
                    background: isActive
                      ? `linear-gradient(135deg, ${color}20 0%, #0f172a 70%)`
                      : isSelected ? '#1e293b' : '#0a0f1a',
                    borderColor: !isFuelling ? undefined : undefined,
                  }}
                >

                {/* Cabecera: número de bomba */}
                <div className="px-4 pt-4">
                  <div className="text-[10px] text-slate-500">Bomba</div>
                  <div className="text-xl font-bold text-slate-100">{String(id).padStart(3, '0')}</div>
                </div>

                {/* Producto + estado */}
                <div className="px-4 pt-1.5">
                  {gradeName ? (
                    <div className="text-sm font-bold leading-tight" style={{ color }}>
                      {gradeName}
                    </div>
                  ) : null}
                  <div
                    className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: gradeName ? '#475569' : color }}
                  >
                    {pumpStatusLabel(p?.status)}
                  </div>
                </div>

                {/* Pistero asignado */}
                {pisteros[id]?.operador_nombre ? (
                  <div className="flex items-center gap-1 px-4 pt-1" style={{ color: `${color}bb` }}>
                    <User className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate text-[9px]">{pisteros[id].operador_nombre}</span>
                  </div>
                ) : null}

                {/* Dispensa en tiempo real */}
                {isFuelling && (p?.volume != null || p?.money != null) ? (
                  <div className="mt-2 border-t px-4 pb-4 pt-3" style={{ borderColor: `${color}33` }}>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-slate-500">Litros</div>
                        <div className="mt-0.5 text-sm font-semibold text-slate-100">
                          {p?.volume != null ? fmtNumber(p.volume, 2) : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-slate-500">Monto</div>
                        <div className="mt-0.5 text-sm font-semibold text-slate-100">
                          {p?.money != null ? `₡${fmtNumber(p.money, 0)}` : '—'}
                        </div>
                      </div>
                    </div>
                    {p?.ppu != null ? (
                      <div className="mt-1 text-[9px] text-slate-500">PPU ₡{fmtNumber(p.ppu, 2)}</div>
                    ) : null}
                  </div>
                ) : isActive ? (
                  /* Autorizada/llamando pero sin volumen aún */
                  <div className="px-4 pb-4 pt-2">
                    <div className="text-[10px] text-slate-500">
                      {p?.hose_id ? `Manguera ${p.hose_id}` : 'En espera de despacho'}
                    </div>
                  </div>
                ) : (
                  /* IDLE: muestra ultima venta */
                  <div className="px-4 pb-4 pt-2">
                    {p?.last_money != null ? (
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-slate-500">Ultima venta</div>
                        <div className="mt-0.5 text-xs text-slate-400">
                          ₡{fmtNumber(p.last_money, 0)} · {p?.last_volume != null ? `${fmtNumber(p.last_volume, 2)} L` : ''}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-600">Sin datos</div>
                    )}
                  </div>
                )}

                {/* Barra de progreso para despacho activo */}
                {isFuelling ? (
                  <div className="h-0.5 w-full" style={{ background: `linear-gradient(to right, ${color}, transparent)` }} />
                ) : null}
                </div>{/* fin contenido */}
              </button>
            );
          })}
        </div>

        {/* Panel de acciones de la bomba seleccionada */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className={labelCls}>Acciones — Bomba {pumpIdStr}</div>

          {pending ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                <div className="font-semibold">{pending.action.label}</div>
                <div className="mt-1 text-xs text-amber-300/80">{pending.action.description}</div>
                <div className="mt-2 text-xs text-amber-300/60">Bomba {pending.pumpId} · accion en hardware real</div>
              </div>
              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
                disabled={actionLoading}
                onClick={() => void executeAction()}
                type="button"
              >
                {actionLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                Confirmar y enviar
              </button>
              <button
                className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-950"
                onClick={() => setPending(null)}
                type="button"
              >
                Cancelar
              </button>
            </div>
          ) : actions.length > 0 ? (
            <div className="mt-4 space-y-2">
              {actions.map((action) => (
                <button
                  key={action.path}
                  className={`inline-flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition ${ACTION_TONE[action.tone]}`}
                  onClick={() => { setActionResult(null); setPending({ action, pumpId: pumpIdStr }); }}
                  type="button"
                >
                  <span>{action.label}</span>
                  <span className="text-xs opacity-60">→</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-500">
                {pump?.status === 'IDLE' || pump?.status === 'UNKNOWN'
                  ? 'Bomba libre. Para autorizar un despacho usa la vista Autorizaciones.'
                  : 'No hay acciones disponibles para el estado actual.'}
              </div>
              {pump?.status === 'IDLE' ? (
                <button
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                  onClick={() => onNavigate('autorizaciones')}
                  type="button"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Ir a Autorizaciones
                </button>
              ) : null}

              {/* Pistero asignado o asignación manual */}
              {pisteros[selected]?.operador_nombre ? (
                <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 space-y-2">
                  <div className="text-[9px] uppercase tracking-wider text-slate-500">Pistero asignado</div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-slate-100">{pisteros[selected].operador_nombre}</div>
                      {pisteros[selected].placa ? (
                        <div className="text-[10px] text-slate-500">Placa {pisteros[selected].placa}</div>
                      ) : null}
                    </div>
                  </div>
                  <button
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-700 px-3 py-2 text-xs text-slate-400 transition hover:bg-slate-950"
                    onClick={() => void liberarPistero()}
                    type="button"
                  >
                    Liberar bomba
                  </button>
                </div>
              ) : pump?.status === 'IDLE' || pump?.status === 'UNKNOWN' ? (
                <>
                  <button
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-800"
                    onClick={() => { setAssignPanel(p => !p); void loadDevices(); }}
                    type="button"
                  >
                    <User className="h-4 w-4" />
                    {assignPanel ? 'Cancelar asignación' : 'Asignar pistero manualmente'}
                  </button>
                  {assignPanel ? (
                    <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 space-y-3">
                      <div className={labelCls}>Dispositivo / Pistero</div>
                      {!devicesLoaded ? (
                        <div className="text-xs text-slate-500">Cargando dispositivos...</div>
                      ) : devices.length === 0 ? (
                        <div className="text-xs text-slate-500">No hay dispositivos activos registrados para esta empresa.</div>
                      ) : (
                        <select
                          className={inputCls + ' text-sm'}
                          value={selectedDevice ?? ''}
                          onChange={(e) => setSelectedDevice(Number(e.target.value) || null)}
                        >
                          <option value="">Seleccionar...</option>
                          {devices.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.operador_nombre || d.alias || d.attendant_id || `ID ${d.id}`}
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
                        disabled={!selectedDevice || assignLoading}
                        onClick={() => void assignPistero()}
                        type="button"
                      >
                        {assignLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                        Confirmar asignación
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          )}

          {actionResult ? (
            <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${actionResult.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
              <div className="font-medium">{actionResult.ok ? '✓' : '✗'} {actionResult.message}</div>
              {actionResult.raw ? (
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs opacity-70">{actionResult.raw}</pre>
              ) : null}
            </div>
          ) : null}

          <button
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-800 px-3 py-2 text-xs text-slate-500 transition hover:bg-slate-950"
            onClick={() => void loadSnapshot()}
            type="button"
          >
            <RefreshCw className="h-3 w-3" />
            Recargar snapshot
          </button>
        </div>
      </div>

      {/* Últimas ventas */}
      {(() => {
        const turnoStart = turnoActivo?.start_at ? new Date(turnoActivo.start_at).getTime() : null;
        const ventasPorBomba = ventas.filter(v => Number(v.pump_id) === selected);
        const ventasFiltradas = (ventasFiltro === 'turno' && turnoStart
          ? ventasPorBomba.filter(v => v.end_at && new Date(String(v.end_at)).getTime() >= turnoStart)
          : ventasPorBomba
        ).slice(0, 50);
        const pumpLabel = `Bomba ${String(selected).padStart(3, '0')}`;
        const filtroOpts: Array<{ key: typeof ventasFiltro; label: string }> = [
          { key: 'hoy', label: 'Hoy' },
          { key: 'turno', label: 'Turno actual' },
          { key: 'todo', label: 'Todo' },
        ];
        return (
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className={labelCls}>Ventas</div>
            <span className="rounded-lg bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">{pumpLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Selector de período */}
            <div className="flex rounded-xl border border-slate-700 overflow-hidden text-[10px] font-semibold">
              {filtroOpts.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setVentasFiltro(opt.key);
                    void loadVentas(opt.key);
                  }}
                  className={`px-3 py-1.5 transition ${ventasFiltro === opt.key ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition hover:bg-slate-950"
              onClick={() => void loadVentas()}
              type="button"
            >
              <RefreshCw className={`h-3 w-3 ${ventasLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        {ventasFiltradas.length === 0 ? (
          <div className="text-xs text-slate-600">{ventasLoading ? 'Cargando...' : `Sin ventas para ${pumpLabel}.`}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500">
                  <th className="pb-2 text-left">Sale#</th>
                  <th className="pb-2 text-left">Hora</th>
                  <th className="pb-2 text-left">Combustible</th>
                  <th className="pb-2 text-right">Litros</th>
                  <th className="pb-2 text-right">Monto</th>
                  <th className="pb-2 text-left">Pago</th>
                  <th className="pb-2 text-left">Pistero</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {ventasFiltradas.map((v) => {
                  const gradeName = resolveGradeName({ grade: String(v.grade_id ?? ''), pump_id: 0, status: '', hose_id: null, volume: null, money: null, ppu: null, ts: null });
                  const color = COMBUSTIBLE_COLORS[gradeName ?? ''] ?? '#475569';
                  const codigo = String(v.payment_info ?? v.attendant_id ?? '');
                  const pistero = pisteros[Number(v.pump_id)]?.operador_nombre || codigo || null;
                  const hora = v.end_at
                    ? new Date(String(v.end_at)).toLocaleTimeString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', minute: '2-digit' })
                    : '—';
                  return (
                    <tr key={String(v.sale_id)} className="text-slate-300 hover:bg-slate-800/30">
                      <td className="py-2.5 pr-4 font-mono text-slate-400">{String(v.sale_id)}</td>
                      <td className="py-2.5 pr-4 tabular-nums text-slate-500">{hora}</td>
                      <td className="py-2.5 pr-4">
                        {gradeName ? (
                          <span className="rounded-lg px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${color}22`, color }}>
                            {gradeName}
                          </span>
                        ) : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{fmtNumber(Number(v.volume ?? 0), 3)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-amber-300">₡{fmtNumber(Number(v.money ?? 0), 0)}</td>
                      <td className="py-2.5 pr-4">
                        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold ${String(v.payment_type) === 'CASH' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-sky-500/15 text-sky-300'}`}>
                          {String(v.payment_type || '—')}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-400">{pistero || <span className="text-slate-600">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
        );
      })()}
    </div>
  );
}

// ─── Lecturas VIR ─────────────────────────────────────────────────────────────

type PendingVirAction = {
  path: string;
  label: string;
  pump: string;
};

function LecturasPage({ empresaId, token }: { empresaId: number; token: string }) {
  const [pumpId, setPumpId] = useState('001');
  const [result, setResult] = useState<VirReading | null>(null);
  const [lastAction, setLastAction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Confirmacion pendiente antes de enviar un comando de escritura
  const [pending, setPending] = useState<PendingVirAction | null>(null);

  async function executeWrite(path: string, label: string) {
    const pump = String(Number(pumpId) || 0).padStart(3, '0');
    setLoading(true);
    setError('');
    setLastAction(label);
    setPending(null);
    try {
      const url = `${API}/api/consola/fusion/dispositivos/${pump}/${path}?empresa_id=${empresaId}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json() as VirReading & { error?: string; command_preview?: string };
      if (!resp.ok) throw new Error(data.error || `Error HTTP ${resp.status}`);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al comunicar con Fusion.');
    } finally {
      setLoading(false);
    }
  }

  async function readLastVir() {
    const pump = String(Number(pumpId) || 0).padStart(3, '0');
    setLoading(true);
    setError('');
    setLastAction('Ultima lectura');
    try {
      const url = `${API}/api/consola/fusion/dispositivos/${pump}/ultima-lectura?empresa_id=${empresaId}`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await resp.json() as VirReading & { error?: string };
      if (!resp.ok) throw new Error(data.error || `Error HTTP ${resp.status}`);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al comunicar con Fusion.');
    } finally {
      setLoading(false);
    }
  }

  const pumps = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(3, '0'));
  const pendingPump = String(Number(pumpId) || 0).padStart(3, '0');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold text-slate-50">Lecturas VIR</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Control del lector de identificacion del surtidor (VIR). Consulta la ultima lectura o envia
          comandos de apertura e inicio de lectura al hardware Fusion.
        </p>
      </div>

      {/* Aviso operacional */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        <span className="mt-0.5 shrink-0 text-amber-400">⚠</span>
        <span>
          Los comandos <strong>Abrir lector</strong> e <strong>Iniciar lectura</strong> se envian directamente al equipo Fusion en operacion.
          Confirma la bomba correcta antes de ejecutar.
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
        {/* Panel de control */}
        <section className="space-y-4 rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <Field label="Surtidor objetivo">
            <select className={inputCls} onChange={(e) => { setPumpId(e.target.value); setPending(null); }} value={pumpId}>
              {pumps.map((id) => (
                <option key={id} value={id}>Bomba {id}</option>
              ))}
            </select>
          </Field>

          <div className="space-y-2 pt-1">
            {/* Lectura segura — sin confirmacion */}
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-200 transition hover:bg-slate-950 disabled:opacity-50"
              disabled={loading}
              onClick={() => void readLastVir()}
              type="button"
            >
              Ver ultima lectura
            </button>

            {/* Escrituras — requieren confirmacion */}
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
              disabled={loading}
              onClick={() => setPending({ path: 'abrir', label: 'Abrir lector', pump: pendingPump })}
              type="button"
            >
              <ScanLine className="h-4 w-4" />
              Abrir lector
            </button>
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
              disabled={loading}
              onClick={() => setPending({ path: 'iniciar-lectura', label: 'Iniciar lectura', pump: pendingPump })}
              type="button"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Iniciar lectura
            </button>
          </div>

          {lastAction ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs text-slate-400">
              Ultima accion: <span className="text-slate-200">{lastAction}</span>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}
        </section>

        {/* Resultado + confirmacion */}
        <section className="space-y-4">
          {/* Panel de confirmacion de escritura */}
          {pending ? (
            <div className="rounded-3xl border border-amber-500/40 bg-amber-500/10 p-5">
              <div className="text-sm font-semibold text-amber-200">Confirmar accion en hardware</div>
              <div className="mt-3 space-y-1 text-sm text-amber-100/80">
                <div>Comando: <span className="font-mono font-semibold text-amber-100">{pending.label}</span></div>
                <div>Surtidor: <span className="font-semibold text-amber-100">Bomba {pending.pump}</span></div>
                <div className="pt-1 text-xs text-amber-300/70">
                  Este comando se enviara directamente al equipo Fusion en operacion.
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
                  disabled={loading}
                  onClick={() => void executeWrite(pending.path, pending.label)}
                  type="button"
                >
                  {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                  Confirmar y enviar
                </button>
                <button
                  className="rounded-2xl border border-slate-700 px-5 py-2.5 text-sm text-slate-300 transition hover:bg-slate-950"
                  onClick={() => setPending(null)}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}

          {result ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { label: 'Device ID', value: result.device_id },
                  { label: 'Entity ID', value: result.entity_id },
                  { label: 'Numero tarjeta', value: result.card_number },
                  { label: 'Vehiculo (hint)', value: result.vehicle_hint },
                  { label: 'Titular', value: result.holder_name },
                  { label: 'Surtidor', value: result.pump_id },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4">
                    <div className={labelCls}>{label}</div>
                    <div className="mt-2 text-lg font-medium text-slate-100">{value || '—'}</div>
                  </div>
                ))}
              </div>
              {result.raw ? (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
                  <div className={labelCls}>Respuesta Fusion (raw)</div>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-slate-950/70 p-4 text-xs text-slate-400">
                    {result.raw}
                  </pre>
                </div>
              ) : null}
            </>
          ) : !pending ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-3xl border border-slate-800 bg-slate-900/40 text-sm text-slate-500">
              Selecciona una accion para comenzar.
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

// ─── Paginas estáticas ────────────────────────────────────────────────────────

function StaticPage({
  title,
  description,
  bullets,
}: {
  title: string;
  description: string;
  bullets: string[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold text-slate-50">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">{description}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {bullets.map((bullet) => (
          <div key={bullet} className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 text-sm text-slate-300">
            {bullet}
          </div>
        ))}
      </div>
    </div>
  );
}

type HidLector = { id: number; vendor_id: number; product_id: number; pump_id: number; descripcion: string | null; activo: boolean };

function ConfigPage({ snapshot, empresaId, token }: { snapshot: ConsolaSnapshot; empresaId: number; token: string }) {
  const [tab, setTab] = useState<'general' | 'lectores'>('general');
  const entries = Object.entries(snapshot.config || {});

  // ── Tab Lectores HID ──
  const [lectores, setLectores] = useState<HidLector[]>([]);
  const [lectoresLoading, setLectoresLoading] = useState(false);
  const [editando, setEditando] = useState<Record<number, Partial<HidLector>>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [saveMsg, setSaveMsg] = useState<Record<number, string>>({});

  // ── Test de lector ──
  const [testingId, setTestingId] = useState<number | null>(null);
  type TestResult = { pump_id: number; uid: string } | 'timeout' | 'error';
  const [testResults, setTestResults] = useState<Record<number, TestResult>>({});
  const testPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const iniciarTest = (lectorId: number) => {
    if (testPollRef.current) clearInterval(testPollRef.current);
    setTestingId(lectorId);
    setTestResults(p => { const n = { ...p }; delete n[lectorId]; return n; });

    const since = new Date().toISOString();
    let intentos = 0;
    testPollRef.current = setInterval(async () => {
      intentos++;
      try {
        const r = await fetch(
          `${API}/api/brazaletes/test-scan?empresa_id=${empresaId}&since=${encodeURIComponent(since)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const d = await r.json() as { found?: boolean; pump_id?: number; uid?: string };
        if (d.found && d.pump_id !== undefined) {
          clearInterval(testPollRef.current!);
          setTestingId(null);
          setTestResults(p => ({ ...p, [lectorId]: { pump_id: d.pump_id!, uid: d.uid ?? '?' } }));
          return;
        }
      } catch {
        clearInterval(testPollRef.current!);
        setTestingId(null);
        setTestResults(p => ({ ...p, [lectorId]: 'error' }));
        return;
      }
      if (intentos >= 20) { // 20s timeout
        clearInterval(testPollRef.current!);
        setTestingId(null);
        setTestResults(p => ({ ...p, [lectorId]: 'timeout' }));
      }
    }, 1000);
  };

  // Limpiar polling al desmontar
  useEffect(() => () => { if (testPollRef.current) clearInterval(testPollRef.current); }, []);

  const cargarLectores = useCallback(async () => {
    setLectoresLoading(true);
    try {
      const r = await fetch(`${API}/api/brazaletes/lectores?empresa_id=${empresaId}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json() as { ok?: boolean; lectores?: HidLector[] };
      if (d.ok) setLectores(d.lectores ?? []);
    } catch {}
    setLectoresLoading(false);
  }, [empresaId, token]);

  useEffect(() => { if (tab === 'lectores') void cargarLectores(); }, [tab, cargarLectores]);

  const guardarLector = async (id: number) => {
    const cambios = editando[id];
    if (!cambios) return;
    setSaving(id);
    try {
      const r = await fetch(`${API}/api/brazaletes/lectores/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ empresa_id: empresaId, ...cambios }),
      });
      const d = await r.json() as { ok?: boolean };
      if (d.ok) {
        setSaveMsg(p => ({ ...p, [id]: '✓ Guardado' }));
        setEditando(p => { const n = { ...p }; delete n[id]; return n; });
        void cargarLectores();
        setTimeout(() => setSaveMsg(p => { const n = { ...p }; delete n[id]; return n; }), 2000);
      }
    } catch {}
    setSaving(null);
  };

  const TABS = [
    { key: 'general' as const,  label: 'General' },
    { key: 'lectores' as const, label: 'Lectores HID' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold text-slate-50">Configuración</h1>
        <p className="mt-2 text-sm text-slate-400">Parámetros del sistema por empresa.</p>
      </div>

      {/* Menú de pestañas */}
      <div className="flex gap-1 rounded-2xl border border-slate-800 bg-slate-900/50 p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-1.5 text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-slate-700 text-slate-100 shadow'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── General ── */}
      {tab === 'general' && (
        entries.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {entries.slice(0, 12).map(([key, value]) => (
              <div key={key} className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
                <div className={labelCls}>{key}</div>
                <div className="mt-3 break-words text-sm text-slate-200">
                  {typeof value === 'string' ? value : JSON.stringify(value)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">
            No se encontró configuración asociada a esta empresa.
          </div>
        )
      )}

      {/* ── Lectores HID ── */}
      {tab === 'lectores' && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className={labelCls}>Lectores HID por pista</div>
              <p className="mt-1 text-xs text-slate-500">Mapeo de lector USB → bomba. El VID/PID es del hardware y no se modifica.</p>
            </div>
            <button onClick={() => void cargarLectores()} type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 transition">
              <RefreshCw className={`h-3 w-3 ${lectoresLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {lectoresLoading ? (
            <div className="text-xs text-slate-600">Cargando...</div>
          ) : lectores.length === 0 ? (
            <div className="text-xs text-slate-600">Sin lectores configurados. Aplique la migración e inserte los registros.</div>
          ) : (
            <div className="space-y-3">
              {lectores.map(l => {
                const ed = editando[l.id] ?? {};
                const pumpId = ed.pump_id ?? l.pump_id;
                const desc   = ed.descripcion ?? l.descripcion ?? '';
                const activo = ed.activo ?? l.activo;
                const dirty  = Object.keys(ed).length > 0;
                return (
                  <div key={l.id} className="rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-500">
                            VID:{l.vendor_id.toString(16).toUpperCase().padStart(4,'0')} / PID:{l.product_id.toString(16).toUpperCase().padStart(4,'0')}
                          </span>
                          <span className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold ${activo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/50 text-slate-400'}`}>
                            {activo ? 'ACTIVO' : 'INACTIVO'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                          <label className="text-[10px] text-slate-500 uppercase tracking-widest">Bomba</label>
                          <input
                            type="number" min={1} max={99} value={pumpId}
                            onChange={e => setEditando(p => ({ ...p, [l.id]: { ...p[l.id], pump_id: Number(e.target.value) } }))}
                            className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                          />
                          <label className="text-[10px] text-slate-500 uppercase tracking-widest">Descripción</label>
                          <input
                            type="text" value={desc} placeholder="Cara A — Bomba 1"
                            onChange={e => setEditando(p => ({ ...p, [l.id]: { ...p[l.id], descripcion: e.target.value } }))}
                            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setEditando(p => ({ ...p, [l.id]: { ...p[l.id], activo: !activo } }))}
                            className="text-[10px] text-slate-500 hover:text-slate-300 underline underline-offset-2 transition"
                          >
                            {activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="flex items-center gap-2">
                          {saveMsg[l.id] && <span className="text-[10px] text-emerald-400">{saveMsg[l.id]}</span>}
                          {dirty && (
                            <button
                              type="button" onClick={() => void guardarLector(l.id)}
                              disabled={saving === l.id}
                              className="rounded-xl bg-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-600 disabled:opacity-50 transition"
                            >
                              {saving === l.id ? 'Guardando...' : 'Guardar'}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={testingId !== null}
                            onClick={() => iniciarTest(l.id)}
                            className="rounded-xl border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-400 hover:border-slate-400 hover:text-slate-200 disabled:opacity-40 transition"
                          >
                            {testingId === l.id ? (
                              <span className="flex items-center gap-1.5">
                                <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                                Esperando...
                              </span>
                            ) : 'Test'}
                          </button>
                        </div>
                        {/* Resultado del test */}
                        {testResults[l.id] && (() => {
                          const res = testResults[l.id];
                          if (res === 'timeout') return (
                            <span className="text-[10px] text-amber-400">Sin respuesta (20 s) — ¿lector activo?</span>
                          );
                          if (res === 'error') return (
                            <span className="text-[10px] text-red-400">Error de conexión</span>
                          );
                          const ok = res.pump_id === (editando[l.id]?.pump_id ?? l.pump_id);
                          return (
                            <span className={`text-[10px] font-semibold ${ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {ok
                                ? `✓ Bomba ${res.pump_id} · UID ${res.uid}`
                                : `⚠ Respondió Bomba ${res.pump_id} (configurado: ${editando[l.id]?.pump_id ?? l.pump_id}) · UID ${res.uid}`}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Autorizaciones ───────────────────────────────────────────────────────────

// ─── Turnos ───────────────────────────────────────────────────────────────────

const TURNOS_HORARIO = [
  { label: 'Mañana',  inicio: '06:00', fin: '14:00' },
  { label: 'Tarde',   inicio: '14:00', fin: '22:00' },
  { label: 'Noche',   inicio: '22:00', fin: '06:00' },
];

function turnoDelDia(): string {
  const h = new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', hour: '2-digit', hour12: false });
  const hr = Number(h);
  if (hr >= 6 && hr < 14) return 'Mañana';
  if (hr >= 14 && hr < 22) return 'Tarde';
  return 'Noche';
}

function duracionDesde(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  const diff = Date.now() - new Date(isoStr).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

type TurnoActivo = {
  shift_id?: string;
  start_at?: string;
  start_trans_id?: string;
  day_id?: string;
};

type TurnoHistorial = {
  period_id: number;
  period_status: string;
  start_at: string | null;
  end_at: string | null;
  start_trans_id: number | null;
  end_trans_id: number | null;
};

type ResumenTurno = {
  txns: number;
  litros: number;
  monto: number;
  porGrado: Record<string, { litros: number; monto: number; txns: number }>;
};

// ─── Precios ──────────────────────────────────────────────────────────────────

type GradoPrecio = {
  grade_id: number;
  nombre: string;
  color: string | null;
  ppu_actual: number | null;
};

function PreciosPage({ empresaId, token }: { empresaId: number; token: string }) {
  const [grados, setGrados] = useState<GradoPrecio[]>([]);
  const [nuevosPrecios, setNuevosPrecios] = useState<Record<number, string>>({});
  const [preciosFuente, setPreciosFuente] = useState<'fusion' | 'ventas' | 'ninguna'>('ninguna');
  const [fechaEfectiva, setFechaEfectiva] = useState<string>(() => {
    const cr = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Costa_Rica' }));
    cr.setDate(cr.getDate() + 1);
    return cr.toISOString().slice(0, 10);
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; command?: string; preview?: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        // Grados desde Supabase (nombres/colores)
        let gradosData: Array<{ grade_id: number; nombre: string; color?: string | null }> | null = null;
        const r1 = await supabase
          .from('grados_combustible')
          .select('grade_id, nombre, color')
          .eq('empresa_id', empresaId)
          .eq('activo', true)
          .order('grade_id');
        if (!r1.error) {
          gradosData = r1.data;
        } else {
          const r2 = await supabase
            .from('grados_combustible')
            .select('grade_id, nombre')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('grade_id');
          if (!r2.error) gradosData = r2.data;
        }

        // Precios actuales — intenta Fusion PG primero, fallback a última venta en Supabase
        const preciosMap: Record<number, number> = {};
        let fuente: 'fusion' | 'ventas' | 'ninguna' = 'ninguna';

        try {
          const fusionResp = await fetch(
            `${API}/api/fusion/grados?empresa_id=${empresaId}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (fusionResp.ok) {
            const fusionGrados = await fusionResp.json() as Array<{ grade_id: number; grade_price: number | null; grade_level: number | null }>;
            fusionGrados.forEach(g => {
              if ((g.grade_level === 1 || g.grade_level == null) && g.grade_price != null) {
                preciosMap[g.grade_id] = g.grade_price;
              }
            });
            if (Object.keys(preciosMap).length > 0) fuente = 'fusion';
          }
        } catch {}

        // Fallback: última venta por grado desde Supabase (ppu de ventas_combustible)
        if (fuente === 'ninguna') {
          try {
            const { data: ventas } = await supabase
              .from('ventas_combustible')
              .select('grade_id, ppu')
              .eq('empresa_id', empresaId)
              .not('ppu', 'is', null)
              .gt('ppu', 0)
              .order('id', { ascending: false })
              .limit(200);
            if (ventas && ventas.length > 0) {
              // Tomar el ppu más reciente por grade_id
              (ventas as Array<{ grade_id: number; ppu: number }>).forEach(v => {
                if (preciosMap[v.grade_id] == null) preciosMap[v.grade_id] = v.ppu;
              });
              if (Object.keys(preciosMap).length > 0) fuente = 'ventas';
            }
          } catch {}
        }

        setPreciosFuente(fuente);

        const lista: GradoPrecio[] = (gradosData ?? []).map(g => ({
          grade_id: g.grade_id,
          nombre: g.nombre,
          color: g.color ?? null,
          ppu_actual: preciosMap[g.grade_id] ?? null,
        }));
        setGrados(lista);
        // Pre-llenar inputs con precio actual
        const init: Record<number, string> = {};
        lista.forEach(g => { init[g.grade_id] = g.ppu_actual != null ? String(g.ppu_actual) : ''; });
        setNuevosPrecios(init);
      } catch {}
      setLoading(false);
    })();
  }, [empresaId, token]);

  const COLOR_DEFAULT: Record<string, string> = {
    Super: '#a855f7', Regular: '#22c55e', Diesel: '#38bdf8', 'Gas LP': '#f59e0b',
  };

  function colorGrado(g: GradoPrecio) {
    return g.color || COLOR_DEFAULT[g.nombre] || '#475569';
  }

  function precioValido(val: string) {
    const n = parseFloat(val);
    return !isNaN(n) && n > 0;
  }

  const todosValidos = grados.length > 0 && grados.every(g => precioValido(nuevosPrecios[g.grade_id] ?? ''));

  async function programarCambio() {
    setSubmitting(true);
    setResult(null);
    try {
      const grades = grados.map(g => ({
        grade_id: g.grade_id,
        price: parseFloat(nuevosPrecios[g.grade_id] ?? '0'),
        price_level: 1,
      }));
      const resp = await fetch(`${API}/api/consola/fusion/precios/programar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresaId, grades, fecha_efectiva: fechaEfectiva.replace(/-/g, '') }),
      });
      const d = await resp.json() as {
        ok?: boolean; error?: string; raw?: string;
        command?: string; command_preview?: string; params_preview?: string;
      };
      if (!resp.ok || !d.ok) {
        const preview = d.command_preview || d.command || undefined;
        setResult({ ok: false, message: d.error || `Error ${resp.status}`, command: preview });
      } else {
        setResult({ ok: true, message: `Cambio programado para ${fechaEfectiva} 00:00.`, command: d.command });
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Error de comunicacion.' });
    }
    setSubmitting(false);
    setConfirming(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-50">Precios</h1>
          <p className="mt-1 text-sm text-slate-400">Programar cambio de precios ARESEP en Fusion.</p>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Cargando grados...</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
          {/* Tabla de grados */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-slate-500">Nuevos precios por grado (₡/L)</div>
              <div className={`text-[10px] px-2 py-0.5 rounded-lg ${
                preciosFuente === 'fusion' ? 'bg-emerald-500/10 text-emerald-400' :
                preciosFuente === 'ventas' ? 'bg-amber-500/10 text-amber-400' :
                'bg-slate-700/30 text-slate-500'
              }`}>
                {preciosFuente === 'fusion' ? 'Fusion PG' : preciosFuente === 'ventas' ? 'Última venta' : 'Sin precio actual'}
              </div>
            </div>

            <div className="space-y-3">
              {grados.map(g => {
                const color = colorGrado(g);
                const val = nuevosPrecios[g.grade_id] ?? '';
                const changed = val !== '' && g.ppu_actual != null && parseFloat(val) !== g.ppu_actual;
                const diff = changed ? parseFloat(val) - (g.ppu_actual ?? 0) : 0;
                return (
                  <div
                    key={g.grade_id}
                    className="flex items-center gap-4 rounded-2xl border px-5 py-4"
                    style={{ borderColor: `${color}33`, background: `${color}0d` }}
                  >
                    <div className="flex-1">
                      <div className="text-sm font-semibold" style={{ color }}>{g.nombre}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Actual: {g.ppu_actual != null ? `₡${fmtNumber(g.ppu_actual, 2)}` : '—'}
                        {changed && (
                          <span className={`ml-2 font-semibold ${diff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {diff > 0 ? '+' : ''}{fmtNumber(diff, 2)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500">₡</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={val}
                        onChange={e => setNuevosPrecios(prev => ({ ...prev, [g.grade_id]: e.target.value }))}
                        className="w-28 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-right text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Resumen del cambio */}
            {todosValidos && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-400 space-y-1">
                <div className="font-semibold text-slate-300">Resumen del cambio</div>
                {grados.map(g => {
                  const nvo = parseFloat(nuevosPrecios[g.grade_id] ?? '0');
                  const diff = g.ppu_actual != null ? nvo - g.ppu_actual : null;
                  return (
                    <div key={g.grade_id} className="flex justify-between">
                      <span>{g.nombre}</span>
                      <span>
                        {g.ppu_actual != null ? `₡${fmtNumber(g.ppu_actual, 2)} → ` : ''}
                        <span className="text-slate-200">₡{fmtNumber(nvo, 2)}</span>
                        {diff != null && (
                          <span className={`ml-1 ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                            ({diff >= 0 ? '+' : ''}{fmtNumber(diff, 2)})
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Panel programar */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Programar vigencia</div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Fecha efectiva (medianoche)</label>
              <input
                type="date"
                value={fechaEfectiva}
                onChange={e => setFechaEfectiva(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-slate-500 focus:outline-none"
              />
              <div className="mt-1 text-[10px] text-slate-600">
                El cambio se enviará a Fusion con DT={fechaEfectiva.replace(/-/g, '')} TI=000000
              </div>
            </div>

            {result ? (
              <div className={`rounded-2xl border px-4 py-3 text-sm ${result.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
                {result.ok ? '✓' : '✗'} {result.message}
                {result.command && (
                  <div className="mt-2 break-all font-mono text-[10px] text-slate-500">{result.command}</div>
                )}
              </div>
            ) : null}

            {confirming ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  <div className="font-semibold">Confirmar cambio de precios</div>
                  <div className="mt-1 text-xs text-amber-300/80">
                    Los nuevos precios se programarán en Fusion para el {fechaEfectiva} a las 00:00.
                  </div>
                </div>
                <button
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                  onClick={() => void programarCambio()}
                  disabled={submitting}
                  type="button"
                >
                  {submitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                  {submitting ? 'Enviando...' : 'Confirmar y programar'}
                </button>
                <button
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-950"
                  onClick={() => setConfirming(false)}
                  disabled={submitting}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => { setResult(null); setConfirming(true); }}
                disabled={!todosValidos}
                type="button"
              >
                <DollarSign className="h-4 w-4" />
                Programar cambio de precios
              </button>
            )}

            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-[11px] text-slate-500 space-y-1">
              <div className="font-semibold text-slate-400">Notas</div>
              <div>Los precios provienen del comunicado público de ARESEP.</div>
              <div>El cambio se programa en Fusion para la medianoche de la fecha indicada.</div>
              <div>Requiere <span className="text-amber-400">FUSION_ENABLE_WRITE_COMMANDS=true</span> en el servidor.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TurnosPage({ empresaId, token }: { empresaId: number; token: string }) {
  const [turnoActivo, setTurnoActivo] = useState<TurnoActivo | null>(null);
  const [historial, setHistorial] = useState<TurnoHistorial[]>([]);
  const [ventas, setVentas] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [cerrarPending, setCerrarPending] = useState(false);
  const [cerrarResult, setCerrarResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [grades, setGrades] = useState<Record<number, string>>({});
  type CierreMya = { id: number; turno_nombre: string; inicio_at: string; cierre_at: string; cerrado_por: string | null; total_ventas: number; total_litros: number; total_monto: number; resumen_grados: Array<{ grade_id: number; litros: number; monto: number; ventas: number }> | null; resumen_pisteros: Array<{ attendant_id: string; litros: number; monto: number; ventas: number }> | null };
  const [cierresMya, setCierresMya] = useState<CierreMya[]>([]);
  const [cierreDetalle, setCierreDetalle] = useState<CierreMya | null>(null);
  const [cierreReporte, setCierreReporte] = useState<CierreMya | null>(null);
  const [diag, setDiag] = useState<{ period_id: number; huerfanas: number; period_start_trans_id: number } | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [repararPending, setRepararPending] = useState(false);
  const [repararResult, setRepararResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Reloj para duración
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const cargarCierresMya = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/consola/fusion/turnos/cierres-mya?empresa_id=${empresaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json() as { ok?: boolean; cierres?: typeof cierresMya };
      if (d.ok) setCierresMya(d.cierres ?? []);
    } catch {}
  }, [empresaId, token]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [estadoResp, turnosResp, ventasResp] = await Promise.all([
        fetch(`${API}/api/consola/fusion/turnos/estado?empresa_id=${empresaId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/fusion/turnos?empresa_id=${empresaId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/fusion/ventas?empresa_id=${empresaId}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (estadoResp.ok) {
        const d = await estadoResp.json() as { ok?: boolean; fields?: Record<string, string> };
        if (d.ok && d.fields) {
          setTurnoActivo({
            shift_id: d.fields.SID,
            start_at: d.fields.SSD && d.fields.SST
              ? `${d.fields.SSD.slice(0,4)}-${d.fields.SSD.slice(4,6)}-${d.fields.SSD.slice(6,8)}T${d.fields.SST.slice(0,2)}:${d.fields.SST.slice(2,4)}:${d.fields.SST.slice(4,6)}-06:00`
              : undefined,
            start_trans_id: d.fields.STI,
            day_id: d.fields.DID,
          });
        }
      }
      if (turnosResp.ok) {
        const d = await turnosResp.json() as TurnoHistorial[];
        setHistorial(Array.isArray(d) ? d.slice(0, 15) : []);
      }
      if (ventasResp.ok) {
        const d = await ventasResp.json() as Array<Record<string, unknown>>;
        setVentas(Array.isArray(d) ? d : []);
      }
    } catch {}
    setLoading(false);
  }, [empresaId, token]);

  useEffect(() => {
    void cargar();
    void cargarCierresMya();
    supabase.from('grados_combustible').select('grade_id, nombre').eq('empresa_id', empresaId)
      .then(({ data }) => { if (data) setGrades(Object.fromEntries(data.map(g => [g.grade_id, g.nombre]))); });
  }, [cargar, cargarCierresMya, empresaId]);

  // Resumen del turno activo desde ventas
  const resumen = useMemo<ResumenTurno>(() => {
    const r: ResumenTurno = { txns: 0, litros: 0, monto: 0, porGrado: {} };
    ventas.forEach(v => {
      r.txns++;
      r.litros += Number(v.volume ?? 0);
      r.monto  += Number(v.money ?? 0);
      const g = grades[Number(v.grade_id)] || `Grado ${v.grade_id}`;
      if (!r.porGrado[g]) r.porGrado[g] = { litros: 0, monto: 0, txns: 0 };
      r.porGrado[g].litros += Number(v.volume ?? 0);
      r.porGrado[g].monto  += Number(v.money ?? 0);
      r.porGrado[g].txns++;
    });
    return r;
  }, [ventas, grades]);

  async function cerrarTurnoMya() {
    setCerrarPending(false);
    setCerrarResult(null);
    try {
      const resp = await fetch(`${API}/api/consola/fusion/turnos/cierre-mya?empresa_id=${empresaId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id: empresaId,
          cerrado_por: null,
          fusion_period_id: turnoActivo?.shift_id ? Number(turnoActivo.shift_id) : null,
        }),
      });
      const d = await resp.json() as { ok?: boolean; error?: string; cierre?: { id: number; turno_nombre: string; total_ventas: number; total_monto: number } };
      if (!resp.ok || !d.ok) {
        setCerrarResult({ ok: false, message: d.error || `Error ${resp.status}` });
      } else {
        const c = d.cierre!;
        setCerrarResult({ ok: true, message: `Turno ${c.turno_nombre} cerrado en MYA. ${c.total_ventas} ventas · ₡${c.total_monto.toLocaleString('es-CR', { maximumFractionDigits: 0 })}` });
        void cargar();
        void cargarCierresMya();
      }
    } catch (err) {
      setCerrarResult({ ok: false, message: err instanceof Error ? err.message : 'Error de comunicacion.' });
    }
  }

  async function cargarDiag() {
    setDiagLoading(true);
    setDiagError(null);
    setRepararResult(null);
    try {
      const r = await fetch(`${API}/api/consola/fusion/turnos/diagnostico-pagos?empresa_id=${empresaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json() as { ok?: boolean; period_id?: number; huerfanas?: number; period_start_trans_id?: number; error?: string };
      if (d.ok && d.period_id != null) {
        setDiag({ period_id: d.period_id!, huerfanas: d.huerfanas ?? 0, period_start_trans_id: d.period_start_trans_id ?? 0 });
      } else {
        setDiag(null);
        setDiagError(d.error || `Error ${r.status}`);
      }
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : 'Error de comunicacion.');
    }
    setDiagLoading(false);
  }

  async function reparar() {
    setRepararPending(false);
    setRepararResult(null);
    try {
      const r = await fetch(`${API}/api/consola/fusion/turnos/reparar-pagos?empresa_id=${empresaId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresaId, payment_type: 'CASH' }),
      });
      const d = await r.json() as { ok?: boolean; insertadas?: number; error?: string };
      if (d.ok) {
        setRepararResult({ ok: true, message: `${d.insertadas} registros de pago insertados. Ahora podés reintentar el cierre.` });
        void cargarDiag();
      } else {
        setRepararResult({ ok: false, message: d.error || 'Error al reparar.' });
      }
    } catch (err) {
      setRepararResult({ ok: false, message: err instanceof Error ? err.message : 'Error.' });
    }
  }

  const turnoNombre = turnoDelDia();
  const COLOR_GRADO: Record<string, string> = { 'Regular': '#22c55e', 'Super': '#a855f7', 'Diesel': '#38bdf8', 'Gas LP': '#f59e0b' };

  // ─── Vista reporte de cierre ─────────────────────────────────────────────────
  if (cierreReporte) {
    return (
      <CierreReportePage
        cierre={cierreReporte as unknown as CierreMyaReport}
        grades={grades}
        gradeColors={COLOR_GRADO}
        empresaId={empresaId}
        onBack={() => setCierreReporte(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-50">Turnos</h1>
          <p className="mt-1 text-sm text-slate-400">Control de turno activo y cierre de período.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 px-4 py-2 text-xs text-slate-400 transition hover:bg-slate-950"
          onClick={() => void cargar()} type="button">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Turno activo */}
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className={labelCls}>Turno activo</div>
              <div className="mt-1 flex items-center gap-3">
                <span className="text-2xl font-bold text-slate-50">{turnoNombre}</span>
                <span className="rounded-xl bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">EN CURSO</span>
              </div>
            </div>
            <Clock className="h-10 w-10 text-slate-700" />
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {TURNOS_HORARIO.map(t => (
              <div key={t.label} className={`rounded-2xl border px-4 py-3 ${t.label === turnoNombre ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/40'}`}>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">{t.label}</div>
                <div className={`mt-1 text-sm font-semibold ${t.label === turnoNombre ? 'text-emerald-300' : 'text-slate-500'}`}>{t.inicio} – {t.fin}</div>
              </div>
            ))}
          </div>

          {turnoActivo && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                <div className={labelCls}>Inicio</div>
                <div className="text-slate-200">{turnoActivo.start_at ? new Date(turnoActivo.start_at).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Costa_Rica' }) : '—'}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                <div className={labelCls}>Duración</div>
                <div className="text-slate-200">{duracionDesde(turnoActivo.start_at)}{tick > -1 ? '' : ''}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                <div className={labelCls}>Shift ID</div>
                <div className="font-mono text-slate-400">{turnoActivo.shift_id ?? '—'}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                <div className={labelCls}>Sale# inicio</div>
                <div className="font-mono text-slate-400">{turnoActivo.start_trans_id ?? '—'}</div>
              </div>
            </div>
          )}

          {/* Resumen por grado */}
          <div>
            <div className={labelCls + ' mb-3'}>Ventas del turno por producto</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(resumen.porGrado).map(([g, d]) => {
                const color = COLOR_GRADO[g] ?? '#475569';
                return (
                  <div key={g} className="rounded-2xl border px-4 py-3" style={{ borderColor: `${color}33`, background: `${color}11` }}>
                    <div className="text-xs font-semibold" style={{ color }}>{g}</div>
                    <div className="mt-2 text-lg font-bold text-slate-100">₡{fmtNumber(d.monto, 0)}</div>
                    <div className="text-[10px] text-slate-500">{fmtNumber(d.litros, 2)} L · {d.txns} txn</div>
                  </div>
                );
              })}
              {Object.keys(resumen.porGrado).length === 0 && (
                <div className="col-span-4 text-xs text-slate-600">Sin ventas en el turno actual.</div>
              )}
            </div>
          </div>

          {/* Totales */}
          <div className="flex gap-6 border-t border-slate-800 pt-4">
            <div><div className={labelCls}>Total litros</div><div className="text-xl font-bold text-slate-100">{fmtNumber(resumen.litros, 2)} L</div></div>
            <div><div className={labelCls}>Total monto</div><div className="text-xl font-bold text-amber-300">₡{fmtNumber(resumen.monto, 0)}</div></div>
            <div><div className={labelCls}>Transacciones</div><div className="text-xl font-bold text-slate-100">{resumen.txns}</div></div>
          </div>
        </div>

        {/* Panel cerrar turno MYA */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div className={labelCls}>Cerrar turno</div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-xs text-slate-400">
            El cierre se registra en MYA con las ventas sincronizadas. Define el corte del período para reportes y contabilidad.
          </div>

          {cierresMya[0] && (
            <div className="text-[10px] text-slate-500">
              Último cierre: <span className="text-slate-300">{cierresMya[0].turno_nombre}</span>{' '}
              {new Date(cierresMya[0].cierre_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', dateStyle: 'short', timeStyle: 'short' })}
            </div>
          )}

          {cerrarResult ? (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${cerrarResult.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
              {cerrarResult.ok ? '✓' : '✗'} {cerrarResult.message}
            </div>
          ) : null}

          {cerrarPending ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                <div className="font-semibold">Confirmar cierre de turno</div>
                <div className="mt-1 text-xs text-amber-300/80">Se registra el corte en MYA. No afecta Fusion.</div>
                <div className="mt-2 text-xs text-amber-300/60">Turno: {turnoNombre} · ₡{fmtNumber(resumen.monto, 0)} · {resumen.txns} ventas</div>
              </div>
              <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
                onClick={() => void cerrarTurnoMya()} type="button">
                Confirmar cierre
              </button>
              <button className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-950"
                onClick={() => setCerrarPending(false)} type="button">
                Cancelar
              </button>
            </div>
          ) : (
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
              onClick={() => { setCerrarResult(null); setCerrarPending(true); }}
              type="button"
            >
              <Clock className="h-4 w-4" />
              Cerrar turno actual
            </button>
          )}
        </div>
      </div>

      {/* Diagnóstico pagos */}
      <div className="rounded-3xl border border-rose-900/40 bg-slate-900/70 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className={labelCls}>Mantenimiento — pagos huérfanos</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Ventas sin registro de pago que bloquean el cierre de turno (PAY0001).</div>
          </div>
          <button
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
            onClick={() => void cargarDiag()} type="button" disabled={diagLoading}
          >
            <RefreshCw className={`h-3 w-3 ${diagLoading ? 'animate-spin' : ''}`} />
            Diagnosticar
          </button>
        </div>

        {diag && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                <div className={labelCls}>Period ID</div>
                <div className="font-mono text-slate-300">{diag.period_id}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                <div className={labelCls}>Sale inicio</div>
                <div className="font-mono text-slate-300">{diag.period_start_trans_id}</div>
              </div>
              <div className={`rounded-2xl border px-4 py-3 ${diag.huerfanas > 0 ? 'border-rose-500/30 bg-rose-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
                <div className={labelCls}>Ventas huérfanas</div>
                <div className={`font-bold text-lg ${diag.huerfanas > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{diag.huerfanas}</div>
              </div>
            </div>

            {repararResult && (
              <div className={`rounded-2xl border px-4 py-3 text-sm ${repararResult.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
                {repararResult.ok ? '✓' : '✗'} {repararResult.message}
              </div>
            )}

            {diag.huerfanas > 0 && (
              repararPending ? (
                <div className="space-y-2">
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    <div className="font-semibold">Confirmar reparación</div>
                    <div className="text-xs text-amber-300/80 mt-1">
                      Se insertarán {diag.huerfanas} registros de pago tipo CASH para las ventas sin pago del período {diag.period_id}. Esto permite que Fusion cierre el turno correctamente.
                    </div>
                  </div>
                  <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-400"
                    onClick={() => void reparar()} type="button">
                    Confirmar e insertar pagos
                  </button>
                  <button className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-950"
                    onClick={() => setRepararPending(false)} type="button">
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20"
                  onClick={() => setRepararPending(true)} type="button"
                >
                  Reparar {diag.huerfanas} pagos huérfanos
                </button>
              )
            )}

            {diag.huerfanas === 0 && (
              <div className="text-xs text-emerald-400">Sin ventas huérfanas — el turno puede cerrarse normalmente.</div>
            )}
          </div>
        )}

        {diagError && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
            ✗ {diagError}
          </div>
        )}
        {!diag && !diagLoading && !diagError && (
          <div className="text-xs text-slate-600">Presioná "Diagnosticar" para verificar si hay ventas bloqueando el cierre.</div>
        )}
      </div>

      {/* Historial cierres MYA */}
      {cierresMya.length > 0 && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className={labelCls + ' mb-4'}>Cierres de turno MYA</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500">
                  <th className="pb-2 text-left">Turno</th>
                  <th className="pb-2 text-left">Inicio</th>
                  <th className="pb-2 text-left">Cierre</th>
                  <th className="pb-2 text-right">Ventas</th>
                  <th className="pb-2 text-right">Litros</th>
                  <th className="pb-2 text-right">Monto</th>
                  <th className="pb-2 text-center">Detalle</th>
                  <th className="pb-2 text-center">Reporte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {cierresMya.map(c => (
                  <Fragment key={c.id}>
                    <tr className="text-slate-300 hover:bg-slate-800/30">
                      <td className="py-2.5 pr-4 font-semibold text-slate-200">{c.turno_nombre}</td>
                      <td className="py-2.5 pr-4 text-slate-500">{new Date(c.inicio_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="py-2.5 pr-4">{new Date(c.cierre_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', dateStyle: 'short', timeStyle: 'short' })}</td>
                      <td className="py-2.5 pr-4 text-right font-mono">{c.total_ventas}</td>
                      <td className="py-2.5 pr-4 text-right font-mono">{fmtNumber(c.total_litros, 2)}</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-amber-300">₡{fmtNumber(c.total_monto, 0)}</td>
                      <td className="py-2.5 text-center">
                        <button
                          onClick={() => setCierreDetalle(prev => prev?.id === c.id ? null : c)}
                          className="rounded-lg p-1 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200 transition-colors"
                          title="Ver detalle"
                        >
                          {cierreDetalle?.id === c.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </td>
                      <td className="py-2.5 text-center">
                        <button
                          onClick={() => setCierreReporte(c)}
                          className="rounded-lg p-1 text-blue-400 hover:bg-blue-900/40 hover:text-blue-200 transition-colors"
                          title="Ver reporte / Imprimir"
                        >
                          <FileText size={14} />
                        </button>
                      </td>
                    </tr>
                    {cierreDetalle?.id === c.id && (
                      <tr>
                        <td colSpan={8} className="pb-4 pt-1 px-2">
                          <div className="rounded-2xl bg-slate-800/60 border border-slate-700/50 p-4 space-y-4">
                            {/* Por grado */}
                            {c.resumen_grados && c.resumen_grados.length > 0 && (
                              <div>
                                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Por grado</div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-[10px] text-slate-500 border-b border-slate-700/50">
                                      <th className="pb-1 text-left">Grado</th>
                                      <th className="pb-1 text-right">Ventas</th>
                                      <th className="pb-1 text-right">Litros</th>
                                      <th className="pb-1 text-right">Monto</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-700/30">
                                    {c.resumen_grados.map(g => (
                                      <tr key={g.grade_id} className="text-slate-300">
                                        <td className="py-1.5 pr-4 text-slate-200">{grades[g.grade_id] ?? `Grado ${g.grade_id}`}</td>
                                        <td className="py-1.5 pr-4 text-right font-mono">{g.ventas}</td>
                                        <td className="py-1.5 pr-4 text-right font-mono">{fmtNumber(g.litros, 2)}</td>
                                        <td className="py-1.5 text-right font-mono text-amber-300">₡{fmtNumber(g.monto, 0)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {/* Por pistero */}
                            {c.resumen_pisteros && c.resumen_pisteros.length > 0 && (
                              <div>
                                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Por pistero</div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-[10px] text-slate-500 border-b border-slate-700/50">
                                      <th className="pb-1 text-left">Pistero</th>
                                      <th className="pb-1 text-right">Ventas</th>
                                      <th className="pb-1 text-right">Litros</th>
                                      <th className="pb-1 text-right">Monto</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-700/30">
                                    {c.resumen_pisteros.map(p => (
                                      <tr key={p.attendant_id} className="text-slate-300">
                                        <td className="py-1.5 pr-4 text-slate-200">{p.attendant_id === 'SIN_PISTERO' ? <span className="text-slate-500 italic">Sin asignar</span> : p.attendant_id}</td>
                                        <td className="py-1.5 pr-4 text-right font-mono">{p.ventas}</td>
                                        <td className="py-1.5 pr-4 text-right font-mono">{fmtNumber(p.litros, 2)}</td>
                                        <td className="py-1.5 text-right font-mono text-amber-300">₡{fmtNumber(p.monto, 0)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            <div className="text-[10px] text-slate-600">
                              Cerrado por: <span className="text-slate-400">{c.cerrado_por ?? 'sistema'}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historial de turnos */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
        <div className={labelCls + ' mb-4'}>Historial de turnos recientes</div>
        {historial.length === 0 ? (
          <div className="text-xs text-slate-600">Sin historial disponible.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500">
                  <th className="pb-2 text-left">Period ID</th>
                  <th className="pb-2 text-left">Estado</th>
                  <th className="pb-2 text-left">Inicio</th>
                  <th className="pb-2 text-left">Fin</th>
                  <th className="pb-2 text-right">Sale# inicio</th>
                  <th className="pb-2 text-right">Sale# fin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {historial.map(t => (
                  <tr key={t.period_id} className="text-slate-300 hover:bg-slate-800/30">
                    <td className="py-2.5 pr-4 font-mono text-slate-400">{t.period_id}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold ${String(t.period_status).toUpperCase() === 'O' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/50 text-slate-400'}`}>
                        {String(t.period_status).toUpperCase() === 'O' ? 'ACTIVO' : 'CERRADO'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">{t.start_at ? new Date(t.start_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                    <td className="py-2.5 pr-4">{t.end_at ? new Date(t.end_at).toLocaleString('es-CR', { timeZone: 'America/Costa_Rica', dateStyle: 'short', timeStyle: 'short' }) : <span className="text-emerald-400">En curso</span>}</td>
                    <td className="py-2.5 pr-4 text-right font-mono text-slate-500">{t.start_trans_id ?? '—'}</td>
                    <td className="py-2.5 text-right font-mono text-slate-500">{t.end_trans_id ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AutorizacionesPage({
  empresaId,
  token,
}: {
  empresaId: number;
  token: string;
}) {
  const [pumpId, setPumpId] = useState('001');
  const [hoseId, setHoseId] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [paymentType, setPaymentType] = useState('DEVICE');
  const [paymentInfo, setPaymentInfo] = useState('');
  const [forceSend, setForceSend] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<AuthPreview | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalog, setCatalog] = useState<DeviceCatalogItem[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  const loadCatalog = useEffectEvent(async () => {
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const resp = await fetch(`${API}/api/consola/catalogos/dispositivos?empresa_id=${empresaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseJson<DeviceCatalogItem[]>(resp);
      setCatalog(data || []);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'No se pudo cargar el catalogo.');
    } finally {
      setCatalogLoading(false);
    }
  });

  useEffect(() => {
    loadCatalog();
  }, [empresaId, loadCatalog]);

  const selectedDevice = useMemo(
    () => catalog.find((item) => String(item.id) === selectedDeviceId) || null,
    [catalog, selectedDeviceId],
  );

  useEffect(() => {
    if (!selectedDevice) return;
    if (selectedDevice.pump_id_preferido) {
      setPumpId(String(selectedDevice.pump_id_preferido).padStart(3, '0'));
    }
    setGradeId(selectedDevice.grade_id_preferido ? String(selectedDevice.grade_id_preferido) : '');
    setPaymentType(selectedDevice.payment_type || 'DEVICE');
    setPaymentInfo(
      selectedDevice.payment_info ||
        selectedDevice.identificador_uid ||
        selectedDevice.alias ||
        '',
    );
  }, [selectedDevice]);

  async function generarPreview() {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(
        `${API}/api/consola/fusion/surtidores/${Number(pumpId) || 0}/autorizar?empresa_id=${empresaId}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hose_id: hoseId || null,
            grade_id: gradeId || null,
            payment_type: paymentType || null,
            payment_info: paymentInfo || null,
            force_send: forceSend,
          }),
        },
      );

      const raw = await resp.text();
      let data: AuthPreview | null = null;
      try {
        data = raw ? (JSON.parse(raw) as AuthPreview) : null;
      } catch {
        throw new Error(raw || `Error HTTP ${resp.status}`);
      }

      if (!resp.ok && data?.error) throw new Error(data.error);
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo preparar la autorizacion.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold text-slate-50">Autorizaciones</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Preparacion de comandos Fusion para un dispositivo o una operacion de patio,
          con auditoria y permisos del ERP.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Dispositivo — campo complejo, no usa Field */}
            <div className="md:col-span-2">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className={labelCls}>Dispositivo registrado</label>
                {catalogLoading ? <div className="text-xs text-slate-500">Cargando...</div> : null}
              </div>
              <select
                className={inputCls}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                value={selectedDeviceId}
              >
                <option value="">Manual / sin dispositivo</option>
                {catalog.map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    {(item.alias || item.identificador_uid) + ' | ' + (item.operador_nombre || item.attendant_id || 'Sin operador')}
                  </option>
                ))}
              </select>
              {catalogError ? <div className="mt-2 text-sm text-rose-300">{catalogError}</div> : null}
              {selectedDevice ? (
                <div className="mt-3 grid gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:grid-cols-2">
                  <div>
                    <div className={labelCls}>Operador</div>
                    <div className="mt-1 text-sm text-slate-100">
                      {selectedDevice.operador_nombre || selectedDevice.attendant_id || 'Sin operador'}
                    </div>
                  </div>
                  <div>
                    <div className={labelCls}>Unidad</div>
                    <div className="mt-1 text-sm text-slate-100">
                      {selectedDevice.vehiculo_codigo || selectedDevice.placa || 'Sin unidad'}
                    </div>
                  </div>
                  <div>
                    <div className={labelCls}>Bomba sugerida</div>
                    <div className="mt-1 text-sm text-slate-100">
                      {selectedDevice.pump_id_preferido
                        ? String(selectedDevice.pump_id_preferido).padStart(3, '0')
                        : 'Sin preferencia'}
                    </div>
                  </div>
                  <div>
                    <div className={labelCls}>Grado sugerido</div>
                    <div className="mt-1 text-sm text-slate-100">
                      {selectedDevice.grade_id_preferido || 'Sin preferencia'}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <Field label="Surtidor">
              <select className={inputCls} onChange={(e) => setPumpId(e.target.value)} value={pumpId}>
                {Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(3, '0')).map((id) => (
                  <option key={id} value={id}>Bomba {id}</option>
                ))}
              </select>
            </Field>

            <Field label="Manguera">
              <input
                className={inputCls}
                onChange={(e) => setHoseId(e.target.value)}
                placeholder="Ej: 1"
                value={hoseId}
              />
            </Field>

            <Field label="Grado">
              <input
                className={inputCls}
                onChange={(e) => setGradeId(e.target.value)}
                placeholder="Ej: 1 o REG"
                value={gradeId}
              />
            </Field>

            <Field label="Medio de pago logico">
              <select className={inputCls} onChange={(e) => setPaymentType(e.target.value)} value={paymentType}>
                <option value="DEVICE">DEVICE</option>
                <option value="FLEET">FLEET</option>
                <option value="CASH">CASH</option>
                <option value="ACCOUNT">ACCOUNT</option>
              </select>
            </Field>

            <Field label="Referencia del dispositivo / operador" span2>
              <input
                className={inputCls}
                onChange={(e) => setPaymentInfo(e.target.value)}
                placeholder="Ej: TAG-0042, PULSERA-17, OPER-MARCO"
                value={paymentInfo}
              />
            </Field>
          </div>

          <label className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-300">
            <input checked={forceSend} onChange={(e) => setForceSend(e.target.checked)} type="checkbox" />
            Marcar FTS=YES en el comando
          </label>

          {error ? (
            <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <button
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            onClick={generarPreview}
            type="button"
          >
            <ShieldCheck className="h-4 w-4" />
            {loading ? 'Generando preview...' : 'Preparar autorizacion'}
          </button>
        </section>

        <section className="space-y-4">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
            <div className={labelCls}>Enfoque del proyecto</div>
            <div className="mt-3 space-y-3 text-sm text-slate-300">
              <div>La consola usa el mismo ERP para usuarios, empresas, permisos y auditoria.</div>
              <div>Fusion PG se mantiene en lectura; las acciones vivas se encapsulan por socket.</div>
              <div>Dispositivos como pulseras, tags o llaveros deben mapearse a operador o unidad.</div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
            <div className={labelCls}>Preview del comando</div>
            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-2xl bg-slate-950/70 p-4 text-xs text-slate-200">
              {preview?.command_preview || preview?.command || 'Todavia no se genero un preview.'}
            </pre>
            {preview?.params ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {Object.entries(preview.params).map(([key, value]) => (
                  <div key={key} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3 text-sm">
                    <div className={labelCls}>{key}</div>
                    <div className="mt-1 text-slate-200">{value || '-'}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Dispositivos ─────────────────────────────────────────────────────────────

void AutorizacionesPage;

const emptyDeviceForm = {
  tipo_dispositivo: 'tag',
  identificador_uid: '',
  alias: '',
  attendant_id: '',
  operador_nombre: '',
  notas: '',
  estado: 'activo',
};

function DispositivosPage({
  empresaId,
  token,
}: {
  empresaId: number;
  token: string;
}) {
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalog, setCatalog] = useState<DeviceCatalogItem[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyDeviceForm);

  const loadCatalog = useEffectEvent(async () => {
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const resp = await fetch(`${API}/api/consola/catalogos/dispositivos?empresa_id=${empresaId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseJson<DeviceCatalogItem[]>(resp);
      setCatalog(data || []);
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'No se pudo cargar el catalogo.');
    } finally {
      setCatalogLoading(false);
    }
  });

  async function saveDevice() {
    setCatalogError('');
    try {
      const payload = {
        empresa_id: empresaId,
        tipo_dispositivo: form.tipo_dispositivo,
        identificador_uid: form.identificador_uid,
        alias: form.alias,
        attendant_id: form.attendant_id,
        operador_nombre: form.operador_nombre,
        notas: form.notas,
        estado: form.estado,
      };

      const url = editingId
        ? `${API}/api/consola/catalogos/dispositivos/${editingId}`
        : `${API}/api/consola/catalogos/dispositivos`;

      const resp = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      await parseJson<DeviceCatalogItem>(resp);
      setEditingId(null);
      setForm(emptyDeviceForm);
      loadCatalog();
    } catch (err) {
      setCatalogError(err instanceof Error ? err.message : 'No se pudo guardar el dispositivo.');
    }
  }

  useEffect(() => {
    loadCatalog();
  }, [empresaId, loadCatalog]);

  const setField = <K extends keyof typeof emptyDeviceForm>(key: K, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold text-slate-50">Dispositivos</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Catálogo de pulseras, llaveros y tags. Cada dispositivo identifica a un operador.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={labelCls}>Catalogo</div>
              <div className="mt-1 text-lg font-semibold text-slate-100">Dispositivos registrados</div>
            </div>
            {catalogLoading ? <div className="text-sm text-slate-400">Cargando...</div> : null}
          </div>
          {catalogError ? (
            <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {catalogError}
            </div>
          ) : null}
          <div className="mt-4 space-y-3">
            {catalog.length ? (
              catalog.map((item) => (
                <button
                  key={item.id}
                  className="flex w-full items-start justify-between rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-left transition hover:border-emerald-400/40"
                  onClick={() => {
                    setEditingId(item.id);
                    setForm({
                      tipo_dispositivo: item.tipo_dispositivo || 'tag',
                      identificador_uid: item.identificador_uid || '',
                      alias: item.alias || '',
                      attendant_id: item.attendant_id || '',
                      operador_nombre: item.operador_nombre || '',
                      notas: item.notas || '',
                      estado: item.estado || 'activo',
                    });
                  }}
                  type="button"
                >
                  <div>
                    <div className="text-base font-semibold text-slate-100">
                      {item.alias || item.identificador_uid}
                    </div>
                    <div className="mt-1 text-sm text-slate-400">
                      {item.tipo_dispositivo} | {item.identificador_uid}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {item.operador_nombre || item.attendant_id || 'Sin operador'}
                      {item.attendant_id && item.operador_nombre ? ` · ID: ${item.attendant_id}` : ''}
                    </div>
                  </div>
                  <div className="text-xs uppercase tracking-[0.25em] text-emerald-300">
                    {item.estado || 'activo'}
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">
                Aun no hay dispositivos registrados para esta empresa.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
          <div className={labelCls}>Formulario</div>
          <div className="mt-1 text-lg font-semibold text-slate-100">
            {editingId ? 'Editar dispositivo' : 'Registrar dispositivo'}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Tipo">
              <select className={inputCls} onChange={(e) => setField('tipo_dispositivo', e.target.value)} value={form.tipo_dispositivo}>
                <option value="tag">Tag</option>
                <option value="pulsera">Pulsera</option>
                <option value="llavero">Llavero</option>
                <option value="tarjeta">Tarjeta</option>
              </select>
            </Field>
            <Field label="UID">
              <input
                className={inputCls}
                placeholder="Haga clic aquí y pase el dispositivo"
                onChange={(e) => setField('identificador_uid', e.target.value)}
                value={form.identificador_uid}
              />
            </Field>
            <Field label="Operador">
              <input className={inputCls} placeholder="Nombre del operador" onChange={(e) => setField('operador_nombre', e.target.value)} value={form.operador_nombre} />
            </Field>
            <Field label="Alias">
              <input className={inputCls} placeholder="Nombre corto o apodo" onChange={(e) => setField('alias', e.target.value)} value={form.alias} />
            </Field>
            <Field label="Attendant ID" span2>
              <input className={inputCls} placeholder="ID de operador en Fusion (opcional)" onChange={(e) => setField('attendant_id', e.target.value)} value={form.attendant_id} />
            </Field>
            <Field label="Notas" span2>
              <textarea
                className={`min-h-[80px] ${inputCls}`}
                onChange={(e) => setField('notas', e.target.value)}
                value={form.notas}
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
              onClick={saveDevice}
              type="button"
            >
              {editingId ? 'Actualizar dispositivo' : 'Registrar dispositivo'}
            </button>
            <button
              className="rounded-2xl border border-slate-700 px-5 py-3 text-sm text-slate-200 transition hover:bg-slate-950"
              onClick={() => { setEditingId(null); setForm(emptyDeviceForm); }}
              type="button"
            >
              Limpiar
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────

function LoginPage({ onReady }: { onReady: (payload: LoginState) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [empresas, setEmpresas] = useState<EmpresaOpcion[]>([]);
  const [tempSession, setTempSession] = useState<TempSession | null>(null);
  const [tempUsuario, setTempUsuario] = useState('');
  const [tempEsSuperusuario, setTempEsSuperusuario] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);

  const SLIDES = [
    {
      title: 'Control operativo\nen tiempo real.',
      subtitle: 'Estado de cada surtidor, turno y despacho desde una sola pantalla, conectada directamente a Fusion.',
      image: `${process.env.PUBLIC_URL}/branding/login-1.jpg`,
    },
    {
      title: 'Autorizaciones\npor dispositivo.',
      subtitle: 'Tags, pulseras y llaveros mapeados a operador y unidad. Cada despacho autorizado queda registrado en el ERP.',
      image: `${process.env.PUBLIC_URL}/branding/login-2.jpg`,
    },
    {
      title: 'Multiempresa.\nUn acceso para todas sus estaciones.',
      subtitle: 'Acceda a cualquier estacion de servicio con las mismas credenciales y permisos precisos por rol.',
      image: `${process.env.PUBLIC_URL}/branding/login-3.jpg`,
    },
  ];

  useEffect(() => {
    const t = setInterval(() => setSlideIdx((i) => (i + 1) % SLIDES.length), 5000);
    return () => clearInterval(t);
  }, [SLIDES.length]);

  async function selectEmpresa(
    sessionData: TempSession,
    empresa: EmpresaOpcion,
    usuarioNombre: string,
    esSuperusuario: boolean,
  ) {
    const resp = await fetch(`${API}/api/auth/select-empresa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: sessionData.access_token, empresa_id: empresa.id }),
    });
    await parseJson<Record<string, unknown>>(resp);

    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: sessionData.access_token,
      refresh_token: sessionData.refresh_token,
    });
    if (setSessionError) {
      setError(setSessionError.message || 'No se pudo establecer la sesion.');
      return;
    }

    onReady({
      empresaId: empresa.id,
      empresaNombre: empresa.nombre,
      empresaCodigo: empresa.codigo || String(empresa.id).padStart(3, '0'),
      usuarioNombre,
      esSuperusuario,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, modulo_codigo: MODULO_CODIGO }),
      });

      const data = await parseJson<{
        session?: { access_token: string; refresh_token: string };
        usuario?: { nombre?: string | null; es_superusuario?: boolean | null };
        empresas?: EmpresaOpcion[];
        empresas_autorizadas?: EmpresaOpcion[];
      }>(resp);

      const foundEmpresas = data.empresas_autorizadas || data.empresas || [];
      const authSession = data.session;
      const nextSession = {
        access_token: authSession?.access_token || '',
        refresh_token: authSession?.refresh_token || '',
      };
      const usuarioNombre = data.usuario?.nombre || username;
      const esSuperusuario = Boolean(data.usuario?.es_superusuario);

      if (!nextSession.access_token || !nextSession.refresh_token) {
        setError('La respuesta de autenticación no incluyó una sesión válida.');
        return;
      }
      if (!foundEmpresas.length) {
        setError('El usuario no tiene empresas habilitadas para consola.');
        return;
      }
      if (foundEmpresas.length === 1) {
        await selectEmpresa(nextSession, foundEmpresas[0], usuarioNombre, esSuperusuario);
        return;
      }

      setTempSession(nextSession);
      setTempUsuario(usuarioNombre);
      setTempEsSuperusuario(esSuperusuario);
      setEmpresas(foundEmpresas);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  const card = (body: ReactNode) => (
    <div style={{
      minHeight: '100vh', display: 'grid',
      gridTemplateColumns: 'minmax(0,1.2fr) 440px',
      background: '#0c1118',
    }}>
      {/* Showcase izquierdo — carrusel */}
      <div className="consola-login-showcase" style={{ position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', padding: '48px' }}>
        {SLIDES.map((s, i) => (
          <div key={i} style={{
            position: 'absolute', inset: 0,
            backgroundImage: `url(${s.image})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            filter: 'saturate(1.1) contrast(1.05) brightness(0.95)',
            opacity: i === slideIdx ? 1 : 0,
            transform: i === slideIdx ? 'scale(1)' : 'scale(1.03)',
            transition: 'opacity 1s ease, transform 1.8s ease',
          }} />
        ))}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(140deg,rgba(2,8,23,0.15) 0%,rgba(2,8,23,0.28) 50%,rgba(2,8,23,0.65) 100%), linear-gradient(to top,rgba(2,8,23,0.82) 0%,transparent 55%)',
        }} />
        <div style={{ position: 'relative', zIndex: 1, color: '#f0f9ff', maxWidth: '560px', width: '100%' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '5px 12px',
            borderRadius: '999px', border: '1px solid rgba(255,255,255,0.22)',
            background: 'rgba(255,255,255,0.10)', backdropFilter: 'blur(6px)',
            fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase',
            marginBottom: '16px',
          }}>
            ⛽ Consola Operativa · Fusion
          </div>
          <h1 style={{
            margin: 0, fontSize: '36px', fontWeight: 700, lineHeight: 1.1,
            letterSpacing: '-0.03em', whiteSpace: 'pre-line',
            textShadow: '0 2px 12px rgba(0,0,0,0.5)',
          }}>
            {SLIDES[slideIdx].title}
          </h1>
          <p style={{
            marginTop: '12px', fontSize: '14px', color: '#bae6fd',
            lineHeight: 1.65, maxWidth: '460px',
            textShadow: '0 1px 6px rgba(0,0,0,0.5)',
          }}>
            {SLIDES[slideIdx].subtitle}
          </p>
          <div style={{ display: 'flex', gap: '7px', marginTop: '22px' }}>
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => setSlideIdx(i)} style={{
                width: i === slideIdx ? '22px' : '7px', height: '7px',
                borderRadius: '999px', border: 'none', padding: 0, cursor: 'pointer',
                background: i === slideIdx ? '#38bdf8' : 'rgba(255,255,255,0.35)',
                transition: 'width 0.3s ease, background 0.3s ease',
              }} />
            ))}
          </div>
        </div>
      </div>

      {/* Panel derecho */}
      <div className="consola-login-panel" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px',
        background: 'linear-gradient(160deg,#e0f2fe 0%,#e2e8f0 100%)',
      }}>
        <div style={{
          width: '100%', maxWidth: '400px', background: '#fff',
          border: '1px solid #bae6fd', borderRadius: '20px',
          padding: '36px 30px',
          boxShadow: '0 20px 50px rgba(2,8,23,0.13), 0 4px 14px rgba(2,8,23,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '22px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '13px', flexShrink: 0,
              background: 'linear-gradient(135deg,#0369a1,#0ea5e9)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 18px rgba(3,105,161,0.30)', fontSize: '22px',
            }}>⛽</div>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                Iniciar Sesion
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Consola Fusion</div>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #f1f5f9' }}>
            Usa las mismas credenciales del ERP
          </div>
          {body}
          <div style={{ fontSize: '10px', color: '#cbd5e1', textAlign: 'center', marginTop: '20px', fontFamily: 'monospace', letterSpacing: '0.04em' }}>
            CONSOLA v1.0 · {new Date().getFullYear()} · MYA
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .consola-login-showcase { display: none !important; }
          .consola-login-panel { grid-column: 1 / -1 !important; }
        }
      `}</style>
    </div>
  );

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: '10px',
    border: '1.5px solid #e2e8f0', background: '#f8fafc',
    fontSize: '14px', color: '#0f172a', outline: 'none',
    boxSizing: 'border-box', transition: 'border-color 0.15s',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '11px', fontWeight: 600, color: '#64748b',
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px',
  };

  if (empresas.length) {
    return card(
      <div>
        <div style={{ fontSize: '13px', color: '#475569', marginBottom: '16px' }}>
          El usuario <strong style={{ color: '#0f172a' }}>{tempUsuario}</strong> tiene varias empresas habilitadas.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {empresas.map((empresa) => (
            <button
              key={empresa.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', borderRadius: '12px',
                border: '1px solid #e2e8f0', background: '#f8fafc',
                cursor: 'pointer', fontSize: '14px', fontWeight: 600,
                color: '#0f172a', textAlign: 'left',
              }}
              onClick={() => tempSession && selectEmpresa(tempSession, empresa, tempUsuario, tempEsSuperusuario)}
              type="button"
            >
              <div>
                <div>{empresa.nombre}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400, marginTop: '2px', letterSpacing: '0.04em' }}>
                  COD {empresa.codigo || String(empresa.id).padStart(3, '0')}
                </div>
              </div>
              <span style={{ color: '#0ea5e9', fontSize: '18px' }}>→</span>
            </button>
          ))}
        </div>
        {error ? (
          <div style={{ marginTop: '16px', padding: '12px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '13px' }}>
            {error}
          </div>
        ) : null}
      </div>
    );
  }

  return card(
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div>
        <label style={labelStyle}>Usuario</label>
        <input
          style={fieldStyle}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Ingrese su usuario"
          value={username}
          onFocus={(e) => (e.target.style.borderColor = '#0ea5e9')}
          onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
        />
      </div>
      <div>
        <label style={labelStyle}>Contrasena</label>
        <input
          style={fieldStyle}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Ingrese su contrasena"
          type="password"
          value={password}
          onFocus={(e) => (e.target.style.borderColor = '#0ea5e9')}
          onBlur={(e) => (e.target.style.borderColor = '#e2e8f0')}
        />
      </div>
      {error ? (
        <div style={{ padding: '12px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '13px' }}>
          {error}
        </div>
      ) : null}
      <button
        style={{
          padding: '12px', borderRadius: '10px', border: 'none',
          cursor: loading ? 'not-allowed' : 'pointer',
          background: loading ? '#cbd5e1' : 'linear-gradient(135deg,#0369a1,#0ea5e9)',
          color: '#fff', fontSize: '14px', fontWeight: 600, marginTop: '4px',
          opacity: loading ? 0.7 : 1, transition: 'opacity 0.2s',
        }}
        disabled={loading}
        type="submit"
      >
        {loading ? 'Ingresando...' : 'Continuar →'}
      </button>
    </form>
  );
}

// ─── Shell principal ──────────────────────────────────────────────────────────

function AppShell({
  login,
  session,
  onLogout,
}: {
  login: LoginState;
  session: Session;
  onLogout: () => void;
}) {
  const [route, setRoute] = useState<RouteKey>('dashboard');
  const [combustibleFullscreen, setCombustibleFullscreen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [snapshot, setSnapshot] = useState<ConsolaSnapshot>({
    status: null,
    ventas: [],
    turnos: [],
    config: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const activeMenu = useMemo(
    () =>
      [...OPERATIONS_MENU, ...ADMIN_MENU].find((item) => item.key === route) || OPERATIONS_MENU[0],
    [route],
  );

  const cargarSnapshot = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const headers: HeadersInit = { Authorization: `Bearer ${session.access_token}` };

      const [statusResp, ventasResp, turnosResp, configResp] = await Promise.all([
        fetch(`${API}/api/combustible/status?empresa_id=${login.empresaId}`, { headers }),
        fetch(`${API}/api/fusion/ventas?empresa_id=${login.empresaId}`, { headers }),
        fetch(`${API}/api/fusion/turnos?empresa_id=${login.empresaId}`, { headers }),
        fetch(`${API}/api/combustible/config/${login.empresaId}`, { headers }),
      ]);

      const [statusData, ventasData, turnosData, configData] = await Promise.all([
        parseJson<FusionStatus | { status?: FusionStatus }>(statusResp),
        parseJson<{ rows?: VentaFusion[] } | VentaFusion[]>(ventasResp),
        parseJson<{ rows?: TurnoFusion[] } | TurnoFusion[]>(turnosResp),
        parseJson<Record<string, unknown>>(configResp),
      ]);

      setSnapshot({
        status: ('status' in statusData ? statusData.status || null : statusData) as FusionStatus | null,
        ventas: Array.isArray(ventasData) ? ventasData : ventasData.rows || [],
        turnos: Array.isArray(turnosData) ? turnosData : turnosData.rows || [],
        config: configData || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la consola.');
    } finally {
      setLoading(false);
    }
  }, [login.empresaId, session.access_token]);

  useEffect(() => {
    cargarSnapshot();
    const timer = window.setInterval(cargarSnapshot, 15000);
    return () => window.clearInterval(timer);
  }, [cargarSnapshot]);

  useEffect(() => {
    if (!login.esSuperusuario && (route === 'dispositivos' || route === 'configuracion' || route === 'bitacora' || route === 'precios')) {
      setRoute('dashboard');
    }
  }, [login.esSuperusuario, route]);

  useEffect(() => {
    const onCombustibleFullscreen = (evt: Event) => {
      const enabled = Boolean((evt as CustomEvent<{ enabled?: boolean }>).detail?.enabled);
      setCombustibleFullscreen(enabled);
      if (enabled) setSidebarOpen(false);
    };
    window.addEventListener('combustible:fullscreen', onCombustibleFullscreen as EventListener);
    return () => window.removeEventListener('combustible:fullscreen', onCombustibleFullscreen as EventListener);
  }, []);

  useEffect(() => {
    if (route !== 'dashboard') setCombustibleFullscreen(false);
  }, [route]);

  const fusionActiva = Boolean(
    snapshot.status?.instancia_activa ||
    snapshot.status?.sync_en_curso ||
    (snapshot.status?.sync_estado && snapshot.status.sync_estado !== 'disconnected'),
  );

  function navigate(key: RouteKey) {
    setRoute(key);
    setSidebarOpen(false);
  }
  const hideShell = route === 'dashboard' && combustibleFullscreen;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">

      {/* ── Header 44px ──────────────────────────────────────────────────────── */}
      {!hideShell && <header
        className="sticky top-0 z-40 flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-3 sm:px-4"
        style={{ minHeight: '44px' }}
      >
        {/* Izquierda: hamburger + empresa + breadcrumb */}
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            className="rounded p-1 text-slate-400 md:hidden"
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
              <Fuel className="h-3 w-3 text-emerald-300" />
            </div>
            <span className="truncate text-sm font-semibold text-slate-100">{login.empresaNombre}</span>
            {login.empresaCodigo ? (
              <span className="hidden rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300 sm:inline-block">
                {login.empresaCodigo}
              </span>
            ) : null}
          </div>

          {/* Breadcrumb */}
          <div className="hidden items-center gap-1.5 text-xs text-slate-500 lg:flex">
            <span>›</span>
            <span className="text-slate-300">{activeMenu.label}</span>
          </div>
        </div>

        {/* Derecha: refresh + usuario + salir */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            className="rounded p-1 text-slate-500 transition hover:text-slate-200"
            onClick={cargarSnapshot}
            type="button"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <div className="hidden items-center gap-2 sm:flex">
            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-[10px] font-bold text-emerald-300">
              {login.usuarioNombre.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-slate-400">{login.usuarioNombre}</span>
          </div>

          <button
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 transition hover:text-rose-400"
            onClick={onLogout}
            type="button"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>}

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Overlay móvil */}
        {!hideShell && sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/70 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        {!hideShell && <aside
          className={`fixed left-0 top-[44px] z-30 flex h-[calc(100vh-44px)] max-w-[86vw] flex-col border-r border-slate-800 bg-slate-900 transition-all duration-200
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            md:static md:z-auto md:h-auto md:translate-x-0`}
          style={{ width: sidebarCollapsed ? '3.5rem' : '17rem' }}
        >
          {/* Marca */}
          <div className={`relative border-b border-slate-800 ${sidebarCollapsed ? 'px-0 py-3 flex flex-col items-center' : 'px-4 py-3'}`}>
            {!sidebarCollapsed && (
              <>
                <div className="text-[10px] uppercase tracking-[0.3em] text-slate-600">Consola Fusion</div>
                <div className="mt-0.5 text-xs font-semibold text-slate-300">{login.empresaNombre}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${fusionActiva ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span className="text-[10px] text-slate-500">
                    {fusionActiva
                      ? `Activo · sync ${fmtDateTime(snapshot.status?.ultima_sync as string | null)}`
                      : 'Fusion en espera'}
                  </span>
                </div>
              </>
            )}
            {sidebarCollapsed && (
              <span className={`h-2 w-2 rounded-full ${fusionActiva ? 'bg-emerald-400' : 'bg-amber-400'}`} title={fusionActiva ? 'Fusion activo' : 'Fusion en espera'} />
            )}
            {/* Botón toggle — solo en desktop */}
            <button
              className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border border-slate-700 bg-slate-900 p-0.5 text-slate-500 transition hover:text-slate-200 md:flex"
              onClick={() => setSidebarCollapsed((c) => !c)}
              type="button"
              title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
            >
              {sidebarCollapsed
                ? <ChevronRight className="h-3 w-3" />
                : <ChevronLeft className="h-3 w-3" />}
            </button>
          </div>

          {/* Nav */}
          <nav className={`flex-1 overflow-y-auto py-3 ${sidebarCollapsed ? 'px-1' : 'px-2'}`}>
            {!sidebarCollapsed && (
              <div className="mb-1 px-3 text-[10px] uppercase tracking-[0.3em] text-slate-600">
                Operacion
              </div>
            )}
            {sidebarCollapsed && <div className="mb-1 border-b border-slate-800/60 mx-1" />}
            {OPERATIONS_MENU.map((item) => {
              const Icon = item.icon;
              const active = item.key === route;
              return (
                <button
                  key={item.key}
                  className={`mb-0.5 flex w-full items-center rounded text-xs font-medium transition-colors
                    ${sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2'}`}
                  style={{
                    color: active ? '#6ee7b7' : '#94a3b8',
                    background: active ? 'rgba(16,185,129,0.10)' : 'transparent',
                    borderLeft: active ? '2px solid #10b981' : '2px solid transparent',
                  }}
                  onClick={() => navigate(item.key)}
                  type="button"
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && item.label}
                </button>
              );
            })}

            {login.esSuperusuario ? (
              <>
                {!sidebarCollapsed && (
                  <div className="mb-1 mt-4 px-3 text-[10px] uppercase tracking-[0.3em] text-slate-600">
                    Administracion
                  </div>
                )}
                {sidebarCollapsed && <div className="my-2 border-b border-slate-800/60 mx-1" />}
                {ADMIN_MENU.map((item) => {
                  const Icon = item.icon;
                  const active = item.key === route;
                  return (
                    <button
                      key={item.key}
                      className={`mb-0.5 flex w-full items-center rounded text-xs font-medium transition-colors
                        ${sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2'}`}
                      style={{
                        color: active ? '#93c5fd' : '#94a3b8',
                        background: active ? 'rgba(59,130,246,0.10)' : 'transparent',
                        borderLeft: active ? '2px solid #3b82f6' : '2px solid transparent',
                      }}
                      onClick={() => navigate(item.key)}
                      type="button"
                      title={sidebarCollapsed ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!sidebarCollapsed && item.label}
                    </button>
                  );
                })}
              </>
            ) : null}
          </nav>

          {/* Footer sidebar */}
          <div className={`border-t border-slate-800 ${sidebarCollapsed ? 'flex flex-col items-center px-0 py-3 gap-2' : 'px-4 py-3'}`}>
            {!sidebarCollapsed && (
              <div className="text-[10px] text-slate-600">
                {login.esSuperusuario ? 'Administrador' : 'Operador'} · {login.usuarioNombre}
              </div>
            )}
            <button
              className={`flex items-center text-slate-500 transition hover:text-rose-400
                ${sidebarCollapsed ? 'justify-center p-1.5' : 'mt-2 gap-1.5 text-[11px]'}`}
              onClick={onLogout}
              type="button"
              title={sidebarCollapsed ? 'Cerrar sesión' : undefined}
            >
              <LogOut className="h-3.5 w-3.5" />
              {!sidebarCollapsed && 'Cerrar sesion'}
            </button>
          </div>
        </aside>}

        {/* Botón X móvil */}
        {!hideShell && sidebarOpen && (
          <button
            className="fixed right-4 top-[54px] z-40 rounded-full border border-slate-700 bg-slate-900 p-1.5 text-slate-400 md:hidden"
            onClick={() => setSidebarOpen(false)}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Contenido */}
        <div className={`flex-1 ${hideShell ? 'overflow-hidden' : 'overflow-auto'}`}>
          {error ? (
            <div className="mx-4 mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 sm:mx-6">
              {error}
            </div>
          ) : null}
          <main className={hideShell ? 'h-full' : 'px-3 py-4 sm:px-6 sm:py-5'}>
            {route === 'dashboard' ? (
              <CombustibleModule
                empresaId={login.empresaId}
                isSuperusuario={login.esSuperusuario}
                onHome={() => setRoute('dashboard')}
              />
            ) : null}
            {route === 'surtidores' ? (
              <SurtidoresPage empresaId={login.empresaId} token={session.access_token} onNavigate={navigate} />
            ) : null}
            {route === 'lecturas' ? (
              <LecturasPage empresaId={login.empresaId} token={session.access_token} />
            ) : null}
            {route === 'autorizaciones' ? (
              <TurnosPage empresaId={login.empresaId} token={session.access_token} />
            ) : null}
            {route === 'precios' ? (
              <PreciosPage empresaId={login.empresaId} token={session.access_token} />
            ) : null}
            {route === 'dispositivos' ? (
              <DispositivosPage empresaId={login.empresaId} token={session.access_token} />
            ) : null}
            {route === 'configuracion' ? <ConfigPage snapshot={snapshot} empresaId={login.empresaId} token={session.access_token} /> : null}
            {route === 'bitacora' ? (
              <StaticPage
                title="Bitacora"
                description="Esta vista sera la base de trazabilidad completa para operacion en patio."
                bullets={[
                  'Usuario ERP que disparo la accion.',
                  'Empresa, surtidor, operador, dispositivo y respuesta Fusion.',
                  'Timestamps de solicitud, autorizacion, rechazo y cierre.',
                  'Eventos de reintento y fallos de comunicacion con consola.',
                ]}
              />
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [login, setLogin] = useState<LoginState | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setLogin(null);
    setSession(null);
  }

  if (!session || !login) {
    return <LoginPage onReady={setLogin} />;
  }

  return (
    <>
      <AppShell login={login} onLogout={handleLogout} session={session} />
      <ToastContainer />
    </>
  );
}
