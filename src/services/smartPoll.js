/**
 * smartPoll.js
 * ============
 * 트래픽 절약형 폴러. setInterval 의 "탭이 백그라운드여도, 서버가 죽어도
 * 같은 주기로 계속 때리는" 문제를 막는다.
 *
 *  - 탭 비활성(document.hidden) 동안에는 네트워크 호출을 건너뛰고, 다시
 *    보이는 순간 즉시 1회 폴링 후 재개한다. (Vercel DDoS 완화 오탐 방지)
 *  - fn 이 throw 하거나 false 를 반환하면 "실패"로 보고 주기를 2배씩 늘려
 *    최대 maxIntervalMs 까지 백오프 → 502 폭주 시 재시도 폭주를 막는다.
 *  - 성공하면 주기를 기본값으로 즉시 복구한다.
 *
 * fn: () => any | Promise<any>   // false 반환 시 실패로 간주(백오프 트리거)
 * 반환값: stop() — 폴링 중지 + visibilitychange 리스너 해제.
 */
export function smartPoll(fn, { intervalMs, maxIntervalMs = 60000, immediate = true } = {}) {
  let stopped = false;
  let timer = null;
  let curDelay = intervalMs;
  const hasDoc = typeof document !== 'undefined';

  function schedule(ms) {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  }

  async function run() {
    if (stopped) return;
    // 백그라운드 탭: 호출 생략, 가시화되면 visibilitychange 가 즉시 깨운다.
    if (hasDoc && document.hidden) {
      schedule(intervalMs);
      return;
    }
    let ok = true;
    try {
      const res = await fn();
      if (res === false) ok = false;
    } catch {
      ok = false;
    }
    curDelay = ok ? intervalMs : Math.min(curDelay * 2, maxIntervalMs);
    schedule(curDelay);
  }

  function onVisible() {
    if (!stopped && hasDoc && !document.hidden) {
      curDelay = intervalMs; // 복귀 시 백오프 초기화 후 즉시 1회
      schedule(0);
    }
  }
  if (hasDoc) document.addEventListener('visibilitychange', onVisible);

  if (immediate) run();
  else schedule(intervalMs);

  return function stop() {
    stopped = true;
    clearTimeout(timer);
    if (hasDoc) document.removeEventListener('visibilitychange', onVisible);
  };
}
