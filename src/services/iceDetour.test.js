import { describe, it, expect } from 'vitest';
import {
  thicknessToIceType,
  makeIceSampler,
  makeRioSampler,
  applyIceDetours,
} from './iceDetour.js';

describe('thicknessToIceType (WMO 빙단계)', () => {
  it('두께 구간별로 빙질을 매핑한다', () => {
    expect(thicknessToIceType(0.05)).toBe('Grey Ice');
    expect(thicknessToIceType(0.2)).toBe('Grey-White Ice');
    expect(thicknessToIceType(0.5)).toBe('Thin First-Year (FY)');
    expect(thicknessToIceType(1.0)).toBe('Medium First-Year (FY)');
    expect(thicknessToIceType(1.5)).toBe('Thick First-Year (FY)');
    expect(thicknessToIceType(2.5)).toBe('Multi-Year (MY)');
    expect(thicknessToIceType(4.0)).toBe('Ridged/Hummocked');
  });
  it('두께가 두꺼울수록 더 위험한 빙질로 단조 증가', () => {
    const order = ['Grey Ice', 'Grey-White Ice', 'Thin First-Year (FY)', 'Medium First-Year (FY)', 'Thick First-Year (FY)', 'Multi-Year (MY)', 'Ridged/Hummocked'];
    const got = [0.05, 0.2, 0.5, 1.0, 1.5, 2.5, 4.0].map(thicknessToIceType);
    expect(got).toEqual(order);
  });
});

const DATASET = {
  cells: [
    { lon: 100, lat: 74.0, lonStep: 1, latStep: 0.75, concentration: 0.0, thickness: 0.0 },
    { lon: 101, lat: 74.0, lonStep: 1, latStep: 0.75, concentration: 0.9, thickness: 2.5 },
  ],
};

describe('makeIceSampler', () => {
  it('포인트가 속한 셀의 농도/두께를 반환', () => {
    const s = makeIceSampler(DATASET);
    expect(s(74.2, 100.5)).toEqual({ conc: 0.0, thick: 0.0 });
    expect(s(74.2, 101.5)).toEqual({ conc: 0.9, thick: 2.5 });
  });
  it('데이터 없는 영역은 개빙(0)', () => {
    const s = makeIceSampler(DATASET);
    expect(s(80, 0)).toEqual({ conc: 0, thick: 0 });
  });
});

describe('makeRioSampler (POLARIS)', () => {
  it('개빙수역은 높은 RIO(안전)', () => {
    const rio = makeRioSampler(DATASET, 'PC5');
    expect(rio(74.2, 100.5)).toBeGreaterThan(0);
  });
  it('고농도 다년생 빙은 낮은(위험) RIO', () => {
    const rio = makeRioSampler(DATASET, 'PC5');
    expect(rio(74.2, 101.5)).toBeLessThan(0);
  });
  it('동일 빙조건에서 저빙급(NONE)이 고빙급(PC5)보다 더 위험', () => {
    const weak = makeRioSampler(DATASET, 'NONE')(74.2, 101.5);
    const strong = makeRioSampler(DATASET, 'PC5')(74.2, 101.5);
    expect(weak).toBeLessThanOrEqual(strong);
  });
});

describe('applyIceDetours (가드)', () => {
  it('웨이포인트 3개 미만이면 그대로 반환', async () => {
    const wps = [{ lon: 0, lat: 70 }, { lon: 1, lat: 71 }];
    expect(await applyIceDetours(wps, DATASET, 'PC5')).toBe(wps);
  });
  it('해빙 데이터가 없으면 그대로 반환', async () => {
    const wps = [{ lon: 0, lat: 70 }, { lon: 1, lat: 71 }, { lon: 2, lat: 72 }];
    expect(await applyIceDetours(wps, { cells: [] }, 'PC5')).toBe(wps);
  });
  it('전역 마스크 미로드 환경(jsdom)에서는 베이스 항로를 보존', async () => {
    const wps = [{ lon: 100, lat: 73 }, { lon: 101, lat: 74 }, { lon: 102, lat: 74.5 }];
    const out = await applyIceDetours(wps, DATASET, 'PC5');
    expect(out).toBe(wps); // 마스크 없으면 우회 불가 → 원본 유지
  });
});
