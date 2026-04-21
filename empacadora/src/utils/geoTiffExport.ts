/**
 * Utilidades para exportar mosaicos en formato GeoTIFF y GeoJSON
 */

/**
 * Generar metadata GeoJSON desde bounds del mosaico
 * @param bounds [[minLat, minLng], [maxLat, maxLng]]
 * @param sessionId ID de sesión
 * @returns GeoJSON FeatureCollection
 */
export function generateGeoJSON(
  bounds: [[number, number], [number, number]],
  sessionId: string
) {
  const [[minLat, minLng], [maxLat, maxLng]] = bounds;

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [minLng, minLat],
              [maxLng, minLat],
              [maxLng, maxLat],
              [minLng, maxLat],
              [minLng, minLat],
            ],
          ],
        },
        properties: {
          sessionId,
          type: 'mosaico_bounds',
          bounds: { minLat, minLng, maxLat, maxLng },
        },
      },
    ],
  };
}

/**
 * Calcular resolución del GeoTIFF (metros por pixel)
 * Aproximado: 1 pixel = X metros en el terreno
 * Para 72 fotos DJI (M3T a ~150m altura): ~5cm/pixel
 */
export function calculatePixelScale(
  bounds: [[number, number], [number, number]],
  imageWidth: number,
  imageHeight: number
): [number, number] {
  const [[minLat, minLng], [maxLat, maxLng]] = bounds;

  // Aproximar distancia en metros
  // 1 grado ≈ 111km
  const latDist = (maxLat - minLat) * 111000; // metros
  const lngDist = (maxLng - minLng) * 111000 * Math.cos((minLat + maxLat) / 2 * Math.PI / 180);

  const pixelScaleX = lngDist / imageWidth; // metros/pixel en X
  const pixelScaleY = latDist / imageHeight; // metros/pixel en Y

  return [pixelScaleX, pixelScaleY];
}

/**
 * Generar metadata WorldFile (.jgw) para georeferenciación
 * Formato: 6 líneas con:
 * pixel width (X scale)
 * rotation (X skew)
 * rotation (Y skew)
 * pixel height (Y scale) - negativo porque Y va hacia abajo
 * X coordinate of upper-left corner
 * Y coordinate of upper-left corner
 */
export function generateWorldFile(
  bounds: [[number, number], [number, number]],
  imageWidth: number,
  imageHeight: number
): string {
  const [[minLat, minLng], [maxLat, maxLng]] = bounds;
  const [pixelScaleX, pixelScaleY] = calculatePixelScale(bounds, imageWidth, imageHeight);

  // Upper-left corner in lat/lng
  const upperLeftX = minLng;
  const upperLeftY = maxLat;

  // WorldFile format (6 lines)
  const lines = [
    pixelScaleX.toFixed(10), // pixel width
    '0', // rotation X
    '0', // rotation Y
    (-pixelScaleY).toFixed(10), // pixel height (negative)
    upperLeftX.toFixed(10), // upper-left X
    upperLeftY.toFixed(10), // upper-left Y
  ];

  return lines.join('\n');
}

/**
 * Descargar archivo (blob) con nombre
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exportar metadata GeoJSON a descarga
 */
export async function downloadGeoJSON(
  bounds: [[number, number], [number, number]],
  sessionId: string,
  filename?: string
) {
  const geojson = generateGeoJSON(bounds, sessionId);
  const blob = new Blob([JSON.stringify(geojson, null, 2)], {
    type: 'application/geo+json',
  });
  downloadBlob(blob, filename || `${sessionId}_bounds.geojson`);
}

/**
 * Exportar WorldFile a descarga (.jgw para JPEG georeferenciado)
 */
export async function downloadWorldFile(
  bounds: [[number, number], [number, number]],
  imageWidth: number,
  imageHeight: number,
  sessionId: string
) {
  const worldFileContent = generateWorldFile(bounds, imageWidth, imageHeight);
  const blob = new Blob([worldFileContent], { type: 'text/plain' });
  downloadBlob(blob, `${sessionId}.jgw`);
}

/**
 * Exportar JPEG + WorldFile (georeferencia compatible con QGIS/ArcGIS)
 * El WorldFile proporciona georeferenciación para el JPEG
 */
export async function downloadGeoJPEG(
  mosaicBlob: Blob,
  bounds: [[number, number], [number, number]],
  imageWidth: number,
  imageHeight: number,
  sessionId: string
) {
  // Descargar JPEG
  downloadBlob(mosaicBlob, `${sessionId}_mosaico.jpg`);

  // Descargar WorldFile (.jgw)
  await downloadWorldFile(bounds, imageWidth, imageHeight, sessionId);

  console.log(
    '[geoTiffExport] Descargados: JPG + JGW (JPEG + WorldFile georeferenciado)'
  );
}
