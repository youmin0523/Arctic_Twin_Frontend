// ═══════════════════════════════════════════════════════════════
// API Service — calls the Node.js backend
// ═══════════════════════════════════════════════════════════════

const API_BASE = '/api';

/**
 * Fetch sea-ice concentration grid data for a given month.
 * @param {string} month - Month identifier or 'latest'
 * @returns {Promise<Object>} Ice concentration data
 */
export async function fetchIceConcentration(month = 'latest', hemisphere = 'north') {
  const h = hemisphere === 'south' ? '&hemisphere=south' : '';
  const res = await fetch(`${API_BASE}/ice/concentration?month=${encodeURIComponent(month)}${h}`);
  if (!res.ok) throw new Error(`fetchIceConcentration failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Fetch sea-ice thickness grid data for a given month.
 * @param {string} month - Month identifier or 'latest'
 * @returns {Promise<Object>} Ice thickness data
 */
export async function fetchIceThickness(month = 'latest') {
  const res = await fetch(`${API_BASE}/ice/thickness?month=${encodeURIComponent(month)}`);
  if (!res.ok) throw new Error(`fetchIceThickness failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Fetch iceberg positions.
 * @param {string} month - 'latest'(live), 'YYYY-MM-DD'(일자별 아카이브),
 *   또는 'month-06'(월별 IIP 레퍼런스).
 *   날짜/월 지정 시 해당 시점 실측 빙산을 반환하며, 스냅샷이 없으면 백엔드가
 *   latest로 폴백한다. 과거(date/month) 요청은 현재 시점 Copernicus SAR를 제외.
 * @returns {Promise<Object>} Iceberg data
 */
export async function fetchIcebergs(month = 'latest', hemisphere = 'north') {
  const params = new URLSearchParams();
  if (/^\d{4}-\d{2}-\d{2}$/.test(month)) params.set('date', month);
  else if (/^(?:month-)?\d{2}$/.test(month)) params.set('month', month);
  if (hemisphere === 'south') params.set('hemisphere', 'south');
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/icebergs/latest${q}`);
  if (!res.ok) throw new Error(`fetchIcebergs failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Submit a route + vessel configuration for server-side POLARIS evaluation.
 * @param {Object} route  - Route waypoints or route key
 * @param {Object} vessel - Vessel parameters (iceClass, draft, beam, etc.)
 * @param {string} month  - Month for ice conditions
 * @returns {Promise<Object>} Evaluation result { status, reason, rioScore }
 */
export async function evaluateRoute(route, vessel, month) {
  const res = await fetch(`${API_BASE}/route/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route, vessel, month }),
  });
  if (!res.ok) throw new Error(`evaluateRoute failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Fetch real-time NSR weather data (파고·기온·가시거리·바람).
 * Populated by weather_fetcher.py via Open-Meteo (Marine + Forecast) + Copernicus fallback.
 * @returns {Promise<Object>} Weather data, shape:
 *   { fetched_at, source, routes: { [KEY]: { waypoints: [{
 *       lat, lon, name, wave_height_m, wave_direction_deg, wave_period_s,
 *       temperature_c, visibility_km, sst_c,
 *       wind_speed_ms, wind_direction_deg, wind_gust_ms
 *     }], route_summary } }, route_summary }
 */
export async function fetchWeather() {
  const res = await fetch(`${API_BASE}/weather/latest`);
  if (!res.ok) throw new Error(`fetchWeather failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Trigger the data-ingestion pipeline on the backend.
 * @param {string} task - Pipeline task name ('all', 'ice', 'icebergs', 'weather', etc.)
 * @returns {Promise<Object>} Pipeline status response
 */
export async function triggerPipeline(task = 'all') {
  const res = await fetch(`${API_BASE}/pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task }),
  });
  if (!res.ok) throw new Error(`triggerPipeline failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * ML 연료 예측 서비스 헬스 체크.
 * @returns {Promise<Object>} { status, model_loaded, metrics }
 */
export async function fetchFuelHealth() {
  const res = await fetch(`${API_BASE}/fuel/health`);
  if (!res.ok) throw new Error(`fetchFuelHealth failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * 북극항로 vs 수에즈 운하 경제성 비교 (ML 연료 예측 기반).
 * @param {Object} params - 비교 요청 파라미터
 * @param {number} params.displacement - 배수량 (tons)
 * @param {number} params.draft - 흘수 (m)
 * @param {number} params.engine_power - 엔진 출력 (kW)
 * @param {number} params.ice_class_code - 내빙등급 코드 (0, 2, 4)
 * @param {number} params.nsr_ice_thickness - NSR 평균 빙하 두께 (m)
 * @param {number} params.nsr_ice_concentration - NSR 평균 빙하 농도 (0~1)
 * @param {number} params.nsr_distance_nm - NSR 총 거리 (nm)
 * @param {number} params.suez_distance_nm - 수에즈 총 거리 (nm)
 * @param {string} params.vessel_type - 선종 (container, lng, icebreaker)
 * @param {number} params.speed_knots - 운항 속도 (knots)
 * @returns {Promise<Object>} 비교 결과 { nsr, suez, comparison }
 */
export async function compareFuelCost(params, signal) {
  const res = await fetch(`${API_BASE}/fuel/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal,
  });
  if (!res.ok) throw new Error(`compareFuelCost failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * 북극항로 전용 AI 챗봇 — SSE 스트리밍.
 * POST /api/report/chat/stream 으로 메시지를 보내고, 응답을 토큰/도구/잡 이벤트로 콜백한다.
 * (POST + SSE 이므로 EventSource 대신 fetch + ReadableStream 으로 직접 파싱)
 *
 * @param {Object}   opts
 * @param {string}   opts.sessionId           - 대화 세션 ID
 * @param {string}   opts.message             - 사용자 메시지
 * @param {Object}   [opts.shipSpec]          - 현재 UI 선박 제원(기본값 힌트)
 * @param {Function} [opts.onToken]           - (text) 답변 토큰 도착
 * @param {Function} [opts.onTool]            - ({name, status}) 도구 호출 상태
 * @param {Function} [opts.onJob]             - ({kind, job_id}) 백그라운드 작업 시작
 * @param {Function} [opts.onError]           - (detail) 오류
 * @param {AbortSignal} [opts.signal]         - 취소 신호
 * @returns {Promise<void>} 스트림 종료 시 resolve
 */
export async function streamChat({ sessionId, message, shipSpec, onToken, onTool, onJob, onError, signal }) {
  const res = await fetch(`${API_BASE}/report/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, message, ship_spec: shipSpec || null }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`streamChat failed: ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handle = (evt) => {
    if (!evt || !evt.type) return;
    switch (evt.type) {
      case 'token': onToken?.(evt.text || ''); break;
      case 'tool':  onTool?.({ name: evt.name, status: evt.status }); break;
      case 'job':   onJob?.({ kind: evt.kind, job_id: evt.job_id }); break;
      case 'error': onError?.(evt.detail || 'unknown error'); break;
      case 'done':  break;
      default: break;
    }
  };

  // SSE 프레임: "data: {...}\n\n" 단위로 분할
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of frame.split('\n')) {
        const trimmed = line.startsWith('data:') ? line.slice(5).trim() : '';
        if (!trimmed) continue;
        try { handle(JSON.parse(trimmed)); } catch { /* 부분 프레임 무시 */ }
      }
    }
  }
}

/**
 * 챗봇 대화 세션 초기화.
 * @param {string} sessionId
 */
export async function resetChat(sessionId) {
  const res = await fetch(`${API_BASE}/report/chat/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`resetChat failed: ${res.status} ${res.statusText}`);
  return res.json();
}

