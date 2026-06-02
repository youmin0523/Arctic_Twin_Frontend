import React, { useEffect, useState } from 'react';

/**
 * AvoidanceMetricsHUD
 *
 * RL 빙산/육지 회피 컨트롤러의 런타임 관측성 지표를 화면에 노출.
 * 컨트롤러의 getMetrics() 스냅샷을 주기적으로 폴링해 표시한다.
 *
 * - 표시 컴포넌트(AvoidanceMetricsPanel)는 순수 — 스냅샷만 받아 렌더(테스트 용이).
 * - 래퍼(AvoidanceMetricsHUD)가 폴링/생명주기를 담당.
 */

const POLL_MS = 2000;

function pct(x) {
  return `${Math.round((x || 0) * 100)}%`;
}

function rlRateColor(rate) {
  if (rate >= 0.7) return '#34d399';
  if (rate >= 0.4) return '#fbbf24';
  return '#f87171';
}

function confidenceColor(c) {
  if (c >= 0.6) return '#34d399';
  if (c >= 0.3) return '#fbbf24';
  return '#f87171';
}

/**
 * 순수 표시 컴포넌트 — metrics 스냅샷(avoidanceMetrics.snapshot())을 받아 렌더.
 * 위협이 한 번도 감지되지 않았으면(threats===0) null 을 반환해 화면을 비운다.
 */
export function AvoidanceMetricsPanel({ metrics }) {
  if (!metrics || metrics.threats === 0) return null;

  const { rlSuccessRate, fallbackRate, avgConfidence, applied, threats, kept, byMethod = {} } = metrics;

  return (
    <div
      data-testid="avoidance-metrics"
      style={{
        width: 210,
        background: 'rgba(13, 19, 41, 0.92)',
        border: '1px solid rgba(56,189,248,0.3)',
        borderRadius: 8,
        backdropFilter: 'blur(8px)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
        padding: '10px 14px',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
        AI 자율 회피 지표
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Row label="RL 성공률" value={pct(rlSuccessRate)} color={rlRateColor(rlSuccessRate)} />
        <Row label="A* 폴백률" value={pct(fallbackRate)} color={fallbackRate > 0.5 ? '#f87171' : '#94a3b8'} />
        <Row label="평균 신뢰도" value={(avgConfidence || 0).toFixed(2)} color={confidenceColor(avgConfidence)} />
        <Row label="회피 적용 / 위협" value={`${applied} / ${threats}`} color="#93c5fd" />
        <Row label="경로 유지" value={String(kept)} color="#64748b" />
      </div>

      {Object.keys(byMethod).length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>방법별 적용</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Object.entries(byMethod).map(([m, n]) => (
              <span
                key={m}
                style={{
                  fontSize: 9, color: '#c4b5fd',
                  background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.4)',
                  borderRadius: 3, padding: '1px 5px',
                }}
              >
                {m} {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}

/**
 * 폴링 래퍼.
 * @param {Function} getMetrics - () => snapshot | undefined (컨트롤러의 getMetrics)
 * @param {boolean}  active     - 시뮬레이션 활성 여부 (false 면 폴링 중지)
 */
export default function AvoidanceMetricsHUD({ getMetrics, active }) {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    if (!active || typeof getMetrics !== 'function') {
      setMetrics(null);
      return;
    }
    const tick = () => {
      try {
        setMetrics(getMetrics() || null);
      } catch {
        setMetrics(null);
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [getMetrics, active]);

  return <AvoidanceMetricsPanel metrics={metrics} />;
}
