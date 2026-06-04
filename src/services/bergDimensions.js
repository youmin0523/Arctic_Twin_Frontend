// ============================================================
// 빙산 치수·두께 추정 (Iceberg dimension & thickness estimation)
//
// 들어오는 빙산 데이터에는 수평 치수(length_m, width_m)와 크기등급(type)만
// 있고 두께/흘수/수면위 높이는 없다. 따라서 두께류는 다음으로 "추정"한다:
//   1) 흘수(draft): 공개 경험식 — El-Tahan 등(1983)의 빙산 흘수-수선장 회귀
//        draft(m) ≈ 2.91 × L^0.71   (L = 수선장 length_m)
//   2) 전체 두께·수면위 높이: 자유부유 빙체의 부력 평형(밀도비)에서 유도
//        수면 아래 비율 = ρ_ice / ρ_seawater ≈ 0.895
//        thickness = draft / 0.895,  freeboard = thickness − draft
//
// ⚠️ 실측이 아닌 추정값 — UI 표기에는 반드시 "(추정)" 을 병기한다.
// ============================================================

const RHO_ICE = 917;          // kg/m³  빙하(담수빙) 밀도
const RHO_SEAWATER = 1025;    // kg/m³  해수 밀도
const SUBMERGED_RATIO = RHO_ICE / RHO_SEAWATER; // ≈ 0.895 (수면 아래 잠긴 비율)

/**
 * 실측 수평 치수로부터 흘수·두께·수면위 높이를 추정.
 * @param {{length_m?:number,width_m?:number,type?:string}} berg
 * @returns {{lengthM:number,widthM:number,type:string,
 *            draftM:number,thicknessM:number,freeboardM:number,estimated:true}}
 */
export function estimateBergGeometry(berg = {}) {
  const lengthM = Math.max(berg.length_m || 0, 1);
  const widthM = Math.max(berg.width_m || lengthM * 0.5, 1);
  const type = (berg.type || 'unknown').toLowerCase();

  // 흘수 경험식 (실측 길이 기반). 비현실적 극단은 합리적 범위로 클램프.
  let draftM = 2.91 * Math.pow(lengthM, 0.71);
  draftM = Math.min(Math.max(draftM, 8), 300);

  const thicknessM = draftM / SUBMERGED_RATIO;
  const freeboardM = thicknessM - draftM;

  return {
    lengthM,
    widthM,
    type,
    draftM: Math.round(draftM),
    thicknessM: Math.round(thicknessM),
    freeboardM: Math.round(freeboardM),
    estimated: true,
  };
}

/**
 * 2D 점(Cesium PointPrimitive / deck Scatter) 픽셀 크기를 길이에 비례시킨다.
 * 작은 빙산도 보이도록 하한, 과대 표시 방지로 상한.
 * @param {number} lengthM 수선장(m)
 * @param {number} base 최소 픽셀 크기
 */
export function bergPixelSize(lengthM, base = 6) {
  const L = Math.max(lengthM || 0, 1);
  return Math.round(Math.min(base + Math.sqrt(L) / 9, 22));
}

/** type 한글 라벨 */
export function bergTypeLabel(type) {
  switch ((type || '').toLowerCase()) {
    case 'tabular':
      return '평탄형(tabular)';
    case 'large':
      return '대형(large)';
    case 'medium':
      return '중형(medium)';
    case 'small':
      return '소형(small)';
    case 'growler':
      return '그라울러(growler)';
    default:
      return type || '미상';
  }
}
