// ═══════════════════════════════════════════════════════════════
// Port Database — 출발/도착 항구 정보
// ═══════════════════════════════════════════════════════════════

export const PORTS = {
  BUSAN:       { id: 'BUSAN',       lon: 129.04, lat: 35.10, name: '부산',          nameEn: 'Busan' },
  INCHEON:     { id: 'INCHEON',     lon: 126.62, lat: 37.45, name: '인천',          nameEn: 'Incheon' },
  SHANGHAI:    { id: 'SHANGHAI',    lon: 121.47, lat: 31.23, name: '상하이',        nameEn: 'Shanghai' },
  TOKYO:       { id: 'TOKYO',       lon: 139.77, lat: 35.45, name: '도쿄',          nameEn: 'Tokyo' },
  VLADIVOSTOK: { id: 'VLADIVOSTOK', lon: 131.90, lat: 43.12, name: '블라디보스토크', nameEn: 'Vladivostok' },
  ROTTERDAM:   { id: 'ROTTERDAM',   lon: 4.50,   lat: 51.90, name: '로테르담',      nameEn: 'Rotterdam' },
  HAMBURG:     { id: 'HAMBURG',     lon: 9.97,   lat: 53.54, name: '함부르크',      nameEn: 'Hamburg' },
  LONDON:      { id: 'LONDON',      lon: 0.05,   lat: 51.50, name: '런던',          nameEn: 'London' },
  MURMANSK:    { id: 'MURMANSK',    lon: 33.07,  lat: 68.97, name: '무르만스크',    nameEn: 'Murmansk' },

  // ── 남반구(남극) 관문항 — 남극 보급·연구 항해 게이트웨이 ──────────────────
  //   북극항로의 부산/로테르담에 대응하는 남극 항해의 출발 거점.
  LYTTELTON:   { id: 'LYTTELTON',   lon: 172.72, lat: -43.60, name: '리틀턴',        nameEn: 'Lyttelton',     hemi: 'S' },
  PUNTA_ARENAS:{ id: 'PUNTA_ARENAS',lon: -70.92, lat: -53.16, name: '푼타아레나스',  nameEn: 'Punta Arenas',  hemi: 'S' },
  HOBART:      { id: 'HOBART',      lon: 147.33, lat: -42.88, name: '호바트',        nameEn: 'Hobart',        hemi: 'S' },
  CAPETOWN:    { id: 'CAPETOWN',    lon: 18.42,  lat: -33.90, name: '케이프타운',    nameEn: 'Cape Town',     hemi: 'S' },

  // ── 남극 연구기지 (도착 목적지) ───────────────────────────────────────────
  //   한국 극지연구소(KOPRI) 운영 2개 상주기지 — 아라온 실제 보급 대상.
  JANGBOGO:    { id: 'JANGBOGO',    lon: 164.23, lat: -74.62, name: '장보고기지',    nameEn: 'Jang Bogo Stn', hemi: 'S' },
  SEJONG:      { id: 'SEJONG',      lon: -58.78, lat: -62.22, name: '세종기지',      nameEn: 'King Sejong Stn', hemi: 'S' },
};

export const DEPARTURE_PORTS = ['BUSAN', 'INCHEON', 'SHANGHAI', 'TOKYO', 'VLADIVOSTOK', 'LYTTELTON', 'PUNTA_ARENAS', 'HOBART', 'CAPETOWN'];
export const ARRIVAL_PORTS   = ['ROTTERDAM', 'HAMBURG', 'LONDON', 'MURMANSK', 'JANGBOGO', 'SEJONG'];
export const ALL_PORTS       = Object.keys(PORTS);

// 남반구 항/기지 여부 — 미니맵 극투영·계절 판정 등에서 사용.
export function isSouthernPort(portId) {
  const p = PORTS[portId];
  return !!p && (p.hemi === 'S' || p.lat < 0);
}
