#!/usr/bin/env node
const fs = require("fs");
const zlib = require("zlib");

const SIZES = [16, 48, 128];
const BG_1 = [255, 77, 125];
const BG_2 = [255, 138, 61];
const BG_3 = [255, 209, 61];
const PAGE_BACK = [47, 216, 255];
const PAGE_FRONT = [255, 255, 255];
const INK = [35, 32, 74];
const PINK = [255, 77, 125];
const LINE = [232, 238, 248];
const LINE_2 = [255, 209, 222];
const WHITE = [255, 255, 255];
const CYAN = [0, 229, 255];

function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function createImage(size) {
  return new Uint8ClampedArray(size * size * 4);
}

function setPixel(img, size, x, y, rgba) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const idx = (y * size + x) * 4;
  const srcA = rgba[3] / 255;
  const dstA = img[idx + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return;

  const blend = (src, dst) => Math.round((src * srcA + dst * dstA * (1 - srcA)) / outA);
  img[idx] = blend(rgba[0], img[idx]);
  img[idx + 1] = blend(rgba[1], img[idx + 1]);
  img[idx + 2] = blend(rgba[2], img[idx + 2]);
  img[idx + 3] = Math.round(outA * 255);
}

function fillRect(img, size, x0, y0, x1, y1, rgba) {
  const ix0 = Math.max(0, Math.floor(x0));
  const iy0 = Math.max(0, Math.floor(y0));
  const ix1 = Math.min(size, Math.ceil(x1));
  const iy1 = Math.min(size, Math.ceil(y1));
  for (let y = iy0; y < iy1; y++) {
    for (let x = ix0; x < ix1; x++) {
      setPixel(img, size, x, y, rgba);
    }
  }
}

function pointInRoundedRect(x, y, x0, y0, x1, y1, r) {
  const innerX0 = x0 + r;
  const innerY0 = y0 + r;
  const innerX1 = x1 - r;
  const innerY1 = y1 - r;
  if (x >= innerX0 && x <= innerX1 && y >= y0 && y <= y1) return true;
  if (y >= innerY0 && y <= innerY1 && x >= x0 && x <= x1) return true;

  const dx = x < innerX0 ? innerX0 - x : x > innerX1 ? x - innerX1 : 0;
  const dy = y < innerY0 ? innerY0 - y : y > innerY1 ? y - innerY1 : 0;
  return dx * dx + dy * dy <= r * r;
}

function fillRoundedRect(img, size, x0, y0, x1, y1, r, rgba) {
  const ix0 = Math.max(0, Math.floor(x0));
  const iy0 = Math.max(0, Math.floor(y0));
  const ix1 = Math.min(size, Math.ceil(x1));
  const iy1 = Math.min(size, Math.ceil(y1));
  for (let y = iy0; y < iy1; y++) {
    for (let x = ix0; x < ix1; x++) {
      if (pointInRoundedRect(x + 0.5, y + 0.5, x0, y0, x1, y1, r)) {
        setPixel(img, size, x, y, rgba);
      }
    }
  }
}

function fillCircle(img, size, cx, cy, radius, rgba) {
  const x0 = Math.floor(cx - radius);
  const y0 = Math.floor(cy - radius);
  const x1 = Math.ceil(cx + radius);
  const y1 = Math.ceil(cy + radius);
  const r2 = radius * radius;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) {
        setPixel(img, size, x, y, rgba);
      }
    }
  }
}

function fillPolygon(img, size, points, rgba) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const ix0 = Math.max(0, Math.floor(minX));
  const iy0 = Math.max(0, Math.floor(minY));
  const ix1 = Math.min(size, Math.ceil(maxX));
  const iy1 = Math.min(size, Math.ceil(maxY));

  for (let y = iy0; y < iy1; y++) {
    for (let x = ix0; x < ix1; x++) {
      const inside = pointInPolygon(x + 0.5, y + 0.5, points);
      if (inside) {
        setPixel(img, size, x, y, rgba);
      }
    }
  }
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function strokeLine(img, size, x0, y0, x1, y1, width, rgba) {
  const minX = Math.floor(Math.min(x0, x1) - width);
  const minY = Math.floor(Math.min(y0, y1) - width);
  const maxX = Math.ceil(Math.max(x0, x1) + width);
  const maxY = Math.ceil(Math.max(y0, y1) + width);
  const vx = x1 - x0;
  const vy = y1 - y0;
  const len2 = vx * vx + vy * vy || 1;
  const half = width / 2;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5 - x0;
      const py = y + 0.5 - y0;
      let t = (px * vx + py * vy) / len2;
      t = clamp(t, 0, 1);
      const cx = x0 + vx * t;
      const cy = y0 + vy * t;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= half * half) {
        setPixel(img, size, x, y, rgba);
      }
    }
  }
}

function drawBackground(img, size) {
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const rgb =
      t < 0.5
        ? BG_1.map((v, i) => Math.round(lerp(v, BG_2[i], t / 0.5)))
        : BG_2.map((v, i) => Math.round(lerp(v, BG_3[i], (t - 0.5) / 0.5)));
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      img[idx] = rgb[0];
      img[idx + 1] = rgb[1];
      img[idx + 2] = rgb[2];
      img[idx + 3] = 255;
    }
  }
}

function drawIcon(size) {
  const img = createImage(size);
  drawBackground(img, size);
  const s = size / 128;

  // Accent circles
  fillCircle(img, size, 110 * s, 22 * s, 8 * s, [255, 255, 255, 46]);
  fillCircle(img, size, 27 * s, 107 * s, 9 * s, [0, 229, 255, 56]);

  // Soft page shadows
  fillRoundedRect(img, size, 20 * s, 38 * s, 94 * s, 122 * s, 16 * s, [0, 0, 0, 72]);
  fillRoundedRect(img, size, 42 * s, 12 * s, 116 * s, 96 * s, 16 * s, [0, 0, 0, 58]);

  // Pages
  fillRoundedRect(img, size, 20 * s, 38 * s, 94 * s, 122 * s, 16 * s, PAGE_BACK);
  fillRoundedRect(img, size, 42 * s, 12 * s, 116 * s, 96 * s, 16 * s, PAGE_FRONT);

  // Content lines and badge on the front page
  fillRoundedRect(img, size, 42 * s, 22 * s, 82 * s, 30 * s, 4 * s, LINE_2);
  fillRoundedRect(img, size, 42 * s, 38 * s, 72 * s, 46 * s, 4 * s, LINE);
  fillRoundedRect(img, size, 42 * s, 54 * s, 76 * s, 62 * s, 4 * s, LINE);
  fillRoundedRect(img, size, 42 * s, 70 * s, 64 * s, 78 * s, 4 * s, LINE);
  fillRoundedRect(img, size, 76 * s, 22 * s, 90 * s, 36 * s, 4 * s, PINK);
  fillPolygon(img, size, [
    [80 * s, 25.5 * s],
    [86 * s, 29.5 * s],
    [80 * s, 33.5 * s]
  ], WHITE);

  // Large centered M
  const cx = size / 2;
  const cy = size / 2;
  const stroke = 5 * s;
  const dark = INK;
  const white = WHITE;
  const top = 28 * s;
  const bottom = 98 * s;
  const left = 35 * s;
  const mid = 64 * s;
  const right = 93 * s;

  strokeLine(img, size, left, top, left, bottom, stroke * 1.15, dark);
  strokeLine(img, size, left + 1 * s, top + 1 * s, left + 1 * s, bottom - 1 * s, stroke * 0.75, white);
  strokeLine(img, size, left, top, mid - 1 * s, 73 * s, stroke * 1.15, dark);
  strokeLine(img, size, left + 1 * s, top + 1 * s, mid - 1 * s, 73 * s, stroke * 0.75, white);
  strokeLine(img, size, mid - 1 * s, 73 * s, right - 1 * s, top, stroke * 1.15, dark);
  strokeLine(img, size, mid - 1 * s, 73 * s, right - 1 * s, top + 1 * s, stroke * 0.75, white);
  strokeLine(img, size, right - 1 * s, top, right - 1 * s, bottom, stroke * 1.15, dark);
  strokeLine(img, size, right - 2 * s, top + 1 * s, right - 2 * s, bottom - 1 * s, stroke * 0.75, white);

  // Accent diamonds
  fillPolygon(img, size, [
    [62 * s, 96 * s],
    [68 * s, 90 * s],
    [74 * s, 96 * s],
    [68 * s, 102 * s]
  ], PINK);
  fillPolygon(img, size, [
    [74 * s, 96 * s],
    [78 * s, 92 * s],
    [82 * s, 96 * s],
    [78 * s, 100 * s]
  ], CYAN);

  return img;
}

function downsample(src, srcSize, dstSize) {
  const dst = createImage(dstSize);
  const scale = srcSize / dstSize;
  const block = scale * scale;
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      const x0 = Math.floor(x * scale);
      const y0 = Math.floor(y * scale);
      const x1 = Math.floor((x + 1) * scale);
      const y1 = Math.floor((y + 1) * scale);
      for (let sy = y0; sy < Math.max(y0 + 1, y1); sy++) {
        for (let sx = x0; sx < Math.max(x0 + 1, x1); sx++) {
          const idx = (sy * srcSize + sx) * 4;
          r += src[idx];
          g += src[idx + 1];
          b += src[idx + 2];
          a += src[idx + 3];
        }
      }
      const idx = (y * dstSize + x) * 4;
      dst[idx] = Math.round(r / block);
      dst[idx + 1] = Math.round(g / block);
      dst[idx + 2] = Math.round(b / block);
      dst[idx + 3] = Math.round(a / block);
    }
  }
  return dst;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(img, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < size; x++) {
      const srcIdx = (y * size + x) * 4;
      const dstIdx = rowStart + 1 + x * 4;
      raw[dstIdx] = img[srcIdx];
      raw[dstIdx + 1] = img[srcIdx + 1];
      raw[dstIdx + 2] = img[srcIdx + 2];
      raw[dstIdx + 3] = img[srcIdx + 3];
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function main() {
  const base = drawIcon(512);
  for (const size of SIZES) {
    const icon = size === 128 ? downsample(base, 512, 128) : downsample(base, 512, size);
    fs.writeFileSync(`icon${size}.png`, encodePng(icon, size));
    console.log(`Wrote icon${size}.png`);
  }
}

main();
