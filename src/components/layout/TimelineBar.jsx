import React, { useRef } from 'react';
import './TimelineBar.css';

const ROUTE_LABELS = {
  NSR: '북극항로',
  NWP: '북서항로',
  TSR: '횡단항로',
  SUEZ: '수에즈',
  CAPE: '희망봉',
};

const ROUTE_DAYS = {
  NSR: 14,
  NWP: 16,
  TSR: 13,
  SUEZ: 22,
  CAPE: 30,
};

// //* [Modified Code] 기존 opacity:0 네이티브 <input range>(썸 inset 매핑)와
//   별도 시각 커서(simProgress 전체폭 %)가 어긋나 "끈 만큼 안 따라오는" 문제가
//   있었다 → 트랙에 직접 포인터 드래그(정확히 커서 = 포인터 위치, 1:1)로 교체.
export default function TimelineBar({
  simProgress,
  timelineDay,
  onTimelineChange,
  currentRouteKey,
  departureName,
  arrivalName,
  totalDays: propTotalDays,
}) {
  const totalDays = propTotalDays || ROUTE_DAYS[currentRouteKey] || 14;
  const routeLabel = ROUTE_LABELS[currentRouteKey] || '기타항로';
  const pct = Math.min(100, Math.max(0, (simProgress || 0) * 100));
  const depName = departureName || '부산';
  const arrName = arrivalName || '로테르담';

  const trackRef = useRef(null);
  const draggingRef = useRef(false);

  const updateFromClientX = (clientX) => {
    const el = trackRef.current;
    if (!el || typeof onTimelineChange !== 'function') return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onTimelineChange(ratio * totalDays);
  };

  const handleDown = (e) => {
    draggingRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
    updateFromClientX(e.clientX);
  };
  const handleMove = (e) => {
    if (draggingRef.current) updateFromClientX(e.clientX);
  };
  const handleUp = (e) => {
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
  };

  return (
    <div className="timeline-bar">
      <span className="timeline-bar__port">{depName}</span>
      <div
        className="timeline-bar__track"
        ref={trackRef}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
      >
        <div className="timeline-bar__rail" />
        <div className="timeline-bar__fill" style={{ width: pct + '%' }} />
        <div className="timeline-bar__cursor" style={{ left: pct + '%' }} />
      </div>
      <span className="timeline-bar__port">{arrName}</span>
      <span className="timeline-bar__day">
        Day {Math.floor(timelineDay)} / {totalDays}
      </span>
      <span className="timeline-bar__summary">
        {depName} → {routeLabel} → {arrName} | {totalDays}일 운항
      </span>
    </div>
  );
}
