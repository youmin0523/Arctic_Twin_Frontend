/**
 * iceDetour.js
 *
 * 베이스 항로 국소 해빙 우회 (POLARIS RIO 기반).
 * - 실측 해빙 두께를 WMO 빙질 단계로 매핑 + 농도 + 선박 빙급 → POLARIS RIO 비용 산출
 * - 정밀 검증된 베이스 항로에서 RIO 가 낮은(위험) 구간만 0.05° 격자 A*(findIceDetour)로
 *   국소 우회. 우회가 최저 RIO 를 유의미하게 개선하고 육지/고위험빙을 지나지 않을 때만 채택.
 * - 베이스 항로의 육지-안전성을 보존하면서, 회피 가능한 위험 빙해역만 우회한다.
 *   (개빙수역=우회 불필요, 균질한 중빙역=우회 무익 → 모두 베이스 유지)
 */
import { calculateRIO } from './polarisRIO';
import {
  findIceDetour,
  isGlobalLandMaskReady,
  initGlobalLandMask,
} from './landMaskGlobal';

const DEG_TO_KM = 111.32;
const HARD_BLOCK = -10;     // POLARIS RIO < -10: 특별고려/회피 → 통과 불가로 간주
const RISK_TRIGGER = 0;     // RIO < 0 (상승위험) 구간을 우회 후보로 마킹
const IMPROVE_MARGIN = 0.5; // 최저 RIO 가 이만큼 이상 개선될 때만 우회 채택

function lonDelta(a, b) { let d = b - a; if (d > 180) d -= 360; if (d < -180) d += 360; return d; }

/** 실측 해빙 두께(m) → WMO 빙질 단계 (RIV_TABLE 키와 일치) */
export function thicknessToIceType(t) {
  if (t < 0.15) return 'Grey Ice';
  if (t < 0.30) return 'Grey-White Ice';
  if (t < 0.70) return 'Thin First-Year (FY)';
  if (t < 1.20) return 'Medium First-Year (FY)';
  if (t < 2.00) return 'Thick First-Year (FY)';
  if (t < 3.00) return 'Multi-Year (MY)';
  return 'Ridged/Hummocked';
}

/** 해빙 데이터셋({cells:[{lon,lat,lonStep,latStep,concentration,thickness}]}) → (lat,lon)=>{conc,thick} */
export function makeIceSampler(dataset) {
  const cells = (dataset && dataset.cells) || [];
  if (!cells.length) return () => ({ conc: 0, thick: 0 });
  const map = new Map();
  let lonStep = 1, latStep = 0.75;
  for (const c of cells) { map.set(`${c.lon}|${c.lat}`, c); lonStep = c.lonStep || lonStep; latStep = c.latStep || latStep; }
  const lat0s = [...new Set(cells.map((c) => c.lat))].sort((a, b) => a - b);
  return (lat, lon) => {
    const lonO = Math.floor(lon / lonStep) * lonStep;
    let latO = null;
    for (let i = lat0s.length - 1; i >= 0; i--) { if (lat0s[i] <= lat + 1e-9 && lat < lat0s[i] + latStep) { latO = lat0s[i]; break; } }
    if (latO === null) return { conc: 0, thick: 0 };
    const cell = map.get(`${lonO}|${latO}`);
    return cell ? { conc: cell.concentration || 0, thick: cell.thickness || 0 } : { conc: 0, thick: 0 };
  };
}

/** (lat,lon)=>POLARIS RIO. 두께→빙질 + 농도(tenths) + 선박 빙급 → calculateRIO. 개빙수역은 +20. */
export function makeRioSampler(dataset, iceClass = 'PC5') {
  const ice = makeIceSampler(dataset);
  return (lat, lon) => {
    const { conc, thick } = ice(lat, lon);
    if (conc <= 0.02) return 20;
    const tenths = Math.max(0, Math.min(10, conc * 10));
    const open = Math.max(0, 10 - tenths);
    return calculateRIO(iceClass, [
      { type: thicknessToIceType(thick), concentration_tenths: tenths },
      { type: 'Open Water', concentration_tenths: open },
    ]);
  };
}

/** 구간 [a,b] 를 따라 샘플링한 최저 RIO */
function minRioAlong(a, b, rioFn) {
  const segKm = Math.hypot((b.lat - a.lat) * DEG_TO_KM, lonDelta(a.lon, b.lon) * DEG_TO_KM * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180));
  const n = Math.max(2, Math.ceil(segKm / 10)); const dL = lonDelta(a.lon, b.lon);
  let mn = Infinity;
  for (let i = 0; i <= n; i++) { const t = i / n; mn = Math.min(mn, rioFn(a.lat + (b.lat - a.lat) * t, a.lon + dL * t)); }
  return mn;
}

/**
 * 베이스 항로에 POLARIS 기반 국소 해빙 우회 적용.
 * @param {Array<{lon,lat,label?}>} waypoints 베이스 항로(정밀 검증·육지청정)
 * @param {Object} dataset 해빙 데이터({cells:[...]})
 * @param {string} iceClass 선박 빙급 (예: 'PC5')
 * @returns {Promise<Array>} 우회 반영 항로 (개선 없으면 베이스 그대로)
 */
export async function applyIceDetours(waypoints, dataset, iceClass = 'PC5') {
  if (!Array.isArray(waypoints) || waypoints.length < 3) return waypoints;
  if (!dataset || !dataset.cells || !dataset.cells.length) return waypoints;
  if (!isGlobalLandMaskReady()) {
    try { await initGlobalLandMask(); } catch (_) { return waypoints; }
  }
  if (!isGlobalLandMaskReady()) return waypoints;

  const rioFn = makeRioSampler(dataset, iceClass);

  // 1) 세그먼트별 최저 RIO → 연속 위험(RIO<TRIGGER) span 추출
  const segRisk = [];
  for (let i = 1; i < waypoints.length; i++) segRisk.push(minRioAlong(waypoints[i - 1], waypoints[i], rioFn));
  const spans = [];
  let s = -1;
  for (let i = 0; i < segRisk.length; i++) {
    if (segRisk[i] < RISK_TRIGGER) { if (s === -1) s = i; }
    else if (s !== -1) { spans.push([s, i]); s = -1; }
  }
  if (s !== -1) spans.push([s, segRisk.length]);
  if (!spans.length) return waypoints;

  // 2) 각 span 양끝 WP 사이를 국소 우회. 개선(최저RIO↑)+실질 경유점 존재 시 채택.
  const replace = [];
  for (const [si, ei] of spans) {
    const aIdx = si;
    const bIdx = Math.min(waypoints.length - 1, ei + 1);
    if (bIdx <= aIdx) continue;
    const a = waypoints[aIdx], b = waypoints[bIdx];
    let baseMin = Infinity;
    for (let j = aIdx; j < bIdx; j++) baseMin = Math.min(baseMin, segRisk[j]);
    let det;
    try { det = findIceDetour(a, b, rioFn, { marginCells: 120 }); } catch (_) { det = null; }
    if (!det || det.length === 0) continue; // 실질 우회점 없으면 베이스 유지(WP 제거 방지)
    const detPath = [a, ...det, b];
    let detMin = Infinity;
    for (let i = 1; i < detPath.length; i++) detMin = Math.min(detMin, minRioAlong(detPath[i - 1], detPath[i], rioFn));
    if (detMin > baseMin + IMPROVE_MARGIN) replace.push({ aIdx, bIdx, det });
  }
  if (!replace.length) return waypoints;

  // 3) 뒤에서부터 splice (인덱스 보존)
  let out = waypoints.slice();
  for (const r of replace.sort((x, y) => y.aIdx - x.aIdx)) {
    out = [
      ...out.slice(0, r.aIdx + 1),
      ...r.det.map((d) => ({ lon: d.lon, lat: d.lat, label: '해빙우회' })),
      ...out.slice(r.bIdx),
    ];
  }
  return out;
}
