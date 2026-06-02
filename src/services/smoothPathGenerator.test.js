// 항로 스무딩 순수 로직 테스트 — Catmull-Rom 스플라인 + 거리 리샘플링.
import { describe, it, expect } from 'vitest';
import { catmullRomSpline, resampleByDistance } from './smoothPathGenerator.js';

const PATH = [
  { lon: 130, lat: 70 },
  { lon: 135, lat: 72 },
  { lon: 142, lat: 73 },
  { lon: 150, lat: 74 },
];

describe('catmullRomSpline', () => {
  it('점 < 2 면 입력 그대로 반환', () => {
    expect(catmullRomSpline([])).toEqual([]);
    expect(catmullRomSpline([{ lon: 1, lat: 1 }])).toHaveLength(1);
  });

  it('2점이면 중간점을 삽입해 3점 반환', () => {
    const out = catmullRomSpline([{ lon: 0, lat: 0 }, { lon: 10, lat: 10 }]);
    expect(out).toHaveLength(3);
    expect(out[1].label).toBe('우회 중간');
  });

  it('곡선이 시작점에서 출발해 끝점에서 종료', () => {
    const out = catmullRomSpline(PATH, 8);
    expect(out[0].lon).toBeCloseTo(PATH[0].lon, 6);
    expect(out[0].lat).toBeCloseTo(PATH[0].lat, 6);
    expect(out[out.length - 1].lon).toBeCloseTo(PATH[PATH.length - 1].lon, 6);
    expect(out[out.length - 1].lat).toBeCloseTo(PATH[PATH.length - 1].lat, 6);
  });

  it('샘플 수가 많을수록 더 조밀한 곡선', () => {
    expect(catmullRomSpline(PATH, 16).length).toBeGreaterThan(catmullRomSpline(PATH, 4).length);
  });

  it('모든 출력 좌표가 유한값', () => {
    for (const p of catmullRomSpline(PATH, 10)) {
      expect(Number.isFinite(p.lon)).toBe(true);
      expect(Number.isFinite(p.lat)).toBe(true);
    }
  });
});

describe('resampleByDistance', () => {
  it('점 < 2 면 입력 그대로', () => {
    expect(resampleByDistance([])).toEqual([]);
  });

  it('시작점을 보존', () => {
    const out = resampleByDistance(PATH, 50);
    expect(out[0].lon).toBeCloseTo(PATH[0].lon, 6);
    expect(out[0].lat).toBeCloseTo(PATH[0].lat, 6);
  });

  it('끝점에 근접한 점으로 종료', () => {
    const out = resampleByDistance(PATH, 50);
    const last = out[out.length - 1];
    expect(last.lat).toBeCloseTo(PATH[PATH.length - 1].lat, 1);
  });

  it('더 작은 간격은 더 많은 점을 생성', () => {
    expect(resampleByDistance(PATH, 20).length).toBeGreaterThan(resampleByDistance(PATH, 200).length);
  });
});
