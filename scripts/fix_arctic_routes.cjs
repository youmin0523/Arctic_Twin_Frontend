/**
 * fix_arctic_routes.cjs — NSR/NWP/TSR 육지관통 구간 자동 교정
 *
 * 0.05° 전역 마스크 + navigableCorridors 면제를 진실값으로,
 * 런타임 findWaterDetour 와 동일한 그리드 A*(이진 힙 버전)로 각 육지관통
 * 구간을 해상 우회로 치환한다. 비항구 WP 가 육지에 박힌 경우 최근접 수역으로 스냅.
 *
 *   node scripts/fix_arctic_routes.cjs          → 미리보기(감사만, 파일 미수정)
 *   node scripts/fix_arctic_routes.cjs --write  → arcticRoutes.js 의 3개 배열 교정
 */
const fs = require('fs');
const path = require('path');
const { auditRoute } = require('./route_audit.cjs');

const DATA = path.join(__dirname, '..', 'public', 'data');
const ARCTIC = path.join(__dirname, '..', 'src', 'data', 'arcticRoutes.js');
const META = JSON.parse(fs.readFileSync(path.join(DATA, 'landMaskGlobal.meta.json')));
const buf = fs.readFileSync(path.join(DATA, 'landMaskGlobal.bin'));
const packed = new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
const CORR = JSON.parse(fs.readFileSync(path.join(DATA, 'navigableCorridors.json')));
const DEG = 111.32;

function cellLand(col, row) {
  if (row < 0 || row >= META.rows) return false;
  const c = ((col % META.cols) + META.cols) % META.cols;
  const idx = row * META.cols + c;
  return (packed[idx >> 3] >> (idx & 7) & 1) === 1;
}
const colOf = (l) => Math.floor((l + 180) / META.res);
const rowOf = (l) => Math.floor((l + 90) / META.res);
const lonOfCol = (c) => -180 + (c + 0.5) * META.res;
const latOfRow = (r) => -90 + (r + 0.5) * META.res;
function lonDelta(a, b) { let d = b - a; if (d > 180) d -= 360; if (d < -180) d += 360; return d; }
function wrapLon(x) { return ((x + 180) % 360 + 360) % 360 - 180; }
function distToSegKm(plat, plon, alon, alat, blon, blat) {
  const k = Math.cos(plat * Math.PI / 180);
  const ax = alon * k, ay = alat, bx = blon * k, by = blat, px = plon * k, py = plat;
  const dx = bx - ax, dy = by - ay; const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0; t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy; return Math.hypot(px - cx, py - cy) * DEG;
}
function inCorridor(lat, lon) {
  for (const b of CORR.boxes)
    if (lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax) return true;
  for (const ln of CORR.lanes)
    for (let i = 1; i < ln.points.length; i++) {
      const [al, aa] = ln.points[i - 1], [bl, ba] = ln.points[i];
      if (distToSegKm(lat, lon, al, aa, bl, ba) <= ln.bufferKm) return true;
    }
  return false;
}
const blocked = (c, r) => cellLand(c, r) && !inCorridor(latOfRow(r), lonOfCol(c));
const isBlockedLL = (lat, lon) => cellLand(colOf(lon), rowOf(lat)) && !inCorridor(lat, lon);

// 선분이 지나는 모든 셀을 순회(Amanatides-Woo)하며 육지셀 검사 — 포인트 샘플링의
// 코너 그레이즈 누락을 제거(감사 5km 포인트샘플보다 엄격). 날짜변경선은 상대경도로 처리.
function segBlockedDDA(a, b) {
  const res = META.res;
  const x0 = (a.lon + 180) / res, y0 = (a.lat + 90) / res;
  const x1 = x0 + lonDelta(a.lon, b.lon) / res, y1 = (b.lat + 90) / res;
  let cx = Math.floor(x0), cy = Math.floor(y0);
  const ex = Math.floor(x1), ey = Math.floor(y1);
  const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let tMaxX = dx < 1e-12 ? Infinity : (sx > 0 ? cx + 1 - x0 : x0 - cx) / dx;
  let tMaxY = dy < 1e-12 ? Infinity : (sy > 0 ? cy + 1 - y0 : y0 - cy) / dy;
  const tDeltaX = dx < 1e-12 ? Infinity : 1 / dx, tDeltaY = dy < 1e-12 ? Infinity : 1 / dy;
  const chk = (col, row) => (row >= 0 && row < META.rows) && blocked(((col % META.cols) + META.cols) % META.cols, row);
  if (chk(cx, cy)) return true;
  let guard = 0;
  while ((cx !== ex || cy !== ey) && guard++ < 500000) {
    if (tMaxX < tMaxY) { cx += sx; tMaxX += tDeltaX; } else { cy += sy; tMaxY += tDeltaY; }
    if (chk(cx, cy)) return true;
  }
  return false;
}

function snapToWater(col, row) {
  if (!blocked(col, row)) return [col, row];
  const seen = new Set([row * META.cols + col]);
  let fr = [[col, row]];
  for (let ring = 0; ring < 300 && fr.length; ring++) {
    const nx = [];
    for (const [cc, rr] of fr)
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = ((cc + dc) % META.cols + META.cols) % META.cols, nr = rr + dr;
        if (nr < 0 || nr >= META.rows) continue;
        const key = nr * META.cols + nc; if (seen.has(key)) continue; seen.add(key);
        if (!blocked(nc, nr)) return [nc, nr];
        nx.push([nc, nr]);
      }
    fr = nx;
  }
  return [col, row];
}

// 최소 힙 (f 기준)
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(f, k) { const a = this.a; a.push([f, k]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break;[a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = 2 * i + 2; let s = i; if (l < a.length && a[l][0] < a[s][0]) s = l; if (r < a.length && a[r][0] < a[s][0]) s = r; if (s === i) break;[a[s], a[i]] = [a[i], a[s]]; i = s; } } return top; }
}

function waterDetour(from, to, opts = {}) {
  const marginCells = opts.marginCells ?? 220;
  const maxIter = opts.maxIter ?? 3_000_000;
  const [sc, sr] = snapToWater(colOf(from.lon), rowOf(from.lat));
  const [gc, gr] = snapToWater(colOf(to.lon), rowOf(to.lat));
  const relGC = sc + lonDelta(lonOfCol(sc), lonOfCol(gc)) / META.res;
  const minR = Math.max(0, Math.min(sr, gr) - marginCells);
  const maxR = Math.min(META.rows - 1, Math.max(sr, gr) + marginCells);
  const minRelC = Math.min(sc, relGC) - marginCells;
  const maxRelC = Math.max(sc, relGC) + marginCells;
  const key = (c, r) => r * META.cols + ((c % META.cols) + META.cols) % META.cols;
  const g = new Map(), came = new Map(), relCol = new Map(), closed = new Set();
  const open = new Heap();
  const startKey = key(sc, sr); const goalKey = key(gc, gr);
  g.set(startKey, 0); relCol.set(startKey, sc); open.push(0, startKey);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let iter = 0, found = false;
  while (open.size && iter++ < maxIter) {
    const [, curKey] = open.pop();
    if (curKey === goalKey) { found = true; break; }
    if (closed.has(curKey)) continue; closed.add(curKey);
    const cr = Math.floor(curKey / META.cols), ccCol = curKey % META.cols;
    const ccRel = relCol.get(curKey), cg = g.get(curKey);
    for (const [dc, dr] of dirs) {
      const nrAbs = cr + dr; if (nrAbs < minR || nrAbs > maxR) continue;
      const nRel = ccRel + dc; if (nRel < minRelC || nRel > maxRelC) continue;
      const nc = ((Math.round(nRel) % META.cols) + META.cols) % META.cols;
      if (blocked(nc, nrAbs)) continue;
      if (dc && dr) { const orthA = (((ccCol + dc) % META.cols) + META.cols) % META.cols; if (blocked(orthA, cr) || blocked(ccCol, nrAbs)) continue; }
      const nk = nrAbs * META.cols + nc; const step = (dc && dr) ? 1.4142 : 1; const ng = cg + step;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng); came.set(nk, curKey); relCol.set(nk, nRel);
        const h = Math.hypot(Math.abs(nRel - relGC), nrAbs - gr);
        open.push(ng + h, nk);
      }
    }
  }
  if (!found && startKey !== goalKey) return null;
  const cells = []; let k = goalKey, guard = 0;
  while (k !== undefined && guard++ < 1e6) { cells.push(k); k = came.get(k); }
  cells.reverse(); if (cells.length < 2) return null;
  const cellPts = cells.map((kk) => ({ lon: lonOfCol(kk % META.cols), lat: latOfRow(Math.floor(kk / META.cols)) }));
  const pts = [from, ...cellPts, to];
  const segLand = (a, b) => segBlockedDDA(a, b);
  const out = [pts[0]]; let anchor = 0;
  for (let i = 2; i < pts.length; i++) if (segLand(pts[anchor], pts[i])) { out.push(pts[i - 1]); anchor = i - 1; }
  out.push(pts[pts.length - 1]);
  let safe = true; for (let i = 0; i < out.length - 1; i++) if (segLand(out[i], out[i + 1])) { safe = false; break; }
  const finalPts = safe ? out : pts;
  return finalPts.slice(1, -1).map((p) => ({ lon: +p.lon.toFixed(3), lat: +p.lat.toFixed(3) }));
}

function segBad(a, b) { return segBlockedDDA(a, b); }

function fixRoute(wps) {
  // 비항구 WP 가 육지면 최근접 수역으로 스냅
  let w = wps.map((p, i) => {
    if (i === 0 || i === wps.length - 1) return { ...p };
    if (isBlockedLL(p.lat, p.lon)) {
      const [c, r] = snapToWater(colOf(p.lon), rowOf(p.lat));
      return { lon: +lonOfCol(c).toFixed(3), lat: +latOfRow(r).toFixed(3), label: p.label };
    }
    return { ...p };
  });
  // 잔여 육지관통이 없을 때까지 반복 우회 (단순화로 새로 생긴 코너 그레이즈까지 수렴)
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    const out = [w[0]];
    for (let i = 1; i < w.length; i++) {
      const a = w[i - 1], b = w[i];
      if (segBad(a, b)) {
        const det = waterDetour(a, b);
        if (det && det.length) { for (const d of det) out.push({ lon: d.lon, lat: d.lat, label: '우회' }); changed = true; }
        else console.warn(`  ⚠ detour 실패: ${a.label} -> ${b.label}`);
      }
      out.push(b);
    }
    w = out;
    if (!changed) break;
  }
  return w;
}

// ── 파싱 ──
const src = fs.readFileSync(ARCTIC, 'utf8');
function parseWps(body) {
  const wps = []; const r = /\{\s*lon:\s*(-?[0-9.]+),\s*lat:\s*(-?[0-9.]+),\s*label:\s*'([^']*)'/g; let x;
  while ((x = r.exec(body))) wps.push({ lon: +x[1], lat: +x[2], label: x[3] });
  return wps;
}
function extract(key) {
  const m = src.match(new RegExp(key + ':\\s*\\[([\\s\\S]*?)\\n  \\],'));
  if (!m) throw new Error('not found ' + key);
  return parseWps(m[1]);
}

const WRITE = process.argv.includes('--write');
let text = src;
let totalBad = 0;
for (const key of ['NSR', 'NWP', 'TSR']) {
  const orig = extract(key);
  const fixed = fixRoute(orig);
  console.log(`\n>>> ${key}: ${orig.length}wp → ${fixed.length}wp`);
  const r = auditRoute(key + ' (교정후)', fixed);
  totalBad += r.bad + r.wpLand;
  if (WRITE) {
    const body = fixed.map((p) => `    { lon: ${p.lon}, lat: ${p.lat}, label: '${p.label}' },`).join('\n');
    const re = new RegExp('(' + key + ':\\s*\\[)[\\s\\S]*?(\\n  \\],)');
    text = text.replace(re, `$1\n${body}$2`);
  }
}
if (WRITE) {
  fs.writeFileSync(ARCTIC, text);
  console.log('\n✍  arcticRoutes.js 에 NSR/NWP/TSR 교정 반영 완료');
}
console.log(`\n==== 교정후 총 (육지관통+WP육지): ${totalBad} ${WRITE ? '[WRITTEN]' : '[PREVIEW]'} ====`);
