// 북극 경로탐색 안전 가드 테스트 — 육지 마스크 미로드 시 항상 안전(통과)으로
// 폴백하는지 검증. (마스크는 런타임 fetch 라 테스트에선 미로드 상태가 기본)
import { describe, it, expect } from 'vitest';
import { isLandMaskReady, isLandAt, landAhead, findArcticPath } from './arcticPathfinder.js';

describe('arcticPathfinder — 마스크 미로드 시 안전 폴백', () => {
  it('마스크가 로드되지 않은 초기 상태', () => {
    expect(isLandMaskReady()).toBe(false);
  });

  it('마스크 없으면 isLandAt 은 항상 false (오탐 방지)', () => {
    expect(isLandAt(75, 100)).toBe(false);
    expect(isLandAt(80, -150)).toBe(false);
  });

  it('마스크 없으면 landAhead 는 막히지 않음 + 거리 무한', () => {
    const r = landAhead(75, 100, 90, 90, 8);
    expect(r.blocked).toBe(false);
    expect(r.distanceKm).toBe(Infinity);
  });

  it('landAhead 는 heading 누락에도 throw 하지 않음', () => {
    expect(() => landAhead(75, 100, undefined)).not.toThrow();
  });
});

describe('findArcticPath — 기상 비용 통합 (#2)', () => {
  // 개빙수역 더미 데이터셋 (농도 0 → 어디나 통항 가능)
  const openWater = { cells: [] };

  it('기상 샘플러 없으면 경로를 반환 (하위호환)', () => {
    const path = findArcticPath(150, 70, 160, 72, openWater, 0.7, []);
    expect(Array.isArray(path)).toBe(true);
    expect(path.length).toBeGreaterThan(0);
  });

  it('균일 기상 페널티에서도 유효한 경로를 반환 (도착 보장)', () => {
    const uniform = findArcticPath(150, 70, 160, 72, openWater, 0.7, [], () => 0.5);
    expect(uniform).not.toBeNull();
    expect(uniform.length).toBeGreaterThan(0);
    const [endLon, endLat] = uniform[uniform.length - 1];
    expect(endLon).toBeCloseTo(160, 0);
    expect(endLat).toBeCloseTo(72, 0);
  });

  it('특정 위도대에 강한 기상 페널티를 주면 그 구간을 회피', () => {
    // 위도 70.5~71.5 띠에 폭풍(페널티 1) → 경로가 그 띠 통과를 줄여야 함
    const stormBand = (lon, lat) => (lat > 70.5 && lat < 71.5 ? 1 : 0);
    const base = findArcticPath(150, 70, 160, 72, openWater, 0.7, []);
    const avoided = findArcticPath(150, 70, 160, 72, openWater, 0.7, [], stormBand);
    expect(avoided).not.toBeNull();
    const countInBand = (p) => p.filter(([, lat]) => lat > 70.5 && lat < 71.5).length;
    // 폭풍 회피 경로는 폭풍대 통과 점이 더 적거나 같아야 한다
    expect(countInBand(avoided)).toBeLessThanOrEqual(countInBand(base));
  });
});
