/**
 * Feature Matching & Alineación Precisa para Mosaicos
 * - Detecta características en fotos (bordes, líneas de cultivo)
 * - Calcula alineación sub-píxel entre fotos adyacentes
 * - Detecta líneas de siembra automáticamente
 * - Aplica transformaciones de homografía
 */

interface Feature {
  x: number;
  y: number;
  scale: number;
  orientation: number;
  descriptor: number[];
}

interface Match {
  feature1: Feature;
  feature2: Feature;
  distance: number;
}

interface Homography {
  matrix: number[][];
  inliers: Match[];
  quality: number; // 0-1, qué tan buena es la alineación
}

// ── 1. Detectar características en foto (FAST corners + BRIEF descriptor) ──

export function extractFeatures(img: HTMLImageElement, maxFeatures = 200): Feature[] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(img.width, 800);
  canvas.height = Math.min(img.height, 800);
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = toGrayscale(imageData);

  // Detectar corners FAST
  const corners = detectFASTCorners(gray, canvas.width, canvas.height);

  // Ordenar por respuesta de corner
  corners.sort((a, b) => b.response - a.response);
  const topCorners = corners.slice(0, maxFeatures);

  // Calcular descriptores BRIEF
  const features: Feature[] = topCorners.map(corner => ({
    x: corner.x,
    y: corner.y,
    scale: 1,
    orientation: 0,
    descriptor: computeBRIEFDescriptor(gray, canvas.width, corner.x, corner.y),
  }));

  return features;
}

function toGrayscale(imageData: ImageData): Uint8Array {
  const gray = new Uint8Array(imageData.data.length / 4);
  const data = imageData.data;

  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  return gray;
}

interface Corner {
  x: number;
  y: number;
  response: number;
}

function detectFASTCorners(gray: Uint8Array, w: number, h: number): Corner[] {
  const corners: Corner[] = [];
  const threshold = 30;
  const step = 3; // Buscar cada 3 píxeles para velocidad

  for (let y = 10; y < h - 10; y += step) {
    for (let x = 10; x < w - 10; x += step) {
      const center = gray[y * w + x];

      // Círculo de 16 píxeles alrededor (radio 3)
      const circle = [
        gray[(y - 3) * w + x], gray[(y - 3) * w + (x + 1)], gray[(y - 2) * w + (x + 2)],
        gray[y * w + (x + 3)], gray[(y + 1) * w + (x + 3)], gray[(y + 2) * w + (x + 2)],
        gray[(y + 3) * w + x], gray[(y + 3) * w + (x - 1)], gray[(y + 2) * w + (x - 2)],
        gray[y * w + (x - 3)], gray[(y - 1) * w + (x - 3)], gray[(y - 2) * w + (x - 2)],
      ];

      let brightCount = 0;
      let darkCount = 0;

      for (const p of circle) {
        if (p > center + threshold) brightCount++;
        else if (p < center - threshold) darkCount++;
      }

      if (brightCount >= 9 || darkCount >= 9) {
        // Es un corner
        const response = Math.max(brightCount, darkCount);
        corners.push({ x, y, response });
      }
    }
  }

  return corners;
}

function computeBRIEFDescriptor(gray: Uint8Array, w: number, x: number, y: number): number[] {
  const descriptor: number[] = [];
  const pairsCount = 32; // 32 bits

  // Pares de puntos para comparar (precomputed)
  const pairs = generateBRIEFPairs(pairsCount);

  for (const [p1, p2] of pairs) {
    const x1 = x + p1[0];
    const y1 = y + p1[1];
    const x2 = x + p2[0];
    const y2 = y + p2[1];

    // Bounds check
    if (
      x1 < 0 || x1 >= w || y1 < 0 || y1 >= w ||
      x2 < 0 || x2 >= w || y2 < 0 || y2 >= w
    ) {
      descriptor.push(0);
      continue;
    }

    const v1 = gray[y1 * w + x1];
    const v2 = gray[y2 * w + x2];

    descriptor.push(v1 > v2 ? 1 : 0);
  }

  return descriptor;
}

// Pares BRIEF predefinidos (fijos, no aleatorios) para consistencia
const BRIEF_PAIRS_CACHE: Array<[[number, number], [number, number]]> | null = null;

function generateBRIEFPairs(count: number): Array<[[number, number], [number, number]]> {
  // Si se solicitan pares y no hemos cachéado, generar determinísticamente
  const pairs: Array<[[number, number], [number, number]]> = [];
  const radius = 10;

  // Usar seed determinístico basado en el índice
  // Esto asegura que siempre generamos los mismos pares
  for (let i = 0; i < count; i++) {
    // Pseudo-random determinístico: usar sine para generar valores "aleatorios" pero reproducibles
    const a = Math.sin(i * 12.9898) * 43758.5453;
    const b = Math.sin((i + 1) * 78.233) * 43758.5453;
    const c = Math.sin((i + 2) * 45.164) * 43758.5453;
    const d = Math.sin((i + 3) * 94.673) * 43758.5453;

    const x1 = Math.floor(((a - Math.floor(a)) * 2 * radius) - radius);
    const y1 = Math.floor(((b - Math.floor(b)) * 2 * radius) - radius);
    const x2 = Math.floor(((c - Math.floor(c)) * 2 * radius) - radius);
    const y2 = Math.floor(((d - Math.floor(d)) * 2 * radius) - radius);

    pairs.push([[x1, y1], [x2, y2]]);
  }

  return pairs;
}

// ── 2. Matching de features entre dos imágenes ──

export function matchFeatures(features1: Feature[], features2: Feature[]): Match[] {
  const matches: Match[] = [];
  const threshold = 0.6; // MÁS ESTRICTO: 0.7 → 0.6 (Lowe's ratio test)
                         // Solo matches muy confiables

  for (const f1 of features1) {
    let bestMatch: Feature | null = null;
    let bestDistance = Infinity;
    let secondBestDistance = Infinity;

    for (const f2 of features2) {
      const dist = hammingDistance(f1.descriptor, f2.descriptor);

      if (dist < bestDistance) {
        secondBestDistance = bestDistance;
        bestDistance = dist;
        bestMatch = f2;
      } else if (dist < secondBestDistance) {
        secondBestDistance = dist;
      }
    }

    // Lowe's ratio test: MÁS SELECTIVO
    // Rechaza matches que no son claramente mejores que la segunda opción
    if (bestMatch && bestDistance / secondBestDistance < threshold &&
        bestDistance < 20) { // También rechazar si distancia absoluta es muy alta
      matches.push({
        feature1: f1,
        feature2: bestMatch,
        distance: bestDistance,
      });
    }
  }

  return matches;
}

function hammingDistance(desc1: number[], desc2: number[]): number {
  let dist = 0;
  for (let i = 0; i < desc1.length; i++) {
    if (desc1[i] !== desc2[i]) dist++;
  }
  return dist;
}

// ── 3. Calcular Homografía (alineación de perspectiva) ──

export function calculateHomography(matches: Match[]): Homography {
  if (matches.length < 4) {
    return {
      matrix: identityMatrix(),
      inliers: [],
      quality: 0,
    };
  }

  // RANSAC para encontrar inliers
  // Threshold más liberal (10px) para imágenes aéreas donde pequeños errores GPS son normales
  const inliers = ransacHomography(matches, 1000, 10);

  if (inliers.length < 3) {
    // Intentar con threshold más tolerante
    console.log('[RANSAC] Primer intento falló, reintentando con threshold mayor...');
    const inliers2 = ransacHomography(matches, 500, 20);
    if (inliers2.length < 3) {
      // Si aun así falla, usar todos los matches
      console.log('[RANSAC] Usando todos los matches como fallback');
      const H = dltHomography(matches);
      const quality = 0.3; // Marcar como baja calidad
      return { matrix: H, inliers: matches, quality };
    }
    const H = dltHomography(inliers2);
    const quality = Math.min(1, inliers2.length / matches.length);
    return { matrix: H, inliers: inliers2, quality };
  }

  // Calcular homografía con inliers usando DLT
  const H = dltHomography(inliers);
  const quality = Math.min(1, inliers.length / matches.length); // % de inliers

  return { matrix: H, inliers, quality };
}

function identityMatrix(): number[][] {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

function ransacHomography(
  matches: Match[],
  iterations: number,
  threshold: number
): Match[] {
  let bestInliers: Match[] = [];

  // Estrategia híbrida: primero intentar con los mejores matches
  // Luego con muestreo aleatorio
  const sortedByDistance = [...matches].sort((a, b) => a.distance - b.distance);
  const topMatches = sortedByDistance.slice(0, Math.min(10, matches.length));

  // Fase 1: Probar combinaciones de los mejores matches
  for (let i = 0; i < Math.min(iterations / 2, 100); i++) {
    const sample: Match[] = [];
    for (let j = 0; j < 4 && j < topMatches.length; j++) {
      const idx = Math.floor(Math.random() * topMatches.length);
      sample.push(topMatches[idx]);
    }

    if (sample.length < 3) break;

    const H = dltHomography(sample);
    let inliers: Match[] = [];

    for (const match of matches) {
      const transformed = applyHomography([match.feature1.x, match.feature1.y], H);
      const error = Math.hypot(transformed[0] - match.feature2.x, transformed[1] - match.feature2.y);
      if (error < threshold) {
        inliers.push(match);
      }
    }

    if (inliers.length > bestInliers.length) {
      bestInliers = inliers;
    }
  }

  // Fase 2: Muestreo aleatorio si aún no hay buenos inliers
  for (let i = Math.min(iterations / 2, 100); i < iterations; i++) {
    const sample = [];
    for (let j = 0; j < 4; j++) {
      sample.push(matches[Math.floor(Math.random() * matches.length)]);
    }

    const H = dltHomography(sample);
    let inliers: Match[] = [];

    for (const match of matches) {
      const transformed = applyHomography([match.feature1.x, match.feature1.y], H);
      const error = Math.hypot(transformed[0] - match.feature2.x, transformed[1] - match.feature2.y);
      if (error < threshold) {
        inliers.push(match);
      }
    }

    if (inliers.length > bestInliers.length) {
      bestInliers = inliers;
    }
  }

  return bestInliers;
}

function dltHomography(matches: Match[]): number[][] {
  // Calcular transformación afín usando TODOS los matches (mínimos cuadrados)
  // Para imágenes aéreas, transformación afín es suficiente (sin perspectiva completa)
  if (matches.length < 3) {
    return identityMatrix();
  }

  // Usar TODOS los matches para máxima robustez
  let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0;
  let sumXU = 0, sumYU = 0, sumXV = 0, sumYV = 0;
  let sumU = 0, sumV = 0;

  for (const m of matches) {
    const x = m.feature1.x;
    const y = m.feature1.y;
    const u = m.feature2.x;
    const v = m.feature2.y;

    sumX += x;
    sumY += y;
    sumX2 += x * x;
    sumY2 += y * y;
    sumXY += x * y;
    sumXU += x * u;
    sumYU += y * u;
    sumXV += x * v;
    sumYV += y * v;
    sumU += u;
    sumV += v;
  }

  const n = matches.length;

  // Sistema: [x y 1] * [a b tx]^T = u
  //          [x y 1] * [c d ty]^T = v
  // Resolver con mínimos cuadrados: A^T*A*p = A^T*b

  const detXX = n * sumX2 - sumX * sumX;
  const detYY = n * sumY2 - sumY * sumY;
  const detXY = n * sumXY - sumX * sumY;

  const detDenom = detXX * detYY - detXY * detXY;

  let a = 1, c = 0, tx = 0, b = 0, d = 1, ty = 0;

  if (Math.abs(detDenom) > 1e-8) {
    // Resolver para [a c tx]
    const nuU_a = n * sumXU - sumX * sumU;
    const nuU_c = n * sumYU - sumY * sumU;

    a = (nuU_a * detYY - nuU_c * detXY) / detDenom;
    c = (nuU_c * detXX - nuU_a * detXY) / detDenom;
    tx = (sumU - a * sumX - c * sumY) / n;

    // Resolver para [b d ty]
    const nuV_b = n * sumXV - sumX * sumV;
    const nuV_d = n * sumYV - sumY * sumV;

    b = (nuV_b * detYY - nuV_d * detXY) / detDenom;
    d = (nuV_d * detXX - nuV_b * detXY) / detDenom;
    ty = (sumV - b * sumX - d * sumY) / n;
  } else {
    // Determinante muy pequeño, usar translación simple
    tx = (sumU - sumX) / n;
    ty = (sumV - sumY) / n;
  }

  // !! VALIDACIÓN CRÍTICA: Rechazar transformaciones sospechosamente grandes
  // Para imágenes aéreas del mismo vuelo, esperamos transformaciones MÍNIMAS
  // - Escala: 0.95-1.05 (±5% variación normal)
  // - Offset: <50px (pequeño solapamiento variación)
  const maxScale = 1.1;   // ±10% es ya muy generoso para mismo vuelo
  const maxOffset = 100;  // Max 100px offset entre frames adyacentes
  const minScale = 0.9;   // No menos de 90% de escala

  const absA = Math.abs(a);
  const absD = Math.abs(d);
  const absTx = Math.abs(tx);
  const absTy = Math.abs(ty);

  // Si algo está fuera de limites, retornar identidad (mejor ignorar que distorsionar)
  if (absA > maxScale || absD > maxScale || absA < minScale || absD < minScale ||
      absTx > maxOffset || absTy > maxOffset) {
    console.warn(`[DLT] RECHAZADA: scale=(${a.toFixed(3)}, ${d.toFixed(3)}), offset=(${tx.toFixed(1)}, ${ty.toFixed(1)}) [limites: scale ${minScale}-${maxScale}, offset <${maxOffset}]`);
    return identityMatrix();
  }

  return [
    [a, c, tx],
    [b, d, ty],
    [0, 0, 1]
  ];
}

function applyHomography(point: number[], H: number[][]): number[] {
  const [x, y] = point;
  const x1 = H[0][0] * x + H[0][1] * y + H[0][2];
  const y1 = H[1][0] * x + H[1][1] * y + H[1][2];
  const w1 = H[2][0] * x + H[2][1] * y + H[2][2];

  return [x1 / w1, y1 / w1];
}

// ── 4. Detectar líneas de cultivo (Hough transform simplificado) ──

export interface FieldLine {
  angle: number; // en radianes
  distance: number; // distancia a origen
  strength: number; // 0-1, confianza
  points: Array<[number, number]>;
}

export function detectFieldLines(gray: Uint8Array, w: number, h: number): FieldLine[] {
  // Aplicar Sobel para detectar bordes
  const edges = sobelEdgeDetection(gray, w, h);

  // Hough transform para líneas
  const lines: FieldLine[] = [];
  const houghAccumulator = new Map<string, number>();
  const maxDist = Math.sqrt(w * w + h * h);
  const angleSteps = 180;
  const distSteps = Math.ceil(maxDist);

  // Votar en el espacio de Hough
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (edges[y * w + x] > 50) {
        // Si hay borde
        for (let angle = 0; angle < angleSteps; angle++) {
          const theta = (angle * Math.PI) / angleSteps;
          const dist = x * Math.cos(theta) + y * Math.sin(theta);
          const key = `${angle},${Math.round(dist)}`;
          houghAccumulator.set(key, (houghAccumulator.get(key) || 0) + 1);
        }
      }
    }
  }

  // Extraer líneas principales (picos en el acumulador)
  const votes = Array.from(houghAccumulator.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10); // Top 10 líneas

  for (const [key, vote] of votes) {
    const [angleStr, distStr] = key.split(',');
    const angle = (parseInt(angleStr) * Math.PI) / angleSteps;
    const distance = parseInt(distStr);
    const strength = Math.min(1, vote / 100); // Normalizar

    lines.push({
      angle,
      distance,
      strength,
      points: [],
    });
  }

  return lines;
}

// ── 4b. Line-based feature matching (alineación por líneas de cultivo) ──

export interface LineMatch {
  line1: FieldLine;
  line2: FieldLine;
  angleError: number; // radianes
  distanceError: number; // píxeles
  confidence: number; // 0-1
}

export function matchFieldLines(lines1: FieldLine[], lines2: FieldLine[]): LineMatch[] {
  const matches: LineMatch[] = [];
  const angleThreshold = (5 * Math.PI) / 180; // 5° de tolerancia
  const distanceThreshold = 50; // 50px de tolerancia

  for (const line1 of lines1) {
    // Buscar línea más cercana en la segunda imagen
    let bestLine: FieldLine | null = null;
    let bestAngleError = Infinity;
    let bestDistError = Infinity;

    for (const line2 of lines2) {
      const angleError = Math.abs(line1.angle - line2.angle);
      const distError = Math.abs(line1.distance - line2.distance);

      // Normalizar ángulo a [0, π/2] (líneas paralelas en ambas direcciones)
      const normalizedAngleError = Math.min(angleError, Math.PI - angleError);

      if (
        normalizedAngleError < angleThreshold &&
        distError < distanceThreshold &&
        normalizedAngleError < bestAngleError
      ) {
        bestAngleError = normalizedAngleError;
        bestDistError = distError;
        bestLine = line2;
      }
    }

    if (bestLine && bestAngleError < angleThreshold && bestDistError < distanceThreshold) {
      const confidence = (1 - bestAngleError / angleThreshold) * (1 - bestDistError / distanceThreshold);
      matches.push({
        line1,
        line2: bestLine,
        angleError: bestAngleError,
        distanceError: bestDistError,
        confidence: Math.max(0, confidence),
      });
    }
  }

  return matches;
}

// ── 4c. Calcular transformación desde line matches ──

export function calculateTransformFromLineMatches(lineMatches: LineMatch[]): {
  rotation: number;
  translationHint: [number, number];
  quality: number;
} {
  if (lineMatches.length === 0) {
    return { rotation: 0, translationHint: [0, 0], quality: 0 };
  }

  // Ángulo de rotación: promedio de los errores (si son consistentes)
  const rotations = lineMatches.map((m) => {
    const rawRotation = m.line2.angle - m.line1.angle;
    // Normalizar a [-π/2, π/2]
    if (rawRotation > Math.PI / 2) return rawRotation - Math.PI;
    if (rawRotation < -Math.PI / 2) return rawRotation + Math.PI;
    return rawRotation;
  });

  const avgRotation = rotations.reduce((a, b) => a + b, 0) / rotations.length;
  const rotationVariance =
    rotations.reduce((sum, r) => sum + Math.pow(r - avgRotation, 2), 0) / rotations.length;
  const rotationConfidence = Math.exp(-rotationVariance * 100); // Penalizar variancia alta

  // Traslación: promedio de distance errors (con signo)
  const translationHint: [number, number] = [
    lineMatches.reduce((sum, m) => sum + m.distanceError, 0) / lineMatches.length,
    0, // Estimación muy simplificada
  ];

  const quality =
    (rotationConfidence * lineMatches.reduce((sum, m) => sum + m.confidence, 0)) /
    lineMatches.length;

  return { rotation: avgRotation, translationHint, quality };
}

function sobelEdgeDetection(gray: Uint8Array, w: number, h: number): Uint8Array {
  const edges = new Uint8Array(gray.length);

  const Gx = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
  const Gy = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0, gy = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixel = gray[(y + ky) * w + (x + kx)];
          gx += pixel * Gx[ky + 1][kx + 1];
          gy += pixel * Gy[ky + 1][kx + 1];
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[y * w + x] = Math.min(255, magnitude);
    }
  }

  return edges;
}

// ── 5. Alineación sub-píxel basada en features ──

export interface AlignmentTransform {
  offset: [number, number]; // píxeles de desplazamiento
  scale: [number, number]; // escala XY
  rotation: number; // radianes
  homography: number[][];
  quality: number; // 0-1
}

export function calculateAlignment(
  img1: HTMLImageElement,
  img2: HTMLImageElement
): AlignmentTransform {
  const canvas1 = document.createElement('canvas');
  canvas1.width = Math.min(img1.width, 800);
  canvas1.height = Math.min(img1.height, 800);
  const ctx1 = canvas1.getContext('2d');
  if (!ctx1) return defaultTransform();

  ctx1.drawImage(img1, 0, 0, canvas1.width, canvas1.height);
  const imageData1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);

  const canvas2 = document.createElement('canvas');
  canvas2.width = Math.min(img2.width, 800);
  canvas2.height = Math.min(img2.height, 800);
  const ctx2 = canvas2.getContext('2d');
  if (!ctx2) return defaultTransform();

  ctx2.drawImage(img2, 0, 0, canvas2.width, canvas2.height);
  const imageData2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);

  // Extraer features
  const features1 = extractFeatures(img1);
  const features2 = extractFeatures(img2);

  // Matching
  const matches = matchFeatures(features1, features2);

  // Homografía
  const { matrix, quality } = calculateHomography(matches);

  // Extraer parámetros de la transformación
  const tx = matrix[0][2];
  const ty = matrix[1][2];
  const sx = Math.sqrt(matrix[0][0] * matrix[0][0] + matrix[0][1] * matrix[0][1]);
  const sy = Math.sqrt(matrix[1][0] * matrix[1][0] + matrix[1][1] * matrix[1][1]);
  const rotation = Math.atan2(matrix[1][0], matrix[0][0]);

  return {
    offset: [tx, ty],
    scale: [sx, sy],
    rotation,
    homography: matrix,
    quality,
  };
}

function defaultTransform(): AlignmentTransform {
  return {
    offset: [0, 0],
    scale: [1, 1],
    rotation: 0,
    homography: identityMatrix(),
    quality: 0,
  };
}

// ── 6. Aplicar transformación al dibujar ──

export function applyTransformToCanvas(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  transform: AlignmentTransform
): void {
  ctx.save();

  // Aplicar transformación
  ctx.translate(dx + dw / 2, dy + dh / 2);
  ctx.rotate(transform.rotation);
  ctx.scale(transform.scale[0], transform.scale[1]);
  ctx.translate(transform.offset[0] - dw / 2, transform.offset[1] - dh / 2);

  ctx.drawImage(img, 0, 0, dw, dh);
  ctx.restore();
}
