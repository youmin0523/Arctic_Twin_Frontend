/**
 * collisionModel.js
 *
 * 빙산 충돌 결과 + 환경 영향 물리 모델.
 *
 * 기존 시뮬레이션은 충돌 시 단순 밀어내기 + 고정 계수 감속(`iceDamageMult*0.3`)만
 * 적용하고 충돌 결과(손상·선체 응력·침로 편향)와 환경 영향(파고·시정·바람의 감속)을
 * 모델링하지 않았다(발표자료 정밀도 한계 #4). 이 모듈은 그 물리를 순수 함수로 제공한다.
 *
 * 빙급(Polar Class)별 내빙 성능을 ICE_CLASS_DATA.damage 로 반영:
 *   damage 0(PC1, 무손상) ~ 1.0(None, 일반선). 높을수록 동일 충돌에서 피해 큼.
 */
import { ICE_CLASS_DATA } from '../data/iceClassData.js';

const KNOT_TO_MS = 0.514444;

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/** 빙급별 손상 계수(0~1). 알 수 없으면 일반선(NONE) 기준. */
export function iceClassDamageFactor(iceClass) {
  const key = String(iceClass || '').toUpperCase().replace(/\s+/g, '');
  // 'PC5' 등 표준 키 우선, 'IA Super' 류는 NONE 폴백(데이터 테이블이 PC/NONE 만 보유)
  const entry = ICE_CLASS_DATA[iceClass] || ICE_CLASS_DATA[key] || ICE_CLASS_DATA.NONE;
  return entry.damage;
}

/**
 * 충돌 운동에너지 프록시 — 상대속도² × 빙산 규모.
 * 절대 J 가 아니라 비교·정규화용 상대 지표.
 * @param {number} speedKnots     - 충돌 시 선속(노트)
 * @param {number} icebergLengthM - 빙산 대표 길이(m)
 */
export function impactEnergyProxy(speedKnots, icebergLengthM) {
  const v = Math.max(0, speedKnots) * KNOT_TO_MS;            // m/s
  const sizeProxy = Math.max(50, icebergLengthM || 1000) / 1000; // km 스케일(최소 클램프)
  return v * v * sizeProxy;
}

/**
 * 충돌 결과 산출.
 * @param {Object} p
 * @param {number} p.speedKnots      - 충돌 시 선속
 * @param {number} p.icebergLengthM  - 빙산 길이(m)
 * @param {string} p.iceClass        - 선박 빙급
 * @param {boolean} p.glancing       - 빗겨 맞음(측면) 여부 → 피해 감소
 * @returns {{severity:number, speedLossFactor:number, hullStress:number,
 *            damageIncrement:number, headingDeflectionDeg:number,
 *            recoverable:boolean, label:string}}
 */
export function collisionOutcome({ speedKnots, icebergLengthM, iceClass, glancing = false } = {}) {
  const energy = impactEnergyProxy(speedKnots, icebergLengthM);
  const dmgFactor = iceClassDamageFactor(iceClass);

  // 정규화 심각도: 에너지 포화(약 60 프록시에서 1)에 빙급 손상계수 가중
  const base = clamp01(energy / 60);
  const glanceMul = glancing ? 0.45 : 1.0;
  const severity = clamp01(base * (0.4 + 0.6 * dmgFactor) * glanceMul);

  // 결과 물리량
  const speedLossFactor = clamp01(0.1 + 0.6 * severity);        // 속도 손실 비율
  const hullStress = clamp01(0.2 + 0.8 * severity);             // 선체 응력 0~1
  const damageIncrement = severity * dmgFactor;                 // 누적 손상 기여
  const headingDeflectionDeg = (glancing ? 6 : 3) * severity * (dmgFactor + 0.5); // 침로 편향(yaw)
  const recoverable = severity < 0.85;                         // 치명 충돌 여부

  let label;
  if (severity < 0.15) label = '경미 접촉';
  else if (severity < 0.45) label = '경미 손상';
  else if (severity < 0.85) label = '중대 손상';
  else label = '치명적 충돌';

  return {
    severity: round4(severity),
    speedLossFactor: round4(speedLossFactor),
    hullStress: round4(hullStress),
    damageIncrement: round4(damageIncrement),
    headingDeflectionDeg: round4(headingDeflectionDeg),
    recoverable,
    label,
  };
}

/**
 * 환경(파고·시정·바람)이 안전 항행 속도에 미치는 영향 계수 [minFactor, 1].
 * 거친 바다·저시정·강풍에서 안전 속도가 낮아진다.
 * @param {Object} env - { wave_height_m, visibility_km, wind_knots }
 * @param {Object} opts
 */
export function environmentalSpeedFactor(env, opts = {}) {
  const {
    maxWaveM = 6, calmVisKm = 10, minVisKm = 1, maxWindKn = 40, minFactor = 0.3,
  } = opts;
  if (!env) return 1;

  const wave = Number.isFinite(env.wave_height_m) ? clamp01(env.wave_height_m / maxWaveM) : 0;
  const vis = Number.isFinite(env.visibility_km)
    ? clamp01((calmVisKm - env.visibility_km) / (calmVisKm - minVisKm))
    : 0;
  const wind = Number.isFinite(env.wind_knots) ? clamp01(env.wind_knots / maxWindKn) : 0;

  // 가중 감속(파고 0.5 / 시정 0.3 / 바람 0.2)
  const reduction = 0.5 * wave + 0.3 * vis + 0.2 * wind;
  return Math.max(minFactor, 1 - reduction);
}

/** 환경 영향을 반영한 안전 항행 속도. */
export function applyEnvironmentToSpeed(baseSpeedKnots, env, opts = {}) {
  return Math.max(0, baseSpeedKnots) * environmentalSpeedFactor(env, opts);
}

function round4(x) {
  return Math.round(x * 10000) / 10000;
}
