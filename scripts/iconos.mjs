/**
 * Genera los iconos PWA sin dependencias externas.
 * Dibuja el símbolo ₿ con geometría y supermuestreo 4x4 (bordes suaves),
 * y codifica el PNG a mano con zlib.
 *
 *   node scripts/iconos.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
fs.mkdirSync(OUT, { recursive: true });

const NARANJA = [0xf7, 0x93, 0x1a];
const OSCURO = [0x11, 0x11, 0x11];

/* ---------- geometría del glifo ₿, en coordenadas 0..1 ---------- */
const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const semiAnillo = (cx, cy, rOut, rIn) => (x, y) => {
  if (x < cx) return false;
  const d = Math.hypot(x - cx, y - cy);
  return d <= rOut && d >= rIn;
};
/* Ambos lóbulos comparten centro en el borde derecho del asta (x=0.45) y el mismo
   grosor de trazo (0.10), que es lo que hace que el cuenco cierre contra las barras. */
const glifo = [
  rect(0.35, 0.16, 0.45, 0.84),   // asta vertical
  rect(0.35, 0.16, 0.52, 0.26),   // barra superior
  rect(0.35, 0.74, 0.52, 0.84),   // barra inferior
  semiAnillo(0.45, 0.355, 0.195, 0.095), // cuenco superior: exterior 0.16→0.55
  semiAnillo(0.45, 0.645, 0.195, 0.095), // cuenco inferior: exterior 0.45→0.84
  rect(0.385, 0.06, 0.445, 0.17), // tick sup. izq.
  rect(0.505, 0.06, 0.565, 0.17), // tick sup. der.
  rect(0.385, 0.83, 0.445, 0.94), // tick inf. izq.
  rect(0.505, 0.83, 0.565, 0.94), // tick inf. der.
];
const enGlifo = (x, y) => glifo.some((f) => f(x, y));

/* esquina redondeada: fuera del radio en las cuatro esquinas => transparente */
const dentroRedondeado = (x, y, r) => {
  const cx = x < r ? r : x > 1 - r ? 1 - r : x;
  const cy = y < r ? r : y > 1 - r ? 1 - r : y;
  return (x === cx && y === cy) || Math.hypot(x - cx, y - cy) <= r;
};

/* ---------- render con supermuestreo ---------- */
function render(size, { radio = 0.22, escalaGlifo = 1, fondoCompleto = false }) {
  const S = 4, px = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let cobFondo = 0, cobGlifo = 0;
      for (let sj = 0; sj < S; sj++) {
        for (let si = 0; si < S; si++) {
          const x = (i + (si + 0.5) / S) / size;
          const y = (j + (sj + 0.5) / S) / size;
          if (fondoCompleto || dentroRedondeado(x, y, radio)) cobFondo++;
          // el glifo se escala respecto al centro
          const gx = 0.5 + (x - 0.5) / escalaGlifo;
          const gy = 0.5 + (y - 0.5) / escalaGlifo;
          if (enGlifo(gx, gy)) cobGlifo++;
        }
      }
      const T = S * S;
      const aFondo = cobFondo / T, aGlifo = (cobGlifo / T) * aFondo;
      const o = (j * size + i) * 4;
      for (let c = 0; c < 3; c++) {
        px[o + c] = Math.round(NARANJA[c] * (1 - aGlifo / (aFondo || 1)) + OSCURO[c] * (aGlifo / (aFondo || 1)));
      }
      px[o + 3] = Math.round(aFondo * 255);
    }
  }
  return px;
}

/* ---------- codificación PNG ---------- */
const TABLA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(tipo, datos) {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}
function png(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  const filas = Buffer.alloc(size * (size * 4 + 1));
  for (let j = 0; j < size; j++) {
    filas[j * (size * 4 + 1)] = 0; // filtro none
    Buffer.from(px.buffer, j * size * 4, size * 4).copy(filas, j * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(filas, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- salidas ---------- */
const salidas = [
  ["icon-192.png", 192, { radio: 0.22, escalaGlifo: 0.86 }],
  ["icon-512.png", 512, { radio: 0.22, escalaGlifo: 0.86 }],
  // maskable: fondo a sangre y glifo al 60% para sobrevivir al recorte circular
  ["icon-maskable-512.png", 512, { fondoCompleto: true, escalaGlifo: 0.6 }],
  // iOS recorta él mismo, así que va cuadrado completo
  ["apple-touch-icon.png", 180, { fondoCompleto: true, escalaGlifo: 0.82 }],
];
for (const [nombre, size, opts] of salidas) {
  const buf = png(size, render(size, opts));
  fs.writeFileSync(path.join(OUT, nombre), buf);
  console.log(`${nombre.padEnd(24)} ${size}x${size}  ${(buf.length / 1024).toFixed(1)} kB`);
}
