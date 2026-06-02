// 충돌 결과 + 환경 영향 물리 모델 테스트.
import { describe, it, expect } from 'vitest';
import {
  iceClassDamageFactor,
  impactEnergyProxy,
  collisionOutcome,
  environmentalSpeedFactor,
  applyEnvironmentToSpeed,
} from './collisionModel.js';

describe('iceClassDamageFactor', () => {
  it('고빙급(PC1)은 손상계수 최저', () => {
    expect(iceClassDamageFactor('PC1')).toBeLessThan(iceClassDamageFactor('PC7'));
  });
  it('일반선(NONE)이 최대 손상', () => {
    expect(iceClassDamageFactor('NONE')).toBe(1.0);
  });
  it('알 수 없는 빙급은 NONE 폴백', () => {
    expect(iceClassDamageFactor('???')).toBe(iceClassDamageFactor('NONE'));
  });
});

describe('impactEnergyProxy', () => {
  it('속도 0이면 에너지 0', () => {
    expect(impactEnergyProxy(0, 1000)).toBe(0);
  });
  it('속도 제곱에 비례', () => {
    const e1 = impactEnergyProxy(5, 1000);
    const e2 = impactEnergyProxy(10, 1000);
    expect(e2).toBeCloseTo(4 * e1, 5);
  });
  it('빙산이 클수록 에너지 큼', () => {
    expect(impactEnergyProxy(10, 5000)).toBeGreaterThan(impactEnergyProxy(10, 1000));
  });
});

describe('collisionOutcome', () => {
  it('저속 소형 빙산 + 고빙급 → 경미', () => {
    const o = collisionOutcome({ speedKnots: 2, icebergLengthM: 200, iceClass: 'PC2' });
    expect(o.severity).toBeLessThan(0.3);
    expect(o.recoverable).toBe(true);
  });

  it('고속 대형 빙산 + 일반선 → 심각/치명', () => {
    const o = collisionOutcome({ speedKnots: 18, icebergLengthM: 8000, iceClass: 'NONE' });
    expect(o.severity).toBeGreaterThan(0.6);
    expect(o.speedLossFactor).toBeGreaterThan(o.severity * 0); // 손실 양수
  });

  it('같은 충돌이라도 고빙급이 피해 적다', () => {
    const hi = collisionOutcome({ speedKnots: 12, icebergLengthM: 3000, iceClass: 'PC2' });
    const lo = collisionOutcome({ speedKnots: 12, icebergLengthM: 3000, iceClass: 'PC7' });
    expect(hi.severity).toBeLessThanOrEqual(lo.severity);
  });

  it('빗겨맞음(glancing)은 정면충돌보다 피해 적다', () => {
    const head = collisionOutcome({ speedKnots: 12, icebergLengthM: 3000, iceClass: 'PC5', glancing: false });
    const glance = collisionOutcome({ speedKnots: 12, icebergLengthM: 3000, iceClass: 'PC5', glancing: true });
    expect(glance.severity).toBeLessThan(head.severity);
  });

  it('모든 출력이 유효 범위', () => {
    const o = collisionOutcome({ speedKnots: 25, icebergLengthM: 10000, iceClass: 'NONE' });
    expect(o.severity).toBeGreaterThanOrEqual(0);
    expect(o.severity).toBeLessThanOrEqual(1);
    expect(o.hullStress).toBeLessThanOrEqual(1);
    expect(o.headingDeflectionDeg).toBeGreaterThanOrEqual(0);
    expect(typeof o.label).toBe('string');
  });

  it('심각도에 따라 라벨이 단계적으로 상승', () => {
    const mild = collisionOutcome({ speedKnots: 1, icebergLengthM: 100, iceClass: 'PC1' });
    const severe = collisionOutcome({ speedKnots: 20, icebergLengthM: 9000, iceClass: 'NONE' });
    expect(mild.label).toContain('경미');
    expect(['중대 손상', '치명적 충돌']).toContain(severe.label);
  });
});

describe('environmentalSpeedFactor', () => {
  it('호조건은 감속 없음(=1)', () => {
    expect(environmentalSpeedFactor({ wave_height_m: 0, visibility_km: 15, wind_knots: 0 })).toBe(1);
  });
  it('악천후는 minFactor까지 감속', () => {
    const f = environmentalSpeedFactor({ wave_height_m: 8, visibility_km: 0.5, wind_knots: 50 });
    expect(f).toBeLessThan(0.5);
    expect(f).toBeGreaterThanOrEqual(0.3);
  });
  it('파고가 높을수록 더 감속', () => {
    const calm = environmentalSpeedFactor({ wave_height_m: 1 });
    const rough = environmentalSpeedFactor({ wave_height_m: 5 });
    expect(rough).toBeLessThan(calm);
  });
  it('env 없으면 1', () => {
    expect(environmentalSpeedFactor(null)).toBe(1);
  });
});

describe('applyEnvironmentToSpeed', () => {
  it('악천후에서 안전속도가 낮아진다', () => {
    const base = 15;
    const adj = applyEnvironmentToSpeed(base, { wave_height_m: 6, visibility_km: 1, wind_knots: 40 });
    expect(adj).toBeLessThan(base);
    expect(adj).toBeGreaterThanOrEqual(0);
  });
  it('호조건은 원속 유지', () => {
    expect(applyEnvironmentToSpeed(15, { wave_height_m: 0, visibility_km: 15 })).toBe(15);
  });
});
