/**
 * decisionSupport.js
 *
 * What-If 시나리오의 정량 비교·랭킹 및 의사결정 신뢰도 평가.
 *
 * 기존에는 WhatIfPanel 안에 수렴 판정 휴리스틱이 인라인으로 흩어져 있고
 * 시나리오 간 정량 비교가 없었다. 이 모듈은 그 로직을 검증 가능한 순수 함수로
 * 형식화하여, "어떤 시나리오가 왜 더 나은가"를 투명하게 근거로 제시한다.
 */

// 추천 등급 → 정렬 가중치 (높을수록 우선)
const REC_TIER = {
  추천: 3,
  조건부: 2,
  비추천: 1,
  기준: 0,
};

/** [HYP]/【가설】 prefix 또는 is_hypothetical 플래그로 가설 시나리오 판별 */
export function isHypothetical(sc) {
  if (sc?.is_hypothetical === true) return true;
  const t = sc?.name || sc?.label || '';
  return t.includes('[HYP]') || t.includes('【가설】');
}

/**
 * 단일 시나리오를 비교 가능한 정규화 지표로 요약.
 * @returns {Object} 파생 지표 포함 요약
 */
export function summarizeScenario(sc) {
  const rs = sc?.route_summary || {};
  const green = num(rs.green_days);
  const yellow = num(rs.yellow_days);
  const red = num(rs.red_days);
  const totalDays = green + yellow + red;
  return {
    name: sc?.name || sc?.label || '시나리오',
    recommendation: sc?.recommendation || '기준',
    recTier: REC_TIER[sc?.recommendation] ?? -1,
    avgRio: Number.isFinite(rs.avg_rio) ? rs.avg_rio : null,
    greenDays: green,
    yellowDays: yellow,
    redDays: red,
    totalDays,
    // 안전 운항 비율(녹색일 / 전체일). 데이터 없으면 null.
    greenRatio: totalDays > 0 ? round4(green / totalDays) : null,
    isHypothetical: isHypothetical(sc),
  };
}

/**
 * 시나리오들을 정량 비교해 "더 나은 순서"로 정렬하고 순위를 매긴다.
 * 정렬 기준(투명·결정적): 추천등급 → 평균 RIO → 안전운항비율.
 * 기본적으로 실측 시나리오만 대상으로 한다(가설 제외).
 *
 * @param {Array}   scenarios
 * @param {Object}  opts
 * @param {boolean} opts.includeHypothetical - 가설 포함 여부(기본 false)
 * @returns {Array} rank(1부터) 포함 요약 배열
 */
export function buildScenarioComparison(scenarios, { includeHypothetical = false } = {}) {
  const rows = (scenarios || [])
    .map(summarizeScenario)
    .filter((r) => includeHypothetical || !r.isHypothetical);

  rows.sort((a, b) => {
    if (b.recTier !== a.recTier) return b.recTier - a.recTier;
    const ar = a.avgRio ?? -Infinity;
    const br = b.avgRio ?? -Infinity;
    if (br !== ar) return br - ar;
    const ag = a.greenRatio ?? -Infinity;
    const bg = b.greenRatio ?? -Infinity;
    return bg - ag;
  });

  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * 의사결정 신뢰도 평가 — WhatIfPanel 에 흩어져 있던 수렴 휴리스틱을 단일화.
 * convergenceStatus(백엔드 제공)가 있으면 우선, 없으면 분포로 추론한다.
 *
 * @returns {Object} { level: 'high'|'medium'|'low', label, reason }
 */
export function assessConfidence(scenarios, convergenceStatus) {
  const real = (scenarios || []).filter((s) => !isHypothetical(s));
  if (real.length === 0) {
    return { level: 'low', label: '신뢰도 낮음', reason: '평가된 실측 시나리오 없음' };
  }

  const counts = countRecommendations(real);
  const rejectRatio = counts.비추천 / real.length;

  // 백엔드 수렴 상태가 있으면 그대로 매핑
  const status =
    convergenceStatus ||
    (rejectRatio >= 0.8
      ? 'collapse'
      : real.length < 4
        ? 'stalled'
        : counts.추천 > 0 && counts.비추천 > 0
          ? 'good'
          : 'improving');

  switch (status) {
    case 'good':
      return { level: 'high', label: '신뢰도 높음', reason: '시나리오 수렴 + 추천/비추천 변별 양호' };
    case 'collapse':
      return { level: 'low', label: '신뢰도 낮음', reason: '대부분 비추천 — 출항 보류 권장' };
    case 'stalled':
      return { level: 'low', label: '신뢰도 낮음', reason: `시나리오 ${real.length}건뿐 — 추가 분석 필요` };
    case 'improving':
    default:
      return { level: 'medium', label: '신뢰도 보통', reason: '추가 반복 시 변별력 향상 기대' };
  }
}

/** 추천 등급 분포 카운트 */
export function countRecommendations(scenarios) {
  const out = { 추천: 0, 조건부: 0, 비추천: 0 };
  for (const s of scenarios || []) {
    const r = s.recommendation;
    if (r in out) out[r] += 1;
  }
  return out;
}

function num(x) {
  return Number.isFinite(x) ? x : 0;
}
function round4(x) {
  return Math.round(x * 10000) / 10000;
}
