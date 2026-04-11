# Plan De Subida A VPS POS-MYA

Plan recomendado para publicar `pos-mya` en `https://pos-mya.visionzn.net` con el menor riesgo posible.

## Objetivo

Dejar operativo:

- frontend estatico `pos-mya`
- backend `erp-mya` con rutas POS disponibles en `https://api.visionzn.net`
- base de datos con migraciones POS aplicadas
- `nginx` y SSL activos para `pos-mya.visionzn.net`

## Orden recomendado

1. Validar backend y base de datos
2. Validar infraestructura nginx y DNS
3. Generar build local de `pos-mya`
4. Subir frontend al VPS
5. Ejecutar pruebas funcionales reales

## Paso 1. Validar backend ERP

Antes de tocar el frontend, confirmar que en el VPS ya existe una version de `erp-mya` con soporte POS.

Rutas minimas esperadas:

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

Chequeo basico:

```powershell
curl https://api.visionzn.net/health
```

Resultado esperado:

- respuesta `200 OK`
- JSON con `ok: true`

## Paso 2. Validar migraciones SQL POS

Confirmar en la base del VPS que ya estan aplicadas estas migraciones:

- `20260407_pos.sql`
- `20260407_pos_referencia.sql`
- `20260408_pos_setup.sql`
- `20260408_pos_ventas_fe.sql`
- `20260408_pos_fe_email.sql`
- `20260409_pos_cierre_totales.sql`
- `20260410_pos_asiento_contable.sql`
- `20260410_pos_ventas_credito.sql`

Si no estan aplicadas, hacerlo antes del frontend.

## Paso 3. Validar datos operativos

Por empresa que vaya a usar POS:

- usuario con acceso a modulo `pos`
- sucursal creada
- caja creada
- terminal FE asignada si aplica
- bodega asignada si aplica
- configuracion POS contable si aplica
- clientes de credito listos si se usara venta a credito

## Paso 4. Validar DNS y nginx

Confirmar que el DNS de `pos-mya.visionzn.net` apunte al VPS.

Crear o revisar un `server` de nginx similar a este:

```nginx
server {
    server_name pos-mya.visionzn.net;

    root /var/www/pos-mya;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Luego:

```bash
nginx -t
systemctl reload nginx
```

Despues emitir SSL con certbot si todavia no existe.

## Paso 5. Validar variables de produccion del frontend

Archivo:

`d:\Proyectos\pos-mya\.env.production`

Valores esperados:

```env
VITE_API_URL=https://api.visionzn.net
VITE_SUPABASE_URL=<supabase produccion>
VITE_SUPABASE_ANON_KEY=<anon key produccion>
```

## Paso 6. Ejecutar precheck local

```powershell
cd d:\Proyectos\pos-mya
powershell -ExecutionPolicy Bypass -File scripts\predeploy-check.ps1
```

No publicar si:

- falla build
- faltan variables
- no esta clara la version a subir

## Paso 7. Build local

```powershell
cd d:\Proyectos\pos-mya
npm.cmd run build
```

Confirmar que exista:

- `dist/index.html`
- `dist/assets/*`

## Paso 8. Deploy del frontend

El proyecto ya tiene script:

```powershell
cd d:\Proyectos\pos-mya
npm.cmd run deploy
```

Ese script:

- crea backup remoto
- limpia `/var/www/pos-mya`
- sube `dist/`
- recarga nginx

## Paso 9. Validacion post deploy

Abrir:

- `https://pos-mya.visionzn.net`

Probar:

1. login con usuario real POS
2. seleccion de empresa
3. setup de sucursal/caja si aplica
4. apertura de sesion de caja
5. busqueda de articulo
6. venta de prueba
7. reimpresion
8. FE si aplica
9. envio por email si aplica

## Paso 10. Rollback rapido

Si el frontend publicado falla:

1. entrar al VPS
2. localizar el ultimo backup generado por el deploy en `/var/www/pos-mya.backup-<timestamp>`
3. restaurar el backup a `/var/www/pos-mya`
4. recargar nginx

Ejemplo:

```bash
rm -rf /var/www/pos-mya
cp -r /var/www/pos-mya.backup-YYYYMMDD-HHMMSS /var/www/pos-mya
nginx -t
systemctl reload nginx
```

## Go / No-Go

### Go

- backend POS responde en produccion
- migraciones POS aplicadas
- nginx y SSL listos
- build local OK
- version a subir confirmada

### No-Go

- backend sin rutas POS
- migraciones incompletas
- subdominio sin nginx o sin SSL
- duda sobre Supabase de produccion
- cambios locales no revisados
