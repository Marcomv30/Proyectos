import cv2
import numpy as np
from fastapi import FastAPI, UploadFile
from shapely.geometry import Point, Polygon
import rasterio

app = FastAPI()

@app.post("/conteo")
async def contar_plantas(archivo: UploadFile, poligono: list):
    # 1. Leer GeoTIFF
    with rasterio.open(archivo.file) as src:
        img = src.read([1,2,3])  # RGB
        transform = src.transform

    # 2. Convertir a formato OpenCV
    img = np.moveaxis(img, 0, -1)
    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)

    # 3. Segmentar vegetación (verde)
    lower = np.array([25, 40, 40])
    upper = np.array([90, 255, 255])
    mask = cv2.inRange(hsv, lower, upper)

    # 4. Limpiar ruido
    mask = cv2.medianBlur(mask, 7)

    # 5. Detectar “blobs” (cada blob ≈ una planta)
    params = cv2.SimpleBlobDetector_Params()
    params.filterByArea = True
    params.minArea = 40
    params.maxArea = 2000
    detector = cv2.SimpleBlobDetector_create(params)
    keypoints = detector.detect(mask)

    # 6. Convertir píxeles → coordenadas reales
    coords = []
    for kp in keypoints:
        px, py = kp.pt
        lon, lat = rasterio.transform.xy(transform, py, px)
        coords.append((lon, lat))

    # 7. Filtrar por polígono del lote/bloque
    poly = Polygon(poligono)
    coords_filtradas = [
        {"lon": c[0], "lat": c[1]}
        for c in coords
        if poly.contains(Point(c))
    ]

    return {
        "plantas": len(coords_filtradas),
        "coordenadas": coords_filtradas
    }
