import { useRef, useEffect, useState } from 'react';

/**
 * Minimap component - polar-projection minimap showing ship position on the route.
 *
 * Props:
 *   shipPos    - { lat, lon }
 *   progress   - 0..1  (simulation progress fraction)
 *   heading    - radians, ship heading
 *   waypoints  - Array<{ lat, lon, ... }>
 *   onOpenTeleport - callback to open the teleport overlay
 */
export default function Minimap({
  shipPos,
  progress,
  heading,
  waypoints,
  onOpenTeleport,
  departurePort,
  arrivalPort,
  araonPos, // { lat, lon, status }
}) {
  const canvasRef = useRef(null);
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setBlink((b) => !b), 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    drawMinimap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    shipPos?.lat,
    shipPos?.lon,
    progress,
    heading,
    blink,
    waypoints,
    araonPos?.lat,
    araonPos?.lon,
    araonPos?.status,
  ]);

  function drawMinimap() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = 200, H = 200;
    const cx = W / 2, cy = H / 2, R = W / 2 - 10;

    const lat = shipPos?.lat ?? 0;
    const lon = shipPos?.lon ?? 0;
    const wps = waypoints || [];

    // 반구 판정: 웨이포인트(없으면 본선) 평균 위도로 북/남극 투영 선택.
    // 남극 항로(ROSS/PENINSULA)는 남극점(-90°)을 중심으로 한 입체투영으로 그린다.
    const latSamples = wps.length ? wps.map((w) => w.lat) : [lat];
    const meanLat = latSamples.reduce((a, b) => a + b, 0) / latSamples.length;
    const south = meanLat < 0;

    // pole=중심 위도, outer=바깥 경계 위도. r 은 |pole-la|/latRange 로 일관 계산.
    const pole = south ? -90 : 90;
    let outer;
    if (south) {
      const maxWpLat = Math.max(...latSamples);
      outer = Math.min(0, Math.ceil((maxWpLat + 5) / 15) * 15); // 적도 방향 경계(≤0)
    } else {
      const minWpLat = Math.min(...latSamples);
      outer = Math.floor((minWpLat - 5) / 15) * 15;
    }
    const LAT_MIN = south ? pole : outer; // 격자 라벨/범위 계산 호환용
    const LAT_MAX = south ? outer : pole;
    const latRange = Math.max(1, Math.abs(outer - pole));

    // 극좌표 변환: 극점이 중심. 남극은 자오선 방향을 상하 반전해 표시.
    function latLonToMM(la, lo) {
      const r = (Math.abs(pole - la) / latRange) * R;
      const theta = (lo * Math.PI) / 180;
      const x = cx + r * Math.sin(theta);
      const y = south ? cy + r * Math.cos(theta) : cy - r * Math.cos(theta);
      return { x, y };
    }

    // background
    ctx.fillStyle = '#050d18';
    ctx.fillRect(0, 0, W, H);

    // 위도권 그리드 (범위에 따라 15° or 30° 간격)
    const step = latRange <= 75 ? 15 : 30;
    const gridStart = Math.ceil(LAT_MIN / step) * step;
    for (let la = gridStart; la < LAT_MAX; la += step) {
      const r = (Math.abs(pole - la) / latRange) * R;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      // \uadf9\uc804\uc120(\u00b160\u00b0)\u00b7\uc801\ub3c4(0\u00b0) \uac15\uc870
      const isFront = la === 60 || la === -60 || la === 0;
      ctx.strokeStyle = isFront ? '#1a3060' : '#0d1f40';
      ctx.lineWidth = isFront ? 1 : 0.5;
      ctx.stroke();
      ctx.fillStyle = '#1e3a8a';
      ctx.font = '7px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText(la + '\u00b0', cx + 2, cy - r + 8);
    }

    // 경선 (60° 간격) — 남극은 자오선 상하 반전(latLonToMM 과 동일 규칙)
    [-120, -60, 0, 60, 120, 180].forEach((lo) => {
      const theta = (lo * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + R * Math.sin(theta),
        south ? cy + R * Math.cos(theta) : cy - R * Math.cos(theta),
      );
      ctx.strokeStyle = '#0d1f40';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    // 외곽 원
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 극점 라벨 (북극 N / 남극 S)
    ctx.fillStyle = '#334466';
    ctx.font = '8px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(south ? 'S' : 'N', cx, cy + 3);

    // 경로선 (전체 웨이포인트, 클리핑 없음)
    ctx.beginPath();
    let first = true;
    wps.forEach((wp) => {
      const p = latLonToMM(wp.lat, wp.lon);
      if (first) { ctx.moveTo(p.x, p.y); first = false; }
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 출발항 점
    const depLat = departurePort?.lat ?? 35.1;
    const depLon = departurePort?.lon ?? 129.0;
    const depP = latLonToMM(depLat, depLon);
    ctx.beginPath();
    ctx.arc(depP.x, depP.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.fill();

    // 도착항 점
    const arrLat = arrivalPort?.lat ?? 51.9;
    const arrLon = arrivalPort?.lon ?? 4.5;
    const arrP = latLonToMM(arrLat, arrLon);
    ctx.beginPath();
    ctx.arc(arrP.x, arrP.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#60a5fa';
    ctx.fill();

    // 현재 위치 (본선)
    const p = latLonToMM(lat, lon);
    const inCircle = Math.hypot(p.x - cx, p.y - cy) <= R;
    if (inCircle) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(239,68,68,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = blink ? '#ef4444' : '#ff8080';
      ctx.fill();
      const hd = heading ?? 0;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      // 남극 투영은 자오선이 상하 반전이라 방위 벡터의 종축도 반전
      ctx.lineTo(p.x + Math.sin(hd) * 11, p.y + (south ? 1 : -1) * Math.cos(hd) * 11);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#1e3a8a';
      ctx.font = '8px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('\u25bc ' + Math.abs(lat).toFixed(1) + '\u00b0' + (lat < 0 ? 'S' : 'N'), cx, H - 6);
    }

    // 🚢 아라온 마커 — 평소 노랑, 호위 중엔 주황
    if (
      araonPos &&
      typeof araonPos.lat === 'number' &&
      typeof araonPos.lon === 'number'
    ) {
      const ap = latLonToMM(araonPos.lat, araonPos.lon);
      const inCircleA = Math.hypot(ap.x - cx, ap.y - cy) <= R;
      if (inCircleA) {
        const isEscorting = araonPos.status === 'escorting';
        const mainColor = isEscorting ? '#fb923c' : '#facc15'; // 주황 vs 노랑
        const ringColor = isEscorting
          ? 'rgba(251,146,60,0.4)'
          : 'rgba(250,204,21,0.4)';
        // 외곽 링
        ctx.beginPath();
        ctx.arc(ap.x, ap.y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 1;
        ctx.stroke();
        // 본체 점
        ctx.beginPath();
        ctx.arc(ap.x, ap.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = mainColor;
        ctx.fill();
      }
    }

    ctx.textAlign = 'left';
  }

  const lat = shipPos?.lat ?? 0;
  const lon = shipPos?.lon ?? 0;
  const pct = ((progress ?? 0) * 100).toFixed(1);

  return (
    <div
      className="hud"
      id="minimap-wrap"
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: 0,
      }}
    >
      <div className="hud-title">📍 현재 위치</div>
      <canvas
        ref={canvasRef}
        id="minimap"
        width={200}
        height={200}
        style={{
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 8,
          display: 'block',
          background: 'rgba(0,0,0,0.2)',
          width: '100%',
          height: 'auto',
          maxWidth: '100%',
        }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 10,
          fontSize: 11,
          color: '#94a3b8',
          fontFamily: 'tabular-nums',
        }}
      >
        <span id="mm-lat">{Math.abs(lat).toFixed(4)}°{lat < 0 ? 'S' : 'N'}</span>
        <span id="mm-lon">{Math.abs(lon).toFixed(4)}°{lon < 0 ? 'W' : 'E'}</span>
        <span id="mm-pct" style={{ color: '#34d399', fontWeight: 'bold' }}>
          {pct}%
        </span>
      </div>
      <button
        onClick={onOpenTeleport}
        style={{
          width: '100%',
          marginTop: 12,
          padding: '8px 0',
          borderRadius: 8,
          border: '1px solid rgba(96, 165, 250, 0.3)',
          background: 'rgba(30,58,138,.3)',
          color: '#60a5fa',
          fontFamily: 'inherit',
          fontSize: 11,
          cursor: 'pointer',
          transition: 'all 0.2s',
          fontWeight: '600',
        }}
        onMouseEnter={(e) => (e.target.style.background = 'rgba(30,58,138,.5)')}
        onMouseLeave={(e) => (e.target.style.background = 'rgba(30,58,138,.3)')}
      >
        🛰 위치 이동
      </button>
    </div>
  );
}