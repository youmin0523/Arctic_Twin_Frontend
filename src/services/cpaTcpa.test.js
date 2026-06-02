// CPA/TCPA 충돌 위협 판정 테스트 — 상대속도 기반 최근접 거리/시각.
import { describe, it, expect } from 'vitest';
import {
  toLocalKm,
  velocityVector,
  computeCPA,
  assessThreat,
  mostImminentThreat,
} from './cpaTcpa.js';

describe('velocityVector', () => {
  it('북향(heading=0)은 +y 성분', () => {
    const v = velocityVector(10, 0);
    expect(v.vy).toBeGreaterThan(0);
    expect(v.vx).toBeCloseTo(0, 6);
  });
  it('동향(heading=90)은 +x 성분', () => {
    const v = velocityVector(10, 90);
    expect(v.vx).toBeGreaterThan(0);
    expect(v.vy).toBeCloseTo(0, 6);
  });
  it('정지(0노트)는 영벡터', () => {
    expect(velocityVector(0, 45)).toEqual({ vx: 0, vy: 0 });
  });
});

describe('toLocalKm', () => {
  it('동일 지점은 원점', () => {
    const p = toLocalKm(70, 100, 70, 100);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });
  it('북쪽 표적은 +y', () => {
    expect(toLocalKm(70, 100, 71, 100).y).toBeGreaterThan(0);
  });
});

describe('computeCPA', () => {
  it('정북으로 항진 + 정북 표적 → 정면 접근, CPA≈0', () => {
    const ship = { lat: 70, lon: 100, speedKnots: 15, headingDeg: 0 };
    const berg = { lat: 70.5, lon: 100 }; // 정북 정지 빙산
    const r = computeCPA(ship, berg);
    expect(r.closing).toBe(true);
    expect(r.cpaKm).toBeLessThan(1);
    expect(r.tcpaHours).toBeGreaterThan(0);
  });

  it('표적에서 멀어지는 방향이면 closing=false, tcpa=0', () => {
    const ship = { lat: 70, lon: 100, speedKnots: 15, headingDeg: 180 }; // 남향
    const berg = { lat: 70.5, lon: 100 }; // 북쪽 빙산 (뒤쪽)
    const r = computeCPA(ship, berg);
    expect(r.closing).toBe(false);
    expect(r.tcpaHours).toBe(0);
    expect(r.cpaKm).toBeCloseTo(r.currentKm, 6);
  });

  it('정지 선박은 거리 불변(상대속도 0)', () => {
    const ship = { lat: 70, lon: 100, speedKnots: 0, headingDeg: 0 };
    const berg = { lat: 70.5, lon: 100 };
    const r = computeCPA(ship, berg);
    expect(r.closing).toBe(false);
    expect(r.cpaKm).toBeCloseTo(r.currentKm, 6);
  });

  it('빗겨가는 경로는 CPA > 0 이고 현재거리보다 작다', () => {
    const ship = { lat: 70, lon: 100, speedKnots: 15, headingDeg: 0 };
    const berg = { lat: 70.5, lon: 100.2 }; // 약간 동쪽으로 빗겨남
    const r = computeCPA(ship, berg);
    expect(r.cpaKm).toBeGreaterThan(0);
    expect(r.cpaKm).toBeLessThan(r.currentKm);
  });
});

describe('assessThreat', () => {
  const ship = { lat: 70, lon: 100, speedKnots: 15, headingDeg: 0 };

  it('정면 임박 빙산은 위협', () => {
    const a = assessThreat(ship, { lat: 70.3, lon: 100 }, { safetyKm: 10, horizonHours: 6 });
    expect(a.threat).toBe(true);
  });

  it('멀리 빗겨가는 빙산은 위협 아님', () => {
    const a = assessThreat(ship, { lat: 70.3, lon: 101.5 }, { safetyKm: 5, horizonHours: 6 });
    expect(a.threat).toBe(false);
  });

  it('horizon 밖(너무 먼 미래)은 위협 아님', () => {
    const far = { lat: 75, lon: 100 }; // 정면이지만 매우 멀어 TCPA 큼
    const a = assessThreat(ship, far, { safetyKm: 10, horizonHours: 1 });
    expect(a.threat).toBe(false);
  });
});

describe('mostImminentThreat', () => {
  const ship = { lat: 70, lon: 100, speedKnots: 15, headingDeg: 0 };

  it('가장 TCPA 가 작은 위협을 선택', () => {
    const bergs = [
      { lat: 70.8, lon: 100, id: 'far' },
      { lat: 70.2, lon: 100, id: 'near' },
    ];
    const best = mostImminentThreat(ship, bergs, { safetyKm: 10, horizonHours: 6 });
    expect(best).not.toBeNull();
    expect(best.target.id).toBe('near');
  });

  it('위협이 없으면 null', () => {
    const bergs = [{ lat: 70.3, lon: 102 }]; // 멀리 빗겨감
    expect(mostImminentThreat(ship, bergs, { safetyKm: 3, horizonHours: 2 })).toBeNull();
  });

  it('빈 배열은 null', () => {
    expect(mostImminentThreat(ship, [])).toBeNull();
  });
});
