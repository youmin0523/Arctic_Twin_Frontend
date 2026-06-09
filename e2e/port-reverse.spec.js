import { test, expect } from '@playwright/test';

// 완주 → 역방향 → 상태 리셋 e2e
// ───────────────────────────────────────────────────────────────
// 사용자 보고 버그: 부산→로테르담 완주(진행률 100%) 후 출발/도착 항구를
// 역방향으로 바꾸면 본선이 옛 위치에 멈춰있고(새로고침해야 정상), 진행률이
// 리셋되지 않던 문제. 수정 후 항구 변경 즉시 진행률이 0으로 돌아가야 한다.
//
// 진행률은 TimelineBar 의 채움 막대(.timeline-bar__fill) width(%)로 관측한다
// (simProgress 에 1:1 바인딩). 타임라인 트랙을 우측 끝으로 끌어 '완주' 상태를
// 만들고, 사이드바 스왑 버튼(출발↔도착)으로 역방향 전환한다.

test.describe('완주 → 역방향 → 진행률 리셋', () => {
  test('타임라인 완주 후 항구 스왑 시 진행률이 0으로 리셋된다', async ({ page }) => {
    await page.goto('/');

    // 앱 마운트 대기
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 });

    const track = page.locator('.timeline-bar__track');
    const fill = page.locator('.timeline-bar__fill');
    await expect(track).toBeVisible({ timeout: 15_000 });

    const fillPct = async () =>
      parseFloat((await fill.evaluate((el) => el.style.width)) || '0');

    // 초기 진행률 ~0%
    expect(await fillPct()).toBeLessThan(1);

    // 타임라인 트랙 우측 끝을 클릭 → 진행률 ~100% (완주 상태)
    const box = await track.boundingBox();
    expect(box).not.toBeNull();
    await track.click({ position: { x: box.width - 2, y: box.height / 2 } });

    // 완주: 채움 막대가 80% 이상
    await expect.poll(fillPct, { timeout: 10_000 }).toBeGreaterThan(80);

    // 출발↔도착 스왑 (부산→로테르담 ⇒ 로테르담→부산)
    await page.locator('button[title="출발항과 도착항을 서로 바꿉니다"]').click();

    // 핵심 검증: 항구 변경 즉시 진행률이 0으로 리셋 (옛 위치/진행률 잔존 X)
    await expect.poll(fillPct, { timeout: 10_000 }).toBeLessThan(1);

    // 스왑 결과가 UI 에 반영됐는지 — 출발항 select 값이 ROTTERDAM
    const depSelect = page.locator('select.dt-sidebar__select').first();
    await expect(depSelect).toHaveValue('ROTTERDAM');
  });
});
