import { describe, it, expect } from 'vitest';
import {
  deriveForwardPreviewLive,
  derivePassBadge,
} from './derivedMetrics';

// NSR 유사 항로 — 날짜변경선(±180°) 횡단 포함
const ROUTE = [
  { lon: 129.0, lat: 35.1, label: 'Busan' },
  { lon: 160.0, lat: 60.0 },
  { lon: 179.0, lat: 70.0 },
  { lon: -175.0, lat: 74.0 }, // 180° 횡단
  { lon: 150.0, lat: 77.0 },
  { lon: 100.0, lat: 78.0 },
];

// 위도↑ → 농도↑ 가짜 샘플러 (lon,lat) 순서 주의
const sampleIce = (lon, lat) => {
  if (lat < 60) return 0;
  if (lat < 68) return ((lat - 60) / 8) * 0.3;
  if (lat < 75) return 0.3 + ((lat - 68) / 7) * 0.5;
  return 0.92;
};

const finiteAll = (preview) =>
  preview.every(
    (p) =>
      Number.isFinite(p.rio) &&
      Number.isFinite(p.thickness_m) &&
      Number.isFinite(p.kmAhead) &&
      p.position.lon >= -180 &&
      p.position.lon <= 180 &&
      p.position.lat >= -90 &&
      p.position.lat <= 90,
  );
const monotonicKm = (preview) =>
  preview.every((p, i) => i === 0 || p.kmAhead >= preview[i - 1].kmAhead);

describe('deriveForwardPreviewLive', () => {
  it('개빙수역(저위도)은 두께 0·RIO 양수·PASS', () => {
    const ship = { lat: 35.1, lon: 129.0, heading: 30 };
    const preview = deriveForwardPreviewLive(ROUTE, ship, 'Arc4', sampleIce);
    expect(preview.length).toBeGreaterThan(0);
    expect(finiteAll(preview)).toBe(true);
    expect(monotonicKm(preview)).toBe(true);
    expect(Math.max(...preview.map((p) => p.thickness_m))).toBe(0);
    expect(Math.min(...preview.map((p) => p.rio))).toBeGreaterThan(0);
    expect(derivePassBadge(preview).label).toBe('PASS');
  });

  it('고위도 다년생빙은 두꺼운 두께·음수 RIO·BLOCKED', () => {
    const ship = { lat: 77.5, lon: 120.0, heading: 270 };
    const preview = deriveForwardPreviewLive(ROUTE, ship, 'Arc4', sampleIce);
    expect(finiteAll(preview)).toBe(true);
    expect(Math.max(...preview.map((p) => p.thickness_m))).toBeGreaterThan(1.8);
    expect(derivePassBadge(preview).label).toBe('BLOCKED');
  });

  it('날짜변경선 부근에서도 NaN 없이 단조 증가하는 거리', () => {
    const ship = { lat: 70.0, lon: 179.0, heading: 20 };
    const preview = deriveForwardPreviewLive(ROUTE, ship, 'Arc4', sampleIce);
    expect(preview.length).toBeGreaterThan(0);
    expect(finiteAll(preview)).toBe(true);
    expect(monotonicKm(preview)).toBe(true);
    // 경도 점프(±360) 없이 연속이어야 함
    for (let i = 1; i < preview.length; i += 1) {
      let dLon = Math.abs(preview[i].position.lon - preview[i - 1].position.lon);
      if (dLon > 180) dLon = 360 - dLon;
      expect(dLon).toBeLessThan(20); // 25km 간격이면 경도차는 작아야 함
    }
  });

  it('RIO 는 voyage 스케일(분수)과 동일 — 개빙수역 RIO = +2', () => {
    // 전 구간 개빙수역인 평탄 항로
    const flatRoute = [
      { lon: 0, lat: 40 },
      { lon: 5, lat: 40 },
    ];
    const openWater = () => 0;
    const preview = deriveForwardPreviewLive(flatRoute, { lat: 40, lon: 0, heading: 90 }, 'PC7', openWater, { spanKm: 100, bars: 4 });
    expect(preview.length).toBeGreaterThan(0);
    expect(preview.every((p) => p.rio === 2)).toBe(true);
  });

  it('Arc4 정규화 — 일반선(NONE)이 아니라 PC7 RIV 로 평가', () => {
    // 동일 중빙 조건에서 Arc4(→PC7) 와 NONE 의 RIO 가 달라야 정규화가 동작한 것
    const midIce = () => 0.8;
    const route = [
      { lon: 0, lat: 76 },
      { lon: 3, lat: 76 },
    ];
    const arc4 = deriveForwardPreviewLive(route, { lat: 76, lon: 0, heading: 90 }, 'Arc4', midIce, { spanKm: 80, bars: 3 });
    const none = deriveForwardPreviewLive(route, { lat: 76, lon: 0, heading: 90 }, 'NONE', midIce, { spanKm: 80, bars: 3 });
    expect(arc4[0].rio).not.toBe(none[0].rio);
    expect(arc4[0].rio).toBeGreaterThan(none[0].rio); // 내빙선이 더 안전(높은 RIO)
  });

  it('항로 이탈(수동 자유항행) 시 heading 직선으로 전방 투영', () => {
    // 항로(적도 부근)에서 멀리 떨어진 고위도 본선 + 북향 heading
    const route = [
      { lon: 0, lat: 0 },
      { lon: 10, lat: 0 },
    ];
    const northIce = (lon, lat) => (lat > 75 ? 0.9 : 0);
    const ship = { lat: 74.5, lon: 5, heading: 0 }; // 정북
    const preview = deriveForwardPreviewLive(route, ship, 'Arc4', northIce, { spanKm: 200, bars: 8, offRouteKm: 25 });
    expect(preview.length).toBe(8); // 종점 클램프 없이 heading 직선
    expect(finiteAll(preview)).toBe(true);
    // 정북 진행이면 위도가 증가해야 함
    expect(preview[preview.length - 1].position.lat).toBeGreaterThan(ship.lat);
    // kmAhead 는 등간격(대권 직선)
    expect(preview[0].kmAhead).toBeCloseTo(25, 0);
  });

  it('잘못된 입력은 빈 배열', () => {
    expect(deriveForwardPreviewLive([], { lat: 70, lon: 179 }, 'Arc4', sampleIce)).toEqual([]);
    expect(deriveForwardPreviewLive(ROUTE, null, 'Arc4', sampleIce)).toEqual([]);
    expect(deriveForwardPreviewLive(ROUTE, { lat: 70, lon: 179 }, 'Arc4', null)).toEqual([]);
    expect(deriveForwardPreviewLive(ROUTE, { lat: NaN, lon: 179 }, 'Arc4', sampleIce)).toEqual([]);
  });

  it('항로 종점 근처면 전방이 없어 빈 배열(HUD 자동 숨김)', () => {
    const ship = { lat: 78, lon: 100, heading: 270 }; // 마지막 waypoint
    const preview = deriveForwardPreviewLive(ROUTE, ship, 'Arc4', sampleIce);
    expect(preview.length).toBe(0);
  });
});
