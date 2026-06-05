// ═══════════════════════════════════════════════════════════════
// Arctic Route Waypoint Data
// Extracted from arctic-hybrid.html lines 1531-1788
// ═══════════════════════════════════════════════════════════════

export const ROUTES = {
  NSR: [
    // 북동항로 — 한국 → 소야 해협
    { lon: 129.04, lat: 35.105, label: '부산항' },
    // 부산 북항은 영도·반도에 둘러싸여 직선 출항 시 육지를 관통.
    // 10m 해안선 수역도 기반: 외항(SE) → 오륙도 남방 → 개방해역 남하 후 동해 진입.
    { lon: 129.075, lat: 35.10, label: '부산항 외항' },
    { lon: 129.13,  lat: 35.05, label: '오륙도 남방 외해' },
    { lon: 129.25,  lat: 34.85, label: '부산 남방 외해' },
    { lon: 130.10,  lat: 35.25, label: '동해 남부 진입' },
    { lon: 130.8,   lat: 35.8,  label: '대한해협 우회' },
    { lon: 132.5, lat: 37.5, label: '동해 중앙' },
    { lon: 138.0, lat: 43.0, label: '홋카이도 서해안' },
    { lon: 140.5, lat: 44.5, label: '소야 해협 접근' },
    { lon: 141.2, lat: 45.4, label: '소야 해협' },
    { lon: 141.93, lat: 45.65, label: '소야 해협 통과' },
    // 사할린 남단 우회 — 케이프 크릴론(46°N) 남방에서 동방으로 우회 후 오호츠크해 진입
    { lon: 144.0, lat: 46.0, label: '소야 동방 외해' },
    { lon: 145.5, lat: 47.0, label: '오호츠크해' },
    { lon: 148.0, lat: 48.0, label: '부솔 해협 접근' },
    { lon: 151.3, lat: 46.5, label: '부솔 해협 (쿠릴 패주)' },
    // 캄차카 반도 우회 — 반도 동쪽 충분한 이격(165-167°E) 확보
    { lon: 154.0, lat: 46.0, label: '북태평양 진입' },
    { lon: 160.0, lat: 48.5, label: '캄차카 반도 남방 외해' },
    { lon: 163.5, lat: 51.5, label: '캄차카 동해안 남부' },
    { lon: 165.0, lat: 53.5, label: '캄차카 동해안 중부' },
    { lon: 166.0, lat: 56.0, label: '캄차카 동해안 북부' },
    { lon: 167.0, lat: 58.5, label: '베링해 진입' },
    // 베링해 → 베링해협
    { lon: 170.0, lat: 60.0, label: '베링해 중부' },
    { lon: 175.0, lat: 63.0, label: '아나디르 만' },
    { lon: 180.0, lat: 64.5, label: '날짜변경선' },
    { lon: -175.0, lat: 65.0, label: '베링해협 접근' },
    { lon: -170.0, lat: 65.5, label: '베링해협 서측' },
    { lon: -168.8, lat: 66.5, label: '베링해협 통과' },
    { lon: -168.0, lat: 67.5, label: '척치해 진입' },
    // 브랑겔 섬 북방 우회 — 날짜변경선(180°) 정점에서 북방 통과
    { lon: -175.0, lat: 70.5, label: '척치해 외곽 북상' },
    { lon:  180.0, lat: 72.5, label: '브랑겔 섬 북방 통과' },
    { lon:  175.0, lat: 73.0, label: '동시베리아해 진입' },
    // 동시베리아해 → 뉴시베리아 제도 — 산니코프·드미트리 랍테프 해협 경유
    { lon: 168.0, lat: 73.0, label: '동시베리아해 서진' },
    { lon: 160.0, lat: 73.5, label: '동시베리아해 중부' },
    { lon: 153.0, lat: 73.5, label: '뉴시베리아 제도 동방 외해' },
    { lon: 148.5, lat: 73.5, label: '산니코프 해협 진입' },
    { lon: 145.0, lat: 73.8, label: '산니코프 해협 통과' },
    { lon: 142.0, lat: 74.0, label: '드미트리 랍테프 해협' },
    { lon: 140.0, lat: 74.5, label: '랍테프해 진입' },
    // 랍테프해 서부 → 빌키츠키 해협 → 카라해 → 바렌츠해 → 로테르담
    { lon: 130.0, lat: 77.5, label: '랍테프해 서부' },
    { lon: 115.0, lat: 77.5, label: '타이미르 반도 우회' },
    { lon: 110.0, lat: 77.8, label: '빌키츠키 접근' },
    { lon: 104.0, lat: 77.92, label: '빌키츠키 통과' },
    { lon: 98.0, lat: 77.5, label: '카라해 진입' },
    { lon: 80.0, lat: 77.0, label: '카라해 중앙' },
    { lon: 69.0, lat: 77.5, label: '노바야젬랴 섬 우회' },
    { lon: 60.0, lat: 76.0, label: '바렌츠해 동부' },
    { lon: 45.0, lat: 73.0, label: '바렌츠해 중앙' },
    { lon: 32.0, lat: 73.5, label: '바렌츠해 서부' },
    { lon: 20.0, lat: 73.0, label: '노스케이프 북방 외해' },
    { lon: 14.0, lat: 72.0, label: '노르웨이해 북부' },
    { lon: 6.0, lat: 69.0, label: '노르웨이해 중부' },
    { lon: 2.0, lat: 64.0, label: '노르웨이해 남부' },
    { lon: 1.0, lat: 60.0, label: '북해 입구' },
    { lon: 4.5, lat: 57.0, label: '북해 중부' },
    { lon: 4.5, lat: 51.9, label: '로테르담' },
  ],
  NWP: [
    // 북서항로 — 한국 → 소야 해협
    { lon: 129.04, lat: 35.105, label: '부산항' },
    // 부산 북항은 영도·반도에 둘러싸여 직선 출항 시 육지를 관통.
    // 10m 해안선 수역도 기반: 외항(SE) → 오륙도 남방 → 개방해역 남하 후 동해 진입.
    { lon: 129.075, lat: 35.10, label: '부산항 외항' },
    { lon: 129.13,  lat: 35.05, label: '오륙도 남방 외해' },
    { lon: 129.25,  lat: 34.85, label: '부산 남방 외해' },
    { lon: 130.10,  lat: 35.25, label: '동해 남부 진입' },
    { lon: 130.8,   lat: 35.8,  label: '대한해협 우회' },
    { lon: 138.0, lat: 43.0, label: '홋카이도 외곽' },
    { lon: 141.93, lat: 45.65, label: '소야 해협' },
    // 사할린 남단 우회
    { lon: 144.0, lat: 46.0, label: '소야 동방 외해' },
    { lon: 145.5, lat: 47.0, label: '오호츠크해' },
    { lon: 148.0, lat: 48.0, label: '부솔 해협 접근' },
    { lon: 151.3, lat: 46.5, label: '부솔 해협' },
    // 캄차카 반도 우회 — 반도 동쪽 충분한 이격(165-167°E) 확보
    { lon: 154.0, lat: 46.0, label: '북태평양 진입' },
    { lon: 160.0, lat: 48.5, label: '캄차카 반도 남방 외해' },
    { lon: 163.5, lat: 51.5, label: '캄차카 동해안 남부' },
    { lon: 165.0, lat: 53.5, label: '캄차카 동해안 중부' },
    { lon: 166.0, lat: 56.0, label: '캄차카 동해안 북부' },
    { lon: 167.0, lat: 58.5, label: '베링해 진입' },
    // 베링해 → 베링해협 → 보퍼트해
    { lon: 173.0, lat: 61.5, label: '베링해 중부 북상' },
    { lon: 180.0, lat: 64.5, label: '날짜변경선' },
    { lon: -173.0, lat: 65.0, label: '베링해 동부' },
    { lon: -170.0, lat: 65.5, label: '베링해협 서측' },
    { lon: -168.8, lat: 66.5, label: '베링해협 통과' },
    { lon: -165.0, lat: 69.0, label: '척치-보퍼트' },
    { lon: -156.0, lat: 71.8, label: '포인트배로 우회' },
    { lon: -140.0, lat: 72.0, label: '보퍼트해 연안 우회' },
    { lon: -130.0, lat: 73.5, label: '보퍼트해 북상' },
    // 캐나다 북극 제도 — 맥클루어→바이카운트멜빌→배로우→랭커스터 해협 정밀 경유
    { lon: -124.5, lat: 74.0, label: '뱅크스 섬 북방 진입' },
    { lon: -119.0, lat: 74.8, label: '맥클루어 해협 서부' },
    { lon: -115.5, lat: 75.0, label: '맥클루어 해협 중앙' },
    { lon: -112.0, lat: 74.8, label: '맥클루어 해협 동부' },
    { lon: -109.5, lat: 74.7, label: '바이카운트멜빌 해협 서부' },
    { lon: -106.0, lat: 74.6, label: '바이카운트멜빌 해협 중앙' },
    { lon: -102.5, lat: 74.5, label: '바이카운트멜빌 해협 동부' },
    { lon: -97.0, lat: 74.0, label: '배로우 해협 서부' },
    { lon: -93.5, lat: 74.0, label: '배로우 해협 중앙' },
    { lon: -87.0, lat: 74.0, label: '랭커스터 해협 서부' },
    { lon: -84.0, lat: 74.0, label: '랭커스터 해협 중앙' },
    // 바일럿 섬 남방 우회 → 배핀 만
    { lon: -80.5, lat: 73.3, label: '배핀 만 입구' },
    { lon: -75.0, lat: 72.5, label: '배핀 만 서부' },
    { lon: -65.0, lat: 70.0, label: '배핀 만 내해' },
    // 데이비스 해협 → 로테르담
    { lon: -60.0, lat: 65.0, label: '데이비스 해협' },
    { lon: -50.0, lat: 60.0, label: '래브라도 해' },
    { lon: -30.0, lat: 55.0, label: '대서양 중앙' },
    { lon: -10.0, lat: 50.0, label: '영국 해협 서측' },
    { lon: 0.0, lat: 51.0, label: '도버 해협' },
    { lon: 4.5, lat: 51.9, label: '로테르담' },
  ],
  TSR: [
    // 북극횡단항로 — 한국 → 소야 해협
    { lon: 129.04, lat: 35.105, label: '부산항' },
    // 부산 북항은 영도·반도에 둘러싸여 직선 출항 시 육지를 관통.
    // 10m 해안선 수역도 기반: 외항(SE) → 오륙도 남방 → 개방해역 남하 후 동해 진입.
    { lon: 129.075, lat: 35.10, label: '부산항 외항' },
    { lon: 129.13,  lat: 35.05, label: '오륙도 남방 외해' },
    { lon: 129.25,  lat: 34.85, label: '부산 남방 외해' },
    { lon: 130.10,  lat: 35.25, label: '동해 남부 진입' },
    { lon: 130.8,   lat: 35.8,  label: '대한해협 우회' },
    { lon: 141.93, lat: 45.65, label: '소야 해협 통과' },
    { lon: 144.0, lat: 46.0, label: '소야 동방 외해' },
    { lon: 145.5, lat: 47.0, label: '오호츠크해' },
    { lon: 148.0, lat: 48.0, label: '부솔 해협 접근' },
    { lon: 151.3, lat: 46.5, label: '부솔 해협' },
    // 캄차카 반도 우회 — 반도 동쪽 충분한 이격(165-167°E) 확보
    { lon: 154.0, lat: 46.0, label: '북태평양 진입' },
    { lon: 160.0, lat: 48.5, label: '캄차카 반도 남방 외해' },
    { lon: 163.5, lat: 51.5, label: '캄차카 동해안 남부' },
    { lon: 165.0, lat: 53.5, label: '캄차카 동해안 중부' },
    { lon: 166.0, lat: 56.0, label: '캄차카 동해안 북부' },
    { lon: 167.0, lat: 58.5, label: '베링해 진입' },
    // 베링해 → 척치해 → 북극 횡단 → 스발바르 → 로테르담
    { lon: 173.0, lat: 61.5, label: '베링해 중부 북상' },
    { lon: 180.0, lat: 64.5, label: '날짜변경선' },
    { lon: -173.0, lat: 65.0, label: '베링해 동부' },
    { lon: -170.0, lat: 65.5, label: '베링해협 서측' },
    { lon: -168.8, lat: 66.5, label: '베링해협 통과' },
    { lon: -168.0, lat: 70.0, label: '척치해 북방' },
    { lon: -160.0, lat: 75.0, label: '북극해 북진' },
    { lon: -120.0, lat: 82.0, label: '북극해 중앙부' },
    { lon:  -60.0, lat: 85.0, label: '북극해 최고위도' },
    { lon:  -10.0, lat: 83.0, label: '북극해 대서양측' },
    { lon:   10.0, lat: 80.0, label: '스발바르 북방' },
    { lon: 10.0, lat: 70.0, label: '노르웨이해' },
    { lon: 5.0, lat: 62.0, label: '북해' },
    { lon: 4.5, lat: 51.9, label: '로테르담' },
  ],

  // ─── 수에즈 운하 우회항로 ──────────────────────────────────────────
  // 부산 → 말라카 해협 → 인도양 → 홍해 → 수에즈 운하 → 지중해 → 로테르담
  // 총 거리: 약 21,000km / 소요: 21~24일 (기준 항속 15노트)
  // 좌표는 0.05° 전역 육지마스크로 전 구간 검증(해상관통 0). 좁은 통항해협·운하
  // (싱가포르·바브엘만데브·수에즈만/운하·지브롤터·도버)는 navigableCorridors.json 으로 면제.
  SUEZ: [
    { lon: 129.04, lat: 35.10, label: '부산항 출항' },
    { lon: 128.30, lat: 34.20, label: '대한해협' },
    { lon: 126.00, lat: 32.60, label: '제주도 남서방 통과' },
    { lon: 123.50, lat: 29.50, label: '동중국해' },
    { lon: 122.00, lat: 27.00, label: '동중국해 남부' },
    { lon: 120.20, lat: 25.20, label: '대만 해협 북단' },
    { lon: 118.80, lat: 23.00, label: '대만 해협 남단' },
    { lon: 118.50, lat: 20.50, label: '루손 해협 서측 외해' },
    { lon: 114.00, lat: 16.00, label: '남중국해 북부' },
    { lon: 110.00, lat: 10.50, label: '남중국해 중부' },
    { lon: 106.50, lat: 5.50, label: '남중국해 남부' },
    { lon: 105.00, lat: 2.80, label: '말레이 반도 동남 외해' },
    { lon: 104.30, lat: 1.40, label: '싱가포르 해협 동측 진입' },
    { lon: 103.50, lat: 1.18, label: '싱가포르 해협 통과' },
    // 말라카 해협 — 수마트라-말레이 수로 중심선
    { lon: 102.37, lat: 1.70, label: '말라카 해협 남부' },
    { lon: 101.65, lat: 2.20, label: '말라카 해협 남중부' },
    { lon: 100.60, lat: 3.00, label: '말라카 해협 중부' },
    { lon: 99.65, lat: 4.00, label: '말라카 해협 중앙' },
    { lon: 96.50, lat: 6.20, label: '말라카 해협 북부 (안다만 해 진입)' },
    { lon: 93.00, lat: 6.50, label: '안다만 해 서부' },
    // 인도양 북상 → 아라비아해
    { lon: 88.00, lat: 5.50, label: '벵골만 남단' },
    { lon: 80.50, lat: 5.20, label: '스리랑카 남방 외해' },
    { lon: 76.00, lat: 6.00, label: '인도 남단 외해' },
    { lon: 72.00, lat: 9.50, label: '아라비아해 동부' },
    { lon: 66.00, lat: 12.00, label: '아라비아해 중앙' },
    { lon: 60.00, lat: 13.00, label: '아라비아해 서부' },
    { lon: 53.00, lat: 13.30, label: '소코트라 북방 외해' },
    { lon: 48.00, lat: 12.20, label: '아덴만 중앙' },
    { lon: 44.50, lat: 12.30, label: '아덴만 서부 (예멘 외해)' },
    { lon: 43.40, lat: 12.60, label: '바브엘만데브 해협 통과' },
    // 홍해 북상 — 하니시 군도 서측 수로 → 중심선
    { lon: 43.00, lat: 13.05, label: '홍해 남단 입구' },
    { lon: 42.55, lat: 13.55, label: '홍해 남단 (하니시 서측 수로)' },
    { lon: 42.30, lat: 14.20, label: '홍해 남부' },
    { lon: 41.62, lat: 15.00, label: '홍해 남중부' },
    { lon: 40.47, lat: 16.80, label: '홍해 중남부' },
    { lon: 39.57, lat: 18.60, label: '홍해 중앙' },
    { lon: 38.45, lat: 20.40, label: '홍해 중북부' },
    { lon: 37.87, lat: 22.20, label: '홍해 북부' },
    { lon: 36.90, lat: 24.00, label: '홍해 북중부' },
    { lon: 35.55, lat: 25.80, label: '홍해 최북단' },
    { lon: 34.90, lat: 27.00, label: '홍해 입구 (수에즈만 접근)' },
    // 수에즈만 (암초로 마스크상 패치 — 통항회랑으로 면제) → 운하
    { lon: 34.55, lat: 27.60, label: '수에즈만 입구' },
    { lon: 34.00, lat: 28.05, label: '수에즈만 남단' },
    { lon: 33.40, lat: 28.45, label: '수에즈만 중앙' },
    { lon: 32.95, lat: 28.95, label: '수에즈만 북단' },
    { lon: 32.70, lat: 29.40, label: '수에즈만 최북단' },
    // 수에즈 운하 (길이 193km, 13~16시간 통과)
    { lon: 32.55, lat: 29.93, label: '수에즈 운하 남단 (Suez)' },
    { lon: 32.38, lat: 30.42, label: '그레이트 비터 호수 (운하 통과 중)' },
    { lon: 32.32, lat: 30.80, label: '이스마일리아 (운하 중간 대합소)' },
    { lon: 32.30, lat: 31.25, label: '수에즈 운하 북단 (Port Said)' },
    // 지중해 서진 → 지브롤터
    { lon: 32.40, lat: 31.90, label: '지중해 진입 (동지중해)' },
    { lon: 30.00, lat: 33.50, label: '동지중해 북부' },
    { lon: 24.00, lat: 34.40, label: '크레타 섬 남방 통과' },
    { lon: 18.00, lat: 35.50, label: '시칠리아 해협 접근' },
    { lon: 11.50, lat: 37.30, label: '시칠리아 해협 통과' },
    { lon: 8.00, lat: 38.40, label: '서지중해 동부' },
    { lon: 3.00, lat: 38.00, label: '서지중해 중앙' },
    { lon: -2.50, lat: 36.20, label: '알보란해' },
    { lon: -5.50, lat: 35.95, label: '지브롤터 해협 통과' },
    // 대서양 북상 → 로테르담 (상비센트 곶 서측 외해로 이베리아 우회)
    { lon: -7.50, lat: 36.30, label: '카디스만 외해' },
    { lon: -9.40, lat: 36.90, label: '상비센트 곶 남서 외해' },
    { lon: -10.20, lat: 40.00, label: '포르투갈 서안 외해' },
    { lon: -9.90, lat: 43.50, label: '이베리아 반도 서안 북진' },
    { lon: -6.50, lat: 47.50, label: '비스케이만 북동부' },
    { lon: -6.00, lat: 48.60, label: '우에상 섬 (브르타뉴 외해)' },
    { lon: -2.50, lat: 49.80, label: '영국 해협 서측' },
    { lon: 1.40, lat: 50.90, label: '영국 해협 동측 (도버)' },
    { lon: 3.20, lat: 52.20, label: '북해 남부' },
    { lon: 4.05, lat: 51.98, label: '로테르담 접근 (마스블락테)' },
    { lon: 4.50, lat: 51.90, label: '로테르담 (목적항)' },
  ],

  // ─── 희망봉 우회항로 ────────────────────────────────────────────────
  // 부산 → 말라카 해협 → 인도양 남부 → 희망봉 → 대서양 → 로테르담
  // 총 거리: 약 26,000km / 소요: 28~32일 (기준 항속 15노트)
  // SUEZ 와 동일한 부산→싱가포르 동측 두부 공유. 이후 카리마타(방카·벨리퉁 동방)
  // → 순다 해협 → 인도양 남서향 → 희망봉. 전 구간 0.05° 마스크 검증(해상관통 0).
  CAPE: [
    { lon: 129.04, lat: 35.10, label: '부산항 출항' },
    { lon: 128.30, lat: 34.20, label: '대한해협' },
    { lon: 126.00, lat: 32.60, label: '제주도 남서방 통과' },
    { lon: 123.50, lat: 29.50, label: '동중국해' },
    { lon: 122.00, lat: 27.00, label: '동중국해 남부' },
    { lon: 120.20, lat: 25.20, label: '대만 해협 북단' },
    { lon: 118.80, lat: 23.00, label: '대만 해협 남단' },
    { lon: 118.50, lat: 20.50, label: '루손 해협 서측 외해' },
    { lon: 114.00, lat: 16.00, label: '남중국해 북부' },
    { lon: 110.00, lat: 10.50, label: '남중국해 중부' },
    { lon: 106.50, lat: 5.50, label: '남중국해 남부' },
    { lon: 105.00, lat: 2.80, label: '말레이 반도 동남 외해' },
    { lon: 104.30, lat: 1.40, label: '싱가포르 해협 동측 진입' },
    // 카리마타 해협 — 방카·벨리퉁 동방 개방수역으로 자바해 남하
    { lon: 105.80, lat: 0.80, label: '리아우 군도 동방 외해' },
    { lon: 108.60, lat: -2.20, label: '카리마타 해협 (방카 동방)' },
    { lon: 108.90, lat: -3.40, label: '카리마타 해협 (벨리퉁 동방)' },
    { lon: 107.80, lat: -4.40, label: '카리마타 해협 남부' },
    { lon: 106.50, lat: -5.00, label: '자바해 서부' },
    // 순다 해협 (통항회랑 면제) — 자바-수마트라
    { lon: 106.25, lat: -5.60, label: '순다 해협 북측 접근' },
    { lon: 105.30, lat: -5.95, label: '순다 해협 입구' },
    { lon: 104.90, lat: -6.15, label: '순다 해협 통과 (자바-수마트라)' },
    { lon: 104.40, lat: -6.55, label: '순다 해협 남측 (인도양 진입)' },
    { lon: 103.00, lat: -7.50, label: '인도양 북동부 진입' },
    // 인도양 남서향 대권항로
    { lon: 97.00, lat: -12.00, label: '인도양 북부 남하' },
    { lon: 90.00, lat: -18.00, label: '인도양 중앙 서남향' },
    { lon: 80.00, lat: -25.00, label: '인도양 중남부' },
    { lon: 70.00, lat: -29.00, label: '인도양 남부' },
    { lon: 58.00, lat: -33.00, label: '인도양 남서부 (마다가스카르 동방)' },
    // 희망봉 접근
    { lon: 40.00, lat: -35.50, label: '아굴하스 곶 동방 외해' },
    { lon: 30.00, lat: -36.50, label: '희망봉 동방 접근' },
    { lon: 22.00, lat: -36.00, label: '아굴하스 뱅크 남방' },
    { lon: 17.50, lat: -35.20, label: '희망봉 (Cape of Good Hope) 남방' },
    { lon: 16.00, lat: -33.00, label: '케이프타운 서방 외해' },
    // 대서양 북상
    { lon: 12.00, lat: -28.00, label: '대서양 동부 남부 북상' },
    { lon: 8.00, lat: -20.00, label: '나미비아 외해' },
    { lon: 5.00, lat: -12.00, label: '앙골라 외해' },
    { lon: 2.00, lat: -4.00, label: '콩고 외해' },
    { lon: 0.00, lat: 3.00, label: '기니만 동부' },
    { lon: -5.00, lat: 3.00, label: '기니만 서부 (코트디부아르 외해)' },
    { lon: -11.00, lat: 5.00, label: '라이베리아 외해' },
    { lon: -18.00, lat: 10.00, label: '기니 외해 (서아프리카 최서단 우회)' },
    { lon: -19.00, lat: 15.00, label: '세네갈 (다카르) 서방 외해' },
    { lon: -19.50, lat: 24.00, label: '서사하라 서방 외해' },
    { lon: -19.50, lat: 29.00, label: '카나리아 제도 서방 외해' },
    { lon: -13.00, lat: 36.00, label: '포르투갈 남서 외해' },
    { lon: -10.20, lat: 40.00, label: '포르투갈 서안 외해' },
    { lon: -9.90, lat: 43.50, label: '이베리아 반도 서안 북진' },
    { lon: -6.50, lat: 47.50, label: '비스케이만 북동부' },
    { lon: -6.00, lat: 48.60, label: '우에상 섬 (브르타뉴 외해)' },
    { lon: -2.50, lat: 49.80, label: '영국 해협 서측' },
    { lon: 1.40, lat: 50.90, label: '영국 해협 동측 (도버)' },
    { lon: 3.20, lat: 52.20, label: '북해 남부' },
    { lon: 4.05, lat: 51.98, label: '로테르담 접근 (마스블락테)' },
    { lon: 4.50, lat: 51.90, label: '로테르담 (목적항)' },
  ],
};

// 경로별 공통 항로 회랑 인덱스 (출발/도착항 비특이적 구간)
// [startIdx] 소야해협/말라카해협 → [endIdx] 북해입구/영국해협
export const ROUTE_CORRIDOR = {
  NSR:  { startIdx: 6,  endIdx: 48 }, // 소야 해협 통과 → 북해 입구
  NWP:  { startIdx: 3,  endIdx: 39 }, // 소야 해협 → 대서양 중앙
  TSR:  { startIdx: 2,  endIdx: 24 }, // 소야 해협 통과 → 노르웨이해
  SUEZ: { startIdx: 8,  endIdx: 65 }, // 남중국해 북부 → 영국 해협 서측
  CAPE: { startIdx: 8,  endIdx: 49 }, // 남중국해 북부 → 영국 해협 서측
};

// 경로별 기본 운항 일수 (기준 항속 15노트)
export const ROUTE_DAYS = {
  NSR: 14,
  NWP: 16,
  TSR: 13,
  SUEZ: 22,
  CAPE: 30,
};

// 기본값 (하위 호환용)
export const TOTAL_SECONDS = 14 * 86400;

/**
 * 경로 키에 따른 총 시뮬레이션 시간(초) 반환
 */
export function getTotalSeconds(routeKey) {
  const days = ROUTE_DAYS[routeKey] || 14;
  return days * 86400;
}

export const PORT_APPROACH_WAYPOINTS = {

  // ── A. 아시아 → 북극항로 소야해협 접근 ─────────────────────────────────
  ARCTIC_DEP: {
    BUSAN: [
      { lon: 130.8, lat: 35.8, label: '대한해협 밖' },
      { lon: 132.5, lat: 37.5, label: '동해 중앙' },
      { lon: 138.0, lat: 43.0, label: '홋카이도 서해안' },
      { lon: 140.5, lat: 44.5, label: '소야 해협 접근' },
      { lon: 141.2, lat: 45.4, label: '소야 해협' },
    ],
    INCHEON: [
      { lon: 126.0, lat: 36.5, label: '서해 중부' },
      { lon: 125.5, lat: 34.5, label: '서해 남부' },
      { lon: 126.5, lat: 33.8, label: '제주도 북방' },
      { lon: 128.5, lat: 34.4, label: '남해 중앙' },
      { lon: 130.5, lat: 35.5, label: '대한해협' },
      { lon: 132.5, lat: 37.5, label: '동해 중앙' },
      { lon: 138.0, lat: 43.0, label: '홋카이도 서해안' },
      { lon: 141.0, lat: 44.5, label: '소야 해협 접근' },
    ],
    SHANGHAI: [
      { lon: 123.5, lat: 30.0, label: '동중국해' },
      { lon: 126.0, lat: 33.0, label: '제주도 남방' },
      { lon: 130.5, lat: 35.5, label: '대한해협' },
      { lon: 132.5, lat: 37.5, label: '동해 중앙' },
      { lon: 138.0, lat: 43.0, label: '홋카이도 서해안' },
      { lon: 141.0, lat: 44.5, label: '소야 해협 접근' },
    ],
    TOKYO: [
      { lon: 139.8, lat: 34.8, label: '도쿄만 출구' },
      { lon: 141.0, lat: 35.0, label: '보소 반도 우회' },
      { lon: 142.0, lat: 37.0, label: '관동 동방 외해' },
      { lon: 143.5, lat: 41.0, label: '홋카이도 동방 외해' },
      { lon: 143.5, lat: 44.0, label: '홋카이도 동해안 북부' },
      { lon: 142.0, lat: 45.2, label: '소야 동방 접근' },
    ],
    VLADIVOSTOK: [
      { lon: 133.5, lat: 43.5, label: '블라디보스토크 외해' },
      { lon: 137.0, lat: 44.5, label: '일본해 북부' },
      { lon: 140.5, lat: 44.5, label: '소야 서방 접근' },
    ],
  },

  // ── B. 아시아 → SUEZ/CAPE 말라카 접근 ──────────────────────────────────
  SUEZ_DEP: {
    BUSAN: [
      { lon: 129.5, lat: 34.8, label: '대한해협 서우회' },
      { lon: 128.0, lat: 34.0, label: '남해 외곽' },
      { lon: 126.0, lat: 32.6, label: '제주도 남서방 통과' },
      { lon: 123.5, lat: 29.5, label: '동중국해' },
      { lon: 120.2, lat: 25.2, label: '대만 해협 북단' },
      { lon: 118.8, lat: 23.0, label: '대만 해협 남단' },
      { lon: 118.0, lat: 20.0, label: '루손 해협 서측 외해' },
      { lon: 114.0, lat: 16.0, label: '남중국해 북부' },
      { lon: 110.0, lat: 10.5, label: '남중국해 중부' },
      { lon: 107.5, lat:  6.0, label: '남중국해 남부' },
    ],
    INCHEON: [
      { lon: 126.0, lat: 36.5, label: '서해 중부' },
      { lon: 125.5, lat: 34.5, label: '서해 남부' },
      { lon: 126.0, lat: 33.5, label: '제주도 서방' },
      { lon: 124.0, lat: 29.0, label: '동중국해' },
      { lon: 120.2, lat: 25.2, label: '대만 해협 북단' },
      { lon: 118.8, lat: 23.0, label: '대만 해협 남단' },
      { lon: 118.0, lat: 20.0, label: '루손 해협 서측' },
      { lon: 114.0, lat: 16.0, label: '남중국해 북부' },
      { lon: 110.0, lat: 10.5, label: '남중국해 중부' },
      { lon: 107.5, lat:  6.0, label: '남중국해 남부' },
    ],
    SHANGHAI: [
      { lon: 123.20, lat: 30.60, label: '상하이 동방 외해' },
      { lon: 122.50, lat: 27.50, label: '동중국해 중부' },
      { lon: 120.2, lat: 25.2, label: '대만 해협 북단' },
      { lon: 118.8, lat: 23.0, label: '대만 해협 남단' },
      { lon: 118.0, lat: 20.0, label: '루손 해협 서측' },
      { lon: 114.0, lat: 16.0, label: '남중국해 북부' },
      { lon: 110.0, lat: 10.5, label: '남중국해 중부' },
      { lon: 107.5, lat:  6.0, label: '남중국해 남부' },
    ],
    TOKYO: [
      { lon: 139.8, lat: 34.5, label: '이즈 반도 우회' },
      { lon: 138.0, lat: 33.5, label: '기이 반도 서방' },
      { lon: 134.5, lat: 32.0, label: '시코쿠 남방' },
      { lon: 131.5, lat: 29.80, label: '규슈 남동방 외해 (오스미 제도 남측)' },
      { lon: 129.50, lat: 29.50, label: '규슈 남방 외해' },
      { lon: 127.0, lat: 29.50, label: '동중국해 진입' },
      { lon: 124.5, lat: 28.0, label: '동중국해' },
      { lon: 120.2, lat: 25.2, label: '대만 해협 북단' },
      { lon: 118.8, lat: 23.0, label: '대만 해협 남단' },
      { lon: 118.0, lat: 20.0, label: '루손 해협 서측' },
      { lon: 114.0, lat: 16.0, label: '남중국해 북부' },
      { lon: 110.0, lat: 10.5, label: '남중국해 중부' },
      { lon: 107.5, lat:  6.0, label: '남중국해 남부' },
    ],
    VLADIVOSTOK: [
      { lon: 132.0, lat: 40.0, label: '일본해 중부' },
      { lon: 130.5, lat: 35.5, label: '대한해협 진입' },
      { lon: 129.5, lat: 34.8, label: '대한해협 통과' },
      { lon: 128.0, lat: 34.0, label: '남해 외곽' },
      { lon: 126.0, lat: 32.6, label: '제주도 남서방' },
      { lon: 123.5, lat: 29.5, label: '동중국해' },
      { lon: 120.2, lat: 25.2, label: '대만 해협 북단' },
      { lon: 118.8, lat: 23.0, label: '대만 해협 남단' },
      { lon: 118.0, lat: 20.0, label: '루손 해협 서측' },
      { lon: 114.0, lat: 16.0, label: '남중국해 북부' },
      { lon: 110.0, lat: 10.5, label: '남중국해 중부' },
      { lon: 107.5, lat:  6.0, label: '남중국해 남부' },
    ],
  },

  // ── C. MURMANSK 특수 처리 ─────────────────────────────────────────────
  MURMANSK: {
    NSR: {
      corridorIdx: 43,  // 바렌츠해 서부 (32°E, 73.5°N) — 조기 이탈
      wps: [
        { lon: 32.5, lat: 71.0, label: '콜라 반도 북방 바렌츠해' },
        { lon: 33.0, lat: 70.0, label: '콜라 만 북측 입구' },
      ],
    },
    NWP: {
      corridorIdx: null,
      wps: [
        { lon: -10.0, lat: 58.0, label: '아일랜드 북서 외해' },
        { lon:   0.0, lat: 62.0, label: '영국 북방 외해' },
        { lon:   5.0, lat: 65.0, label: '노르웨이 서해안 북상' },
        { lon:  12.0, lat: 72.0, label: '노르웨이해 최북부' },
        { lon:  24.0, lat: 72.0, label: '바렌츠해 서방 접근' },
        { lon:  32.5, lat: 71.0, label: '콜라 반도 북방' },
        { lon:  33.0, lat: 70.0, label: '콜라 만 북측 입구' },
      ],
    },
    TSR: {
      corridorIdx: null,
      wps: [
        { lon:  12.0, lat: 72.0, label: '노르웨이해 최북부' },
        { lon:  24.0, lat: 72.0, label: '바렌츠해 서방 접근' },
        { lon:  32.5, lat: 71.0, label: '콜라 반도 북방' },
        { lon:  33.0, lat: 70.0, label: '콜라 만 북측 입구' },
      ],
    },
    SUEZ: {
      corridorIdx: null,
      wps: [
        { lon:   2.0, lat: 57.0, label: '북해 북진' },
        { lon:   5.0, lat: 63.0, label: '노르웨이 서해안' },
        { lon:  12.0, lat: 72.0, label: '노르웨이해 최북부' },
        { lon:  24.0, lat: 72.0, label: '바렌츠해 서방 접근' },
        { lon:  32.5, lat: 71.0, label: '콜라 반도 북방' },
        { lon:  33.0, lat: 70.0, label: '콜라 만 북측 입구' },
      ],
    },
    CAPE: {
      corridorIdx: null,
      wps: [
        { lon:   2.0, lat: 57.0, label: '북해 북진' },
        { lon:   5.0, lat: 63.0, label: '노르웨이 서해안' },
        { lon:  12.0, lat: 72.0, label: '노르웨이해 최북부' },
        { lon:  24.0, lat: 72.0, label: '바렌츠해 서방 접근' },
        { lon:  32.5, lat: 71.0, label: '콜라 반도 북방' },
        { lon:  33.0, lat: 70.0, label: '콜라 만 북측 입구' },
      ],
    },
  },
};

export const INTRA_REGION_ROUTES = {
  'BUSAN-INCHEON': [
    { lon: 129.04, lat: 35.1, label: '부산항' },
    { lon: 129.5, lat: 34.8, label: '대한해협' },
    { lon: 128.0, lat: 34.0, label: '남해 중앙' },
    { lon: 126.5, lat: 33.8, label: '제주도 북방' },
    { lon: 125.5, lat: 34.5, label: '서해 남부' },
    { lon: 126.0, lat: 36.5, label: '서해 중부' },
    { lon: 126.6, lat: 37.4, label: '인천항' }
  ],
  'BUSAN-SHANGHAI': [
    { lon: 129.04, lat: 35.1, label: '부산항' },
    { lon: 128.0, lat: 34.0, label: '남해 외곽' },
    { lon: 126.5, lat: 33.5, label: '제주도 서방 통과' },
    { lon: 124.0, lat: 31.5, label: '동중국해 북부' },
    { lon: 122.5, lat: 30.5, label: '상하이 동방 외해' },
    { lon: 121.5, lat: 31.2, label: '상하이항' }
  ],
  'BUSAN-TOKYO': [
    { lon: 129.04, lat: 35.1, label: '부산항' },
    { lon: 130.5, lat: 34.5, label: '대한해협 외곽' },
    { lon: 132.0, lat: 33.5, label: '규슈 동방' },
    { lon: 136.0, lat: 33.0, label: '시코쿠 남방' },
    { lon: 138.0, lat: 33.5, label: '기이 반도 서방' },
    { lon: 139.8, lat: 34.5, label: '이즈 반도 우회' },
    { lon: 139.8, lat: 35.6, label: '도쿄항' }
  ],
  'BUSAN-VLADIVOSTOK': [
    { lon: 129.04, lat: 35.1, label: '부산항' },
    { lon: 130.8, lat: 35.8, label: '대한해협 밖' },
    { lon: 132.5, lat: 37.5, label: '동해 중앙' },
    { lon: 132.5, lat: 40.0, label: '동해 북부' },
    { lon: 131.9, lat: 43.1, label: '블라디보스토크항' }
  ],
  'INCHEON-SHANGHAI': [
    { lon: 126.6, lat: 37.4, label: '인천항' },
    { lon: 125.0, lat: 36.0, label: '황해 중부' },
    { lon: 124.0, lat: 32.5, label: '황해 남부' },
    { lon: 122.5, lat: 30.5, label: '상하이 동방 외해' },
    { lon: 121.5, lat: 31.2, label: '상하이항' }
  ],
  'INCHEON-TOKYO': [
    { lon: 126.6, lat: 37.4, label: '인천항' },
    { lon: 126.0, lat: 36.5, label: '서해 중부' },
    { lon: 125.5, lat: 34.5, label: '서해 남부' },
    { lon: 126.5, lat: 33.8, label: '제주도 북방' },
    { lon: 128.5, lat: 34.4, label: '남해 중앙' },
    { lon: 130.5, lat: 34.5, label: '대한해협 외곽' },
    { lon: 132.0, lat: 33.5, label: '규슈 동방' },
    { lon: 136.0, lat: 33.0, label: '시코쿠 남방' },
    { lon: 138.0, lat: 33.5, label: '기이 반도 서방' },
    { lon: 139.8, lat: 34.5, label: '이즈 반도 우회' },
    { lon: 139.8, lat: 35.6, label: '도쿄항' }
  ],
  'INCHEON-VLADIVOSTOK': [
    { lon: 126.6, lat: 37.4, label: '인천항' },
    { lon: 126.0, lat: 36.5, label: '서해 중부' },
    { lon: 125.5, lat: 34.5, label: '서해 남부' },
    { lon: 126.5, lat: 33.8, label: '제주도 북방' },
    { lon: 128.5, lat: 34.4, label: '남해 중앙' },
    { lon: 130.5, lat: 35.5, label: '대한해협' },
    { lon: 132.5, lat: 37.5, label: '동해 중앙' },
    { lon: 132.5, lat: 40.0, label: '동해 북부' },
    { lon: 131.9, lat: 43.1, label: '블라디보스토크항' }
  ],
  'SHANGHAI-TOKYO': [
    { lon: 121.5, lat: 31.2, label: '상하이항' },
    { lon: 122.5, lat: 30.5, label: '상하이 동방 외해' },
    { lon: 126.0, lat: 30.0, label: '동중국해 동진' },
    { lon: 130.0, lat: 30.5, label: '규슈 남방' },
    { lon: 136.0, lat: 33.0, label: '시코쿠 남방' },
    { lon: 138.0, lat: 33.5, label: '기이 반도 서방' },
    { lon: 139.8, lat: 34.5, label: '이즈 반도 우회' },
    { lon: 139.8, lat: 35.6, label: '도쿄항' }
  ],
  'SHANGHAI-VLADIVOSTOK': [
    { lon: 121.5, lat: 31.2, label: '상하이항' },
    { lon: 124.0, lat: 31.5, label: '동중국해 북부' },
    { lon: 126.5, lat: 33.5, label: '제주도 서방 통과' },
    { lon: 129.5, lat: 34.8, label: '대한해협 서우회' },
    { lon: 130.8, lat: 35.8, label: '대한해협 밖' },
    { lon: 132.5, lat: 37.5, label: '동해 중앙' },
    { lon: 132.5, lat: 40.0, label: '동해 북부' },
    { lon: 131.9, lat: 43.1, label: '블라디보스토크항' }
  ],
  'TOKYO-VLADIVOSTOK': [
    { lon: 139.8, lat: 35.6, label: '도쿄항' },
    { lon: 139.8, lat: 34.8, label: '도쿄만 출구' },
    { lon: 141.0, lat: 35.0, label: '보소 반도 우회' },
    { lon: 142.0, lat: 37.0, label: '관동 동방 외해' },
    { lon: 142.5, lat: 40.0, label: '혼슈 동방' },
    { lon: 141.0, lat: 41.5, label: '쓰가루 해협 동측 접근' },
    { lon: 140.0, lat: 41.5, label: '쓰가루 해협 통과' },
    { lon: 138.0, lat: 41.5, label: '일본해 진입' },
    { lon: 135.0, lat: 42.5, label: '일본해 북진' },
    { lon: 131.9, lat: 43.1, label: '블라디보스토크항' }
  ],
  'HAMBURG-ROTTERDAM': [
    { lon: 9.9, lat: 53.5, label: '함부르크항' },
    { lon: 8.5, lat: 54.0, label: '엘베강 하구' },
    { lon: 7.0, lat: 53.8, label: '저먼바이트' },
    { lon: 5.5, lat: 53.0, label: '프리지아 제도 북방' },
    { lon: 4.5, lat: 51.9, label: '로테르담' }
  ],
  'LONDON-ROTTERDAM': [
    { lon: 0.0, lat: 51.5, label: '런던항' },
    { lon: 1.5, lat: 51.5, label: '템즈강 하구' },
    { lon: 2.5, lat: 51.8, label: '북해 횡단' },
    { lon: 3.5, lat: 51.9, label: '유로포트 북해망' },
    { lon: 4.5, lat: 51.9, label: '로테르담' }
  ],
  'HAMBURG-LONDON': [
    { lon: 9.9, lat: 53.5, label: '함부르크항' },
    { lon: 8.5, lat: 54.0, label: '엘베강 하구' },
    { lon: 6.0, lat: 53.5, label: '북해 횡단 (네덜란드 북방)' },
    { lon: 3.0, lat: 52.5, label: '영국 해협 입구' },
    { lon: 1.5, lat: 51.5, label: '템즈강 하구' },
    { lon: 0.0, lat: 51.5, label: '런던항' }
  ],
  'MURMANSK-ROTTERDAM': [
    { lon: 33.0, lat: 68.9, label: '무르만스크항' },
    { lon: 33.0, lat: 70.0, label: '콜라 만 북측 입구' },
    { lon: 32.5, lat: 71.0, label: '콜라 반도 북방' },
    { lon: 24.0, lat: 72.0, label: '바렌츠해 서방 접근' },
    { lon: 12.0, lat: 72.0, label: '노르웨이해 최북부' },
    { lon: 5.0, lat: 65.0, label: '노르웨이 서해안 남하' },
    { lon: 0.0, lat: 62.0, label: '영국 북방 외해' },
    { lon: 2.0, lat: 57.0, label: '북해 중앙' },
    { lon: 4.5, lat: 51.9, label: '로테르담' }
  ],
  'HAMBURG-MURMANSK': [
    { lon: 9.9, lat: 53.5, label: '함부르크항' },
    { lon: 8.5, lat: 54.0, label: '엘베강 하구' },
    { lon: 7.0, lat: 55.0, label: '덴마크 서해안' },
    { lon: 5.0, lat: 58.0, label: '북해 북상' },
    { lon: 5.0, lat: 65.0, label: '노르웨이 서해안 북상' },
    { lon: 12.0, lat: 72.0, label: '노르웨이해 최북부' },
    { lon: 24.0, lat: 72.0, label: '바렌츠해 서방 접근' },
    { lon: 32.5, lat: 71.0, label: '콜라 반도 북방' },
    { lon: 33.0, lat: 70.0, label: '콜라 만 북측 입구' },
    { lon: 33.0, lat: 68.9, label: '무르만스크항' }
  ],
  'LONDON-MURMANSK': [
    { lon: 0.0, lat: 51.5, label: '런던항' },
    { lon: 1.5, lat: 51.5, label: '템즈강 하구' },
    { lon: 2.5, lat: 53.0, label: '북해 중부 북상' },
    { lon: 2.0, lat: 57.0, label: '북해 중앙' },
    { lon: 0.0, lat: 62.0, label: '영국 북방 외해' },
    { lon: 5.0, lat: 65.0, label: '노르웨이 서해안 북상' },
    { lon: 12.0, lat: 72.0, label: '노르웨이해 최북부' },
    { lon: 24.0, lat: 72.0, label: '바렌츠해 서방 접근' },
    { lon: 32.5, lat: 71.0, label: '콜라 반도 북방' },
    { lon: 33.0, lat: 70.0, label: '콜라 만 북측 입구' },
    { lon: 33.0, lat: 68.9, label: '무르만스크항' }
  ]
};
