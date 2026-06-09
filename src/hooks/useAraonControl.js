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
import {
  routePos,
  calculateRouteDistanceKM,
  slerpLonLat,
  CRUISE_SPEED_KNOTS,
} from '../services/shipSimulator';

// ── 항로별 쇄빙 호위 자산 (실재 거점에 사전배치) ──────────────────────
// 각 북극항로는 관할·지리가 달라 호위 자산과 모항이 다르다. 모항은 해당 항로가
// 실제로 근접 통과하는 실재 위치로 배치(자산은 그 위치에서 대기).
//   NSR → 아라온(KOPRI), Wrangel섬(러 북극, NSR 북방 ~150km)
//   NWP → 캐나다 해안경비대, Resolute Bay(캐 북극 군도, 배로우 해협 인근)
//   TSR → 원자력 쇄빙선(Rosatomflot), Longyearbyen/Svalbard(TSR 대서양측 ~230km)
export const ESCORT_ASSETS = {
  NSR: {
    id: 'araon', name: '아라온', org: 'KOPRI', flag: '🇰🇷',
    home: { lat: 71.7, lon: 179.5 }, homeName: 'Wrangel 북방 연안',
    speedKn: 16, reachKm: 400,
    // 시각 특성 — 한국 KOPRI 아라온: 빨간 선체 + 흰 상부 + 주황 A-프레임 크레인 + 헬리데크
    hullColor: '#c0392b',
    visual: {
      hull: 0xc0392b, deck: 0x6b1e17, sup: 0xecf0f1, window: 0x1a365d,
      accent: 0xe67e22, gray: 0x4a5568, funnelBand: 0xc0392b,
      helideck: true, crane: true, stripe: null, reactor: false,
    },
  },
  NWP: {
    id: 'ccgs', name: 'CCGS 쇄빙선', org: '캐나다 해안경비대', flag: '🇨🇦',
    home: { lat: 74.55, lon: -94.9 }, homeName: 'Resolute Passage',
    speedKn: 15, reachKm: 400,
    // 캐나다 해안경비대: 빨간 선체 + 흰 전방 사선 스트라이프 + 흰 상부 + 헬리데크
    hullColor: '#d81e3f',
    visual: {
      hull: 0xd81e3f, deck: 0x7a1020, sup: 0xf5f7fa, window: 0x12263a,
      accent: 0xe2231a, gray: 0x52606d, funnelBand: 0xffffff,
      helideck: true, crane: false, stripe: 0xffffff, reactor: false,
    },
  },
  TSR: {
    id: 'rosatom', name: '원자력 쇄빙선', org: 'Rosatomflot', flag: '🇷🇺',
    home: { lat: 78.28, lon: 15.2 }, homeName: 'Isfjorden(Longyearbyen)',
    speedKn: 18, reachKm: 400,
    // Rosatomflot 원자력 쇄빙선(Arktika급): 검은 선체 + 노란(아톰플로트) 상부 + 원자로 블록
    hullColor: '#1c2530',
    visual: {
      hull: 0x1c2530, deck: 0x0f141b, sup: 0xf2c14e, window: 0x0b1320,
      accent: 0xd64545, gray: 0x9aa3ad, funnelBand: 0xd64545,
      helideck: true, crane: false, stripe: null, reactor: true,
    },
  },
};

// 하위호환: 기존 ARAON_HOME 참조는 NSR(아라온) 거점으로 유지
export const ARAON_HOME = ESCORT_ASSETS.NSR.home; // Wrangel Island 북안

// 백엔드 쇄빙선 id(trace) → 프론트 호위 자산. Voyage trace 렌더에서 항로별
// 아이콘/시각 특성 매핑에 사용. (백엔드 FLEET_BY_ROUTE 와 동기화)
export const ESCORT_ASSET_BY_IB_ID = {
  'ib-araon': ESCORT_ASSETS.NSR,
  'ib-ccgs': ESCORT_ASSETS.NWP,
  'ib-rosatom': ESCORT_ASSETS.TSR,
};

const KN_TO_KMH = 1.852;
const ESCORT_LEAD_KM = 25; // 에스코트 시 본선 앞 유지 간격
const TRANSIT_THRESHOLD_KM = 150; // 본선과 이 거리 밖이면 '선도', 안이면 '호위'
const DOCK_EPS = 0.004; // 진행률 기준 모항 근접 판정
const DEPLOY_MARGIN_H = 12; // 적시 배치 안전마진(시간) — 본선 도달 전 입구 선점
const HANDOFF_EPS = 0.01; // 본선이 입구(homeProg) 이만큼 근접하면 호위 개시
const HOP_EPS_KM = 2; // 모항↔입구 물리 이동 도달 판정(km)
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

// 항로 캐시 (waypoints + 모항 레퍼런스 기준): 총거리 + 모항 최근접 진행률 + 근접 유효성
let _routeCache = { wps: null, home: null, totalKm: 1, homeProg: 0.5, homeReachable: false };
function routeInfo(wps, timed, home, reachKm) {
  const H = home || ARAON_HOME;
  if (!wps || wps.length < 2) return { totalKm: 1, homeProg: 0, homeReachable: false };
  // 모항(home)이 바뀌면(항로별 자산 전환) 캐시 무효화
  if (_routeCache.wps === wps && _routeCache.home === H) return _routeCache;
  const totalKm = Math.max(1, calculateRouteDistanceKM(wps));
  // 모항 최근접 진행률 탐색 (0~1, 100분할)
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const p = routePos(t, timed, wps);
    if (!p) continue;
    const d = distanceKm(p, H);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  // 항로가 모항 근방(reachKm)을 실제로 지날 때만 호위 유효
  // (비북극·역방향 등에서 '항로상 최근접=도착지' 스냅 방지)
  _routeCache = { wps, home: H, totalKm, homeProg: best, homeReachable: bestD <= (reachKm || 400) };
  return _routeCache;
}

// ── 적시 배치 타당성 계산 (순수) ──────────────────────────────────
// 본선이 결빙수역 입구(homeProg)에 닿기까지의 ETA vs 쇄빙선이 모항→입구로
// 전개하는 ETA 를 비교. feasible=쇄빙선이 본선보다 먼저 입구에 도달 가능.
//   homeReachable=false(비북극·모항 비근접) → 호위 불요 → feasible:true 로 통과.
export function computeReadiness(info, asset, shipProg, timed, wps) {
  const { totalKm, homeProg, homeReachable } = info;
  if (!homeReachable) {
    return { feasible: true, homeReachable: false, shipEtaToStageH: 0, ibEtaToStageH: 0, stageProg: homeProg };
  }
  // 본선이 이미 입구(homeProg)에 도달/통과한 상태(미항 중 재시작 등)면 사전 배치
  // 판정 무의미 → 통과(호위는 staging/active 가 직접 처리). 게이트 오차단 방지.
  if (shipProg >= homeProg) {
    return { feasible: true, homeReachable: true, shipEtaToStageH: 0, ibEtaToStageH: 0, stageProg: homeProg };
  }
  const stagePos = routePos(homeProg, timed, wps);
  const ibTransitKm = stagePos ? distanceKm(asset.home, stagePos) : 0;
  const ibEtaToStageH = ibTransitKm / ((asset.speedKn || 16) * KN_TO_KMH);
  const shipDistKm = Math.max(0, homeProg - shipProg) * totalKm;
  const shipEtaToStageH = shipDistKm / (CRUISE_SPEED_KNOTS * KN_TO_KMH);
  return {
    feasible: ibEtaToStageH <= shipEtaToStageH,
    homeReachable: true,
    shipEtaToStageH,
    ibEtaToStageH,
    stageProg: homeProg,
  };
}

// ── 호위 생애주기 1스텝 (순수, 테스트 가능) ────────────────────────
// s 를 in-place 갱신하고 { status, label } 반환. rAF 루프와 단위테스트가 공유.
//   모드: idle → transit → staging → active → returning → transit-home → idle
//   - idle    : 모항 대기. requested && 적시배치조건 → transit
//   - transit : 모항→입구 물리 이동(slerp). 도달 → staging
//   - staging : 입구 대기(준비완료). 본선이 입구 근접 → active
//   - active  : 본선 앞 lead 추종(기존 로직)
//   - returning   : 항로 따라 입구(homeProg)로 복귀 → transit-home
//   - transit-home: 입구→모항 물리 이동(slerp) → idle
export function advanceEscort(s, ctx, dtSimSec) {
  const { homeProg, totalKm, home, asset, shipProg, timed, wps } = ctx;
  const stagePos = routePos(homeProg, timed, wps) || { lat: home.lat, lon: home.lon };
  const stepKm = (asset.speedKn || 16) * KN_TO_KMH * (dtSimSec / 3600);
  const stepProg = stepKm / totalKm;
  const ibTransitKm = Math.max(1, distanceKm(home, stagePos));

  // recall → 호위/대기/이동 중이면 복귀 전환
  if (!s.requested && (s.mode === 'active' || s.mode === 'staging' || s.mode === 'transit')) {
    s.mode = 'returning';
  }

  if (s.mode === 'idle') {
    // 모항 대기 + 적시 배치 판정
    s.lat = home.lat;
    s.lon = home.lon;
    if (s.requested) {
      const shipEtaToStageH =
        (Math.max(0, homeProg - shipProg) * totalKm) / (CRUISE_SPEED_KNOTS * KN_TO_KMH);
      const ibEtaToStageH = ibTransitKm / ((asset.speedKn || 16) * KN_TO_KMH);
      if (shipEtaToStageH <= ibEtaToStageH + DEPLOY_MARGIN_H) {
        s.mode = 'transit';
        s.transitFrac = 0;
      }
    }
    if (s.mode === 'idle') {
      return { status: 'idle', label: `대기 (${asset.homeName})` };
    }
  }

  if (s.mode === 'transit') {
    // 모항 → 입구 물리 이동
    const prev = { lat: s.lat, lon: s.lon };
    s.transitFrac = Math.min(1, (s.transitFrac || 0) + stepKm / ibTransitKm);
    const p = slerpLonLat(home, stagePos, s.transitFrac);
    s.lat = p.lat;
    s.lon = p.lon;
    if (p.lat !== prev.lat || p.lon !== prev.lon) s.heading = bearingDeg(prev, p);
    if (s.transitFrac >= 1 || distanceKm(s, stagePos) <= HOP_EPS_KM) {
      s.progress = homeProg;
      s.lat = stagePos.lat;
      s.lon = stagePos.lon;
      s.mode = 'staging';
    } else {
      return { status: 'transit', label: '전개 이동 중' };
    }
  }

  if (s.mode === 'staging') {
    // 입구 대기(준비완료). 본선이 입구 근접 → 호위 개시
    s.progress = homeProg;
    s.lat = stagePos.lat;
    s.lon = stagePos.lon;
    if (shipProg >= homeProg - HANDOFF_EPS) {
      s.mode = 'active';
    } else {
      return { status: 'staging', label: '호위 준비 완료 (입구 대기)' };
    }
  }

  if (s.mode === 'active') {
    // 본선 앞 ESCORT_LEAD_KM 지점(진행률) 추종 — 항로 따라 이동
    const target = Math.min(0.999, shipProg + ESCORT_LEAD_KM / totalKm);
    const prev = { lat: s.lat, lon: s.lon };
    if (Math.abs(s.progress - target) <= stepProg) {
      s.progress = target;
    } else {
      s.progress += s.progress < target ? stepProg : -stepProg;
    }
    // 하한: 본선 진행률 밑으로 떨어지지 않음(뒤처짐 방지)
    if (s.progress < shipProg) s.progress = shipProg;
    const p = routePos(s.progress, timed, wps);
    if (p) {
      if (p.lat !== prev.lat || p.lon !== prev.lon) s.heading = bearingDeg(prev, p);
      s.lat = p.lat;
      s.lon = p.lon;
    }
    const distToShipKm = Math.abs(s.progress - shipProg) * totalKm;
    return {
      status: 'escorting',
      label: distToShipKm > TRANSIT_THRESHOLD_KM ? '쇄빙 선도 (출동)' : '호위 중',
    };
  }

  if (s.mode === 'returning') {
    // 항로 따라 입구(homeProg)로 복귀 → 도달 시 모항 물리 복귀(transit-home)
    const target = homeProg;
    if (Math.abs(s.progress - target) <= Math.max(stepProg, DOCK_EPS)) {
      s.progress = target;
      s.lat = stagePos.lat;
      s.lon = stagePos.lon;
      s.mode = 'transit-home';
      s.transitFrac = 0;
    } else {
      s.progress += s.progress < target ? stepProg : -stepProg;
      const p = routePos(s.progress, timed, wps);
      if (p) {
        s.heading = bearingDeg(s, p);
        s.lat = p.lat;
        s.lon = p.lon;
      }
      return { status: 'returning', label: '모항 복귀 중' };
    }
  }

  if (s.mode === 'transit-home') {
    // 입구 → 모항 물리 이동
    const prev = { lat: s.lat, lon: s.lon };
    s.transitFrac = Math.min(1, (s.transitFrac || 0) + stepKm / ibTransitKm);
    const p = slerpLonLat(stagePos, home, s.transitFrac);
    s.lat = p.lat;
    s.lon = p.lon;
    if (p.lat !== prev.lat || p.lon !== prev.lon) s.heading = bearingDeg(prev, p);
    if (s.transitFrac >= 1 || distanceKm(s, home) <= HOP_EPS_KM) {
      s.lat = home.lat;
      s.lon = home.lon;
      s.heading = 0;
      s.mode = 'idle';
      return { status: 'idle', label: `대기 (${asset.homeName})` };
    }
    return { status: 'returning', label: '모항 복귀 중' };
  }

  return { status: s.mode, label: `대기 (${asset.homeName})` };
}

/**
 * @param {() => number} opts.getShipProgress  본선 항로 진행률(0~1)
 * @param {() => ({waypoints:Array, timed:Array})} opts.getRoute  활성 항로
 * @param {() => number} opts.getMultiplier  시뮬 시간 배율
 * @param {() => boolean} opts.getActive  Live 모드 여부
 * @param {() => (object|null)} opts.getAsset  현재 활성 항로의 호위 자산(ESCORT_ASSETS[route]) 또는 null
 */
export default function useAraonControl({
  getShipProgress,
  getRoute,
  getMultiplier,
  getActive,
  getAsset,
}) {
  // 현재 활성 항로의 호위 자산 (없으면 NSR 아라온 폴백)
  const resolveAsset = () =>
    (getAsset && getAsset()) || ESCORT_ASSETS.NSR;

  // mode: 'idle' | 'transit' | 'staging' | 'active' | 'returning' | 'transit-home'
  // requested: 호위 요청(call) 여부 — 생애주기는 rAF 루프가 구동(적시 배치).
  const ref = useRef({
    progress: 0.5,
    mode: 'idle',
    lat: ARAON_HOME.lat,
    lon: ARAON_HOME.lon,
    heading: 0,
    requested: false,
    transitFrac: 0,
  });
  const [araon, setAraon] = useState(() => ({
    lat: ARAON_HOME.lat,
    lon: ARAON_HOME.lon,
    heading: 0,
    mode: 'idle',
    status: 'idle',
    label: `대기 (${ESCORT_ASSETS.NSR.homeName})`,
  }));

  // 호위 요청 — 스냅이 아니라 플래그만 세팅. 루프가 적시 배치(transit→staging→active)로 구동.
  const callAraon = useCallback(() => {
    ref.current.requested = true;
  }, []);

  // 복귀 요청 — 루프가 returning→transit-home→idle 로 모항까지 물리 복귀.
  const recallAraon = useCallback(() => {
    ref.current.requested = false;
  }, []);
  const getMode = useCallback(() => ref.current.mode, []);

  // 출항 게이트용 — 현재 항로/자산/본선진행률 기준 호위 적시 배치 타당성.
  const getReadiness = useCallback(() => {
    const asset = resolveAsset();
    const { waypoints, timed } = getRoute() || {};
    const info = routeInfo(waypoints, timed, asset.home, asset.reachKm);
    const shipProg = Math.max(0, Math.min(1, (getShipProgress && getShipProgress()) || 0));
    return computeReadiness(info, asset, shipProg, timed, waypoints);
  }, [getRoute, getAsset, getShipProgress]);

  // 항로/항구 전환 시 호위 쇄빙선을 모항 대기(idle)로 즉시 초기화.
  // 내부 progress/transitFrac(옛 진행)가 남으면 본선 추종 시 옛 위치로 되돌아가는
  // 듯 보이므로(애니메이션으로 역주행) 모항 좌표로 스냅하고 모두 리셋.
  const resetAraon = useCallback(() => {
    const asset = resolveAsset();
    const home = asset.home;
    const s = ref.current;
    s.mode = 'idle';
    s.progress = 0.5;
    s.lat = home.lat;
    s.lon = home.lon;
    s.heading = 0;
    s.requested = false;
    s.transitFrac = 0;
    setAraon({
      lat: home.lat,
      lon: home.lon,
      heading: 0,
      mode: 'idle',
      status: 'idle',
      label: `대기 (${asset.homeName})`,
    });
  }, [getAsset]);

  useEffect(() => {
    let raf = null;
    let last = performance.now();
    let frame = 0;
    let lastMode = ref.current.mode;
    let lastAssetId = null; // 자산(항로) 전환 감지 — idle 이어도 모항 갱신 강제용

    function loop(now) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!getActive || !getActive()) return;

      const s = ref.current;
      const asset = resolveAsset();
      const home = asset.home;
      const route = getRoute() || {};
      const wps = route.waypoints;
      const timed = route.timed;
      if (!wps || wps.length < 2) return;
      const { totalKm, homeProg, homeReachable } = routeInfo(wps, timed, home, asset.reachKm);

      // 항로(자산) 전환 감지 — idle 이어도 새 자산 모항으로 즉시 스냅 + 상태 갱신
      const assetChanged = asset.id !== lastAssetId;
      lastAssetId = asset.id;
      if (assetChanged && s.mode === 'idle') {
        s.lat = home.lat;
        s.lon = home.lon;
        s.heading = 0;
        s.transitFrac = 0;
      }

      const mult = Math.max(1, (getMultiplier && getMultiplier()) || 1000);
      const dtSimSec = dt * mult;
      const shipProg = Math.max(0, Math.min(1, (getShipProgress && getShipProgress()) || 0));

      // 모항이 항로 근방을 안 지나면(비북극·역방향 등) 호위 물리 불가 → 모항 대기 유지
      let status, label;
      if (!homeReachable) {
        s.mode = 'idle';
        s.lat = home.lat;
        s.lon = home.lon;
        status = 'idle';
        label = `대기 (${asset.homeName})`;
      } else {
        const ctx = { homeProg, totalKm, home, asset, shipProg, timed, wps };
        ({ status, label } = advanceEscort(s, ctx, dtSimSec));
      }

      frame += 1;
      const modeChanged = s.mode !== lastMode;
      lastMode = s.mode;
      const idleQuiet = s.mode === 'idle' && !modeChanged && !assetChanged;
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
  }, [getShipProgress, getRoute, getMultiplier, getActive, getAsset]);

  return { araon, callAraon, recallAraon, resetAraon, getMode, getReadiness };
}
