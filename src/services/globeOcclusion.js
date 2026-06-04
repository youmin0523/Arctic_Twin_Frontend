// ============================================================
// Globe horizon occlusion (지구 수평선 가림 판정)
//
// 위성 조감(SATELLITE/WIDE) 모드의 deck.gl 오버레이는 평면 MapView 투영을
// 쓰기 때문에 지구 "뒤편"(반대 반구)에 있는 빙산·해빙·웨이포인트가
// 앞으로 비쳐 보인다. 카메라 위치 기준으로 각 점이 가시 반구에 있는지
// (= 지평선 안쪽인지)를 구면 모델로 판정해 뒤편 점을 컬링한다.
//
// 원리: 반지름 R 구의 표면점이 거리 D(=R+고도)의 카메라에서 보이려면
//   dot(정규화한 카메라방향, 정규화한 점방향) >= R / D
// (지평선은 카메라에서 구에 접하는 지점 → cos(지평선각) = R/D)
// ============================================================

const R = 6371000; // 지구 평균 반지름 (m) — 구면 근사
const DEG = Math.PI / 180;

// 지평선 경계에서의 미세한 깜빡임(pop)을 막기 위한 완화값.
// 점이 살짝 고도를 가지면 지평선보다 약간 더 멀리서도 보이므로 약간 느슨하게.
const EPS = 0.012;

/**
 * 카메라 위치로부터 가림 판정 컨텍스트 생성.
 * @param {number} camLonDeg 카메라 경도(도)
 * @param {number} camLatDeg 카메라 위도(도)
 * @param {number} camHeightM 카메라 타원체 고도(m)
 * @returns {{camDir:[number,number,number], horizonDot:number}}
 */
export function makeOcclusion(camLonDeg, camLatDeg, camHeightM) {
  const lon = camLonDeg * DEG;
  const lat = camLatDeg * DEG;
  const cl = Math.cos(lat);
  const camDir = [cl * Math.cos(lon), cl * Math.sin(lon), Math.sin(lat)];
  const D = R + Math.max(camHeightM, 1);
  return { camDir, horizonDot: R / D };
}

/** 경위도 점이 카메라의 가시 반구(지평선 안쪽)에 있는지 */
export function pointVisible(lonDeg, latDeg, occ) {
  if (!occ) return true;
  const lon = lonDeg * DEG;
  const lat = latDeg * DEG;
  const cl = Math.cos(lat);
  const d =
    cl * Math.cos(lon) * occ.camDir[0] +
    cl * Math.sin(lon) * occ.camDir[1] +
    Math.sin(lat) * occ.camDir[2];
  return d >= occ.horizonDot - EPS;
}

/** 두 가림 컨텍스트가 사실상 동일한지 (deck 레이어 재빌드 빈도 억제용) */
export function occlusionNearlyEqual(a, b) {
  if (!a || !b) return false;
  const dot =
    a.camDir[0] * b.camDir[0] +
    a.camDir[1] * b.camDir[1] +
    a.camDir[2] * b.camDir[2];
  return dot > 0.99995 && Math.abs(a.horizonDot - b.horizonDot) < 0.0005;
}
