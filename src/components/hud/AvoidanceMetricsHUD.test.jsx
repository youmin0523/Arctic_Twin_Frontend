// @vitest-environment jsdom
// AvoidanceMetricsPanel 렌더 테스트 — 메트릭 스냅샷 → 화면 표시 검증.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AvoidanceMetricsPanel } from './AvoidanceMetricsHUD.jsx';

afterEach(cleanup);

const snap = (over = {}) => ({
  checks: 10,
  threats: 4,
  threatsByType: { iceberg: 3, land: 1 },
  rlAttempts: 4,
  rlSuccess: 3,
  astarFallback: 1,
  applied: 4,
  kept: 0,
  rlSuccessRate: 0.75,
  fallbackRate: 0.25,
  avgConfidence: 0.62,
  threatRate: 0.4,
  byMethod: { RL: 3, 'A*': 1 },
  ...over,
});

describe('AvoidanceMetricsPanel', () => {
  it('위협이 없으면(threats=0) 아무것도 렌더하지 않음', () => {
    const { container } = render(<AvoidanceMetricsPanel metrics={snap({ threats: 0 })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('metrics 가 null 이면 렌더하지 않음', () => {
    const { container } = render(<AvoidanceMetricsPanel metrics={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('위협이 있으면 패널과 제목을 표시', () => {
    render(<AvoidanceMetricsPanel metrics={snap()} />);
    expect(screen.getByTestId('avoidance-metrics')).toBeInTheDocument();
    expect(screen.getByText('AI 자율 회피 지표')).toBeInTheDocument();
  });

  it('RL 성공률/폴백률을 퍼센트로 표시', () => {
    render(<AvoidanceMetricsPanel metrics={snap()} />);
    expect(screen.getByText('75%')).toBeInTheDocument(); // rlSuccessRate
    expect(screen.getByText('25%')).toBeInTheDocument(); // fallbackRate
  });

  it('평균 신뢰도를 소수 2자리로 표시', () => {
    render(<AvoidanceMetricsPanel metrics={snap()} />);
    expect(screen.getByText('0.62')).toBeInTheDocument();
  });

  it('회피 적용/위협 카운트를 표시', () => {
    render(<AvoidanceMetricsPanel metrics={snap({ applied: 4, threats: 4 })} />);
    expect(screen.getByText('4 / 4')).toBeInTheDocument();
  });

  it('방법별 적용 칩을 표시', () => {
    render(<AvoidanceMetricsPanel metrics={snap()} />);
    expect(screen.getByText('RL 3')).toBeInTheDocument();
    expect(screen.getByText('A* 1')).toBeInTheDocument();
  });
});
