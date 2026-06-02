// ═══════════════════════════════════════════════════════════════
// Ship Physics / Motion / Route Interpolation
// Extracted from arctic-hybrid.html
//   - lines 1847-1879  (greatCircleDist, buildTimings, calculateRouteDistanceKM)
//   - lines 2044-2113  (slerpLonLat, routePos, routeHeading, getShipPosLonLat)
//   - lines 4503-4554  (getSeaState, updateShipMotion)
//   - lines 4614-4699  (updateShipPhysics)
// ═══════════════════════════════════════════════════════════════

import { BASE_GM } from '../data/vesselPresets.js';
import { collisionOutcome } from './collisionModel.js';

// ─── Route geometry helpers ───────────────────────────────────

/**
 * Great-circle angular distance (radians) between two {lon, lat} waypoints.
 */
export function greatCircleDist(a, b) {
  const R = Math.PI / 180,
    f1 = a.lat * R,
    f2 = b.lat * R,
    dl = (b.lon - a.lon) * R;
  return Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        Math.sin(f1) * Math.sin(f2) +
        Math.cos(f1) * Math.cos(f2) * Math.cos(dl),
      ),
    ),
  );
}

/**
 * Build normalised cumulative timing array from waypoints.
 * Each output entry = { ...wp, t: 0..1 } where t is fraction of total arc.
 */
export function buildTimings(wps) {
  const d = [0];
  for (let i = 1; i < wps.length; i++)
    d.push(d[d.length - 1] + greatCircleDist(wps[i - 1], wps[i]));
  const tot = d[d.length - 1];
  return wps.map((w, i) => ({ ...w, t: d[i] / tot }));
}

/**
 * Total route distance in kilometres.
 */
export function calculateRouteDistanceKM(wps) {
  if (!wps || wps.length < 2) return 0;
  let dist = 0;
  for (let i = 1; i < wps.length; i++) {
    dist += greatCircleDist(wps[i - 1], wps[i]);
  }
  return dist * 6371.0; // 지구 반지름 약 6371km
}

// ─── Voyage time estimation ───────────────────────────────────

// 기준 순항 속도 (노트). App.jsx 의 동적 일수 계산에서 하드코딩되어 있던 값을
// 단일 출처로 통합 — 거리 기반 항해 시간 산출에 사용.
export const CRUISE_SPEED_KNOTS = 15;
const KM_PER_NM = 1.852; // 1 해리 = 1.852 km

/**
 * 항로 거리와 순항 속도로 예상 항해 일수를 산출(최소 1일).
 * 기존 App.jsx 의 `Math.max(1, Math.round(distKm / (15 * 1.852 * 24)))` 를 대체.
 *
 * @param {Array}  wps         - 웨이포인트 배열
 * @param {number} speedKnots  - 순항 속도(노트), 기본 15
 * @returns {number} 정수 일수 (>= 1)
 */
export function estimateVoyageDays(wps, speedKnots = CRUISE_SPEED_KNOTS) {
  const distKm = calculateRouteDistanceKM(wps);
  const kmPerDay = speedKnots * KM_PER_NM * 24;
  if (!(kmPerDay > 0)) return 1;
  return Math.max(1, Math.round(distKm / kmPerDay));
}

/**
 * 예상 항해 시간(초). 시뮬레이션 클럭의 총 길이로 사용.
 */
export function estimateVoyageSeconds(wps, speedKnots = CRUISE_SPEED_KNOTS) {
  return estimateVoyageDays(wps, speedKnots) * 86400;
}

// ─── Spherical interpolation ──────────────────────────────────

/**
 * Spherical-linear interpolation between two {lon,lat} points.
 */
export function slerpLonLat(a, b, t) {
  const R = Math.PI / 180;
  const f1 = a.lat * R,
    l1 = a.lon * R,
    f2 = b.lat * R,
    l2 = b.lon * R;
  const x1 = Math.cos(f1) * Math.cos(l1),
    y1 = Math.cos(f1) * Math.sin(l1),
    z1 = Math.sin(f1);
  const x2 = Math.cos(f2) * Math.cos(l2),
    y2 = Math.cos(f2) * Math.sin(l2),
    z2 = Math.sin(f2);
  const dot = Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2));
  const om = Math.acos(dot);
  if (om < 1e-10) return { lon: a.lon, lat: a.lat };
  const s1 = Math.sin((1 - t) * om) / Math.sin(om),
    s2 = Math.sin(t * om) / Math.sin(om);
  const x = s1 * x1 + s2 * x2,
    y = s1 * y1 + s2 * y2,
    z = s1 * z1 + s2 * z2;
  return {
    lon: Math.atan2(y, x) / R,
    lat: Math.asin(Math.max(-1, Math.min(1, z))) / R,
  };
}

/**
 * Get interpolated {lon, lat, seg} position along a timed waypoint array.
 * @param {number}  p   - Progress 0..1
 * @param {Array}   TWP - Timed waypoints (output of buildTimings)
 * @param {Array}   WAYPOINTS - Original waypoint array (for fallback)
 */
export function routePos(p, TWP, WAYPOINTS) {
  p = Math.max(0, Math.min(1, p));
  for (let i = 0; i < TWP.length - 1; i++) {
    if (p <= TWP[i + 1].t) {
      const t = (p - TWP[i].t) / (TWP[i + 1].t - TWP[i].t);
      return { ...slerpLonLat(TWP[i], TWP[i + 1], t), seg: i };
    }
  }
  return {
    lon: WAYPOINTS[WAYPOINTS.length - 1].lon,
    lat: WAYPOINTS[WAYPOINTS.length - 1].lat,
    seg: WAYPOINTS.length - 2,
  };
}

/**
 * Compute heading (radians) at progress p along the route.
 * @param {number} p         - Progress 0..1
 * @param {Array}  TWP       - Timed waypoints
 * @param {Array}  WAYPOINTS - Original waypoints
 */
export function routeHeading(p, TWP, WAYPOINTS) {
  const a = routePos(p, TWP, WAYPOINTS),
    b = routePos(Math.min(1, p + 0.0005), TWP, WAYPOINTS);
  const cosLat = Math.cos((a.lat * Math.PI) / 180);
  return Math.atan2((b.lon - a.lon) * cosLat, b.lat - a.lat);
}

// 위경도-미터 변환 상수 (적도 기준)
export const METERS_PER_DEGREE_LAT = 111132.954; // 1도 위도당 미터
export const METERS_PER_DEGREE_LON_AT_EQUATOR = 111319.491; // 1도 경도당 미터 (적도)

/**
 * Convert Three.js shipPos (x,z) to real lon/lat coordinates.
 * In auto mode returns routePos; in manual mode projects from a base point.
 *
 * @param {Object}  shipPos        - { x, z } Three.js position
 * @param {number}  manualBaseLon  - Base longitude for manual mode
 * @param {number}  manualBaseLat  - Base latitude for manual mode
 * @param {boolean} isManual       - Whether manual steering is active
 * @param {number}  simProgress    - Current route progress 0..1
 * @param {Array}   TWP            - Timed waypoints
 * @param {Array}   WAYPOINTS      - Original waypoints
 */
export function getShipPosLonLat(shipPos, manualBaseLon, manualBaseLat, isManual, simProgress, TWP, WAYPOINTS) {
  // Three.js 엔진의 좌표를 위경도에 직접 투영하여 시각적 스케일 증폭
  // 위도를 먼저 계산한 뒤, 해당 위도 기준 mPerDegLon 사용 (고위도 경도 오차 보정)
  const currentLat =
    manualBaseLat - (shipPos.z * 1.5) / METERS_PER_DEGREE_LAT;
  const latRad = (currentLat * Math.PI) / 180;
  const metersPerDegreeLon =
    METERS_PER_DEGREE_LON_AT_EQUATOR * Math.cos(latRad);
  const currentLon =
    manualBaseLon + (shipPos.x * 1.5) / metersPerDegreeLon;
  if (!isManual) return routePos(simProgress, TWP, WAYPOINTS);
  return {
    lon: currentLon,
    lat: Math.max(-89.9, Math.min(89.9, currentLat)),
  };
}

// ─── Sea state ────────────────────────────────────────────────

/**
 * Simple latitude-based sea-state model.
 * Returns { Hs, Tp, label }.
 */
export function getSeaState(lat) {
  if (lat > 78) return { Hs: 0.6, Tp: 8, label: '결빙 해역 — 파도 낮음' };
  if (lat > 68)
    return { Hs: 1.5, Tp: 10, label: '해빙 경계 — 보통 파도' };
  if (lat > 50)
    return { Hs: 2.8, Tp: 12, label: '북극 외양 — 파도 높음' };
  return { Hs: 1.8, Tp: 9, label: '연안 해역' };
}

/**
 * 실측 파고가 있으면 그것을, 없으면 위도 기반 합성 sea-state 를 반환.
 * 현재 ThreeOverlay/App 에 흩어져 있던 "실측 우선, 위도 폴백" 우선순위를
 * 단일·검증 가능한 함수로 형식화한다.
 *
 * @param {number} lat       - 위도
 * @param {Object} realWave  - { Hs, Tp } 실측 파고(선택). 유효하지 않으면 무시.
 * @returns {Object} { Hs, Tp, label, source: 'real' | 'latitude' }
 */
export function resolveSeaState(lat, realWave) {
  if (
    realWave &&
    Number.isFinite(realWave.Hs) &&
    realWave.Hs >= 0
  ) {
    const Tp = Number.isFinite(realWave.Tp) && realWave.Tp > 0 ? realWave.Tp : 8;
    return { Hs: realWave.Hs, Tp, label: '실측 파고', source: 'real' };
  }
  return { ...getSeaState(lat), source: 'latitude' };
}

// ─── Ship motion (roll / pitch / heave) ───────────────────────

/**
 * Update wave-driven ship motion state (roll, pitch, heave).
 *
 * @param {number} dt       - Delta time (seconds)
 * @param {number} lat      - Current latitude
 * @param {Object} state    - Mutable motion state object with fields:
 *   motionWavePhase, shipRoll, shipRollVel, shipPitch, shipPitchVel,
 *   shipHeave, shipHeaveVel, impactActive, impactRoll, impactPitch,
 *   screenShakeT, fovImpactBoost, shipGM, omegaR, omegaP
 */
export function updateShipMotion(dt, lat, state) {
  // 실측 파고(state.realWave)가 주입돼 있으면 우선 사용, 없으면 위도 폴백.
  const st = resolveSeaState(lat, state.realWave);
  state.motionWavePhase += dt * ((2 * Math.PI) / st.Tp);
  const zetaR = 0.05,
    zetaP = 0.04;
  const rollAmpScale = Math.sqrt(BASE_GM / Math.max(0.5, state.shipGM));
  const aR =
    st.Hs *
    rollAmpScale *
    (0.018 * Math.sin(state.motionWavePhase + 0.3) +
      0.008 * Math.sin(state.motionWavePhase * 1.7 + 1.1));
  const aP =
    st.Hs *
    (0.008 * Math.sin(state.motionWavePhase * 1.3 + 2.0) +
      0.004 * Math.sin(state.motionWavePhase * 0.8 + 0.5));
  const aH = st.Hs * 0.3 * Math.sin(state.motionWavePhase * 0.9 + 0.7);
  state.shipRollVel +=
    (-2 * zetaR * state.omegaR * state.shipRollVel -
      state.omegaR * state.omegaR * state.shipRoll +
      aR) *
    dt;
  state.shipRoll += state.shipRollVel * dt;
  state.shipPitchVel +=
    (-2 * zetaP * state.omegaP * state.shipPitchVel -
      state.omegaP * state.omegaP * state.shipPitch +
      aP) *
    dt;
  state.shipPitch += state.shipPitchVel * dt;
  state.shipHeaveVel +=
    (-0.08 * state.shipHeaveVel - state.omegaR * state.omegaR * state.shipHeave + aH) * dt;
  state.shipHeave += state.shipHeaveVel * dt;
  if (state.impactActive) {
    state.impactRoll *= 0.9;
    state.impactPitch *= 0.9;
    if (Math.abs(state.impactRoll) < 0.0005 && Math.abs(state.impactPitch) < 0.0005)
      state.impactActive = false;
  }
  if (state.screenShakeT > 0) state.screenShakeT = Math.max(0, state.screenShakeT - dt);
  // FOV 충돌 부스트 소멸
  if (state.fovImpactBoost > 0) {
    state.fovImpactBoost *= 0.92;
    if (state.fovImpactBoost < 0.05) state.fovImpactBoost = 0;
  }
}

// ─── Manual ship physics (keyboard-driven) ────────────────────

/**
 * Update ship physics for manual (keyboard) steering mode.
 *
 * @param {number} dt    - Delta time (seconds)
 * @param {Object} state - Mutable state object with fields:
 *   isManual, keys, shipThrottle, shipSpeed, shipTurnRate, nearestIceDist,
 *   multiplier, maxSpeedBase, turnLerp, speedLerp, shipHeading,
 *   shipPos, shipGroup3, camRollTarget, tIcebergs,
 *   impactActive, impactRoll, impactPitch, screenShakeT,
 *   fovImpactBoost, iceDamageMult, inertiaFactor, fovCurrent, _dbgFrame
 */
export function updateShipPhysics(dt, state) {
  if (!state.isManual) return;
  const shift = state.keys['ShiftLeft'] || state.keys['ShiftRight'];
  if (state.keys['KeyX']) {
    state.shipThrottle = 0;
    state.shipSpeed = 0;
    state.shipTurnRate = 0;
    state.nearestIceDist = Infinity;
    return;
  }

  // 수동 운전: multiplier로 최고속도/선회율을 스케일 (lerp factor는 항상 1 미만 유지)
  const speedScale = Math.max(1, state.multiplier / 100);

  if (state.keys['KeyW'] || state.keys['ArrowUp']) state.shipThrottle = 1;
  else if (state.keys['KeyS'] || state.keys['ArrowDown']) state.shipThrottle = -0.3;
  else state.shipThrottle *= 0.92;

  const turnMax = Math.min(1.2 * speedScale, 6.0);
  const turnTarget =
    state.keys['KeyA'] || state.keys['ArrowLeft']
      ? -turnMax
      : state.keys['KeyD'] || state.keys['ArrowRight']
        ? turnMax
        : 0;
  state.shipTurnRate += (turnTarget - state.shipTurnRate) * Math.min(state.turnLerp, 0.9);

  const maxSpd = (shift ? state.maxSpeedBase * 2.5 : state.maxSpeedBase) * speedScale;
  state.shipSpeed += (state.shipThrottle * maxSpd - state.shipSpeed) * Math.min(state.speedLerp, 0.9);

  state.shipHeading += state.shipTurnRate * dt * speedScale;
  state.shipPos.x += Math.sin(state.shipHeading) * state.shipSpeed * dt * speedScale;
  state.shipPos.z -= Math.cos(state.shipHeading) * state.shipSpeed * dt * speedScale;

  state.shipGroup3.position.copy(state.shipPos);
  state.shipGroup3.rotation.y = -state.shipHeading;
  state.camRollTarget = -state.shipTurnRate * 0.06;

  // 빙산 충돌 + 위치 보정 (수동 모드)
  const SHIP_R = 20;
  let minD2 = Infinity;
  for (const ice of state.tIcebergs) {
    // grp.parent 확인: scene에서 분리된 객체 무시 (유령 충돌 방지)
    if (!ice.grp.visible || !ice.grp.parent) continue;
    const dx = state.shipPos.x - ice.cx,
      dz = state.shipPos.z - ice.cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < minD2) minD2 = d2;
    const minDist = SHIP_R + (ice.r || 20);
    if (d2 < minDist * minDist && d2 > 0.01) {
      const dist = Math.sqrt(d2);
      const overlap = minDist - dist;
      const nx = dx / dist, nz = dz / dist;
      // 선박 위치 보정 (밀어내기)
      state.shipPos.x += nx * overlap * 0.85;
      state.shipPos.z += nz * overlap * 0.85;
      // 빙산도 반발
      ice.cx -= nx * overlap * 0.15;
      ice.cz -= nz * overlap * 0.15;
      ice.grp.position.set(ice.cx, 0, ice.cz);
      if (!state.impactActive) {
        state.impactActive = true;
        // 충돌 결과 물리 모델: 빙급·빙산 규모·선속 기반 severity 산출
        // (기존 고정계수 `iceDamageMult*0.3` 대체 — 손상·감속·침로 편향 일관 반영)
        const approxKnots = state.maxSpeedBase > 0
          ? Math.min(20, (Math.abs(state.shipSpeed) / state.maxSpeedBase) * 18)
          : Math.abs(state.shipSpeed);
        // 충돌 입사각: 선속 방향 vs 충돌 법선의 정렬도(|dot|~1 정면, ~0 빗겨맞음)
        const dot = Math.sin(state.shipHeading) * nx - Math.cos(state.shipHeading) * nz;
        const outcome = collisionOutcome({
          speedKnots: approxKnots,
          icebergLengthM: (ice.r || 20) * 100,
          iceClass: state.iceClass,
          glancing: Math.abs(dot) < 0.5,
        });
        state.lastCollision = outcome;
        state.hullDamage = Math.min(1, (state.hullDamage || 0) + outcome.damageIncrement);
        // 결과를 모션/감속/침로에 반영 (severity 스케일)
        state.impactRoll = (Math.random() > 0.5 ? 1 : -1) * (0.12 + 0.2 * outcome.severity);
        state.impactPitch = -(0.06 + 0.12 * outcome.severity);
        state.screenShakeT = 0.3 + 0.4 * outcome.severity;
        state.fovImpactBoost = 8 + 14 * outcome.severity;
        state.shipSpeed *= 1 - outcome.speedLossFactor * (state.inertiaFactor ?? 1);
        // 침로 편향(yaw) — 기존엔 yaw 고정이었음(발표자료 #4)
        state.shipHeading +=
          (dot >= 0 ? 1 : -1) * (outcome.headingDeflectionDeg * Math.PI) / 180;
      }
    }
  }
  state.nearestIceDist = Math.sqrt(minD2);
  state.shipGroup3.position.copy(state.shipPos); // 보정 후 재적용

  state._dbgFrame++;
  if (state._dbgFrame % 60 === 0)
    console.log(
      'pos:',
      state.shipPos.x.toFixed(1),
      state.shipPos.z.toFixed(1),
      'spd:',
      state.shipSpeed.toFixed(1) + 'm/s',
      'fov:',
      state.fovCurrent.toFixed(0) + '\u00B0',
    );
}
