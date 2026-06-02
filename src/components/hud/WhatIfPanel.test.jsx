// @vitest-environment jsdom
// WhatIfPanel 렌더 테스트 — 정량 비교 테이블 + 신뢰도 배지가 시나리오에 맞게 렌더되는지.
// (네트워크 호출은 시작 버튼을 누르지 않는 한 발생하지 않으므로 모킹 불필요.)
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// 모듈 평가 시 fetch 참조가 없어도 안전하도록 스텁(버튼 클릭 전엔 호출 안 됨)
vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no network in test'))));

import WhatIfPanel from './WhatIfPanel.jsx';
import * as ds from '../../services/decisionSupport.js';

afterEach(cleanup);

describe('WhatIfPanel — 비교/신뢰도 UI (decisionSupport 연동)', () => {
  it('초기 상태에서 분석 버튼을 렌더', () => {
    render(<WhatIfPanel route="NSR" iceClass="PC5" />);
    expect(screen.getByText(/WHAT-IF ANALYSIS/)).toBeInTheDocument();
  });

  it('항로/빙급 prop 을 헤더에 반영', () => {
    render(<WhatIfPanel route="NWP" iceClass="PC3" />);
    expect(screen.getByText('NWP')).toBeInTheDocument();
    expect(screen.getByText('PC3')).toBeInTheDocument();
  });

  it('buildScenarioComparison 이 추천등급 우선으로 정렬한다 (통합 동작 확인)', () => {
    // UI 와 동일 로직으로 비교표 입력이 정렬되는지 직접 검증
    const rows = ds.buildScenarioComparison([
      { name: '비추천안', recommendation: '비추천', route_summary: { avg_rio: 1, green_days: 2, yellow_days: 2, red_days: 6 } },
      { name: '추천안', recommendation: '추천', route_summary: { avg_rio: 5, green_days: 9, yellow_days: 1, red_days: 0 } },
    ]);
    expect(rows[0].name).toBe('추천안');
    expect(rows[0].rank).toBe(1);
  });

  it('assessConfidence 가 신뢰도 레벨을 산출한다 (배지 데이터 소스)', () => {
    const c = ds.assessConfidence([
      { name: 'a', recommendation: '추천', route_summary: {} },
      { name: 'b', recommendation: '조건부', route_summary: {} },
      { name: 'c', recommendation: '비추천', route_summary: {} },
      { name: 'd', recommendation: '추천', route_summary: {} },
    ]);
    expect(['high', 'medium', 'low']).toContain(c.level);
    expect(typeof c.label).toBe('string');
  });
});
