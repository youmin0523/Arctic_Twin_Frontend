/**
 * checkRouteLand.mjs
 * ==================
 * Natural Earth 10m 해안선(육지 + 군소도서)으로 모든 항로 구간이 육지를
 * 가로지르는지 정밀 검증한다. (빌드/개발 시 실행 — 런타임 아님)
 *
 *   node frontend/scripts/checkRouteLand.mjs
 *
 * 데이터: backend/data/coastline/ne_10m_land.geojson, ne_10m_minor_islands.geojson
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ROUTES } from '../src/data/arcticRoutes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COAST_DIR = join(__dirname, '..', '..', 'backend', 'data', 'coastline');

// ── 해안선 폴리곤 적재 + bbox 인덱스 ───────────────────────────────
function loadPolys(file) {
  const gj = JSON.parse(readFileSync(join(COAST_DIR, file), 'utf-8'));
  const polys = [];
  for (const feat of gj.features) {
    const g = feat.geometry;
    if (!g) continue;
    const multi = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    for (const poly of multi) {
      // poly[0]=외곽 ring, poly[1..]=구멍(호수 등)
      let minX = 180, minY = 90, maxX = -180, maxY = -90;
      for (const [x, y] of poly[0]) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      polys.push({ bbox: [minX, minY, maxX, maxY], rings: poly });
    }
  }
  return polys;
}

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const LAND = [...loadPolys('ne_10m_land.geojson'), ...loadPolys('ne_10m_minor_islands.geojson')];
console.log(`해안선 폴리곤 ${LAND.length}개 적재 (10m land + minor islands)\n`);

function isLand(lon, lat) {
  for (const p of LAND) {
    const [minX, minY, maxX, maxY] = p.bbox;
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue;
    if (!pointInRing(lon, lat, p.rings[0])) continue;
    let inHole = false;
    for (let h = 1; h < p.rings.length; h++) {
      if (pointInRing(lon, lat, p.rings[h])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

const DEG_TO_KM = 111.32;
// 날짜변경선(180°) 횡단 시 짧은 쪽으로 경도 차를 정규화
function lonDelta(lon1, lon2) {
  let d = lon2 - lon1;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
function wrapLon(lon) {
  let x = ((lon + 180) % 360 + 360) % 360 - 180;
  return x;
}
function distKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG_TO_KM;
  const dLon = lonDelta(lon1, lon2) * DEG_TO_KM * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

// 항로 구간 검증 — 정밀 해안선이므로 임계 3km(좁은 해협은 실제 바다로 판정됨)
function findCrossings(wps, sampleKm = 2, minRunKm = 3) {
  const out = [];
  for (let s = 0; s < wps.length - 1; s++) {
    const a = wps[s], b = wps[s + 1];
    const segKm = distKm(a.lat, a.lon, b.lat, b.lon);
    const n = Math.max(2, Math.ceil(segKm / sampleKm));
    const stepKm = segKm / n;
    let run = 0, mid = null, best = null;
    const flush = () => {
      const runKm = run * stepKm;
      if (runKm >= minRunKm && (!best || runKm > best.runKm)) best = { mid, runKm };
      run = 0; mid = null;
    };
    const dLon = lonDelta(a.lon, b.lon);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const lat = a.lat + (b.lat - a.lat) * t;
      const lon = wrapLon(a.lon + dLon * t);
      if (isLand(lon, lat)) { run++; if (!mid) mid = { lon: +lon.toFixed(3), lat: +lat.toFixed(3) }; }
      else if (run) flush();
    }
    if (run) flush();
    if (best) out.push({ from: a.label || `wp${s}`, to: b.label || `wp${s + 1}`, segIndex: s, at: best.mid, runKm: Math.round(best.runKm) });
  }
  return out;
}

let total = 0;
for (const [name, wps] of Object.entries(ROUTES)) {
  const cr = findCrossings(wps);
  total += cr.length;
  if (cr.length) {
    console.log(`❌ ${name}: 육지 관통 ${cr.length}건`);
    for (const c of cr) console.log(`     [${c.segIndex}] ${c.from} → ${c.to}  (${c.runKm}km @ ${c.at.lon},${c.at.lat})`);
  } else {
    console.log(`✅ ${name}: 육지 관통 없음`);
  }
}
console.log(`\n총 육지 관통 구간: ${total}건`);
process.exit(total > 0 ? 1 : 0);
