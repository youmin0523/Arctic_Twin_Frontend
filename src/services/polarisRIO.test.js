// 골든/회귀 테스트 — POLARIS RIO 계산 + 5단계 라우팅 의사결정 트리.
// 현재 동작을 "고정"해 향후 리팩터링 시 회귀를 잡는다.
import { describe, it, expect } from 'vitest';
import {
  calculateRIO,
  evaluateRouting,
  NSR_MAX_DRAFT,
  NSR_MAX_BEAM,
} from './polarisRIO.js';

describe('calculateRIO', () => {
  it('개빙수역(Open Water)은 빙급과 무관하게 안전(양수)', () => {
    const rio = calculateRIO('PC5', [
      { type: 'Open Water', concentration_tenths: 10 },
    ]);
    expect(rio).toBe(20); // 10 * RIV(PC5, Open Water=2)
  });

  it('다년생 빙(MY)은 저빙급에서 음수 RIO', () => {
    const rio = calculateRIO('PC5', [
      { type: 'Multi-Year (MY)', concentration_tenths: 5 },
    ]);
    expect(rio).toBe(-10); // 5 * RIV(PC5, MY=-2)
  });

  it('알 수 없는 빙질은 건너뛴다 (NaN 방지)', () => {
    const rio = calculateRIO('PC5', [
      { type: '존재하지않는빙질', concentration_tenths: 9 },
      { type: 'Open Water', concentration_tenths: 1 },
    ]);
    expect(rio).toBe(2);
    expect(Number.isFinite(rio)).toBe(true);
  });

  it('미정의 빙급은 NONE 테이블로 폴백', () => {
    const unknown = calculateRIO('완전허구등급', [
      { type: 'Open Water', concentration_tenths: 10 },
    ]);
    const none = calculateRIO('NONE', [
      { type: 'Open Water', concentration_tenths: 10 },
    ]);
    expect(unknown).toBe(none);
  });

  it('소수 4자리로 반올림된다', () => {
    const rio = calculateRIO('IB', [
      { type: 'Thin First-Year (FY)', concentration_tenths: 3.33333 },
    ]);
    expect(rio).toBe(3.3333); // 3.33333 * 1, 반올림
  });
});

// 모든 규제 통과한 "건강한" 기준 선박 — Step 5(RIO)까지 도달
const cleanShip = {
  isSanctionedCountry: false,
  hasNsraPermit: true,
  hasPwom: true,
  fuelType: 'MGO',
  draft: 10,
  beam: 30,
  maxRescueDays: 7,
  isTempBelowMinus10: false,
  designTempMargin: 15,
  hasWinterization: true,
  hasZeroDischarge: true,
  hasPolarComms: true,
  hasIceNavigator: true,
  latitude: 72,
  commsType: 'LEO',
  shipType: 'General',
  waveHeight: 1.0,
  visibilityKm: 10,
  iceClass: 'PC5',
  iceConditions: [{ type: 'Open Water', concentration_tenths: 10 }],
};

describe('evaluateRouting — 단계별 거부 사유', () => {
  it('제재국 선박은 희망봉 우회', () => {
    const r = evaluateRouting({ ...cleanShip, isSanctionedCountry: true });
    expect(r.status).toBe('REROUTE_CAPE');
  });

  it('NSRA 허가 없으면 수에즈 우회', () => {
    const r = evaluateRouting({ ...cleanShip, hasNsraPermit: false });
    expect(r.status).toBe('REROUTE_SUEZ');
  });

  it('HFO 연료 + 면제 없음 → 수에즈 우회', () => {
    const r = evaluateRouting({ ...cleanShip, fuelType: 'HFO', hasHfoExemption: false });
    expect(r.status).toBe('REROUTE_SUEZ');
  });

  it('흘수 초과 → 수에즈 우회', () => {
    const r = evaluateRouting({ ...cleanShip, draft: NSR_MAX_DRAFT + 0.1 });
    expect(r.status).toBe('REROUTE_SUEZ');
  });

  it('선폭 초과 → 수에즈 우회', () => {
    const r = evaluateRouting({ ...cleanShip, beam: NSR_MAX_BEAM + 1 });
    expect(r.status).toBe('REROUTE_SUEZ');
  });

  it('고위도 + GEO 통신 → 수에즈 우회', () => {
    const r = evaluateRouting({ ...cleanShip, latitude: 80, commsType: 'GEO' });
    expect(r.status).toBe('REROUTE_SUEZ');
  });
});

describe('evaluateRouting — Step 5 RIO 분기', () => {
  it('RIO >= 0 이고 경고 없으면 NSR_APPROVED', () => {
    const r = evaluateRouting(cleanShip);
    expect(r.status).toBe('NSR_APPROVED');
    expect(r.rioScore).toBeGreaterThanOrEqual(0);
  });

  it('-10 <= RIO < 0 이면 조건부 통과(NSR_RESTRICTED)', () => {
    const r = evaluateRouting({
      ...cleanShip,
      iceConditions: [{ type: 'Multi-Year (MY)', concentration_tenths: 3 }], // 3*-2 = -6
    });
    expect(r.status).toBe('NSR_RESTRICTED');
    expect(r.rioScore).toBe(-6);
  });

  it('RIO < -10 이면 수에즈 우회', () => {
    const r = evaluateRouting({
      ...cleanShip,
      iceConditions: [{ type: 'Glacier Ice', concentration_tenths: 1 }], // 1*-20 = -20
    });
    expect(r.status).toBe('REROUTE_SUEZ');
    expect(r.rioScore).toBe(-20);
  });

  it('컨테이너선 한계파고 초과 → 수에즈 우회', () => {
    const r = evaluateRouting({
      ...cleanShip,
      shipType: 'Container Ship',
      waveHeight: 4.5,
    });
    expect(r.status).toBe('REROUTE_SUEZ');
  });

  it('통과 시 항상 사유(reason) 문자열을 동반', () => {
    const r = evaluateRouting(cleanShip);
    expect(typeof r.reason).toBe('string');
    expect(r.reason.length).toBeGreaterThan(0);
  });
});
