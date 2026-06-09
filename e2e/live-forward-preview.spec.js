import { test, expect } from '@playwright/test';

// Live 모드(기본) 선미추적(FOLLOW) 전방 프리뷰 HUD 가 실제 브라우저에서
// 렌더되는지 end-to-end 검증. 백엔드(8000) 없이도 sampleIce 위도 폴백으로
// 프리뷰가 합성되므로 단독 프론트만으로 검증 가능하다.

test.describe('Live 모드 전방 프리뷰 HUD', () => {
  test('선미추적 진입 → 전방 프리뷰 + 통과배지 + 16막대 렌더', async ({ page }) => {
    const fatal = [];
    page.on('pageerror', (e) => {
      if (/WebGL|GPU|context lost|ResizeObserver/i.test(e.message)) return;
      fatal.push(e.message);
    });

    await page.goto('/');
    // 앱 마운트 대기 (Cesium/Three 캔버스)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });

    // 사이드바 View Mode → "선미 추적"(FOLLOW) 선택
    await page.getByText('선미 추적', { exact: true }).click();

    // 전방 프리뷰 HUD 헤더 표시
    await expect(page.getByText('전방 프리뷰', { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // 통과 가능성 배지(PASS/MARGINAL/BLOCKED) 중 하나가 보여야 함
    const badge = page.getByText(/^(PASS|MARGINAL|BLOCKED)$/);
    await expect(badge.first()).toBeVisible();

    // Live 전용 푸터 라벨
    await expect(page.getByText(/전방 항로 스캔/)).toBeVisible();

    // 히스토그램 막대(title 에 RIO 포함) 존재
    const bars = page.locator('[title*="RIO"]');
    expect(await bars.count()).toBeGreaterThan(0);

    // 스크린샷 저장 (시각 증빙) — 전체 + HUD 클립
    await page.screenshot({
      path: 'test-results/live-forward-preview.png',
      fullPage: false,
    });
    // HUD 컨테이너(헤더 "전방 프리뷰" 의 조상 div)만 클립
    const hud = page
      .getByText('전방 프리뷰', { exact: true })
      .locator('xpath=ancestor::div[1]/parent::div');
    await hud.screenshot({ path: 'test-results/live-forward-preview-hud.png' });

    expect(fatal, `예상치 못한 페이지 예외: ${fatal.join(' | ')}`).toEqual([]);
  });
});
