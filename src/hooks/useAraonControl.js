// ═══════════════════════════════════════════════════════════════
// useAraonControl — 아라온(쇄빙선) 독립 운항 에이전트 (Live 모드)
// ───────────────────────────────────────────────────────────────
// 호출/복귀로 자체 운항하되, **본선의 항로(폴리라인)를 따라 이동**한다.
// 직선(대권)으로 가면 육지를 관통하므로, 아라온의 위치를 "항로 진행률
// (route progress)"로 표현해 항상 바다 위 항로를 따르게 한다.
//
//   1) 호출(active): 본선 앞 ESCORT_LEAD_KM 지점(항로 진행률)을 추종.
//      멀면 전속 선도(쇄빙), 닿으면 본선 속도로 추종 → 자연 감속 에스코트
//   2) 복귀(returning): 항로를 따라 모항(Wrangel) 근접 지점까지 → 정박(idle)
//   3) idle: Wrangel Island 사전배치 거점 대기
//
// 모항(Wrangel)은 항로 밖이라, 호출 시 항로상 "Wrangel 최근접 진행률"로
// 진입한 뒤 항로를 따라 이동한다. 시간은 본선과 동일 시뮬 배율로 압축.
// ═══════════════════════════════════════════════════════════════
import { useRef, useState, useEffect, useCallback } from 'react';
import { routePos, calculateRouteDistanceKM } from '../services/shipSimulator';

export const ARAON_HOME = { lat: 71.0, lon: 179.5 }; // Wrangel Island 북안

const SPEED_KN = 16;
const KN_TO_KMH = 1.852;
const ESCORT_LEAD_KM = 25; // 에스코트 시 본선 앞 유지 간격
// B안: 사전배치 거점(Wrangel)이 항로에서 이 거리 안을 지날 때만 호위 유효.
// NSR 은 Wrangel 북방 ~150km 를 통과하므로 충분. SUEZ/CAPE 나 역방향에서
// '항로상 Wrangel 최근접 = 부산(끝점)' 으로 스냅되어 도착지에 박히는 현상 방지.
const WRANGEL_REACH_KM = 400;
const TRANSIT_THRESHOLD_KM = 150; // 본선과 이 거리 밖이면 '선도', 안이면 '호위'
const DOCK_EPS = 0.004; // 진행률 기준 모항 근접 판정
const EARTH_R = 6371;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function bearingDeg(a, b) {
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) -
    Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// 항로 캐시 (waypoints 레퍼런스 기준): 총거리 + Wrangel 최근접 진행률 + 근접 유효성
let _routeCache = { wps: null, totalKm: 1, homeProg: 0.5, homeReachable: false };
function routeInfo(wps, timed) {
  if (!wps || wps.length < 2) return { totalKm: 1, homeProg: 0, homeReachable: false };
  if (_routeCache.wps === wps) return _routeCache;
  const totalKm = Math.max(1, calculateRouteDistanceKM(wps));
  // Wrangel 최근접 진행률 탐색 (0~1, 100분할)
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const p = routePos(t, timed, wps);
    if (!p) continue;
    const d = distanceKm(p, ARAON_HOME);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  // B안: 항로가 Wrangel 근방(WRANGEL_REACH_KM)을 실제로 지날 때만 호위 유효
  _routeCache = { wps, totalKm, homeProg: best, homeReachable: bestD <= WRANGEL_REACH_KM };
  return _routeCache;
}

/**
 * @param {() => number} opts.getShipProgress  본선 항로 진행률(0~1)
 * @param {() => ({waypoints:Array, timed:Array})} opts.getRoute  활성 항로
 * @param {() => number} opts.getMultiplier  시뮬 시간 배율
 * @param {() => boolean} opts.getActive  Live 모드 여부
 */
export default function useAraonControl({
  getShipProgress,
  getRoute,
  getMultiplier,
  getActive,
}) {
  // mode: 'idle' | 'active' | 'returning'
  const ref = useRef({ progress: 0.5, mode: 'idle', lat: ARAON_HOME.lat, lon: ARAON_HOME.lon, heading: 0 });
  const [araon, setAraon] = useState(() => ({
    lat: ARAON_HOME.lat,
    lon: ARAON_HOME.lon,
    heading: 0,
    mode: 'idle',
    status: 'idle',
    label: '대기 (Wrangel)',
  }));

  const callAraon = useCallback(() => {
    const s = ref.current;
    if (s.mode === 'idle') {
      // 항로상 Wrangel 최근접 지점으로 진입
      const { waypoints, timed } = getRoute() || {};
      const info = routeInfo(waypoints, timed);
      // B안: 항로가 Wrangel 사전배치 거점 근처를 안 지나면(비북극·역방향 등)
      // 호위가 물리적으로 불가 → 호출 무시(idle 유지). 도착지 부산에 박히는 현상 방지.
      if (!info.homeReachable) return;
      s.progress = info.homeProg;
    }
    s.mode = 'active';
  }, [getRoute]);

  const recallAraon = useCallback(() => {
    if (ref.current.mode !== 'idle') ref.current.mode = 'returning';
  }, []);
  const getMode = useCallback(() => ref.current.mode, []);

  useEffect(() => {
    let raf = null;
    let last = performance.now();
    let frame = 0;
    let lastMode = ref.current.mode;

    function loop(now) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!getActive || !getActive()) return;

      const s = ref.current;
      const route = getRoute() || {};
      const wps = route.waypoints;
      const timed = route.timed;
      if (!wps || wps.length < 2) return;
      const { totalKm, homeProg } = routeInfo(wps, timed);

      const mult = Math.max(1, (getMultiplier && getMultiplier()) || 1000);
      const stepKm = SPEED_KN * KN_TO_KMH * ((dt * mult) / 3600);
      const stepProg = stepKm / totalKm;

      let status = s.mode;
      let label = '대기 (Wrangel)';
      const shipProg = Math.max(0, Math.min(1, (getShipProgress && getShipProgress()) || 0));

      if (s.mode === 'returning') {
        // 항로를 따라 모항 최근접 진행률로 이동 → 도달 시 Wrangel 정박
        const target = homeProg;
        if (Math.abs(s.progress - target) <= Math.max(stepProg, DOCK_EPS)) {
          s.progress = target;
          s.mode = 'idle';
        } else {
          s.progress += s.progress < target ? stepProg : -stepProg;
        }
        if (s.mode === 'idle') {
          s.lat = ARAON_HOME.lat;
          s.lon = ARAON_HOME.lon;
          s.heading = 0;
          status = 'idle';
          label = '대기 (Wrangel)';
        } else {
          const p = routePos(s.progress, timed, wps);
          if (p) {
            s.heading = bearingDeg(s, p);
            s.lat = p.lat;
            s.lon = p.lon;
          }
          status = 'returning';
          label = '모항 복귀 중';
        }
      } else if (s.mode === 'active') {
        // 본선 앞 ESCORT_LEAD_KM 지점(진행률) 추종 — 항로 따라 이동(육지 회피)
        const target = Math.min(0.999, shipProg + ESCORT_LEAD_KM / totalKm);
        const prev = { lat: s.lat, lon: s.lon };
        if (Math.abs(s.progress - target) <= stepProg) {
          s.progress = target;
        } else {
          s.progress += s.progress < target ? stepProg : -stepProg;
        }
        const p = routePos(s.progress, timed, wps);
        if (p) {
          if (p.lat !== prev.lat || p.lon !== prev.lon) s.heading = bearingDeg(prev, p);
          s.lat = p.lat;
          s.lon = p.lon;
        }
        // 본선과 거리(항로상)로 선도/호위 판정
        const distToShipKm = Math.abs(s.progress - shipProg) * totalKm;
        if (distToShipKm > TRANSIT_THRESHOLD_KM) {
          status = 'escorting';
          label = '쇄빙 선도 (출동)';
        } else {
          status = 'escorting';
          label = '호위 중';
        }
      } else {
        // idle
        s.lat = ARAON_HOME.lat;
        s.lon = ARAON_HOME.lon;
        status = 'idle';
        label = '대기 (Wrangel)';
      }

      frame += 1;
      const modeChanged = s.mode !== lastMode;
      lastMode = s.mode;
      const idleQuiet = s.mode === 'idle' && !modeChanged;
      if (!idleQuiet && (frame % 10 === 0 || modeChanged)) {
        setAraon({
          lat: s.lat,
          lon: s.lon,
          heading: s.heading,
          mode: s.mode,
          status,
          label,
        });
      }
    }
    raf = requestAnimationFrame(loop);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [getShipProgress, getRoute, getMultiplier, getActive]);

  return { araon, callAraon, recallAraon, getMode };
}
