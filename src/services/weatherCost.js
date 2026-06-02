/**
 * weatherCost.js
 *
 * 기상(파고·시정)을 항로 탐색 A* 비용함수에 반영하기 위한 순수 페널티 모델.
 *
 * 기존 A*(arcticPathfinder)는 해빙 농도·빙산·육지만 비용에 반영하고 실시간 기상은
 * 무시했다(발표자료 통합 갭 #2). 이 모듈은 파고/시정을 [0,1] 페널티로 정규화해,
 * 거친 바다·저시정 해역의 통항 비용을 높여 **동적 재항로**를 유도한다.
 *
 * 순수 함수 — 단위 테스트 가능. 그리드/탐색과 독립.
 */

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/**
 * 파고 페널티 [0,1]. maxWaveM 이상이면 1(최대).
 * @param {number} waveM       - 유의 파고(m)
 * @param {object} opts
 * @param {number} opts.maxWaveM - 페널티 포화 파고(기본 6m)
 */
export function waveCost(waveM, { maxWaveM = 6 } = {}) {
  if (!Number.isFinite(waveM) || waveM <= 0) return 0;
  return clamp01(waveM / maxWaveM);
}

/**
 * 시정 페널티 [0,1]. goodVisKm 이상이면 0, minVisKm 이하면 1.
 * @param {number} visKm
 * @param {object} opts
 * @param {number} opts.minVisKm  - 최저 시정(이하 최대 페널티, 기본 1km)
 * @param {number} opts.goodVisKm - 양호 시정(이상 페널티 없음, 기본 10km)
 */
export function visibilityCost(visKm, { minVisKm = 1, goodVisKm = 10 } = {}) {
  if (!Number.isFinite(visKm)) return 0;        // 데이터 없음 → 페널티 없음
  if (visKm >= goodVisKm) return 0;
  if (visKm <= minVisKm) return 1;
  return clamp01((goodVisKm - visKm) / (goodVisKm - minVisKm));
}

/**
 * 종합 기상 페널티 [0,1] — 파고·시정 가중 결합.
 * @param {object} weather - { wave_height_m, visibility_km }
 * @param {object} opts    - { maxWaveM, minVisKm, goodVisKm, waveWeight, visWeight }
 */
export function weatherPenalty(weather, opts = {}) {
  if (!weather) return 0;
  const { waveWeight = 0.6, visWeight = 0.4 } = opts;
  const w = waveCost(weather.wave_height_m, opts);
  const v = visibilityCost(weather.visibility_km, opts);
  const total = waveWeight + visWeight || 1;
  return clamp01((waveWeight * w + visWeight * v) / total);
}

/**
 * 기상 페널티를 엣지 비용 승수로 변환. 페널티 0 → 1(영향 없음).
 * @param {number} penalty - [0,1]
 * @param {number} weight  - 비용 증폭 계수(기본 1.5, 해빙 패널티와 동일 스케일)
 */
export function weatherEdgeMultiplier(penalty, weight = 1.5) {
  return 1 + clamp01(penalty) * weight;
}
