import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';

// AI 백엔드 라우팅 (dev 프록시 전용)
// - 프로덕션(Vercel)은 vite 가 아니라 vercel.json 의 rewrites 가 AWS 백엔드로 넘긴다.
// - 로컬 개발: Node 게이트웨이(8000)가 /api/rl→8001·/api/report→8002·/api/fuel→8003 을
//   내부 프록시하므로 아래 타깃을 localhost 로 두면 Node 가 자동 라우팅한다.
// - SAR 만 Node 가 프록시하지 않아 dev 에서 직접 8005 로 지정.
//   (원격 AWS 백엔드로 dev 를 붙이려면 각 상수를 'https://<AWS-호스트>' 로 바꾸면 됨.)
const RL_BACKEND     = 'http://localhost:8001';
const REPORT_BACKEND = 'http://localhost:8002';
const FUEL_BACKEND   = 'http://localhost:8003';
const SAR_BACKEND    = 'http://localhost:8005';

// 백엔드(특히 8001~8003 AI 서버)는 torch·모델 로딩에 수십 초가 걸려,
// 그 부팅 구간 동안 호출하면 ECONNREFUSED 가 난다. 버그가 아니라 타이밍 문제이므로
// 시끄러운 AggregateError 스택 대신 한 줄 경고로 줄이고 프론트엔 503 을 돌려준다.
const mkProxy = (target) => ({
  target,
  changeOrigin: true,
  secure: target.startsWith('https'),
  configure: (proxy) => {
    proxy.on('error', (err, req, res) => {
      if (err.code === 'ECONNREFUSED') {
        console.warn(`[proxy] 백엔드 아직 기동 중? ${req.method} ${req.url} → ${target} (ECONNREFUSED)`);
      } else {
        console.warn(`[proxy] ${req.method} ${req.url} → ${target}: ${err.message}`);
      }
      if (res && !res.headersSent && typeof res.writeHead === 'function') {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'backend_unavailable', target, code: err.code }));
      }
    });
  },
});

export default defineConfig({
  plugins: [react(), cesium()],
  // 순수 로직(서비스/계산 함수) 단위·골든 테스트 — DOM 불필요하므로 node 환경.
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    globals: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api/rl':     mkProxy(RL_BACKEND),
      '/api/report': mkProxy(REPORT_BACKEND),
      '/api/fuel':   mkProxy(FUEL_BACKEND),
      '/api/sar':    mkProxy(SAR_BACKEND),
      // 그 외 일반 /api/* 와 정적 자원은 로컬 node 백엔드(8000) 가 처리
      '/api': 'http://localhost:8000',
      '/proxy': 'http://localhost:8000',
      '/nsidc-proxy': 'http://localhost:8000',
      '/cop-proxy': 'http://localhost:8000',
      '/sentinel-proxy': 'http://localhost:8000',
      '/data': 'http://localhost:8000',
      '/scripts': 'http://localhost:8000',
    },
  },
});
