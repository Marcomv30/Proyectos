/**
 * Estilos compartidos del módulo Planilla — paleta oficial MYA ERP
 * Paleta: verde oscuro #0f1a14 / #162010 / #1a2e1a, acento #22c55e / #16a34a
 */
export const PL_STYLES = `
  .pl-wrap { color:#d6e2ff; font-family:'DM Sans',system-ui,sans-serif; }
  .pl-hdr { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:18px; }
  .pl-hdr-left { flex:1; min-width:0; }
  .pl-title { font-size:20px; font-weight:700; color:#f8fbff; margin:0; }
  .pl-sub { font-size:12px; color:#8ea3c7; margin:3px 0 0; }
  /* Botones */
  .pl-btn { border:1px solid rgba(34,197,94,0.22); background:#1a2e1a; color:#d6e2ff; border-radius:10px; padding:8px 14px; font-size:13px; cursor:pointer; transition:background .15s; white-space:nowrap; }
  .pl-btn:hover { background:#22391f; }
  .pl-btn.main { border-color:#16a34a; background:linear-gradient(135deg,#16a34a,#22c55e); color:#fff; font-weight:600; }
  .pl-btn.blue { border-color:#0891b2; background:#0891b2; color:#fff; font-weight:600; }
  .pl-btn.danger { border-color:#dc2626; background:rgba(220,38,38,0.12); color:#f87171; }
  .pl-btn:disabled { opacity:.55; cursor:not-allowed; }
  .pl-btn-row { display:flex; gap:8px; flex-wrap:wrap; }
  /* Tabs */
  .pl-tabs { display:flex; gap:2px; margin-bottom:16px; border-bottom:2px solid rgba(34,197,94,0.14); overflow-x:auto; }
  .pl-tab { padding:8px 16px; border:none; background:none; cursor:pointer; font-size:13px; color:#6b9e7a; font-weight:500; border-bottom:2px solid transparent; margin-bottom:-2px; white-space:nowrap; }
  .pl-tab.active { color:#22c55e; font-weight:700; border-bottom-color:#22c55e; }
  .pl-badge { display:inline-block; border-radius:999px; padding:1px 8px; font-size:11px; font-weight:700; margin-left:5px; }
  /* Cards */
  .pl-card { background:#111e13; border:1px solid rgba(34,197,94,0.15); border-radius:14px; overflow:hidden; margin-bottom:12px; }
  .pl-card-p { padding:16px 18px; }
  .pl-card-title { font-size:14px; font-weight:700; color:#f3f7ff; margin:0 0 12px; }
  /* KPIs */
  .pl-kpi-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-bottom:14px; }
  .pl-kpi { background:#162010; border:1px solid rgba(34,197,94,0.18); border-radius:12px; padding:12px 14px; }
  .pl-kpi .k { font-size:11px; color:#6b9e7a; text-transform:uppercase; letter-spacing:.04em; font-weight:700; }
  .pl-kpi .v { margin-top:6px; font-size:22px; font-weight:800; }
  /* Table */
  .pl-table-wrap { overflow-x:auto; }
  .pl-table { width:100%; border-collapse:collapse; min-width:600px; }
  .pl-table th { background:#0f1a14; color:#6b9e7a; font-size:10px; text-transform:uppercase; letter-spacing:.04em; font-weight:700; padding:9px 12px; text-align:left; border-bottom:1px solid rgba(34,197,94,0.12); white-space:nowrap; }
  .pl-table th.r, .pl-table td.r { text-align:right; }
  .pl-table td { padding:9px 12px; font-size:13px; color:#d6e2ff; border-top:1px solid rgba(34,197,94,0.06); vertical-align:middle; }
  .pl-table tr:hover td { background:rgba(34,197,94,0.04); }
  .pl-table tfoot td { background:#0f1a14; font-weight:800; color:#f3f7ff; border-top:2px solid rgba(34,197,94,0.18); }
  .pl-empty { padding:36px; text-align:center; color:#6b9e7a; font-size:13px; }
  .pl-chip { display:inline-block; border-radius:6px; padding:2px 9px; font-size:11px; font-weight:700; }
  /* Filters */
  .pl-filters { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; align-items:center; }
  .pl-input, .pl-select { background:#162010; border:1px solid rgba(34,197,94,0.2); border-radius:10px; padding:8px 12px; font-size:13px; color:#f3f7ff; outline:none; }
  .pl-input::placeholder { color:#4a7a56; }
  .pl-input:focus, .pl-select:focus { border-color:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,0.15); }
  .pl-input.flex { flex:1; min-width:180px; }
  /* Modal */
  .pl-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.72); z-index:9999; display:flex; align-items:flex-start; justify-content:center; padding:32px 14px 24px; overflow-y:auto; }
  .pl-modal { background:#111e13; border:1px solid rgba(34,197,94,0.2); border-radius:16px; padding:24px 26px; width:100%; max-width:500px; box-shadow:0 24px 60px rgba(0,0,0,0.6); }
  .pl-modal.wide { max-width:660px; }
  .pl-modal-title { font-size:17px; font-weight:700; color:#f8fbff; margin:0 0 4px; }
  .pl-modal-sub { font-size:12px; color:#6b9e7a; margin:0 0 16px; }
  .pl-sep { border:none; border-top:1px solid rgba(34,197,94,0.12); margin:14px 0; }
  .pl-field { display:flex; flex-direction:column; gap:4px; margin-bottom:13px; }
  .pl-field label { font-size:11px; color:#6b9e7a; text-transform:uppercase; letter-spacing:.05em; font-weight:700; }
  .pl-field .pl-input, .pl-field .pl-select { width:100%; box-sizing:border-box; }
  .pl-field textarea { background:#162010; border:1px solid rgba(34,197,94,0.2); border-radius:10px; padding:8px 12px; font-size:13px; color:#f3f7ff; resize:vertical; min-height:64px; outline:none; width:100%; box-sizing:border-box; }
  .pl-field textarea:focus { border-color:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,0.15); }
  .pl-g2 { display:grid; grid-template-columns:1fr 1fr; gap:0 14px; }
  .pl-g3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:0 12px; }
  .pl-modal-foot { display:flex; gap:8px; justify-content:flex-end; margin-top:18px; padding-top:14px; border-top:1px solid rgba(34,197,94,0.12); }
  .pl-err { background:#2a0f10; border:1px solid rgba(248,113,113,0.3); color:#ffb3bb; border-radius:10px; padding:8px 12px; font-size:12px; margin-bottom:12px; }
  .pl-ok  { background:#0f2c20; border:1px solid rgba(34,197,94,0.3); color:#9df4c7; border-radius:10px; padding:8px 12px; font-size:12px; margin-bottom:12px; }
  .pl-check-row { display:flex; align-items:center; gap:8px; font-size:13px; color:#d6e2ff; cursor:pointer; margin-bottom:13px; }
  /* Avatar */
  .pl-avatar { width:34px; height:34px; border-radius:50%; background:linear-gradient(135deg,#16a34a,#22c55e); display:flex; align-items:center; justify-content:center; color:#fff; font-size:14px; font-weight:700; flex-shrink:0; }
  .pl-avatar.lg { width:48px; height:48px; font-size:18px; }
  /* Info box */
  .pl-info { background:#162010; border:1px solid rgba(34,197,94,0.18); border-radius:10px; padding:10px 14px; font-size:12px; color:#6b9e7a; margin-bottom:14px; }
  .pl-info strong { color:#d6e2ff; }
  /* Result box */
  .pl-result { background:#0f1a14; border:1px solid rgba(34,197,94,0.2); border-radius:12px; padding:14px 18px; margin-bottom:14px; }
  .pl-result .row { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid rgba(34,197,94,0.07); font-size:13px; color:#d6e2ff; }
  .pl-result .row:last-child { border-bottom:none; }
  .pl-result .total { font-size:17px; font-weight:800; color:#22c55e; display:flex; justify-content:space-between; padding-top:10px; border-top:1px solid rgba(34,197,94,0.25); margin-top:6px; }
  /* Mono */
  .mono { font-family:'DM Mono',monospace; }
  /* Legal note */
  .pl-legal { background:#1a1400; border:1px solid rgba(133,77,14,0.3); border-radius:10px; padding:9px 13px; font-size:11px; color:#d97706; margin-bottom:14px; }
  /* Responsive */
  @media (max-width:760px) {
    .pl-kpi-grid { grid-template-columns:1fr 1fr; }
    .pl-g2, .pl-g3 { grid-template-columns:1fr; }
    .pl-hdr { flex-direction:column; align-items:flex-start; }
    .pl-table { min-width:480px; }
  }
  @media (max-width:480px) {
    .pl-kpi-grid { grid-template-columns:1fr; }
    .pl-modal { padding:18px 14px; }
  }
`;
