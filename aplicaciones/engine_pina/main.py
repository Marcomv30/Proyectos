import os
import re
import logging
import json
import tempfile
import math
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import rasterio
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from rasterio.mask import mask
from rasterio.warp import transform_geom, transform

base_dir = Path(__file__).resolve().parent.parent
env_path = base_dir / '.env'

if env_path.exists():
    load_dotenv(dotenv_path=str(env_path))

app = FastAPI(title='Motor de Inteligencia Agricola ERP-MYA')
logger = logging.getLogger('engine_pina')

if not logger.handlers:
    logging.basicConfig(
        level=logging.INFO,
        format='[%(asctime)s] %(levelname)s %(name)s: %(message)s',
    )


def parse_bool(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {'1', 'true', 'yes', 'y', 'on'}


def parse_allowed_origins(value: str):
    return [o.strip().rstrip('/') for o in str(value or '').split(',') if o.strip()]

def normalize_token(value: str) -> str:
    return re.sub(r'[^a-z0-9]+', '', str(value or '').lower())


def normalize_filename(value: str) -> str:
    cleaned = re.sub(r'[^A-Za-z0-9._-]+', '_', str(value or '').strip())
    cleaned = cleaned.strip('._-')
    return cleaned or 'resultado'

def resolve_tif_path(ruta_base: str, lote_id: str) -> str | None:
    base = Path(ruta_base)
    if not base.exists() or not base.is_dir():
        return None

    # Intento directo (respetando nombre)
    direct_candidates = [
        base / f'{lote_id}.tif',
        base / f'{lote_id}.tiff',
        base / f'{lote_id.strip()}.tif',
        base / f'{lote_id.strip()}.tiff',
    ]
    for candidate in direct_candidates:
        if candidate.exists() and candidate.is_file():
            return str(candidate)

    # Intento flexible por coincidencia normalizada de nombre
    target = normalize_token(lote_id)
    tif_files = sorted(list(base.glob('*.tif')) + list(base.glob('*.tiff')))
    for tif in tif_files:
        if normalize_token(tif.stem) == target:
            return str(tif)
    return None


NODE_ENV = os.getenv('NODE_ENV', 'development')
allow_localhost = parse_bool(os.getenv('ENGINE_CORS_ALLOW_LOCALHOST_IN_DEV', 'true'), True)
allowed_origins = parse_allowed_origins(os.getenv('ENGINE_CORS_ALLOWED_ORIGINS', ''))
if not allowed_origins:
    allowed_origins = [
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        'http://localhost:3004',
        'http://127.0.0.1:3004',
        'http://localhost:3901',
        'http://127.0.0.1:3901',
    ]

if NODE_ENV != 'production' and allow_localhost:
    for port in range(3000, 4010):
        allowed_origins.append(f'http://localhost:{port}')
        allowed_origins.append(f'http://127.0.0.1:{port}')

# deduplicar preservando orden
seen = set()
allowed_origins = [o for o in allowed_origins if not (o in seen or seen.add(o))]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r'^https?://(localhost|127\.0\.0\.1)(:\d+)?$' if allow_localhost else None,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


class AuditoriaRequest(BaseModel):
    lote_id: str
    min_area: float
    max_area: float
    geojson: dict


def get_output_root() -> Path:
    output_root = Path(os.getenv('ENGINE_OUTPUT_DIR', str(base_dir / 'engine_pina' / 'resultados')))
    output_root.mkdir(parents=True, exist_ok=True)
    return output_root


app.mount('/resultados', StaticFiles(directory=str(get_output_root())), name='resultados')

def estimate_pixel_area_m2(src: rasterio.io.DatasetReader, geometria: dict | None = None):
    res_x = abs(float(src.res[0]))
    res_y = abs(float(src.res[1]))
    crs = src.crs

    if crs:
        try:
            if crs.is_projected:
                unit_factor = 1.0
                try:
                    luf = crs.linear_units_factor
                    if isinstance(luf, (tuple, list)) and len(luf) >= 2:
                        unit_factor = float(luf[1] or 1.0)
                    elif isinstance(luf, (int, float)):
                        unit_factor = float(luf or 1.0)
                except Exception:
                    unit_factor = 1.0
                if unit_factor <= 0:
                    unit_factor = 1.0
                return (res_x * unit_factor) * (res_y * unit_factor), 'projected'

            if crs.is_geographic:
                lat_ref = 0.0
                try:
                    rings = extraer_anillos_poligono(geometria or {})
                    lats = []
                    for ring in rings:
                        for pt in ring:
                            if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                                lats.append(float(pt[1]))
                    if lats:
                        lat_ref = float(sum(lats) / len(lats))
                except Exception:
                    lat_ref = 0.0

                lat_rad = math.radians(lat_ref)
                m_per_deg_lat = (
                    111132.92
                    - 559.82 * math.cos(2 * lat_rad)
                    + 1.175 * math.cos(4 * lat_rad)
                    - 0.0023 * math.cos(6 * lat_rad)
                )
                m_per_deg_lon = (
                    111412.84 * math.cos(lat_rad)
                    - 93.5 * math.cos(3 * lat_rad)
                    + 0.118 * math.cos(5 * lat_rad)
                )
                return abs(res_x * m_per_deg_lon) * abs(res_y * m_per_deg_lat), 'geographic'
        except Exception:
            pass

    gsd = float(os.getenv('ENGINE_DEFAULT_GSD_M', '0.05'))
    if gsd <= 0:
        gsd = 0.05
    return gsd * gsd, 'fallback_gsd'


def procesar_conteo(
    ruta_tif: str,
    geometria: dict,
    min_a: float,
    max_a: float,
    area_mode: str | None = None,
    gsd_override_m: float | None = None,
    detect_mode: str | None = None,
):
    with rasterio.open(ruta_tif) as src:
        selected_mode = (area_mode or 'auto').strip().lower()
        selected_detect = (detect_mode or 'adaptive').strip().lower()
        if selected_mode == 'fixed_gsd':
            gsd = float(gsd_override_m if gsd_override_m is not None else os.getenv('ENGINE_DEFAULT_GSD_M', '0.05'))
            if gsd <= 0:
                gsd = 0.05
            pixel_area_m2 = gsd * gsd
            area_source = f'fixed_gsd:{gsd:.4f}m'
        else:
            pixel_area_m2, area_source = estimate_pixel_area_m2(src, geometria)
        try:
            out_image_masked, out_transform = mask(src, [geometria], crop=True, filled=False)
            valid_mask = ~out_image_masked.mask[0]
            out_image = np.ma.filled(out_image_masked, 0)
        except ValueError as exc:
            # Intento de reproyeccion cuando el bloque viene en EPSG:4326.
            try:
                if src.crs:
                    reproj_geom = transform_geom('EPSG:4326', str(src.crs), geometria, precision=6)
                    out_image_masked, out_transform = mask(src, [reproj_geom], crop=True, filled=False)
                    valid_mask = ~out_image_masked.mask[0]
                    out_image = np.ma.filled(out_image_masked, 0)
                else:
                    raise exc
            except Exception:
                logger.warning(
                    'Mask sin traslape | ruta=%s error=%s',
                    ruta_tif,
                    exc,
                )
                raise ValueError(
                    'El bloque seleccionado no traslapa con el raster. Verifica proyeccion/GeoJSON del bloque.'
                ) from exc

    area_m2 = float(np.count_nonzero(valid_mask) * pixel_area_m2)
    area_ha = area_m2 / 10000.0 if area_m2 > 0 else 0.0

    plantas_detectadas = []
    hileras = 0
    longitud_m = 0.0
    densidad = 0.0
    kpi = 0.0
    gray_preview = None

    if selected_detect == 'conteo1':
        # Pipeline equivalente a conteo_1.py (CLAHE + TopHat + threshold fijo)
        band = out_image[0].astype(np.float32)
        roi_gris = cv2.normalize(np.nan_to_num(band), None, 0, 255, cv2.NORM_MINMAX, cv2.CV_8U)
        gray_preview = roi_gris
        mask_bin = (valid_mask.astype(np.uint8) * 255)
        gsd_for_metrics = float(gsd_override_m if gsd_override_m is not None else os.getenv('ENGINE_DEFAULT_GSD_M', '0.05'))
        if gsd_for_metrics <= 0:
            gsd_for_metrics = 0.05
        total_plantas, hileras, longitud_m, contours = motor_conteo_avanzado_v3(roi_gris, mask_bin, gsd_for_metrics)
        for contour in contours:
            moments = cv2.moments(contour)
            if moments['m00'] == 0:
                continue
            cx = int(moments['m10'] / moments['m00'])
            cy = int(moments['m01'] / moments['m00'])
            lon, lat = rasterio.transform.xy(out_transform, cy, cx)
            plantas_detectadas.append({'x': cx, 'y': cy, 'lon': float(lon), 'lat': float(lat)})
        densidad = (len(plantas_detectadas) / area_ha) if area_ha > 0 else 0.0
        kpi = (densidad / 67000.0) * 100.0
    else:
        # Si hay al menos 3 bandas, usar ExG para detectar vegetacion.
        if out_image.ndim == 3 and out_image.shape[0] >= 3:
            r = out_image[0].astype(np.float32)
            g = out_image[1].astype(np.float32)
            b = out_image[2].astype(np.float32)
            img = 2.0 * g - r - b
        else:
            img = out_image[0].astype(np.float32)

        img_8b = cv2.normalize(img, None, 0, 255, cv2.NORM_MINMAX, cv2.CV_8U)
        gray_preview = img_8b
        valid_values = img[valid_mask]
        if valid_values.size == 0:
            valid_values = img.reshape(-1)
        umbral = np.percentile(valid_values, 65)
        thresh = ((img > umbral) & valid_mask).astype(np.uint8) * 255

        kernel = np.ones((3, 3), np.uint8)
        opening = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=1)

        contours, _ = cv2.findContours(opening, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for contour in contours:
            area = cv2.contourArea(contour)
            if min_a <= area <= max_a:
                moments = cv2.moments(contour)
                if moments['m00'] != 0:
                    cx = int(moments['m10'] / moments['m00'])
                    cy = int(moments['m01'] / moments['m00'])
                    lon, lat = rasterio.transform.xy(out_transform, cy, cx)
                    plantas_detectadas.append({'x': cx, 'y': cy, 'lon': float(lon), 'lat': float(lat)})
        densidad = (len(plantas_detectadas) / area_ha) if area_ha > 0 else 0.0
        kpi = (densidad / 67000.0) * 100.0

    if out_image.ndim == 3 and out_image.shape[0] >= 3:
        r8 = cv2.normalize(out_image[0], None, 0, 255, cv2.NORM_MINMAX, cv2.CV_8U)
        g8 = cv2.normalize(out_image[1], None, 0, 255, cv2.NORM_MINMAX, cv2.CV_8U)
        b8 = cv2.normalize(out_image[2], None, 0, 255, cv2.NORM_MINMAX, cv2.CV_8U)
        preview_bgr = cv2.merge([b8, g8, r8])
    else:
        if gray_preview is None:
            fallback_gray = cv2.normalize(out_image[0].astype(np.float32), None, 0, 255, cv2.NORM_MINMAX, cv2.CV_8U)
            gray_preview = fallback_gray
        preview_bgr = cv2.cvtColor(gray_preview, cv2.COLOR_GRAY2BGR)

    for p in plantas_detectadas:
        cv2.circle(preview_bgr, (int(p['x']), int(p['y'])), 4, (0, 255, 0), 1, cv2.LINE_AA)

    return {
        'puntos': plantas_detectadas,
        'preview_bgr': preview_bgr,
        'area_ha': area_ha,
        'area_source': area_source,
        'hileras': int(hileras),
        'longitud_m': float(longitud_m),
        'densidad': float(densidad),
        'kpi': float(kpi),
        'detect_mode': selected_detect,
    }


def generar_reporte_visual(preview_bgr: np.ndarray, lote_id: str, conteo: int, area_ha: float) -> np.ndarray:
    huecos = int(round(conteo * 0.12))
    densidad = (conteo / area_ha) if area_ha > 0 else 0.0
    meta_pl_ha = float(os.getenv('ENGINE_META_PL_HA', '67000'))
    kpi = (densidad / meta_pl_ha) * 100.0 if meta_pl_ha > 0 else 0.0

    map_h, map_w = preview_bgr.shape[:2]
    top_margin = 90
    left_margin = 40
    bottom_margin = 40
    panel_w = 620
    gap = 50
    canvas_h = map_h + top_margin + bottom_margin
    canvas_w = left_margin + map_w + gap + panel_w + left_margin
    canvas = np.full((canvas_h, canvas_w, 3), 225, dtype=np.uint8)

    y0 = top_margin
    x0 = left_margin
    canvas[y0:y0 + map_h, x0:x0 + map_w] = preview_bgr
    cv2.putText(
        canvas,
        f'MAPA DE CALOR: {lote_id}',
        (x0 + 10, 52),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.1,
        (18, 18, 18),
        2,
        cv2.LINE_AA,
    )

    table_x = x0 + map_w + gap
    table_y = y0 + max(80, int(map_h * 0.23))
    table_w = panel_w - 60
    row_h = 84
    headers = ['ID', 'Area', 'Plantas', 'Huecos', 'KPI %']
    values = ['B1', f'{area_ha:.4f} Ha', f'{conteo:,}', f'{huecos:,}', f'{kpi:.1f}%']
    col_w = table_w // len(headers)

    cv2.rectangle(canvas, (table_x, table_y), (table_x + table_w, table_y + row_h * 2), (25, 25, 25), 2)
    for idx in range(1, len(headers)):
        px = table_x + col_w * idx
        cv2.line(canvas, (px, table_y), (px, table_y + row_h * 2), (25, 25, 25), 2)
    cv2.line(canvas, (table_x, table_y + row_h), (table_x + table_w, table_y + row_h), (25, 25, 25), 2)

    for idx, header in enumerate(headers):
        tx = table_x + col_w * idx + 18
        cv2.putText(canvas, header, (tx, table_y + 48), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (22, 22, 22), 2, cv2.LINE_AA)
    for idx, value in enumerate(values):
        tx = table_x + col_w * idx + 14
        cv2.putText(canvas, value, (tx, table_y + row_h + 52), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (22, 22, 22), 2, cv2.LINE_AA)

    return canvas


def construir_resultado_geojson(
    lote_id: str,
    min_area: float,
    max_area: float,
    ruta_origen: str,
    geojson_entrada: dict,
    puntos: list,
    area_ha: float,
) -> dict:
    huecos = int(round(len(puntos) * 0.12))
    densidad = (len(puntos) / area_ha) if area_ha > 0 else 0.0
    meta_pl_ha = float(os.getenv('ENGINE_META_PL_HA', '67000'))
    kpi = (densidad / meta_pl_ha) * 100.0 if meta_pl_ha > 0 else 0.0

    features = []

    # Conserva la geometria del bloque original como primer feature.
    if isinstance(geojson_entrada, dict):
        geo_type = geojson_entrada.get('type')
        if geo_type == 'FeatureCollection':
            incoming_features = geojson_entrada.get('features') or []
            for feature in incoming_features:
                if isinstance(feature, dict) and isinstance(feature.get('geometry'), dict):
                    base_props = feature.get('properties') if isinstance(feature.get('properties'), dict) else {}
                    next_feature = {
                        'type': 'Feature',
                        'geometry': feature['geometry'],
                        'properties': {
                            **base_props,
                            'feature_role': 'bloque',
                            'lote_id': lote_id,
                        },
                    }
                    features.append(next_feature)
                    break
        elif geo_type == 'Feature' and isinstance(geojson_entrada.get('geometry'), dict):
            base_props = geojson_entrada.get('properties') if isinstance(geojson_entrada.get('properties'), dict) else {}
            features.append(
                {
                    'type': 'Feature',
                    'geometry': geojson_entrada['geometry'],
                    'properties': {
                        **base_props,
                        'feature_role': 'bloque',
                        'lote_id': lote_id,
                    },
                }
            )
        elif isinstance(geojson_entrada.get('geometry'), dict):
            features.append(
                {
                    'type': 'Feature',
                    'geometry': geojson_entrada['geometry'],
                    'properties': {'feature_role': 'bloque', 'lote_id': lote_id},
                }
            )
        elif 'coordinates' in geojson_entrada:
            geometry_like = {
                'type': geojson_entrada.get('type', 'Polygon'),
                'coordinates': geojson_entrada.get('coordinates'),
            }
            features.append(
                {
                    'type': 'Feature',
                    'geometry': geometry_like,
                    'properties': {'feature_role': 'bloque', 'lote_id': lote_id},
                }
            )

    # Puntos detectados como features GeoJSON Point.
    for idx, p in enumerate(puntos, start=1):
        lon = p.get('lon')
        lat = p.get('lat')
        if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
            continue
        features.append(
            {
                'type': 'Feature',
                'geometry': {'type': 'Point', 'coordinates': [float(lon), float(lat)]},
                'properties': {
                    'feature_role': 'planta',
                    'planta_idx': idx,
                    'pixel_x': p.get('x'),
                    'pixel_y': p.get('y'),
                    'lote_id': lote_id,
                },
            }
        )

    return {
        'type': 'FeatureCollection',
        'name': f'deteccion_{normalize_filename(lote_id)}',
        'features': features,
        'metadata': {
            'generated_at': datetime.now().isoformat(),
            'lote_id': lote_id,
            'ruta_origen': ruta_origen,
            'min_area': min_area,
            'max_area': max_area,
            'conteo': len(puntos),
            'huecos_estimados': huecos,
            'area_ha': round(area_ha, 4),
            'densidad_plantas_ha': round(densidad, 2),
            'kpi_cumplimiento': round(kpi, 2),
        },
    }


def guardar_resultado_deteccion(
    lote_id: str,
    min_area: float,
    max_area: float,
    ruta_origen: str,
    geojson: dict,
    puntos: list,
    preview_bgr: np.ndarray,
    area_ha: float,
):
    output_root = get_output_root()

    ts = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    slug = normalize_filename(lote_id)
    json_path = output_root / f'{slug}_{ts}.json'
    png_path = output_root / f'{slug}_{ts}.png'
    report_path = output_root / f'{slug}_{ts}_reporte.png'
    payload = construir_resultado_geojson(
        lote_id=lote_id,
        min_area=min_area,
        max_area=max_area,
        ruta_origen=ruta_origen,
        geojson_entrada=geojson,
        puntos=puntos,
        area_ha=area_ha,
    )
    with open(json_path, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)

    ok = cv2.imwrite(str(png_path), preview_bgr)
    if not ok:
        raise RuntimeError(f'No se pudo escribir imagen de resultado en {png_path}')

    report_bgr = generar_reporte_visual(preview_bgr, lote_id, len(puntos), area_ha)
    report_ok = cv2.imwrite(str(report_path), report_bgr)
    if not report_ok:
        raise RuntimeError(f'No se pudo escribir reporte visual en {report_path}')

    return {
        'json_path': str(json_path),
        'image_path': str(png_path),
        'report_path': str(report_path),
        'json_url': f'/resultados/{json_path.name}',
        'image_url': f'/resultados/{png_path.name}',
        'report_url': f'/resultados/{report_path.name}',
    }


def extraer_geometria(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise ValueError('GeoJSON invalido: se esperaba un objeto')

    geo_type = payload.get('type')
    if geo_type == 'FeatureCollection':
        features = payload.get('features') or []
        if not features:
            raise ValueError('GeoJSON invalido: FeatureCollection vacia')
        first = features[0]
        geometry = first.get('geometry') if isinstance(first, dict) else None
        if not geometry:
            raise ValueError('GeoJSON invalido: Feature sin geometry')
        return geometry

    if geo_type == 'Feature':
        geometry = payload.get('geometry')
        if not geometry:
            raise ValueError('GeoJSON invalido: Feature sin geometry')
        return geometry

    if 'geometry' in payload and isinstance(payload['geometry'], dict):
        return payload['geometry']

    if 'coordinates' in payload:
        return payload

    raise ValueError('GeoJSON invalido: no se pudo extraer geometry')


def extraer_anillos_poligono(geometry: dict) -> list:
    if not isinstance(geometry, dict):
        return []
    g_type = geometry.get('type')
    coords = geometry.get('coordinates')
    if g_type == 'Polygon' and isinstance(coords, list) and coords:
        return [coords[0]]
    if g_type == 'MultiPolygon' and isinstance(coords, list):
        rings = []
        for poly in coords:
            if isinstance(poly, list) and poly:
                rings.append(poly[0])
        return rings
    return []


def generar_preview_tif_completo(ruta_tif: str) -> np.ndarray:
    with rasterio.open(ruta_tif) as src:
        out_image = src.read()
    if out_image.ndim == 3 and out_image.shape[0] >= 3:
        r8 = cv2.normalize(out_image[0], None, 0, 255, cv2.NORM_MINMAX, cv2.CV_8U)
        g8 = cv2.normalize(out_image[1], None, 0, 255, cv2.NORM_MINMAX, cv2.CV_8U)
        b8 = cv2.normalize(out_image[2], None, 0, 255, cv2.NORM_MINMAX, cv2.CV_8U)
        return cv2.merge([b8, g8, r8])
    img = out_image[0].astype(np.float32)
    img_8b = cv2.normalize(img, None, 0, 255, cv2.NORM_MINMAX, cv2.CV_8U)
    return cv2.cvtColor(img_8b, cv2.COLOR_GRAY2BGR)


def dibujar_poligonos_bloques(preview_bgr: np.ndarray, ruta_tif: str, bloques_resumen: list):
    overlay = preview_bgr.copy()
    with rasterio.open(ruta_tif) as src:
        for block in bloques_resumen:
            geometry = block.get('geometry')
            rings = extraer_anillos_poligono(geometry)
            if not rings:
                continue
            pts_list = []
            for ring in rings:
                pts = []
                for coord in ring:
                    if not isinstance(coord, (list, tuple)) or len(coord) < 2:
                        continue
                    x = float(coord[0])
                    y = float(coord[1])
                    row, col = src.index(x, y)
                    pts.append([int(col), int(row)])
                if len(pts) >= 3:
                    pts_list.append(np.array(pts, dtype=np.int32))
            if not pts_list:
                continue
            color = (48, 160, 64) if not block.get('error') else (60, 60, 220)
            cv2.fillPoly(overlay, pts_list, color)
            cv2.polylines(preview_bgr, pts_list, True, (210, 250, 210), 2, cv2.LINE_AA)
            label_point = pts_list[0][0]
            label = f"B{block.get('bloque_num', '?')}"
            cv2.putText(
                preview_bgr,
                label,
                (int(label_point[0]), int(label_point[1])),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (255, 255, 255),
                2,
                cv2.LINE_AA,
            )
    cv2.addWeighted(overlay, 0.34, preview_bgr, 0.66, 0, dst=preview_bgr)
    return preview_bgr


def generar_reporte_visual_bloques(preview_bgr: np.ndarray, lote_id: str, bloques_resumen: list) -> np.ndarray:
    map_h, map_w = preview_bgr.shape[:2]
    top_margin = 90
    left_margin = 40
    bottom_margin = 40
    panel_w = 760
    gap = 50
    rows = max(1, len(bloques_resumen))
    row_h = 54
    table_h = row_h * (rows + 1) + 20
    canvas_h = max(map_h + top_margin + bottom_margin, top_margin + table_h + bottom_margin)
    canvas_w = left_margin + map_w + gap + panel_w + left_margin
    canvas = np.full((canvas_h, canvas_w, 3), 225, dtype=np.uint8)
    y0 = top_margin
    x0 = left_margin
    canvas[y0:y0 + map_h, x0:x0 + map_w] = preview_bgr
    cv2.putText(
        canvas,
        f'MAPA DE CALOR: {lote_id}',
        (x0 + 10, 52),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.1,
        (18, 18, 18),
        2,
        cv2.LINE_AA,
    )

    table_x = x0 + map_w + gap
    table_y = y0 + 20
    table_w = panel_w - 60
    headers = ['ID', 'Area', 'Plantas', 'Huecos', 'KPI %']
    col_w = table_w // len(headers)
    table_h_render = row_h * (rows + 1)
    cv2.rectangle(canvas, (table_x, table_y), (table_x + table_w, table_y + table_h_render), (25, 25, 25), 2)
    for idx in range(1, len(headers)):
        px = table_x + col_w * idx
        cv2.line(canvas, (px, table_y), (px, table_y + table_h_render), (25, 25, 25), 2)
    for ridx in range(1, rows + 1):
        py = table_y + row_h * ridx
        cv2.line(canvas, (table_x, py), (table_x + table_w, py), (25, 25, 25), 2)

    for idx, header in enumerate(headers):
        tx = table_x + col_w * idx + 14
        cv2.putText(canvas, header, (tx, table_y + 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (22, 22, 22), 2, cv2.LINE_AA)

    for ridx, row in enumerate(bloques_resumen, start=1):
        y = table_y + row_h * ridx + 35
        huecos = int(round(float(row.get('conteo', 0)) * 0.12))
        vals = [
            f"B{row.get('bloque_num', '?')}",
            f"{float(row.get('area_ha', 0.0)):.4f} Ha",
            f"{int(row.get('conteo', 0)):,}",
            f"{huecos:,}",
            f"{float(row.get('kpi', 0.0)):.1f}%",
        ]
        for cidx, val in enumerate(vals):
            tx = table_x + col_w * cidx + 10
            color = (22, 22, 22) if not row.get('error') else (50, 50, 180)
            cv2.putText(canvas, val, (tx, y), cv2.FONT_HERSHEY_SIMPLEX, 0.75, color, 2, cv2.LINE_AA)
    return canvas


def construir_resultado_geojson_bloques(lote_id: str, ruta_origen: str, min_area: float, max_area: float, bloques_resumen: list):
    features = []
    for row in bloques_resumen:
        geometry = row.get('geometry')
        if not isinstance(geometry, dict):
            continue
        features.append(
            {
                'type': 'Feature',
                'geometry': geometry,
                'properties': {
                    'feature_role': 'bloque',
                    'lote_id': lote_id,
                    'bloque_id': row.get('bloque_id'),
                    'bloque_num': row.get('bloque_num'),
                    'area_ha': row.get('area_ha'),
                    'conteo': row.get('conteo'),
                    'hileras': row.get('hileras'),
                    'longitud_m': row.get('longitud_m'),
                    'densidad_plantas_ha': row.get('densidad'),
                    'kpi_cumplimiento': row.get('kpi'),
                    'error': row.get('error'),
                },
            }
        )
    total_conteo = sum(int(r.get('conteo', 0) or 0) for r in bloques_resumen if not r.get('error'))
    return {
        'type': 'FeatureCollection',
        'name': f'deteccion_bloques_{normalize_filename(lote_id)}',
        'features': features,
        'metadata': {
            'generated_at': datetime.now().isoformat(),
            'lote_id': lote_id,
            'ruta_origen': ruta_origen,
            'min_area': min_area,
            'max_area': max_area,
            'bloques_procesados': len(bloques_resumen),
            'conteo_total': total_conteo,
        },
    }


def motor_conteo_avanzado_v3(roi_gris: np.ndarray, mask_bin: np.ndarray, gsd: float):
    clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
    res = clahe.apply(roi_gris)
    tophat = cv2.morphologyEx(res, cv2.MORPH_TOPHAT, np.ones((5, 5), np.uint8))
    _, thresh = cv2.threshold(tophat, 38, 255, cv2.THRESH_BINARY)
    thresh = cv2.bitwise_and(thresh, thresh, mask=mask_bin)

    cnts, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    plantas = [c for c in cnts if cv2.contourArea(c) > 0.5]
    total_plantas = len(plantas)

    proyeccion = np.sum(thresh, axis=0)
    hileras = 0
    for i in range(10, max(10, len(proyeccion) - 10), 18):
        if proyeccion[i] > 150:
            hileras += 1

    y_idx, _ = np.where(thresh > 0)
    longitud_m = (float(np.max(y_idx) - np.min(y_idx)) * gsd) if len(y_idx) > 0 else 0.0
    return total_plantas, hileras, longitud_m, plantas


def procesar_conteo_v3(ruta_tif: str, geometria: dict, min_a: float, max_a: float):
    with rasterio.open(ruta_tif) as src:
        pixel_area_m2, _ = estimate_pixel_area_m2(src, geometria)
        gsd = abs(float(src.res[0]))
        try:
            out_image_masked, out_transform = mask(src, [geometria], crop=True, filled=False)
            valid_mask = ~out_image_masked.mask[0]
            out_image = np.ma.filled(out_image_masked, 0)
        except ValueError as exc:
            try:
                if src.crs:
                    reproj_geom = transform_geom('EPSG:4326', str(src.crs), geometria, precision=6)
                    out_image_masked, out_transform = mask(src, [reproj_geom], crop=True, filled=False)
                    valid_mask = ~out_image_masked.mask[0]
                    out_image = np.ma.filled(out_image_masked, 0)
                else:
                    raise exc
            except Exception:
                raise ValueError(
                    'El bloque seleccionado no traslapa con el raster. Verifica proyeccion/GeoJSON del bloque.'
                ) from exc

    area_m2 = float(np.count_nonzero(valid_mask) * pixel_area_m2)
    area_ha = area_m2 / 10000.0 if area_m2 > 0 else 0.0
    if area_m2 <= 0:
        return {
            'conteo': 0,
            'hileras': 0,
            'longitud_m': 0.0,
            'densidad': 0.0,
            'kpi': 0.0,
            'area_ha': 0.0,
        }

    # V3 usa banda 1 como escala de grises base.
    band = out_image[0].astype(np.float32)
    roi_gris = cv2.normalize(np.nan_to_num(band), None, 0, 255, cv2.NORM_MINMAX, cv2.CV_8U)
    mask_bin = (valid_mask.astype(np.uint8) * 255)

    total_plantas, hileras, longitud_m, _ = motor_conteo_avanzado_v3(roi_gris, mask_bin, gsd)
    densidad = (total_plantas / area_m2) * 10000.0 if area_m2 > 0 else 0.0
    kpi = (densidad / 67000.0) * 100.0

    return {
        'conteo': int(total_plantas),
        'hileras': int(hileras),
        'longitud_m': float(longitud_m),
        'densidad': float(densidad),
        'kpi': float(kpi),
        'area_ha': float(area_ha),
    }


def guardar_resultado_batch_bloques(
    lote_id: str,
    ruta_origen: str,
    min_area: float,
    max_area: float,
    preview_con_bloques: np.ndarray,
    bloques_resumen: list,
):
    output_root = get_output_root()
    ts = datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    slug = normalize_filename(lote_id)
    json_path = output_root / f'{slug}_{ts}_bloques.geojson'
    report_path = output_root / f'{slug}_{ts}_bloques_reporte.png'
    payload = construir_resultado_geojson_bloques(lote_id, ruta_origen, min_area, max_area, bloques_resumen)
    with open(json_path, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    report_bgr = generar_reporte_visual_bloques(preview_con_bloques, lote_id, bloques_resumen)
    report_ok = cv2.imwrite(str(report_path), report_bgr)
    if not report_ok:
        raise RuntimeError(f'No se pudo escribir reporte consolidado en {report_path}')
    return {
        'json_path': str(json_path),
        'report_path': str(report_path),
        'json_url': f'/resultados/{json_path.name}',
        'report_url': f'/resultados/{report_path.name}',
    }


async def detectar_bloques_archivo_impl(
    file: UploadFile,
    lote_id: str,
    min_area: float,
    max_area: float,
    bloques_raw: str,
):
    if min_area <= 0 or max_area <= 0:
        raise HTTPException(status_code=400, detail='min_area y max_area deben ser mayores que cero')
    if min_area > max_area:
        raise HTTPException(status_code=400, detail='min_area no puede ser mayor que max_area')
    parsed_lote = (lote_id or '').strip() or 'upload'
    if not re.fullmatch(r'[A-Za-z0-9 _-]+', parsed_lote):
        raise HTTPException(status_code=400, detail='lote_id contiene caracteres no permitidos')
    try:
        bloques = json.loads(bloques_raw)
        if not isinstance(bloques, list) or not bloques:
            raise ValueError('bloques debe ser un arreglo no vacio')
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f'bloques invalido: {exc}')

    suffix = Path(file.filename or 'upload.tif').suffix or '.tif'
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            temp_path = tmp.name
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                tmp.write(chunk)

        preview_full = generar_preview_tif_completo(temp_path)
        bloques_resumen = []
        for block in bloques:
            if not isinstance(block, dict):
                continue
            block_id = str(block.get('bloque_id') or '')
            block_num = int(block.get('bloque_num') or 0)
            block_geo = block.get('geojson')
            try:
                geom = extraer_geometria(block_geo)
                result_pack = procesar_conteo(temp_path, geom, min_area, max_area)
                conteo = len(result_pack['puntos'])
                area_ha = float(result_pack.get('area_ha', 0.0))
                densidad = (conteo / area_ha) if area_ha > 0 else 0.0
                kpi = (densidad / 67000.0) * 100.0
                bloques_resumen.append(
                    {
                        'bloque_id': block_id,
                        'bloque_num': block_num,
                        'geometry': geom,
                        'area_ha': area_ha,
                        'conteo': conteo,
                        'densidad': densidad,
                        'kpi': kpi,
                    }
                )
            except Exception as exc:
                logger.warning('Detect batch bloque error | bloque_id=%s error=%s', block_id, exc)
                fallback_geom = None
                if isinstance(block_geo, dict):
                    try:
                        fallback_geom = extraer_geometria(block_geo)
                    except Exception:
                        fallback_geom = None
                bloques_resumen.append(
                    {
                        'bloque_id': block_id,
                        'bloque_num': block_num,
                        'geometry': fallback_geom,
                        'area_ha': float(block.get('area_ha') or 0.0),
                        'conteo': 0,
                        'densidad': 0.0,
                        'kpi': 0.0,
                        'error': str(exc),
                    }
                )

        preview_with_blocks = dibujar_poligonos_bloques(preview_full, temp_path, bloques_resumen)
        artefactos = guardar_resultado_batch_bloques(
            lote_id=parsed_lote,
            ruta_origen=file.filename or temp_path or 'upload',
            min_area=min_area,
            max_area=max_area,
            preview_con_bloques=preview_with_blocks,
            bloques_resumen=bloques_resumen,
        )
        return {
            'status': 'success',
            'mensaje': f'Se procesaron {len(bloques_resumen)} bloques',
            'bloques': bloques_resumen,
            'resultado_json': artefactos['json_path'],
            'resultado_reporte': artefactos['report_path'],
            'resultado_json_url': artefactos['json_url'],
            'resultado_reporte_url': artefactos['report_url'],
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception('Detect batch archivo error | lote_id=%s error=%s', parsed_lote, exc)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        try:
            await file.close()
        except Exception:
            pass
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                logger.warning('No se pudo eliminar temporal batch: %s', temp_path)


async def detectar_bloques_v3_archivo_impl(
    file: UploadFile,
    lote_id: str,
    min_area: float,
    max_area: float,
    bloques_raw: str,
):
    if min_area <= 0 or max_area <= 0:
        raise HTTPException(status_code=400, detail='min_area y max_area deben ser mayores que cero')
    if min_area > max_area:
        raise HTTPException(status_code=400, detail='min_area no puede ser mayor que max_area')
    parsed_lote = (lote_id or '').strip() or 'upload'
    if not re.fullmatch(r'[A-Za-z0-9 _-]+', parsed_lote):
        raise HTTPException(status_code=400, detail='lote_id contiene caracteres no permitidos')
    try:
        bloques = json.loads(bloques_raw)
        if not isinstance(bloques, list) or not bloques:
            raise ValueError('bloques debe ser un arreglo no vacio')
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f'bloques invalido: {exc}')

    suffix = Path(file.filename or 'upload.tif').suffix or '.tif'
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            temp_path = tmp.name
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                tmp.write(chunk)

        preview_full = generar_preview_tif_completo(temp_path)
        bloques_resumen = []
        for block in bloques:
            if not isinstance(block, dict):
                continue
            block_id = str(block.get('bloque_id') or '')
            block_num = int(block.get('bloque_num') or 0)
            block_geo = block.get('geojson')
            try:
                geom = extraer_geometria(block_geo)
                v3 = procesar_conteo_v3(temp_path, geom, min_area, max_area)
                bloques_resumen.append(
                    {
                        'bloque_id': block_id,
                        'bloque_num': block_num,
                        'geometry': geom,
                        'area_ha': float(v3.get('area_ha', 0.0)),
                        'conteo': int(v3.get('conteo', 0)),
                        'hileras': int(v3.get('hileras', 0)),
                        'longitud_m': float(v3.get('longitud_m', 0.0)),
                        'densidad': float(v3.get('densidad', 0.0)),
                        'kpi': float(v3.get('kpi', 0.0)),
                    }
                )
            except Exception as exc:
                logger.warning('Detect V3 bloque error | bloque_id=%s error=%s', block_id, exc)
                fallback_geom = None
                if isinstance(block_geo, dict):
                    try:
                        fallback_geom = extraer_geometria(block_geo)
                    except Exception:
                        fallback_geom = None
                bloques_resumen.append(
                    {
                        'bloque_id': block_id,
                        'bloque_num': block_num,
                        'geometry': fallback_geom,
                        'area_ha': float(block.get('area_ha') or 0.0),
                        'conteo': 0,
                        'hileras': 0,
                        'longitud_m': 0.0,
                        'densidad': 0.0,
                        'kpi': 0.0,
                        'error': str(exc),
                    }
                )

        preview_with_blocks = dibujar_poligonos_bloques(preview_full, temp_path, bloques_resumen)
        artefactos = guardar_resultado_batch_bloques(
            lote_id=f'{parsed_lote}_v3',
            ruta_origen=file.filename or temp_path or 'upload',
            min_area=min_area,
            max_area=max_area,
            preview_con_bloques=preview_with_blocks,
            bloques_resumen=bloques_resumen,
        )
        return {
            'status': 'success',
            'metodo': 'v3_conteo_avanzado',
            'mensaje': f'Se procesaron {len(bloques_resumen)} bloques (V3)',
            'bloques': bloques_resumen,
            'resultado_json': artefactos['json_path'],
            'resultado_reporte': artefactos['report_path'],
            'resultado_json_url': artefactos['json_url'],
            'resultado_reporte_url': artefactos['report_url'],
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception('Detect V3 batch archivo error | lote_id=%s error=%s', parsed_lote, exc)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        try:
            await file.close()
        except Exception:
            pass
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                logger.warning('No se pudo eliminar temporal batch V3: %s', temp_path)


async def detectar_impl(req: AuditoriaRequest):
    geo_type = req.geojson.get('type') if isinstance(req.geojson, dict) else type(req.geojson).__name__
    geo_keys = list(req.geojson.keys())[:8] if isinstance(req.geojson, dict) else []
    logger.info(
        'Detect request | lote_id=%r min_area=%s max_area=%s geo_type=%s geo_keys=%s',
        req.lote_id,
        req.min_area,
        req.max_area,
        geo_type,
        geo_keys,
    )

    if req.min_area <= 0 or req.max_area <= 0:
        raise HTTPException(status_code=400, detail='min_area y max_area deben ser mayores que cero')
    if req.min_area > req.max_area:
        raise HTTPException(status_code=400, detail='min_area no puede ser mayor que max_area')

    lote_id = (req.lote_id or '').strip()
    if not lote_id:
        raise HTTPException(status_code=400, detail='lote_id es requerido')
    if not re.fullmatch(r'[A-Za-z0-9 _-]+', lote_id):
        logger.warning('Detect request rechazado por lote_id invalido: %r', req.lote_id)
        raise HTTPException(status_code=400, detail='lote_id contiene caracteres no permitidos')

    ruta_base = os.getenv('RUTA_MOSAICOS', 'D:/Proyectos/aplicaciones/public/mosaicos')
    ruta_tif = resolve_tif_path(ruta_base, lote_id)

    if not ruta_tif:
        disponibles = []
        try:
            base = Path(ruta_base)
            if base.exists():
                disponibles = [p.name for p in sorted(list(base.glob('*.tif')) + list(base.glob('*.tiff')))[:10]]
        except Exception:
            disponibles = []
        logger.warning('Detect request sin archivo TIF | lote_id=%s ruta_base=%s', lote_id, ruta_base)
        raise HTTPException(
            status_code=404,
            detail=(
                f'No se encontro TIFF para lote_id={lote_id} en {ruta_base}. '
                f'Archivos detectados: {disponibles}'
            ),
        )

    try:
        geom = extraer_geometria(req.geojson)
        resultado_pack = procesar_conteo(ruta_tif, geom, req.min_area, req.max_area)
        resultado = resultado_pack['puntos']
        coordenadas = [{'lon': p['lon'], 'lat': p['lat']} for p in resultado]
        artefactos = guardar_resultado_deteccion(
            lote_id=lote_id,
            min_area=req.min_area,
            max_area=req.max_area,
            ruta_origen=ruta_tif,
            geojson=req.geojson,
            puntos=resultado,
            preview_bgr=resultado_pack['preview_bgr'],
            area_ha=float(resultado_pack.get('area_ha', 0.0)),
        )
        logger.info(
            'Detect success | lote_id=%s conteo=%s ruta=%s json=%s img=%s',
            lote_id,
            len(resultado),
            ruta_tif,
            artefactos['json_path'],
            artefactos['image_path'],
        )
        return {
            'status': 'success',
            'conteo': len(resultado),
            'area_ha': float(resultado_pack.get('area_ha', 0.0)),
            'area_source': resultado_pack.get('area_source'),
            'puntos': resultado,
            'coordenadas': coordenadas,
            'mensaje': f'Se detectaron {len(resultado)} plantas en {lote_id}',
            'resultado_json': artefactos['json_path'],
            'resultado_imagen': artefactos['image_path'],
            'resultado_reporte': artefactos['report_path'],
            'resultado_json_url': artefactos['json_url'],
            'resultado_imagen_url': artefactos['image_url'],
            'resultado_reporte_url': artefactos['report_url'],
        }
    except ValueError as exc:
        logger.warning('Detect request con geojson invalido | lote_id=%s error=%s', lote_id, exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception('Detect error inesperado | lote_id=%s error=%s', lote_id, exc)
        raise HTTPException(status_code=500, detail=str(exc))

async def detectar_archivo_impl(
    file: UploadFile,
    lote_id: str,
    min_area: float,
    max_area: float,
    geojson_raw: str,
):
    logger.info(
        'Detect archivo request | lote_id=%r filename=%r min_area=%s max_area=%s content_type=%s',
        lote_id,
        file.filename,
        min_area,
        max_area,
        file.content_type,
    )

    if min_area <= 0 or max_area <= 0:
        raise HTTPException(status_code=400, detail='min_area y max_area deben ser mayores que cero')
    if min_area > max_area:
        raise HTTPException(status_code=400, detail='min_area no puede ser mayor que max_area')

    parsed_lote = (lote_id or '').strip() or 'upload'
    if not re.fullmatch(r'[A-Za-z0-9 _-]+', parsed_lote):
        raise HTTPException(status_code=400, detail='lote_id contiene caracteres no permitidos')

    try:
        geojson = json.loads(geojson_raw)
    except Exception as exc:
        logger.warning('Detect archivo geojson invalido | lote_id=%s error=%s', parsed_lote, exc)
        raise HTTPException(status_code=400, detail=f'geojson invalido: {exc}')

    suffix = Path(file.filename or 'upload.tif').suffix or '.tif'
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            temp_path = tmp.name
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                tmp.write(chunk)

        geom = extraer_geometria(geojson)
        resultado_pack = procesar_conteo(temp_path, geom, min_area, max_area)
        resultado = resultado_pack['puntos']
        coordenadas = [{'lon': p['lon'], 'lat': p['lat']} for p in resultado]
        artefactos = guardar_resultado_deteccion(
            lote_id=parsed_lote,
            min_area=min_area,
            max_area=max_area,
            ruta_origen=file.filename or temp_path or 'upload',
            geojson=geojson,
            puntos=resultado,
            preview_bgr=resultado_pack['preview_bgr'],
            area_ha=float(resultado_pack.get('area_ha', 0.0)),
        )
        logger.info(
            'Detect archivo success | lote_id=%s conteo=%s temp=%s json=%s img=%s',
            parsed_lote,
            len(resultado),
            temp_path,
            artefactos['json_path'],
            artefactos['image_path'],
        )
        return {
            'status': 'success',
            'conteo': len(resultado),
            'area_ha': float(resultado_pack.get('area_ha', 0.0)),
            'area_source': resultado_pack.get('area_source'),
            'puntos': resultado,
            'coordenadas': coordenadas,
            'mensaje': f'Se detectaron {len(resultado)} plantas en {parsed_lote} (archivo subido)',
            'resultado_json': artefactos['json_path'],
            'resultado_imagen': artefactos['image_path'],
            'resultado_reporte': artefactos['report_path'],
            'resultado_json_url': artefactos['json_url'],
            'resultado_imagen_url': artefactos['image_url'],
            'resultado_reporte_url': artefactos['report_url'],
        }
    except ValueError as exc:
        logger.warning('Detect archivo request invalido | lote_id=%s error=%s', parsed_lote, exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception('Detect archivo error | lote_id=%s error=%s', parsed_lote, exc)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        try:
            await file.close()
        except Exception:
            pass
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                logger.warning('No se pudo eliminar temporal: %s', temp_path)


def construir_geometria_desde_puntos_normalizados(ruta_tif: str, puntos_norm: list) -> dict:
    if not isinstance(puntos_norm, list) or len(puntos_norm) < 3:
        raise ValueError('puntos debe tener al menos 3 vertices')

    with rasterio.open(ruta_tif) as src:
        width = int(src.width)
        height = int(src.height)
        if width <= 1 or height <= 1:
            raise ValueError('Raster invalido para construir geometria')

        coords_src = []
        for idx, p in enumerate(puntos_norm):
            if not isinstance(p, (list, tuple)) or len(p) < 2:
                raise ValueError(f'Vertice {idx + 1} invalido')
            nx = float(p[0])
            ny = float(p[1])
            if not np.isfinite(nx) or not np.isfinite(ny):
                raise ValueError(f'Vertice {idx + 1} invalido')
            nx = max(0.0, min(1.0, nx))
            ny = max(0.0, min(1.0, ny))
            col = nx * float(width - 1)
            row = ny * float(height - 1)
            x, y = rasterio.transform.xy(src.transform, row, col, offset='center')
            coords_src.append([float(x), float(y)])

        coords = coords_src
        if src.crs and not src.crs.is_geographic:
            try:
                xs = [pt[0] for pt in coords_src]
                ys = [pt[1] for pt in coords_src]
                lon, lat = transform(src.crs, 'EPSG:4326', xs, ys)
                coords = [[float(lon[i]), float(lat[i])] for i in range(len(lon))]
            except Exception:
                coords = coords_src

    if coords[0] != coords[-1]:
        coords.append(coords[0])

    return {'type': 'Polygon', 'coordinates': [coords]}


async def detectar_archivo_poligono_impl(
    file: UploadFile,
    min_area: float,
    max_area: float,
    puntos_raw: str,
    lote_id: str,
    area_mode: str,
    gsd_m: float,
    detect_mode: str,
):
    logger.info(
        'Detect poligono archivo request | lote_id=%r filename=%r min_area=%s max_area=%s',
        lote_id,
        file.filename,
        min_area,
        max_area,
    )

    if min_area <= 0 or max_area <= 0:
        raise HTTPException(status_code=400, detail='min_area y max_area deben ser mayores que cero')
    if min_area > max_area:
        raise HTTPException(status_code=400, detail='min_area no puede ser mayor que max_area')

    parsed_lote = (lote_id or '').strip() or 'upload'
    if not re.fullmatch(r'[A-Za-z0-9 _-]+', parsed_lote):
        raise HTTPException(status_code=400, detail='lote_id contiene caracteres no permitidos')

    try:
        puntos = json.loads(puntos_raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f'puntos invalido: {exc}')

    suffix = Path(file.filename or 'upload.tif').suffix or '.tif'
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            temp_path = tmp.name
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                tmp.write(chunk)

        geom = construir_geometria_desde_puntos_normalizados(temp_path, puntos)
        geojson = {'type': 'Feature', 'geometry': geom, 'properties': {'source': 'drawn_polygon'}}
        resultado_pack = procesar_conteo(
            temp_path,
            geom,
            min_area,
            max_area,
            area_mode=area_mode,
            gsd_override_m=gsd_m,
            detect_mode=detect_mode,
        )
        resultado = resultado_pack['puntos']
        coordenadas = [{'lon': p['lon'], 'lat': p['lat']} for p in resultado]
        artefactos = guardar_resultado_deteccion(
            lote_id=parsed_lote,
            min_area=min_area,
            max_area=max_area,
            ruta_origen=file.filename or temp_path or 'upload',
            geojson=geojson,
            puntos=resultado,
            preview_bgr=resultado_pack['preview_bgr'],
            area_ha=float(resultado_pack.get('area_ha', 0.0)),
        )
        return {
            'status': 'success',
            'conteo': len(resultado),
            'area_ha': float(resultado_pack.get('area_ha', 0.0)),
            'area_source': resultado_pack.get('area_source'),
            'hileras': int(resultado_pack.get('hileras', 0) or 0),
            'longitud_m': float(resultado_pack.get('longitud_m', 0.0) or 0.0),
            'densidad': float(resultado_pack.get('densidad', 0.0) or 0.0),
            'kpi': float(resultado_pack.get('kpi', 0.0) or 0.0),
            'detect_mode': resultado_pack.get('detect_mode'),
            'puntos': resultado,
            'coordenadas': coordenadas,
            'mensaje': f'Se detectaron {len(resultado)} plantas en area dibujada',
            'resultado_json': artefactos['json_path'],
            'resultado_imagen': artefactos['image_path'],
            'resultado_reporte': artefactos['report_path'],
            'resultado_json_url': artefactos['json_url'],
            'resultado_imagen_url': artefactos['image_url'],
            'resultado_reporte_url': artefactos['report_url'],
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception('Detect poligono archivo error | lote_id=%s error=%s', parsed_lote, exc)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        try:
            await file.close()
        except Exception:
            pass
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                logger.warning('No se pudo eliminar temporal: %s', temp_path)


async def detectar_bloques_poligono_archivo_impl(
    file: UploadFile,
    min_area: float,
    max_area: float,
    bloques_puntos_raw: str,
    lote_id: str,
    area_mode: str,
    gsd_m: float,
    detect_mode: str,
):
    if min_area <= 0 or max_area <= 0:
        raise HTTPException(status_code=400, detail='min_area y max_area deben ser mayores que cero')
    if min_area > max_area:
        raise HTTPException(status_code=400, detail='min_area no puede ser mayor que max_area')

    parsed_lote = (lote_id or '').strip() or 'upload'
    if not re.fullmatch(r'[A-Za-z0-9 _-]+', parsed_lote):
        raise HTTPException(status_code=400, detail='lote_id contiene caracteres no permitidos')

    try:
        bloques_puntos = json.loads(bloques_puntos_raw)
        if not isinstance(bloques_puntos, list) or not bloques_puntos:
            raise ValueError('bloques_puntos debe ser un arreglo no vacio')
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f'bloques_puntos invalido: {exc}')

    suffix = Path(file.filename or 'upload.tif').suffix or '.tif'
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            temp_path = tmp.name
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                tmp.write(chunk)

        preview_full = generar_preview_tif_completo(temp_path)
        bloques_resumen = []
        geojson_poligonos = []
        for idx, block in enumerate(bloques_puntos):
            if not isinstance(block, dict):
                continue
            block_num = int(block.get('bloque_num') or (idx + 1))
            block_id = str(block.get('bloque_id') or f'B{block_num}')
            puntos_norm = block.get('puntos')
            try:
                geom = construir_geometria_desde_puntos_normalizados(temp_path, puntos_norm)
                geojson_poligonos.append({'bloque_num': block_num, 'geometry': geom})
                result_pack = procesar_conteo(
                    temp_path,
                    geom,
                    min_area,
                    max_area,
                    area_mode=area_mode,
                    gsd_override_m=gsd_m,
                    detect_mode=detect_mode,
                )
                bloques_resumen.append(
                    {
                        'bloque_id': block_id,
                        'bloque_num': block_num,
                        'geometry': geom,
                        'area_ha': float(result_pack.get('area_ha', 0.0)),
                        'area_source': result_pack.get('area_source'),
                        'conteo': int(len(result_pack.get('puntos') or [])),
                        'hileras': int(result_pack.get('hileras', 0)),
                        'longitud_m': float(result_pack.get('longitud_m', 0.0)),
                        'densidad': float(result_pack.get('densidad', 0.0)),
                        'kpi': float(result_pack.get('kpi', 0.0)),
                        'detect_mode': result_pack.get('detect_mode'),
                    }
                )
            except Exception as exc:
                logger.warning('Detect bloques poligono error | bloque=%s error=%s', block_id, exc)
                bloques_resumen.append(
                    {
                        'bloque_id': block_id,
                        'bloque_num': block_num,
                        'geometry': None,
                        'area_ha': 0.0,
                        'conteo': 0,
                        'hileras': 0,
                        'longitud_m': 0.0,
                        'densidad': 0.0,
                        'kpi': 0.0,
                        'error': str(exc),
                    }
                )

        preview_with_blocks = dibujar_poligonos_bloques(preview_full, temp_path, bloques_resumen)
        artefactos = guardar_resultado_batch_bloques(
            lote_id=parsed_lote,
            ruta_origen=file.filename or temp_path or 'upload',
            min_area=min_area,
            max_area=max_area,
            preview_con_bloques=preview_with_blocks,
            bloques_resumen=bloques_resumen,
        )
        return {
            'status': 'success',
            'mensaje': f'Se procesaron {len(bloques_resumen)} bloques',
            'bloques': bloques_resumen,
            'geojson_poligonos': geojson_poligonos,
            'resultado_json': artefactos['json_path'],
            'resultado_reporte': artefactos['report_path'],
            'resultado_json_url': artefactos['json_url'],
            'resultado_reporte_url': artefactos['report_url'],
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception('Detect bloques poligono archivo error | lote_id=%s error=%s', parsed_lote, exc)
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        try:
            await file.close()
        except Exception:
            pass
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                logger.warning('No se pudo eliminar temporal bloques poligono: %s', temp_path)


@app.post('/api/v1/detectar')
async def detectar_v1(req: AuditoriaRequest):
    return await detectar_impl(req)


@app.post('/detectar')
async def detectar_legacy(req: AuditoriaRequest):
    return await detectar_impl(req)


@app.post('/api/v1/detectar-archivo')
async def detectar_archivo_v1(
    file: UploadFile = File(...),
    lote_id: str = Form('upload'),
    min_area: float = Form(...),
    max_area: float = Form(...),
    geojson: str = Form(...),
):
    return await detectar_archivo_impl(file, lote_id, min_area, max_area, geojson)


@app.post('/detectar-archivo')
async def detectar_archivo_legacy(
    file: UploadFile = File(...),
    lote_id: str = Form('upload'),
    min_area: float = Form(...),
    max_area: float = Form(...),
    geojson: str = Form(...),
):
    return await detectar_archivo_impl(file, lote_id, min_area, max_area, geojson)


@app.post('/api/v1/detectar-archivo-poligono')
async def detectar_archivo_poligono_v1(
    file: UploadFile = File(...),
    min_area: float = Form(...),
    max_area: float = Form(...),
    puntos: str = Form(...),
    lote_id: str = Form('upload'),
    area_mode: str = Form('auto'),
    gsd_m: float = Form(0.05),
    detect_mode: str = Form('adaptive'),
):
    return await detectar_archivo_poligono_impl(file, min_area, max_area, puntos, lote_id, area_mode, gsd_m, detect_mode)


@app.post('/detectar-archivo-poligono')
async def detectar_archivo_poligono_legacy(
    file: UploadFile = File(...),
    min_area: float = Form(...),
    max_area: float = Form(...),
    puntos: str = Form(...),
    lote_id: str = Form('upload'),
    area_mode: str = Form('auto'),
    gsd_m: float = Form(0.05),
    detect_mode: str = Form('adaptive'),
):
    return await detectar_archivo_poligono_impl(file, min_area, max_area, puntos, lote_id, area_mode, gsd_m, detect_mode)


@app.post('/api/v1/detectar-bloques-poligono-archivo')
async def detectar_bloques_poligono_archivo_v1(
    file: UploadFile = File(...),
    min_area: float = Form(...),
    max_area: float = Form(...),
    bloques_puntos: str = Form(...),
    lote_id: str = Form('upload'),
    area_mode: str = Form('auto'),
    gsd_m: float = Form(0.05),
    detect_mode: str = Form('adaptive'),
):
    return await detectar_bloques_poligono_archivo_impl(
        file, min_area, max_area, bloques_puntos, lote_id, area_mode, gsd_m, detect_mode
    )


@app.post('/detectar-bloques-poligono-archivo')
async def detectar_bloques_poligono_archivo_legacy(
    file: UploadFile = File(...),
    min_area: float = Form(...),
    max_area: float = Form(...),
    bloques_puntos: str = Form(...),
    lote_id: str = Form('upload'),
    area_mode: str = Form('auto'),
    gsd_m: float = Form(0.05),
    detect_mode: str = Form('adaptive'),
):
    return await detectar_bloques_poligono_archivo_impl(
        file, min_area, max_area, bloques_puntos, lote_id, area_mode, gsd_m, detect_mode
    )


@app.post('/api/v1/detectar-bloques-archivo')
async def detectar_bloques_archivo_v1(
    file: UploadFile = File(...),
    lote_id: str = Form('upload'),
    min_area: float = Form(...),
    max_area: float = Form(...),
    bloques: str = Form(...),
):
    return await detectar_bloques_archivo_impl(file, lote_id, min_area, max_area, bloques)


@app.post('/detectar-bloques-archivo')
async def detectar_bloques_archivo_legacy(
    file: UploadFile = File(...),
    lote_id: str = Form('upload'),
    min_area: float = Form(...),
    max_area: float = Form(...),
    bloques: str = Form(...),
):
    return await detectar_bloques_archivo_impl(file, lote_id, min_area, max_area, bloques)


@app.post('/api/v1/detectar-bloques-v3-archivo')
async def detectar_bloques_v3_archivo_v1(
    file: UploadFile = File(...),
    lote_id: str = Form('upload'),
    min_area: float = Form(...),
    max_area: float = Form(...),
    bloques: str = Form(...),
):
    return await detectar_bloques_v3_archivo_impl(file, lote_id, min_area, max_area, bloques)


@app.post('/detectar-bloques-v3-archivo')
async def detectar_bloques_v3_archivo_legacy(
    file: UploadFile = File(...),
    lote_id: str = Form('upload'),
    min_area: float = Form(...),
    max_area: float = Form(...),
    bloques: str = Form(...),
):
    return await detectar_bloques_v3_archivo_impl(file, lote_id, min_area, max_area, bloques)


if __name__ == '__main__':
    import uvicorn

    uvicorn.run(app, host='0.0.0.0', port=8005)
