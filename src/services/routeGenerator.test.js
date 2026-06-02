// 항로 생성 순수 로직 테스트 — 지역 판정 / 경로 역전 / 직선(대권) 경로.
import { describe, it, expect } from 'vitest';
import { isSameRegion, reverseRoute, buildDirectRoute } from './routeGenerator.js';
import { calculateRouteDistanceKM } from './shipSimulator.js';

describe('isSameRegion', () => {
  it('아시아-아시아는 동일 지역', () => {
    expect(isSameRegion('BUSAN', 'SHANGHAI')).toBe(true);
  });
  it('유럽-유럽은 동일 지역', () => {
    expect(isSameRegion('ROTTERDAM', 'HAMBURG')).toBe(true);
  });
  it('아시아-유럽은 다른 지역', () => {
    expect(isSameRegion('BUSAN', 'ROTTERDAM')).toBe(false);
  });
  it('미지의 항구는 동일 지역 아님', () => {
    expect(isSameRegion('UNKNOWN_A', 'UNKNOWN_B')).toBe(false);
  });
});

describe('reverseRoute', () => {
  const wps = [
    { lon: 1, lat: 1, label: 'A' },
    { lon: 2, lat: 2, label: 'B' },
    { lon: 3, lat: 3, label: 'C' },
  ];

  it('웨이포인트 순서를 뒤집는다', () => {
    const r = reverseRoute(wps);
    expect(r.map((w) => w.label)).toEqual(['C', 'B', 'A']);
  });

  it('원본 배열을 변형하지 않는다 (불변성)', () => {
    reverseRoute(wps);
    expect(wps.map((w) => w.label)).toEqual(['A', 'B', 'C']);
  });

  it('얕은 복제본을 반환 (참조 분리)', () => {
    const r = reverseRoute(wps);
    r[0].label = 'CHANGED';
    expect(wps.find((w) => w.label === 'CHANGED')).toBeUndefined();
  });
});

describe('buildDirectRoute', () => {
  const busan = { lon: 129.0, lat: 35.1, name: '부산' };
  const shanghai = { lon: 121.5, lat: 31.2, name: '상하이' };

  it('segments+1 개의 웨이포인트를 생성', () => {
    const r = buildDirectRoute(busan, shanghai, 24);
    expect(r.length).toBe(25);
  });

  it('출발/도착 항구에서 시작·종료', () => {
    const r = buildDirectRoute(busan, shanghai, 10);
    expect(r[0].lat).toBeCloseTo(busan.lat, 4);
    expect(r[r.length - 1].lat).toBeCloseTo(shanghai.lat, 4);
  });

  it('동일 지점이면 2점만 반환 (0 나눗셈 방지)', () => {
    const r = buildDirectRoute(busan, { ...busan }, 24);
    expect(r.length).toBe(2);
  });

  it('생성된 경로의 모든 좌표가 유효 + 유한', () => {
    for (const p of buildDirectRoute(busan, shanghai, 24)) {
      expect(Number.isFinite(p.lon)).toBe(true);
      expect(p.lat).toBeGreaterThanOrEqual(-90);
      expect(p.lat).toBeLessThanOrEqual(90);
    }
  });

  it('직선 경로 거리가 양수이고 합리적', () => {
    const r = buildDirectRoute(busan, shanghai, 24);
    const dist = calculateRouteDistanceKM(r);
    expect(dist).toBeGreaterThan(500);  // 부산-상하이 대략 600~900km대
    expect(dist).toBeLessThan(1500);
  });
});
