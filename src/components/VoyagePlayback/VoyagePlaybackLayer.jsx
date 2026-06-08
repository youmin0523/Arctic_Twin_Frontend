/**
 * VoyagePlaybackLayer.jsx
 * =======================
 * Cesium viewer 에 본선 1척 + 항로별 호위 쇄빙선(현재 trace 당 1척) entity 를 생성·갱신하는
 * headless 컴포넌트. DOM 출력 없음, 사이드 이펙트만.
 *
 * 부모는 `cesiumRef` (CesiumGlobe ref) 와 playback state 를 props 로 주입.
 */

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import {
  sampleShipAt,
  sampleIcebreakersAt,
  ICEBREAKER_META,
} from '../../services/voyageTrace';
import { shipBillboardSize, shipScaleByDistance } from '../../services/shipScale';
import { makeIcebreakerCanvas } from './AraonLiveMarker';
import { ESCORT_ASSET_BY_IB_ID } from '../../hooks/useAraonControl';

// RIO 색상 스케일 (본선 tint)
function rioColor(rio) {
  if (rio >= 0) return Cesium.Color.fromCssColorString('#4ade80');
  if (rio >= -3) return Cesium.Color.fromCssColorString('#facc15');
  if (rio >= -6) return Cesium.Color.fromCssColorString('#fb923c');
  return Cesium.Color.fromCssColorString('#ef4444');
}

// 쇄빙선 상태 색상
const IB_STATUS_COLOR = {
  idle: '#9ca3af',
  dispatched: '#facc15',
  rendezvous: '#fb923c',
  escorting: '#ef4444',
  released: '#3b82f6',
};

function ibStatusColor(status) {
  return Cesium.Color.fromCssColorString(
    IB_STATUS_COLOR[status] || '#9ca3af',
  );
}

// 두 좌표 사이의 bearing(0=북, 90=동) 계산 — billboard 회전용
function bearingDeg(lat1, lon1, lat2, lon2) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

// 쇄빙선 아이콘은 AraonLiveMarker.makeIcebreakerCanvas(visual) 재사용 —
// 항로별 자산 시각특성(아라온/CCGS/원자력)을 동일 규칙으로 그린다.
// (본선 캔버스 함수 삭제 — 기존 CesiumGlobe.updateShipEntity 재사용)

export default function VoyagePlaybackLayer({
  cesiumRef,
  trace,
  tHours,
  active,
  currentModeRef,
  userCameraInteractingRef,
  dispatch,
}) {
  const ibEntitiesRef = useRef({}); // id → entity
  const lastTickLogRef = useRef(0);
  const ibCanvasRef = useRef(null);
  const lastIbPosRef = useRef({});  // id → {lat, lon} (직전 tick 위치 — heading 계산용)
  const lastShipPosRef = useRef(null); // 본선 직전 위치 (heading 계산용)
  const lastShipHdgRef = useRef(0);    // 본선 직전 heading (정지 시 유지용)

  // entity 생성 (trace 로드 시점)
  useEffect(() => {
    if (!active || !trace) return undefined;
    const viewer =
      cesiumRef && cesiumRef.current && cesiumRef.current.getViewer
        ? cesiumRef.current.getViewer()
        : null;
    if (!viewer) {
      // viewer 아직 준비 안 됨 — 다음 업데이트에서 재시도
      return undefined;
    }

    // 항로별 쇄빙선 아이콘 캐시 (id → canvas). NSR=아라온/NWP=CCGS/TSR=원자력.
    ibCanvasRef.current = {};

    // 본선은 별도 entity 안 만듦 — 기존 CesiumGlobe 의 updateShipEntity 가
    // 그린 본선 (ship-vessel) 을 재활용해서 voyage tHours 위치로 옮긴다.
    const firstTick = trace.ticks[0];
    if (cesiumRef.current && cesiumRef.current.updateShipEntity) {
      cesiumRef.current.updateShipEntity(
        firstTick.ship.position,
        0,
        { type: 'icebreaker' },
      );
    }

    // 쇄빙선 (항로별 호위 자산 1척)
    for (const ib of firstTick.icebreakers) {
      const meta = ICEBREAKER_META[ib.id] || { name_ko: ib.id };
      // 항로별 자산 시각특성으로 아이콘 생성 (id 캐시). 미매핑 id 는 기본(아라온).
      const asset = ESCORT_ASSET_BY_IB_ID[ib.id];
      if (!ibCanvasRef.current[ib.id]) {
        ibCanvasRef.current[ib.id] = makeIcebreakerCanvas(asset?.visual);
      }
      const e = viewer.entities.add({
        id: `voyage-${ib.id}`,
        position: Cesium.Cartesian3.fromDegrees(
          ib.position.lon,
          ib.position.lat,
          2000, // //* 반대 반구 비침 방지를 위해 해수면 위로 부양
        ),
        billboard: {
          image: ibCanvasRef.current[ib.id],
          // //* [Modified Code] 아라온 실제 LOA 110m 비례 (shipScale.js).
          //   종전 80x160(본선보다 크게)은 실제 비율과 반대였고 줌 아웃 시 과대.
          ...shipBillboardSize(undefined, 'icebreaker'),
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
          rotation: 0,   // 첫 프레임은 heading 미정 — 다음 tick 부터 갱신
          color: ibStatusColor(ib.status),
          // //* 반대 반구 쇄빙선이 비치지 않도록 유한 깊이거리 (근접 줌만 비활성)
          disableDepthTestDistance: 50000,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          scaleByDistance: shipScaleByDistance(),
        },
        label: {
          text: meta.name_ko,
          font: 'bold 13px sans-serif',
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          pixelOffset: new Cesium.Cartesian2(0, 28),
          fillColor: Cesium.Color.fromCssColorString('#22d3ee'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString('#000000cc'),
          disableDepthTestDistance: 50000,
        },
      });
      ibEntitiesRef.current[ib.id] = e;
    }

    // eslint-disable-next-line no-console
    console.log(
      `[VoyagePlayback] entities created: 1 ship + ${
        firstTick.icebreakers.length
      } icebreakers`,
    );
    // eslint-disable-next-line no-console
    console.log(
      `[VoyagePlayback] viewer.entities.values.length = ${viewer.entities.values.length}`,
    );

    // Wrangel Island + 베링해/척치해/동시베리아해 줌인 (액션 구역 집중)
    try {
      const araonInit = firstTick.icebreakers[0];
      // eslint-disable-next-line no-console
      console.log(
        `[VoyagePlayback] Araon initial position: lat=${araonInit.position.lat}, lon=${araonInit.position.lon} status=${araonInit.status}`,
      );
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(175.0, 72.0, 6000000),
        orientation: {
          heading: 0,
          pitch: -Cesium.Math.PI_OVER_TWO,
          roll: 0,
        },
        duration: 2.0,
      });
    } catch (e) {
      // 무시
    }

    return () => {
      // cleanup on unmount / trace swap — 아라온만 제거 (본선은 기존 entity 라
      // CesiumGlobe 가 관리)
      try {
        for (const id of Object.keys(ibEntitiesRef.current)) {
          viewer.entities.remove(ibEntitiesRef.current[id]);
        }
        ibEntitiesRef.current = {};
      } catch (e) {
        // viewer 이미 파괴됐을 수 있음 — 무시
      }
    };
  }, [cesiumRef, trace, active]);

  // 매 tHours 변경마다 position/color 갱신
  useEffect(() => {
    if (!active || !trace) return;
    const viewer =
      cesiumRef && cesiumRef.current && cesiumRef.current.getViewer
        ? cesiumRef.current.getViewer()
        : null;
    if (!viewer) return;

    const ship = sampleShipAt(trace, tHours);
    if (ship && cesiumRef.current && cesiumRef.current.updateShipEntity) {
      // 본선 heading 계산 (직전 위치 → 현재 위치). 정지(같은 위치)/seek 시엔
      // 직전 heading 유지 — 0(정북)으로 튀어 뱃머리가 홱 도는 것 방지.
      let shipHdg = lastShipHdgRef.current;
      const lastShip = lastShipPosRef.current;
      if (
        lastShip &&
        (lastShip.lat !== ship.position.lat || lastShip.lon !== ship.position.lon)
      ) {
        shipHdg = bearingDeg(
          lastShip.lat,
          lastShip.lon,
          ship.position.lat,
          ship.position.lon,
        );
      }
      lastShipPosRef.current = { lat: ship.position.lat, lon: ship.position.lon };
      lastShipHdgRef.current = shipHdg;
      cesiumRef.current.updateShipEntity(
        ship.position,
        shipHdg,
        { type: 'icebreaker' },
      );

      // shipState 동기화 — Voyage 는 Live 시뮬 루프가 돌지 않아 state.shipState 가
      // 갱신되지 않는다. 모드 전환 flyTo([App] handleModeChange), FollowMiniMap,
      // 컴퍼스가 모두 이 값을 쓰므로 매 tick 본선 위치/heading 을 반영한다.
      if (dispatch) {
        dispatch({
          type: 'SET_SHIP_STATE',
          payload: {
            lat: ship.position.lat,
            lon: ship.position.lon,
            heading: shipHdg,
          },
        });
      }

      // ── Cesium 카메라 추적 (SATELLITE/WIDE 모드 전용) ──
      // Live 모드는 시뮬 루프(App.jsx)가 카메라를 따라가게 하지만, Voyage 는
      // 그 루프가 돌지 않으므로 여기서 동일 로직을 수행한다. 사용자가 직접
      // 카메라를 조작 중이면 양보. FOLLOW 는 Three.js 선미추적이 별도 담당.
      const curMode = currentModeRef?.current;
      const interacting = userCameraInteractingRef?.current;
      if (!interacting && (curMode === 'SATELLITE' || curMode === 'WIDE')) {
        try {
          const camPos = viewer.camera.positionCartographic;
          const currentAlt = camPos
            ? camPos.height
            : curMode === 'WIDE'
              ? 3000000
              : 120000;
          const target = Cesium.Cartesian3.fromDegrees(
            ship.position.lon,
            ship.position.lat,
          );
          const pitch = viewer.camera.pitch;
          const range = currentAlt / Math.sin(Math.abs(pitch));
          viewer.camera.lookAt(
            target,
            new Cesium.HeadingPitchRange(viewer.camera.heading, pitch, range),
          );
          viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
        } catch (e) {
          /* viewer 파괴 등 — 무시 */
        }
      }
    }

    const ibs = sampleIcebreakersAt(trace, tHours);
    for (const ib of ibs) {
      const e = ibEntitiesRef.current[ib.id];
      if (!e) continue;
      e.position = Cesium.Cartesian3.fromDegrees(
        ib.position.lon,
        ib.position.lat,
        2000, // //* 반대 반구 비침 방지 — 생성 시와 동일 고도 유지
      );
      e.billboard.color = ibStatusColor(ib.status);
      // heading: 직전 위치와의 bearing — 정지 시(같은 위치) 이전 rotation 유지
      const lastPos = lastIbPosRef.current[ib.id];
      if (
        lastPos &&
        (lastPos.lat !== ib.position.lat || lastPos.lon !== ib.position.lon)
      ) {
        const hdg = bearingDeg(
          lastPos.lat,
          lastPos.lon,
          ib.position.lat,
          ib.position.lon,
        );
        e.billboard.rotation = -Cesium.Math.toRadians(hdg);
      }
      lastIbPosRef.current[ib.id] = { lat: ib.position.lat, lon: ib.position.lon };
    }

    // 5 시뮬 시간당 샘플 로그
    const bucket = Math.floor(tHours / 5);
    if (bucket !== lastTickLogRef.current && ship && ibs.length > 0) {
      lastTickLogRef.current = bucket;
      const araon = ibs[0];
      if (araon) {
        // eslint-disable-next-line no-console
        console.log(
          `[Tick] t=${tHours.toFixed(0)}h, ship=(${ship.position.lat.toFixed(2)}N, ${ship.position.lon.toFixed(2)}E), IB ${araon.id}=(${araon.position.lat.toFixed(2)}N, ${araon.position.lon.toFixed(2)}E) ${araon.status}`,
        );
      }
    }
  }, [cesiumRef, trace, tHours, active]);

  return null;
}
