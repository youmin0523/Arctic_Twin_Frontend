// 기상 비용 모델 테스트 — 파고·시정 페널티 정규화 + 종합 결합.
import { describe, it, expect } from 'vitest';
import {
  waveCost,
  visibilityCost,
  weatherPenalty,
  weatherEdgeMultiplier,
} from './weatherCost.js';

describe('waveCost', () => {
  it('잔잔한 바다(0m)는 페널티 0', () => {
    expect(waveCost(0)).toBe(0);
  });
  it('maxWaveM 이상은 1로 포화', () => {
    expect(waveCost(6, { maxWaveM: 6 })).toBe(1);
    expect(waveCost(10, { maxWaveM: 6 })).toBe(1);
  });
  it('중간 파고는 비례', () => {
    expect(waveCost(3, { maxWaveM: 6 })).toBeCloseTo(0.5, 6);
  });
  it('비유한 입력은 0', () => {
    expect(waveCost(NaN)).toBe(0);
    expect(waveCost(undefined)).toBe(0);
  });
});

describe('visibilityCost', () => {
  it('양호 시정(>=10km)은 페널티 0', () => {
    expect(visibilityCost(10)).toBe(0);
    expect(visibilityCost(20)).toBe(0);
  });
  it('최저 시정(<=1km)은 페널티 1', () => {
    expect(visibilityCost(1)).toBe(1);
    expect(visibilityCost(0.3)).toBe(1);
  });
  it('중간 시정은 역비례', () => {
    // (10-5.5)/(10-1) = 0.5
    expect(visibilityCost(5.5)).toBeCloseTo(0.5, 6);
  });
  it('데이터 없음(NaN)은 0', () => {
    expect(visibilityCost(NaN)).toBe(0);
  });
});

describe('weatherPenalty', () => {
  it('악천후(고파고+저시정)는 높은 페널티', () => {
    const p = weatherPenalty({ wave_height_m: 6, visibility_km: 0.5 });
    expect(p).toBeCloseTo(1, 6);
  });
  it('호조건은 0', () => {
    expect(weatherPenalty({ wave_height_m: 0, visibility_km: 15 })).toBe(0);
  });
  it('가중치(파고 0.6 / 시정 0.4) 결합 검증', () => {
    // wave=1(6m), vis=0(15km) → 0.6*1 + 0.4*0 = 0.6
    const p = weatherPenalty({ wave_height_m: 6, visibility_km: 15 });
    expect(p).toBeCloseTo(0.6, 6);
  });
  it('null/빈 입력은 0', () => {
    expect(weatherPenalty(null)).toBe(0);
    expect(weatherPenalty({})).toBe(0);
  });
  it('항상 [0,1] 범위', () => {
    const p = weatherPenalty({ wave_height_m: 100, visibility_km: -5 });
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe('weatherEdgeMultiplier', () => {
  it('페널티 0이면 승수 1 (영향 없음)', () => {
    expect(weatherEdgeMultiplier(0)).toBe(1);
  });
  it('페널티 1이면 1 + weight', () => {
    expect(weatherEdgeMultiplier(1, 1.5)).toBe(2.5);
  });
  it('페널티는 [0,1]로 클램프', () => {
    expect(weatherEdgeMultiplier(5, 1)).toBe(2);
  });
});
