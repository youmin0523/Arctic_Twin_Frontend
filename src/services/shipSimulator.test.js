// 골든/회귀 테스트 — 선박 항로 기하/보간/물리.
// 좌표 계산은 시뮬레이션의 정확성을 좌우하므로 불변식을 단언으로 고정한다.
import { describe, it, expect } from 'vitest';
import {
  greatCircleDist,
  buildTimings,
  calculateRouteDistanceKM,
  slerpLonLat,
  routePos,
  routeHeading,
  getSeaState,
  resolveSeaState,
  estimateVoyageDays,
  estimateVoyageSeconds,
  CRUISE_SPEED_KNOTS,
} from './shipSimulator.js';

// 부산~로테르담 NSR 축약 웨이포인트 (테스트용)
const WPS = [
  { lon: 129.0, lat: 35.1, label: '부산' },
  { lon: 142.0, lat: 50.0 },
  { lon: 170.0, lat: 68.0 },
  { lon: 60.0, lat: 73.0 },
  { lon: 4.5, lat: 51.9, label: '로테르담' },
];

describe('greatCircleDist', () => {
  it('같은 점의 거리는 0', () => {
    expect(greatCircleDist({ lon: 10, lat: 20 }, { lon: 10, lat: 20 })).toBeCloseTo(0, 9);
  });

  it('대칭성: d(a,b) === d(b,a)', () => {
    const a = { lon: 0, lat: 0 }, b = { lon: 90, lat: 45 };
    expect(greatCircleDist(a, b)).toBeCloseTo(greatCircleDist(b, a), 12);
  });

  it('적도 90도 간격은 π/2 라디안', () => {
    expect(greatCircleDist({ lon: 0, lat: 0 }, { lon: 90, lat: 0 })).toBeCloseTo(Math.PI / 2, 9);
  });
});

describe('calculateRouteDistanceKM', () => {
  it('웨이포인트 < 2 이면 0', () => {
    expect(calculateRouteDistanceKM([])).toBe(0);
    expect(calculateRouteDistanceKM([{ lon: 1, lat: 1 }])).toBe(0);
  });

  it('항상 양수이고 유한값', () => {
    const d = calculateRouteDistanceKM(WPS);
    expect(d).toBeGreaterThan(0);
    expect(Number.isFinite(d)).toBe(true);
  });

  it('구간 거리의 합과 일치 (가산성)', () => {
    let sum = 0;
    for (let i = 1; i < WPS.length; i++) sum += calculateRouteDistanceKM([WPS[i - 1], WPS[i]]);
    expect(calculateRouteDistanceKM(WPS)).toBeCloseTo(sum, 6);
  });
});

describe('buildTimings', () => {
  it('정규화된 t는 0에서 시작해 1로 끝난다', () => {
    const tw = buildTimings(WPS);
    expect(tw[0].t).toBe(0);
    expect(tw[tw.length - 1].t).toBeCloseTo(1, 9);
  });

  it('t는 단조 증가', () => {
    const tw = buildTimings(WPS);
    for (let i = 1; i < tw.length; i++) expect(tw[i].t).toBeGreaterThan(tw[i - 1].t);
  });
});

describe('slerpLonLat', () => {
  it('t=0 이면 시작점, t=1 이면 끝점', () => {
    const a = { lon: 0, lat: 0 }, b = { lon: 40, lat: 30 };
    const s = slerpLonLat(a, b, 0), e = slerpLonLat(a, b, 1);
    expect(s.lon).toBeCloseTo(a.lon, 6);
    expect(s.lat).toBeCloseTo(a.lat, 6);
    expect(e.lon).toBeCloseTo(b.lon, 6);
    expect(e.lat).toBeCloseTo(b.lat, 6);
  });

  it('동일점 보간은 특이점 없이 시작점 반환', () => {
    const p = { lon: 12, lat: 34 };
    const r = slerpLonLat(p, p, 0.5);
    expect(r.lon).toBeCloseTo(12, 9);
    expect(r.lat).toBeCloseTo(34, 9);
  });
});

describe('routePos / routeHeading', () => {
  const TWP = buildTimings(WPS);

  it('진행도는 [0,1]로 클램프된다', () => {
    const before = routePos(-5, TWP, WPS);
    const after = routePos(99, TWP, WPS);
    expect(before.lat).toBeCloseTo(WPS[0].lat, 6);
    expect(after.lat).toBeCloseTo(WPS[WPS.length - 1].lat, 6);
  });

  it('모든 진행도에서 유효 좌표 + 유한 heading 반환', () => {
    for (let p = 0; p <= 1; p += 0.1) {
      const pos = routePos(p, TWP, WPS);
      expect(pos.lat).toBeGreaterThanOrEqual(-90);
      expect(pos.lat).toBeLessThanOrEqual(90);
      expect(Number.isFinite(routeHeading(p, TWP, WPS))).toBe(true);
    }
  });
});

describe('getSeaState (현행 위도 기반 모델)', () => {
  it('항상 Hs, Tp, label을 반환', () => {
    for (const lat of [85, 70, 55, 30]) {
      const s = getSeaState(lat);
      expect(s.Hs).toBeGreaterThan(0);
      expect(s.Tp).toBeGreaterThan(0);
      expect(typeof s.label).toBe('string');
    }
  });

  it('결빙 해역(>78°)은 외양보다 파고가 낮다', () => {
    expect(getSeaState(80).Hs).toBeLessThan(getSeaState(55).Hs);
  });
});

describe('estimateVoyageDays / estimateVoyageSeconds (#4 동적 항해시간)', () => {
  it('최소 1일을 보장 (아주 짧은 항로)', () => {
    const tiny = [{ lon: 0, lat: 0 }, { lon: 0.01, lat: 0.01 }];
    expect(estimateVoyageDays(tiny)).toBe(1);
  });

  it('거리에 비례해 일수가 증가 (단조성)', () => {
    const short = [WPS[0], WPS[1]];
    expect(estimateVoyageDays(WPS)).toBeGreaterThan(estimateVoyageDays(short));
  });

  it('느린 속도는 더 긴 항해시간을 준다', () => {
    expect(estimateVoyageDays(WPS, 8)).toBeGreaterThanOrEqual(estimateVoyageDays(WPS, 20));
  });

  it('초 = 일수 * 86400', () => {
    expect(estimateVoyageSeconds(WPS)).toBe(estimateVoyageDays(WPS) * 86400);
  });

  it('기본 속도 상수가 15노트', () => {
    expect(CRUISE_SPEED_KNOTS).toBe(15);
  });

  it('기존 인라인 공식과 동일한 결과 (회귀 보장)', () => {
    // App.jsx 가 쓰던 원래 식: Math.max(1, Math.round(distKm / (15*1.852*24)))
    const distKm = calculateRouteDistanceKM(WPS);
    const legacy = Math.max(1, Math.round(distKm / (15 * 1.852 * 24)));
    expect(estimateVoyageDays(WPS)).toBe(legacy);
  });
});

describe('resolveSeaState (#1 실측 우선, 위도 폴백)', () => {
  it('유효한 실측 파고가 있으면 그것을 사용', () => {
    const r = resolveSeaState(70, { Hs: 3.2, Tp: 9 });
    expect(r.source).toBe('real');
    expect(r.Hs).toBe(3.2);
    expect(r.Tp).toBe(9);
  });

  it('실측 없으면 위도 기반으로 폴백', () => {
    const r = resolveSeaState(80);
    expect(r.source).toBe('latitude');
    expect(r.Hs).toBe(getSeaState(80).Hs);
  });

  it('실측 Tp 누락 시 기본 8초', () => {
    const r = resolveSeaState(70, { Hs: 2.0 });
    expect(r.Tp).toBe(8);
  });

  it('NaN/음수 실측은 무시하고 폴백', () => {
    expect(resolveSeaState(70, { Hs: NaN }).source).toBe('latitude');
    expect(resolveSeaState(70, { Hs: -1 }).source).toBe('latitude');
  });

  it('Hs=0(잔잔한 바다) 실측은 유효값으로 인정', () => {
    const r = resolveSeaState(70, { Hs: 0, Tp: 6 });
    expect(r.source).toBe('real');
    expect(r.Hs).toBe(0);
  });
});
