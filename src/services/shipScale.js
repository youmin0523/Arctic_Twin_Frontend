// ═══════════════════════════════════════════════════════════════
// shipScale.js — 선박 빌보드 표시 스케일 (공용)
// ───────────────────────────────────────────────────────────────
// 본선 / 아라온 / 쇄빙선 아이콘을 모두 동일 기준으로 그려
//   (1) 화면상 상대 크기가 실제 선박 전장(LOA) 비율과 일치하고,
//   (2) 줌 아웃(원거리) 시 지형 대비 과도하게 커 보이지 않도록
// 한 곳에서 관리한다. 수치 조정은 이 파일만 고치면 된다.
// ═══════════════════════════════════════════════════════════════
import * as Cesium from 'cesium';

// ── 조절 노브 (이 두 값만 바꾸면 전체가 따라감) ───────────────────
// [크기] 기준 전장(REF_LOA)에서의 세로 픽셀. 전반적으로 더 크게/작게.
const REF_LOA = 225; // bulk 기준
const REF_HEIGHT = 108; // 기준선 세로 px ← 전체 크기 노브
// [줌아웃] 원거리 클램프 배율. 낮출수록 줌아웃 시 더 작아짐.
const FAR_SCALE = 0.4;

// 아이콘은 1:2(가로:세로) 실루엣 — 세로(height)가 전장 방향.
const MIN_HEIGHT = 54; // 줌아웃·소형선에서도 사라지지 않을 하한
const MAX_HEIGHT = 170; // 초대형선 상한

// 타입/식별자별 기본 전장(실제 LOA, m) — length 미지정 시 폴백.
// 출처: vesselPresets.js (bulk/lng/container), 아라온 제원(LOA 110m, 폭 19m).
export const DEFAULT_LOA = {
  bulk: 225,
  lng: 295,
  container: 240,
  icebreaker: 110, // 아라온급
  araon: 110,
};

// 실제 전장(m) → 빌보드 픽셀 크기. loaMeters 가 없으면 type 폴백 사용.
// 실제 비율을 따르되 √(제곱근) 압축 → 소형선(아라온)이 과도하게 작아져
// 안 보이는 것을 막으면서도 "큰 배가 더 크다"는 상대감은 유지.
export function shipBillboardSize(loaMeters, fallbackType = 'bulk') {
  const loa =
    Number.isFinite(loaMeters) && loaMeters > 0
      ? loaMeters
      : DEFAULT_LOA[fallbackType] || DEFAULT_LOA.bulk;
  const raw = REF_HEIGHT * Math.sqrt(loa / REF_LOA);
  const height = Math.round(Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, raw)));
  return { width: Math.round(height / 2), height };
}

// 거리 기반 스케일: 줌 아웃(원거리)일수록 작게.
// near 5km 에서 1.4배 → far 1000km 이상에서 FAR_SCALE 로 클램프.
export function shipScaleByDistance() {
  return new Cesium.NearFarScalar(5000, 1.4, 1.0e6, FAR_SCALE);
}
