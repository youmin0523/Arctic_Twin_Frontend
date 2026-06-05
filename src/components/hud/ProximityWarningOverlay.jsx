/**
 * ProximityWarningOverlay.jsx
 * ===========================
 * 빙하/육지 임계 근접 시 전체화면 빨간 경고 + RL 회피 상태 배너.
 *
 * 선미추적(FOLLOW) / 위성조감(SATELLITE) 등 모든 카메라 모드 위에 떠서
 * "지금 무엇을 피하고 있는지"를 시각적으로 강조한다.
 *
 *  - proximityAlert.level === 'critical' → 화면 가장자리 빨간 비네트가 깜빡임 + 상단 빨간 배너
 *  - proximityAlert.level === 'warning'  → 옅은 호박색 비네트 + 상단 호박색 배너
 *  - avoidance.active                    → 하단 청록색 "RL 회피 경로 계산/적용 중" 배너
 */

import React from 'react';

const KEYFRAMES = `
@keyframes dt-prox-flash {
  0%, 100% { opacity: 0.15; }
  50%      { opacity: 0.85; }
}
@keyframes dt-prox-flash-warn {
  0%, 100% { opacity: 0.08; }
  50%      { opacity: 0.42; }
}
@keyframes dt-prox-banner {
  0%, 100% { transform: translateX(-50%) scale(1);    box-shadow: 0 0 18px rgba(239,68,68,0.6); }
  50%      { transform: translateX(-50%) scale(1.04); box-shadow: 0 0 34px rgba(239,68,68,0.95); }
}
@keyframes dt-rl-pulse {
  0%, 100% { opacity: 0.8; }
  50%      { opacity: 1; }
}
`;

export default function ProximityWarningOverlay({ proximityAlert, avoidance, nav }) {
  const level = proximityAlert?.level || 'none';
  const type = proximityAlert?.type;
  const avoidActive = !!avoidance?.active;

  if (level === 'none' && !avoidActive) return null;

  const isCritical = level === 'critical';
  const isWarning = level === 'warning';
  const typeLabel = type === 'land' ? '육지' : '빙하';
  const typeIcon = type === 'land' ? '🏔️' : '🧊';

  // 임계 근접 비네트 색상
  const vignetteColor = isCritical
    ? 'rgba(239,68,68,0.55)'
    : 'rgba(245,158,11,0.4)';

  // ── 방향(좌현/우현 + 화살표) — 육지 경고에 실제 방위 반영 ──
  // nav.landRel: +우현 / −좌현 / 0 정면 (App에서 부채꼴 스캔으로 계산)
  const rel = type === 'land' ? nav?.landRel : null;
  const km = type === 'land' ? nav?.landDistKm : null;
  let dirLabel = '전방';
  let dirArrow = '▲';
  if (typeof rel === 'number' && Math.abs(rel) > 5) {
    if (rel < 0) { dirLabel = `좌현 ${Math.abs(rel)}°`; dirArrow = '◀'; }
    else { dirLabel = `우현 ${rel}°`; dirArrow = '▶'; }
  }
  // 거리: 실시간 nav 값 우선, 없으면 proximityAlert.message 폴백
  const distText =
    type === 'land' && km != null ? `${km}km` : proximityAlert.message || '';

  const bannerText =
    type === 'land'
      ? isCritical
        ? `🚨 ${dirArrow} ${dirLabel} 육지 충돌 위험! — ${distText}`
        : `⚠️ ${dirArrow} ${dirLabel} 육지 접근 — ${distText}`
      : isCritical
        ? `🚨 ${typeLabel} 충돌 위험! ${proximityAlert.message || ''}`
        : `⚠️ 전방 ${typeLabel} 접근 — ${proximityAlert.message || ''}`;

  const avoidTypeLabel = avoidance?.type === 'land' ? '육지' : '빙하';
  const avoidIcon = avoidance?.type === 'land' ? '🏔️' : '🧊';

  return (
    <>
      <style>{KEYFRAMES}</style>

      {/* 전체화면 빨간/호박색 비네트 (가장자리에서 안쪽으로 그라데이션) */}
      {(isCritical || isWarning) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 300,
            pointerEvents: 'none',
            background: `radial-gradient(ellipse at center, transparent 55%, ${vignetteColor} 100%)`,
            animation: isCritical
              ? 'dt-prox-flash 0.9s ease-in-out infinite'
              : 'dt-prox-flash-warn 1.8s ease-in-out infinite',
          }}
        />
      )}

      {/* 상단 경고 배너 */}
      {(isCritical || isWarning) && (
        <div
          style={{
            position: 'absolute',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 320,
            pointerEvents: 'none',
            padding: '10px 22px',
            borderRadius: 10,
            fontFamily: 'sans-serif',
            fontWeight: 800,
            fontSize: 16,
            letterSpacing: '0.02em',
            color: '#fff',
            whiteSpace: 'nowrap',
            background: isCritical
              ? 'rgba(185,28,28,0.92)'
              : 'rgba(180,120,10,0.9)',
            border: `1.5px solid ${isCritical ? '#fca5a5' : '#fcd34d'}`,
            animation: isCritical
              ? 'dt-prox-banner 0.9s ease-in-out infinite'
              : 'none',
          }}
        >
          {typeIcon} {bannerText}
        </div>
      )}

      {/* 하단 RL 회피 상태 배너 */}
      {avoidActive && (
        <div
          style={{
            position: 'absolute',
            bottom: 96,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 320,
            pointerEvents: 'none',
            padding: '8px 18px',
            borderRadius: 999,
            fontFamily: 'sans-serif',
            fontWeight: 700,
            fontSize: 13,
            color: '#cffafe',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(8,51,68,0.9)',
            border: '1.5px solid rgba(34,211,238,0.7)',
            boxShadow: '0 0 18px rgba(34,211,238,0.4)',
            animation: 'dt-rl-pulse 1.1s ease-in-out infinite',
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: '#22d3ee',
              boxShadow: '0 0 8px #22d3ee',
            }}
          />
          {avoidIcon} RL 학습모델 {avoidTypeLabel} 회피 경로 계산 중…
        </div>
      )}
    </>
  );
}
