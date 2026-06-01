/**
 * landMaskGlobal.js  (단계 B: 런타임 전역 육지 마스크)
 * ===================================================
 * Natural Earth 10m 해안선에서 만든 0.05° 전역 비트팩 마스크를 로드하여
 *   - isLandGlobal(lat, lon)        : 전 지구 육지 판정
 *   - landAheadGlobal(...)          : 전방 육지 감지(연안/항만 포함)
 *   - findWaterDetour(from, to)     : 격자 A* 로 해상 우회 경로 산출(런타임 리루팅용)
 * 를 제공한다. (북극 전용 landMask.json 의 전역 대체)
 */

let packed = null;
let META = null;

export function isGlobalLandMaskReady() {
  return packed !== null;
}

export async function initGlobalLandMask() {
  if (packed) return true;
  try {
    const [metaRes, binRes] = await Promise.all([
      fetch('/data/landMaskGlobal.meta.json'),
      fetch('/data/landMaskGlobal.bin'),
    ]);
    if (!metaRes.ok || !binRes.ok) throw new Error('fetch 실패');
    META = await metaRes.json();
    packed = new Uint8Array(await binRes.arrayBuffer());
    console.log(`[landMaskGlobal] 전역 마스크 로드 (${META.cols}×${META.rows}, ${META.res}°, ${(packed.length / 1e6).toFixed(2)}MB)`);
    return true;
  } catch (e) {
    console.warn('[landMaskGlobal] 로드 실패 — 전역 육지 회피 비활성화:', e.message);
    packed = null;
    return false;
  }
}

function cellLand(col, row) {
  if (!packed || row < 0 || row >= META.rows) return false;
  const c = ((col % META.cols) + META.cols) % META.cols;
  const idx = row * META.cols + c;
  return (packed[idx >> 3] >> (idx & 7) & 1) === 1;
}
const colOf = (lon) => Math.floor((lon + 180) / META.res);
const rowOf = (lat) => Math.floor((lat + 90) / META.res);
const lonOfCol = (c) => -180 + (c + 0.5) * META.res;
const latOfRow = (r) => -90 + (r + 0.5) * META.res;

/** 전 지구 육지 판정. 마스크 미로드 시 false. */
export function isLandGlobal(lat, lon) {
  if (!packed) return false;
  if (lat < -90 || lat > 90) return false;
  return cellLand(colOf(lon), rowOf(lat));
}

const DEG_TO_KM = 111.32;
function lonDelta(a, b) { let d = b - a; if (d > 180) d -= 360; if (d < -180) d += 360; return d; }
function wrapLon(x) { return ((x + 180) % 360 + 360) % 360 - 180; }

/**
 * 진행 방향 전방으로 육지 스캔.
 * @returns {{ blocked: boolean, distanceKm: number }}
 */
export function landAheadGlobal(lat, lon, heading, lookAheadKm = 90, stepKm = 6) {
  if (!packed) return { blocked: false, distanceKm: Infinity };
  const hdg = ((heading || 0) * Math.PI) / 180;
  const cosLat = Math.cos((lat * Math.PI) / 180) || 1e-3;
  for (let d = stepKm; d <= lookAheadKm; d += stepKm) {
    const cLat = lat + (Math.cos(hdg) * d) / DEG_TO_KM;
    const cLon = wrapLon(lon + (Math.sin(hdg) * d) / (DEG_TO_KM * cosLat));
    if (isLandGlobal(cLat, cLon)) return { blocked: true, distanceKm: d };
  }
  return { blocked: false, distanceKm: Infinity };
}

function snapToWater(col, row) {
  if (!cellLand(col, row)) return [col, row];
  const seen = new Set([row * META.cols + col]);
  let frontier = [[col, row]];
  for (let ring = 0; ring < 120 && frontier.length; ring++) {
    const next = [];
    for (const [cc, rr] of frontier) {
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = ((cc + dc) % META.cols + META.cols) % META.cols, nr = rr + dr;
        if (nr < 0 || nr >= META.rows) continue;
        const key = nr * META.cols + nc;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!cellLand(nc, nr)) return [nc, nr];
        next.push([nc, nr]);
      }
    }
    frontier = next;
  }
  return [col, row];
}

/**
 * 격자 A* 로 from→to 해상 우회 경로 산출(런타임 리루팅).
 * 탐색은 두 점 bbox 를 marginCells 만큼 확장한 창으로 제한(성능).
 *
 * @returns {Array<{lon,lat}>|null} 우회 경유점(시작/끝 제외), 실패 시 null
 */
export function findWaterDetour(from, to, opts = {}) {
  if (!packed) return null;
  const marginCells = opts.marginCells ?? 60;     // ≈ 3° 여유
  const maxIter = opts.maxIter ?? 120000;
  const [sc, sr] = snapToWater(colOf(from.lon), rowOf(from.lat));
  const [gc, gr] = snapToWater(colOf(to.lon), rowOf(to.lat));

  // 탐색 창(행은 절대, 열은 from 기준 상대 — 날짜변경선 래핑 대응)
  const relGC = sc + lonDelta(lonOfCol(sc), lonOfCol(gc)) / META.res; // gc 를 sc 인근 좌표계로
  const minR = Math.max(0, Math.min(sr, gr) - marginCells);
  const maxR = Math.min(META.rows - 1, Math.max(sr, gr) + marginCells);
  const minRelC = Math.min(sc, relGC) - marginCells;
  const maxRelC = Math.max(sc, relGC) + marginCells;

  const key = (c, r) => r * META.cols + ((c % META.cols) + META.cols) % META.cols;
  const g = new Map(), came = new Map(), open = new Map();
  const relCol = new Map(); // key -> 상대 열(연속 좌표)
  const startKey = key(sc, sr);
  g.set(startKey, 0); open.set(startKey, 0); relCol.set(startKey, sc);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const goalKey = key(gc, gr);
  let iter = 0;

  while (open.size && iter++ < maxIter) {
    let curKey = -1, curF = Infinity;
    for (const [k, f] of open) if (f < curF) { curF = f; curKey = k; }
    open.delete(curKey);
    if (curKey === goalKey) break;
    const cr = Math.floor(curKey / META.cols);
    const ccCol = curKey % META.cols;
    const ccRel = relCol.get(curKey);
    const cg = g.get(curKey);
    for (const [dc, dr] of dirs) {
      const nrAbs = cr + dr;
      if (nrAbs < minR || nrAbs > maxR) continue;
      const nRel = ccRel + dc;
      if (nRel < minRelC || nRel > maxRelC) continue;
      const nc = ((Math.round(nRel) % META.cols) + META.cols) % META.cols;
      if (cellLand(nc, nrAbs)) continue;
      // 대각 이동은 코너 컷팅 금지 — 인접 직교 셀이 육지면 불가
      if (dc && dr) {
        const orthACol = (((ccCol + dc) % META.cols) + META.cols) % META.cols;
        if (cellLand(orthACol, cr) || cellLand(ccCol, nrAbs)) continue;
      }
      const nk = nrAbs * META.cols + nc;
      const step = (dc && dr) ? 1.4142 : 1;
      const ng = cg + step;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng); came.set(nk, curKey); relCol.set(nk, nRel);
        const gRel = ccRel + lonDelta(lonOfCol(nc), lonOfCol(gc)) / META.res;
        const h = Math.hypot(Math.abs(nRel - (sc + (relGC - sc))), nrAbs - gr);
        open.set(nk, ng + h);
      }
    }
  }
  if (!came.has(goalKey) && key(gc, gr) !== startKey) return null;

  // 경로 복원
  const cells = [];
  let k = goalKey;
  let guard = 0;
  while (k !== undefined && guard++ < 100000) { cells.push(k); k = came.get(k); }
  cells.reverse();
  if (cells.length < 2) return null;

  // 셀 경로 + 호출자의 실제 from/to 를 양끝에 포함(연결 구간까지 검증)
  const cellPts = cells.map((kk) => ({ lon: lonOfCol(kk % META.cols), lat: latOfRow(Math.floor(kk / META.cols)) }));
  const pts = [from, ...cellPts, to];

  const segLand = (a, b) => {
    const segKm = Math.hypot((b.lat - a.lat) * DEG_TO_KM, lonDelta(a.lon, b.lon) * DEG_TO_KM * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180));
    const n = Math.max(2, Math.ceil(segKm / 2.5)); // ~2.5km 미세 샘플링
    const dL = lonDelta(a.lon, b.lon);
    for (let i = 1; i < n; i++) { const t = i / n; if (isLandGlobal(a.lat + (b.lat - a.lat) * t, wrapLon(a.lon + dL * t))) return true; }
    return false;
  };

  // 라인-오브-사이트 단순화 (안전: 바이패스가 육지면 직전 점 유지)
  const out = [pts[0]];
  let anchor = 0;
  for (let i = 2; i < pts.length; i++) {
    if (segLand(pts[anchor], pts[i])) { out.push(pts[i - 1]); anchor = i - 1; }
  }
  out.push(pts[pts.length - 1]);

  // 최종 안전성 검증 — 단순화 결과에 잔여 교차가 있으면 미단순화 전체 경로 사용
  let safe = true;
  for (let i = 0; i < out.length - 1; i++) if (segLand(out[i], out[i + 1])) { safe = false; break; }
  const finalPts = safe ? out : pts;

  // 시작/끝(from,to) 제외한 경유점만 반환
  return finalPts.slice(1, -1).map((p) => ({ lon: +p.lon.toFixed(3), lat: +p.lat.toFixed(3) }));
}
