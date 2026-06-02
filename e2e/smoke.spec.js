import { test, expect } from '@playwright/test';

// 앱 렌더 스모크 — 백엔드(8000) 없이도 프론트 셸이 정상 마운트되는지(graceful degradation)
// 실제 chromium 으로 검증한다. 데이터가 아니라 "화면이 죽지 않고 뜨는가"를 본다.

test.describe('Arctic Digital Twin — 렌더 스모크', () => {
  test('루트 페이지 로드 + 문서 제목', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Arctic Route Digital Twin/);
  });

  test('#root 에 React 트리가 마운트된다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#root')).not.toBeEmpty();
  });

  test('Cesium/Three 캔버스가 생성된다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });
  });

  test('치명적 페이지 예외 없이 렌더된다', async ({ page }) => {
    const fatal = [];
    page.on('pageerror', (e) => {
      // Cesium/WebGL 의 헤드리스 GPU 관련 비치명 경고는 제외
      if (/WebGL|GPU|context lost|ResizeObserver/i.test(e.message)) return;
      fatal.push(e.message);
    });
    await page.goto('/');
    await page.waitForTimeout(3000);
    expect(fatal, `예상치 못한 페이지 예외: ${fatal.join(' | ')}`).toEqual([]);
  });
});
