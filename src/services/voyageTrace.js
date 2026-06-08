/**
 * voyageTrace.js
 * ==============
 * 백엔드 simulate_voyage JSON(backend/data/simulations/*.json)을 로드·파싱해
 * 임의 시각 t(hours) 에 대한 선형 보간을 제공.
 *
 * 트레이스 포맷:
 *   {
 *     metadata: { route, ship, month, dt_hours, total_ticks, duration_hours },
 *     ticks: [{ t, ship:{position,rio,thickness_m,effective_thickness_m},
 *               icebreakers:[{id,position,status,escorting_ship_id}], events:[] }],
 *     summary: { icebreaker_calls, intercept_failed, total_escort_distance_km,
 *                max_rio_violation, completed, total_route_km }
 *   }
 */

// Voyage trace 가 존재하는 북극 항로. 그 외(SUEZ/CAPE/ETC)는 NSR 로 폴백.
export const VOYAGE_ROUTES = ['NSR', 'NWP', 'TSR'];
export function voyageRouteKey(routeKey) {
  return VOYAGE_ROUTES.includes(routeKey) ? routeKey : 'NSR';
}

export async function loadTrace(route, iceClass, month = 3) {
  const rk = voyageRouteKey(route).toLowerCase();
  const cls = iceClass.toLowerCase();
  const mm = String(month).padStart(2, '0');
  const url = `/simulations/${rk}_month${mm}_${cls}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[VoyageTrace] fetch failed: ${url} (${res.status})`);
  }
  const trace = await res.json();
  const totalEvents = trace.ticks.reduce(
    (acc, tk) => acc + (tk.events ? tk.events.length : 0),
    0,
  );
  // eslint-disable-next-line no-console
  console.log(
    `[VoyageTrace] loaded ${url.split('/').pop()}: ${trace.ticks.length} ticks, ${totalEvents} events`,
  );
  return trace;
}

/**
 * 본선/쇄빙선 position 을 이진탐색 + 선형 보간으로 산출.
 * ticks 는 t 오름차순이라 가정 (백엔드 보장).
 */
export function interpolateAt(trace, tHours) {
  const ticks = trace.ticks;
  if (!ticks || ticks.length === 0) return null;
  const first = ticks[0];
  const last = ticks[ticks.length - 1];
  if (tHours <= first.t) return { a: first, b: first, frac: 0 };
  if (tHours >= last.t) return { a: last, b: last, frac: 0 };

  // 이진 탐색
  let lo = 0;
  let hi = ticks.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (ticks[mid].t <= tHours) lo = mid;
    else hi = mid;
  }
  const a = ticks[lo];
  const b = ticks[hi];
  const span = b.t - a.t;
  const frac = span > 0 ? (tHours - a.t) / span : 0;
  return { a, b, frac };
}

function lerp(a, b, f) {
  return a + (b - a) * f;
}

export function lerpPosition(pa, pb, f) {
  // 경도차를 [-180,180]로 wrap → 날짜변경선(180°) 부근에서 단순 선형 보간이
  // 358° 를 반대로 휘감아 지구 반바퀴를 도는(=화면에서 '튀는') 버그 방지.
  // NSR 베링해 통과 본선/쇄빙선이 모두 180° 를 지난다.
  let dLon = pb.lon - pa.lon;
  if (dLon > 180) dLon -= 360;
  else if (dLon < -180) dLon += 360;
  let lon = pa.lon + dLon * f;
  if (lon > 180) lon -= 360;
  else if (lon < -180) lon += 360;
  return {
    lat: lerp(pa.lat, pb.lat, f),
    lon,
  };
}

// 두 좌표 간 근사 거리(km) — 날짜변경선 wrap 반영. 텔레포트(데이터 리셋) 판정용.
function approxKm(pa, pb) {
  let dLon = pb.lon - pa.lon;
  if (dLon > 180) dLon -= 360;
  else if (dLon < -180) dLon += 360;
  const meanLat = (((pa.lat + pb.lat) / 2) * Math.PI) / 180;
  const x = dLon * 111.32 * Math.cos(meanLat);
  const y = (pb.lat - pa.lat) * 110.57;
  return Math.hypot(x, y);
}

/**
 * 현재 시각의 본선 상태 보간.
 */
export function sampleShipAt(trace, tHours) {
  const win = interpolateAt(trace, tHours);
  if (!win) return null;
  const { a, b, frac } = win;
  return {
    position: lerpPosition(a.ship.position, b.ship.position, frac),
    rio: lerp(a.ship.rio, b.ship.rio, frac),
    thickness_m: lerp(a.ship.thickness_m, b.ship.thickness_m, frac),
    effective_thickness_m: lerp(
      a.ship.effective_thickness_m,
      b.ship.effective_thickness_m,
      frac,
    ),
    km_along_route: lerp(
      a.ship.km_along_route || 0,
      b.ship.km_along_route || 0,
      frac,
    ),
  };
}

/**
 * 현재 시각의 쇄빙선 상태 보간(trace 의 icebreakers 배열 전체 — 현재 항로당 1척).
 * status 는 보간하지 않고 a tick 의 값 사용 (이산 상태).
 */
export function sampleIcebreakersAt(trace, tHours) {
  const win = interpolateAt(trace, tHours);
  if (!win) return [];
  const { a, b, frac } = win;
  const out = [];
  for (let i = 0; i < a.icebreakers.length; i += 1) {
    const ia = a.icebreakers[i];
    const ib = b.icebreakers[i];
    // 호위 종료 후 trace 가 쇄빙선을 모항으로 즉시 리셋(원격 점프)하는 구간이 있다.
    // 이를 선형 보간하면 화면에서 쇄빙선이 멀리 '튀어' 보이므로, 1틱(=1h)에
    // 비현실적 거리(>50km)면 보간하지 않고 가까운 끝점으로 스냅한다.
    // (실제 항행 이동은 ~30km/h 수준이라 정상 이동은 그대로 보간됨)
    const jumpKm = approxKm(ia.position, ib.position);
    const position =
      jumpKm > 50
        ? (frac < 0.5 ? ia.position : ib.position)
        : lerpPosition(ia.position, ib.position, frac);
    out.push({
      id: ia.id,
      status: ia.status,
      escorting_ship_id: ia.escorting_ship_id,
      position,
    });
  }
  return out;
}

/**
 * [prevT, currT] 구간에 발생한 이벤트 목록 반환.
 * tick 경계의 이벤트는 tick.t 시점에 한 번 dispatch.
 */
export function eventsBetween(trace, prevT, currT) {
  if (currT <= prevT) return [];
  const out = [];
  for (const tk of trace.ticks) {
    if (tk.t > prevT && tk.t <= currT) {
      for (const ev of tk.events || []) {
        out.push({ ...ev, t: tk.t });
      }
    }
  }
  return out;
}

/**
 * 현재 시각이 RL 빙산 회피 윈도우 안인지 판정.
 * metadata.rl_avoidance.segments(최종 route km 좌표) 기준으로, 현재 본선의
 * km_along_route 가 어느 회피 구간에 속하는지 본다. 이벤트(rl_avoid_start/end)에
 * 의존하지 않으므로 seek 로 윈도우 중간에 진입해도 정확히 동작한다.
 *
 * @returns {{start_km,end_km,confidence,berg_count}|null} 활성 회피 세그먼트 또는 null
 */
export function avoidanceSegmentAt(trace, tHours) {
  const segs = trace?.metadata?.rl_avoidance?.segments;
  if (!Array.isArray(segs) || segs.length === 0) return null;
  const ship = sampleShipAt(trace, tHours);
  if (!ship) return null;
  const km = ship.km_along_route || 0;
  for (const s of segs) {
    if (km >= s.start_km && km <= s.end_km) return s;
  }
  return null;
}

/**
 * 쇄빙선 id → name_ko 매핑.
 * 항로별 호위 자산 (백엔드 FLEET_BY_ROUTE 와 동기화 유지 필수):
 *   NSR → 아라온(ib-araon) / NWP → CCGS(ib-ccgs) / TSR → 원자력(ib-rosatom)
 */
export const ICEBREAKER_META = {
  'ib-araon': { name_ko: '아라온', home_port: 'Wrangel Is. (사전배치)' },
  'ib-ccgs': { name_ko: 'CCGS 쇄빙선', home_port: 'Resolute Passage (사전배치)' },
  'ib-rosatom': { name_ko: '원자력 쇄빙선', home_port: 'Longyearbyen (사전배치)' },
};
