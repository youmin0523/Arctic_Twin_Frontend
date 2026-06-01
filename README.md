# 🧊 Arctic Digital Twin — Frontend

북극항로 디지털 트윈의 웹 클라이언트. **React + Vite + Cesium.js** 기반 3D 지구본 위에
해빙 농도·빙산·항로·기상을 실시간 시각화하고, 강화학습 빙산 회피·출항 스케줄링·연료 예측·
What-If 분석 결과를 인터랙티브하게 보여줍니다.

- **Live**: 추후 업데이트 예정 (Vercel)
- **백엔드 API**: 별도 레포의 Node/Python 백엔드 (로컬은 포트 8000, 배포는 AWS/HF)

---

## 🛠️ 기술 스택

| 분류          | 사용 기술                                                   |
| ------------- | ----------------------------------------------------------- |
| 프레임워크    | React 18 + Vite 5                                           |
| 3D / 지도     | Cesium.js (`vite-plugin-cesium`), Three.js                  |
| 데이터 시각화 | Deck.gl (`@deck.gl/core`·`layers`·`geo-layers`·`react`)     |
| 항로 계산     | searoute-js + 자체 pathfinder/POLARIS 로직 (`src/services`) |
| 배포          | Vercel                                                      |

---

## 🚀 로컬 실행

### 사전 준비

- **Node.js 20 이상**
- 백엔드(Node API, 포트 8000)가 떠 있어야 해빙·빙산·항로·기상·시뮬레이션 데이터가 보입니다.
  (AI 패널은 RL/Report/Fuel/SAR 서버 또는 배포본 필요 — 루트 `backend/README.md` 참고)

### 실행

```bash
cd frontend
npm install
npm run dev        # → http://localhost:5173
```

### 빌드 / 미리보기

```bash
npm run build      # dist/ 생성
npm run preview    # 빌드 결과 로컬 서빙
```

---

## 🔌 백엔드 프록시 설정 (`vite.config.js`)

개발 서버는 `/api/*` 요청을 백엔드로 프록시합니다. 서비스별로 대상(target)을 바꿀 수 있습니다.

| 프록시 경로                                      | 기본 대상               | 비고                                                 |
| ------------------------------------------------ | ----------------------- | ---------------------------------------------------- |
| `/api/rl`                                        | HF Space (배포본)       | RL 빙산 회피 — 로컬은 `http://localhost:8001`        |
| `/api/report`                                    | `http://localhost:8002` | 동향 보고서 (Report)                                 |
| `/api/fuel`                                      | HF Space (배포본)       | 연료 예측 — 로컬은 `http://localhost:8003`           |
| `/api/sar`                                       | `http://localhost:8005` | SAR 빙산 탐지 (HF 미배포)                            |
| `/api`, `/data`, `/proxy`, `*-proxy`, `/scripts` | `http://localhost:8000` | Node API 게이트웨이 (해빙·빙산·항로·기상·시뮬레이션) |

> 로컬 백엔드로 전환하려면 `vite.config.js` 상단의 `RL_BACKEND`/`FUEL_BACKEND` 등 상수를
> `'http://localhost:<port>'` 로 바꾸면 됩니다.

소비하는 주요 엔드포인트(`src/services/api.js` 등): `/api/ice/concentration`,
`/api/ice/thickness`, `/api/icebergs/latest`, `/api/sentinel1/catalog`, `/api/weather/latest`,
`/api/collab/sar-icebergs`, `/api/simulations/:scenario`, `/api/route/evaluate`.

---

## 📁 디렉토리 구조

```
frontend/
├── index.html
├── vite.config.js          # 프록시 + Cesium 플러그인
├── vercel.json             # 배포 시 /api·/health → 백엔드 rewrite
├── public/                 # 정적 자원 (필요 시 simulations 사본)
└── src/
    ├── main.jsx · App.jsx
    ├── components/         # CesiumGlobe, DeckOverlay, ThreeOverlay
    │   ├── hud/            # 패널·HUD (WhatIf, TrendReport, Fuel, SAR, Weather …)
    │   ├── layout/         # Header, Sidebar, Timeline, BottomPanel …
    │   ├── overlay/        # 브리지/쌍안경 오버레이
    │   └── VoyagePlayback/ # 항해 재생 (트레이스 기반)
    ├── services/           # api·항로 생성·POLARIS RIO·RL 추론·voyageTrace
    ├── hooks/              # useShipSimulation, useVoyagePlayback, useManualControl
    ├── context/            # AppContext (전역 상태)
    └── data/               # 항로·항만·선박 프리셋·iceClass 상수
```

### 시뮬레이션 데이터 (선택)

백엔드 없이 정적으로 시뮬레이션을 보려면 백엔드의 트레이스를 `public/` 으로 복사할 수 있습니다:

```bash
npm run copy:simulations   # ../backend/data/simulations/*.json → public/simulations/
```

> 일반적으로는 백엔드의 `GET /api/simulations/:scenario` (DB 또는 파일) 로 받아옵니다.

---

## 📦 배포 (Vercel)

1. GitHub 저장소 import → **Root Directory: `frontend`**, Framework: **Vite**
2. **`vercel.json` 의 백엔드 도메인 치환**: `REPLACE-WITH-AWS-BACKEND-DOMAIN` 을 실제 백엔드
   도메인(AWS/HF)으로 바꿔야 배포본에서 `/api/*`·`/health` 가 백엔드로 라우팅됩니다.

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://<백엔드-도메인>/api/:path*"
    },
    { "source": "/health", "destination": "https://<백엔드-도메인>/health" }
  ]
}
```

---

## 📜 라이선스

MIT License
