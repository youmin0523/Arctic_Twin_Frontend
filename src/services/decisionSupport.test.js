// 의사결정 지원 — 정량 비교/랭킹 + 신뢰도 평가 테스트.
import { describe, it, expect } from 'vitest';
import {
  isHypothetical,
  summarizeScenario,
  buildScenarioComparison,
  assessConfidence,
  countRecommendations,
} from './decisionSupport.js';

const mk = (name, rec, rio, g, y, r, extra = {}) => ({
  name,
  recommendation: rec,
  route_summary: { avg_rio: rio, green_days: g, yellow_days: y, red_days: r },
  ...extra,
});

describe('isHypothetical', () => {
  it('플래그/프리픽스를 인식', () => {
    expect(isHypothetical({ is_hypothetical: true })).toBe(true);
    expect(isHypothetical({ name: '[HYP] 가정' })).toBe(true);
    expect(isHypothetical({ name: '【가설】 X' })).toBe(true);
    expect(isHypothetical({ name: '정상 시나리오' })).toBe(false);
  });
});

describe('summarizeScenario', () => {
  it('파생 지표(totalDays, greenRatio)를 계산', () => {
    const s = summarizeScenario(mk('A', '추천', 5, 8, 2, 0));
    expect(s.totalDays).toBe(10);
    expect(s.greenRatio).toBe(0.8);
    expect(s.recTier).toBe(3);
  });

  it('일수 데이터 없으면 greenRatio=null (0 나눗셈 방지)', () => {
    const s = summarizeScenario({ name: 'X', recommendation: '추천', route_summary: {} });
    expect(s.greenRatio).toBeNull();
    expect(s.avgRio).toBeNull();
  });
});

describe('buildScenarioComparison', () => {
  it('추천등급 우선으로 정렬하고 rank 부여', () => {
    const rows = buildScenarioComparison([
      mk('비추천안', '비추천', 1, 2, 2, 6),
      mk('추천안', '추천', 4, 9, 1, 0),
      mk('조건부안', '조건부', 2, 6, 3, 1),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['추천안', '조건부안', '비추천안']);
    expect(rows[0].rank).toBe(1);
    expect(rows[2].rank).toBe(3);
  });

  it('같은 등급이면 평균 RIO 높은 쪽이 우선', () => {
    const rows = buildScenarioComparison([
      mk('낮은RIO', '추천', 2, 5, 0, 0),
      mk('높은RIO', '추천', 8, 5, 0, 0),
    ]);
    expect(rows[0].name).toBe('높은RIO');
  });

  it('기본적으로 가설 시나리오는 제외', () => {
    const rows = buildScenarioComparison([
      mk('실측', '추천', 4, 5, 0, 0),
      mk('[HYP] 가설', '추천', 9, 5, 0, 0),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('실측');
  });

  it('includeHypothetical=true 면 포함', () => {
    const rows = buildScenarioComparison(
      [mk('실측', '추천', 4, 5, 0, 0), mk('[HYP] 가설', '추천', 9, 5, 0, 0)],
      { includeHypothetical: true },
    );
    expect(rows).toHaveLength(2);
  });

  it('빈 입력은 빈 배열', () => {
    expect(buildScenarioComparison([])).toEqual([]);
    expect(buildScenarioComparison(null)).toEqual([]);
  });
});

describe('assessConfidence', () => {
  it('추천/비추천이 공존하고 4건 이상이면 높음', () => {
    const r = assessConfidence([
      mk('a', '추천', 4, 5, 0, 0),
      mk('b', '추천', 3, 5, 0, 0),
      mk('c', '조건부', 2, 4, 1, 0),
      mk('d', '비추천', 1, 1, 1, 3),
    ]);
    expect(r.level).toBe('high');
  });

  it('비추천 비율 >= 0.8 이면 낮음(collapse)', () => {
    const r = assessConfidence([
      mk('a', '비추천', 1, 0, 1, 9),
      mk('b', '비추천', 1, 0, 1, 9),
      mk('c', '비추천', 1, 0, 1, 9),
      mk('d', '비추천', 1, 0, 1, 9),
      mk('e', '추천', 4, 9, 1, 0), // 4/5 = 0.8
    ]);
    expect(r.level).toBe('low');
  });

  it('시나리오가 적으면 낮음(stalled)', () => {
    const r = assessConfidence([mk('a', '추천', 4, 5, 0, 0)]);
    expect(r.level).toBe('low');
  });

  it('실측 시나리오 없으면 낮음', () => {
    expect(assessConfidence([]).level).toBe('low');
    expect(assessConfidence([mk('[HYP] x', '추천', 4, 5, 0, 0)]).level).toBe('low');
  });

  it('백엔드 convergenceStatus가 있으면 우선 사용', () => {
    const r = assessConfidence(
      [mk('a', '추천', 4, 5, 0, 0), mk('b', '조건부', 2, 4, 1, 0)],
      'good',
    );
    expect(r.level).toBe('high');
  });

  it('항상 reason 문자열을 동반', () => {
    const r = assessConfidence([mk('a', '추천', 4, 5, 0, 0)]);
    expect(typeof r.reason).toBe('string');
    expect(r.reason.length).toBeGreaterThan(0);
  });
});

describe('countRecommendations', () => {
  it('등급별로 집계', () => {
    const c = countRecommendations([
      mk('a', '추천', 0, 0, 0, 0),
      mk('b', '추천', 0, 0, 0, 0),
      mk('c', '비추천', 0, 0, 0, 0),
    ]);
    expect(c).toEqual({ 추천: 2, 조건부: 0, 비추천: 1 });
  });
});
