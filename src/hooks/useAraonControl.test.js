// @vitest-environment jsdom
// useAraonControl — 호위 쇄빙선 에이전트 검증
// ───────────────────────────────────────────────────────────────
// 검증 목표 (사용자 시나리오: 완주 → 역방향 → 물리 이동 호위):
//   1) computeReadiness: 정/역방향 모두 적시 배치 가능(feasible) — 방향 무관
//   2) advanceEscort 생애주기: idle→transit(모항→입구 물리 이동)→staging
//      (입구 대기)→active(호위), recall 시 returning→transit-home→idle
//   3) resetAraon: 모항 대기(idle)로 즉시 복귀 + 3종 자산 각자 모항
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useAraonControl, {
  ESCORT_ASSETS,
  computeReadiness,
  advanceEscort,
} from './useAraonControl';
import { ROUTES } from '../data/arcticRoutes';
import {
  buildTimings,
  routePos,
  calculateRouteDistanceKM,
} from '../services/shipSimulator';

beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

const EARTH_R = 6371;
const toRad = (d) => (d * Math.PI) / 180;
function distKm(a, b) {
  const dLa = toRad(b.lat - a.lat), dLo = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// routeInfo 동등 계산 (테스트용)
function buildInfo(wps, asset) {
  const timed = buildTimings(wps);
  const totalKm = Math.max(1, calculateRouteDistanceKM(wps));
  let best = 0, bestD = Infinity;
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const p = routePos(t, timed, wps);
    if (!p) continue;
    const d = distKm(p, asset.home);
    if (d < bestD) { bestD = d; best = t; }
  }
  return { timed, totalKm, homeProg: best, homeReachable: bestD <= (asset.reachKm || 400) };
}

describe('computeReadiness — 적시 배치 타당성 (방향 무관)', () => {
  it('정방향(부산→로테르담): 호위 적시 배치 가능, 쇄빙선 ETA ≪ 본선 ETA', () => {
    const wps = ROUTES.NSR;
    const asset = ESCORT_ASSETS.NSR;
    const info = buildInfo(wps, asset);
    const r = computeReadiness(info, asset, 0, info.timed, wps);
    expect(r.feasible).toBe(true);
    expect(r.homeReachable).toBe(true);
    expect(r.ibEtaToStageH).toBeLessThan(r.shipEtaToStageH); // 쇄빙선이 먼저 도달
  });

  it('역방향(로테르담→부산): 동일하게 적시 배치 가능 → 방향 무관', () => {
    const wps = [...ROUTES.NSR].reverse();
    const asset = ESCORT_ASSETS.NSR;
    const info = buildInfo(wps, asset);
    const r = computeReadiness(info, asset, 0, info.timed, wps);
    expect(r.feasible).toBe(true);
    expect(r.ibEtaToStageH).toBeLessThan(r.shipEtaToStageH);
  });

  it('모항 비근접(homeReachable=false) 항로: 호위 불요 → feasible:true 통과', () => {
    const asset = ESCORT_ASSETS.NSR;
    const info = { totalKm: 1000, homeProg: 0.5, homeReachable: false };
    const r = computeReadiness(info, asset, 0, [], []);
    expect(r.feasible).toBe(true);
    expect(r.homeReachable).toBe(false);
  });
});

describe('advanceEscort — 생애주기 (모항→입구 물리 이동→호위→복귀)', () => {
  const wps = ROUTES.NSR;
  const asset = ESCORT_ASSETS.NSR;
  const info = buildInfo(wps, asset);
  const home = asset.home;
  const stagePos = routePos(info.homeProg, info.timed, wps);
  const mkCtx = (shipProg) => ({
    homeProg: info.homeProg,
    totalKm: info.totalKm,
    home,
    asset,
    shipProg,
    timed: info.timed,
    wps,
  });
  const freshState = () => ({
    progress: 0.5, mode: 'idle', lat: home.lat, lon: home.lon,
    heading: 0, requested: false, transitFrac: 0,
  });
  const BIG_DT = 3600 * 200; // 한 스텝에 전개 이동 완료할 큰 시뮬초

  it('idle: 요청 없으면 모항 대기 유지', () => {
    const s = freshState();
    const out = advanceEscort(s, mkCtx(0), 1);
    expect(s.mode).toBe('idle');
    expect(out.status).toBe('idle');
  });

  it('idle: 요청 있어도 본선이 멀면(적시 아님) 대기 — 사전 출동 안 함', () => {
    const s = freshState();
    s.requested = true;
    // 본선 진행률 0 → 입구까지 수일 → deployNow false
    advanceEscort(s, mkCtx(0), 1);
    expect(s.mode).toBe('idle');
  });

  it('idle→transit→staging: 본선이 입구에 접근하면 출동해 입구 선점(준비완료)', () => {
    const s = freshState();
    s.requested = true;
    // 입구보다 0.02 뒤 — deployNow 충족(약 10h<마진+ETA), 핸드오프(0.01)보다는 멀어 staging 유지
    const ctx = mkCtx(info.homeProg - 0.02);
    advanceEscort(s, ctx, BIG_DT); // 전개 이동 완료 → staging
    expect(s.mode).toBe('staging');
    // 입구(stagePos) 좌표에 자리잡음
    expect(distKm(s, stagePos)).toBeLessThan(5);
    const out = advanceEscort(s, ctx, 1);
    expect(out.label).toContain('준비 완료');
  });

  it('staging→active: 본선이 입구 도달하면 호위 개시', () => {
    const s = freshState();
    s.mode = 'staging';
    s.requested = true;
    s.progress = info.homeProg;
    s.lat = stagePos.lat; s.lon = stagePos.lon;
    const out = advanceEscort(s, mkCtx(info.homeProg), 1);
    expect(s.mode).toBe('active');
    expect(out.status).toBe('escorting');
  });

  it('active→returning→transit-home→idle: recall 시 모항까지 물리 복귀', () => {
    const s = freshState();
    s.mode = 'active';
    // 입구보다 0.08 앞서 호위 중이던 상태 — recall 시 항로 따라 입구로 복귀해야 함
    s.progress = info.homeProg + 0.08;
    const ap = routePos(s.progress, info.timed, wps);
    s.lat = ap.lat; s.lon = ap.lon;
    s.requested = false; // recall
    // 1) active→returning (요청 해제 감지), 작은 스텝이라 아직 입구 미도달 → returning 유지
    advanceEscort(s, mkCtx(info.homeProg + 0.08), 1);
    expect(s.mode).toBe('returning');
    // 2) 큰 스텝 반복 → 입구 복귀 → transit-home → 모항 도달 idle
    let guard = 0;
    while (s.mode !== 'idle' && guard++ < 10) {
      advanceEscort(s, mkCtx(info.homeProg + 0.08), BIG_DT);
    }
    expect(s.mode).toBe('idle');
    expect(distKm(s, home)).toBeLessThan(5);
  });
});

describe('useAraonControl — reset', () => {
  function makeOpts(waypoints, asset) {
    const timed = buildTimings(waypoints);
    return {
      getShipProgress: () => 0,
      getRoute: () => ({ waypoints, timed }),
      getMultiplier: () => 1000,
      getActive: () => true,
      getAsset: () => asset,
    };
  }

  it('resetAraon: 모항 대기(idle)로 복귀 + 모항 좌표 스냅', () => {
    const asset = ESCORT_ASSETS.NSR;
    const { result } = renderHook(() => useAraonControl(makeOpts(ROUTES.NSR, asset)));
    act(() => result.current.callAraon());
    act(() => result.current.resetAraon());
    expect(result.current.getMode()).toBe('idle');
    expect(result.current.araon.mode).toBe('idle');
    expect(result.current.araon.lat).toBeCloseTo(asset.home.lat, 5);
    expect(result.current.araon.lon).toBeCloseTo(asset.home.lon, 5);
  });

  it('항로별 자산(CCGS/NWP, 원자력/TSR)도 각자 모항으로 리셋', () => {
    for (const key of ['NWP', 'TSR']) {
      const asset = ESCORT_ASSETS[key];
      const { result } = renderHook(() => useAraonControl(makeOpts(ROUTES[key], asset)));
      act(() => result.current.resetAraon());
      expect(result.current.araon.mode).toBe('idle');
      expect(result.current.araon.lat).toBeCloseTo(asset.home.lat, 5);
      expect(result.current.araon.lon).toBeCloseTo(asset.home.lon, 5);
    }
  });

  it('getReadiness: 훅에서 노출되어 정방향 배치 가능 반환', () => {
    const asset = ESCORT_ASSETS.NSR;
    const { result } = renderHook(() => useAraonControl(makeOpts(ROUTES.NSR, asset)));
    const r = result.current.getReadiness();
    expect(r.feasible).toBe(true);
  });
});
