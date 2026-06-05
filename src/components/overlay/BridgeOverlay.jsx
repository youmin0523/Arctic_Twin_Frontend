import React from 'react';

// ── 컴퍼스 테이프 파라미터 ──
const SPAN = 60; // 중앙(선수) 기준 좌우로 보이는 방위 범위(±°)
const TAPE_W = 360; // 테이프 폭(px)
const TAPE_H = 36; // 테이프 높이(px)
const PX_PER_DEG = TAPE_W / 2 / SPAN;
const CARD = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };

// 절대방위 a 를 현재 선수방위 hdg 기준 부호화 오프셋(−좌현 / +우현)으로
function relTo(a, hdg) {
  return ((((a - hdg) % 360) + 540) % 360) - 180;
}

export default function BridgeOverlay({
  visible,
  heading,
  speed,
  rollAngle,
  courseBearing,
  landBearing,
  landRel,
  landDistKm,
}) {
  const hdg = (((heading || 0) % 360) + 360) % 360;

  // ── 방위 눈금(10° 간격, 30°마다 라벨/카디널) ──
  const ticks = [];
  const start = Math.ceil((hdg - SPAN) / 10) * 10;
  for (let h = start; h <= hdg + SPAN; h += 10) {
    const hh = ((h % 360) + 360) % 360;
    const rel = relTo(hh, hdg);
    if (rel < -SPAN || rel > SPAN) continue;
    const major = hh % 30 === 0;
    ticks.push({
      x: TAPE_W / 2 + rel * PX_PER_DEG,
      major,
      label: CARD[hh] || (major ? String(hh).padStart(3, '0') : null),
    });
  }

  // ── 방향 버그(테이프 범위 밖이면 가장자리에 고정 + 화살표) ──
  function bug(bearing) {
    if (typeof bearing !== 'number' || Number.isNaN(bearing)) return null;
    const rel = relTo(((bearing % 360) + 360) % 360, hdg);
    let edge = null;
    let clamped = rel;
    if (rel < -SPAN) { clamped = -SPAN; edge = 'left'; }
    else if (rel > SPAN) { clamped = SPAN; edge = 'right'; }
    return { x: TAPE_W / 2 + clamped * PX_PER_DEG, edge };
  }
  const courseBug = bug(courseBearing);
  const landBug = bug(typeof landBearing === 'number' ? landBearing : null);

  return (
    <div id="bridge-frame" className={visible ? 'show' : ''}>
      <div id="bf-top"></div>
      <div id="bf-bottom"></div>
      <div id="bf-left"></div>
      <div id="bf-right"></div>
      <div className="bf-wiper" id="bf-wiper1"></div>
      <div className="bf-wiper" id="bf-wiper2"></div>

      {/* ── 컴퍼스 테이프 (선수방위 따라 좌우 스크롤) ── */}
      <div
        style={{
          position: 'absolute',
          top: '11.5%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: TAPE_W,
          height: TAPE_H + 22,
          pointerEvents: 'none',
          zIndex: 152,
          fontFamily: 'monospace',
        }}
      >
        {/* 눈금 트랙 */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: TAPE_W,
            height: TAPE_H,
            overflow: 'hidden',
            maskImage:
              'linear-gradient(90deg, transparent 0, #000 12%, #000 88%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(90deg, transparent 0, #000 12%, #000 88%, transparent 100%)',
          }}
        >
          {ticks.map((t, i) => {
            const isCardinal = /^[NESW]$/.test(t.label || '');
            return (
              <React.Fragment key={i}>
                <div
                  style={{
                    position: 'absolute',
                    left: t.x,
                    top: t.major ? 14 : 20,
                    width: 1,
                    height: t.major ? TAPE_H - 14 : TAPE_H - 20,
                    background: 'rgba(34,211,238,0.7)',
                  }}
                />
                {t.label && (
                  <div
                    style={{
                      position: 'absolute',
                      left: t.x,
                      top: 0,
                      transform: 'translateX(-50%)',
                      fontSize: isCardinal ? 12 : 10,
                      fontWeight: 700,
                      color: isCardinal ? '#7dd3fc' : 'rgba(190,225,240,0.8)',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {t.label}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* 항로 코스 버그(청록) — 경로가 가리키는 방향 */}
        {courseBug && (
          <div
            style={{
              position: 'absolute',
              left: courseBug.x,
              top: TAPE_H - 4,
              transform: 'translateX(-50%)',
              fontSize: 12,
              lineHeight: 1,
              color: '#34d399',
              textShadow: '0 0 6px rgba(52,211,153,0.8)',
            }}
          >
            {courseBug.edge === 'left' ? '◀' : courseBug.edge === 'right' ? '▶' : '▲'}
          </div>
        )}

        {/* 육지 위험 버그(호박) + 거리 */}
        {landBug && (
          <>
            <div
              style={{
                position: 'absolute',
                left: landBug.x,
                top: TAPE_H + 6,
                transform: 'translateX(-50%)',
                fontSize: 12,
                lineHeight: 1,
                color: '#fbbf24',
                textShadow: '0 0 6px rgba(251,191,36,0.9)',
              }}
            >
              {landBug.edge === 'left' ? '◀🏔️' : landBug.edge === 'right' ? '🏔️▶' : '🏔️'}
            </div>
            {landDistKm != null && (
              <div
                style={{
                  position: 'absolute',
                  left: Math.max(20, Math.min(TAPE_W - 20, landBug.x)),
                  top: TAPE_H + 22,
                  transform: 'translateX(-50%)',
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#fbbf24',
                  whiteSpace: 'nowrap',
                }}
              >
                {landDistKm}km
              </div>
            )}
          </>
        )}

        {/* 중앙 선수 기준 마커(고정) */}
        <div
          style={{
            position: 'absolute',
            left: TAPE_W / 2,
            top: TAPE_H - 7,
            transform: 'translateX(-50%)',
            fontSize: 13,
            lineHeight: 1,
            color: '#e2f6ff',
            textShadow: '0 0 6px rgba(34,211,238,0.9)',
          }}
        >
          ▼
        </div>
      </div>

      {/* 항법 HUD (선수 기준선 + 선박 실루엣) */}
      <svg id="bf-hud-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* 수직 점선 (heading 텍스트 → 선수) */}
        <line x1="50" y1="19" x2="50" y2="56"
          stroke="#22d3ee" strokeWidth="0.3" strokeDasharray="1.5 1" vectorEffect="non-scaling-stroke" />
        {/* 선박 실루엣 (top-down, 선수 위쪽) */}
        <path d="M50,56 L47,58.5 L46,61 L46.5,63.5 L48,65 L52,65 L53.5,63.5 L54,61 L53,58.5 Z"
          fill="rgba(34,211,238,0.10)" stroke="#22d3ee" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
        {/* 선교 구조물 */}
        <rect x="48.5" y="60.5" width="3" height="2.2"
          fill="rgba(34,211,238,0.18)" stroke="#22d3ee" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
      </svg>

      {/* 선수방위 텍스트 */}
      <div id="bf-heading-display">
        {String(Math.round(hdg)).padStart(3, '0')}° T
      </div>
    </div>
  );
}
