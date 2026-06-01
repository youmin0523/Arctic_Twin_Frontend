/**
 * rlAvoidanceController.js
 *
 * RL 기반 빙산 회피 오케스트레이터.
 * - 2초마다 선박 상태를 확인하고 빙산 근접 시 RL 추론 실행
 * - RL 결과를 부드러운 우회 경로로 변환하여 기존 경로에 병합
 * - RL 실패 시 기존 A* 시스템으로 자동 폴백
 */

import { rlInfer } from './rlInferenceClient';
import { checkRouteAhead, rerouteAroundIceberg } from './icebergAvoidance';
import { mergeDetourSmooth, rlPositionsToWaypoints } from './smoothPathGenerator';
import { buildTimings, routePos } from './shipSimulator';
import { landAhead, initLandMask, isLandMaskReady } from './arcticPathfinder';
import {
  landAheadGlobal,
  findWaterDetour,
  isGlobalLandMaskReady,
  initGlobalLandMask,
} from './landMaskGlobal';

const POLL_INTERVAL_MS = 2000;     // 2초마다 확인
const DETECTION_RADIUS_KM = 50;    // 50km 이내 빙산 감지
const LAND_LOOKAHEAD_KM = 90;      // 전방 90km 육지 감지
const MIN_RL_CONFIDENCE = 0.3;     // RL 최소 신뢰도 (미만 시 A* 폴백)
const DEG_TO_KM = 111.32;

function approxDistKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG_TO_KM;
  const dLon = (lon2 - lon1) * DEG_TO_KM * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * RL 예측 경로 정합성 검사.
 * 극점/날짜변경선 특이점에서 경로가 폭주(수천 km)하는 것을 막는 안전 가드 —
 * 비정상이면 false 를 반환해 A* 폴백을 쓰도록 한다.
 */
function isProjectedPathSane(path, ship) {
  if (!Array.isArray(path) || path.length === 0) return false;
  const MAX_DIST_KM = 400; // 투영은 ~70km 규모 — 400km 초과 점프는 좌표 특이점 아티팩트
  for (const p of path) {
    if (!p || !Number.isFinite(p.lon) || !Number.isFinite(p.lat)) return false;
    if (p.lat < -90 || p.lat > 90 || p.lon < -180 || p.lon > 180) return false;
    if (approxDistKm(ship.lat, ship.lon, p.lat, p.lon) > MAX_DIST_KM) return false;
  }
  return true;
}

/**
 * 최종 우회 웨이포인트 정합성 검사.
 * 병합/스무딩 단계에서 경도 특이점으로 경로가 폭주하는 경우를 잡는다 —
 * 연속 웨이포인트 간 점프가 비정상적으로 크면(>500km) 적용을 거부.
 */
function isWaypointListSane(wps) {
  if (!Array.isArray(wps) || wps.length < 2) return false;
  const MAX_SEGMENT_KM = 500;
  for (let i = 0; i < wps.length; i++) {
    const w = wps[i];
    if (!w || !Number.isFinite(w.lon) || !Number.isFinite(w.lat)) return false;
    if (w.lat < -90 || w.lat > 90 || w.lon < -180 || w.lon > 180) return false;
    if (i > 0) {
      const d = approxDistKm(wps[i - 1].lat, wps[i - 1].lon, w.lat, w.lon);
      if (d > MAX_SEGMENT_KM) return false;
    }
  }
  return true;
}

/**
 * RL 회피 컨트롤러 생성.
 *
 * @param {Object} options
 * @param {Function} options.getShipState    - () => {lon, lat, heading, speed_knots}
 * @param {Function} options.getIcebergs     - () => [{lat, lon, length_m}, ...]
 * @param {Function} options.getActiveWps    - () => [{lon, lat, label}, ...]
 * @param {Function} options.getProgress     - () => number (0~1)
 * @param {Function} options.getIceData      - () => {concentration, cells} | null
 * @param {Function} options.getWeather      - () => {visibility_km, wave_height_m}
 * @param {Function} options.getIceClass     - () => string (e.g., "PC5")
 * @param {Function} options.dispatch        - React dispatch 함수
 * @param {Function} options.showToast       - 토스트 메시지 표시 함수
 * @returns {Object} - {start, stop, isActive}
 */
export function createRLAvoidanceController(options) {
  const {
    getShipState,
    getIcebergs,
    getActiveWps,
    getProgress,
    getIceData,
    getWeather,
    getIceClass,
    dispatch,
    showToast,
  } = options;

  let intervalId = null;
  let isProcessing = false;
  let lastRerouteTime = 0;
  const REROUTE_COOLDOWN_MS = 15000; // 재경로 설정 쿨다운 15초

  async function tick() {
    if (isProcessing) return;

    const now = Date.now();
    if (now - lastRerouteTime < REROUTE_COOLDOWN_MS) return;

    const ship = getShipState();
    if (!ship) return;
    const icebergs = getIcebergs() || [];

    const wps = getActiveWps();
    if (!wps || wps.length < 2) return;
    const progress = getProgress();
    const currentSeg = Math.floor(progress * (wps.length - 1));

    // ── 1) 빙산 위협 판정 ──────────────────────────────────────
    // 전방 50km 이내 빙산 필터링
    const nearbyBergs = icebergs.filter((berg) => {
      const dist = approxDistKm(ship.lat, ship.lon, berg.lat, berg.lon);
      return dist < DETECTION_RADIUS_KM;
    });

    let bergBlocked = false;
    let bergDangerIdx = -1;
    if (nearbyBergs.length > 0) {
      const res = checkRouteAhead(wps, currentSeg, nearbyBergs, 10, 15);
      bergBlocked = res.blocked;
      bergDangerIdx = res.dangerIdx;
    }

    // ── 2) 육지 위협 판정 — 전역 마스크 우선(전 위도), 미로드 시 북극 마스크 ──
    const land = isGlobalLandMaskReady()
      ? landAheadGlobal(ship.lat, ship.lon, ship.heading || 0, LAND_LOOKAHEAD_KM, 6)
      : landAhead(ship.lat, ship.lon, ship.heading || 0, LAND_LOOKAHEAD_KM, 8);

    // 빙산도 육지도 위협 없으면 종료
    if (!bergBlocked && !land.blocked) return;

    // 회피 사유 결정 (둘 다면 더 임박한 쪽 우선 — 육지는 충돌 시 치명적)
    const threatType = land.blocked && (!bergBlocked || land.distanceKm < 30)
      ? 'land'
      : 'iceberg';
    const dangerIdx = bergBlocked
      ? bergDangerIdx
      : Math.min(currentSeg + 3, wps.length - 1);

    // 위협 감지 — 회피 경로 계산 시작
    isProcessing = true;
    let method = 'unknown'; // finally 에서도 참조하므로 try 밖에 선언

    try {
      dispatch({ type: 'SET_REROUTING', payload: true });
      dispatch({ type: 'SET_AVOIDANCE', payload: { active: true, type: threatType, method: null } });
      showToast(
        threatType === 'land'
          ? `🏔️ 전방 육지 감지(${Math.round(land.distanceKm)}km)! RL 회피 경로 계산 중...`
          : '🧊 빙산 감지! RL 우회 경로 계산 중...',
        5000,
      );

      let newWaypoints = null;
      let newProgress = progress;

      // 육지 위협 + 전역 마스크 → 전역 A* 해상 우회 (RL은 빙산 전용이라 육지엔 부적합)
      if (threatType === 'land' && isGlobalLandMaskReady()) {
        const margin = 3;
        const insertStart = Math.max(0, currentSeg);
        const insertEnd = Math.min(wps.length - 1, dangerIdx + margin);
        const sWp = wps[insertStart];
        const eWp = wps[insertEnd];
        const detour = findWaterDetour(
          { lon: sWp.lon, lat: sWp.lat },
          { lon: eWp.lon, lat: eWp.lat },
        );
        if (detour && detour.length > 0) {
          method = 'GlobalA*';
          const detourWps = detour.map((p) => ({ lon: p.lon, lat: p.lat, label: '육지 회피' }));
          // 스무딩 없이 스플라이스 — 스플라인이 육지로 휘어 무교차 보장이 깨지는 것 방지.
          const spliced = [
            ...wps.slice(0, insertStart + 1),
            ...detourWps,
            ...wps.slice(insertEnd),
          ];
          // 진행도 재매핑(선박 위치 점프 방지)
          const oldTimings = buildTimings(wps);
          const newTimings = buildTimings(spliced);
          const curPos = routePos(progress, oldTimings, wps);
          let bestT = progress, bestD = Infinity;
          for (const tp of newTimings) {
            const d = approxDistKm(curPos.lat, curPos.lon, tp.lat, tp.lon);
            if (d < bestD) { bestD = d; bestT = tp.t; }
          }
          newWaypoints = spliced;
          newProgress = bestT;
        }
      }

      if (!newWaypoints) {
      const iceData = getIceData();
      const weather = getWeather() || { visibility_km: 10, wave_height_m: 1 };
      const iceClass = getIceClass() || 'PC5';

      // 1차: RL 추론 시도
      const rlResult = await rlInfer(
        {
          lon: ship.lon,
          lat: ship.lat,
          heading: ship.heading || 0,
          speed_knots: ship.speed_knots || 14,
          ice_class: iceClass,
          progress,
          next_waypoint: dangerIdx < wps.length
            ? { lon: wps[dangerIdx].lon, lat: wps[dangerIdx].lat }
            : null,
        },
        nearbyBergs.map((b) => ({
          lat: b.lat, lon: b.lon, length_m: b.length_m || 5000,
        })),
        { concentration: iceData?.concentration || 0 },
        weather,
      );

      if (
        !rlResult.fallback &&
        rlResult.confidence >= MIN_RL_CONFIDENCE &&
        rlResult.projected_path?.length > 0 &&
        isProjectedPathSane(rlResult.projected_path, ship)
      ) {
        // RL 성공 — 예측 경로를 웨이포인트로 변환
        method = 'RL';
        const margin = 5;
        const insertStart = Math.max(0, dangerIdx - margin);
        const insertEnd = Math.min(wps.length - 1, dangerIdx + margin);
        const startWp = wps[insertStart];
        const endWp = wps[insertEnd];

        const detourWps = rlPositionsToWaypoints(
          rlResult.projected_path.map((p) => [p.lon, p.lat]),
          startWp,
          endWp,
        );

        const merged = mergeDetourSmooth(
          wps, detourWps, progress, insertStart, insertEnd,
        );
        newWaypoints = merged.newWaypoints;
        newProgress = merged.newProgress;
      } else {
        // 2차: A* 폴백
        method = 'A*';
        console.warn('[RL] 폴백 → A*', rlResult.error || `confidence=${rlResult.confidence}`);

        if (iceData) {
          const { rerouted, newWaypoints: astarWps } = await rerouteAroundIceberg(
            wps, dangerIdx, iceData, nearbyBergs,
          );
          if (rerouted) {
            // A* 결과도 스무딩 적용
            const margin = 5;
            const insertStart = Math.max(0, dangerIdx - margin);
            const insertEnd = Math.min(wps.length - 1, dangerIdx + margin);

            // A* 결과에서 새로 삽입된 구간 추출
            const beforeLen = insertStart;
            const afterLen = wps.length - insertEnd - 1;
            const detourPortion = astarWps.slice(
              beforeLen,
              astarWps.length - afterLen,
            );

            if (detourPortion.length > 2) {
              const smoothed = mergeDetourSmooth(
                wps, detourPortion, progress, insertStart, insertEnd,
              );
              newWaypoints = smoothed.newWaypoints;
              newProgress = smoothed.newProgress;
            } else {
              newWaypoints = astarWps;
            }
          }
        }
      }
      } // end if(!newWaypoints) — 빙산 RL/A* 경로

      // 병합 결과 정합성 검사 — 특이점 폭주 경로면 적용하지 않음(현재 경로 유지)
      if (newWaypoints && !isWaypointListSane(newWaypoints)) {
        console.warn('[RL Controller] 비정상 우회 경로 감지 — 적용 거부(현재 경로 유지)');
        newWaypoints = null;
      }

      if (newWaypoints) {
        dispatch({
          type: 'SET_GENERATED_WAYPOINTS_WITH_PROGRESS',
          payload: {
            waypoints: newWaypoints,
            progress: newProgress,
            elapsed: newProgress * 14 * 86400, // 14일 항해 기준
          },
        });
        lastRerouteTime = Date.now();
        dispatch({ type: 'SET_AVOIDANCE', payload: { active: true, type: threatType, method } });
        showToast(
          `${threatType === 'land' ? '육지' : '빙산'} 회피 경로 적용 완료 (${method})`,
          3000,
        );
        console.log(`[RL Controller] ${threatType}/${method} 회피 경로 적용: ${newWaypoints.length}개 웨이포인트`);
      } else {
        showToast('우회 경로 탐색 실패 — 현재 경로 유지', 3000);
      }
    } catch (e) {
      console.error('[RL Controller] 오류:', e);
      showToast('우회 경로 계산 중 오류 발생', 3000);
    } finally {
      isProcessing = false;
      dispatch({ type: 'SET_REROUTING', payload: false });
      // 계산 종료 — 활성 강조는 잠시 유지했다가 해제 (적용된 경로는 그대로 남음)
      dispatch({ type: 'SET_AVOIDANCE', payload: { active: false, type: threatType, method } });
    }
  }

  return {
    start() {
      if (intervalId) return;
      // 육지 회피용 마스크 로드 보장 (이미 로드됐으면 즉시 반환)
      if (!isLandMaskReady()) {
        initLandMask().catch(() => {});
      }
      if (!isGlobalLandMaskReady()) {
        initGlobalLandMask().catch(() => {});
      }
      intervalId = setInterval(tick, POLL_INTERVAL_MS);
      console.log('[RL Controller] 시작 (2초 간격, 빙산+육지 회피)');
    },

    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('[RL Controller] 중지');
      }
    },

    get isActive() {
      return intervalId !== null;
    },

    get isProcessing() {
      return isProcessing;
    },

    /** 수동으로 즉시 확인 실행 */
    async checkNow() {
      await tick();
    },
  };
}
