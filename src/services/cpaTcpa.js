/**
 * cpaTcpa.js
 *
 * CPA(Closest Point of Approach) / TCPA(Time to CPA) 기반 충돌 위협 판정.
 *
 * 기존 회피 컨트롤러는 정적 반경(50km 이내) 거리만으로 위협을 판정해, 멀어지는
 * 빙산도 위협으로 보거나 빠르게 접근하는 위협의 임박도를 구분하지 못했다.
 * CPA/TCPA 는 상대 속도 벡터를 사용해 "가장 가까워지는 시점의 거리와 그 시각"을
 * 계산하므로, 불필요한 회피를 줄이고 임박 위협을 조기에 식별한다.
 *
 * 순수 함수 — 평면 근사(선박 위도 기준 km 투영)로 계산한다(국지 범위에서 충분).
 */

const KM_PER_DEG_LAT = 111.32;
const KNOT_TO_KMH = 1.852;

/**
 * 기준점(refLat,refLon) 기준 (lat,lon)의 국지 평면 좌표(km)로 변환.
 * x = 동쪽(+), y = 북쪽(+).
 */
export function toLocalKm(refLat, refLon, lat, lon) {
  const cosLat = Math.cos((refLat * Math.PI) / 180) || 1e-6;
  return {
    x: (lon - refLon) * KM_PER_DEG_LAT * cosLat,
    y: (lat - refLat) * KM_PER_DEG_LAT,
  };
}

/**
 * 속도(노트) + 방위(도, 북=0 시계방향)를 km/h 속도 벡터로 변환.
 * @returns {{vx: number, vy: number}} 동/북 성분(km/h)
 */
export function velocityVector(speedKnots, headingDeg) {
  const v = (speedKnots || 0) * KNOT_TO_KMH;
  const h = ((headingDeg || 0) * Math.PI) / 180;
  return { vx: v * Math.sin(h), vy: v * Math.cos(h) };
}

/**
 * 선박과 표적(빙산) 사이 CPA/TCPA 계산.
 *
 * @param {Object} ship   - { lat, lon, speedKnots, headingDeg }
 * @param {Object} target - { lat, lon, speedKnots?, headingDeg? } (빙산은 보통 정지)
 * @returns {{ currentKm: number, cpaKm: number, tcpaHours: number, closing: boolean }}
 *   - currentKm : 현재 거리
 *   - cpaKm     : 최근접 시점의 거리 (미래에만; 과거면 현재 거리)
 *   - tcpaHours : 최근접까지 시간(시간). 멀어지는 중이면 0.
 *   - closing   : 접근 중 여부
 */
export function computeCPA(ship, target) {
  // 선박 위치 기준 평면. 선박은 원점.
  const R = toLocalKm(ship.lat, ship.lon, target.lat, target.lon); // 상대 위치 (표적-선박)
  const vs = velocityVector(ship.speedKnots, ship.headingDeg);
  const vt = velocityVector(target.speedKnots || 0, target.headingDeg || 0);
  const Vx = vt.vx - vs.vx; // 상대 속도 (표적-선박)
  const Vy = vt.vy - vs.vy;

  const currentKm = Math.hypot(R.x, R.y);
  const v2 = Vx * Vx + Vy * Vy;

  // 상대속도 0 → 거리 불변
  if (v2 < 1e-9) {
    return { currentKm, cpaKm: currentKm, tcpaHours: 0, closing: false };
  }

  const tcpa = -(R.x * Vx + R.y * Vy) / v2; // 시간(h)

  if (tcpa <= 0) {
    // 이미 최근접 지났음 — 멀어지는 중
    return { currentKm, cpaKm: currentKm, tcpaHours: 0, closing: false };
  }

  const cx = R.x + Vx * tcpa;
  const cy = R.y + Vy * tcpa;
  return {
    currentKm,
    cpaKm: Math.hypot(cx, cy),
    tcpaHours: tcpa,
    closing: true,
  };
}

/**
 * CPA/TCPA 로 단일 표적의 위협 여부 판정.
 *
 * @param {Object} ship
 * @param {Object} target
 * @param {Object} opts
 * @param {number} opts.safetyKm     - CPA 가 이 거리 미만이면 위협 (기본 10)
 * @param {number} opts.horizonHours - TCPA 가 이 시간 이내여야 위협 (기본 6)
 * @returns {{ threat: boolean, cpaKm: number, tcpaHours: number, currentKm: number, closing: boolean }}
 */
export function assessThreat(ship, target, { safetyKm = 10, horizonHours = 6 } = {}) {
  const cpa = computeCPA(ship, target);
  const threat = cpa.closing && cpa.cpaKm < safetyKm && cpa.tcpaHours <= horizonHours;
  return { threat, ...cpa };
}

/**
 * 여러 표적 중 가장 임박한(TCPA 최소) 위협을 반환.
 * @returns {Object|null} { index, target, ...cpa } 또는 위협 없으면 null
 */
export function mostImminentThreat(ship, targets, opts = {}) {
  let best = null;
  (targets || []).forEach((target, index) => {
    const a = assessThreat(ship, target, opts);
    if (a.threat && (best === null || a.tcpaHours < best.tcpaHours)) {
      best = { index, target, ...a };
    }
  });
  return best;
}
