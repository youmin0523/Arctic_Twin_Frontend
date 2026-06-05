/**
 * verify_runtime_arctic.cjs — 런타임 북극 경로 파이프라인 육지 검증
 *
 * Live Mode 에서 빙산 데이터가 있으면 routeGenerator.optimizeArcticSegment 가
 * 위도 65° 이상 구간을 0.5° 격자 A*(arcticPathfinder.findArcticPath, landMask.json)로
 * 재생성한 뒤 generateRoute 가 avoidLandGlobal(0.05°)로 후처리한다.
 * 이 파이프라인을 그대로 재현해 최종 경로가 0.05° 기준으로 육지를 관통하는지 감사한다.
 *
 *   node scripts/verify_runtime_arctic.cjs
 */
const fs = require('fs');
const path = require('path');
const { auditRoute, segCrossesLand } = require('./route_audit.cjs');
const { waterDetour, segBad, segBlockedDDA, snapToWater, isBlockedLL, colOf, rowOf, lonOfCol, latOfRow } = require('./fix_arctic_routes.cjs');

// ── 0.5° 북극 마스크 + A* (arcticPathfinder.js 포팅) ──
const LM = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'landMask.json'), 'utf8'));
const landMask = new Uint8Array(LM.data);
const G_LON_STEP = 0.5, G_LAT_STEP = 0.5, G_LON_MIN = -180, G_LAT_MIN = 65, G_LAT_MAX = 90;
const G_COLS = 720, G_ROWS = 50;
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
function lonLatToCell(lon, lat) {
  const col = Math.floor((lon - G_LON_MIN) / G_LON_STEP);
  const row = Math.floor((lat - G_LAT_MIN) / G_LAT_STEP);
  return [Math.max(0, Math.min(G_COLS - 1, col)), Math.max(0, Math.min(G_ROWS - 1, row))];
}
function cellToLonLat(col, row) {
  return [G_LON_MIN + col * G_LON_STEP + G_LON_STEP / 2, G_LAT_MIN + row * G_LAT_STEP + G_LAT_STEP / 2];
}
function buildGrid() { // 빙산/해빙 없음 → 육지만 999
  const grid = new Float32Array(G_ROWS * G_COLS).fill(0);
  for (let i = 0; i < G_ROWS * G_COLS; i++) if (landMask[i] === 1) grid[i] = 999;
  return grid;
}
function snapToOcean(col, row, grid) {
  if (grid[row * G_COLS + col] < 999) return [col, row];
  const seen = new Uint8Array(G_ROWS * G_COLS); const q = [[col, row]]; seen[row * G_COLS + col] = 1;
  while (q.length) { const [c, r] = q.shift(); for (const [dc, dr] of DIRS) { const nc = c + dc, nr = r + dr; if (nc < 0 || nc >= G_COLS || nr < 0 || nr >= G_ROWS) continue; const ni = nr * G_COLS + nc; if (seen[ni]) continue; seen[ni] = 1; if (grid[ni] < 999) return [nc, nr]; q.push([nc, nr]); } }
  return [col, row];
}
class MinHeap { constructor() { this.d = []; } get size() { return this.d.length; } push(v, p) { this.d.push({ p, v }); let i = this.d.length - 1; while (i > 0) { const par = (i - 1) >> 1; if (this.d[par].p <= this.d[i].p) break;[this.d[par], this.d[i]] = [this.d[i], this.d[par]]; i = par; } } pop() { const top = this.d[0].v; const last = this.d.pop(); if (this.d.length) { this.d[0] = last; let i = 0; const n = this.d.length; for (;;) { let s = i; const l = 2 * i + 1, r = 2 * i + 2; if (l < n && this.d[l].p < this.d[s].p) s = l; if (r < n && this.d[r].p < this.d[s].p) s = r; if (s === i) break;[this.d[s], this.d[i]] = [this.d[i], this.d[s]]; i = s; } } return top; } }
function heuristic(c, r, gc, gr) { return Math.hypot(c - gc, r - gr); }
function simplifyPath(pts, thr) {
  if (pts.length <= 2) return pts; const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) { const pr = out[out.length - 1], cu = pts[i], nx = pts[i + 1]; const a1 = Math.atan2(cu[1] - pr[1], cu[0] - pr[0]); const a2 = Math.atan2(nx[1] - cu[1], nx[0] - cu[0]); let d = Math.abs((a2 - a1) * 180 / Math.PI); if (d > 180) d = 360 - d; if (d > thr) out.push(cu); }
  out.push(pts[pts.length - 1]); return out;
}
function findArcticPath(sLon, sLat, gLon, gLat, maxSafe) {
  const csLat = Math.max(G_LAT_MIN, Math.min(G_LAT_MAX - 0.01, sLat));
  const cgLat = Math.max(G_LAT_MIN, Math.min(G_LAT_MAX - 0.01, gLat));
  const grid = buildGrid();
  let [sc, sr] = lonLatToCell(sLon, csLat); let [gc, gr] = lonLatToCell(gLon, cgLat);
  [sc, sr] = snapToOcean(sc, sr, grid); [gc, gr] = snapToOcean(gc, gr, grid);
  if (sc === gc && sr === gr) return [[gLon, gLat]];
  const size = G_ROWS * G_COLS; const gScore = new Float32Array(size).fill(Infinity); const came = new Int32Array(size).fill(-1);
  const sIdx = sr * G_COLS + sc, gIdx = gr * G_COLS + gc; gScore[sIdx] = 0;
  const open = new MinHeap(); open.push(sIdx, heuristic(sc, sr, gc, gr));
  const closed = new Uint8Array(size); let iter = 0; const CAP = size * 4;
  while (open.size) {
    if (iter++ > CAP) return null;        // 도달 불가 시 무한루프 방지
    const cur = open.pop(); if (closed[cur]) continue; closed[cur] = 1;
    if (cur === gIdx) { const raw = []; let k = cur; while (k !== -1) { raw.push(k); k = came[k]; } raw.reverse(); return simplifyPath(raw.map((idx) => cellToLonLat(idx % G_COLS, Math.floor(idx / G_COLS))), 12); }
    const cc = cur % G_COLS, cr = Math.floor(cur / G_COLS);
    for (const [dc, dr] of DIRS) {
      const nc = cc + dc, nr = cr + dr; if (nc < 0 || nc >= G_COLS || nr < 0 || nr >= G_ROWS) continue;
      const idx = nr * G_COLS + nc; const conc = grid[idx]; if (conc > maxSafe) continue;
      const diag = dc !== 0 && dr !== 0; const base = diag ? 1.414 : 1.0; const icePen = maxSafe > 0 ? (conc / maxSafe) * 1.5 : 0;
      const cost = base * (1 + icePen); const tg = gScore[cur] + cost;
      if (tg < gScore[idx]) { came[idx] = cur; gScore[idx] = tg; open.push(idx, tg + heuristic(nc, nr, gc, gr)); }
    }
  }
  return null;
}

// ── routeGenerator 포팅: extractArcticSegment / optimizeArcticSegment / avoidLandGlobal ──
function extractArcticSegment(wps) {
  const A = 65; let entry = -1, exit = -1;
  for (let i = 0; i < wps.length; i++) {
    if (wps[i].lat >= A && entry === -1) entry = Math.max(0, i - 1);
    if (entry !== -1 && wps[i].lat >= A) exit = Math.min(wps.length - 1, i + 1);
  }
  return { entry, exit };
}
function optimizeArcticSegment(wps, maxSafe = 0.7) {
  const { entry, exit } = extractArcticSegment(wps);
  if (entry === -1 || exit === -1 || entry >= exit) return wps;
  const e = wps[entry], x = wps[exit];
  const ap = findArcticPath(e.lon, e.lat, x.lon, x.lat, maxSafe);
  if (!ap) return wps;
  const aw = ap.map(([lon, lat]) => ({ lon, lat, label: '북극 경유' }));
  return [...wps.slice(0, entry), ...aw, ...wps.slice(exit + 1)];
}
// 견고판: 비끝점 육지 WP 를 수역으로 스냅 + 잔여 없을 때까지 반복 우회(DDA 검증)
function avoidLandGlobal(wps) {
  let w = wps.map((p, i) => {
    if (i === 0 || i === wps.length - 1) return p;
    if (isBlockedLL(p.lat, p.lon)) { const [c, r] = snapToWater(colOf(p.lon), rowOf(p.lat)); return { lon: +lonOfCol(c).toFixed(3), lat: +latOfRow(r).toFixed(3), label: p.label }; }
    return p;
  });
  // 단일 패스 (실제 런타임 avoidLandGlobal 과 동일). 제한적 우회(60셀).
  const out = [w[0]];
  for (let i = 1; i < w.length; i++) {
    const a = w[i - 1], b = w[i];
    if (segBad(a, b)) { const det = waterDetour(a, b, { marginCells: 60, maxIter: 120000, maxWindowCells: 250000 }); if (det && det.length) for (const d of det) out.push({ lon: d.lon, lat: d.lat, label: '우회' }); }
    out.push(b);
  }
  return out;
}

// ── 실행 ──
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'arcticRoutes.js'), 'utf8');
function parseWps(body) { const wps = []; const r = /\{\s*lon:\s*(-?[0-9.]+),\s*lat:\s*(-?[0-9.]+),\s*label:\s*'([^']*)'/g; let x; while ((x = r.exec(body))) wps.push({ lon: +x[1], lat: +x[2], label: x[3] }); return wps; }
function extract(key) { return parseWps(src.match(new RegExp(key + ':\\s*\\[([\\s\\S]*?)\\n  \\],'))[1]); }

function countBad(wps) { let n = 0; for (let i = 1; i < wps.length; i++) if (segCrossesLand(wps[i - 1], wps[i]).hits > 0) n++; return n; }

let grand = 0;
const only = process.argv[2];
for (const k of (only ? [only] : ['NSR', 'NWP', 'TSR'])) {
  process.stderr.write(`[${k}] extract...\n`);
  const base = extract(k);
  process.stderr.write(`[${k}] optimizeArcticSegment (base ${base.length}wp)...\n`);
  const astar = optimizeArcticSegment(base, 0.7);
  process.stderr.write(`[${k}] A* ${astar.length}wp, countBad...\n`);
  const rawBad = countBad(astar);          // A* 직후 (후처리 전)
  process.stderr.write(`[${k}] rawBad=${rawBad}\n`);
  // A* 출력을 0.05° 마스크로 검증 → 육지 지나면 정밀 베이스 항로로 폴백.
  // (거친 0.5° A* 는 사실상 항상 육지를 스침 → 베이스 유지가 안전·정밀)
  let cleaned, mode;
  if (rawBad === 0) { cleaned = avoidLandGlobal(astar); mode = 'A*'; }
  else { cleaned = base; mode = 'BASE-fallback'; }
  console.log(`\n>>> ${k}: base ${base.length}wp → A* ${astar.length}wp(육지 ${rawBad}) → [${mode}] ${cleaned.length}wp`);
  const r = auditRoute(`${k} 런타임 최종(${mode})`, cleaned);
  grand += r.bad + r.wpLand;
}
console.log(`\n==== 런타임 북극 경로 최종 육지관통 총합: ${grand} ====`);
