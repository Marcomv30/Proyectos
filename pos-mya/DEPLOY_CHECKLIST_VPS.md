# Predeploy VPS POS-MYA

Checklist corta para validar `pos-mya` antes de publicar en `https://pos-mya.visionzn.net`.

## 1. Frontend local

- `npm run build` ejecuta sin error.
- `.env.production` apunta a los servicios correctos:
  - `VITE_API_URL=https://api.visionzn.net`
  - `VITE_SUPABASE_URL=<supabase definido para produccion>`
  - `VITE_SUPABASE_ANON_KEY=<anon key valida>`
- Revisar cambios pendientes en git y confirmar que la version a subir es la correcta.

## 2. Backend ERP en VPS

Confirmar que `api.visionzn.net` tenga desplegada una version de `erp-mya` que incluya:

- `POST /api/auth/login`
- `GET /api/pos/productos/buscar`
- `GET /api/pos/productos/recientes`
- `GET /api/pos/sucursales`
- `GET /api/pos/cajas`
- `GET /api/pos/terminales-fe`
- `GET /api/pos/sesion/activa`
- `POST /api/pos/sesion/abrir`
- `POST /api/pos/ventas`
- `GET /api/pos/ventas/hoy`
- `GET /api/pos/ventas/fe-comprobantes`
- `POST /api/pos/ventas/email`
- `GET /api/facturacion/estado/:id`

## 3. Migraciones requeridas en base de datos

Validar que en el entorno del VPS ya esten aplicadas al menos estas migraciones POS:

- `20260407_pos.sql`
- `20260407_pos_referencia.sql`
- `20260408_pos_setup.sql`
- `20260408_pos_ventas_fe.sql`
- `20260408_pos_fe_email.sql`
- `20260409_pos_cierre_totales.sql`
- `20260410_pos_asiento_contable.sql`
- `20260410_pos_ventas_credito.sql`

## 4. Datos operativos minimos

Por cada empresa que vaya a usar POS:

- usuario con acceso a modulo `pos`
- sucursal POS creada
- caja POS creada
- terminal FE asignada si aplica
- bodega asignada si se controlara inventario por bodega
- configuracion contable POS si se generaran asientos
- clientes de credito configurados si se usara venta a credito

## 5. Infraestructura VPS

- DNS de `pos-mya.visionzn.net` apuntando al VPS
- virtual host de nginx para `pos-mya.visionzn.net`
- `root` o `alias` apuntando a `/var/www/pos-mya`
- certificado SSL emitido y activo
- `nginx -t` sin errores
- `systemctl reload nginx` o `nginx -s reload` funcionando

## 6. Pruebas minimas despues del deploy

- abrir `https://pos-mya.visionzn.net`
- iniciar sesion con usuario real POS
- seleccionar empresa
- configurar sucursal/caja si corresponde
- abrir sesion de caja
- buscar producto
- registrar una venta de prueba
- validar impresion o reimpresion
- validar consulta de comprobante FE si aplica
- validar envio por email si aplica

## 7. Comandos utiles

Build local:

```powershell
npm.cmd run build
```

Deploy frontend:

```powershell
npm.cmd run deploy
```

Health backend:

```powershell
curl https://api.visionzn.net/health
```

## 8. Criterio de salida

Solo hacer deploy si:

- el build local pasa
- el backend POS ya esta desplegado
- las migraciones POS existen en la base del VPS
- nginx y SSL del subdominio ya estan listos
