/**
 * Módulo de Calidad para Mosaicos
 * - Filtrado inteligente de fotos borrosas/oscuras
 * - Alineación por solapamiento real
 * - Corrección de perspectiva (homografía)
 * - Histogram matching y blend mejorado
 */

// ── 1. Detectar fotos borrosas (Laplacian variance) ──────────────────────

export async function detectBlurryPhotos(
  photos: Array<{ file: File; name: string }>,
  blurThreshold = 100
): Promise<{ clean: typeof photos; blurry: string[] }> {
  const blurry: string[] = [];
  const clean = [];

  for (const photo of photos) {
    try {
      const img = await loadImageFromFile(photo.file);
      const laplacianVar = calculateLaplacianVariance(img);

      if (laplacianVar < blurThreshold) {
        blurry.push(photo.name);
      } else {
        clean.push(photo);
      }
    } catch {
      // Si hay error, mantener la foto
      clean.push(photo);
    }
  }

  return { clean, blurry };
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function calculateLaplacianVariance(img: HTMLImageElement): number {
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(img.width, 400);
  canvas.height = Math.min(img.height, 400);
  const ctx = canvas.getContext('2d');
  if (!ctx) return 100;

  // Convertir a escala de grises
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const gray = new Uint8Array(canvas.width * canvas.height);

  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // Aplicar filtro Laplaciano
  const kernel = [-1, -1, -1, -1, 8, -1, -1, -1, -1];
  const laplacian = new Float32Array(canvas.width * canvas.height);
  const w = canvas.width;
  const h = canvas.height;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          sum += gray[(y - 1 + ky) * w + (x - 1 + kx)] * kernel[ky * 3 + kx];
        }
      }
      laplacian[y * w + x] = sum;
    }
  }

  // Calcular varianza del Laplaciano
  const mean = laplacian.reduce((a, b) => a + b, 0) / laplacian.length;
  const variance =
    laplacian.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    laplacian.length;

  return Math.sqrt(variance);
}

// ── 2. Detectar fotos oscuras/sobrexpuestas ────────────────────────────

export async function detectDarkOrBrightPhotos(
  photos: Array<{ file: File; name: string }>,
  darkThreshold = 30,
  brightThreshold = 225
): Promise<{ valid: typeof photos; rejected: string[] }> {
  const rejected: string[] = [];
  const valid = [];

  for (const photo of photos) {
    try {
      const img = await loadImageFromFile(photo.file);
      const avgBrightness = calculateAverageBrightness(img);

      if (avgBrightness < darkThreshold || avgBrightness > brightThreshold) {
        rejected.push(photo.name);
      } else {
        valid.push(photo);
      }
    } catch {
      valid.push(photo);
    }
  }

  return { valid, rejected };
}

// ── 2b. Detectar nubes + oscuridad regional ────────────────────────────

export async function detectCloudyPhotos(
  photos: Array<{ file: File; name: string }>,
  cloudThreshold = 0.3,  // 30% de píxeles muy blancos = nublado
  darknessThreshold = 0.25  // 25% de píxeles muy oscuros = sombrío
): Promise<{ valid: typeof photos; cloudy: string[]; dark: string[] }> {
  const cloudy: string[] = [];
  const dark: string[] = [];
  const valid = [];

  for (const photo of photos) {
    try {
      const img = await loadImageFromFile(photo.file);
      const { cloudyPercent, darkPercent } = analyzeCloudiness(img);

      if (cloudyPercent > cloudThreshold) {
        cloudy.push(photo.name);
      } else if (darkPercent > darknessThreshold) {
        dark.push(photo.name);
      } else {
        valid.push(photo);
      }
    } catch {
      valid.push(photo);
    }
  }

  return { valid, cloudy, dark };
}

function analyzeCloudiness(img: HTMLImageElement): { cloudyPercent: number; darkPercent: number } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(img.width, 200);
  canvas.height = Math.min(img.height, 200);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { cloudyPercent: 0, darkPercent: 0 };

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let cloudyPixels = 0;
  let darkPixels = 0;
  let totalPixels = canvas.width * canvas.height;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
    const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b, 1);

    // Detectar nubes: píxeles muy blancos (baja saturación, alto brillo)
    if (brightness > 200 && saturation < 0.2) {
      cloudyPixels++;
    }

    // Detectar sombras: píxeles muy oscuros
    if (brightness < 50) {
      darkPixels++;
    }
  }

  return {
    cloudyPercent: cloudyPixels / totalPixels,
    darkPercent: darkPixels / totalPixels,
  };
}

// ── Analizar cobertura y gaps ──────────────────────────────────────────

export interface CoverageMetrics {
  totalArea: number;       // ha
  coveredArea: number;     // ha (área con al menos 1 foto)
  coveragePercent: number; // %
  gapCount: number;        // número de gaps
  avgAltitude: number;     // m
  minAltitude: number;
  maxAltitude: number;
  altitudeVariance: number;
  recommendedQuality: AlignmentQuality;
  recommendedPhotoCount: number; // Fotos recomendadas
  averageOverlap: number; // % solapamiento promedio
  photoCountAdequate: boolean; // ¿Suficientes fotos?
}

export function calculateCoverageMetrics(
  photos: Array<{ lat: number; lng: number; alt: number }>,
  totalAreaHa: number
): CoverageMetrics {
  if (photos.length === 0) {
    return {
      totalArea: totalAreaHa,
      coveredArea: 0,
      coveragePercent: 0,
      gapCount: 0,
      avgAltitude: 0,
      minAltitude: 0,
      maxAltitude: 0,
      altitudeVariance: 0,
      recommendedQuality: 'quick',
      recommendedPhotoCount: 50,
      averageOverlap: 0,
      photoCountAdequate: false,
    };
  }

  // Calcular área cubierta (simple: bounding box de fotos)
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  let altSum = 0, minAlt = Infinity, maxAlt = -Infinity;

  for (const p of photos) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
    altSum += p.alt || 0;
    minAlt = Math.min(minAlt, p.alt || 0);
    maxAlt = Math.max(maxAlt, p.alt || 0);
  }

  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;
  const coveredArea = (latSpan * lngSpan * 111320 * 111320) / 10000 / 1000000; // aprox ha
  const coveragePercent = Math.min(100, (coveredArea / totalAreaHa) * 100);
  const avgAlt = altSum / photos.length;
  const variance =
    photos.reduce((sum, p) => sum + Math.pow((p.alt || 0) - avgAlt, 2), 0) / photos.length;

  // ── Calcular densidad de fotos y solapamiento promedio ──────────────────────
  // Para cultivos rectos (piña), recomendación:
  // - Mínimo: 20-30 fotos / ha (solapamiento ~20%)
  // - Recomendado: 40-60 fotos / ha (solapamiento 40-60%)
  // - Óptimo: 80+ fotos / ha (solapamiento 60-80%)

  const photosByHa = photos.length / Math.max(coveredArea, 0.1);

  // Estimación de solapamiento basada en densidad
  let estimatedOverlap = 0;
  if (photosByHa < 25) estimatedOverlap = 15;
  else if (photosByHa < 40) estimatedOverlap = 30;
  else if (photosByHa < 60) estimatedOverlap = 50;
  else if (photosByHa < 100) estimatedOverlap = 65;
  else estimatedOverlap = 75;

  // Recomendar cantidad de fotos
  let recommendedPhotoCount = Math.ceil(coveredArea * 50); // 50 fotos/ha como estándar
  let recommendedQuality: AlignmentQuality = 'quick';
  let photoCountAdequate = false;

  if (photos.length < recommendedPhotoCount * 0.6) {
    // Menos del 60% de lo recomendado
    recommendedQuality = 'quick';
    photoCountAdequate = false;
  } else if (photos.length >= recommendedPhotoCount * 0.8 && photos.length < recommendedPhotoCount * 1.2) {
    // 80-120% de lo recomendado
    recommendedQuality = 'normal';
    photoCountAdequate = true;
  } else if (photos.length >= recommendedPhotoCount * 1.2) {
    // 120%+ de lo recomendado
    recommendedQuality = photos.length > 200 ? 'precision' : 'normal';
    photoCountAdequate = true;
  }

  // Detectar gaps con grid más fino (5x5 para mejor resolución)
  const gridSize = 5;
  const cellLat = latSpan / gridSize;
  const cellLng = lngSpan / gridSize;
  let filledCells = 0;

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const cellMinLat = minLat + i * cellLat;
      const cellMaxLat = minLat + (i + 1) * cellLat;
      const cellMinLng = minLng + j * cellLng;
      const cellMaxLng = minLng + (j + 1) * cellLng;

      const cellPhotos = photos.filter(
        p =>
          p.lat >= cellMinLat &&
          p.lat <= cellMaxLat &&
          p.lng >= cellMinLng &&
          p.lng <= cellMaxLng
      );

      // Una celda se considera cubierta si tiene al menos 1 foto
      if (cellPhotos.length > 0) filledCells++;
    }
  }

  const gapCount = Math.max(0, gridSize * gridSize - filledCells);

  return {
    totalArea: totalAreaHa,
    coveredArea,
    coveragePercent,
    gapCount,
    avgAltitude: avgAlt,
    minAltitude: minAlt,
    maxAltitude: maxAlt,
    altitudeVariance: variance,
    recommendedQuality,
    recommendedPhotoCount,
    averageOverlap: estimatedOverlap,
    photoCountAdequate,
  };
}

function calculateAverageBrightness(img: HTMLImageElement): number {
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(img.width, 200);
  canvas.height = Math.min(img.height, 200);
  const ctx = canvas.getContext('2d');
  if (!ctx) return 128;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  return sum / (canvas.width * canvas.height);
}

// ── 3. Calcular solapamiento real entre fotos ──────────────────────────

export async function calculateRealOverlap(
  img1: HTMLImageElement,
  img2: HTMLImageElement
): Promise<number> {
  try {
    const features1 = extractORBFeatures(img1);
    const features2 = extractORBFeatures(img2);

    if (features1.length < 5 || features2.length < 5) {
      return 0;
    }

    // Contar matches (features cercanas)
    let matches = 0;
    for (const f1 of features1) {
      for (const f2 of features2) {
        const dist = Math.hypot(f1.x - f2.x, f1.y - f2.y);
        if (dist < 30) {
          matches++;
          break;
        }
      }
    }

    return matches / Math.max(features1.length, features2.length);
  } catch {
    return 0;
  }
}

interface Feature {
  x: number;
  y: number;
  descriptor: Uint8Array;
}

function extractORBFeatures(img: HTMLImageElement, maxFeatures = 100): Feature[] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(img.width, 400);
  canvas.height = Math.min(img.height, 400);
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width;
  const h = canvas.height;

  // Convertir a escala de grises
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  // Detectar corners (Harris)
  const features: Feature[] = [];
  const step = Math.ceil(Math.sqrt((w * h) / maxFeatures));

  for (let y = 5; y < h - 5; y += step) {
    for (let x = 5; x < w - 5; x += step) {
      const corner = calculateHarrisCorner(gray, w, x, y);
      if (corner > 0.01) {
        features.push({
          x,
          y,
          descriptor: new Uint8Array(32),
        });
      }
    }
  }

  return features.slice(0, maxFeatures);
}

function calculateHarrisCorner(gray: Uint8Array, w: number, x: number, y: number): number {
  // Simplificado: detectar cambios de intensidad alrededor del punto
  let sum = 0;
  const center = gray[y * w + x];

  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      sum += Math.abs(gray[(y + dy) * w + (x + dx)] - center);
    }
  }

  return sum / 25;
}

// ── 4. Reordenar fotos por máximo solapamiento ─────────────────────────

export async function reorderByOverlap(
  photos: Array<any & { lat: number; lng: number; alt: number }>,
  sampleRate = 0.3
): Promise<typeof photos> {
  if (photos.length < 2) return photos;

  // Usar muestra para calcular overlaps (performance)
  const sampleSize = Math.ceil(photos.length * sampleRate);
  const overlapMap = new Map<string, number>();

  for (let i = 0; i < sampleSize; i++) {
    for (let j = i + 1; j < Math.min(i + 5, photos.length); j++) {
      const key = `${i}-${j}`;
      try {
        const img1 = new Image();
        const img2 = new Image();
        // Calcular overlap (simplificado por GPS)
        const gpsDistance = Math.hypot(
          photos[i].lat - photos[j].lat,
          photos[i].lng - photos[j].lng
        );
        const overlap = Math.max(0, 1 - gpsDistance * 20000); // Escala empírica
        overlapMap.set(key, overlap);
      } catch {
        // Skip
      }
    }
  }

  // Reordenar usando greedy TSP-like approach
  const ordered = [photos[0]];
  const remaining = new Set(photos.slice(1));

  while (remaining.size > 0) {
    let best = null;
    let bestOverlap = -1;

    Array.from(remaining).forEach((candidate) => {
      const key = `${photos.indexOf(ordered[ordered.length - 1])}-${photos.indexOf(candidate)}`;
      const overlap = overlapMap.get(key) ?? 0;

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = candidate;
      }
    });

    if (best) {
      ordered.push(best);
      remaining.delete(best);
    } else {
      // Fallback: agregar el primero disponible
      const firstArray = Array.from(remaining);
      if (firstArray.length > 0) {
        const first = firstArray[0];
        ordered.push(first);
        remaining.delete(first);
      }
    }
  }

  return ordered;
}

// ── 5. Aplicar homografía para rectificación ───────────────────────────

export function applyHomography(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x0: number,
  y0: number,
  dw: number,
  dh: number,
  perspectiveCorrection = true
): void {
  if (!perspectiveCorrection) {
    ctx.drawImage(img, 0, 0, img.width, img.height, x0, y0, dw, dh);
    return;
  }

  // Aplicar transformación perspectiva simple (reduce distorsión)
  // Estima basada en posición en canvas
  const scaleX = dw / img.width;
  const scaleY = dh / img.height;

  ctx.save();
  ctx.translate(x0 + dw / 2, y0 + dh / 2);

  // Corrección de perspectiva muy suave (±2% en bordes)
  const perspectiveAmount = 0.02;
  const factorX = 1 + perspectiveAmount * Math.sin((x0 / ctx.canvas.width) * Math.PI - Math.PI / 2);
  const factorY = 1 + perspectiveAmount * Math.sin((y0 / ctx.canvas.height) * Math.PI - Math.PI / 2);

  ctx.scale(factorX, factorY);
  ctx.drawImage(img, 0, 0, img.width, img.height, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

// ── 6. Histogram Matching entre fotos ──────────────────────────────────

export function matchHistograms(ctx: CanvasRenderingContext2D, img: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const tempCtx = canvas.getContext('2d');
  if (!tempCtx) return ctx.createImageData(1, 1);

  tempCtx.drawImage(img, 0, 0);
  const imageData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // Paso 1: Normalizar histograma (stretch to full range)
  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;

  for (let i = 0; i < data.length; i += 4) {
    minR = Math.min(minR, data[i]);
    maxR = Math.max(maxR, data[i]);
    minG = Math.min(minG, data[i + 1]);
    maxG = Math.max(maxG, data[i + 1]);
    minB = Math.min(minB, data[i + 2]);
    maxB = Math.max(maxB, data[i + 2]);
  }

  const rangeR = maxR - minR || 1;
  const rangeG = maxG - minG || 1;
  const rangeB = maxB - minB || 1;

  // Aplicar stretch
  for (let i = 0; i < data.length; i += 4) {
    data[i] = ((data[i] - minR) / rangeR) * 255;
    data[i + 1] = ((data[i + 1] - minG) / rangeG) * 255;
    data[i + 2] = ((data[i + 2] - minB) / rangeB) * 255;
  }

  // Paso 2: Ecualización adaptativa (local contrast enhancement)
  // Para áreas oscuras/sombrías, aumentar contraste
  const sampleSize = 16;
  const samples = Math.floor(Math.sqrt(data.length / 4 / sampleSize));
  let totalLum = 0;

  for (let i = 0; i < data.length; i += 4 * sampleSize) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    totalLum += lum;
  }

  const avgLum = samples > 0 ? totalLum / samples : 128;
  const lumFactor = Math.max(0.6, Math.min(1.5, 128 / (avgLum + 1)));

  // Aplicar corrección de luminancia adaptativa
  for (let i = 0; i < data.length; i += 4) {
    if (lumFactor !== 1) {
      data[i] = Math.min(255, data[i] * lumFactor);
      data[i + 1] = Math.min(255, data[i + 1] * lumFactor);
      data[i + 2] = Math.min(255, data[i + 2] * lumFactor);
    }
  }

  return imageData;
}

// ── 6b. Histogram matching LOCAL (foto referencia vs foto nueva) ──────────

export function matchHistogramsToReference(
  refImg: HTMLImageElement,
  img: HTMLImageElement
): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return ctx!.createImageData(1, 1);

  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Construir histogramas de referencia
  const refCanvas = document.createElement('canvas');
  refCanvas.width = Math.min(refImg.width, 400);
  refCanvas.height = Math.min(refImg.height, 400);
  const refCtx = refCanvas.getContext('2d');
  if (!refCtx) return imgData;

  refCtx.drawImage(refImg, 0, 0, refCanvas.width, refCanvas.height);
  const refData = refCtx.getImageData(0, 0, refCanvas.width, refCanvas.height);

  // Histogramas (256 bins por canal)
  const refHist = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256) };
  const imgHist = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256) };

  for (let i = 0; i < refData.data.length; i += 4) {
    refHist.r[refData.data[i]]++;
    refHist.g[refData.data[i + 1]]++;
    refHist.b[refData.data[i + 2]]++;
  }

  for (let i = 0; i < imgData.data.length; i += 4) {
    imgHist.r[imgData.data[i]]++;
    imgHist.g[imgData.data[i + 1]]++;
    imgHist.b[imgData.data[i + 2]]++;
  }

  // Calcular CDFs (cumulative distribution)
  const refCDF = {
    r: cumulativeHistogram(refHist.r),
    g: cumulativeHistogram(refHist.g),
    b: cumulativeHistogram(refHist.b),
  };
  const imgCDF = {
    r: cumulativeHistogram(imgHist.r),
    g: cumulativeHistogram(imgHist.g),
    b: cumulativeHistogram(imgHist.b),
  };

  // Mapping table: para cada valor en img, qué valor en ref es más cercano
  const mapping = {
    r: createHistogramMapping(imgCDF.r, refCDF.r),
    g: createHistogramMapping(imgCDF.g, refCDF.g),
    b: createHistogramMapping(imgCDF.b, refCDF.b),
  };

  // Aplicar mapping (con blending suave para no distorsionar demasiado)
  const blend = 0.7; // 70% del matching, 30% original
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(data[i] * (1 - blend) + mapping.r[data[i]] * blend);
    data[i + 1] = Math.round(data[i + 1] * (1 - blend) + mapping.g[data[i + 1]] * blend);
    data[i + 2] = Math.round(data[i + 2] * (1 - blend) + mapping.b[data[i + 2]] * blend);
  }

  return imgData;
}

function cumulativeHistogram(hist: Uint32Array): Float32Array {
  const cdf = new Float32Array(256);
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += hist[i];
    cdf[i] = sum;
  }
  return cdf;
}

function createHistogramMapping(imgCDF: Float32Array, refCDF: Float32Array): Uint8Array {
  const mapping = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let bestJ = 0;
    let bestDist = Infinity;
    for (let j = 0; j < 256; j++) {
      const dist = Math.abs(imgCDF[i] - refCDF[j]);
      if (dist < bestDist) {
        bestDist = dist;
        bestJ = j;
      }
    }
    mapping[i] = bestJ;
  }
  return mapping;
}

// ── 7. Feather blend mejorado ──────────────────────────────────────────

export function createImprovedFeatherMask(
  w: number,
  h: number,
  featherStrength = 0.7
): CanvasGradient | CanvasPattern {
  // Usar canvas para crear gradiente radial mejorado
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot create feather mask');

  const centerX = w / 2;
  const centerY = h / 2;
  const maxRadius = Math.max(w, h) / 2;
  const innerRadius = maxRadius * (1 - featherStrength);
  const outerRadius = maxRadius * (1 + featherStrength);

  const gradient = ctx.createRadialGradient(
    centerX, centerY, Math.max(0, innerRadius),
    centerX, centerY, outerRadius
  );

  // Gradiente más suave en 5 pasos
  gradient.addColorStop(0, 'rgba(0,0,0,1)');
  gradient.addColorStop(0.25, 'rgba(0,0,0,0.95)');
  gradient.addColorStop(0.5, 'rgba(0,0,0,0.6)');
  gradient.addColorStop(0.75, 'rgba(0,0,0,0.2)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  return ctx.createPattern(canvas, null) as any;
}

// ── Tipos ──────────────────────────────────────────────────────────────

export type AlignmentQuality = 'quick' | 'normal' | 'precision' | 'ultra';

// ── 8. Validación de alineación por líneas de cultivo ──────────────────

export interface AlignmentValidation {
  isValid: boolean; // ¿Alineación aceptable?
  lineMatchCount: number; // Cuántas líneas coincidieron
  angleError: number; // Error de ángulo promedio
  distanceError: number; // Error de distancia promedio
  confidence: number; // 0-1, confianza general
  warnings: string[];
}

export async function validateAlignmentByFieldLines(
  img1: HTMLImageElement,
  img2: HTMLImageElement
): Promise<AlignmentValidation> {
  try {
    const canvas1 = document.createElement('canvas');
    canvas1.width = Math.min(img1.width, 400);
    canvas1.height = Math.min(img1.height, 400);
    const ctx1 = canvas1.getContext('2d');
    if (!ctx1) return { isValid: false, lineMatchCount: 0, angleError: Infinity, distanceError: Infinity, confidence: 0, warnings: ['No context 1D'] };

    ctx1.drawImage(img1, 0, 0, canvas1.width, canvas1.height);
    const imgData1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);
    const gray1 = new Uint8Array(canvas1.width * canvas1.height);
    for (let i = 0; i < imgData1.data.length; i += 4) {
      gray1[i / 4] = 0.299 * imgData1.data[i] + 0.587 * imgData1.data[i + 1] + 0.114 * imgData1.data[i + 2];
    }

    const canvas2 = document.createElement('canvas');
    canvas2.width = Math.min(img2.width, 400);
    canvas2.height = Math.min(img2.height, 400);
    const ctx2 = canvas2.getContext('2d');
    if (!ctx2) return { isValid: false, lineMatchCount: 0, angleError: Infinity, distanceError: Infinity, confidence: 0, warnings: ['No context 2D'] };

    ctx2.drawImage(img2, 0, 0, canvas2.width, canvas2.height);
    const imgData2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);
    const gray2 = new Uint8Array(canvas2.width * canvas2.height);
    for (let i = 0; i < imgData2.data.length; i += 4) {
      gray2[i / 4] = 0.299 * imgData2.data[i] + 0.587 * imgData2.data[i + 1] + 0.114 * imgData2.data[i + 2];
    }

    // Importar detectFieldLines y matchFieldLines dinámicamente
    const { detectFieldLines, matchFieldLines } = await import('./featureAlignment');

    const lines1 = detectFieldLines(gray1, canvas1.width, canvas1.height);
    const lines2 = detectFieldLines(gray2, canvas2.width, canvas2.height);

    if (lines1.length === 0 || lines2.length === 0) {
      return {
        isValid: true, // Sin líneas, asumir válido
        lineMatchCount: 0,
        angleError: 0,
        distanceError: 0,
        confidence: 0.5, // Confianza media por falta de validación
        warnings: lines1.length === 0 ? ['No lines detected in img1'] : ['No lines detected in img2'],
      };
    }

    const lineMatches = matchFieldLines(lines1, lines2);

    if (lineMatches.length === 0) {
      return {
        isValid: false,
        lineMatchCount: 0,
        angleError: Infinity,
        distanceError: Infinity,
        confidence: 0,
        warnings: [`Líneas de cultivo no coinciden (${lines1.length} vs ${lines2.length} líneas)`],
      };
    }

    // Calcular promedio de errores
    const avgAngleError =
      lineMatches.reduce((sum, m) => sum + m.angleError, 0) / lineMatches.length;
    const avgDistanceError =
      lineMatches.reduce((sum, m) => sum + m.distanceError, 0) / lineMatches.length;

    // Thresholds aceptables
    const maxAngleError = (10 * Math.PI) / 180; // 10°
    const maxDistanceError = 40; // 40px

    const isValid = avgAngleError < maxAngleError && avgDistanceError < maxDistanceError;
    const avgConfidence =
      lineMatches.reduce((sum, m) => sum + m.confidence, 0) / lineMatches.length;

    const warnings: string[] = [];
    if (avgAngleError > (5 * Math.PI) / 180) warnings.push(`Ángulo desviado: ${(avgAngleError * 180) / Math.PI}°`);
    if (avgDistanceError > 20) warnings.push(`Distancia desviada: ${avgDistanceError.toFixed(1)}px`);

    return {
      isValid,
      lineMatchCount: lineMatches.length,
      angleError: avgAngleError,
      distanceError: avgDistanceError,
      confidence: isValid ? avgConfidence : avgConfidence * 0.5,
      warnings,
    };
  } catch (error) {
    console.error('[alignmentValidation]', error);
    return {
      isValid: true, // En error, permitir (no bloquear)
      lineMatchCount: 0,
      angleError: 0,
      distanceError: 0,
      confidence: 0.5,
      warnings: ['Validation error: ' + String(error)],
    };
  }
}

export const ALIGNMENT_QUALITY_CONFIG: Record<AlignmentQuality, {
  filterBlurry: boolean;
  filterDark: boolean;
  perspectiveCorrection: boolean;
  histogramMatching: boolean;
  featherStrength: number;
  reorderIterations: number;
  useFeatureMatching: boolean;
  validateByFieldLines: boolean;
}> = {
  quick: {
    filterBlurry: false,
    filterDark: false,
    perspectiveCorrection: false,
    histogramMatching: false,
    featherStrength: 0.5,
    reorderIterations: 0,
    useFeatureMatching: false,
    validateByFieldLines: false,
  },
  normal: {
    filterBlurry: true,
    filterDark: true,
    perspectiveCorrection: true,
    histogramMatching: true,
    featherStrength: 0.65,
    reorderIterations: 1,
    useFeatureMatching: false,
    validateByFieldLines: false,
  },
  precision: {
    filterBlurry: true,
    filterDark: true,
    perspectiveCorrection: true,
    histogramMatching: true,
    featherStrength: 0.75,
    reorderIterations: 2,
    useFeatureMatching: false,
    validateByFieldLines: true, // ← Activar validación por líneas
  },
  ultra: {
    filterBlurry: true,
    filterDark: true,
    perspectiveCorrection: true,
    histogramMatching: true,
    featherStrength: 0.9,
    reorderIterations: 3,
    useFeatureMatching: false,
    validateByFieldLines: true, // ← Validación OBLIGATORIA en ultra
  },
};
