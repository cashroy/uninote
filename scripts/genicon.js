// Generates build/icon.png — a minimalist black rounded-square "notebook" mark.
// Pure Node (zlib), no image deps.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const S = 512;
const buf = Buffer.alloc(S * S * 4);

function set(x, y, r, g, b, a = 255) {
  const i = (y * S + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
}

// rounded-rect membership
function inRR(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
  const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    // transparent by default
    set(x, y, 0, 0, 0, 0);
    // black rounded tile
    if (inRR(x, y, 40, 40, 472, 472, 96)) set(x, y, 24, 24, 27, 255);
    // white "page" card, offset
    if (inRR(x, y, 150, 120, 380, 392, 26)) set(x, y, 250, 250, 250, 255);
    // spine accent (left edge of page)
    if (x >= 150 && x <= 168 && inRR(x, y, 150, 120, 380, 392, 26)) set(x, y, 24, 24, 27, 255);
    // three text lines
    const lineY = [190, 250, 310];
    for (const ly of lineY) {
      const w = ly === 310 ? 150 : 180;
      if (y >= ly && y <= ly + 16 && x >= 196 && x <= 196 + w) set(x, y, 180, 180, 185, 255);
    }
  }
}

// PNG encode
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

const CRC_TABLE = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
// raw with filter byte 0 per scanline
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  buf.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = path.join(__dirname, "..", "build");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "icon.png"), png);
console.log("wrote build/icon.png", png.length, "bytes");
