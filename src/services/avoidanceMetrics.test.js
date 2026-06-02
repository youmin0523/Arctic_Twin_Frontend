// RL 회피 관측성 수집기 테스트 — 파생 지표(성공률/폴백률/평균신뢰도) 정확성.
import { describe, it, expect } from 'vitest';
import { createAvoidanceMetrics } from './avoidanceMetrics.js';

describe('createAvoidanceMetrics', () => {
  it('초기 스냅샷은 모두 0', () => {
    const m = createAvoidanceMetrics();
    const s = m.snapshot();
    expect(s.checks).toBe(0);
    expect(s.rlSuccessRate).toBe(0);
    expect(s.fallbackRate).toBe(0);
    expect(s.avgConfidence).toBe(0);
  });

  it('RL 성공/폴백률을 시도 대비 정확히 계산', () => {
    const m = createAvoidanceMetrics();
    // 위협 4건: RL 성공 3, A* 폴백 1
    for (let i = 0; i < 4; i++) {
      m.recordCheck();
      m.recordThreat('iceberg');
      m.recordRLAttempt(0.8);
    }
    m.recordOutcome({ method: 'RL', applied: true });
    m.recordOutcome({ method: 'RL', applied: true });
    m.recordOutcome({ method: 'RL', applied: true });
    m.recordOutcome({ method: 'A*', applied: true });

    const s = m.snapshot();
    expect(s.rlAttempts).toBe(4);
    expect(s.rlSuccess).toBe(3);
    expect(s.astarFallback).toBe(1);
    expect(s.rlSuccessRate).toBe(0.75);
    expect(s.fallbackRate).toBe(0.25);
    expect(s.applied).toBe(4);
  });

  it('평균 신뢰도는 기록된 값들의 산술평균', () => {
    const m = createAvoidanceMetrics();
    m.recordRLAttempt(0.4);
    m.recordRLAttempt(0.6);
    m.recordRLAttempt(0.8);
    expect(m.snapshot().avgConfidence).toBe(0.6);
  });

  it('NaN 신뢰도는 평균에서 제외', () => {
    const m = createAvoidanceMetrics();
    m.recordRLAttempt(1.0);
    m.recordRLAttempt(NaN);
    expect(m.snapshot().avgConfidence).toBe(1.0);
  });

  it('경로 유지(applied=false)는 kept로 집계, 적용엔 미포함', () => {
    const m = createAvoidanceMetrics();
    m.recordOutcome({ method: 'RL', applied: false });
    const s = m.snapshot();
    expect(s.kept).toBe(1);
    expect(s.applied).toBe(0);
    expect(s.rlSuccess).toBe(0);
  });

  it('위협 유형별로 분리 집계', () => {
    const m = createAvoidanceMetrics();
    m.recordThreat('iceberg');
    m.recordThreat('land');
    m.recordThreat('iceberg');
    const s = m.snapshot();
    expect(s.threatsByType.iceberg).toBe(2);
    expect(s.threatsByType.land).toBe(1);
  });

  it('방법별 적용 횟수 집계 + 알 수 없는 방법은 unknown', () => {
    const m = createAvoidanceMetrics();
    m.recordOutcome({ method: 'RL', applied: true });
    m.recordOutcome({ method: 'GlobalA*', applied: true });
    m.recordOutcome({ method: '엉뚱한값', applied: true });
    const s = m.snapshot();
    expect(s.byMethod.RL).toBe(1);
    expect(s.byMethod['GlobalA*']).toBe(1);
    expect(s.byMethod.unknown).toBe(1);
  });

  it('snapshot은 내부 상태의 복제본 (외부 변형 차단)', () => {
    const m = createAvoidanceMetrics();
    m.recordThreat('iceberg');
    const s = m.snapshot();
    s.threatsByType.iceberg = 999;
    expect(m.snapshot().threatsByType.iceberg).toBe(1);
  });

  it('reset 후 모든 카운터 0', () => {
    const m = createAvoidanceMetrics();
    m.recordCheck();
    m.recordThreat('land');
    m.recordRLAttempt(0.5);
    m.reset();
    const s = m.snapshot();
    expect(s.checks).toBe(0);
    expect(s.threats).toBe(0);
    expect(s.avgConfidence).toBe(0);
    expect(s.minTcpaHours).toBeNull();
  });

  it('TCPA(임박도)를 평균/최소로 집계', () => {
    const m = createAvoidanceMetrics();
    m.recordThreat('iceberg', 4);
    m.recordThreat('iceberg', 2);
    m.recordThreat('iceberg', 6);
    const s = m.snapshot();
    expect(s.avgTcpaHours).toBe(4);
    expect(s.minTcpaHours).toBe(2);
  });

  it('TCPA 미제공 위협은 임박도 집계에서 제외 (null 유지)', () => {
    const m = createAvoidanceMetrics();
    m.recordThreat('land'); // tcpa 없음
    const s = m.snapshot();
    expect(s.avgTcpaHours).toBeNull();
    expect(s.minTcpaHours).toBeNull();
  });
});
