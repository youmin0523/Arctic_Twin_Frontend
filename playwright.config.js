import { defineConfig, devices } from '@playwright/test';

// E2E 설정 — Vite dev 서버를 자동 기동해 실제 브라우저(chromium)에서 앱 렌더를 검증.
// (단위/컴포넌트 테스트는 Vitest, 이쪽은 e2e/ 디렉터리만 대상으로 분리)
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
