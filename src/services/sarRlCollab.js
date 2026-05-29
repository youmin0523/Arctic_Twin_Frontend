/**
 * sarRlCollab.js
 * ==============
 * RL-pipeline + SAR YOLOv8 콜라보 전용 프론트엔드 서비스.
 *
 * 기존 services/api.js, services/rlAvoidanceController.js, services/rlInferenceClient.js 는
 * 건드리지 않고, 그 위에서 두 모델을 조율한다.
 *
 * 주요 책임:
 *   1) /api/collab/* 엔드포인트 호출 (백엔드 src/routes/collab.js 와 짝)
 *   2) SAR 빙하 list 정규화 (3개 뷰가 그대로 쓸 수 있는 schema)
 *   3) (Phase B) 시뮬레이션 시작/정지 — rlAvoidanceController 를 SAR feed 로 구성
 */

const COLLAB_BASE = '/api/collab';

/**
 * SAR YOLO 탐지 빙하만 가져오기.
 *
 * @returns {Promise<{
 *   source: string,
 *   available: boolean,
 *   detection_time: string|null,
 *   total_detected: number,
 *   confidence_threshold: number|null,
 *   bergs: Array<{id, lat, lon, length_m, width_m, type, source, confidence}>,
 *   berg_count: number,
 * }>}
 */
export async function fetchSarIcebergs() {
  const res = await fetch(`${COLLAB_BASE}/sar-icebergs`);
  if (!res.ok) {
    throw new Error(`fetchSarIcebergs failed: HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * SAR 탐지 메타데이터만 (UI 패널 표시용).
 */
export async function fetchSarMetadata() {
  const res = await fetch(`${COLLAB_BASE}/sar-metadata`);
  if (!res.ok) throw new Error(`fetchSarMetadata failed: HTTP ${res.status}`);
  return res.json();
}

/**
 * NIC + Copernicus + SAR 통합 빙하 list.
 * 기존 /api/icebergs/latest 와 동일한 schema + sar_count 추가.
 */
export async function fetchAllCollabIcebergs() {
  const res = await fetch(`${COLLAB_BASE}/all-icebergs`);
  if (!res.ok) throw new Error(`fetchAllCollabIcebergs failed: HTTP ${res.status}`);
  return res.json();
}

/**
 * iceberg_detector.py 서브프로세스 실행 트리거.
 * 결과는 다음 fetchSarIcebergs 호출 시 반영된다.
 */
export async function triggerSarDetection({ confidence = 0.4, maxProducts } = {}) {
  const body = { confidence };
  if (typeof maxProducts === 'number') body.max_products = maxProducts;

  const res = await fetch(`${COLLAB_BASE}/sar-detect-trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * SAR 빙하 폴링 헬퍼.
 * onUpdate({ bergs, metadata }) 콜백을 intervalMs 마다 호출.
 *
 * @returns {() => void} stop 함수
 */
export function startSarPolling(onUpdate, intervalMs = 30 * 1000) {
  let stopped = false;
  let timer = null;

  async function tick() {
    if (stopped) return;
    try {
      const data = await fetchSarIcebergs();
      onUpdate({
        bergs: data.bergs || [],
        metadata: {
          available: data.available,
          detection_time: data.detection_time,
          total_detected: data.total_detected,
          confidence_threshold: data.confidence_threshold,
        },
      });
    } catch (e) {
      // 네트워크 일시 오류는 무시 (다음 tick 에서 재시도)
      console.warn('[sarRlCollab] polling tick failed:', e.message);
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  }

  tick();

  return function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/**
 * 기존 icebergs list 에 SAR 빙하를 병합 (중복 제거 없이 단순 concat).
 * 시각화 용도라 중복 제거는 필요 없음. RL 회피 로직은 거리 기반으로 자체 처리.
 *
 * @param {Array} existingBergs - api.js fetchIcebergs() 결과의 bergs
 * @param {Array} sarBergs      - fetchSarIcebergs() 결과의 bergs
 * @returns {Array}
 */
export function mergeIcebergLists(existingBergs = [], sarBergs = []) {
  return [...existingBergs, ...sarBergs];
}
