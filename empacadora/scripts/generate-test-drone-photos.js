/**
 * generate-test-drone-photos.js
 *
 * Genera imágenes de prueba con metadatos XMP de DJI para probar DronMosaico.
 * Crea archivos .JPG con contenido PNG (colores visibles) + XMP adjunto.
 * Chrome/Edge los renderiza correctamente porque hace sniffing de contenido.
 *
 * Ejecutar: node scripts/generate-test-drone-photos.js
 *
 * Ubicación: finca de piña en Upala, Costa Rica (~10.89°N, 85.01°W)
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── Configuración del vuelo simulado ──────────────────────────────────────────

const CONFIG = {
  baseLat:  10.8920,
  baseLng: -85.0140,
  altitude: 30,
  hfovDeg: 84,
  vfovDeg: 65,
  overlapPct: 0.75,
  cols: 6,
  rows: 4,
};

// ── Cálculo del espaciado ─────────────────────────────────────────────────────

const hfovRad = (CONFIG.hfovDeg * Math.PI) / 180;
const vfovRad = (CONFIG.vfovDeg * Math.PI) / 180;

const footprintW_m = 2 * CONFIG.altitude * Math.tan(hfovRad / 2);
const footprintH_m = 2 * CONFIG.altitude * Math.tan(vfovRad / 2);

const stepW_m = footprintW_m * (1 - CONFIG.overlapPct);
const stepH_m = footprintH_m * (1 - CONFIG.overlapPct);

const mPerDegLat = 111320;
const mPerDegLng = 111320 * Math.cos(CONFIG.baseLat * Math.PI / 180);

const stepLat = stepH_m / mPerDegLat;
const stepLng = stepW_m / mPerDegLng;

// ── PNG generator (puro Node.js, sin dependencias externas) ──────────────────

/**
 * Calcula CRC-32 para los chunks PNG
 */
function crc32(buf) {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (const byte of buf) crc = (table[(crc ^ byte) & 0xFF] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Construye un chunk PNG: length (4) + type (4) + data + CRC (4)
 */
function pngChunk(type, data) {
  const t    = Buffer.from(type, 'ascii');
  const len  = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

/**
 * Genera un PNG sólido de 32×32 px con el color RGB dado.
 * Formato RGB (3 bytes/píxel), sin compresión agresiva.
 */
function buildPNG(r, g, b, size = 32) {
  // Firma PNG
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: width, height, bit_depth=8, color_type=2 (RGB), compress=0, filter=0, interlace=0
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8]  = 8;  // bit depth
  ihdr[9]  = 2;  // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Datos de imagen: fila = byte de filtro (0x00 = None) + R,G,B por cada píxel
  const rowBuf = Buffer.alloc(1 + size * 3);
  rowBuf[0] = 0; // filter = None
  for (let x = 0; x < size; x++) {
    rowBuf[1 + x * 3]     = r;
    rowBuf[1 + x * 3 + 1] = g;
    rowBuf[1 + x * 3 + 2] = b;
  }
  // Todas las filas iguales
  const rawImage = Buffer.concat(Array.from({ length: size }, () => rowBuf));
  const compressed = zlib.deflateSync(rawImage, { level: 6 });

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Construir XMP de DJI ──────────────────────────────────────────────────────

function buildDJIXMP(lat, lng, alt, yaw) {
  return (
    '<?xpacket begin="\xEF\xBB\xBF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="DJI XMP v1.0">\n' +
    ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
    '  <rdf:Description rdf:about=""\n' +
    '   xmlns:drone-dji="http://www.dji.com/drone-dji/1.0/"\n' +
    `   drone-dji:Latitude="${lat.toFixed(7)}"\n` +
    `   drone-dji:Longitude="${lng.toFixed(7)}"\n` +
    `   drone-dji:RelativeAltitude="+${alt.toFixed(2)}"\n` +
    `   drone-dji:GimbalYawDegree="${yaw.toFixed(2)}"\n` +
    `   drone-dji:FlightYawDegree="${yaw.toFixed(2)}"\n` +
    '   drone-dji:FlightPitchDegree="0.00"\n' +
    '   drone-dji:FlightRollDegree="0.00"\n' +
    '  />\n' +
    ' </rdf:RDF>\n' +
    '</x:xmpmeta>\n' +
    '<?xpacket end="w"?>'
  );
}

/**
 * Combina el PNG + XMP como texto adjunto al final.
 * La mayoría de los decodificadores de imagen ignoran bytes extra después del IEND.
 * El parser XMP lee los primeros 128 KB buscando la cadena drone-dji:Latitude,
 * así que lo encontrará sin problema.
 */
function buildFileWithXMP(r, g, b, xmpStr) {
  const pngBuf = buildPNG(r, g, b);
  const xmpBuf = Buffer.from('\n' + xmpStr, 'utf8');
  return Buffer.concat([pngBuf, xmpBuf]);
}

// ── Generar fotos ─────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, 'test-dcim', '100MEDIA');
fs.mkdirSync(outDir, { recursive: true });

const totalPhotos = CONFIG.cols * CONFIG.rows;
let count = 0;

// Colores del tablero de ajedrez:
//   verde piña  (34, 197, 94)  ← filas/columnas pares
//   amarillo    (234, 179, 8)  ← filas/columnas impares
const VERDE    = [34,  197,  94];
const AMARILLO = [234, 179,   8];

for (let row = 0; row < CONFIG.rows; row++) {
  for (let col = 0; col < CONFIG.cols; col++) {
    count++;

    const lat = CONFIG.baseLat + (row - (CONFIG.rows - 1) / 2) * stepLat;
    const lng = CONFIG.baseLng + (col - (CONFIG.cols - 1) / 2) * stepLng;
    const yaw = (row % 2 === 0) ? 90 : 270;

    const [r, g, b] = (row + col) % 2 === 0 ? VERDE : AMARILLO;
    const xmp   = buildDJIXMP(lat, lng, CONFIG.altitude, yaw);
    const bytes = buildFileWithXMP(r, g, b, xmp);

    const filename = `DJI_${String(count).padStart(4, '0')}.JPG`;
    fs.writeFileSync(path.join(outDir, filename), bytes);

    process.stdout.write(`\r  Generando ${count}/${totalPhotos}: ${filename}`);
  }
}

console.log('\n');
console.log('─'.repeat(55));
console.log('  Fotos generadas:', totalPhotos);
console.log('  Colores:         verde / amarillo (tablero)');
console.log('  Carpeta:        ', outDir);
console.log('  Ubicación:       Upala, Costa Rica');
console.log(`  Altitud:         ${CONFIG.altitude} m`);
console.log(`  Footprint/foto:  ${footprintW_m.toFixed(1)} m × ${footprintH_m.toFixed(1)} m`);
console.log(`  Traslape:        ${CONFIG.overlapPct * 100}%`);
console.log(`  Área cubierta:  ~${((CONFIG.cols * stepW_m + footprintW_m) * (CONFIG.rows * stepH_m + footprintH_m) / 10000).toFixed(2)} ha`);
console.log('─'.repeat(55));
console.log('  Para probar: abrí "Dron → Mosaico" y seleccioná');
console.log('  la carpeta:  scripts/test-dcim');
console.log('─'.repeat(55));
