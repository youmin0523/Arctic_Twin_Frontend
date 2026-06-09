// ═══════════════════════════════════════════════════════════════
// POLARIS RIO (Risk Index Outcome) Calculator
// Extracted from arctic-hybrid.html lines 2324-2570
// KR Polar Code Implementation Guide + IMO MSC.1/Circ.1519
// ═══════════════════════════════════════════════════════════════

import { ICE_CLASS_DATA, RIV_TABLE } from '../data/iceClassData.js';

// IACS Polar Arc 등급(Arc4~Arc9) → POLARIS PC 등가 매핑.
// RIV_TABLE 은 PC*/IA*/IB/IC/NONE 키만 가지므로, Arc* 빙급은 PC 등가로 환산해야
// RIV 룩업이 성립한다. (frontend/src/components/layout/BottomPanel.jsx 의
// iceClassCodeMap 과 동일 근거: Arc9→PC3, Arc7→PC4, Arc6→PC5, Arc5→PC6, Arc4→PC7)
const ARC_TO_PC = { Arc9: 'PC3', Arc7: 'PC4', Arc6: 'PC5', Arc5: 'PC6', Arc4: 'PC7' };

/**
 * 빙급 문자열을 RIV_TABLE 룩업 키로 정규화한다.
 * PC·IA·IB·IC·NONE 키는 그대로, Arc 등급은 PC 등가로, 그 외 미정의 등급은 NONE 으로 폴백.
 * @param {string} iceClass
 * @returns {string} RIV_TABLE 에 존재하는 키
 */
export function normalizeIceClass(iceClass) {
  if (iceClass && RIV_TABLE[iceClass]) return iceClass;
  if (iceClass && ARC_TO_PC[iceClass]) return ARC_TO_PC[iceClass];
  return 'NONE';
}

/**
 * Calculate the Risk Index Outcome (RIO) for a given ice class and ice conditions.
 *
 * @param {string} iceClass       - Polar class key (e.g. 'PC1'..'PC7', 'NONE', 'IA Super', 'Arc4'..'Arc9')
 * @param {Array}  iceConditions  - Array of { type: string, concentration_tenths: number }
 * @returns {number} RIO score (positive = safe, negative = dangerous)
 */
export function calculateRIO(iceClass, iceConditions) {
  const classRivs = RIV_TABLE[normalizeIceClass(iceClass)];
  let rio = 0;
  for (const entry of iceConditions) {
    const riv = classRivs[entry.type];
    if (riv === undefined) continue; // 알 수 없는 빙질은 건너뜀
    rio += entry.concentration_tenths * riv;
  }
  return Math.round(rio * 10000) / 10000;
}

/**
 * Derive POLARIS ice_conditions array from position and ice concentration.
 * Uses latitude-based heuristics to distribute ice types.
 *
 * @param {number}   lon                   - Longitude
 * @param {number}   lat                   - Latitude
 * @param {Function} sampleIceConcentration - Function(lon,lat) => 0..1 concentration
 * @returns {Array} Array of { type: string, concentration_tenths: number }
 */
export function deriveIceConditions(lon, lat, sampleIceConcentration) {
  const conc = Math.max(0, Math.min(1, sampleIceConcentration(lon, lat) || 0));
  const openWater = Math.max(0, 1 - conc);
  const conditions = [];

  if (lat > 82) {
    // 극고위도: 다년생 빙(MY) + 압퇴빙 지배
    if (conc * 0.6 > 0)
      conditions.push({
        type: 'Multi-Year (MY)',
        concentration_tenths: conc * 0.6,
      });
    if (conc * 0.3 > 0)
      conditions.push({
        type: 'Ridged/Hummocked',
        concentration_tenths: conc * 0.3,
      });
    if (conc * 0.1 > 0)
      conditions.push({
        type: 'Thick First-Year (FY)',
        concentration_tenths: conc * 0.1,
      });
  } else if (lat > 78) {
    // 고위도: 후기 1년생 + 다년생
    if (conc * 0.5 > 0)
      conditions.push({
        type: 'Thick First-Year (FY)',
        concentration_tenths: conc * 0.5,
      });
    if (conc * 0.35 > 0)
      conditions.push({
        type: 'Multi-Year (MY)',
        concentration_tenths: conc * 0.35,
      });
    if (conc * 0.15 > 0)
      conditions.push({
        type: 'Ridged/Hummocked',
        concentration_tenths: conc * 0.15,
      });
  } else if (lat > 74) {
    // 중위도: 중간 두께 1년생 빙 지배
    if (conc * 0.6 > 0)
      conditions.push({
        type: 'Medium First-Year (FY)',
        concentration_tenths: conc * 0.6,
      });
    if (conc * 0.3 > 0)
      conditions.push({
        type: 'Thin First-Year (FY)',
        concentration_tenths: conc * 0.3,
      });
    if (conc * 0.1 > 0)
      conditions.push({
        type: 'Grey-White Ice',
        concentration_tenths: conc * 0.1,
      });
  } else if (lat > 68) {
    // 저위도 북극 주변부: 얇은 1년생 빙
    if (conc * 0.7 > 0)
      conditions.push({
        type: 'Thin First-Year (FY)',
        concentration_tenths: conc * 0.7,
      });
    if (conc * 0.2 > 0)
      conditions.push({
        type: 'Grey-White Ice',
        concentration_tenths: conc * 0.2,
      });
    if (conc * 0.1 > 0)
      conditions.push({ type: 'Grey Ice', concentration_tenths: conc * 0.1 });
  } else {
    // 개빙수역
    if (conc * 0.5 > 0)
      conditions.push({ type: 'Grey Ice', concentration_tenths: conc * 0.5 });
    if (conc * 0.5 > 0)
      conditions.push({
        type: 'Grey-White Ice',
        concentration_tenths: conc * 0.5,
      });
  }

  if (openWater > 0)
    conditions.push({ type: 'Open Water', concentration_tenths: openWater });
  return conditions;
}

// //* [Modified Code] UI 가이드 및 재사용을 위해 핵심 기항 상수를 상단으로 추출 및 Export
// (하위호환·UI 툴팁용 — NSR 기준 기본값. 항로별 임계값은 ROUTE_POLAR_PROFILES 참조)
export const NSR_MAX_DRAFT = 12.5;
export const NSR_MAX_BEAM = 35.0;
export const MIN_RESCUE_DAYS = 5;
export const MIN_TEMP_MARGIN = 10.0;

// 북극 항로 키 (평가/게이트 대상)
export const ARCTIC_ROUTE_KEYS = ['NSR', 'NWP', 'TSR'];

/**
 * 항로별 극지 운항 평가 프로파일 — 실제 규정 근거 반영.
 *
 *  공통(전 북극항로): IMO Polar Code(SOLAS/MARPOL 강제) — PWOM 비치, 극지 설비/인력,
 *    PST(저온 설계온도: 최저 MDLT 대비 ≥10°C), METR(생존시간 최소 5일).
 *  HFO 금지: MARPOL Annex I Reg.43A — 2024-07-01 사용·적재 금지(연료탱크 설계 면제·
 *    연안국 waiver 일부 허용), 2029-07-01 전면 시행(면제·waiver 종료).
 *  빙급 적합성: POLARIS RIO(IMO MSC.1/Circ.1519)로 각 항로의 실제 빙상에서 Step 5 판정
 *    (인위적 최소 빙급 임계값 대신 항로 위도·빙질 기반으로 차등 — NSR/NWP/TSR 자동 구분).
 *
 *  항로별 차이(규정·지리 근거):
 *   · NSR — 러 「NSR 항행규칙」: NSRA 허가(입역 15영업일~120일 전 신청, Rosatom).
 *           대러 제재 참여국 선적 시 압류 위험 → 희망봉(CAPE) 권고. Sannikov 해협 흘수 ~13m.
 *   · NWP — 캐 NORDREG 의무 보고(≥300GT, 2010~)·ASSPPR(Polar Code 국내이행). 제재 무관.
 *           남측 주항로(Route 3) 대형선 흘수 <14m(Victoria 해협 ~10m).
 *   · TSR — 중앙 북극 공해 횡단: 국가 허가체계 없음·제재 무관. 심해(흘수 제한 사실상 없음),
 *           최고위도(~90°N)·최원격 → LEO 통신·높은 METR 필요. 빙 난이도는 POLARIS가 판정.
 */
export const ROUTE_POLAR_PROFILES = {
  NSR: {
    label: '북동항로(NSR)',
    requiresNsraPermit: true,    // 러 NSR 항행규칙: NSRA 허가(입역 15영업일~120일 전 신청)
    sanctionReroute: 'CAPE',     // 대러 제재 참여국 선적 → 희망봉 우회
    maxDraft: NSR_MAX_DRAFT,     // 12.5m — Sannikov 해협 ~13m / Dmitry Laptev 6.7m(연안항로)
    maxBeam: NSR_MAX_BEAM,       // 35m — 러 원자력쇄빙선(Arktika급 ~34m) 호송 수로
    minRescueDays: MIN_RESCUE_DAYS, // 5일 — Polar Code METR 최소
    minTempMargin: MIN_TEMP_MARGIN, // 10°C — Polar Code PST(최저 MDLT 대비 ≥10°C)
    commsLatThreshold: 75.0,     // GEO 앙각 한계(~76°N) 고려 — 고위도 LEO 필요
    defaultReroute: 'SUEZ',
  },
  NWP: {
    label: '북서항로(NWP)',
    requiresNsraPermit: false,
    requiresNordreg: true,       // 캐 NORDREG 의무 보고(≥300GT) — 보고제(통과 차단 아님)
    sanctionReroute: null,       // 대러 제재 무관
    maxDraft: 14.0,              // 남측 주항로 대형선 흘수 <14m (Victoria 해협 ~10m 변형로)
    maxBeam: 32.0,
    minRescueDays: 7,            // 원격·SAR 열악 → 운영 METR 상향(Polar Code 5일 초과 권고)
    minTempMargin: MIN_TEMP_MARGIN, // 10°C
    commsLatThreshold: 74.0,
    defaultReroute: 'SUEZ',
  },
  TSR: {
    label: '북극횡단항로(TSR)',
    requiresNsraPermit: false,
    sanctionReroute: null,
    maxDraft: 30.0,             // 중앙 북극 심해 — 흘수 제한 사실상 없음
    maxBeam: 50.0,
    minRescueDays: 10,          // 최원격 — 운영 METR 대폭 상향
    minTempMargin: MIN_TEMP_MARGIN, // 10°C
    commsLatThreshold: 84.0,    // ~90°N 횡단 — LEO 필수
    defaultReroute: 'SUEZ',
  },
};

/**
 * 5-step sequential routing decision tree.
 * Returns { status, reason, rioScore }.
 *
 * @param {Object} shipData - Ship evaluation input:
 *   isSanctionedCountry, hasNsraPermit, hasPwom,
 *   fuelType, hasHfoExemption,
 *   draft, beam,
 *   maxRescueDays, isTempBelowMinus10, designTempMargin,
 *   hasWinterization, hasZeroDischarge, hasPolarComms, hasIceNavigator,
 *   latitude, commsType,
 *   shipType, waveHeight, visibilityKm,
 *   iceClass, iceConditions
 * @returns {Object} { status: string, reason: string, rioScore: number|null }
 */
export function evaluateRouting(shipData, routeKey = 'NSR') {
  const profile = ROUTE_POLAR_PROFILES[routeKey];

  // 비북극 항로(SUEZ/CAPE/ETC) — POLAR CODE 적합성 평가 대상이 아님
  if (!profile) {
    return {
      status: 'NON_ARCTIC',
      reason: '비북극 항로 — POLAR CODE 극지 적합성 평가 대상이 아닙니다. 일반 상선 항행 기준 적용.',
      rioScore: null,
    };
  }

  const RL = profile.label;
  const rerouteStatus =
    profile.defaultReroute === 'CAPE' ? 'REROUTE_CAPE' : 'REROUTE_SUEZ';
  const rerouteName = profile.defaultReroute === 'CAPE' ? '희망봉' : '수에즈';

  // ── Step 1: 지정학·행정·환경 규제 필터 ─────────────────────────────
  if (shipData.isSanctionedCountry && profile.sanctionReroute) {
    const isCape = profile.sanctionReroute === 'CAPE';
    return {
      status: isCape ? 'REROUTE_CAPE' : 'REROUTE_SUEZ',
      reason: `[Step 1a] 선박 국적이 대러시아 제재 참여국입니다. ${RL} 통과 시 국제 제재 위반 및 선박·화물 압류 위험 → ${isCape ? '희망봉(CAPE)' : '수에즈'} 우회.`,
      rioScore: null,
    };
  }
  if (profile.requiresNsraPermit && !shipData.hasNsraPermit) {
    return {
      status: 'REROUTE_SUEZ',
      reason: `[Step 1b] NSRA(러시아 북극항로청) 사전 운항 허가 미취득. ${RL}은 입역 15영업일~120일 전 신청 필수(러 NSR 항행규칙) → 수에즈 우회.`,
      rioScore: null,
    };
  }
  if (!shipData.hasPwom) {
    return {
      status: rerouteStatus,
      reason: `[Step 1b] 극지해역 운항 매뉴얼(PWOM) 미비치. IMO Polar Code 필수 문서 → ${rerouteName} 우회.`,
      rioScore: null,
    };
  }
  const fuelType = shipData.fuelType || 'MGO';
  const hasHfoExemption = shipData.hasHfoExemption || false;
  if (fuelType === 'HFO' && !hasHfoExemption) {
    return {
      status: rerouteStatus,
      reason: `[Step 1c] HFO(중질유) 사용·적재 선박 — IMO 북극해 HFO 금지(MARPOL Annex I Reg.43A, 2024-07-01 시행 / 2029-07-01 전면) 위반. 면제·waiver 미보유 → ${rerouteName} 우회.`,
      rioScore: null,
    };
  }

  // ── Step 2: 물리적 크기 필터 (항로별 해협 수심·폭) ────────────────
  if (shipData.draft > profile.maxDraft) {
    return {
      status: rerouteStatus,
      reason: `[Step 2a] 흘수 ${shipData.draft.toFixed(1)}m > ${RL} 수심 제한 ${profile.maxDraft}m. ${rerouteName} 우회.`,
      rioScore: null,
    };
  }
  if (shipData.beam > profile.maxBeam) {
    return {
      status: rerouteStatus,
      reason: `[Step 2b] 선폭 ${shipData.beam.toFixed(1)}m > ${RL} 수로 허용 ${profile.maxBeam}m. 에스코트 불가 → ${rerouteName} 우회.`,
      rioScore: null,
    };
  }

  // ── Step 3: Polar Code 생존·설비·통신 기준 (항로별) ──────────────
  if (shipData.maxRescueDays < profile.minRescueDays) {
    return {
      status: rerouteStatus,
      reason: `[Step 3a] 생존 장비 ${shipData.maxRescueDays}일 < ${RL} 최소 기준 ${profile.minRescueDays}일. SAR 대응 지연 시 승무원 안전 불보장 → ${rerouteName} 우회.`,
      rioScore: null,
    };
  }
  if (
    shipData.isTempBelowMinus10 &&
    shipData.designTempMargin < profile.minTempMargin
  ) {
    return {
      status: rerouteStatus,
      reason: `[Step 3b] 저온 해역(-10°C↓) 운항 시 설계 온도 여유 ${shipData.designTempMargin}°C < ${RL} 권고 기준 ${profile.minTempMargin}°C. 구조 취성 파괴 위험 → ${rerouteName} 우회.`,
      rioScore: null,
    };
  }
  const missing = [];
  if (!shipData.hasWinterization) missing.push('방한 설비');
  if (!shipData.hasZeroDischarge) missing.push('무배출 탱크');
  if (!shipData.hasPolarComms) missing.push('극지 통신');
  if (!shipData.hasIceNavigator) missing.push('극지 항해사');
  if (missing.length > 0) {
    return {
      status: rerouteStatus,
      reason: `[Step 3c] Polar Code 필수 설비/인력 미비: ${missing.join(', ')}. KR 이행 가이드 9~12장 요건 미충족 → ${rerouteName} 우회.`,
      rioScore: null,
    };
  }
  const latitude = shipData.latitude ?? 70.0;
  const commsType = shipData.commsType || 'GEO';
  if (latitude >= profile.commsLatThreshold && commsType !== 'LEO') {
    return {
      status: rerouteStatus,
      reason: `[Step 3d] ${RL} 최고 위도 ${latitude.toFixed(1)}°N ≥ ${profile.commsLatThreshold}° — GEO 위성 앙각 부족으로 통신 불가 구간 발생. Iridium/Starlink 등 LEO 통신 필수 (현재: ${commsType}) → ${rerouteName} 우회.`,
      rioScore: null,
    };
  }
  // (빙급 적합성은 Step 5 POLARIS RIO 로 각 항로 실제 빙상에서 판정 —
  //  IMO MSC.1/Circ.1519. 인위적 최소 빙급 임계값 미사용.)

  // ── Step 4: 선종별 특화 기상 필터 ────────────────────────────────
  const shipType = shipData.shipType || 'General';
  const waveHeight = shipData.waveHeight ?? 0.0;
  const visibilityKm = shipData.visibilityKm ?? 10.0;
  let weatherWarning = '';

  if (shipType === 'Container Ship') {
    if (waveHeight > 4.0) {
      return {
        status: rerouteStatus,
        reason: `[Step 4a] 컨테이너선 한계 파고 초과: 유의 파고 ${waveHeight.toFixed(1)}m > 4.0m. 갑판 적재 컨테이너 유실(Cargo Loss) 및 구조 손상 위험 → ${rerouteName} 우회.`,
        rioScore: null,
      };
    }
    if (shipData.isTempBelowMinus10 && waveHeight > 2.5) {
      return {
        status: rerouteStatus,
        reason: `[Step 4b] 컨테이너선 착빙(Vessel Icing) 위험: 기온 -10°C 미만 + 파고 ${waveHeight.toFixed(1)}m > 2.5m. 치명적 선체 착빙 예상, 복원력 상실 위험 → ${rerouteName} 우회.`,
        rioScore: null,
      };
    }
  } else if (shipType === 'LNG Carrier') {
    if (waveHeight > 6.0) {
      weatherWarning += `[LNG선 경고: 파고 ${waveHeight.toFixed(1)}m > 6.0m — 슬로싱·BOG 증가. 감속·가스 관리 주의 운항] `;
    }
  } else if (shipType === 'Icebreaker') {
    if (waveHeight > 8.0) {
      weatherWarning += `[쇄빙선 경고: 파고 ${waveHeight.toFixed(1)}m > 8.0m — 황천 해역 호송 임무 제한. 독립 항행 전환 검토] `;
    }
  }
  if (visibilityKm < 1.0) {
    weatherWarning += `[가시거리 경고: ${visibilityKm.toFixed(1)}km 미만 — 해무/극야 조건. 속도 50% 이상 감속 및 연속 레이더 감시 필수] `;
  }
  weatherWarning = weatherWarning.trim();

  // ── Step 5: POLARIS RIO 평가 ─────────────────────────────────────
  const rio = calculateRIO(shipData.iceClass, shipData.iceConditions);

  if (rio >= 0) {
    const baseReason = `[Step 5a] POLARIS RIO +${rio.toFixed(2)}. 모든 기준 충족, 현재 빙상 조건에서 ${RL} 정상 통과 승인.`;
    if (weatherWarning) {
      return {
        status: 'NSR_RESTRICTED',
        reason: `${baseReason} | ${weatherWarning}`,
        rioScore: rio,
      };
    }
    return { status: 'NSR_APPROVED', reason: baseReason, rioScore: rio };
  }
  if (rio >= -10) {
    const baseReason = `[Step 5b] ${RL} RIO ${rio.toFixed(2)} (경계: -10≤RIO<0). 고위험 빙해역 — 쇄빙선 에스코트 필수, 권고 속도 준수, 24h 빙상 감시 조건부 통과.`;
    return {
      status: 'NSR_RESTRICTED',
      reason: weatherWarning ? `${baseReason} | ${weatherWarning}` : baseReason,
      rioScore: rio,
    };
  }
  return {
    status: rerouteStatus,
    reason: `[Step 5c] ${RL} RIO ${rio.toFixed(2)} < -10. POLARIS 특별 고려 대상 해역(빙하·다년생 빙 지배). 선박 설계 한계 초과, 안전 항해 계획 불가 → ${rerouteName} 우회.`,
    rioScore: rio,
  };
}
