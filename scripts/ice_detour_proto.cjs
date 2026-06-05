/**
 * ice_detour_proto.cjs — 베이스 항로 국소 해빙 우회 알고리즘 프로토타입(검증용)
 *
 * 두께→WMO 빙질 매핑 + 농도 + 선박 빙급 → POLARIS RIO 비용으로,
 * 베이스 항로에서 RIO 가 낮은(위험) 구간만 0.05° 격자 A*(육지+고위험빙 차단,
 * 빙 비용 가중)로 국소 우회한다. 실데이터(realIceData)로 효과·육지안전·경계 검증.
 *
 *   node scripts/ice_detour_proto.cjs [iceClass] [month]
 */
const fs = require('path') && require('fs');
const path = require('path');
const prim = require('./fix_arctic_routes.cjs'); // 0.05° 격자 primitives 재사용
const { colOf, rowOf, lonOfCol, latOfRow, blocked, snapToWater, segBlockedDDA, isBlockedLL } = prim;
const DATA = path.join(__dirname, '..', 'public', 'data');
const META = JSON.parse(fs.readFileSync(path.join(DATA, 'landMaskGlobal.meta.json')));

// ── RIV_TABLE 추출 (iceClassData.js) ──
const icd = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'iceClassData.js'), 'utf8');
const rivText = icd.match(/RIV_TABLE\s*=\s*(\{[\s\S]*?\n\});/)[1];
const RIV_TABLE = eval('(' + rivText + ')');

// ── 두께(m) → WMO 빙질 단계 ──
function thicknessToIceType(t) {
  if (t < 0.10) return 'Grey Ice';
  if (t < 0.15) return 'Grey Ice';
  if (t < 0.30) return 'Grey-White Ice';
  if (t < 0.70) return 'Thin First-Year (FY)';
  if (t < 1.20) return 'Medium First-Year (FY)';
  if (t < 2.00) return 'Thick First-Year (FY)';
  if (t < 3.00) return 'Multi-Year (MY)';
  return 'Ridged/Hummocked';
}
function calculateRIO(iceClass, conditions) {
  const rivs = RIV_TABLE[iceClass] || RIV_TABLE['NONE'];
  let rio = 0;
  for (const c of conditions) { const r = rivs[c.type]; if (r === undefined) continue; rio += c.tenths * r; }
  return rio;
}

// ── 해빙 데이터 샘플러 (농도 + 두께) ──
function makeIceSampler(dataset) {
  const map = new Map();
  let latStep = 0.75, lonStep = 1;
  for (const c of dataset.cells) { map.set(`${c.lon}|${c.lat}`, c); latStep = c.latStep; lonStep = c.lonStep; }
  // lat 원점 집합(정렬) — 포함 셀 탐색용
  const lat0s = [...new Set(dataset.cells.map((c) => c.lat))].sort((a, b) => a - b);
  return (lat, lon) => {
    const lonO = Math.floor(lon / lonStep) * lonStep;
    // lat 원점: lat 이하의 가장 큰 셀 원점
    let latO = null;
    for (let i = lat0s.length - 1; i >= 0; i--) { if (lat0s[i] <= lat + 1e-9 && lat < lat0s[i] + latStep) { latO = lat0s[i]; break; } }
    if (latO === null) return { conc: 0, thick: 0 };
    const cell = map.get(`${lonO}|${latO}`);
    if (!cell) return { conc: 0, thick: 0 };
    return { conc: cell.concentration || 0, thick: cell.thickness || 0 };
  };
}
function makeRioSampler(dataset, iceClass) {
  const ice = makeIceSampler(dataset);
  return (lat, lon) => {
    const { conc, thick } = ice(lat, lon);
    if (conc <= 0.02) return 20; // 사실상 개빙수역 — 매우 안전
    const tenths = Math.max(0, Math.min(10, conc * 10));
    const open = Math.max(0, 10 - tenths);
    const conditions = [{ type: thicknessToIceType(thick), tenths }, { type: 'Open Water', tenths: open }];
    return calculateRIO(iceClass, conditions);
  };
}

// ── 빙 인지 국소 우회 A* (0.05° 격자, 육지+고위험빙 차단, RIO 비용 가중) ──
const HARD_BLOCK = -10;   // RIO < -10 (POLARIS 특별고려/회피) → 통과 불가
const PEN_SCALE = 6;      // RIO 0→-10 구간 비용 가중 강도
class Heap { constructor() { this.a = []; } get size() { return this.a.length; } push(f, k) { const a = this.a; a.push([f, k]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break;[a[p], a[i]] = [a[i], a[p]]; i = p; } } pop() { const a = this.a; const t = a[0]; const l = a.pop(); if (a.length) { a[0] = l; let i = 0; for (;;) { let s = i; const L = 2 * i + 1, R = 2 * i + 2; if (L < a.length && a[L][0] < a[s][0]) s = L; if (R < a.length && a[R][0] < a[s][0]) s = R; if (s === i) break;[a[s], a[i]] = [a[i], a[s]]; i = s; } } return t; } }
function lonDelta(a, b) { let d = b - a; if (d > 180) d -= 360; if (d < -180) d += 360; return d; }
function cellRio(rioFn, c, r) { return rioFn(latOfRow(r), lonOfCol(c)); }
function icePenalty(rio) { return rio >= 0 ? 0 : Math.min(PEN_SCALE, (-rio) / 10 * PEN_SCALE); }

function findIceDetour(from, to, rioFn, opts = {}) {
  const marginCells = opts.marginCells ?? 120;
  const maxIter = opts.maxIter ?? 1_500_000;
  const maxWindowCells = opts.maxWindowCells ?? 1_500_000;
  const [sc, sr] = snapToWater(colOf(from.lon), rowOf(from.lat));
  const [gc, gr] = snapToWater(colOf(to.lon), rowOf(to.lat));
  const relGC = sc + lonDelta(lonOfCol(sc), lonOfCol(gc)) / META.res;
  const minR = Math.max(0, Math.min(sr, gr) - marginCells);
  const maxR = Math.min(META.rows - 1, Math.max(sr, gr) + marginCells);
  const minRelC = Math.min(sc, relGC) - marginCells, maxRelC = Math.max(sc, relGC) + marginCells;
  if ((maxR - minR + 1) * (maxRelC - minRelC + 1) > maxWindowCells) return null;
  const blockedCell = (c, r) => blocked(c, r) || cellRio(rioFn, c, r) < HARD_BLOCK;
  const key = (c, r) => r * META.cols + ((c % META.cols) + META.cols) % META.cols;
  const g = new Map(), came = new Map(), relCol = new Map(), closed = new Set();
  const open = new Heap();
  const startKey = key(sc, sr), goalKey = key(gc, gr);
  g.set(startKey, 0); relCol.set(startKey, sc); open.push(0, startKey);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let iter = 0, found = false;
  while (open.size && iter++ < maxIter) {
    const [, cur] = open.pop(); if (cur === goalKey) { found = true; break; }
    if (closed.has(cur)) continue; closed.add(cur);
    const cr = Math.floor(cur / META.cols), ccCol = cur % META.cols, ccRel = relCol.get(cur), cg = g.get(cur);
    for (const [dc, dr] of dirs) {
      const nrAbs = cr + dr; if (nrAbs < minR || nrAbs > maxR) continue;
      const nRel = ccRel + dc; if (nRel < minRelC || nRel > maxRelC) continue;
      const nc = ((Math.round(nRel) % META.cols) + META.cols) % META.cols;
      if (blockedCell(nc, nrAbs)) continue;
      if (dc && dr) { const o = (((ccCol + dc) % META.cols) + META.cols) % META.cols; if (blockedCell(o, cr) || blockedCell(ccCol, nrAbs)) continue; }
      const nk = nrAbs * META.cols + nc; const step = (dc && dr) ? 1.4142 : 1;
      const ng = cg + step * (1 + icePenalty(cellRio(rioFn, nc, nrAbs)));
      if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); came.set(nk, cur); relCol.set(nk, nRel); open.push(ng + Math.hypot(Math.abs(nRel - relGC), nrAbs - gr), nk); }
    }
  }
  if (!found) return null;
  const cells = []; let k = goalKey, guard = 0; while (k !== undefined && guard++ < 1e6) { cells.push(k); k = came.get(k); } cells.reverse();
  if (cells.length < 2) return null;
  const cellPts = cells.map((kk) => ({ lon: lonOfCol(kk % META.cols), lat: latOfRow(Math.floor(kk / META.cols)) }));
  const pts = [from, ...cellPts, to];
  // 단순화: 직선화가 육지 또는 고위험빙(RIO<HARD_BLOCK)을 지나면 중간점 유지
  const segBadLandIce = (a, b) => {
    if (segBlockedDDA(a, b)) return true;
    const segKm = Math.hypot((b.lat - a.lat) * 111.32, lonDelta(a.lon, b.lon) * 111.32 * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180));
    const n = Math.max(2, Math.ceil(segKm / 5)), dL = lonDelta(a.lon, b.lon);
    for (let i = 1; i <= n; i++) { const t = i / n; if (rioFn(a.lat + (b.lat - a.lat) * t, a.lon + dL * t) < HARD_BLOCK) return true; }
    return false;
  };
  const out = [pts[0]]; let anchor = 0;
  for (let i = 2; i < pts.length; i++) if (segBadLandIce(pts[anchor], pts[i])) { out.push(pts[i - 1]); anchor = i - 1; }
  out.push(pts[pts.length - 1]);
  return out.slice(1, -1).map((p) => ({ lon: +p.lon.toFixed(3), lat: +p.lat.toFixed(3) }));
}

// ── 베이스 항로 국소 우회 적용 ──
const RISK_TRIGGER = 0; // RIO<0 (상승위험) 구간을 우회 후보로
function minRioAlong(a, b, rioFn) {
  const segKm = Math.hypot((b.lat - a.lat) * 111.32, lonDelta(a.lon, b.lon) * 111.32 * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180));
  const n = Math.max(2, Math.ceil(segKm / 10)), dL = lonDelta(a.lon, b.lon);
  let mn = Infinity;
  for (let i = 0; i <= n; i++) { const t = i / n; mn = Math.min(mn, rioFn(a.lat + (b.lat - a.lat) * t, a.lon + dL * t)); }
  return mn;
}
function applyIceDetours(wps, rioFn) {
  // 1) 세그먼트별 최저 RIO → 위험 세그먼트 마킹
  const segRisk = [];
  for (let i = 1; i < wps.length; i++) segRisk.push(minRioAlong(wps[i - 1], wps[i], rioFn));
  // 2) 연속 위험(RIO<TRIGGER) 세그먼트 구간을 병합해 [startIdx,endIdx] span
  const spans = [];
  let s = -1;
  for (let i = 0; i < segRisk.length; i++) {
    if (segRisk[i] < RISK_TRIGGER) { if (s === -1) s = i; }
    else if (s !== -1) { spans.push([s, i]); s = -1; }
  }
  if (s !== -1) spans.push([s, segRisk.length]);
  // 3) 각 span: 시작 WP(s) → 끝 WP(end) 국소 우회. 개선(최저RIO 상승)+육지청정 시 채택.
  let applied = 0, detourPts = 0;
  const replace = []; // {startIdx,endIdx,detour}
  for (const [si, ei] of spans) {
    const aIdx = si, bIdx = Math.min(wps.length - 1, ei + 1); // span 양끝 WP
    const a = wps[aIdx], b = wps[bIdx];
    const baseMin = Math.min(...Array.from({ length: bIdx - aIdx }, (_, j) => segRisk[aIdx + j]));
    const det = findIceDetour(a, b, rioFn, { marginCells: 120 });
    if (!det || det.length === 0) continue; // 실질 우회점이 없으면 베이스 유지(WP 제거 방지)
    // 우회 경로 최저 RIO
    const detPath = [a, ...det, b];
    let detMin = Infinity;
    for (let i = 1; i < detPath.length; i++) detMin = Math.min(detMin, minRioAlong(detPath[i - 1], detPath[i], rioFn));
    if (detMin > baseMin + 0.5) { replace.push({ aIdx, bIdx, det }); applied++; detourPts += det.length; }
  }
  // 4) 뒤에서부터 splice
  let out = wps.slice();
  for (const r of replace.sort((x, y) => y.aIdx - x.aIdx)) {
    out = [...out.slice(0, r.aIdx + 1), ...r.det.map((d) => ({ lon: d.lon, lat: d.lat, label: '해빙우회' })), ...out.slice(r.bIdx)];
  }
  return { out, spans: spans.length, applied, detourPts };
}

// ── 실행/검증 ──
const iceClass = process.argv[2] || 'PC5';
const month = process.argv[3] || '03';
const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'backend', 'data', 'monthly', `realIceData_month${month}.json`), 'utf8'));
const rioFn = makeRioSampler(dataset, iceClass);
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'arcticRoutes.js'), 'utf8');
function parseWps(b) { const w = [], r = /\{\s*lon:\s*(-?[0-9.]+),\s*lat:\s*(-?[0-9.]+),\s*label:\s*'([^']*)'/g; let x; while ((x = r.exec(b))) w.push({ lon: +x[1], lat: +x[2], label: x[3] }); return w; }
const ex = (k) => parseWps(src.match(new RegExp(k + ':\\s*\\[([\\s\\S]*?)\\n  \\],'))[1]);

function routeMinRio(wps) { let mn = Infinity; for (let i = 1; i < wps.length; i++) mn = Math.min(mn, minRioAlong(wps[i - 1], wps[i], rioFn)); return mn; }
function landCrossings(wps) { let n = 0; for (let i = 1; i < wps.length; i++) if (segBlockedDDA(wps[i - 1], wps[i])) n++; return n; }
function hardIceHits(wps) { let n = 0; for (let i = 1; i < wps.length; i++) if (minRioAlong(wps[i - 1], wps[i], rioFn) < HARD_BLOCK) n++; return n; }

console.log(`\n=== 빙급 ${iceClass}, ${month}월 해빙 ===`);
for (const k of ['NSR', 'NWP', 'TSR']) {
  const base = ex(k);
  const { out, spans, applied, detourPts } = applyIceDetours(base, rioFn);
  console.log(`\n${k}: base ${base.length}wp (최저RIO ${routeMinRio(base).toFixed(1)}, 육지${landCrossings(base)}, 고위험빙구간${hardIceHits(base)})`);
  console.log(`  → 위험span ${spans}, 우회적용 ${applied} (+${detourPts}wp) → ${out.length}wp`);
  console.log(`  결과: 최저RIO ${routeMinRio(out).toFixed(1)}, 육지관통 ${landCrossings(out)}, 고위험빙구간 ${hardIceHits(out)}`);
}
