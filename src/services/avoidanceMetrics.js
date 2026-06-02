/**
 * avoidanceMetrics.js
 *
 * RL 빙산/육지 회피 컨트롤러의 런타임 관측성(observability) 수집기.
 *
 * 기존 컨트롤러는 회피를 "수행"하지만, 얼마나 자주 RL 이 성공하는지·A* 로
 * 폴백하는지·평균 신뢰도가 얼마인지에 대한 객관적 증거가 없었다. 이 모듈은
 * 그 지표를 누적해 "AI 가 실제로 자율 동작하는가"를 정량적으로 검증 가능하게 한다.
 *
 * 순수 로직(부수효과 없음)이라 단위 테스트가 가능하다. 프론트엔드는 파일을 쓸 수
 * 없으므로 메모리 누적 + 스냅샷 조회 방식을 쓴다(필요 시 백엔드로 전송 가능).
 */

/** 회피 처리 방법 분류 */
export const AVOIDANCE_METHODS = ['RL', 'A*', 'GlobalA*', 'unknown'];

/**
 * 회피 메트릭 수집기를 생성.
 * @returns {Object} record* 메서드와 snapshot()/reset() 을 가진 수집기
 */
export function createAvoidanceMetrics() {
  const m = {
    checks: 0,        // tick() 으로 위협을 평가한 총 횟수
    threats: 0,       // 빙산/육지 위협이 감지된 횟수
    threatsByType: { iceberg: 0, land: 0 },
    rlAttempts: 0,    // RL 추론을 시도한 횟수
    rlSuccess: 0,     // RL 결과가 채택된 횟수
    astarFallback: 0, // A* (또는 GlobalA*) 로 폴백한 횟수
    applied: 0,       // 새 우회 경로가 실제 적용된 횟수
    kept: 0,          // 경로 탐색 실패/거부로 현재 경로를 유지한 횟수
    confidenceSum: 0, // 평균 신뢰도 계산용
    confidenceN: 0,
    byMethod: {},     // 방법별 적용 횟수
    tcpaSum: 0,       // 위협 임박도(TCPA, 시간) 평균 계산용
    tcpaN: 0,
    minTcpaHours: null, // 관측된 가장 임박한 위협(TCPA 최소)
  };

  function bumpMethod(method) {
    const key = AVOIDANCE_METHODS.includes(method) ? method : 'unknown';
    m.byMethod[key] = (m.byMethod[key] || 0) + 1;
  }

  return {
    /** 매 tick 위협 평가 1회 */
    recordCheck() {
      m.checks += 1;
    },

    /**
     * 위협 감지 (type: 'iceberg' | 'land').
     * @param {number} [tcpaHours] - CPA/TCPA 로 산출한 최근접까지 시간(임박도). 선택.
     */
    recordThreat(type, tcpaHours) {
      m.threats += 1;
      if (type === 'iceberg' || type === 'land') m.threatsByType[type] += 1;
      if (Number.isFinite(tcpaHours) && tcpaHours >= 0) {
        m.tcpaSum += tcpaHours;
        m.tcpaN += 1;
        m.minTcpaHours = m.minTcpaHours === null ? tcpaHours : Math.min(m.minTcpaHours, tcpaHours);
      }
    },

    /** RL 추론 시도 + (선택) 반환된 신뢰도 기록 */
    recordRLAttempt(confidence) {
      m.rlAttempts += 1;
      if (Number.isFinite(confidence)) {
        m.confidenceSum += confidence;
        m.confidenceN += 1;
      }
    },

    /**
     * 한 번의 회피 시도 결과 기록.
     * @param {Object} p
     * @param {string}  p.method   - 'RL' | 'A*' | 'GlobalA*' | 'unknown'
     * @param {boolean} p.applied  - 새 경로가 적용됐는지
     */
    recordOutcome({ method, applied }) {
      if (method === 'RL' && applied) m.rlSuccess += 1;
      if ((method === 'A*' || method === 'GlobalA*') && applied) m.astarFallback += 1;
      if (applied) {
        m.applied += 1;
        bumpMethod(method);
      } else {
        m.kept += 1;
      }
    },

    /** 파생 지표를 포함한 불변 스냅샷 반환 */
    snapshot() {
      const rlSuccessRate = m.rlAttempts > 0 ? m.rlSuccess / m.rlAttempts : 0;
      const fallbackRate = m.rlAttempts > 0 ? m.astarFallback / m.rlAttempts : 0;
      const avgConfidence = m.confidenceN > 0 ? m.confidenceSum / m.confidenceN : 0;
      const threatRate = m.checks > 0 ? m.threats / m.checks : 0;
      const avgTcpaHours = m.tcpaN > 0 ? m.tcpaSum / m.tcpaN : null;
      return {
        ...m,
        threatsByType: { ...m.threatsByType },
        byMethod: { ...m.byMethod },
        // 파생 지표 (0~1)
        rlSuccessRate: round4(rlSuccessRate),
        fallbackRate: round4(fallbackRate),
        avgConfidence: round4(avgConfidence),
        threatRate: round4(threatRate),
        avgTcpaHours: avgTcpaHours === null ? null : round4(avgTcpaHours),
        minTcpaHours: m.minTcpaHours === null ? null : round4(m.minTcpaHours),
      };
    },

    /** 모든 카운터 초기화 */
    reset() {
      m.checks = 0;
      m.threats = 0;
      m.threatsByType = { iceberg: 0, land: 0 };
      m.rlAttempts = 0;
      m.rlSuccess = 0;
      m.astarFallback = 0;
      m.applied = 0;
      m.kept = 0;
      m.confidenceSum = 0;
      m.confidenceN = 0;
      m.byMethod = {};
      m.tcpaSum = 0;
      m.tcpaN = 0;
      m.minTcpaHours = null;
    },
  };
}

function round4(x) {
  return Math.round(x * 10000) / 10000;
}
