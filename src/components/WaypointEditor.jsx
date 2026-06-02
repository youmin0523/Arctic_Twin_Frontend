/**
 * WaypointEditor.jsx  (단계 C: 인앱 웨이포인트 에디터)
 * ====================================================
 * Cesium 글로브 위에서 활성 항로의 웨이포인트를 직접 편집한다.
 *   - 드래그: 점을 끌어 위치 이동
 *   - 우클릭(점): 해당 웨이포인트 삭제 (잘못 찍은 점 제거)
 *   - 우클릭(바다): 가장 가까운 구간에 새 웨이포인트 삽입
 *   - 구간이 육지를 가로지르면 빨강, 아니면 청록으로 실시간 표시(전역 마스크)
 * 패널 버튼:
 *   - 실행취소: 직전 동작 1단계 되돌리기
 *   - 현재 작업 취소: 편집 시작(편집모드 진입) 시점으로 되돌리기
 *   - 이 항로 원본복원: 저장된 편집을 버리고 기본 항로로
 *   - 전체 편집삭제: 모든 항로의 편집 제거
 * 편집 결과는 onChange 로 부모에 전달(서버 영속 → 전 사용자 공유).
 */
import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { isLandGlobal } from '../services/landMaskGlobal';

const DEG_KM = 111.32;
function segCrossesLand(a, b) {
  const segKm = Math.hypot(
    (b.lat - a.lat) * DEG_KM,
    (b.lon - a.lon) * DEG_KM * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180),
  );
  const n = Math.max(2, Math.ceil(segKm / 5));
  for (let k = 1; k < n; k++) {
    const t = k / n;
    if (isLandGlobal(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t)) return true;
  }
  return false;
}
function distToSegKm(p, a, b) {
  const ax = a.lon, ay = a.lat, bx = b.lon, by = b.lat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-9;
  let t = ((p.lon - ax) * dx + (p.lat - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const projx = ax + t * dx, projy = ay + t * dy;
  return Math.hypot((p.lon - projx) * DEG_KM * Math.cos(p.lat * Math.PI / 180), (p.lat - projy) * DEG_KM);
}
const clone = (arr) => (arr || []).map((w) => ({ ...w }));

export default function WaypointEditor({
  viewer, enabled, waypoints, currentRouteKey, isEdited,
  onChange, onResetRoute, onClearAll,
}) {
  const wpRef = useRef([]);
  const pointEntsRef = useRef([]);
  const segEntsRef = useRef([]);
  const handlerRef = useRef(null);
  const dragIdxRef = useRef(-1);
  const undoRef = useRef([]);       // 스냅샷 스택
  const sessionRef = useRef(null);  // 편집모드 진입 시점 스냅샷
  const [stats, setStats] = useState({ count: 0, crossings: 0, canUndo: false });

  // 활성 항로 동기화
  useEffect(() => {
    wpRef.current = clone(waypoints);
    if (enabled && viewer && !viewer.isDestroyed?.()) redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints, enabled]);

  // 편집모드 on/off 시 핸들러 설치/해제
  useEffect(() => {
    if (!viewer || viewer.isDestroyed?.() || !enabled) { cleanup(); return; }
    sessionRef.current = clone(waypoints);
    undoRef.current = [];
    setup();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, enabled]);

  function clearEntities() {
    if (!viewer) return;
    for (const e of pointEntsRef.current) try { viewer.entities.remove(e); } catch {}
    for (const e of segEntsRef.current) try { viewer.entities.remove(e); } catch {}
    pointEntsRef.current = [];
    segEntsRef.current = [];
  }

  function refreshStats() {
    const w = wpRef.current;
    let c = 0;
    for (let i = 0; i < w.length - 1; i++) if (segCrossesLand(w[i], w[i + 1])) c++;
    setStats({ count: w.length, crossings: c, canUndo: undoRef.current.length > 0 });
  }

  function redraw() {
    if (!viewer || viewer.isDestroyed?.()) return;
    clearEntities();
    const w = wpRef.current;
    for (let i = 0; i < w.length - 1; i++) {
      const cross = segCrossesLand(w[i], w[i + 1]);
      segEntsRef.current.push(viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([w[i].lon, w[i].lat, w[i + 1].lon, w[i + 1].lat]),
          width: 4,
          arcType: Cesium.ArcType.GEODESIC,
          material: cross
            ? Cesium.Color.fromCssColorString('#ef4444')
            : Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.9),
        },
      }));
    }
    w.forEach((wp, idx) => {
      pointEntsRef.current.push(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, 8000),
        point: {
          pixelSize: 12,
          color: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.fromCssColorString('#0ea5e9'),
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        _wpIndex: idx,
      }));
    });
    refreshStats();
  }

  function pickLonLat(position) {
    const cart = viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid);
    if (!cart) return null;
    const c = Cesium.Cartographic.fromCartesian(cart);
    return { lon: Cesium.Math.toDegrees(c.longitude), lat: Cesium.Math.toDegrees(c.latitude) };
  }

  function pushUndo() {
    undoRef.current.push(clone(wpRef.current));
    if (undoRef.current.length > 50) undoRef.current.shift();
  }
  function commit() {
    redraw();
    if (onChange) onChange(clone(wpRef.current));
  }

  function setup() {
    clearEntities();
    redraw();
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handlerRef.current = handler;

    handler.setInputAction((e) => {
      const picked = viewer.scene.pick(e.position);
      if (picked && picked.id && picked.id._wpIndex !== undefined) {
        pushUndo(); // 드래그 전 스냅샷
        dragIdxRef.current = picked.id._wpIndex;
        viewer.scene.screenSpaceCameraController.enableRotate = false;
        viewer.scene.screenSpaceCameraController.enableTranslate = false;
      }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);

    handler.setInputAction((e) => {
      const idx = dragIdxRef.current;
      if (idx < 0) return;
      const ll = pickLonLat(e.endPosition);
      if (!ll) return;
      wpRef.current[idx] = { ...wpRef.current[idx], lon: +ll.lon.toFixed(3), lat: +ll.lat.toFixed(3) };
      redraw();
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction(() => {
      if (dragIdxRef.current >= 0) {
        dragIdxRef.current = -1;
        viewer.scene.screenSpaceCameraController.enableRotate = true;
        viewer.scene.screenSpaceCameraController.enableTranslate = true;
        commit();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_UP);

    // 우클릭: 점이면 삭제, 바다면 가장 가까운 구간에 삽입
    handler.setInputAction((e) => {
      const picked = viewer.scene.pick(e.position);
      if (picked && picked.id && picked.id._wpIndex !== undefined) {
        if (wpRef.current.length > 2) {
          pushUndo();
          wpRef.current.splice(picked.id._wpIndex, 1);
          commit();
        }
        return;
      }
      const ll = pickLonLat(e.position);
      if (!ll) return;
      const w = wpRef.current;
      let bestI = 0, bestD = Infinity;
      for (let i = 0; i < w.length - 1; i++) {
        const d = distToSegKm(ll, w[i], w[i + 1]);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      pushUndo();
      w.splice(bestI + 1, 0, { lon: +ll.lon.toFixed(3), lat: +ll.lat.toFixed(3), label: '편집 추가' });
      commit();
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
  }

  function cleanup() {
    if (handlerRef.current) {
      try { handlerRef.current.destroy(); } catch {}
      handlerRef.current = null;
    }
    if (viewer && !viewer.isDestroyed?.()) {
      try {
        viewer.scene.screenSpaceCameraController.enableRotate = true;
        viewer.scene.screenSpaceCameraController.enableTranslate = true;
      } catch {}
      clearEntities();
    }
    dragIdxRef.current = -1;
  }

  // ── 버튼 동작 ──────────────────────────────────────────────
  function handleUndo() {
    if (!undoRef.current.length) return;
    wpRef.current = undoRef.current.pop();
    commit();
  }
  function handleRevertSession() {
    if (!sessionRef.current) return;
    pushUndo();
    wpRef.current = clone(sessionRef.current);
    commit();
  }
  function handleResetRoute() {
    undoRef.current = [];
    if (onResetRoute) onResetRoute(); // 부모: 저장 편집 삭제 → 기본 항로로 (waypoints prop 갱신 → redraw)
  }
  function handleClearAll() {
    undoRef.current = [];
    if (onClearAll) onClearAll();
  }

  if (!enabled) return null;

  const btn = (label, onClick, danger) => (
    <button
      onClick={onClick}
      style={{
        padding: '5px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700,
        color: danger ? '#fecaca' : '#cffafe',
        background: danger ? 'rgba(80,10,10,0.7)' : 'rgba(8,51,68,0.85)',
        border: `1px solid ${danger ? 'rgba(239,68,68,0.6)' : 'rgba(34,211,238,0.6)'}`,
      }}
    >{label}</button>
  );

  return (
    <div
      style={{
        position: 'absolute', top: 52, right: 12, zIndex: 200, width: 210,
        padding: '10px 12px', borderRadius: 8,
        fontFamily: 'sans-serif', fontSize: 12, lineHeight: 1.6,
        color: '#e2e8f0', background: 'rgba(5,10,25,0.9)',
        border: '1px solid rgba(96,165,250,0.3)',
      }}
    >
      <div style={{ color: '#22d3ee', fontWeight: 700 }}>
        편집 항로: {currentRouteKey}{isEdited ? ' (편집됨)' : ''}
      </div>
      <div>웨이포인트 {stats.count}개</div>
      <div style={{ color: stats.crossings > 0 ? '#ef4444' : '#22c55e' }}>
        육지 교차 {stats.crossings}건
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '8px 0' }}>
        {btn(stats.canUndo ? '↶ 실행취소' : '↶ 실행취소', handleUndo)}
        {btn('현재 작업 취소', handleRevertSession)}
        {btn('이 항로 원본복원', handleResetRoute, true)}
        {btn('전체 편집삭제', handleClearAll, true)}
      </div>
      <div style={{ color: '#94a3b8', fontSize: 10.5 }}>
        드래그=이동 · 우클릭(점)=삭제 · 우클릭(바다)=추가<br />
        항로 전환: 사이드바에서 항로 <b>이름</b> 클릭(체크박스 X)
      </div>
    </div>
  );
}
