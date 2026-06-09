/**
 * AraonLiveMarker.jsx
 * ===================
 * Live Simulation 모드에서 항로별 호위 쇄빙선을 표시.
 * - 본선이 결빙 수역(SIC>0.3)에 있을 때: 본선 바로 앞에 호위 위치로 따라붙음
 * - 그렇지 않을 때: 자산 모항(Wrangel / Resolute Bay / Longyearbyen)에 대기
 *
 * 항로별 자산(asset.visual)에 따라 2D 마커 아이콘을 특성에 맞게 다르게 그린다:
 *   · 아라온(KOPRI)   — 빨간 선체 + 흰 상부 + 주황 A-프레임 크레인 + 헬리데크
 *   · CCGS(캐나다)    — 빨간 선체 + 흰 전방 사선 스트라이프 + 흰 상부
 *   · 원자력(Rosatom) — 검은 선체 + 노란 상부 + 원자로 격납 블록
 *
 * Voyage Playback 모드의 entity (id='voyage-ib-*') 와 충돌 방지를 위해
 * 별도 id 'live-ib-<assetId>' 사용(자산별 — 북극 함대 3척 동시 표시 대비).
 */

import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { shipBillboardSize, shipScaleByDistance } from '../../services/shipScale';

// 기본(아라온) 사전배치 좌표 — asset.home 미지정 시 폴백.
// ESCORT_ASSETS.NSR.home(연안 71.7)과 일치 — 레거시 71.0 과 섞이면 2척 중복.
const ARAON_HOME = { lat: 71.7, lon: 179.5 };

// 기본 시각 특성 (asset.visual 미지정 시 = 아라온)
const DEFAULT_VISUAL = {
  hull: 0xc0392b, deck: 0x6b1e17, sup: 0xecf0f1, window: 0x1a365d,
  accent: 0xe67e22, gray: 0x4a5568, funnelBand: 0xc0392b,
  helideck: true, crane: true, stripe: null, reactor: false,
};

const hexCss = (v) => `#${(v >>> 0).toString(16).padStart(6, '0').slice(-6)}`;

// 자산 특성(visual)에 맞춰 미니 쇄빙선 아이콘(top-down, 선수=위)을 그린다.
// VoyagePlaybackLayer 도 동일 아이콘을 재사용하도록 export.
export function makeIcebreakerCanvas(visual) {
  const V = visual || DEFAULT_VISUAL;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 96;
  const ctx = c.getContext('2d');

  // ── 선체 (flared icebreaker, 선수 위쪽) ──
  ctx.fillStyle = hexCss(V.hull);
  ctx.beginPath();
  ctx.moveTo(32, 4);
  ctx.lineTo(48, 16);
  ctx.lineTo(50, 78);
  ctx.lineTo(46, 90);
  ctx.lineTo(18, 90);
  ctx.lineTo(14, 78);
  ctx.lineTo(16, 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ── 캐나다 해안경비대 전방 사선 흰 스트라이프 (선체 위 클리핑) ──
  if (V.stripe) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(32, 4);
    ctx.lineTo(48, 16);
    ctx.lineTo(50, 78);
    ctx.lineTo(46, 90);
    ctx.lineTo(18, 90);
    ctx.lineTo(14, 78);
    ctx.lineTo(16, 16);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = hexCss(V.stripe);
    ctx.beginPath();
    ctx.moveTo(10, 30);
    ctx.lineTo(54, 46);
    ctx.lineTo(54, 58);
    ctx.lineTo(10, 42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ── 쇄빙 뱃머리 흰 보강선 (chevron) ──
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(20, 22);
  ctx.lineTo(32, 10);
  ctx.lineTo(44, 22);
  ctx.stroke();

  // ── 전방 헬리데크 (H) ──
  if (V.helideck) {
    ctx.fillStyle = hexCss(V.sup);
    ctx.beginPath();
    ctx.ellipse(32, 30, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H', 32, 31);
  }

  // ── 상부구조(브리지 블록) ──
  ctx.fillStyle = hexCss(V.sup);
  ctx.fillRect(20, 42, 24, 26);
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 42, 24, 26);
  // 브리지 창 (선수쪽)
  ctx.fillStyle = hexCss(V.window);
  ctx.fillRect(22, 45, 20, 3);

  if (V.reactor) {
    // ── 원자력 쇄빙선: 원자로 격납 돔 + 경고 마크 ──
    ctx.fillStyle = hexCss(V.gray);
    ctx.beginPath();
    ctx.arc(32, 58, 7, Math.PI, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = hexCss(V.accent);
    ctx.beginPath(); // 방사능 경고 점
    ctx.arc(32, 56, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // ── 측면 디테일(라이프보트/장비) ──
    ctx.fillStyle = hexCss(V.accent);
    ctx.fillRect(22, 52, 8, 4);
    ctx.fillRect(34, 52, 8, 4);
  }

  // ── 펀넬(연돌) + 상단 띠 ──
  ctx.fillStyle = hexCss(V.sup);
  ctx.fillRect(28, 60, 8, 8);
  ctx.strokeStyle = '#2c3e50';
  ctx.strokeRect(28, 60, 8, 8);
  ctx.fillStyle = hexCss(V.funnelBand);
  ctx.fillRect(28, 60, 8, 2);

  // ── 후방 A-프레임 크레인 (아라온 트레이드마크) ──
  if (V.crane) {
    ctx.fillStyle = hexCss(V.accent);
    ctx.fillRect(22, 74, 3, 12);
    ctx.fillRect(39, 74, 3, 12);
    ctx.fillRect(22, 74, 20, 3);
  } else {
    // 후방 오픈 갑판
    ctx.fillStyle = hexCss(V.deck);
    ctx.fillRect(24, 74, 16, 10);
  }

  return c;
}

// 상태별 라벨 색 (아이콘 색은 자산 고유색 유지 — 상태는 라벨/패널로 표현)
const STATUS_LABEL_COLOR = {
  idle: '#22d3ee',
  escorting: '#ef4444',
};

export default function AraonLiveMarker({ cesiumRef, visible, displayPos, asset }) {
  const entityRef = useRef(null);
  const canvasRef = useRef(null);

  const visual = asset?.visual || DEFAULT_VISUAL;
  const assetName = asset?.name || '아라온';
  const assetId = asset?.id || 'araon';
  const home = asset?.home || ARAON_HOME;

  // 마커 표시 조건: visible prop + displayPos 존재 (북극 항로 + live 모드)
  const shouldShow = visible && !!displayPos;

  useEffect(() => {
    if (!shouldShow) {
      if (entityRef.current) {
        try {
          const v =
            cesiumRef && cesiumRef.current && cesiumRef.current.getViewer
              ? cesiumRef.current.getViewer()
              : null;
          if (v) v.entities.remove(entityRef.current);
        } catch (e) {
          // ignore
        }
        entityRef.current = null;
      }
      return undefined;
    }

    const tryCreate = () => {
      const viewer =
        cesiumRef && cesiumRef.current && cesiumRef.current.getViewer
          ? cesiumRef.current.getViewer()
          : null;
      if (!viewer) return false;
      if (entityRef.current) return true;

      // 자산별 특성 캔버스 생성
      canvasRef.current = makeIcebreakerCanvas(visual);

      const initLat = displayPos?.lat ?? home.lat;
      const initLon = displayPos?.lon ?? home.lon;
      const initStatus = displayPos?.status || 'idle';
      const initRot = -Cesium.Math.toRadians(displayPos?.heading || 0);

      entityRef.current = viewer.entities.add({
        id: `live-ib-${assetId}`,
        position: Cesium.Cartesian3.fromDegrees(initLon, initLat, 2000), // //* 반대 반구 비침 방지 부양
        billboard: {
          image: canvasRef.current,
          ...shipBillboardSize(undefined, 'araon'),
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
          rotation: initRot,
          // 자산 고유 색을 그대로 보이도록 틴트 없음(흰색). 상태는 라벨 색으로 표현.
          color: Cesium.Color.WHITE,
          disableDepthTestDistance: 50000,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          scaleByDistance: shipScaleByDistance(),
        },
        label: {
          text:
            initStatus === 'escorting' ? `${assetName} ▶호위` : assetName,
          font: 'bold 12px sans-serif',
          fillColor: Cesium.Color.fromCssColorString(
            STATUS_LABEL_COLOR[initStatus] || '#22d3ee',
          ),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          pixelOffset: new Cesium.Cartesian2(0, 28),
          scaleByDistance: new Cesium.NearFarScalar(1.0e5, 1.0, 8.0e6, 0.4),
        },
      });
      return true;
    };

    if (!tryCreate()) {
      const t = setTimeout(tryCreate, 200);
      return () => clearTimeout(t);
    }

    return () => {
      if (entityRef.current) {
        try {
          const v =
            cesiumRef && cesiumRef.current && cesiumRef.current.getViewer
              ? cesiumRef.current.getViewer()
              : null;
          if (v) v.entities.remove(entityRef.current);
        } catch (e) {
          // ignore
        }
        entityRef.current = null;
      }
    };
    // assetId 변경 시 entity 재생성(자산별 아이콘 교체)
  }, [cesiumRef, shouldShow, assetId]);

  // 본선 위치/상태/방향 변경 시 entity 갱신 (호위 모드 시 본선에 따라붙음)
  useEffect(() => {
    if (!shouldShow || !entityRef.current) return;
    const lat = displayPos?.lat ?? home.lat;
    const lon = displayPos?.lon ?? home.lon;
    const status = displayPos?.status || 'idle';
    const heading = displayPos?.heading || 0;
    try {
      entityRef.current.position = Cesium.Cartesian3.fromDegrees(lon, lat, 2000); // //* 생성 시와 동일 고도
      entityRef.current.billboard.rotation = -Cesium.Math.toRadians(heading);
      entityRef.current.label.text =
        status === 'escorting' ? `${assetName} ▶호위` : assetName;
      entityRef.current.label.fillColor = Cesium.Color.fromCssColorString(
        STATUS_LABEL_COLOR[status] || '#22d3ee',
      );
    } catch (e) {
      // ignore
    }
  }, [
    shouldShow,
    assetName,
    displayPos?.lat,
    displayPos?.lon,
    displayPos?.status,
    displayPos?.heading,
  ]);

  return null;
}
