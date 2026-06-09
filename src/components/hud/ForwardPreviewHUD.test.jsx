// @vitest-environment jsdom
// ForwardPreviewHUD 렌더 테스트 — Live 사전계산 preview 배열이 히스토그램 막대 +
// 통과배지로 실제 DOM 에 그려지는지 검증(PASS/MARGINAL/BLOCKED 전 상태).
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ForwardPreviewHUD from './ForwardPreviewHUD.jsx';

afterEach(cleanup);

// bars 개의 균일 프리뷰 — thickness/rio 로 배지 상태를 제어
const mkPreview = (thk, rio, bars = 16) =>
  Array.from({ length: bars }, (_, i) => ({
    t: i + 1,
    kmAhead: (i + 1) * 25,
    thickness_m: thk,
    effective_thickness_m: thk,
    rio,
    position: { lat: 75 + i * 0.1, lon: 150 },
  }));

const barCount = (container) =>
  container.querySelectorAll('[title*="RIO"]').length;

describe('ForwardPreviewHUD (Live)', () => {
  it('개빙수역 preview → 헤더·16막대·PASS·Live 푸터 렌더', () => {
    const { container } = render(
      <ForwardPreviewHUD live visible preview={mkPreview(0, 2)} />,
    );
    expect(screen.getByText('전방 프리뷰')).toBeInTheDocument();
    expect(screen.getByText('PASS')).toBeInTheDocument();
    expect(screen.getByText(/전방 항로 스캔/)).toBeInTheDocument();
    expect(screen.getByText(/0 ~ 400 km/)).toBeInTheDocument();
    expect(barCount(container)).toBe(16);
  });

  it('중빙(두께 1.5m) → MARGINAL 배지', () => {
    render(<ForwardPreviewHUD live visible preview={mkPreview(1.5, -1)} />);
    expect(screen.getByText('MARGINAL')).toBeInTheDocument();
  });

  it('고빙(두께 2.2m) → BLOCKED 배지 + 막대 16개', () => {
    const { container } = render(
      <ForwardPreviewHUD live visible preview={mkPreview(2.2, -4)} />,
    );
    expect(screen.getByText('BLOCKED')).toBeInTheDocument();
    expect(barCount(container)).toBe(16);
  });

  it('낮은 RIO(-7)만으로도 BLOCKED (두께 무관)', () => {
    render(<ForwardPreviewHUD live visible preview={mkPreview(0.4, -7)} />);
    expect(screen.getByText('BLOCKED')).toBeInTheDocument();
  });

  it('visible=false 또는 빈 preview 면 아무것도 렌더 안 함', () => {
    const { container: c1 } = render(
      <ForwardPreviewHUD live visible={false} preview={mkPreview(0, 2)} />,
    );
    expect(c1).toBeEmptyDOMElement();
    const { container: c2 } = render(
      <ForwardPreviewHUD live visible preview={[]} />,
    );
    expect(c2).toBeEmptyDOMElement();
  });

  it('Voyage 모드(live=false) 푸터는 "추정 · N tick"', () => {
    render(<ForwardPreviewHUD visible preview={mkPreview(0.5, 1)} />);
    expect(screen.getByText(/추정 · 16 tick/)).toBeInTheDocument();
  });
});
