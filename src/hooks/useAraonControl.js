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

  // mode: 'idle' | 'active' | 'returning'
  const ref = useRef({ progress: 0.5, mode: 'idle', lat: ARAON_HOME.lat, lon: ARAON_HOME.lon, heading: 0 });
  const [araon, setAraon] = useState(() => ({
    lat: ARAON_HOME.lat,
    lon: ARAON_HOME.lon,
    heading: 0,
    mode: 'idle',
    status: 'idle',
    label: `대기 (${ESCORT_ASSETS.NSR.homeName})`,
  }));

  const callAraon = useCallback(() => {
    const s = ref.current;
    const asset = resolveAsset();
    if (s.mode === 'idle') {
      // 항로상 자산 모항 최근접 지점으로 진입
      const { waypoints, timed } = getRoute() || {};
      const info = routeInfo(waypoints, timed, asset.home, asset.reachKm);
      // 항로가 자산 사전배치 거점 근처를 안 지나면(비북극·역방향 등)
      // 호위가 물리적으로 불가 → 호출 무시(idle 유지). 도착지 스냅 현상 방지.
      if (!info.homeReachable) return;
      s.progress = info.homeProg;
    }
    s.mode = 'active';
  }, [getRoute, getAsset]);

  const recallAraon = useCallback(() => {
    if (ref.current.mode !== 'idle') ref.current.mode = 'returning';
  }, []);
  const getMode = useCallback(() => ref.current.mode, []);

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
      const { totalKm, homeProg } = routeInfo(wps, timed, home, asset.reachKm);

      // 항로(자산) 전환 감지 — idle 이어도 새 자산 모항으로 즉시 스냅 + 상태 갱신
      const assetChanged = asset.id !== lastAssetId;
      lastAssetId = asset.id;
      if (assetChanged && s.mode === 'idle') {
        s.lat = home.lat;
        s.lon = home.lon;
        s.heading = 0;
      }

      const mult = Math.max(1, (getMultiplier && getMultiplier()) || 1000);
      const stepKm = (asset.speedKn || 16) * KN_TO_KMH * ((dt * mult) / 3600);
      const stepProg = stepKm / totalKm;

      let status = s.mode;
      let label = `대기 (${asset.homeName})`;
      const shipProg = Math.max(0, Math.min(1, (getShipProgress && getShipProgress()) || 0));

      if (s.mode === 'returning') {
        // 항로를 따라 모항 최근접 진행률로 이동 → 도달 시 모항 정박
        const target = homeProg;
        if (Math.abs(s.progress - target) <= Math.max(stepProg, DOCK_EPS)) {
          s.progress = target;
          s.mode = 'idle';
        } else {
          s.progress += s.progress < target ? stepProg : -stepProg;
        }
        if (s.mode === 'idle') {
          s.lat = home.lat;
          s.lon = home.lon;
          s.heading = 0;
          status = 'idle';
          label = `대기 (${asset.homeName})`;
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
        // 하한: 호위선은 본선 진행률 밑으로 떨어지지 않는다(뒤처짐 방지).
        // 동속 자산(NWP CCGS=본선 15kn)이 lead 를 못 만들어 뒤로 끌려가던 문제 차단.
        if (s.progress < shipProg) s.progress = shipProg;
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
        // idle — 자산 모항에서 대기
        s.lat = home.lat;
        s.lon = home.lon;
        status = 'idle';
        label = `대기 (${asset.homeName})`;
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

  return { araon, callAraon, recallAraon, getMode };
}
