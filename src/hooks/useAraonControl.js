// ═══════════════════════════════════════════════════════════════
// useAraonControl — 아라온(쇄빙선) 독립 운항 에이전트 (Live 모드)
// ───────────────────────────────────────────────────────────────
// 기존 Live 아라온은 "본선 위치+해빙농도로 매 프레임 계산되는 파생 위치"라
// 자체 항법·호출/복귀가 없었다. 이 훅은 아라온을 독립 객체로 만들어:
//
//   1) 본선이 없거나 정지해도 호출/복귀로 단독 운항 (자체 rAF 루프)
//   2) 본선과 멀면(>TRANSIT_THRESHOLD) 전속으로 앞서 나가 미리 쇄빙(선도),
//      거리가 좁혀지면 본선 앞 ESCORT_LEAD_KM 지점을 추종 → 자연 감속 에스코트
//   3) 호출 시 목표(본선/항로 전방)로 이동 — 부산항 등 어디든 가능
//   4) 복귀 시 모항(Wrangel)으로 항해 후 정박(idle)
//
// 시간은 본선과 동일하게 시뮬 배율(multiplier)로 압축해 움직인다.
// ═══════════════════════════════════════════════════════════════
import { useRef, useState, useEffect, useCallback } from 'react';

// 모항: Wrangel Island 북안 (backend models.py 와 동일)
export const ARAON_HOME = { lat: 71.0, lon: 179.5 };

const SPEED_KN = 16;                 // 아라온 항해 속력 (models.py speed_knots)
const KN_TO_KMH = 1.852;
const ESCORT_LEAD_KM = 25;           // 에스코트 시 본선 앞 유지 간격
const TRANSIT_THRESHOLD_KM = 150;    // 이 거리 밖이면 '선도(전속)', 안이면 '호위'
const DOCK_RADIUS_KM = 5;            // 모항 근접 → 정박(idle) 판정
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

function destPoint(a, brgDeg, distKm) {
  const δ = distKm / EARTH_R;
  const θ = toRad(brgDeg);
  const la1 = toRad(a.lat);
  const lo1 = toRad(a.lon);
  const la2 = Math.asin(
    Math.sin(la1) * Math.cos(δ) + Math.cos(la1) * Math.sin(δ) * Math.cos(θ),
  );
  const lo2 =
    lo1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(la1),
      Math.cos(δ) - Math.sin(la1) * Math.sin(la2),
    );
  return { lat: toDeg(la2), lon: ((toDeg(lo2) + 540) % 360) - 180 };
}

// from → to 로 stepKm 만큼 이동 (도달 시 to 반환). 핵심: 멀면 전속, 가까우면
// 목표(=본선 앞 lead 점)가 본선 속도로 전진하므로 자연히 그 속도로 추종(감속).
function moveToward(from, to, stepKm) {
  const d = distanceKm(from, to);
  if (d <= stepKm || d === 0) return { lat: to.lat, lon: to.lon, arrived: true };
  const p = destPoint(from, bearingDeg(from, to), stepKm);
  return { lat: p.lat, lon: p.lon, arrived: false };
}

/**
 * @param {object} opts
 * @param {() => ({lat:number,lon:number})|null} opts.getShipState  현재 본선 위치
 * @param {() => ({lat:number,lon:number})|null} opts.getLeadPoint  본선 앞 lead 점(항로 전방). 없으면 본선 위치 사용
 * @param {() => number} opts.getMultiplier  시뮬 시간 배율(본선과 동일 압축)
 * @param {() => boolean} opts.getActive  Live 모드 + 활성 여부 (false 면 루프 정지)
 */
export default function useAraonControl({
  getShipState,
  getLeadPoint,
  getMultiplier,
  getActive,
}) {
  // mode: 'idle' | 'active' | 'returning'
  const ref = useRef({ lat: ARAON_HOME.lat, lon: ARAON_HOME.lon, heading: 0, mode: 'idle' });
  const [araon, setAraon] = useState(() => ({
    lat: ARAON_HOME.lat,
    lon: ARAON_HOME.lon,
    heading: 0,
    mode: 'idle',
    status: 'idle',
    label: '대기 (Wrangel)',
  }));

  const callAraon = useCallback(() => {
    ref.current.mode = 'active';
  }, []);
  const recallAraon = useCallback(() => {
    ref.current.mode = 'returning';
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
      const mult = Math.max(1, (getMultiplier && getMultiplier()) || 1000);
      const stepKm = SPEED_KN * KN_TO_KMH * ((dt * mult) / 3600);

      let status = s.mode;
      let label = '대기 (Wrangel)';

      if (s.mode === 'returning') {
        const r = moveToward(s, ARAON_HOME, stepKm);
        s.heading = bearingDeg(s, ARAON_HOME);
        s.lat = r.lat;
        s.lon = r.lon;
        if (distanceKm(s, ARAON_HOME) <= DOCK_RADIUS_KM) {
          s.lat = ARAON_HOME.lat;
          s.lon = ARAON_HOME.lon;
          s.mode = 'idle';
          s.heading = 0;
        }
        status = s.mode === 'idle' ? 'idle' : 'returning';
        label = s.mode === 'idle' ? '대기 (Wrangel)' : '모항 복귀 중';
      } else if (s.mode === 'active') {
        const ship = getShipState && getShipState();
        const lead = (getLeadPoint && getLeadPoint()) || ship;
        if (lead) {
          const r = moveToward(s, lead, stepKm);
          s.heading = bearingDeg(s, lead);
          s.lat = r.lat;
          s.lon = r.lon;
        }
        // 본선과의 거리로 선도/호위 판정 (표시용)
        const distToShip = ship ? distanceKm(s, ship) : Infinity;
        if (distToShip > TRANSIT_THRESHOLD_KM) {
          status = 'escorting'; // 마커 색은 호위와 동일(활성 강조)
          label = '쇄빙 선도 (출동)';
        } else {
          status = 'escorting';
          label = '호위 중';
        }
      } else {
        // idle: 모항 대기 (위치 고정)
        status = 'idle';
        label = '대기 (Wrangel)';
      }

      // 상태 반영: 이동 중(active/returning)이면 10프레임마다, 모드 전환 시 즉시.
      //   idle 정지 상태에서는 매 프레임 setState 로 리렌더를 유발하지 않도록
      //   (모드 전환으로 idle 진입 시 1회만 발행 후 침묵).
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
  }, [getShipState, getLeadPoint, getMultiplier, getActive]);

  return { araon, callAraon, recallAraon, getMode };
}
