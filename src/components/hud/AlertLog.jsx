import React from 'react';

// 누적 알림 로그 — 육지/빙산 충돌 위험, 회피 경로 적용 완료 등이 시각으로 누적.
// AvoidanceMetricsHUD 바로 아래에 배치 (App.jsx 상단 좌측 컨테이너).
const LEVEL_COLOR = {
  warn: '#f87171',
  ok: '#34d399',
  info: '#93c5fd',
};

export default function AlertLog({ entries = [] }) {
  return (
    <div
      style={{
        width: 230,
        maxHeight: 200,
        overflowY: 'auto',
        background: 'rgba(8,13,28,0.82)',
        border: '1px solid rgba(56,82,120,0.5)',
        borderRadius: 8,
        padding: '8px 10px',
        fontFamily: 'monospace',
        fontSize: 10.5,
        color: '#cbd5e1',
        backdropFilter: 'blur(6px)',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          color: '#7dd3fc',
          fontWeight: 700,
          letterSpacing: 0.5,
          marginBottom: 6,
          fontSize: 10,
        }}
      >
        🔔 알림 로그
      </div>
      {entries.length === 0 ? (
        <div style={{ color: '#64748b', fontSize: 10 }}>알림 없음</div>
      ) : (
        entries.map((e) => (
          <div
            key={e.id}
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'baseline',
              padding: '2px 0',
              borderBottom: '1px solid rgba(56,82,120,0.18)',
            }}
          >
            <span style={{ color: '#64748b', flexShrink: 0 }}>{e.time}</span>
            <span style={{ color: LEVEL_COLOR[e.level] || '#cbd5e1', lineHeight: 1.35 }}>
              {e.msg}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
