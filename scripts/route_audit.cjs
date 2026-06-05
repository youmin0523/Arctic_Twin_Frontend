/**
 * route_audit.cjs — 항로 웨이포인트 육지관통 감사 + 해상 센터라인 도우미
 *
 * 0.05° 전역 육지 마스크(public/data/landMaskGlobal.bin)를 진실값으로 사용.
 *   node route_audit.cjs                 → SUEZ/CAPE 전체 감사
 *   node route_audit.cjs center <lat> <lonMin> <lonMax>  → 해당 위도 해상 중심 경도
 *   node route_audit.cjs scanred         → 홍해 센터라인 자동 생성
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'public', 'data');
const META = JSON.parse(fs.readFileSync(path.join(DATA, 'landMaskGlobal.meta.json')));
const buf = fs.readFileSync(path.join(DATA, 'landMaskGlobal.bin'));
const packed = new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
const DEG_TO_KM = 111.32;

function cellLand(col, row) {
  if (row < 0 || row >= META.rows) return false;
  const c = ((col % META.cols) + META.cols) % META.cols;
  const idx = row * META.cols + c;
  return (packed[idx >> 3] >> (idx & 7) & 1) === 1;
}
const colOf = (l) => Math.floor((l + 180) / META.res);
const rowOf = (l) => Math.floor((l + 90) / META.res);
const isLand = (lat, lon) => cellLand(colOf(lon), rowOf(lat));
function lonDelta(a, b) { let d = b - a; if (d > 180) d -= 360; if (d < -180) d += 360; return d; }

// 좁은 실제 항행 해협/운하 — 0.05° 마스크가 "육지"로 닫지만 통항 가능.
// 단일 출처: public/data/navigableCorridors.json (프론트 런타임과 공유).
const CORR = JSON.parse(fs.readFileSync(path.join(DATA, 'navigableCorridors.json')));
function distToSegKm(plat, plon, alon, alat, blon, blat) {
  const k = Math.cos((plat) * Math.PI / 180);
  const ax = alon * k, ay = alat, bx = blon * k, by = blat, px = plon * k, py = plat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy) * DEG_TO_KM;
}
function inCorridor(lat, lon) {
  for (const b of CORR.boxes)
    if (lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax) return true;
  for (const ln of CORR.lanes) {
    for (let i = 1; i < ln.points.length; i++) {
      const [alon, alat] = ln.points[i - 1], [blon, blat] = ln.points[i];
      if (distToSegKm(lat, lon, alon, alat, blon, blat) <= ln.bufferKm) return true;
    }
  }
  return false;
}

function segCrossesLand(a, b) {
  const segKm = Math.hypot(
    (b.lat - a.lat) * DEG_TO_KM,
    lonDelta(a.lon, b.lon) * DEG_TO_KM * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180));
  const n = Math.max(2, Math.ceil(segKm / 5));
  let hits = 0, worst = null;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const lat = a.lat + (b.lat - a.lat) * t;
    const lon = a.lon + lonDelta(a.lon, b.lon) * t;
    if (isLand(lat, lon) && !inCorridor(lat, lon)) {
      hits++;
      if (!worst) worst = { lat: +lat.toFixed(3), lon: +lon.toFixed(3) };
    }
  }
  return { segKm: Math.round(segKm), hits, worst };
}

/** 해당 위도에서 [lonMin,lonMax] 내 가장 넓은 연속 해상 구간의 중심 경도 */
function seaCenter(lat, lonMin, lonMax) {
  let best = null, run = null;
  for (let lon = lonMin; lon <= lonMax; lon += META.res) {
    if (!isLand(lat, lon)) {
      if (!run) run = { s: lon, e: lon }; else run.e = lon;
    } else if (run) { if (!best || run.e - run.s > best.e - best.s) best = run; run = null; }
  }
  if (run && (!best || run.e - run.s > best.e - best.s)) best = run;
  return best ? +(((best.s + best.e) / 2)).toFixed(2) : null;
}

// 출발/도착 항구로부터 ~20km 이내 표본은 항만 접안 구간으로 보고 면제
function nearPort(lat, lon, ports) {
  return ports.some((p) => {
    const km = Math.hypot((lat - p.lat) * DEG_TO_KM, lonDelta(p.lon, lon) * DEG_TO_KM * Math.cos((lat + p.lat) / 2 * Math.PI / 180));
    return km < 30;
  });
}

function auditRoute(name, wps) {
  console.log(`\n========== ${name} (${wps.length} wp) ==========`);
  const ports = [wps[0], wps[wps.length - 1]];
  let wpLand = 0;
  wps.forEach((w, i) => {
    if (i === 0 || i === wps.length - 1) return; // 항구 끝점 면제
    if (isLand(w.lat, w.lon) && !inCorridor(w.lat, w.lon)) {
      wpLand++; console.log(`  WP LAND [#${i}] ${w.label} (${w.lon},${w.lat})`);
    }
  });
  if (!wpLand) console.log('  ✓ 모든 (비항구) 웨이포인트 해상/통항회랑');
  let bad = 0;
  for (let i = 1; i < wps.length; i++) {
    const s = segCrossesLand(wps[i - 1], wps[i]);
    if (s.hits > 0) {
      if (s.worst && nearPort(s.worst.lat, s.worst.lon, ports)) continue; // 항만 접안 면제
      bad++;
      console.log(`  SEG CROSS [#${i - 1}->#${i}] ${wps[i - 1].label} -> ${wps[i].label} | ${s.segKm}km, hits ${s.hits}, @(${s.worst.lon},${s.worst.lat})`);
    }
  }
  console.log(bad ? `  ✗ 육지관통 구간 ${bad}` : `  ✓ 육지관통 구간 0 (항만 접안 제외)`);
  return { wpLand, bad };
}

module.exports = { isLand, seaCenter, auditRoute, inCorridor, segCrossesLand };

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'center') {
    const [lat, a, b] = process.argv.slice(3).map(Number);
    console.log(`lat ${lat}: 해상중심 lon = ${seaCenter(lat, a, b)}`);
  } else if (cmd === 'scanred') {
    console.log('홍해 센터라인 (lat 13.8 → 27.2, lon 32~44):');
    for (let lat = 13.8; lat <= 27.3; lat += 0.6) {
      console.log(`  { lat: ${lat.toFixed(1)}, lon: ${seaCenter(lat, 32, 44)} },`);
    }
  } else {
    // 실데이터 전체 감사는 verify_routes.cjs 사용
    require('./verify_routes.cjs');
  }
}
