// ═══════════════════════════════════════════════════════════════
// shipScale.js — 선박 빌보드 표시 스케일 (공용)
// ───────────────────────────────────────────────────────────────
// 본선 / 아라온 / 쇄빙선 아이콘을 모두 동일 기준으로 그려
//   (1) 화면상 상대 크기가 실제 선박 전장(LOA) 비율과 일치하고,
//   (2) 줌 아웃(원거리) 시 지형 대비 과도하게 커 보이지 않도록
// 한 곳에서 관리한다. 수치 조정은 이 파일만 고치면 된다.
// ═══════════════════════════════════════════════════════════════
import * as Cesium from 'cesium';

// 아이콘은 1:2(가로:세로) 실루엣 — 세로(height)가 전장 방향.
// 전장 1 m 당 세로 픽셀. (기존 본선 225m≈108px=0.48 대비 톤다운)
const PX_PER_METER = 0.40;
const MIN_HEIGHT = 36; // 근접 줌에서도 식별 가능한 하한
const MAX_HEIGHT = 150; // 초대형선이 과하게 커지지 않도록 상한

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
export function shipBillboardSize(loaMeters, fallbackType = 'bulk') {
  const loa =
    Number.isFinite(loaMeters) && loaMeters > 0
      ? loaMeters
      : DEFAULT_LOA[fallbackType] || DEFAULT_LOA.bulk;
  const height = Math.round(
    Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, loa * PX_PER_METER)),
  );
  return { width: Math.round(height / 2), height };
}

// 거리 기반 스케일: 줌 아웃(원거리)일수록 작게.
// near 5km 에서 1.3배 → far 1500km 이상에서 0.22배로 클램프.
// (기존 5000→1.8, 500000→0.6 대비 원거리 축소를 강화해
//  광역 뷰에서 선박이 지형을 뒤덮는 현상을 줄임.)
export function shipScaleByDistance() {
  return new Cesium.NearFarScalar(5000, 1.3, 1.5e6, 0.22);
}
