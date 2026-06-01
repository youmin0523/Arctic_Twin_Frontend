/**
 * repairRoutes.mjs  (단계 A: 자동 항로 보정 + 단계 B용 전역 격자 생성)
 * ===================================================================
 * 1) Natural Earth 10m 해안선을 0.05° 전역 육지 격자로 래스터화(scanline fill)
 * 2) 각 항로의 육지 관통 구간을 A* 해상 경로탐색으로 우회 웨이포인트 자동 삽입
 * 3) arcticRoutes.js 의 ROUTES 블록을 보정된 항로로 재기록
 * 4) 격자를 backend/data/coastline/landGrid.* 로 저장(런타임 단계 B 재사용)
 *
 *   node frontend/scripts/repairRoutes.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ROUTES } from '../src/data/arcticRoutes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COAST_DIR = join(__dirname, '..', '..', 'backend', 'data', 'coastline');
const ROUTES_FILE = join(__dirname, '..', 'src', 'data', 'arcticRoutes.js');

// ── 격자 정의 ──────────────────────────────────────────────────────
const RES = 0.05;
const COLS = Math.round(360 / RES); // 7200
const ROWS = Math.round(180 / RES); // 3600
const grid = new Uint8Array(COLS * ROWS); // 1 = 육지

const colOf = (lon) => Math.min(COLS - 1, Math.max(0, Math.floor((lon + 180) / RES)));
const rowOf = (lat) => Math.min(ROWS - 1, Math.max(0, Math.floor((lat + 90) / RES)));
const lonOfCol = (c) => -180 + (c + 0.5) * RES;
const latOfRow = (r) => -90 + (r + 0.5) * RES;
const isLandCell = (c, r) => (r < 0 || r >= ROWS || c < 0 || c >= COLS) ? false : grid[r * COLS + c] === 1;
const isLandLL = (lon, lat) => isLandCell(colOf(lon), rowOf(lat));

// ── 해안선 적재 + scanline 래스터화 ────────────────────────────────
function rasterize(file) {
  const gj = JSON.parse(readFileSync(join(COAST_DIR, file), 'utf-8'));
  let polyCount = 0;
  for (const feat of gj.features) {
    const g = feat.geometry;
    if (!g) continue;
    const multi = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    for (const poly of multi) {
      let ring = poly[0]; // 외곽만 (호수=육지로 처리 — 항해 불가라 무방)
      // 날짜변경선(±180)을 넘는 ring 검출 → 음수 경도를 +360 프레임으로 이동
      let crosses = false;
      for (let i = 1; i < ring.length; i++) {
        if (Math.abs(ring[i][0] - ring[i - 1][0]) > 180) { crosses = true; break; }
      }
      if (crosses) ring = ring.map(([x, y]) => [x < 0 ? x + 360 : x, y]);

      let minLat = 90, maxLat = -90;
      for (const [, y] of ring) { if (y < minLat) minLat = y; if (y > maxLat) maxLat = y; }
      const r0 = rowOf(minLat), r1 = rowOf(maxLat);
      for (let r = r0; r <= r1; r++) {
        const lat = latOfRow(r);
        const xs = [];
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const y1 = ring[i][1], y2 = ring[j][1];
          if ((y1 <= lat && y2 > lat) || (y2 <= lat && y1 > lat)) {
            const x1 = ring[i][0], x2 = ring[j][0];
            xs.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
          }
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          // 이동 프레임에서 col 계산 후 COLS로 wrap
          const cA = Math.floor((xs[k] + 180) / RES);
          const cB = Math.floor((xs[k + 1] + 180) / RES);
          for (let c = cA; c <= cB; c++) grid[r * COLS + ((c % COLS) + COLS) % COLS] = 1;
        }
      }
      polyCount++;
    }
  }
  return polyCount;
}

console.log('해안선 래스터화 중...');
const t0 = Date.now();
const n1 = rasterize('ne_10m_land.geojson');
const n2 = rasterize('ne_10m_minor_islands.geojson');
let landCells = 0;
for (let i = 0; i < grid.length; i++) if (grid[i]) landCells++;
console.log(`  폴리곤 ${n1 + n2}개 → 격자 ${COLS}×${ROWS}, 육지셀 ${landCells} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

// ── 거리/샘플 유틸 ─────────────────────────────────────────────────
const DEG_KM = 111.32;
const lonDelta = (a, b) => { let d = b - a; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };
const wrapLon = (x) => ((x + 180) % 360 + 360) % 360 - 180;
function distKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG_KM;
  const dLon = lonDelta(lon1, lon2) * DEG_KM * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.hypot(dLat, dLon);
}
// 직선 구간이 육지를 가로지르는지(격자 기준)
function segHitsLand(a, b) {
  const segKm = distKm(a.lat, a.lon, b.lat, b.lon);
  const n = Math.max(2, Math.ceil(segKm / (RES * 60))); // ~3km 간격
  const dLon = lonDelta(a.lon, b.lon);
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (isLandLL(wrapLon(a.lon + dLon * t), a.lat + (b.lat - a.lat) * t)) return true;
  }
  return false;
}
// 구간 내 최대 연속 육지 런(km) — 항구 그레이즈/미세 클립과 실제 관통 구분용
function maxLandRunKm(a, b) {
  const segKm = distKm(a.lat, a.lon, b.lat, b.lon);
  const n = Math.max(2, Math.ceil(segKm / (RES * 60)));
  const stepKm = segKm / n;
  const dLon = lonDelta(a.lon, b.lon);
  let run = 0, best = 0;
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (isLandLL(wrapLon(a.lon + dLon * t), a.lat + (b.lat - a.lat) * t)) { run++; best = Math.max(best, run); }
    else run = 0;
  }
  return best * stepKm;
}

// ── 가장 가까운 바다 셀로 스냅(BFS) ───────────────────────────────
function snapToWater(lon, lat) {
  let c = colOf(lon), r = rowOf(lat);
  if (!isLandCell(c, r)) return [c, r];
  const seen = new Set([r * COLS + c]);
  let frontier = [[c, r]];
  for (let ring = 0; ring < 200 && frontier.length; ring++) {
    const next = [];
    for (const [cc, rr] of frontier) {
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = (cc + dc + COLS) % COLS, nr = rr + dr;
        if (nr < 0 || nr >= ROWS) continue;
        const key = nr * COLS + nc;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!isLandCell(nc, nr)) return [nc, nr];
        next.push([nc, nr]);
      }
    }
    frontier = next;
  }
  return [c, r];
}

// ── A* 해상 경로탐색 (격자, 8방향) ────────────────────────────────
function astar(start, goal) {
  const [sc, sr] = start, [gc, gr] = goal;
  const h = (c, r) => Math.hypot(Math.min(Math.abs(c - gc), COLS - Math.abs(c - gc)), r - gr);
  const key = (c, r) => r * COLS + c;
  const open = new Map(); // key -> f
  const g = new Map();
  const came = new Map();
  g.set(key(sc, sr), 0);
  open.set(key(sc, sr), h(sc, sr));
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let iter = 0;
  const MAX_ITER = 400000;
  while (open.size && iter++ < MAX_ITER) {
    // 최소 f 노드
    let curKey = -1, curF = Infinity;
    for (const [k, f] of open) if (f < curF) { curF = f; curKey = k; }
    open.delete(curKey);
    const cr = Math.floor(curKey / COLS), cc = curKey % COLS;
    if (cc === gc && cr === gr) {
      const path = [];
      let k = curKey;
      while (k !== undefined) { path.push([k % COLS, Math.floor(k / COLS)]); k = came.get(k); }
      return path.reverse();
    }
    const cg = g.get(curKey);
    for (const [dc, dr] of dirs) {
      const nc = (cc + dc + COLS) % COLS, nr = cr + dr;
      if (nr < 0 || nr >= ROWS || isLandCell(nc, nr)) continue;
      const nk = key(nc, nr);
      const step = (dc && dr) ? 1.4142 : 1;
      const ng = cg + step;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng); came.set(nk, curKey); open.set(nk, ng + h(nc, nr));
      }
    }
  }
  return null;
}

// 라인-오브-사이트 단순화(스트링 풀링): 셀 경로 → 최소 웨이포인트
function simplify(cells) {
  if (cells.length <= 2) return cells;
  const pts = cells.map(([c, r]) => ({ lon: lonOfCol(c), lat: latOfRow(r) }));
  const out = [pts[0]];
  let anchor = 0;
  for (let i = 2; i < pts.length; i++) {
    if (segHitsLand(pts[anchor], pts[i])) { out.push(pts[i - 1]); anchor = i - 1; }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ── 항로 보정 ──────────────────────────────────────────────────────
const MIN_REPAIR_KM = 15; // 이보다 짧은 그레이즈(항구·미세 클립)는 보정 안 함
function repairRoute(name, wps) {
  const out = [wps[0]];
  let inserted = 0, failed = 0;
  for (let i = 0; i < wps.length - 1; i++) {
    const a = out[out.length - 1];
    const b = wps[i + 1];
    const isPortLeg = i === 0 || i === wps.length - 2; // 출발/도착 항구 구간
    if (isPortLeg || maxLandRunKm(a, b) < MIN_REPAIR_KM) { out.push(b); continue; }
    // 우회 필요 — 끝점을 바다로 스냅 후 A*
    const s = snapToWater(a.lon, a.lat);
    const ggoal = snapToWater(b.lon, b.lat);
    const path = astar(s, ggoal);
    if (!path) { out.push(b); failed++; continue; }
    const simp = simplify(path);
    // 중간 우회점만 삽입(시작은 a, 끝은 원래 b 유지)
    for (let k = 1; k < simp.length - 1; k++) {
      out.push({ lon: +simp[k].lon.toFixed(3), lat: +simp[k].lat.toFixed(3), label: `${name} 회피경유` });
      inserted++;
    }
    out.push(b);
  }
  return { wps: out, inserted, failed };
}

const repaired = {};
console.log('\n항로 보정 중...');
for (const [name, wps] of Object.entries(ROUTES)) {
  const { wps: rw, inserted, failed } = repairRoute(name, wps);
  repaired[name] = rw;
  // 보정 후 재검증(격자 기준)
  let remain = 0;
  for (let i = 0; i < rw.length - 1; i++) if (segHitsLand(rw[i], rw[i + 1])) remain++;
  console.log(`  ${name}: +${inserted} 경유점, A*실패 ${failed}, 잔여교차 ${remain} (총 ${rw.length}점)`);
}

// ── arcticRoutes.js 의 ROUTES 블록 재기록 ─────────────────────────
function serializeRoutes(obj) {
  let s = 'export const ROUTES = {\n';
  for (const [name, wps] of Object.entries(obj)) {
    s += `  ${name}: [\n`;
    for (const w of wps) {
      const label = (w.label || '').replace(/'/g, "\\'");
      s += `    { lon: ${w.lon}, lat: ${w.lat}, label: '${label}' },\n`;
    }
    s += '  ],\n';
  }
  s += '}';
  return s;
}
let src = readFileSync(ROUTES_FILE, 'utf-8');
const startIdx = src.indexOf('export const ROUTES = {');
if (startIdx < 0) { console.error('ROUTES 블록을 찾지 못함'); process.exit(2); }
// 중괄호 매칭으로 블록 끝 찾기
let depth = 0, endIdx = -1;
for (let i = src.indexOf('{', startIdx); i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
}
const newBlock = serializeRoutes(repaired);
src = src.slice(0, startIdx) + newBlock + src.slice(endIdx + 1);
writeFileSync(ROUTES_FILE, src, 'utf-8');
console.log('\narcticRoutes.js ROUTES 블록 재기록 완료');

// ── 격자 저장(단계 B 런타임용) ────────────────────────────────────
writeFileSync(join(COAST_DIR, 'landGrid.bin'), Buffer.from(grid));
writeFileSync(join(COAST_DIR, 'landGrid.meta.json'),
  JSON.stringify({ res: RES, cols: COLS, rows: ROWS, lonMin: -180, latMin: -90 }));
console.log('landGrid.bin / landGrid.meta.json 저장 완료 (단계 B 재사용)');
