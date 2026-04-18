import React, { useEffect, useState } from 'react';
import DashboardEmpacadora from './pages/dashboard/DashboardEmpacadora';
import { Session } from '@supabase/supabase-js';
import {
  LayoutDashboard, Settings, ChevronDown, ChevronRight, ChevronLeft,
  Ruler, Users, MapPin, Package, Menu, X, LogOut,
  Leaf, Tag, Truck, Calendar, Inbox, ClipboardList, Anchor, Box, Container, Building2,
  Warehouse, PackageOpen, ScanLine, Layers, LayoutGrid
} from 'lucide-react';
import { supabase } from './supabase';
import { EmpresaProvider } from './context/EmpresaContext';
import { AppRoute } from './types/empacadora';
import CalibresList from './pages/configuracion/CalibresList';
import ProveedoresFruta from './pages/configuracion/ProveedoresFruta';
import ParcelasFinca from './pages/configuracion/ParcelasFinca';
import MaterialesEmpaque from './pages/configuracion/MaterialesEmpaque';
import MarcasList from './pages/configuracion/MarcasList';
import TransportistasList from './pages/configuracion/TransportistasList';
import DestinosList from './pages/configuracion/DestinosList';
import ClientesList from './pages/configuracion/ClientesList';
import BodegasList from './pages/configuracion/BodegasList';
import MaterialesPaleta from './pages/configuracion/MaterialesPaleta';
import ConfigGeneral from './pages/configuracion/ConfigGeneral';
import DronImporter from './pages/configuracion/DronImporter';
import DronMosaico from './pages/configuracion/DronMosaico';
import DronMosaicoLab from './pages/configuracion/DronMosaicoLab';
import InventarioMateriales from './pages/inventario/InventarioMateriales';
import DisponibilidadMateriales from './pages/inventario/DisponibilidadMateriales';
import LiquidacionIP from './pages/inventario/LiquidacionIP';
import ReporteProduccion from './pages/reportes/ReporteProduccion';
import SemanasList from './pages/recepcion/SemanasList';
import RecepcionesList from './pages/recepcion/RecepcionesList';
import ProgramasList from './pages/programa/ProgramasList';
import BoleasList from './pages/empaque/BoleasList';
import DespachosList from './pages/empaque/DespachosList';

interface Palette {
  id: string; nombre: string;
  colorScheme?: 'dark' | 'light';
  surfaceBase: string; surfaceRaised: string; surfaceOverlay: string; surfaceDeep: string;
  ink: string; inkMuted: string; inkFaint: string;
  line: string; lineDim: string;
  accentBg: string; accent: string; accentTxt: string;
}

const PALETTES: Palette[] = [
  {
    id: 'selva', nombre: 'Selva',
    surfaceBase: '#0b1120', surfaceRaised: '#101b2e', surfaceOverlay: '#0d1626', surfaceDeep: '#070d18',
    ink: '#d8e3ef', inkMuted: '#7c93ae', inkFaint: '#3a526a',
    line: '#1c2e46', lineDim: '#131f33',
    accentBg: '#0f2a1a', accent: '#16a34a', accentTxt: '#4ade80',
  },
  {
    id: 'oceano', nombre: 'Oceano',
    surfaceBase: '#080f1e', surfaceRaised: '#0d1a30', surfaceOverlay: '#0a1525', surfaceDeep: '#050b14',
    ink: '#d4e4f5', inkMuted: '#6b8eae', inkFaint: '#2e4d6a',
    line: '#162844', lineDim: '#0e1c30',
    accentBg: '#062040', accent: '#0284c7', accentTxt: '#38bdf8',
  },
  {
    id: 'atardecer', nombre: 'Atardecer',
    surfaceBase: '#130c06', surfaceRaised: '#1e1209', surfaceOverlay: '#180e07', surfaceDeep: '#0d0804',
    ink: '#f0dcc8', inkMuted: '#a07858', inkFaint: '#5a3820',
    line: '#2e1a0a', lineDim: '#1e1007',
    accentBg: '#2a1200', accent: '#c2410c', accentTxt: '#fb923c',
  },
  {
    id: 'violeta', nombre: 'Violeta',
    surfaceBase: '#0f0918', surfaceRaised: '#180f27', surfaceOverlay: '#120b1e', surfaceDeep: '#08060f',
    ink: '#e8d8f5', inkMuted: '#8878a8', inkFaint: '#3a2858',
    line: '#1e1535', lineDim: '#130d22',
    accentBg: '#1a0d33', accent: '#7c3aed', accentTxt: '#a78bfa',
  },
  {
    id: 'rubi', nombre: 'Rubi',
    surfaceBase: '#120608', surfaceRaised: '#1c0a0e', surfaceOverlay: '#160709', surfaceDeep: '#0b0305',
    ink: '#f5d8db', inkMuted: '#a86870', inkFaint: '#5a2830',
    line: '#2e0d12', lineDim: '#1e0709',
    accentBg: '#2a0008', accent: '#b91c1c', accentTxt: '#f87171',
  },
  {
    id: 'semilla', nombre: 'Semilla',
    surfaceBase: '#0e110a', surfaceRaised: '#161c10', surfaceOverlay: '#12170d', surfaceDeep: '#090c06',
    ink: '#e8eddc', inkMuted: '#8fa878', inkFaint: '#4a5e38',
    line: '#2a3820', lineDim: '#1c2616',
    accentBg: '#1e2e10', accent: '#65a30d', accentTxt: '#a3e635',
  },
  {
    id: 'dark', nombre: 'Dark',
    surfaceBase: '#0a0a0e', surfaceRaised: '#111116', surfaceOverlay: '#0d0d12', surfaceDeep: '#060608',
    ink: '#e4e4e7', inkMuted: '#a1a1aa', inkFaint: '#52525b',
    line: '#27272a', lineDim: '#18181b',
    accentBg: '#1c1c22', accent: '#71717a', accentTxt: '#d4d4d8',
  },
  {
    id: 'claro', nombre: 'Claro',
    colorScheme: 'light',
    surfaceBase: '#d6dfe9', surfaceRaised: '#e4ecf5', surfaceOverlay: '#ffffff', surfaceDeep: '#c2cdd9',
    ink: '#0f172a', inkMuted: '#334155', inkFaint: '#64748b',
    line: '#9aacbc', lineDim: '#becad6',
    accentBg: '#dbeafe', accent: '#2563eb', accentTxt: '#1e40af',
  },
];

const THEME_KEY = 'emp_color_theme';

function getPalette(id: string): Palette {
  return PALETTES.find(p => p.id === id) || PALETTES[0];
}

function applyPalette(p: Palette) {
  const r = document.documentElement.style;
  r.setProperty('--surface-base',    p.surfaceBase);
  r.setProperty('--surface-raised',  p.surfaceRaised);
  r.setProperty('--surface-overlay', p.surfaceOverlay);
  r.setProperty('--surface-deep',    p.surfaceDeep);
  r.setProperty('--ink',             p.ink);
  r.setProperty('--ink-muted',       p.inkMuted);
  r.setProperty('--ink-faint',       p.inkFaint);
  r.setProperty('--line',            p.line);
  r.setProperty('--line-dim',        p.lineDim);
  r.setProperty('--emp-bg-main',     p.surfaceBase);
  r.setProperty('--emp-bg-panel',    p.surfaceDeep);
  r.setProperty('--emp-border',      p.line);
  r.setProperty('--emp-accent-bg',   p.accentBg);
  r.setProperty('--emp-accent',      p.accent);
  r.setProperty('--emp-accent-txt',  p.accentTxt);
  // color-scheme afecta scrollbars, inputs, selects nativos
  document.documentElement.style.colorScheme = p.colorScheme || 'dark';
}

function ThemeSwitcher({ paletteId, onChange, compact = false }: { paletteId: string; onChange: (id: string) => void; compact?: boolean }) {
  const p = getPalette(paletteId);
  const cycle = () => {
    const idx = PALETTES.findIndex(x => x.id === paletteId);
    onChange(PALETTES[(idx + 1) % PALETTES.length].id);
  };
  return (
    <button onClick={cycle} title={`Tema: ${p.nombre} - click para cambiar`}
      className={`flex items-center rounded-full text-xs font-medium transition-colors ${compact ? 'gap-1 px-2 py-1' : 'gap-1.5 px-2.5 py-1'}`}
      style={{ background: p.accentBg, border: `1px solid ${p.accent}44`, color: p.accentTxt }}>
      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.accentTxt})` }} />
      <span className={compact ? 'hidden sm:inline' : ''}>{p.nombre}</span>
    </button>
  );
}

interface MenuItem {
  id: string;
  label: string;
  route?: AppRoute;
  icon: React.ReactNode;
  children?: { id: string; label: string; route: AppRoute; icon: React.ReactNode }[];
}

const MENU: MenuItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    route: 'dashboard',
    icon: <LayoutDashboard size={18} />,
  },
  {
    id: 'programa',
    label: 'Programa',
    icon: <ClipboardList size={18} />,
    children: [
      { id: 'programa.lista', label: 'Programa Semanal', route: 'programa.lista',   icon: <ClipboardList size={16} /> },
      { id: 'empaque.boletas', label: 'Control Empaque',  route: 'empaque.boletas',   icon: <Box size={16} /> },
      { id: 'empaque.despachos', label: 'Boletas Despacho', route: 'empaque.despachos', icon: <Container size={16} /> },
    ],
  },
  {
    id: 'recepcion',
    label: 'Recepcion',
    icon: <Inbox size={18} />,
    children: [
      { id: 'recepcion.semanas', label: 'Semanas',          route: 'recepcion.semanas',     icon: <Calendar size={16} /> },
      { id: 'recepcion.recepciones', label: 'Ingreso de Fruta', route: 'recepcion.recepciones', icon: <Truck size={16} /> },
    ],
  },
  {
    id: 'configuracion',
    label: 'Configuracion',
    icon: <Settings size={18} />,
    children: [
      { id: 'config.calibres', label: 'Calibres',             route: 'config.calibres',         icon: <Ruler size={16} /> },
      { id: 'config.marcas', label: 'Marcas',               route: 'config.marcas',           icon: <Tag size={16} /> },
      { id: 'config.proveedores', label: 'Proveedores de Fruta', route: 'config.proveedores',      icon: <Users size={16} /> },
      { id: 'config.transportistas', label: 'Transportistas',       route: 'config.transportistas',   icon: <Truck size={16} /> },
      { id: 'config.parcelas', label: 'Parcelas',             route: 'config.parcelas',         icon: <MapPin size={16} /> },
      { id: 'config.materiales', label: 'Materiales Empaque',   route: 'config.materiales',       icon: <Package size={16} /> },
      { id: 'config.clientes', label: 'Clientes',             route: 'config.clientes',         icon: <Building2 size={16} /> },
      { id: 'config.destinos', label: 'Destinos',             route: 'config.destinos',         icon: <Anchor size={16} /> },
      { id: 'config.bodegas', label: 'Bodegas',              route: 'config.bodegas',          icon: <Warehouse size={16} /> },
      { id: 'config.materiales_paleta', label: 'Mat. por Paleta', route: 'config.materiales_paleta', icon: <Layers size={16} /> },
      { id: 'config.general', label: 'Configuracion General', route: 'config.general',          icon: <Settings size={16} /> },
      { id: 'config.dron',             label: 'Dron → Polígono',    route: 'config.dron',             icon: <ScanLine size={16} /> },
      { id: 'config.dron_mosaico',     label: 'Dron → Mosaico',     route: 'config.dron_mosaico',     icon: <LayoutGrid size={16} /> },
      { id: 'config.dron_mosaico_lab', label: 'Dron → Mosaico Lab', route: 'config.dron_mosaico_lab', icon: <LayoutGrid size={16} /> },
    ],
  },
  {
    id: 'inventario',
    label: 'Inventario',
    icon: <PackageOpen size={18} />,
    children: [
      { id: 'inventario.materiales',      label: 'Materiales',      route: 'inventario.materiales',      icon: <Package size={16} /> },
      { id: 'inventario.disponibilidad',  label: 'Disponibilidad',  route: 'inventario.disponibilidad',  icon: <PackageOpen size={16} /> },
      { id: 'inventario.liquidacion',     label: 'Liquidación IP',  route: 'inventario.liquidacion',     icon: <Box size={16} /> },
    ],
  },
  {
    id: 'reportes',
    label: 'Reportes',
    icon: <ClipboardList size={18} />,
    children: [
      { id: 'reportes.produccion', label: 'Producción Diaria', route: 'reportes.produccion', icon: <ClipboardList size={16} /> },
    ],
  },
];

const ROUTE_PARENT_FALLBACK: Partial<Record<AppRoute, AppRoute>> = {
  'programa.lista': 'dashboard',
  'empaque.boletas': 'dashboard',
  'empaque.despachos': 'dashboard',
  'recepcion.semanas': 'dashboard',
  'recepcion.recepciones': 'dashboard',
  'config.calibres': 'dashboard',
  'config.marcas': 'dashboard',
  'config.proveedores': 'dashboard',
  'config.transportistas': 'dashboard',
  'config.parcelas': 'dashboard',
  'config.materiales': 'dashboard',
  'config.clientes': 'dashboard',
  'config.destinos': 'dashboard',
  'config.bodegas': 'dashboard',
  'config.materiales_paleta': 'dashboard',
  'config.general': 'dashboard',
  'config.dron':              'dashboard',
  'config.dron_mosaico':      'dashboard',
  'config.dron_mosaico_lab':  'dashboard',
  'inventario.materiales': 'dashboard',
};

function getMenuDisplayLabel(id: string, fallback: string) {
  switch (id) {
    case 'recepcion':
      return 'Recepcion';
    case 'configuracion':
      return 'Configuracion';
    case 'config.general':
      return 'Configuracion General';
    default:
      return fallback;
  }
}

function buildSidebarMenu(items: MenuItem[]): MenuItem[] {
  return items.map(item => ({
    ...item,
    label: getMenuDisplayLabel(item.id, item.label),
    children: item.children?.map(child => ({
      ...child,
      label: getMenuDisplayLabel(child.id, child.label),
    })),
  }));
}

function getRouteMeta(route: AppRoute) {
  for (const item of MENU) {
    if (item.route === route) {
      return {
        label: getMenuDisplayLabel(item.id, item.label),
        parentLabel: 'Inicio',
        parentRoute: 'dashboard' as AppRoute,
      };
    }
    if (item.children) {
      const child = item.children.find(entry => entry.route === route);
      if (child) {
        return {
          label: getMenuDisplayLabel(child.id, child.label),
          parentLabel: getMenuDisplayLabel(item.id, item.label),
          parentRoute: ROUTE_PARENT_FALLBACK[route] || ('dashboard' as AppRoute),
        };
      }
    }
  }

  return {
    label: 'Dashboard',
    parentLabel: 'Inicio',
    parentRoute: 'dashboard' as AppRoute,
  };
}

interface EmpresaOpcion { id: number; nombre: string; codigo?: string; }
interface TempAuthContext { access_token: string; email: string; password: string; }
interface LoginInfo {
  empresaId: number;
  empresaNombre: string;
  empresaCodigo: string;
  usuarioNombre: string;
  session: Session;
}

function LoginPage({ onLogin }: { onLogin: (info: LoginInfo) => void }) {
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  // Paso 2: seleccion de empresa
  const [empresas, setEmpresas]   = useState<EmpresaOpcion[]>([]);
  const [tempAuth, setTempAuth] = useState<TempAuthContext | null>(null);
  const [tempUsuario, setTempUsuario] = useState('');

  async function parseApiResponse(resp: Response) {
    const raw = await resp.text();
    try {
      return { data: JSON.parse(raw), raw };
    } catch {
      return { data: null, raw };
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, modulo_codigo: 'EMP' }),
      });
      const { data, raw } = await parseApiResponse(resp);
      if (!data) {
        const htmlTitle = raw.match(/<title>(.*?)<\/title>/i)?.[1];
        const preview = raw
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 180);
        console.error('[Empacadora login] respuesta no JSON', { status: resp.status, raw });
        setError(htmlTitle ? `Servidor devolvio HTML: ${htmlTitle}${preview ? ` - ${preview}` : ''}` : `Respuesta inesperada (${resp.status})${preview ? ` - ${preview}` : ''}.`);
        setLoading(false); return;
      }
      if (!resp.ok || !data.ok) {
        setError(data.message || 'Usuario o contrasena incorrectos');
        setLoading(false); return;
      }

      const autorizadas: EmpresaOpcion[] = data.empresas_autorizadas || [];
      const nombreUsuario: string = data.usuario?.nombre || data.usuario?.username || '';
      const usuarioEmail: string = data.usuario?.email || '';
      if (autorizadas.length === 0) {
        setError('Su usuario no tiene acceso a ninguna planta empacadora.');
        setLoading(false);
      } else if (autorizadas.length === 1) {
        await selectEmpresa(autorizadas[0], data.session?.access_token || '', nombreUsuario, usuarioEmail, password);
      } else {
        setEmpresas(autorizadas);
        setTempAuth({ access_token: data.session?.access_token || '', email: usuarioEmail, password });
        setTempUsuario(nombreUsuario);
        setLoading(false);
      }
    } catch {
      setError('No se pudo conectar con el servidor. Verifique que el ERP este activo.');
      setLoading(false);
    }
  }

  async function selectEmpresa(empresa: EmpresaOpcion, accessToken: string, usuarioNombre: string, usuarioEmail: string, plainPassword: string) {
    setLoading(true); setError('');
    try {
      const resp = await fetch('/api/auth/select-empresa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, empresa_id: empresa.id }),
      });
      const { data, raw } = await parseApiResponse(resp);
      if (!data) {
        const htmlTitle = raw.match(/<title>(.*?)<\/title>/i)?.[1];
        const preview = raw
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 180);
        console.error('[Empacadora select-empresa] respuesta no JSON', { status: resp.status, raw });
        setError(htmlTitle ? `Servidor devolvio HTML: ${htmlTitle}${preview ? ` - ${preview}` : ''}` : `Respuesta inesperada (${resp.status})${preview ? ` - ${preview}` : ''}.`);
        setLoading(false); return;
      }
      if (!resp.ok || !data.ok) {
        setError(data.message || 'Error al seleccionar empresa');
        setLoading(false); return;
      }
      await supabase.auth.signOut({ scope: 'local' });
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: usuarioEmail,
        password: plainPassword,
      });
      if (signInError || !signInData?.session) {
        setError(signInError?.message || 'No se pudo establecer la sesion');
        setLoading(false);
        return;
      }
      onLogin({
        empresaId:      empresa.id,
        empresaNombre:  empresa.nombre,
        empresaCodigo:  empresa.codigo || '',
        usuarioNombre,
        session: signInData.session,
      });
    } catch (err: any) {
      setError(err?.message || 'Error al conectar con el servidor.');
      setLoading(false);
    }
  }

  const SLIDES = [
    {
      title: 'Del campo al contenedor,\ntodo en un solo sistema.',
      subtitle: 'Registre recepciones con GPS desde el dispositivo en campo y trace cada fruta hasta el despacho de exportacion.',
      image: `${process.env.PUBLIC_URL}/branding/login-1.jpg`,
    },
    {
      title: 'Trazabilidad en tiempo real\npor lote, bloque y VIN.',
      subtitle: 'Cada tarina registrada, cada boleta firmada. Control total del proceso de empaque por semana y programa.',
      image: `${process.env.PUBLIC_URL}/branding/login-2.jpg`,
    },
    {
      title: 'Multiempresa.\nUn login para todas sus plantas.',
      subtitle: 'Acceda a cualquiera de sus plantas empacadoras con las mismas credenciales y permisos precisos por rol.',
      image: `${process.env.PUBLIC_URL}/branding/login-3.jpg`,
    },
  ];

  const [slideIdx, setSlideIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSlideIdx(i => (i + 1) % SLIDES.length), 5000);
    return () => clearInterval(t);
  }, [SLIDES.length]);

  const panel = (body: React.ReactNode) => (
    <div className="emp-login-grid" style={{
      minHeight: '100vh', display: 'grid',
      gridTemplateColumns: 'minmax(0,1.2fr) 440px',
      background: '#0c1a0e',
    }}>
      {/* Showcase izquierdo - carrusel */}
      <div className="emp-login-showcase" style={{ position:'relative', overflow:'hidden', display:'flex', alignItems:'flex-end', padding:'48px' }}>

        {/* Capas de imagen con crossfade */}
        {SLIDES.map((s, i) => (
          <div key={i} style={{
            position:'absolute', inset:0,
            backgroundImage:`url(${s.image})`,
            backgroundSize:'cover', backgroundPosition:'center',
            filter:'saturate(1.15) contrast(1.06) brightness(1.05)',
            opacity: i === slideIdx ? 1 : 0,
            transform: i === slideIdx ? 'scale(1)' : 'scale(1.03)',
            transition:'opacity 1s ease, transform 1.8s ease',
          }}/>
        ))}

        {/* Overlay oscuro con tinte verde */}
        <div style={{
          position:'absolute', inset:0, pointerEvents:'none',
          background:'linear-gradient(140deg,rgba(3,26,10,0.18) 0%,rgba(5,46,22,0.30) 50%,rgba(3,26,10,0.55) 100%), linear-gradient(to top,rgba(3,26,10,0.75) 0%,transparent 55%)',
        }}/>

        {/* Contenido sobre la imagen */}
        <div style={{ position:'relative', zIndex:1, color:'#f0fdf4', maxWidth:'560px', width:'100%' }}>

          {/* Badge sistema */}
          <div style={{
            display:'inline-flex', alignItems:'center', gap:'7px', padding:'5px 12px',
            borderRadius:'999px', border:'1px solid rgba(255,255,255,0.22)',
            background:'rgba(255,255,255,0.10)', backdropFilter:'blur(6px)',
            fontSize:'10px', letterSpacing:'0.08em', textTransform:'uppercase',
            marginBottom:'16px',
          }}>
            <Leaf size={11} style={{ color:'#4ade80' }}/> Sistema de Trazabilidad - Empacadora de Pina
          </div>

          {/* Titulo animado */}
          <h1 style={{
            margin:0, fontSize:'36px', fontWeight:700, lineHeight:1.1,
            letterSpacing:'-0.03em', whiteSpace:'pre-line',
            textShadow:'0 2px 12px rgba(0,0,0,0.4)',
          }}>
            {SLIDES[slideIdx].title}
          </h1>

          <p style={{
            marginTop:'12px', fontSize:'14px', color:'#bbf7d0',
            lineHeight:1.65, maxWidth:'460px',
            textShadow:'0 1px 6px rgba(0,0,0,0.5)',
          }}>
            {SLIDES[slideIdx].subtitle}
          </p>

          {/* Dots */}
          <div style={{ display:'flex', gap:'7px', marginTop:'22px' }}>
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => setSlideIdx(i)}
                style={{
                  width: i === slideIdx ? '22px' : '7px',
                  height:'7px', borderRadius:'999px', border:'none', padding:0, cursor:'pointer',
                  background: i === slideIdx ? '#4ade80' : 'rgba(255,255,255,0.35)',
                  transition:'width 0.3s ease, background 0.3s ease',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Panel derecho */}
      <div className="emp-login-panel-wrap" style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'28px',
        background:'linear-gradient(160deg,#f0fdf4 0%,#e2e8f0 100%)',
      }}>
        <div className="emp-login-card" style={{
          width:'100%', maxWidth:'400px', background:'#fff',
          border:'1px solid #d1fae5', borderRadius:'20px',
          padding:'36px 30px', boxShadow:'0 20px 50px rgba(5,46,22,0.13), 0 4px 14px rgba(5,46,22,0.07)',
        }}>
          {/* Logo/icono */}
          <div className="emp-login-brand" style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'22px' }}>
            <div style={{
              width:'48px', height:'48px', borderRadius:'13px', flexShrink:0,
              background:'linear-gradient(135deg,#15803d,#22c55e)',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 6px 18px rgba(21,128,61,0.30)',
            }}>
              <span style={{ fontSize:'24px', lineHeight:1 }}>EP</span>
            </div>
            <div>
              <div style={{ fontSize:'20px', fontWeight:700, color:'#0f172a', letterSpacing:'-0.02em', lineHeight:1.2 }}>Iniciar Sesion</div>
              <div style={{ fontSize:'12px', color:'#64748b', marginTop:'2px' }}>Empacadora de Pina</div>
            </div>
          </div>
          <div style={{ fontSize:'12px', color:'#94a3b8', marginBottom:'20px', paddingBottom:'20px', borderBottom:'1px solid #f1f5f9' }}>
            Usa las mismas credenciales del ERP
          </div>
          {body}
          <div style={{ fontSize:'10px', color:'#cbd5e1', textAlign:'center', marginTop:'20px', fontFamily:'monospace', letterSpacing:'0.04em' }}>
            EMPACADORA v1.0 - {new Date().getFullYear()} - Thialez
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .emp-login-grid { grid-template-columns: 1fr !important; }
          .emp-login-showcase { display: none !important; }
          .emp-login-panel-wrap {
            min-height: 100vh;
            padding: 18px !important;
            background: linear-gradient(180deg, #0b1120 0%, #101b2e 100%) !important;
          }
          .emp-login-card {
            max-width: 420px !important;
            border-radius: 16px !important;
            padding: 24px 20px !important;
            margin: 0 auto !important;
          }
        }
        @media (max-width: 620px) {
          .emp-login-panel-wrap {
            padding: 12px !important;
            align-items: flex-start !important;
          }
          .emp-login-card {
            padding: 20px 16px !important;
            width: min(100%, 380px) !important;
            box-shadow: 0 16px 36px rgba(5,46,22,0.18), 0 4px 14px rgba(5,46,22,0.10) !important;
          }
          .emp-login-brand {
            margin-bottom: 18px !important;
          }
        }
        .emp-field-label { display:block; font-size:11px; font-weight:600; color:#64748b; letter-spacing:0.06em; text-transform:uppercase; margin-bottom:6px; }
        .emp-field-input { width:100%; padding:11px 13px; background:#f8fafc; border:1px solid #dbe1ea; border-radius:10px; color:#0f172a; font-size:14px; outline:none; transition:border-color 0.2s,box-shadow 0.2s; margin-bottom:14px; box-sizing:border-box; }
        .emp-field-input:focus { border-color:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,0.18); }
        .emp-btn-login { width:100%; padding:12px; background:linear-gradient(135deg,#16a34a,#22c55e); border:none; border-radius:10px; color:white; font-size:14px; font-weight:600; cursor:pointer; margin-top:4px; transition:opacity 0.2s; }
        .emp-btn-login:hover { opacity:0.92; }
        .emp-btn-login:disabled { opacity:0.6; cursor:not-allowed; }
        .emp-btn-back { width:100%; padding:10px; background:#e2e8f0; border:1px solid #cbd5e1; border-radius:10px; color:#0f172a; font-size:13px; cursor:pointer; margin-top:8px; }
        .emp-login-error { font-size:12px; color:#dc2626; text-align:center; margin:2px 0 10px; }
        .emp-empresa-btn { width:100%; padding:12px 14px; border:1px solid #e5e7eb; border-radius:10px; background:#fff; text-align:left; cursor:pointer; margin-bottom:8px; font-size:13px; font-weight:500; color:#1f2937; transition:border-color 0.18s,background 0.18s; }
        .emp-empresa-btn:hover { border-color:#22c55e; background:#f0fdf4; }
      `}</style>
    </div>
  );

  // Paso 2 - selector de empresa
  if (empresas.length > 0) {
    return panel(
      <div>
        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px' }}>Seleccione la planta / empresa:</p>
        {empresas.map(e => (
          <button key={e.id} className="emp-empresa-btn"
            onClick={() => tempAuth && selectEmpresa(e, tempAuth.access_token, tempUsuario, tempAuth.email, tempAuth.password)}
            disabled={loading}>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{e.nombre}</span>
            {e.codigo && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>{e.codigo}</span>}
          </button>
        ))}
        {error && <div className="emp-login-error">{error}</div>}
        <button className="emp-btn-back" onClick={() => { setEmpresas([]); setTempAuth(null); }}>&larr; Volver</button>
      </div>
    );
  }

  // Paso 1 - credenciales
  return panel(
    <form onSubmit={handleSubmit}>
      <label className="emp-field-label">Usuario</label>
      <input className="emp-field-input" type="text" required placeholder="Ingrese su usuario"
        autoFocus autoComplete="username"
        value={username} onChange={e => setUsername(e.target.value)} />
      <label className="emp-field-label">Contrasena</label>
      <input className="emp-field-input" type="password" required placeholder="********"
        autoComplete="current-password"
        value={password} onChange={e => setPassword(e.target.value)} />
      {error && <div className="emp-login-error">{error}</div>}
      <button className="emp-btn-login" type="submit" disabled={loading}>
        {loading ? 'Verificando...' : 'Continuar ->'}
      </button>
    </form>
  );
}

function Dashboard() {
  return <DashboardEmpacadora />;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [empresaId, setEmpresaId]         = useState<number>(0);
  const [empresaNombre, setEmpresaNombre] = useState('');
  const [empresaCodigo, setEmpresaCodigo] = useState('');
  const [usuarioNombre, setUsuarioNombre] = useState('');
  const [logoUrl, setLogoUrl]             = useState('');
  const [nombrePlanta, setNombrePlanta]   = useState('');
  const [activeRoute, setActiveRoute] = useState<AppRoute>('dashboard');
  const [routeHistory, setRouteHistory] = useState<AppRoute[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['Programa', 'Recepcion', 'Configuracion']);
  const [paletteId, setPaletteId] = useState<string>(() => {
    const saved = localStorage.getItem(THEME_KEY) || '';
    const id = PALETTES.some(p => p.id === saved) ? saved : PALETTES[0].id;
    applyPalette(getPalette(id)); // aplica inmediatamente para evitar flash
    return id;
  });

  useEffect(() => {
    applyPalette(getPalette(paletteId));
    localStorage.setItem(THEME_KEY, paletteId);
  }, [paletteId]);

  useEffect(() => {
    async function refetchConfig() {
      if (!empresaId) return;
      const { data } = await supabase
        .from('fe_config_empresa')
        .select('logo_url, nombre_planta')
        .eq('empresa_id', empresaId)
        .maybeSingle();
      if (data?.logo_url)    setLogoUrl(data.logo_url);
      if (data?.nombre_planta) setNombrePlanta(data.nombre_planta);
    }
    window.addEventListener('empresa-config-updated', refetchConfig);
    return () => window.removeEventListener('empresa-config-updated', refetchConfig);
  }, [empresaId]);

  // Sin auto-restauracion: siempre inicia en login, igual que el ERP

  async function handleLogin(info: LoginInfo) {
    setSession(info.session);
    setEmpresaId(info.empresaId);
    setEmpresaNombre(info.empresaNombre);
    setEmpresaCodigo(info.empresaCodigo);
    setUsuarioNombre(info.usuarioNombre);
    const { data: cfg } = await supabase
      .from('fe_config_empresa')
      .select('logo_url, nombre_planta')
      .eq('empresa_id', info.empresaId)
      .maybeSingle();
    if (cfg?.logo_url)    setLogoUrl(cfg.logo_url);
    if (cfg?.nombre_planta) setNombrePlanta(cfg.nombre_planta);
  }

  async function handleLogout() {
    setSession(null);
    setEmpresaId(0); setEmpresaNombre(''); setEmpresaCodigo(''); setUsuarioNombre('');
    setLogoUrl(''); setNombrePlanta('');
    setRouteHistory([]);
    setActiveRoute('dashboard');
    await supabase.auth.signOut();
  }

  function isGroupExpanded(label: string) {
    const normalized = getMenuDisplayLabel(label.toLowerCase(), label);
    return expandedGroups.some(group => getMenuDisplayLabel(group.toLowerCase(), group) === normalized);
  }

  function toggleGroup(label: string) {
    const normalized = getMenuDisplayLabel(label.toLowerCase(), label);
    setExpandedGroups(prev =>
      prev.some(group => getMenuDisplayLabel(group.toLowerCase(), group) === normalized)
        ? prev.filter(group => getMenuDisplayLabel(group.toLowerCase(), group) !== normalized)
        : [...prev, normalized]
    );
  }

  function navigate(route: AppRoute) {
    if (route !== activeRoute) {
      setRouteHistory(prev => [...prev, activeRoute]);
    }
    setActiveRoute(route);
    setSidebarOpen(false);
  }

  function handleBack() {
    setSidebarOpen(false);
    setRouteHistory(prev => {
      if (prev.length > 0) {
        const next = [...prev];
        const previousRoute = next.pop()!;
        setActiveRoute(previousRoute);
        return next;
      }
      setActiveRoute(ROUTE_PARENT_FALLBACK[activeRoute] || 'dashboard');
      return [];
    });
  }

  function renderPage() {
    switch (activeRoute) {
      case 'programa.lista':          return <ProgramasList />;
      case 'empaque.boletas':         return <BoleasList />;
      case 'empaque.despachos':       return <DespachosList />;
      case 'recepcion.semanas':       return <SemanasList />;
      case 'recepcion.recepciones':   return <RecepcionesList />;
      case 'config.calibres':         return <CalibresList />;
      case 'config.marcas':           return <MarcasList />;
      case 'config.proveedores':      return <ProveedoresFruta />;
      case 'config.transportistas':   return <TransportistasList />;
      case 'config.parcelas':         return <ParcelasFinca />;
      case 'config.materiales':       return <MaterialesEmpaque />;
      case 'config.destinos':         return <DestinosList />;
      case 'config.clientes':         return <ClientesList />;
      case 'config.bodegas':          return <BodegasList />;
      case 'config.materiales_paleta': return <MaterialesPaleta />;
      case 'config.general':          return <ConfigGeneral />;
      case 'config.dron':             return <DronImporter />;
      case 'config.dron_mosaico':     return <DronMosaico />;
      case 'config.dron_mosaico_lab': return <DronMosaicoLab />;
      case 'inventario.materiales':     return <InventarioMateriales />;
      case 'inventario.disponibilidad': return <DisponibilidadMateriales />;
      case 'inventario.liquidacion':    return <LiquidacionIP />;
      case 'reportes.produccion':       return <ReporteProduccion />;
      default:                          return <Dashboard />;
    }
  }

  const sidebarMenu = buildSidebarMenu(MENU);
  const currentRouteMeta = getRouteMeta(activeRoute);
  const showBackButton = activeRoute !== 'dashboard' || routeHistory.length > 0;

  if (!session || !empresaId) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Layout con sidebar y navbar superior
  return (
    <EmpresaProvider empresaId={empresaId}>
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--emp-bg-main)' }}>

      
      <header className="flex items-center justify-between gap-2 px-3 sm:px-4 shrink-0 sticky top-0 z-40"
        style={{ backgroundColor: 'var(--emp-bg-panel)', borderBottom: '1px solid var(--emp-border)', minHeight: '44px' }}>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button onClick={() => setSidebarOpen(true)}
            className="md:hidden p-1 rounded" style={{ color: 'var(--ink-faint)' }}>
            <Menu size={17} />
          </button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'var(--emp-accent-bg)', border: '1px solid var(--emp-accent)' }}>
              {logoUrl
                ? <img src={logoUrl} alt="logo empresa" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                : <Leaf size={11} style={{ color: 'var(--emp-accent-txt)' }} />}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>
                {empresaNombre || 'Empacadora de Pina'}
              </p>
              <div className="flex items-center gap-2 text-[10px]" style={{ color: '#7c93ae' }}>
                <span className="truncate">{nombrePlanta || 'Planta empacadora'}</span>
                {empresaCodigo && (
                  <span className="font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={{ color: 'var(--emp-accent-txt)', background: 'var(--emp-accent-bg)', border: '1px solid var(--emp-accent)' }}>
                    {empresaCodigo}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <ThemeSwitcher paletteId={paletteId} onChange={setPaletteId} compact />
          <div style={{ width: '1px', height: '20px', background: 'var(--emp-border)' }} className="hidden sm:block" />
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ background: 'var(--emp-accent-bg)', color: 'var(--emp-accent-txt)', border: '1px solid var(--emp-accent)' }}>
              {(usuarioNombre || session.user.email || 'U').charAt(0).toUpperCase()}
            </div>
            <span className="text-xs font-medium" style={{ color: '#7c93ae' }}>{usuarioNombre || session.user.email}</span>
          </div>
          <div style={{ width: '1px', height: '20px', background: 'var(--emp-border)' }} className="hidden sm:block" />
          <button onClick={() => void handleLogout()}
            className="flex shrink-0 items-center justify-center gap-1.5 text-xs px-2 py-1 rounded transition-colors"
            style={{ color: '#3a526a' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#3a526a'; }}>
            <LogOut size={13} />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      
      <div className="flex flex-1 overflow-hidden">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/70 z-20 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside
          className={`
            fixed top-[44px] left-0 h-[calc(100vh-44px)] z-30 flex flex-col
            transform transition-all duration-200
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            md:translate-x-0 md:static md:h-auto md:z-auto
          `}
          style={{
            width: sidebarCollapsed ? '3.5rem' : '14rem',
            backgroundColor: 'var(--emp-bg-panel)',
            borderRight: '1px solid var(--emp-border)',
          }}
        >
          {/* Marca */}
          <div
            className={`relative flex items-center py-3 ${sidebarCollapsed ? 'justify-center px-0' : 'gap-2.5 px-4'}`}
            style={{ borderBottom: '1px solid var(--emp-border)' }}
          >
            <div
              className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center text-xs font-black tracking-[0.18em]"
              style={{ backgroundColor: 'var(--emp-accent-bg)', border: '1px solid var(--emp-accent)' }}
              title={sidebarCollapsed ? (nombrePlanta || 'Empacadora') : undefined}
            >
              <span style={{ color: 'var(--emp-accent-txt)' }}>PE</span>
            </div>
            {!sidebarCollapsed && (
              <div>
                <p className="font-semibold text-xs leading-tight" style={{ color: '#d8e3ef' }}>{nombrePlanta || 'Empacadora'}</p>
                <p className="text-[10px]" style={{ color: '#3a526a' }}>Planta empacadora</p>
              </div>
            )}
            {/* Botón toggle — solo desktop */}
            <button
              className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full border p-0.5 transition md:flex"
              style={{ backgroundColor: 'var(--emp-bg-panel)', borderColor: 'var(--emp-border)', color: 'var(--ink-muted)' }}
              onClick={() => setSidebarCollapsed(c => !c)}
              type="button"
              title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
            >
              {sidebarCollapsed
                ? <ChevronRight size={12} />
                : <ChevronLeft size={12} />}
            </button>
          </div>

          {/* Nav */}
          <nav className={`flex-1 overflow-y-auto py-3 space-y-0.5 ${sidebarCollapsed ? 'px-1' : 'px-2'}`}>
            {sidebarMenu.map(item => {
              if (!item.children) {
                const active = activeRoute === item.route;
                return (
                  <button
                    key={item.label}
                    onClick={() => navigate(item.route!)}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={`w-full flex items-center rounded text-xs font-medium transition-colors text-left
                      ${sidebarCollapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2'}`}
                    style={{
                      color:      active ? 'var(--emp-accent-txt)' : 'var(--ink-muted)',
                      background: active ? 'var(--emp-accent-bg)' : 'transparent',
                      borderLeft: active ? `2px solid var(--emp-accent)` : '2px solid transparent',
                    }}
                  >
                    {item.icon}
                    {!sidebarCollapsed && item.label}
                  </button>
                );
              }

              const expanded      = isGroupExpanded(item.label);
              const isChildActive = item.children.some(c => c.route === activeRoute);

              // Colapsado: mostrar solo ícono del grupo con tooltip; navega al primer hijo
              if (sidebarCollapsed) {
                return (
                  <button
                    key={item.label}
                    onClick={() => navigate(item.children![0].route)}
                    title={item.label}
                    className="w-full flex justify-center items-center px-0 py-2.5 rounded text-xs font-medium transition-colors"
                    style={{
                      color:      isChildActive ? 'var(--emp-accent-txt)' : 'var(--ink-muted)',
                      background: isChildActive ? 'var(--emp-accent-bg)' : 'transparent',
                      borderLeft: isChildActive ? `2px solid var(--emp-accent)` : '2px solid transparent',
                    }}
                  >
                    {item.icon}
                  </button>
                );
              }

              return (
                <div key={item.label}>
                  <button
                    onClick={() => toggleGroup(item.label)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition-colors"
                    style={{
                      color:      isChildActive ? 'var(--emp-accent-txt)' : 'var(--ink-muted)',
                      background: isChildActive ? 'var(--emp-accent-bg)' : 'transparent',
                      borderLeft: isChildActive ? `2px solid var(--emp-accent)` : '2px solid transparent',
                    }}
                  >
                    {item.icon}
                    <span className="flex-1 text-left">{item.label}</span>
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  {expanded && (
                    <div className="ml-2 mt-0.5 space-y-0.5" style={{ borderLeft: '1px solid var(--emp-border)', paddingLeft: '10px' }}>
                      {item.children.map(child => {
                        const active = activeRoute === child.route;
                        return (
                          <button
                            key={child.route}
                            onClick={() => navigate(child.route)}
                            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[11px] font-medium transition-colors text-left"
                            style={{
                              color:      active ? 'var(--emp-accent-txt)' : 'var(--ink-muted)',
                              background: active ? 'var(--emp-accent-bg)' : 'transparent',
                              borderLeft: active ? `2px solid var(--emp-accent)` : '2px solid transparent',
                            }}
                          >
                            {child.icon}{child.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </aside>

        {/* Contenido
            flex-col + min-h-0 propaga la altura al page activo.
            El botón Volver es shrink-0; <main> ocupa el resto con overflow-auto
            para que las páginas de tablas scrolleen normalmente. Las páginas
            de mapa (DronMosaico, DronImporter) usan height:100% y quedan bien. */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {showBackButton && (
            <div className="px-4 sm:px-6 pt-4 pb-1 flex-shrink-0">
              <button
                onClick={handleBack}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  borderColor: 'var(--emp-border)',
                  backgroundColor: 'var(--emp-bg-panel)',
                  color: 'var(--ink-muted)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = 'var(--emp-accent-txt)';
                  e.currentTarget.style.borderColor = 'var(--emp-accent)';
                  e.currentTarget.style.backgroundColor = 'var(--emp-accent-bg)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'var(--ink-muted)';
                  e.currentTarget.style.borderColor = 'var(--emp-border)';
                  e.currentTarget.style.backgroundColor = 'var(--emp-bg-panel)';
                }}
              >
                <span aria-hidden="true">&larr;</span>
                <span>Volver</span>
                <span className="hidden sm:inline" style={{ color: 'var(--ink-faint)' }}>
                  a {currentRouteMeta.parentLabel}
                </span>
              </button>
            </div>
          )}
          <main className="flex-1 min-h-0 overflow-auto">
            {renderPage()}
          </main>
        </div>

        {sidebarOpen && (
          <button onClick={() => setSidebarOpen(false)}
            className="fixed top-14 right-4 z-40 md:hidden rounded-full p-1.5"
            style={{ background: 'var(--emp-bg-panel)', border: '1px solid var(--emp-border)', color: '#7c93ae' }}>
            <X size={15} />
          </button>
        )}
      </div>
    </div>
    </EmpresaProvider>
  );
}


