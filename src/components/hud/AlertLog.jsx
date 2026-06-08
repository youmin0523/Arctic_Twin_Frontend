import React from 'react';

// 누적 알림 로그 — 육지/빙산 충돌 위험, 회피 경로 적용 완료 등이 시각으로 누적.
// AvoidanceMetricsHUD 바로 아래에 배치 (App.jsx 상단 좌측 컨테이너).
//
// 레벨별 좌측 컬러 바 + 아이콘 + 은은한 배경 틴트로 한눈에 스캔되도록 구성하고,
// [시간 · 위치]를 윗줄, 메시지를 아랫줄로 분리해 위계를 잡는다.
const LEVEL = {
  warn: { color: '#f87171', bar: '#ef4444', bg: 'rgba(248,113,113,0.10)', icon: '▲' },
  ok:   { color: '#34d399', bar: '#10b981', bg: 'rgba(52,211,153,0.10)',  icon: '✓' },
  info: { color: '#7dd3fc', bar: '#38bdf8', bg: 'rgba(125,211,252,0.07)', icon: '›' },
};

export default function AlertLog({ entries = [], maxHeight = 180 }) {
  return (
    <div
      style={{
        width: 244,
        background: 'rgba(8,13,28,0.85)',
        border: '1px solid rgba(56,82,120,0.5)',
        borderRadius: 10,
        fontFamily:
          "system-ui, -apple-system, 'Segoe UI', 'Malgun Gothic', sans-serif",
        color: '#cbd5e1',
        backdropFilter: 'blur(8px)',
        pointerEvents: 'auto',
        overflow: 'hidden',
        boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
      }}
    >
      {/* 헤더 — 제목 + 건수 배지 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 10px',
          borderBottom: '1px solid rgba(56,82,120,0.35)',
          background: 'rgba(125,211,252,0.04)',
        }}
      >
        <span
          style={{
            color: '#7dd3fc',
            fontWeight: 700,
            letterSpacing: 0.4,
            fontSize: 11,
          }}
        >
          🔔 알림 로그
        </span>
        {entries.length > 0 && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              color: '#7dd3fc',
              background: 'rgba(125,211,252,0.14)',
              borderRadius: 9,
              padding: '1px 7px',
              lineHeight: 1.5,
            }}
          >
            {entries.length}
          </span>
        )}
      </div>

      {/* 본문 — 스크롤 영역 */}
      <div style={{ maxHeight, overflowY: 'auto', padding: '6px 7px' }}>
        {entries.length === 0 ? (
          <div
            style={{
              color: '#64748b',
              fontSize: 10.5,
              textAlign: 'center',
              padding: '14px 0',
            }}
          >
            알림 없음
          </div>
        ) : (
          entries.map((e) => {
            const lv = LEVEL[e.level] || LEVEL.info;
            return (
              <div
                key={e.id}
                style={{
                  display: 'flex',
                  gap: 7,
                  padding: '5px 7px',
                  marginBottom: 4,
                  borderRadius: 6,
                  background: lv.bg,
                  borderLeft: `2.5px solid ${lv.bar}`,
                }}
              >
                {/* 레벨 아이콘 */}
                <span
                  style={{
                    color: lv.color,
                    fontSize: 10,
                    lineHeight: 1.5,
                    flexShrink: 0,
                    width: 11,
                    textAlign: 'center',
                  }}
                >
                  {lv.icon}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* 윗줄 — 시간 · 위치 칩 */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        color: '#64748b',
                        fontSize: 9.5,
                        fontFamily: 'monospace',
                        fontVariantNumeric: 'tabular-nums',
                        flexShrink: 0,
                      }}
                    >
                      {e.time}
                    </span>
                    {e.loc ? (
                      <span
                        style={{
                          color: '#9fd0ec',
                          fontSize: 9,
                          fontWeight: 600,
                          background: 'rgba(125,211,252,0.12)',
                          borderRadius: 4,
                          padding: '0 5px',
                          lineHeight: 1.6,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '60%',
                        }}
                      >
                        {e.loc}
                      </span>
                    ) : null}
                  </div>

                  {/* 아랫줄 — 메시지 */}
                  <div
                    style={{
                      color: '#e2e8f0',
                      fontSize: 11,
                      lineHeight: 1.4,
                      wordBreak: 'break-word',
                    }}
                  >
                    {e.msg}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
