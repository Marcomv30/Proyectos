# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: MYA ERP

Costa Rica accounting/ERP system built by Marco (CPA). Multi-company, multi-currency (primary: CRC colones). Locale: `es-CR`, timezone: America/Costa_Rica.

## Commands

### Frontend (root directory)
```bash
npm start          # Dev server on http://localhost:3000
npm run build      # Production build (ERP variant)
npm run build:erp          # Same as above — full ERP build
npm run build:empacadora   # Empacadora-specific variant
npm test           # Jest test runner (watch mode)
npm test -- --watchAll=false --testPathPattern=<file>  # Run single test
```

### Fusion Sync Server (server/ directory)
```bash
cd server
npm start          # Production
npm run dev        # Dev with --watch (auto-restart)
```
Server runs on port 3001. The frontend proxies `/api` and `/ws` to `http://localhost:3001` via `src/setupProxy.js`.

## Architecture

### Frontend
- **Create React App** with TypeScript. All routing is custom — **no react-router-dom**. Navigation is driven by two state variables in `App.tsx`: `moduloActivo` (active module) and `submenu` (active submenu).
- `App.tsx` (2100+ lines) is the monolithic root: holds authentication state, active company (`empresa_id`), user session, permissions, color theme, and renders the correct page component based on `moduloActivo` + `submenu`.
- Route strings follow dot-notation: `'contabilidad.asientos'`, `'cxc.cartera'`, `'combustible'`, etc. Defined in `MENU_CONFIG` array and mapped to permissions in `ROUTE_PERMISSION_MAP`.
- **Permissions**: RBAC scoped per empresa. Every route has a `{ modulo, accion }` permission. Actions: `ver | crear | editar | eliminar | aprobar`. Checked via `can(moduloId, accion)` helper in the Dashboard component.
- **Theming**: 5 color palettes (`COLOR_PALETTES`) in `App.tsx`, applied via inline `style` props (not Tailwind classes) since dynamic theme selection can't be done with Tailwind. CSS variables: `--bg-dark`, `--accent-main`, `--surface-base`, `--ink`, `--line`, etc.
- **localStorage keys**: `mya-color-theme` (theme), `mya_report_company_name` (reports), `mya_mayor_general_prefill` (accounting), `mya_asiento_open_prefill` (journal entries).

### Supabase (PostgreSQL)
- Client: `src/supabase.ts` — env vars `REACT_APP_SUPABASE_URL` + `REACT_APP_SUPABASE_ANON_KEY`.
- Service role key used only in the Node server (`SUPABASE_SERVICE_ROLE_KEY`).
- All tables scoped by `empresa_id`. RLS policies enforce this.
- Migrations in `supabase/migrations/`. Legacy use numeric prefix (`001_`–`094_`); newer modules use date prefix (`20250314_combustible.sql`).
- Important RPCs called from frontend: `log_modulo_evento`, `registrar_venta_combustible`, and many contabilidad helpers.

### Fusion Sync Server (`server/`)
Separate Node.js package (`type: "module"`, ES imports). Connects to Fusion fuel management system at `168.228.51.221`:
1. **SSH tunnel** → local port 15432 → Fusion PostgreSQL (`smartshipdb`)
2. **Polling every 15s** (`fusionSync.js`): reads `ssf_pump_sales`, `ssf_tank_actual_info`, `ssf_alarm_status`, `ssf_addin_shifts_data`
3. Writes to Supabase via RPC (`registrar_venta_combustible`) and direct table upserts
4. **WebSocket** at `ws://localhost:3001/ws/combustible` — broadcasts `nueva_venta`, `niveles_tanque`, `alarmas` events to the frontend dashboard
5. **TCP pump monitor** (`pumpStatus.js`): polls each pump at `FUSION_TCP_PORT` every `PUMP_POLL_MS` ms for real-time state
6. Falls back to HTTP API (`FUSION_API_URL`) if SSH tunnel fails

### Server API Routes (`server/routes/`)
- `GET  /api/correo/estado` — email account status
- `GET  /api/correo/iniciar-auth` — start Microsoft OAuth flow
- `POST /api/correo/descargar` — download emails
- `GET  /api/correo/descargar-sse` — SSE stream for download progress
- `GET  /api/correo/archivo` — serve downloaded XML file
- `POST /api/correo/procesar-xml/:id` — parse and import XML comprobante
- `GET  /api/correo/abrir-carpeta` — open comprobantes folder on server OS
- `GET|POST|PUT|DELETE /api/cuentas-correo` — email account CRUD
- `POST /api/cuentas-correo/:id/probar` — test email connection
- `GET  /api/cuentas-correo/:id/descargar-sse` — SSE per-account download
- `GET  /health` — health check

### Server Libraries (`server/lib/`)
- `authz.js` — `requirePermission(modulo, accion)` middleware, `getRequestUser()`, `getPermissionsForUser()`, `adminSb()` (Supabase admin client). Use these for all protected server routes.
- `costaRicaTime.js` — `currentCostaRicaDateYmd()`, `fusionDateTimeToUtcIso()`, `costaRicaDayRangeUtc()`. Always use these for date/time handling — never rely on server timezone.

### Email Integration (`server/services/`)
- `correoImap.js` — IMAP client (imapflow) for downloading XML comprobantes fiscales
- `microsoftAuth.js` — Azure AD OAuth2 token acquisition and caching (`token-cache.json`) for Microsoft 365 accounts
- Downloaded XML files stored in `COMPROBANTES_DIR` (default `C:/MYA/comprobantes`), encrypted with `ENCRYPT_KEY`

### Key Modules

| Module | Pages | Status |
|--------|-------|--------|
| Contabilidad | PlanCuentas, Asientos, MayorGeneral, Balance, EEFF, CierreMensual | Complete |
| CXC | CarteraCxc, RecaudacionPagos, TramitesCobro, ReportesCobro | Complete |
| Bancos | CuentasBancarias, conciliación | In progress |
| Combustible | DashboardCombustible, TanqueGauge | Complete (dashboard) |
| Inventarios | CatalogoProductos, CategoriasProductos, KardexProducto, MovimientosStock, ValorizacionInventario, DashboardInventario | In progress |
| Comprobantes/CXP | ComprobantesRecibidos, CXP Documentos, Proveedores, IVA compras | In progress |
| Mantenimientos | Empresas, Usuarios, Roles, Módulos, TipoCambio, Terceros, etc. | Complete |

### Combustible Module Schema (`supabase/migrations/20250314_combustible.sql`)
- **Tables**: `ventas_combustible`, `niveles_tanque`, `alarmas_fusion`, `fusion_sync_control`, `turnos_combustible`, `precios_combustible`, `dispensadores`, `grados_combustible`, `tanques_combustible`
- **Views**: `v_niveles_tanque_actual` (latest tank level per tank), `v_ventas_dia` (daily sales summary), `v_precios_actuales`
- **Function**: `registrar_venta_combustible()` — deduplicates by `sale_id`, inserts venta, creates contabilidad asiento if `grados_combustible.codigo_cuenta` is set

### Utilities
- `src/utils/bitacora.ts` — `logModuloEvento()` logs user actions via `log_modulo_evento` RPC. Always fire-and-forget (never throws).
- `src/utils/reporting.ts` — `formatMoneyCRC`, `roundMoney`, `sumMoney`, `normalizeMoney`, `ReportColumn<T>` interface. Used by all Excel XML / CSV / PDF-print exports.
- `src/utils/cuentas.ts` — account and currency utilities for contabilidad.
- `src/utils/companyTimeZone.ts` — Costa Rica timezone handling for frontend date display.

### Documentation (`docs/`)
Key reference docs for non-obvious patterns:
- `docs/REPORTING_PATTERN.md` — how to build Excel/CSV/PDF exports using `ReportColumn<T>`
- `docs/RESPONSIVE_PATTERN.md` — responsive layout conventions
- `docs/RBAC_RLS_SETUP.md` — full RBAC + RLS permission model
- `docs/ENVIRONMENTS.md` — local vs VPS environment separation policy

## Environment Variables

- `local` and `vps` are separate environments. Do not reuse Supabase keys across both unless doing a planned migration. See `docs/ENVIRONMENTS.md`.

### Frontend (`.env` in root)
```
REACT_APP_SUPABASE_URL=
REACT_APP_SUPABASE_ANON_KEY=
MICROSOFT_CLIENT_ID=
MICROSOFT_TENANT_ID=consumers
```
Recommended local override: `.env.development.local`

### Server (`.env` in `server/`)
```
PORT=3001
FRONTEND_URL=http://localhost:3000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
EMPRESA_ID=1
POLL_INTERVAL_MS=15000
FUSION_API_URL=http://168.228.51.221/api/fusion.php
FUSION_SSH_HOST=168.228.51.221
FUSION_SSH_PORT=22
FUSION_SSH_USER=mant
FUSION_SSH_PASS=mant
FUSION_PG_DB=smartshipdb
FUSION_PG_USER=ssfdbuser
FUSION_PG_PASSWORD=smartshipfactory
FUSION_TUNNEL_PORT=15432
FUSION_CANT=500
FUSION_TCP_PORT=3011        # Fusion TCP proprietary port for real-time pump state
PUMP_POLL_MS=800            # Per-pump polling interval (ms)
COMPROBANTES_DIR=C:/MYA/comprobantes
ENCRYPT_KEY=                # 32-character key for encrypting downloaded XML files
MICROSOFT_CLIENT_ID=
MICROSOFT_TENANT_ID=consumers
```

## Pending Work

### Combustible
1. Populate `dispensadores` table with real pump names for pump_id 1–10
2. Connect automatic accounting entries (`asiento_id` in `ventas_combustible`) to MYA chart of accounts — requires `grados_combustible.codigo_cuenta` to be set
3. ~~Fix `v_ventas_dia` view timezone~~ — resolved in `20260318_fix_v_ventas_dia_timezone.sql`
4. Implement Mayor General de Combustible page

### Inventarios
- Module schema in `20260317_inventarios.sql` and subsequent `20260318_inv_*.sql` migrations
- Key tables: `inv_productos`, `inv_categorias`, `inv_movimientos`, `inv_kardex`, `inv_valorizacion`
- Cost method: weighted average (`inv_costo_promedio`)
- RPC `rpc_ajuste_inventario` for stock adjustments

### Comprobantes / CXP
- Schema in `20260317_cxp_documentos.sql`, `20260317_proveedores_cxp.sql`, `20260317_iva_compras.sql`
- Comprobantes cuadre/clave in `20260316_comprobantes_cuadre.sql`, `20260317_comprobantes_clave.sql`
- Proporcionalidad IVA in `20260317_comprobantes_proporcionalidad.sql`
- RLS for comprobantes in `20260319_rls_comprobantes.sql`
