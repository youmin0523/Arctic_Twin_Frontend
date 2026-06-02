/**
 * buildGlobalMask.mjs  (단계 B)
 * landGrid.bin(0.05° 1바이트/셀)을 비트팩(1비트/셀)해 프론트 자산으로 출력.
 *   backend/data/coastline/landGrid.bin  →  frontend/public/data/landMaskGlobal.bin (+ .meta.json)
 *   node frontend/scripts/buildGlobalMask.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..', 'backend', 'data', 'coastline');
const OUT = join(__dirname, '..', 'public', 'data');

const meta = JSON.parse(readFileSync(join(SRC, 'landGrid.meta.json'), 'utf-8'));
const grid = new Uint8Array(readFileSync(join(SRC, 'landGrid.bin')));
const { cols, rows } = meta;
if (grid.length !== cols * rows) {
  console.error(`격자 크기 불일치: ${grid.length} != ${cols * rows}`);
  process.exit(1);
}

// 비트팩 (LSB-first)
const packed = new Uint8Array(Math.ceil(grid.length / 8));
let land = 0;
for (let i = 0; i < grid.length; i++) {
  if (grid[i]) { packed[i >> 3] |= 1 << (i & 7); land++; }
}

writeFileSync(join(OUT, 'landMaskGlobal.bin'), Buffer.from(packed));
writeFileSync(join(OUT, 'landMaskGlobal.meta.json'), JSON.stringify({
  res: meta.res, cols, rows, lonMin: -180, latMin: -90, bitOrder: 'lsb',
  bytes: packed.length, landCells: land,
}, null, 0));

console.log(`전역 마스크 출력: ${cols}×${rows} (0.05°), 육지셀 ${land}`);
console.log(`  landMaskGlobal.bin = ${(packed.length / 1e6).toFixed(2)} MB (비트팩)`);
