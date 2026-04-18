"""
mrk_to_geojson.py
Convierte archivos .MRK del dron DJI a polígonos GeoJSON (casco convexo).
Agrupa por lote según el nombre de la carpeta.
"""

import os
import json
import math
import re

MRK_ROOT = r"E:\DCIM"
OUTPUT_DIR = r"E:\GeoJSON"

# Grupos de vuelos por lote
LOTES = {
    "lote63": ["001_lote63conteo", "002_lote63conteo", "003_lote63conteo", "004_lote63conteomulti"],
    "lote1":  ["006_conteolote1", "007_conteolote1", "008_multilote1"],
    "lote_005": ["005"],
}


# ── Convex Hull (Graham Scan) ───────────────────────────────────────────────

def cross(O, A, B):
    return (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0])

def convex_hull(points):
    points = sorted(set(points))
    if len(points) <= 1:
        return points
    lower = []
    for p in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


# ── Parseo de archivos MRK ──────────────────────────────────────────────────

def parse_mrk(filepath):
    """Extrae lista de (lon, lat) desde un .MRK de DJI."""
    points = []
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            # Buscar "10.xxxxx,Lat" y "-84.xxxxx,Lon"
            lat_match = re.search(r"([\d.]+),Lat", line)
            lon_match = re.search(r"(-[\d.]+),Lon", line)
            if lat_match and lon_match:
                lat = float(lat_match.group(1))
                lon = float(lon_match.group(1))
                points.append((lon, lat))   # GeoJSON: [lon, lat]
    return points


# ── Área en hectáreas (Shoelace) ────────────────────────────────────────────

def ring_area_ha(ring):
    """ring = lista de [lon, lat]. Devuelve hectáreas."""
    if len(ring) < 3:
        return 0.0
    lats = [p[1] for p in ring]
    mean_lat = sum(lats) / len(lats)
    m_per_lat = 111320.0
    m_per_lon = 111320.0 * math.cos(math.radians(mean_lat))
    area = 0.0
    n = len(ring)
    for i in range(n):
        j = (i + 1) % n
        xi = ring[i][0] * m_per_lon
        yi = ring[i][1] * m_per_lat
        xj = ring[j][0] * m_per_lon
        yj = ring[j][1] * m_per_lat
        area += xi * yj - xj * yi
    return abs(area) / 2 / 10_000


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    features = []

    for lote_nombre, carpetas in LOTES.items():
        all_points = []
        vuelos_incluidos = []

        for carpeta_sufijo in carpetas:
            # Buscar carpeta que contenga el sufijo
            carpeta = None
            for d in os.listdir(MRK_ROOT):
                if carpeta_sufijo in d:
                    carpeta = os.path.join(MRK_ROOT, d)
                    break
            if not carpeta or not os.path.isdir(carpeta):
                print(f"  ⚠  Carpeta '{carpeta_sufijo}' no encontrada — omitiendo")
                continue

            # Buscar el .MRK dentro
            mrk_file = None
            for f in os.listdir(carpeta):
                if f.endswith("_Timestamp.MRK"):
                    mrk_file = os.path.join(carpeta, f)
                    break
            if not mrk_file:
                print(f"  ⚠  Sin .MRK en {carpeta}")
                continue

            pts = parse_mrk(mrk_file)
            print(f"  ✓  {os.path.basename(mrk_file):55s}  {len(pts):4d} puntos")
            all_points.extend(pts)
            vuelos_incluidos.append(os.path.basename(carpeta))

        if len(all_points) < 3:
            print(f"  ✗  {lote_nombre}: insuficientes puntos ({len(all_points)})")
            continue

        hull = convex_hull(all_points)
        ring = hull + [hull[0]]   # cerrar el polígono
        area_ha = ring_area_ha(ring)

        feature = {
            "type": "Feature",
            "properties": {
                "nombre": lote_nombre.replace("_", " ").title(),
                "hectareas_calculadas": round(area_ha, 4),
                "puntos_vuelo": len(all_points),
                "vuelos": vuelos_incluidos,
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[lon, lat] for lon, lat in ring]],
            },
        }
        features.append(feature)

        # GeoJSON individual por lote
        fc_individual = {"type": "FeatureCollection", "features": [feature]}
        out_individual = os.path.join(OUTPUT_DIR, f"{lote_nombre}.geojson")
        with open(out_individual, "w", encoding="utf-8") as f:
            json.dump(fc_individual, f, indent=2, ensure_ascii=False)
        print(f"  → Guardado: {out_individual}  ({area_ha:.2f} ha)\n")

    # GeoJSON combinado con todos los lotes
    fc_all = {"type": "FeatureCollection", "features": features}
    out_all = os.path.join(OUTPUT_DIR, "todos_los_lotes.geojson")
    with open(out_all, "w", encoding="utf-8") as f:
        json.dump(fc_all, f, indent=2, ensure_ascii=False)
    print(f"\n{'='*60}")
    print(f"  Combinado: {out_all}")
    print(f"  Lotes generados: {len(features)}")
    print(f"{'='*60}")


if __name__ == "__main__":
    print("\n── MRK → GeoJSON ──────────────────────────────────────────\n")
    for lote in LOTES:
        print(f"Procesando {lote}:")
        # Llamar directamente
    main()
