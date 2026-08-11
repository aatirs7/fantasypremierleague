// Generates the PWA icon set as PNGs with no image dependencies: raw RGBA
// buffers encoded straight through zlib. Design: floodlit purple field with
// a green pitch-circle mark. Full bleed so the same art works as maskable.
const { deflateSync } = require('node:zlib');
const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // no filter
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const ringR = size * 0.3;
  const ringW = size * 0.045;
  const dotR = size * 0.075;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const t = y / size;
      // Purple night gradient.
      let r = lerp(0x16, 0x0b, t);
      let g = lerp(0x0d, 0x07, t);
      let b = lerp(0x28, 0x14, t);
      // Soft green floodlight glow from the top.
      const gd = Math.hypot(x - c, y - size * 0.1) / size;
      const glow = Math.max(0, 0.5 - gd) * 0.5;
      r += 0x00 * glow;
      g += 0xe5 * glow * 0.35;
      b += 0x8c * glow * 0.2;
      // Center circle (pitch ring) in electric green.
      const d = Math.hypot(x - c, y - c);
      const onRing = Math.abs(d - ringR) < ringW;
      const onDot = d < dotR;
      // Halfway line through the ring.
      const onLine = Math.abs(y - c) < ringW * 0.7 && Math.abs(x - c) < size * 0.42;
      if (onRing || onDot || onLine) {
        r = 0x00;
        g = 0xe5;
        b = 0x8c;
      }
      px[i] = Math.min(255, Math.round(r));
      px[i + 1] = Math.min(255, Math.round(g));
      px[i + 2] = Math.min(255, Math.round(b));
      px[i + 3] = 255;
    }
  }
  return encodePng(size, px);
}

const root = join(__dirname, '..');
mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public', 'icon-192.png'), render(192));
writeFileSync(join(root, 'public', 'icon-512.png'), render(512));
writeFileSync(join(root, 'src', 'app', 'icon.png'), render(192));
writeFileSync(join(root, 'src', 'app', 'apple-icon.png'), render(180));
console.log('icons written');
