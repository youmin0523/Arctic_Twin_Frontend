// ═══════════════════════════════════════════════════════════════
// Vessel (Ship) Presets and Base Constants
// Extracted from arctic-hybrid.html lines 2572-2597
// ═══════════════════════════════════════════════════════════════

// 데모 시나리오 4종에 맞춘 프리셋.
//  · container → 시나리오 1: 파나막스 내빙 컨테이너선(~4,000 TEU) — NSR 통과
//  · lng       → 시나리오 2: 야말막스 쇄빙 LNG선(174,000 CBM, Arc7) — NSR 통과
//  · bulk      → 시나리오 4: 케이프사이즈 대형 벌크선 — 흘수 18.2m로 NSR 부적합(수에즈 우회)
//  시나리오 3(아프라막스 탱커)은 전용 프리셋이 없어 수동 입력(흘수 12.5m, 선폭 44m, Arc5).
export const SHIP_PRESETS = {
  bulk: {
    type: 'bulk',
    disp: 180000,
    len: 290,
    width: 47,
    gm: 3.8,
    iceClass: 'NONE',
    draft: 18.2, // 12.5m 수심 제한 초과 → Step 2a 흘수 게이트에서 수에즈 우회(시나리오 4)
  },
  lng: { type: 'lng', disp: 96000, len: 299, width: 50, gm: 5.1, iceClass: 'Arc7', draft: 12.0 },
  container: {
    type: 'container',
    disp: 52000,
    len: 232,
    width: 32.3, // 파나막스 최대 선폭
    gm: 2.5,
    iceClass: 'Arc4',
    draft: 11.5,
  },
};

export const BASE_DISP = 20000;
export const BASE_LEN = 160;
export const BASE_WIDTH = 28;
export const BASE_GM = 3.2;
export const BASE_OMEGA_R = 0.176;
export const BASE_OMEGA_P = 0.21;
